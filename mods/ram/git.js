// Branch and git counts per space, ported from the Traveler layout's spaces mod
// (traveler-spaces). Runs `git status` in every folder a space has a terminal
// in, on that space's machine. It looks again when a new folder appears, when a
// command or an agent's turn ends there, when a local repo's files change
// (watchFolder), and every minute as a fallback while the window is active.
// Each changed file also gets its added/removed line counts (git diff --numstat),
// for the main stick's tree and its changes view.
import { machines, window, exec, watchFolder } from "herdr";

const FALLBACK = 60000;
// Changed files kept per repo (the changes view lists them all).
const FILES = 500;
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
export const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
// Every folder a space has a terminal in: its tabs are often different projects.
function keysOf(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  const dirs = new Set(ps.filter((p) => tabs.has(p.tab) && p.cwd).map((p) => p.cwd));
  if (!dirs.size && s.folder) dirs.add(s.folder);
  return [...dirs].map((d) => JSON.stringify([s.machine ?? null, d]));
}
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);

// One `git status --porcelain=v2` entry as { xy, status, path, fresh }: xy is
// one letter, the working tree's change if there is one, else the index's ("?"
// new, "U" conflict); status is the Changes panel's letter (A for new files).
// Paths with odd characters stay quoted, as git prints them.
function changed(line) {
  const f = line.split(" ");
  if (line.startsWith("? ")) return { xy: "?", status: "A", fresh: true, path: line.slice(2) };
  if (line.startsWith("u ")) return { xy: "U", status: "U", path: f.slice(10).join(" ") };
  const xy = f[1] ?? "..", pick = xy[1] !== "." ? xy[1] : xy[0];
  const letter = pick === "." ? "M" : pick;
  const status = xy.includes("D") ? "D" : xy.includes("A") ? "A" : "M";
  if (line.startsWith("2 ")) return { xy: "R", status, path: f.slice(9).join(" ").split("\t")[0] };
  return { xy: letter, status, path: f.slice(8).join(" ") };
}

