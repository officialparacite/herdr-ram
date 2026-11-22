// GIT's dialog for a folder that isn't in a git repository (role "git-init";
// props space, name, folder, machine): the questions lazygit asks in its
// terminal then, as a menu. "Create a repo here" runs `git init` (with the
// branch name typed, else git's default) and opens lazygit there; "Open a recent
// repo" lists lazygit's own recent repos (its state.yml) and opens lazygit in
// the one picked. In RAM the strip's copy opens it (shared TOOL_OPEN, main.js);
// in another layout a new tab does, labelled as the key bar's lazygit is
// (LAZY_ARGV). After a `git init` every copy's git looks at that folder again
// (shared GIT_AGAIN, git.js). ↑↓ choose, Enter opens, ← back, Esc closes.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { exec, readTextFile, props, closeOverlay, theme, shared, setShared, run, home } from "herdr";
import { AMBER, CYAN, RED, U, stop, sameDir } from "./ui.js";
import { GIT_AGAIN } from "./git.js";

export const TOOL_OPEN = "ram.tool.open";
// lazygit in a tab of its own, which labels itself with its folder (the key
// bar's, mods/prefix, does the same).
export const LAZY_ARGV = ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" "ram.lazygit=$PWD" >/dev/null 2>&1; exec lazygit'];
const baseName = p => String(p ?? "").replace(/\/+$/, "").split("/").pop() || p;

