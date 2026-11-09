// Hunk in RAM: the hunk level and its reviews.
//
// ^b r (or the r hunk button) opens a menu of what hunk can show (diff,
// diff --staged, show, log, stash show, status, with an optional ref). The
// pick opens in a tab of its own at the space's repo, labelled ram.hunk=<what>
// and moved to the end so the space's own tabs keep their numbers. Those tabs
// stay out of the tab strip and the meta frames: they're listed under HUNK at
// the top of the side column in the hunk level, and each space shows how many
// it has (a small cyan ◆n). Quitting hunk closes its tab; ^b r again goes back
// to the tab you came from and leaves the review open, so an agent can still
// work on its notes (an agent's hunk skill finds sessions with `hunk session list`).
//
// The live sessions come from `hunk session list --json`. Each session's pid
// is its terminal's process (RAM starts hunk with exec), or the foreground
// process of a terminal where it was started by hand; that's how a review is
// matched to its tab.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { exec, setShared, props, closeOverlay, theme } from "herdr";
import { AMBER, CYAN, U, stop } from "./ui.js";

export const HUNK_LABEL = "ram.hunk";

// What hunk can open. ARGS(ref) is hunk's argv; REF: it takes a ref or range;
// NOTES: the repo's saved notes (.hunk/notes.json) load with it, as the user's
// hunk-open shell function does. log has no --transparent-bg.
export const COMMANDS = [
  { id: "diff", name: "diff", about: "working tree, live (or against the ref)", ref: true, notes: true,
    args: ref => ["diff", ...(ref ? [ref] : []), "--watch", "--transparent-bg"] },
  { id: "staged", name: "diff --staged", about: "staged changes, live",
    args: () => ["diff", "--staged", "--watch", "--transparent-bg"] },
  { id: "show", name: "show", about: "the last commit (or the ref)", ref: true,
    args: ref => ["show", ...(ref ? [ref] : []), "--transparent-bg"] },
  { id: "log", name: "log", about: "history (from the ref)", ref: true,
    args: ref => ["log", ...(ref ? [ref] : [])] },
  { id: "stash", name: "stash show", about: "the latest stash (or the ref)", ref: true,
    args: ref => ["stash", "show", ...(ref ? [ref] : []), "--transparent-bg"] },
  { id: "status", name: "status", about: "this workspace and its worktrees",
    args: () => ["status", "--transparent-bg"] },
];
// What a review is called: its command, with the ref when there's one.
export const labelOf = (cmd, ref) => cmd.ref && ref ? `${cmd.name} ${ref}` : cmd.name;

// /private/tmp and /tmp are the same folder on macOS (hunk reports the first).
const real = p => String(p ?? "").replace(/^\/private(?=\/(?:tmp|var)(?:\/|$))/, "");
const sameDir = (a, b) => Boolean(a && b) && real(a) === real(b);

// One session from `hunk session list --json`, as RAM keeps it: your notes
// (source "user") apart from the agents'.
export function reduce(s) {
  const st = s.snapshot?.state ?? {}, notes = st.reviewNotes ?? [];
  const mine = notes.filter(n => n.source === "user").length;
  return { id: s.sessionId, pid: s.pid ?? null, cwd: s.cwd ?? null, repo: s.repoRoot ?? null, title: s.title ?? "",
    files: s.fileCount ?? s.files?.length ?? 0, mine, agent: Math.max(0, (st.reviewNoteCount ?? notes.length) - mine) };
}

// The live sessions, polled by the map copy and shared as "ram.hunk.sessions":
// every 3 s while one is open (notes come and go), every 15 s otherwise
// (one started outside RAM), every minute when hunk isn't installed.
export class Sessions {
  constructor() { this.list = []; this.at = 0; this.busy = false; this.missing = false; this.sig = null; }
  soon() { this.at = 0; }
  tick(cx, open) {
    const every = this.missing ? 60000 : open || this.list.length ? 3000 : 15000;
    if (this.busy || Date.now() - this.at < every) return;
    this.busy = true;
    this.at = Date.now();
    cx.spawn(async cx => {
      let list = this.list;
      try {
        const r = await exec("hunk", ["session", "list", "--json"]);
        if (r.code === 0) list = (JSON.parse(r.stdout).sessions ?? []).map(reduce);
        this.missing = false;
      } catch (_) { this.missing = true; list = []; }
      this.busy = false;
      const sig = JSON.stringify(list);
      if (sig !== this.sig) { this.sig = sig; this.list = list; setShared("ram.hunk.sessions", list); }
      cx.notify();
    });
  }
}