// `git diff --numstat -z` output as path -> { add, del, binary }.
function numstat(text, into = {}) {
  for (const entry of text.split("\0")) {
    const [a, d, ...parts] = entry.split("\t");
    if (!parts.length) continue;
    const path = parts.join("\t"), old = into[path] ?? { add: 0, del: 0, binary: false };
    into[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
  }
  return into;
}

export class Git {
  constructor() {
    this.git = {}; // where() -> { name, branch, ahead, behind, dirty, upstream, top, repo }, null: not a repo
    this.checked = {};
    this.unsure = new Set();
    this.pending = new Set();
    this.busy = {};
    this.ready = {};
    this.at = {};
    this.watching = new Set();
    this.refreshing = false;
  }

  tick(sp, ps, cx) {
    const due = this.due(Date.now(), sp, ps);
    if (due.size) this.refresh(due, cx);
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended, those on a machine that is back, and
  // repos in view whose fallback is due.
  due(now, sp, ps) {
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    for (const s of sp) for (const k of keysOf(s, ps)) keys.add(k);
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) {
        this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
        if (p.cwd) this.sameRepo(JSON.stringify([spaceOf[p.tab].machine ?? null, p.cwd]), keys).forEach((k) => due.add(k));
      }
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window()?.active) {
      for (const k of keys) {
        if ((this.git[k] || this.unsure.has(k)) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refresh(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const batch = [...this.pending];
        this.pending.clear();
        for (const key of batch) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, uncommitted files, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks or fsmonitor: the status must not write under .git and
      // wake the watch. safe.bareRepository=explicit keeps a bare repo hidden in
      // a clone from running its filters.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "safe.bareRepository=explicit", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, dirty: 0, upstream: false, initial: false,
        top: top.stdout.trim(), repo: JSON.stringify([on, repo]), files: [] };
      for (const line of r.stdout.split("\n")) {
        if (line && !line.startsWith("# ")) {
          info.dirty++;
          if (info.files.length < FILES) info.files.push(changed(line));
        }
        else if (line.startsWith("# branch.upstream ")) info.upstream = true;
        else if (line.startsWith("# branch.oid (initial)")) info.initial = true;
        else if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      // Lines added and removed per file. A repo with no commit yet has no HEAD
      // to compare with: its staged and unstaged changes, as the Changes panel does.
      if (info.dirty) {
        const runs = info.initial ? [["diff", "--cached"], ["diff"]] : [["diff", "HEAD"]];
        const stats = {};
        for (const args of runs) {
          const n = await exec("git", [...READ, ...args, "--numstat", "-z", "--no-renames"], { cwd: info.top, on });
          if (n.code === 0) numstat(n.stdout, stats);
        }
        for (const f of info.files) Object.assign(f, stats[f.path] ?? { add: 0, del: 0, binary: false });
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refresh(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  // The folders a space's terminals are in, in the order its repo is looked
  // for: the shown tab's (the focused terminal first), then the other tabs',
  // else where the space was made.
  folders(s, ps) {
    const order = new Map((s.tabs ?? []).map((t, i) => [t.id, t.active ? -1 : i]));
    const mine = ps.filter((p) => order.has(p.tab) && p.cwd)
      .sort((a, b) => order.get(a.tab) - order.get(b.tab) || (b.focused ? 1 : 0) - (a.focused ? 1 : 0));
    const dirs = [...new Set(mine.map((p) => p.cwd))];
    if (!dirs.length && s.folder) dirs.push(s.folder);
    return dirs;
  }

  // The repo a space's git line, GIT and lazygit use: the first of its folders
  // that is one. undefined while a folder before it hasn't been looked at yet,
  // null when none is a repo (or the space has no folder).
  info(s, ps) {
    for (const d of this.folders(s, ps)) {
      const g = this.git[JSON.stringify([s.machine ?? null, d])];
      if (g === undefined) return undefined;
      if (g) return g;
    }
    return null;
  }

  // Every repo a space's terminals are in, its main one (info()) first.
  repos(s, ps) {
    const out = new Map();
    for (const d of this.folders(s, ps)) {
      const g = this.git[JSON.stringify([s.machine ?? null, d])];
      if (g && !out.has(g.top)) out.set(g.top, g);
    }
    return [...out.values()];
  }

  // Look at a repo again now (after a commit from the changes view).
  again(top, cx) {
    this.refresh(Object.keys(this.git).filter((k) => this.git[k]?.top === top), cx);
  }

  // A space's git as short marks, the way push and pull already read (↑2 ↓1):
  //   head   "repo · branch" of its main repo (the repo or branch goes when the
  //          space name already says it, and main/master go)
  //   marks  ↑n commits to push, ↓n to pull, ±n uncommitted files, ⌂ a repo
  //          with no remote (⌂2: two), or ✓ when none of those; added up over
  //          the space's repos
  //   tip    the same in words, on one line (tooltips can't wrap)
  // repo is info(): undefined while checking, null when there's none.
  summary(s, ps) {
    const g = this.info(s, ps);
    if (!g) return { repo: g, head: null, marks: [], tip: g === undefined ? "Checking git\u2026" : "Not a git repo" };
    const all = this.repos(s, ps);
    const same = (a) => a.toLowerCase() === (s.name ?? "").toLowerCase();
    const raw = g.branch ?? "detached";
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = same(g.name) ? "" : g.name;
    const head = { text: [repo, branch].filter(Boolean).join(" \u00b7 "), repo, branch };
    const total = (k) => all.reduce((n, r) => n + (r[k] || 0), 0);
    const ahead = total("ahead"), behind = total("behind"), dirty = total("dirty");
    const local = all.filter((r) => !r.upstream && r.branch !== "(detached)").length;
    const marks = [];
    if (ahead) marks.push({ kind: "push", short: `\u2191${ahead}`, text: `${plural(ahead, "commit", "commits")} to push` });
    if (behind) marks.push({ kind: "pull", short: `\u2193${behind}`, text: `${plural(behind, "commit", "commits")} to pull` });
    if (dirty) marks.push({ kind: "dirty", short: `\u00b1${dirty}`, text: plural(dirty, "uncommitted file", "uncommitted files") });
    if (local) marks.push({ kind: "local", short: local === 1 ? "\u2302" : `\u2302${local}`,
      text: local === 1 ? "no remote" : `${local} repos without a remote` });
    if (!marks.length) marks.push({ kind: "clean", short: "\u2713", text: "clean" });
    return { repo: g, head, marks, ahead, behind, dirty, local,
      tip: `${g.name} \u00b7 ${raw}: ${marks.map((m) => m.text).join(", ")}` };
  }
}
