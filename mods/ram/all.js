// The main stick, "0x00 @": meta's side column, every space at once (the
// space sticks are under the terminal). It never follows (follow moves the
// selection, the terminal and the space sticks' highlight). Its toggle (or
// ^b d) switches between two views (the toggle reads "diff"; its mode is still
// stored as "changes" in shared "ram.all.mode"):
//   memory   STACK: every space as a tree of its changed files, as the Changes
//            panel lists them (M/A/D, folder/name, +added -removed; the arrow
//            folds a space); + makes a new space, a double-click renames one,
//            and a space dragged onto another moves there (as in the space
//            level's stack). HEAP: every agent from every space, the oldest at
//            the bottom; under it, the git marks of all the repos together.
//   diff     the Changes panel by space: the spaces with changes and their
//            files, the selected file's diff, and a commit box that commits
//            everything in that file's repo (git add -A, then commit). The w
//            box wraps the diff's long lines to the stick's width; off, each
//            line is one row and the rows scroll sideways.
// A file clicked in memory opens it in diff.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, v_virtual_list } from "gpui-base";
import { exec, readTextFile, theme, settings, panes, shared, setShared, run } from "herdr";
import { READ } from "./git.js";
import { AMBER, CYAN, GOLD, GREEN, RED, U, ADDR, REF, STATUS, stop, led, marks, identity, navigating } from "./ui.js";

