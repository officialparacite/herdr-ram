// Commands running in your tabs' shells, for HEAP (main.js, all.js): a build, a
// test run, a dev server, an `ls`. A shell's terminal runs a command while its
// foreground program isn't the shell (Herdr's terminals(): `program`, from the
// foreground's argv). It shows, working, the moment RAM sees it, however short
// (a quick one flickers in and out). When it ends while you aren't looking at
// its tab it stays, done (finished, unseen), until you look at that tab or peek
// at it. Agents (they report a status), sub-agents, RAM's tool tabs and programs
// that wait for you (editors, pagers, lazygit, top, ssh, a REPL) aren't
// commands here.
// The strip's copy keeps them in shared PROCS, { address: { pid, name, since,
// done, line } }: done is when it ended (null while it runs), line its last
// output line then. Each copy that shows them reads the running ones' last
// lines itself (Tail), so nothing is written for every line a build prints.
import { hc } from "herdr";

export const PROCS = "ram.procs";
const TOOL_LABELS = ["ram.lazygit", "ram.rg", "ram.hunk"];
// Programs that wait for you rather than work: by Herdr's program key, or the
// command's own name.
export const WAITING = new Set(["nvim", "vim", "hx", "emacs", "nano", "micro", "lazygit", "less", "htop", "tmux", "ssh",
  "psql", "mysql", "sqlite3", "redis-cli", "mongosh", "ghci", "iex", "erl", "irb", "fzf", "hunk", "rg-fzf", "watch",
  "yazi", "ranger", "lf", "nnn", "k9s"]);
// Interpreters: a REPL when they run with nothing after them.
const REPL = new Set(["python", "node", "ruby", "lua", "julia", "R", "scala", "ocaml", "deno", "bun", "php", "perl"]);
const base = s => String(s ?? "").split("/").pop().replace(/^-+/, "");

// What a terminal runs as a command: { pid, name }, or null.
export function command(t) {
  if (!t || t.state === "finished" || t.parent || t.status) return null;
  const p = t.program;
  if (!p?.key || p.shell || p.agent) return null;
  if (TOOL_LABELS.some(k => t.labels?.[k])) return null;
  const fg = t.foreground ?? {};
  const argv = Array.isArray(fg.argv) && fg.argv.length ? fg.argv : Array.isArray(t.argv) ? t.argv : [];
  const first = base(argv[0]);
  if (WAITING.has(p.key) || WAITING.has(first)) return null;
  if (REPL.has(p.key) && argv.length <= 1) return null;
  return { pid: fg.pid ?? t.pid ?? null, name: p.name || first || "command" };
}

// The next PROCS from PREV (shared), TERMS (terminals()) and PANES. SHOWN: the
// tab ids on screen now (their commands that ended are seen). LINES: the last
// output lines read (Tail), kept with a command when it ends.
export function track(prev, terms, paneList, shown, lines, now) {
  const tabOf = new Map(paneList.filter(p => p.terminal).map(p => [p.terminal, p.tab]));
  const next = {};
  for (const t of terms) {
    const tab = tabOf.get(t.address);
    if (!tab) continue;
    const run = command(t), was = prev?.[t.address];
    if (run) {
      next[t.address] = was && !was.done && was.pid === run.pid ? was
        : { pid: run.pid, name: run.name, since: now, done: null, line: lines?.[t.address] ?? null };
      continue;
    }
    // Ended (or ended earlier) while you were looking at its tab: seen.
    if (!was || shown.has(tab)) continue;
    next[t.address] = was.done ? was : { ...was, done: now, line: lines?.[t.address] ?? was.line ?? null };
  }
  return next;
}

// Whether two PROCS say the same (key order aside).
export function sameProcs(a, b) {
  const flat = x => JSON.stringify(Object.keys(x ?? {}).sort().map(k => [k, x[k]]));
  return flat(a) === flat(b);
}

// HEAP rows for STATE (PROCS), shaped like an agent's (model.js): status
// working or done, title its last output line (running: LINES, the copy's own).
export function procRows(state, spaceList, paneList, lines = {}) {
  const out = [];
  for (const [address, e] of Object.entries(state ?? {})) {
    const p = paneList.find(x => x.terminal === address);
    const s = p && spaceList.find(x => x.tabs?.some(t => t.id === p.tab));
    if (!s) continue;
    const at = s.tabs.findIndex(t => t.id === p.tab), tab = s.tabs[at];
    out.push({ address, pane: p.pane, space: s.id, space_name: s.name, machine: s.machine ?? null,
      tab: tab.id, tab_name: tab.name, tab_index: at + 1, status: e.done ? "done" : "working",
      title: (e.done ? e.line : lines[address] ?? e.line) ?? "", program: { name: e.name },
      proc: true, child: false, since: e.since ?? 0, focused: false });
  }
  return out;
}

// A terminal's last line of output: its screen without colors, the last line
// that isn't empty, without its indent, cut at 160 characters.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
export function lastLine(text) {
  const lines = String(text ?? "").replace(ANSI, "").split("\n")
    .map(l => l.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").replace(/\s+$/, "")).filter(Boolean);
  const line = (lines.at(-1) ?? "").trim();
  return line.length > 160 ? line.slice(0, 160) : line;
}

// The last output lines of the commands a copy shows, read when it asks
// (its timer, every 2 s while the window is active).
export class Tail {
  constructor() { this.lines = {}; this.reading = false; }

  // Read ADDRESSES; forget lines of terminals not in KEEP.
  tick(addresses, keep, cx) {
    for (const a of Object.keys(this.lines)) if (!keep.has(a)) delete this.lines[a];
    if (this.reading || !addresses.length) return;
    this.reading = true;
    cx.spawn(async cx => {
      let changed = false;
      for (const a of addresses) {
        try {
          const r = await hc(["read", a]);
          if (r.code !== 0) continue;
          const line = lastLine(r.stdout);
          if (this.lines[a] !== line) { this.lines[a] = line; changed = true; }
        } catch (_) { /* keep what it showed */ }
      }
      this.reading = false;
      if (changed) cx.notify();
    });
  }
}