// The paths in lazygit's state.yml under `recentrepos:`, in its order.
export function recentRepos(text) {
  const out = [];
  let inList = false;
  for (const line of String(text ?? "").split("\n")) {
    if (/^recentrepos:\s*$/.test(line)) { inList = true; continue; }
    if (!inList) continue;
    const m = line.match(/^\s+-\s+(.*?)\s*$/);
    if (m) { out.push(m[1].replace(/^(['"])(.*)\1$/, "$2")); continue; }
    if (/^\S/.test(line)) break;
  }
  return out;
}

// git's own default branch name (what an empty name gives), else master.
async function defaultBranch(machine, folder) {
  try {
    const r = await exec("git", ["var", "GIT_DEFAULT_BRANCH"], { cwd: folder, on: machine });
    if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch (_) { /* an older git: its default */ }
  return "master";
}

// lazygit's recent repos on that machine that still are repos, but FOLDER, up to 8.
async function loadRecent(machine, folder) {
  try {
    const d = await exec("lazygit", ["--print-config-dir"], { on: machine });
    if (d.code !== 0 || !d.stdout.trim()) return [];
    const text = await readTextFile(`${d.stdout.trim()}/state.yml`, { on: machine });
    const list = recentRepos(text).filter(p => !sameDir(p, folder)).slice(0, 12);
    if (!list.length) return [];
    const ok = await exec("sh", ["-c", 'for d in "$@"; do [ -e "$d/.git" ] && printf "%s\\n" "$d"; done', "sh", ...list], { on: machine });
    const real = new Set(String(ok.stdout ?? "").split("\n").filter(Boolean));
    return list.filter(p => real.has(p)).slice(0, 8);
  } catch (_) { return []; }
}

export class GitInit {
  constructor(cx) {
    const p = props() ?? {};
    this.mode = "main";
    this.choice = 0;
    this.at = 0;
    this.recent = undefined;
    this.fallback = null;
    this.error = null;
    this.busy = false;
    this.handle = cx.focus_handle();
    this.branch = InputState.new({ placeholder: "branch name (empty: git's default)" });
    this.branch.on("submit", (_e, cx) => { this.enter(cx); cx.notify(); });
    this.branch.focus();
    cx.timer.after(50, () => { if (this.mode === "main") this.branch.focus(); });
    cx.spawn(async cx => {
      this.fallback = await defaultBranch(p.machine ?? null, p.folder);
      cx.notify();
      this.recent = await loadRecent(p.machine ?? null, p.folder);
      cx.notify();
    });
  }

  // A path as you'd type it: ~ for your home (on this computer).
  where(path) {
    const h = home(), p = props() ?? {};
    return !p.machine && h && (path === h || String(path).startsWith(h + "/")) ? "~" + String(path).slice(h.length) : path;
  }

  // Enter, or a click: the chosen row.
  enter(cx) {
    if (this.mode === "recent") { const repo = this.recent?.[this.at]; if (repo) this.launch(repo); return; }
    if (this.choice === 0) this.create(cx);
    else if (this.recent?.length) this.toRecent();
  }

  toRecent() { this.mode = "recent"; this.at = 0; this.handle.focus(); }

  back() { this.mode = "main"; this.choice = 1; this.branch.focus(); }

  // git init (the branch name typed, else git's default), then lazygit there.
  create(cx) {
    if (this.busy) return;
    const p = props() ?? {}, name = this.branch.value().trim();
    this.busy = true;
    this.error = null;
    cx.spawn(async cx => {
      try {
        const r = await exec("git", ["init", ...(name ? [`--initial-branch=${name}`] : [])], { cwd: p.folder, on: p.machine ?? null });
        if (r.code === 0) {
          setShared(GIT_AGAIN, { at: Date.now(), on: p.machine ?? null, folder: p.folder });
          this.launch(p.folder);
          return;
        }
        this.error = String(r.stderr || r.stdout || "git init failed").trim().split("\n").pop();
      } catch (e) { this.error = String(e?.message ?? e); }
      this.busy = false;
      cx.notify();
    });
  }

  // lazygit at FOLDER: in RAM its strip opens it (its rules, its level); else a tab.
  launch(folder) {
    const p = props() ?? {};
    if (shared("layout") === "ram") setShared(TOOL_OPEN, { at: Date.now(), kind: "lazygit", space: p.space, folder });
    else run("tab.new", { space: p.space, name: `lazygit ${baseName(folder)}`, folder, argv: LAZY_ARGV });
    if (p.overlay) closeOverlay(p.overlay);
  }

  key(e, cx) {
    const k = e.key;
    if (this.mode === "main") {
      // (Enter in the name field is its submit.)
      if (k !== "up" && k !== "down") return;
      this.choice = this.choice === 0 ? 1 : 0;
    } else {
      const n = this.recent?.length ?? 0;
      if (k === "down" || k === "j") this.at = Math.min(Math.max(0, n - 1), this.at + 1);
      else if (k === "up" || k === "k") this.at = Math.max(0, this.at - 1);
      else if (k === "enter") this.enter(cx);
      else if (k === "left" || k === "backspace") this.back();
      else if (k === "escape") { const o = props()?.overlay; if (o) closeOverlay(o); }
      else return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const t = theme(), p = props() ?? {}, where = this.where(p.folder ?? "");
    const box = v_flex().id("git-init").size_full().p(10 * U).gap(6 * U).bg(t.popover)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx));
    const head = (title, extra) => h_flex().h(20 * U).flex_none().gap(6 * U).items_center()
      .child(div().flex_none().text_size(12.5 * U).font_semibold().text_color(CYAN).child("GIT"))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).text_color(t.muted).child(title))
      .children(extra ? [extra] : []);
    const hint = text => div().flex_none().text_size(10.5 * U).text_color(t.dim).child(text);
    const row = (id, here, name, about, enabled, act) => h_flex().id(id).h(24 * U).flex_none().px(8 * U).gap(8 * U).items_center().rounded(2)
      .when(here, el => el.bg(AMBER + "1f"))
      .when(enabled, el => el.cursor_pointer().hover(st => st.bg(t.hover)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) act(cx); })
      .child(div().w(10 * U).flex_none().text_size(11 * U).text_color(AMBER).child(here ? "\u25b8" : ""))
      .child(div().flex_none().text_size(12 * U).font_semibold().text_color(!enabled ? t.dim : here ? AMBER : t.foreground).child(name))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(about));
    if (this.mode === "recent") {
      const list = this.recent ?? [];
      const back = div().id("git-back").flex_none().px(6 * U).h(16 * U).flex().items_center().rounded(2).border(1).border_color(t.input)
        .text_size(10.5 * U).text_color(t.muted).cursor_pointer().hover(st => st.bg(t.hover).text_color(AMBER))
        .tooltip("Back").on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.back(); cx.notify(); }).child("\u2190 back");
      return box.child(head("lazygit's recent repos", back))
        .child(v_flex().id("git-recent").flex_1().min_h(0).overflow_y_scrollbar()
          .children(list.map((repo, k) => row(`git-recent-${k}`, k === this.at, this.where(repo), "", true,
            () => this.launch(repo)))))
        .child(hint("\u2191\u2193 choose \u00b7 Enter: lazygit there \u00b7 \u2190 back \u00b7 Esc close"));
    }
    const recent = this.recent === undefined ? "reading lazygit's list\u2026"
      : this.recent.length ? `${this.recent.length} of lazygit's, to open instead` : "lazygit has none";
    return box.child(head(`${p.name ?? ""} \u00b7 ${where}`))
      .child(div().flex_none().text_size(11.5 * U).text_color(t.foreground).child(`${where} isn't in a git repository.`))
      .child(div().id("git-branch").h(24 * U).flex_none().px(6 * U).flex().items_center().rounded(2).border(1).border_color(t.input)
        .child(Input.new(this.branch).h_full().text_size(11.5 * U).text_color(t.foreground)))
      .child(hint(`Its first branch: the name typed, else git's default${this.fallback ? ` (${this.fallback})` : ""}`))
      .child(row("git-create", this.choice === 0, this.busy ? "Creating\u2026" : "Create a repo here", "git init, then lazygit", !this.busy,
        cx => { this.choice = 0; this.create(cx); }))
      .child(row("git-recent-open", this.choice === 1, "Open a recent repo \u25b8", recent, Boolean(this.recent?.length),
        cx => { this.choice = 1; this.toRecent(); cx.notify(); }))
      .when(Boolean(this.error), el => el.child(div().id("git-error").flex_none().text_size(11 * U).text_color(RED).child(this.error)))
      .child(div().flex_1())
      .child(hint("\u2191\u2193 choose \u00b7 Enter open \u00b7 Esc close"));
  }
}