// Every open review, matched to its terminal, tab and space: RAM's own hunk
// tabs (with their session once it has registered) and any other session (one
// started by hand in a terminal tab, or outside Herdr: no tab).
export function entries(sessions, terms, paneList, spaceList) {
  const tabSpace = new Map();
  for (const s of spaceList) for (const t of s.tabs ?? []) tabSpace.set(t.id, s);
  const paneOf = new Map(paneList.filter(p => p.terminal).map(p => [p.terminal, p]));
  const byPid = new Map();
  for (const t of terms) {
    if (t.pid) byPid.set(t.pid, t);
    if (t.foreground?.pid) byPid.set(t.foreground.pid, t);
  }
  const used = new Set(), out = [];
  const where = t => {
    const p = t && paneOf.get(t.address), s = p && tabSpace.get(p.tab);
    return { terminal: t?.address ?? null, pane: p?.pane ?? null, tab: p?.tab ?? null, space: s?.id ?? null, spaceName: s?.name ?? null };
  };
  for (const x of sessions ?? []) {
    let t = x.pid ? byPid.get(x.pid) : null;
    if (t && used.has(t.address)) t = null;
    t ??= terms.find(c => !used.has(c.address) && c.labels?.[HUNK_LABEL] && sameDir(paneOf.get(c.address)?.cwd, x.cwd));
    if (!t) {
      const p = paneList.find(q => q.terminal && !used.has(q.terminal) && /^hunk$/i.test(q.program?.name ?? "") && sameDir(q.cwd, x.cwd));
      t = p ? terms.find(c => c.address === p.terminal) ?? { address: p.terminal } : null;
    }
    if (t) used.add(t.address);
    out.push({ ...x, ...where(t), label: t?.labels?.[HUNK_LABEL] ?? null, ram: Boolean(t?.labels?.[HUNK_LABEL]) });
  }
  for (const t of terms) {
    if (!t.labels?.[HUNK_LABEL] || used.has(t.address) || t.state === "finished") continue;
    const w = where(t);
    if (w.tab) out.push({ id: null, label: t.labels[HUNK_LABEL], ram: true, mine: 0, agent: 0, files: null, title: "",
      cwd: paneOf.get(t.address)?.cwd ?? null, ...w });
  }
  return out;
}

// What a row calls a review: RAM's label, else the session's own title.
export const nameOf = e => e.label || e.title || "review";

// ---------------------------------------------------------------- the menu

// The menu (a dialog, the ram mod with props {role: "hunk-menu", space, name,
// repo}): an optional ref, then what to open. Enter opens the highlighted one,
// up/down move, a click opens one, Esc closes. The pick goes to the map copy as
// shared "ram.hunk.open" (this copy closes at once, and with it its tasks).
export class HunkMenu {
  constructor(cx) {
    this.choice = 0;
    this.ref = InputState.new({ placeholder: "ref or range, optional: HEAD~2, main...feature" });
    this.ref.on("submit", () => this.pick(COMMANDS[this.choice]));
    this.ref.focus();
    cx.timer.after(50, () => this.ref.focus());
  }

  pick(cmd) {
    const p = props() ?? {};
    setShared("ram.hunk.open", { at: Date.now(), space: p.space, cmd: cmd.id, ref: cmd.ref ? this.ref.value().trim() : "" });
    if (p.overlay) closeOverlay(p.overlay);
  }