const HEADER_H = 19 * U, LABEL_H = 13 * U, STACK_H = 18 * U, SPACE_ROW = 20 * U, REPO_ROW = 15 * U, FILE_ROW = 17 * U;
const HEAP_ROW = 19 * U, BOTTOM_H = 21 * U, PINS_H = 6 * U, DIFF_ROW = 15 * U, COMMIT_H = 30 * U;
// The diff's text size.
const DIFF_SIZE = 10.5 * U;
// Room between HEAP's label and the totals line, as the space sticks have
// between theirs and their git line.
const HEAP_GAP = 8 * U;
const MAX_DIFF = 1500;
// Files the tree lists per repo (the rest are "+n more files").
const TREE_FILES = 150;
const LETTER = { A: GREEN, D: RED, U: RED, R: CYAN, M: AMBER };
// The tree's indents: a space's address starts TREE_X in (its row's padding,
// the fold arrow and the gap after it); its repos and files go TREE_STEP
// further in, and a repo's files another TREE_STEP, so they read as the
// space's own rows, not more spaces.
const TREE_X = (6 + 11 + 5) * U, TREE_STEP = 12 * U;
// Each kind of tree row's height, for sizing its box.
const ROW_H = { space: SPACE_ROW, repo: REPO_ROW, file: FILE_ROW, more: FILE_ROW };
const minus = n => `\u2212${n}`;
const countLines = text => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Numbers each diff line once, so a frame only draws the rows on screen (the Changes panel's).
export function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map(line => {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (m) { old = +m[1]; next = +m[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

// Wide characters (CJK, Hangul, full-width forms, emoji) take two columns.
const wide = ch => {
  const c = ch.codePointAt(0);
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd);
};
// TEXT in pieces of at most COLS columns (a tab as 4 spaces), for the wrap view.
export function cut(text, cols) {
  const out = [];
  let piece = "", used = 0;
  for (const ch of String(text ?? "").replace(/\t/g, "    ")) {
    const w = wide(ch) ? 2 : 1;
    if (piece && used + w > cols) { out.push(piece); piece = ""; used = 0; }
    piece += ch;
    used += w;
  }
  out.push(piece || " ");
  return out;
}
// How many columns of diff text fit in a stick WIDTH px wide: its border, the
// number column and its gap, room for the scrollbar, then 0.6 em a column
// (the diff font is monospace), less one to spare.
export const wrapColumns = width => Math.max(8, Math.floor((width - 2 - 32 * U - 12) / (DIFF_SIZE * 0.6)) - 1);

function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch (_) { return fallback; }
}

export class AllStick {
  // VIEW: the RAM side column copy (its gitInfo, go(), open(), menu(), mini(),
  // marker(), and its drag: grab(), droppable(), dragMarks(), moveSpace()).
  constructor(view) {
    this.view = view;
    this.fold = new Set(stored("ram.all.fold", []));
    this.sel = null;
    this.rows = [];
    this.diffWidth = 0;
    this.loadKey = null;
    this.note = null;
    this.busy = false;
    this.typing = false;
    this.message = "";
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const had = Boolean(this.message.trim());
      this.message = this.input.value();
      if (had !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
  }

  // memory or changes: shared ("ram.all.mode"), since ^b d reaches the strip's copy.
  get mode() { return shared("ram.all.mode") === "changes" ? "changes" : "memory"; }
  setMode(mode) { setShared("ram.all.mode", mode); }

  toggle() { this.setMode(this.mode === "changes" ? "memory" : "changes"); }

  // Whether the diff's long lines wrap (the w box), else each is one row that
  // scrolls sideways. Off unless turned on; kept in shared "ram.all.wrap".
  get wrap() { return shared("ram.all.wrap") === true; }

  // The diff's rows cut to COLS columns each, for the wrap view: a line's first
  // piece keeps its number, the rest go on under it with none. Every piece is a
  // row of its own, so the list keeps one row height.
  wrapped(cols) {
    const c = this.wrapCache;
    if (c && c.rows === this.rows && c.cols === cols) return c.out;
    const out = [];
    for (const row of this.rows)
      cut(row.text, cols).forEach((text, k) => out.push(k ? { kind: row.kind, text } : { ...row, text }));
    this.wrapCache = { rows: this.rows, cols, out };
    return out;
  }

  toggleFold(id) {
    if (this.fold.has(id)) this.fold.delete(id); else this.fold.add(id);
    localStorage.setItem("ram.all.fold", JSON.stringify([...this.fold]));
  }

  // The tree: each space, then (unless folded) its repos' changed files. In
  // the changes view, only the spaces with changes.
  tree(data) {
    const git = this.view.gitInfo, ps = panes(), out = [];
    data.spaces.forEach((s, k) => {
      const repos = git ? git.repos(s, ps) : [];
      const count = repos.reduce((n, r) => n + r.dirty, 0);
      if (this.mode === "changes" && !count) return;
      out.push({ kind: "space", key: `s:${s.id}`, s, i: k + 1, count });
      if (this.fold.has(s.id)) return;
      for (const r of repos) {
        if (!r.dirty) continue;
        // One repo: its files are the space's children; more: each repo's are its own.
        const depth = repos.length > 1 ? 2 : 1;
        if (depth === 2) out.push({ kind: "repo", key: `r:${s.id}:${r.top}`, s, r });
        const files = r.files.slice(0, TREE_FILES);
        for (const f of files) out.push({ kind: "file", key: `f:${s.id}:${r.top}:${f.path}`, s, r, f, depth });
        if (r.dirty > files.length) out.push({ kind: "more", key: `m:${s.id}:${r.top}`, n: r.dirty - files.length, depth });
      }
    });
    return out;
  }

  // Every repo once (spaces can share one), for the totals and the commit box.
  repos(data) {
    const git = this.view.gitInfo, ps = panes(), all = new Map();
    for (const s of data.spaces) for (const r of git ? git.repos(s, ps) : []) all.set(r.top, r);
    return [...all.values()];
  }

  // The selected file, checked against the repo as it is now: gone (committed,
  // reverted) clears it; changed (another edit) reloads its diff.
  sync(data, cx) {
    const sel = this.sel;
    if (!sel) return;
    const r = this.repos(data).find(x => x.top === sel.top);
    const f = r?.files.find(x => x.path === sel.path);
    if (!f) { this.sel = null; this.rows = []; this.loadKey = null; return; }
    const sig = `${f.status}:${f.add ?? 0}:${f.del ?? 0}`;
    if (sig !== sel.sig) { sel.sig = sig; this.load(cx); }
  }

  pick(s, r, f, cx) {
    const same = this.sel && this.sel.space === s.id && this.sel.top === r.top && this.sel.path === f.path;
    if (same && this.mode === "changes") { this.sel = null; this.rows = []; this.loadKey = null; cx.notify(); return; }
    this.sel = { space: s.id, name: s.name, top: r.top, repo: r.name, path: f.path, status: f.status,
      fresh: Boolean(f.fresh), initial: Boolean(r.initial), binary: Boolean(f.binary), on: s.machine ?? null,
      add: f.add ?? 0, del: f.del ?? 0, sig: `${f.status}:${f.add ?? 0}:${f.del ?? 0}` };
    this.note = null;
    if (this.mode !== "changes") this.setMode("changes");
    this.load(cx);
    cx.notify();
  }

  // The selected file's diff against HEAD (a new file: its text, all added).
  load(cx) {
    const sel = this.sel;
    if (!sel) return;
    const key = JSON.stringify([sel.space, sel.top, sel.path, sel.sig]);
    this.loadKey = key;
    this.rows = [];
    cx.spawn(async cx => {
      let lines;
      try {
        if (sel.fresh || (sel.initial && sel.status === "A")) {
          const text = await readTextFile(`${sel.top}/${sel.path}`, { on: sel.on });
          lines = text.includes("\0") ? ["Binary file \u00b7 no text diff"]
            : [`@@ -0,0 +1,${countLines(text)} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, MAX_DIFF).map(l => `+${l}`)];
        } else {
          const r = await exec("git", [...READ, "diff", ...(sel.initial ? [] : ["HEAD"]), "--no-ext-diff", "--no-textconv", "--no-color", "--", sel.path],
            { cwd: sel.top, on: sel.on });
          if (r.code !== 0) throw new Error(r.stderr.trim() || "git diff failed");
          const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex(l => l.startsWith("@@"));
          lines = first < 0 ? [sel.binary ? "Binary file changed" : "No text diff"] : all.slice(first);
        }
      } catch (e) { lines = [`Can't show this diff: ${e?.message ?? e}`]; }
      if (this.loadKey !== key) return;
      const shown = lines.slice(0, MAX_DIFF).map(l => l.length > 4000 ? l.slice(0, 4000) + "\u2026" : l);
      this.rows = diffRows(shown);
      this.diffWidth = Math.max(200 * U, ...shown.map(l => l.length * 6.3 * U + 40 * U));
      cx.notify();
    });
  }

  // Commit everything in the selected file's repo, as the Changes panel does.
  commit(cx) {
    const sel = this.sel, message = this.message.trim();
    if (!sel || !message || this.busy) return;
    this.busy = true;
    this.note = null;
    cx.spawn(async cx => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: sel.top, on: sel.on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        this.message = "";
        this.input.set_value("");
        this.sel = null;
        this.rows = [];
        this.loadKey = null;
      } catch (e) { this.note = `Commit failed: ${e?.message ?? e}`; }
      this.busy = false;
      this.view.gitInfo?.again(sel.top, cx);
      cx.notify();
    });
    cx.notify();
  }

  // ---------------------------------------------------------------- drawing

  render(data, width, height, cx) {
    this.sync(data, cx);
    const t = theme();
    const toggle = h_flex().id("ram-all-toggle").h(15 * U).px(5 * U).gap(4 * U).flex_none().items_center().rounded(2)
      .border(1).border_color(this.mode === "changes" ? AMBER : t.input).when(this.mode === "changes", el => el.bg(AMBER + "1f"))
      .cursor_pointer().hover(st => st.bg(t.hover))
      .tooltip(this.mode === "changes" ? "Back to memory: the tree and every agent" : "Diff: each changed file's diff, and a commit box")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.toggle(); cx.notify(); })
      .children(this.view.key("ram.changes") ? [div().text_size(10 * U).font_semibold().text_color(AMBER).child(this.view.key("ram.changes"))] : [])
      .child(div().text_size(10 * U).text_color(this.mode === "changes" ? AMBER : t.muted).child("diff"));
    // w: the diff's long lines wrap (lit) or scroll sideways (the default).
    const wrap = this.wrap;
    const wrapBox = div().id("ram-all-wrap").size(15 * U).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_color(wrap ? AMBER : t.input).when(wrap, el => el.bg(AMBER + "1f"))
      .text_size(10 * U).text_color(wrap ? AMBER : t.muted).cursor_pointer().hover(st => st.bg(t.hover))
      .tooltip(wrap ? "Long diff lines wrap (click: one row each, scrolling sideways)" : "Wrap long diff lines")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); setShared("ram.all.wrap", !wrap); cx.notify(); })
      .child("w");
    const header = h_flex().id("ram-all-head").h(HEADER_H).flex_none().px(6 * U).gap(6 * U).items_center().border_b(1).border_color(t.border)
      .child(div().flex_none().text_size(11 * U).text_color(CYAN).child(ADDR(0)))
      .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(t.foreground).child("@"))
      .child(toggle)
      .child(wrapBox);
    const body = this.mode === "changes" ? this.changes(data, width, height, t) : this.memory(data, height, t);
    const box = v_flex().relative().w(width).flex_1().min_h(0).rounded(2).bg("#0b1311").border(1).border_color(CYAN + "55")
      .overflow_hidden().child(header).children(body);
    const n = Math.max(0, Math.floor((width - 16) / 6)), notch = Math.floor(n * 0.4);
    const pins = h_flex().h(PINS_H).flex_none().px(8 * U).gap(3 * U)
      .children(Array.from({ length: n }, (_, k) => div().w(3 * U).h(PINS_H).flex_none().bg(k === notch || k === notch + 1 ? "#00000000" : GOLD)));
    return v_flex().id("ram-all").w(width).h(height).flex_none().child(box).child(pins);
  }

  // The tree in a box of HEIGHT px that scrolls. Each space and its rows (its
  // repos and files) are one group, the spot a dragged space is dropped on: it
  // lands before or after all of that space. A plain list, not a virtual one:
  // its rows need click handlers, which a virtual list's rows can't have (and
  // it's at most a few hundred rows: files are capped per repo).
  treeList(rows, height, data, t) {
    const v = this.view, order = data.spaces.map(x => x.id), groups = [];
    for (const r of rows) {
      if (r.kind === "space") groups.push({ s: r.s, rows: [] });
      groups.at(-1)?.rows.push(r);
    }
    return v_flex().id("ram-all-tree").w_full().h(height).flex_none().overflow_y_scrollbar()
      .children(groups.map(({ s, rows: own }) => {
        const group = v_flex().id(`all-group-${s.id}`).relative().flex_none().children(own.map(r => this.row(r, data, t)));
        return v.dragMarks(v.droppable(group, "space", s.id, s.machine ?? "", from => v.moveSpace(from, s.id)),
          "space", s.id, order, "y");
      }));
  }

  row(r, data, t) {
    if (r.kind === "space") return this.spaceRow(r, data, t);
    if (r.kind === "repo") return h_flex().h(REPO_ROW).flex_none().pl(TREE_X + TREE_STEP).pr(6 * U).items_center().text_size(10 * U).text_color(t.dim)
      .child(div().min_w(0).truncate().child(`${r.r.name} \u00b7 ${r.r.branch ?? "detached"}`));
    if (r.kind === "more") return div().h(FILE_ROW).flex_none().pl(TREE_X + TREE_STEP * r.depth + 2 * U).flex().items_center().text_size(10 * U).text_color(t.dim)
      .child(`+${r.n} more files`);
    return this.fileRow(r, t);
  }

  // A space: a click shows it (meta stays), a double-click renames it, and a
  // press that moves onto another space (same machine) drags it there.
  spaceRow({ s, i, count }, data, t) {
    const v = this.view, sum = v.gitInfo?.summary(s, panes());
    const open = !this.fold.has(s.id), blocked = data.blockers.filter(a => a.space === s.id).length;
    const hunks = v.marker(s.id);
    return h_flex().id(`all-space-${s.id}`).h(SPACE_ROW).flex_none().px(6 * U).gap(5 * U).items_center().cursor_pointer()
      .when(s.active, el => el.bg(AMBER + "14")).hover(st => st.bg(t.hover))
      // ^b w's navigate mode is on it.
      .when(navigating() === s.id, el => el.border(1).border_color(CYAN))
      .tooltip(`${ADDR(i)} ${s.name}: ${sum?.tip ?? "no git"}`)
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        v.grab("space", s.id, s.machine ?? "");
        if (e.click_count === 2) run("space.rename", { id: s.id });
      })
      .on_click((_e, cx) => { cx.stop_propagation(); v.go(s.id); })
      .on_mouse_down("right", (_e, cx) => v.menu({ height: 260, props: { tab: "space", target: { id: s.id } } }, cx))
      // The arrow is a button of its own: pressing it doesn't drag the space
      // or count toward a double-click.
      .child(div().id(`all-fold-${s.id}`).w(11 * U).flex_none().text_size(10 * U).text_color(t.dim)
        .when(count > 0, el => el.cursor_pointer().hover(st => st.text_color(AMBER)).tooltip(open ? "Fold" : "Unfold")
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFold(s.id); cx.notify(); }))
        .child(count > 0 ? (open ? "\u25be" : "\u25b8") : ""))
      .child(div().flex_none().text_size(10.5 * U).text_color(s.active ? AMBER : CYAN).child(ADDR(i)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).font_semibold().text_color(s.active ? AMBER : t.foreground).child(s.name))
      .children(hunks ? [hunks] : [])
      .children(sum?.repo ? marks(sum, 10.5 * U) : [])
      .when(blocked > 0, el => el.child(div().flex_none().px(3 * U).rounded(2).bg("#3a1118").border(1).border_color(RED)
        .text_size(10 * U).text_color(RED).child(`!${blocked}`)));
  }

  fileRow({ s, r, f, depth }, t) {
    const here = this.sel && this.sel.space === s.id && this.sel.top === r.top && this.sel.path === f.path;
    const parts = f.path.split("/"), name = parts.pop(), dir = parts.length ? parts.join("/") + "/" : "";
    const lines = f.binary ? "binary" : `+${f.add ?? 0} ${minus(f.del ?? 0)}`;
    return h_flex().id(`all-file-${s.id}:${f.path}`).h(FILE_ROW).flex_none().pl(TREE_X + TREE_STEP * depth).pr(6 * U).gap(6 * U).items_center()
      .cursor_pointer().when(here, el => el.bg(t.selected)).hover(st => st.bg(t.hover))
      .tooltip(`${f.path}: ${f.fresh ? "new file" : lines}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.pick(s, r, f, cx); })
      .child(div().w(9 * U).flex_none().text_size(10.5 * U).text_color(LETTER[f.status] ?? AMBER).child(f.status))
      .child(h_flex().flex_1().min_w(0).text_size(11 * U)
        .child(div().min_w(0).truncate().text_color(t.dim).child(dir))
        .child(div().flex_none().max_w(170 * U).truncate().text_color(here ? AMBER : t.foreground).child(name)))
      .when(f.add > 0, el => el.child(div().flex_none().text_size(10 * U).text_color(GREEN).child(`+${f.add}`)))
      .when(f.del > 0, el => el.child(div().flex_none().text_size(10 * U).text_color(RED).child(minus(f.del))));
  }

  // memory: the tree (STACK) above every agent (HEAP), then the totals.
  memory(data, height, t) {
    const rows = this.tree(data);
    const born = a => data.rawByAddress.get(a.address)?.created_ms ?? 0;
    const heap = data.list.filter(a => !a.hunk).sort((a, b) => born(b) - born(a));
    const label = text => div().h(LABEL_H).flex_none().px(6 * U).text_size(10 * U).text_color(t.dim).child(text);
    // STACK's label, as the space level's: it counts the spaces, + pushes a new one.
    const stack = h_flex().h(STACK_H).flex_none().px(6 * U).gap(5 * U).items_center()
      .child(div().flex_1().text_size(10 * U).text_color(t.dim).child(`STACK \u2193  ${data.spaces.length}`))
      .child(this.view.mini("ram-all-space-new", "+", "Push: new space", () => run("space.new")));
    // The heap gets up to 40% of the room, the tree the rest (it scrolls).
    const room = Math.max(0, height - (HEADER_H + STACK_H + LABEL_H + HEAP_GAP + BOTTOM_H + PINS_H + 14 * U));
    let heapRows = Math.min(heap.length, Math.max(0, Math.floor(room * 0.4 / HEAP_ROW)));
    const hidden = heap.length - heapRows;
    if (hidden > 0 && heapRows > 0) heapRows -= 1;
    const keep = new Set([...new Set([...heap.filter(a => a.status === "blocked"), ...heap])].slice(0, heapRows));
    const shown = heap.filter(a => keep.has(a));
    const treeH = Math.max(SPACE_ROW, room - shown.length * HEAP_ROW - (heap.length > shown.length ? FILE_ROW : 0));
    const fits = rows.reduce((n, r) => n + ROW_H[r.kind], 0);
    const active = data.spaces.find(s => s.active);
    const totals = this.totals(data);
    return [
      stack,
      this.treeList(rows, Math.min(treeH, Math.max(SPACE_ROW, fits)), data, t),
      div().flex_1().min_h(2 * U).flex().items_center().px(12 * U)
        .child(div().w_full().h(0).border_t(1).border_dashed().border_color(t.border)),
      ...shown.map(a => this.heapRow(a, active, t)),
      ...(heap.length > shown.length ? [div().h(FILE_ROW).flex_none().px(6 * U).flex().items_center().text_size(10 * U).text_color(t.dim)
        .child(`+${heap.length - shown.length} more blocks`)] : []),
      label(`HEAP \u2191${heap.length ? "  " + heap.length : ""}`),
      div().id("ram-all-heap-gap").h(HEAP_GAP).flex_none(),
      h_flex().id("ram-all-totals").h(BOTTOM_H).flex_none().px(6 * U).gap(6 * U).items_center().border_t(1).border_color(t.border)
        .text_size(11 * U).tooltip(totals.tip)
        .child(div().flex_none().text_color(t.dim).child("@"))
        .children(marks(totals)),
    ];
  }

  // Every repo's marks added up, each repo once.
  totals(data) {
    const all = this.repos(data);
    const sum = k => all.reduce((n, r) => n + (r[k] || 0), 0);
    const ahead = sum("ahead"), behind = sum("behind"), dirty = sum("dirty");
    const local = all.filter(r => !r.upstream && r.branch !== "(detached)").length;
    const m = [];
    if (ahead) m.push({ kind: "push", short: `\u2191${ahead}`, text: `${ahead} to push` });
    if (behind) m.push({ kind: "pull", short: `\u2193${behind}`, text: `${behind} to pull` });
    if (dirty) m.push({ kind: "dirty", short: `\u00b1${dirty}`, text: `${dirty} uncommitted` });
    if (local) m.push({ kind: "local", short: local === 1 ? "\u2302" : `\u2302${local}`, text: `${local} without a remote` });
    if (!m.length && all.length) m.push({ kind: "clean", short: "\u2713", text: "clean" });
    return { marks: m, tip: `${all.length} repos: ${m.map(x => x.text).join(", ") || "none"}` };
  }

  heapRow(a, active, t) {
    const red = a.status === "blocked", mine = a.space === active?.id && a.tab === active?.tabs.find(x => x.active)?.id;
    return h_flex().id(`all-heap-${a.address}`).h(HEAP_ROW).flex_none().px(6 * U).gap(5 * U).items_center().cursor_pointer()
      .when(red, el => el.bg("#2a0f14")).hover(st => st.bg(red ? "#3a1520" : t.hover))
      .tooltip(identity(a))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.view.open(a); })
      .child(led(a, 6, this.view.motion()))
      .child(div().w(70 * U).flex_none().truncate().text_size(10.5 * U).text_color(a.space === active?.id ? AMBER : t.dim).child(a.space_name ?? ""))
      .child(div().flex_none().text_size(10.5 * U).text_color(mine ? AMBER : t.dim).child(REF(a.tab_index, mine)))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(red ? "#ffd0d4" : t.foreground)
        .child(`${a.program?.name || "agent"}${a.child ? " \u21b3" : ""}`))
      .child(div().flex_none().text_size(10 * U).text_color(red ? RED : t[a.status] ?? t.dim).child(STATUS[a.status] ?? ""));
  }

  // changes: the files by space (up to 40% of the room), the selected file's
  // diff, and the commit box for its repo.
  changes(data, width, height, t) {
    const rows = this.tree(data), sel = this.sel;
    const files = rows.filter(r => r.kind === "file").map(r => r.f);
    const add = files.reduce((n, f) => n + (f.add ?? 0), 0), del = files.reduce((n, f) => n + (f.del ?? 0), 0);
    const room = Math.max(0, height - (HEADER_H + 18 * U + 18 * U + COMMIT_H + PINS_H + 10 * U));
    const fits = rows.reduce((n, r) => n + ROW_H[r.kind], 0);
    const summary = h_flex().h(18 * U).flex_none().px(6 * U).gap(6 * U).items_center().border_b(1).border_color(t.border).text_size(10.5 * U)
      .child(div().flex_1().text_color(t.muted).child(`${files.length} ${files.length === 1 ? "file" : "files"} in ${rows.filter(r => r.kind === "space").length} spaces`))
      .when(add > 0, el => el.child(div().flex_none().text_color(GREEN).child(`+${add}`)))
      .when(del > 0, el => el.child(div().flex_none().text_color(RED).child(minus(del))));
    if (!rows.length) return [summary, div().p(8 * U).text_size(11.5 * U).text_color(t.dim).child("Nothing uncommitted in any space")];
    const diffHead = h_flex().id("ram-all-diff-head").h(18 * U).flex_none().px(6 * U).gap(6 * U).items_center().border_t(1).border_b(1)
      .border_color(t.border).text_size(10.5 * U)
      .child(div().flex_1().min_w(0).truncate().text_color(sel ? t.foreground : t.dim)
        .child(sel ? `${sel.name} \u00b7 ${sel.path}` : "Pick a file to see its diff"))
      .when(Boolean(sel), el => el
        .when(sel.add > 0, e => e.child(div().flex_none().text_color(GREEN).child(`+${sel.add}`)))
        .when(sel.del > 0, e => e.child(div().flex_none().text_color(RED).child(minus(sel.del))))
        .child(div().id("ram-all-diff-close").flex_none().px(3 * U).text_color(t.dim).cursor_pointer().hover(st => st.text_color(RED))
          .tooltip("Close the diff").on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); this.sel = null; this.rows = []; this.loadKey = null; cx.notify(); }).child("\u00d7")));
    const diffRowsShown = this.wrap ? this.wrapped(wrapColumns(width)) : this.rows;
    const list = v_virtual_list("ram-all-diff-rows", diffRowsShown.length, DIFF_ROW, i => String(i),
      range => diffRowsShown.slice(range.start, range.end).map(row => this.diffRow(row, t))).size_full();
    // Wrapped, the rows fit the stick; else each line is one row and they scroll sideways together.
    const diff = div().id("ram-all-diff").flex_1().min_h(0).relative().font_family(settings()?.font_family ?? "JetBrains Mono").text_size(DIFF_SIZE)
      .child(this.wrap ? list : div().id("ram-all-diff-x").size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.diffWidth).h_full().child(list)));
    const target = sel ? this.repos(data).find(r => r.top === sel.top) : null;
    const can = Boolean(sel && this.message.trim() && !this.busy);
    const commit = h_flex().id("ram-all-commit-row").h(COMMIT_H).flex_none().px(6 * U).gap(6 * U).items_center().border_t(1).border_color(t.border)
      .child(div().id("ram-all-commit-message").flex_1().min_w(0).h(22 * U).px(6 * U).flex().items_center().rounded(2).border(1)
        .border_color(this.typing ? AMBER : t.input).cursor_text()
        .tooltip(target ? `Commits all ${target.dirty} changed files in ${target.name} (${sel.name})` : "Pick a file first: its repo is the one committed")
        .on_mouse_down("left", stop)
        .child(Input.new(this.input).h_full().text_size(11 * U).text_color(t.foreground)))
      .child(div().id("ram-all-commit").h(22 * U).px(8 * U).flex_none().flex().items_center().rounded(2).text_size(11 * U)
        .bg(can ? AMBER : t.raised).text_color(can ? "#0a100d" : t.dim).when(can, el => el.cursor_pointer())
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.commit(cx); })
        .child(this.busy ? "Committing\u2026" : target ? `Commit ${target.name}` : "Commit"));
    return [
      summary,
      this.treeList(rows, Math.min(Math.max(SPACE_ROW, fits), Math.max(SPACE_ROW, room * 0.4)), data, t),
      diffHead,
      diff,
      ...(this.note ? [div().px(6 * U).py(2 * U).text_size(10.5 * U).text_color(RED).child(this.note)] : []),
      commit,
    ];
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(8 * U).h(DIFF_ROW).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(DIFF_ROW).flex_none().gap(6 * U)
      .when(kind === "+", e => e.bg(GREEN + "18")).when(kind === "-", e => e.bg(RED + "18"))
      .child(div().w(26 * U).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().text_color(kind === "-" ? "#ffb3ba" : kind === "+" ? "#b8ffc9" : t.foreground).child(text));
  }
}