  render() {
    const t = theme(), p = props() ?? {};
    const row = (cmd, k) => {
      const here = k === this.choice;
      return h_flex().id(`hunk-cmd-${cmd.id}`).h(24 * U).flex_none().px(8 * U).gap(8 * U).items_center().rounded(2).cursor_pointer()
        .when(here, el => el.bg(AMBER + "1f")).hover(st => st.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.pick(cmd); })
        .child(div().w(10 * U).flex_none().text_size(11 * U).text_color(AMBER).child(here ? "\u25b8" : ""))
        .child(div().w(110 * U).flex_none().text_size(12 * U).font_semibold().text_color(here ? AMBER : t.foreground).child(cmd.name))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(cmd.about));
    };
    return v_flex().id("hunk-menu").size_full().p(10 * U).gap(6 * U).bg(t.popover)
      .on_key_down((e, cx) => {
        if (e.key !== "up" && e.key !== "down") return;
        cx.stop_propagation();
        this.choice = (this.choice + (e.key === "down" ? 1 : COMMANDS.length - 1)) % COMMANDS.length;
        cx.notify();
      })
      .child(h_flex().gap(6 * U).items_center()
        .child(div().text_size(12.5 * U).font_semibold().text_color(CYAN).child("hunk"))
        .child(div().min_w(0).truncate().text_size(11.5 * U).text_color(t.muted).child(`${p.name ?? ""}${p.repo ? " \u00b7 " + p.repo : ""}`)))
      .child(div().id("hunk-ref").h(24 * U).flex_none().px(6 * U).flex().items_center().rounded(2).border(1).border_color(t.input)
        .child(Input.new(this.ref).h_full().text_size(11.5 * U).text_color(t.foreground)))
      .child(v_flex().flex_none().children(COMMANDS.map(row)))
      .child(div().text_size(10.5 * U).text_color(t.dim).child("\u2191\u2193 choose \u00b7 Enter open \u00b7 Esc close"));
  }
}

// ---------------------------------------------------------------- the HUNK list

export const HUNK_ROW = 22 * U, HUNK_HEAD = 20 * U;

// The rows' order: this space's reviews first, then the others by space.
export function ordered(list, spaceList) {
  const s = spaceList.find(x => x.active), index = id => spaceList.findIndex(x => x.id === id);
  return [...list].sort((a, b) => Number(b.space === s?.id) - Number(a.space === s?.id)
    || (a.space ? index(a.space) : 1e9) - (b.space ? index(b.space) : 1e9));
}

// One review's row. VIEW: the map/side copy (its hover and close helpers).
export function hunkRow(view, e, shownTab) {
  const t = theme(), here = Boolean(e.tab && e.tab === shownTab);
  const key = e.id ?? e.terminal, short = e.id ? e.id.slice(0, 4) : "";
  const notes = [e.mine ? `${e.mine} of your notes` : "", e.agent ? `${e.agent} agent notes` : ""].filter(Boolean).join(", ") || "no notes";
  const tip = `${e.title || nameOf(e)}: ${notes}${short ? ` \u00b7 /hunk ${short}` : ""} \u00b7 ${e.spaceName ? "in " + e.spaceName : "outside Herdr"}`;
  const hovered = view.hoverTab === `hunk:${key}`;
  return h_flex().id(`hunk-${key}`).h(HUNK_ROW).flex_none().px(10 * U).gap(6 * U).items_center()
    .when(here, el => el.bg(AMBER + "14")).when(Boolean(e.tab), el => el.cursor_pointer().hover(st => st.bg(t.hover)))
    .on_hover(view.hovering(`hunk:${key}`))
    .tooltip(tip)
    .on_mouse_down("left", stop)
    .on_click((_e, cx) => { cx.stop_propagation(); if (e.tab) view.go(e.space, e.tab); })
    .child(div().flex_none().text_size(10 * U).text_color(here ? AMBER : CYAN).child("\u25c6"))
    .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).font_semibold().text_color(here ? AMBER : t.foreground).child(nameOf(e)))
    .child(div().flex_none().max_w(70 * U).truncate().text_size(10.5 * U).text_color(t.dim).child(e.spaceName ?? "outside"))
    .when(e.mine > 0, el => el.child(div().flex_none().text_size(10.5 * U).text_color(AMBER).child(`\u270e${e.mine}`)))
    .when(Boolean(short), el => el.child(div().flex_none().text_size(10 * U).text_color(t.dim).child(short)))
    .when(e.ram && Boolean(e.tab), el => el.child(view.closeHunk(`hunkx-${key}`, e, 14 * U, hovered)));
}

// The marker on a space with open reviews: ◆ and how many, small and cyan.
export function marker(n) {
  return n ? div().flex_none().text_size(10 * U).text_color(CYAN + "bb").child(`\u25c6${n}`) : null;
}
