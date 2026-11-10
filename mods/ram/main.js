// RAM: the window as a computer's memory, in three levels. A strip on top
// (the map copy) shows the current space's tabs and the level buttons in all
// three.
//   meta      the terminal on top, and under it every space as a stick of
//             memory (role "rams"); the side column is the main stick
//             (0x00 @, all.js), every space and agent at once. follow
//             (the f under the sticks' +, ctrl-b f) shows each agent that
//             needs you, then the tab you were on again.
//   space     inside the current space: the terminal gets the room; the side
//             column has the STACK (every space, growing down from the top),
//             HEAP (this space's agents, growing up from the bottom), .rodata
//             (other machines) and GIT (its status; a click or ctrl-b g opens
//             lazygit). Spaces and tabs drag to reorder, here and in meta.
//   hunk      a hunk review in a tab of its own (hunk.js; ctrl-b r): the side
//             column narrows, lists the open reviews at its top, and the tab
//             you came from shows as a strip under the review (role "peek").
// The level comes from the live data: meta while shared "ram.zoom" says so,
// hunk while the shown tab is one of RAM's hunk tabs (its terminal is labelled
// ram.hunk), else space. The map copy (no role) sizes the layout's blocks to
// match (layouts/ram.json); role "hunk-menu" is the menu of reviews to open
// (a dialog).
// The model, exit history and git info are night-city's (model.js, git.js).
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, panes, terminals, props, run, theme, setAgentOrder, window, exec, hc,
  settings, openOverlay, shared, setShared, notify, nextCommand, home, layout } from "herdr";
import { scene, remember, confirm, towers } from "./model.js";
import { Git } from "./git.js";
import { AllStick } from "./all.js";
import { HUNK_LABEL, COMMANDS, labelOf, Sessions, entries, nameOf, HunkMenu, HUNK_ROW, HUNK_HEAD, ordered, hunkRow, marker } from "./hunk.js";
import { AMBER, CYAN, GOLD, GREEN, RED, ROM, ROM_LINE, ROM_BG, ROM_HOVER, U, CELL, LED, STATUS, RANK, ADDR, REF,
  stop, textW, terse, identity, shortcut, led, fault, marks, headGroup, navigating } from "./ui.js";

// The space sticks (regions) in meta, under the terminal.
const HEADER_H = 19 * U, LABELS_H = 13 * U, FRAME_H = 18 * U, BOTTOM_H = 21 * U, PINS_H = 6 * U, HEAP_H = 20 * U;
const BLOCK_H = 14 * U, KID_H = 12 * U, CHAR_W = 7 * U;
const REGION_MIN_W = 160 * U, REGION_MAX_W = 360 * U, REGION_GAP = 14 * U, NEW_W = 30 * U;
const SP_W = 24 * U, NUM_W = 26 * U, ARROW_W = 26 * U;
// The head of a frame's arrow (its line is a div): drawn, so it sits exactly on the line.
const ARROW_HEAD = "mods/ram/arrow.svg";
// A frame row in a narrow stick: its arrow shortens down to ARROW_MIN, then
// its blocks narrow; BLOCK_GAP is the row's gap. fitBlocks() keeps it all
// inside the stick. BLOCK_MIN / KID_MIN: a block with only its light.
const ARROW_MIN = 12 * U, BLOCK_GAP = 4 * U, BLOCK_MIN = 20 * U, KID_MIN = 19 * U;
// The "+n" that stands for the blocks that don't fit.
const moreW = n => textW(`+${n}`, 10 * U) + 2 * U;
// A frame's blocks in ROOM px (what's left of the row after SP and &n).
// ITEMS: each block's { natural, readable (a few letters of its name), least
// (its light only) } width. All at their own width when they fit, with the
// arrow as long as there's room (it gives way first, down to ARROW_MIN). Else
// as many as fit with a readable name, in order, sharing what's left up to
// their own widths, and +n for the rest; when not even one fits with a
// readable name, the first keeps just its light (and +n counts the rest).
// Returns { arrow, widths, more }.
export function fitBlocks(items, room) {
  const n = items.length;
  const span = (ws, more) => (ws.length ? BLOCK_GAP * ws.length + ws.reduce((sum, w) => sum + w, 0) : 0)
    + (more ? BLOCK_GAP + moreW(more) : 0);
  const natural = items.map(x => x.natural);
  if (span(natural, 0) <= room - ARROW_MIN)
    return { arrow: Math.min(ARROW_W, room - span(natural, 0)), widths: natural, more: 0 };
  const area = room - ARROW_MIN;
  let k = n;
  while (k > 0 && span(items.slice(0, k).map(x => x.readable), n - k) > area) k--;
  let widths = items.slice(0, k).map(x => x.readable);
  if (!k && n && span([items[0].least], n - 1) <= area) { k = 1; widths = [items[0].least]; }
  // What's left past those widths, shared out evenly up to each one's own width.
  let free = area - span(widths, n - k), open = widths.map((_, i) => i).filter(i => widths[i] < natural[i]);
  while (free > 0.01 && open.length) {
    const share = free / open.length;
    for (const i of open) { const add = Math.min(share, natural[i] - widths[i]); widths[i] += add; free -= add; }
    open = open.filter(i => widths[i] < natural[i] - 0.01);
  }
  return { arrow: Math.max(ARROW_MIN, Math.min(ARROW_W, room - span(widths, n - k))), widths, more: n - k };
}
// A stick's least height: its fixed parts and one frame (region() keeps to
// that). The ram-rams block's min (layouts/ram.json) leaves room for it and
// the padding around the sticks (24 * U).
const REGION_MIN_H = 110 * U;
// Fixed sizes: a space's chip on the strip, a region (it narrows when many
// don't fit), a level button. Names truncate; the full name is in the tooltip.
const CHIP_W = 118 * U, CHIP_H = 23 * U, REGION_W = 200 * U, LEVEL_W = 78 * U;
// The side column's fixed parts, as drawn, so it knows how much room is left
// for the stack and heap rows: GIT (its status line, then a line per file
// GIT_GAP apart), .rodata (its header, then a chip and its pins per machine)
// and the keys row. Each has a 1 px top border.
const GIT_PAD = 7 * U, GIT_GAP = 3 * U, GIT_TOP = 19 * U, GIT_LINE = 17 * U;
const KEY_H = 28 * U, KEY_PAD = 3 * U, KEYS_H = 1 + 2 * KEY_PAD + KEY_H;
const shownFiles = (g, max) => Math.min(g?.files?.length ?? 0, max);
const moreFiles = (g, shown) => (g.files?.length ?? 0) > shown || g.dirty > shown;
function gitHeight(g, max) {
  const files = shownFiles(g, max);
  const lines = g ? files + (moreFiles(g, files) ? 1 : 0) : 0;
  return 1 + 2 * GIT_PAD + GIT_TOP + lines * (GIT_GAP + GIT_LINE);
}
const machinesHeight = n => 1 + (12 + 18 + 33 * n) * U;
// A "+n more" row.
const MORE_H = 18 * U;
// How many of COUNT rows ROW_H px tall fit in BUDGET px (at least MIN): all,
// or some and, when it fits, a "+n more" row. A compact column keeps a row
// over the "+n more" row (its label counts them all anyway).
function fit(count, rowH, budget, compact, min = 0) {
  if (count * rowH <= budget) return { rows: count, more: false };
  let rows = Math.min(count, Math.max(min, Math.floor(budget / rowH)));
  if (!compact && rows > min && budget - rows * rowH < MORE_H) rows -= 1;
  return { rows, more: budget - rows * rowH >= MORE_H };
}
// The first ROWS of a list, swapping in the active one if it's further down,
// and then the one navigate mode is on (ALSO), so neither hides behind "+n more".
function pick(list, rows, also = null) {
  if (list.length <= rows) return list;
  const active = list.find(x => x.active), extra = also ? list.find(x => x.id === also && !x.active) : null;
  const must = [active, extra].filter(Boolean).slice(0, Math.max(0, rows));
  const rest = list.filter(x => !must.includes(x)).slice(0, Math.max(0, rows - must.length));
  const keep = new Set([...must, ...rest]);
  return list.filter(x => keep.has(x));
}
// What each level gives the layout's blocks (their ids are in layouts/ram.json).
// The side column is "sidebar", the id ctrl-b b (layout.toggle:sidebar) shows and hides.
// The strip (ram-map) is on top in every level. meta: the main stick in the
// side column, the terminal over the space sticks (ram-rams); hunk: the tab
// you came from as a strip under the review (ram-peek).
export const LEVELS = {
  meta: { map: { px: 74 }, side: 390, peek: false, rams: true },
  space: { map: { px: 74 }, side: 340, peek: false, rams: false },
  hunk: { map: { px: 74 }, side: 280, peek: true, rams: false },
};
// The side column's edge drags (the ram-work row is resizable), down to its
// min in layouts/ram.json. Each level keeps the width you dragged it to
// (shared "ram.side"); the strip's copy gives each level its width.
const SIDE_MIN = 240;
export function sideWidth(lvl) {
  const kept = Number(shared("ram.side")?.[lvl]);
  return Number.isFinite(kept) && kept >= SIDE_MIN ? kept : LEVELS[lvl].side;
}
// A node of the shown layout by id. layout() is live: a drag on an edge
// changes the node's size there, as Herdr's own sidebar mods read it.
function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
// The side column's width as the layout has it now (design px), or null.
const sidebarPx = () => {
  const px = Number(findNode(layout(), "sidebar")?.size?.px);
  return Number.isFinite(px) && px > 0 ? px : null;
};
// The model, without hunk's terminals: hunk reports itself like an agent,
// but a review isn't one (the HUNK list shows reviews).
const readScene = () => {
  const reviewTerms = labelled(HUNK_LABEL);
  return scene(spaces(), panes(), agents().filter(a => !reviewTerms.has(a.address) && a.app !== "hunk"), terminals());
};
const blockText = a => a.status === "dead" ? "freed" : a.status === "unavailable" ? "?"
  : (a.program?.name || (a.status === "mod" ? (a.title || "mod") : "sh"));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// The tools RAM opens in a tab of their own, at the space's repo top: lazygit
// (GIT's click, ctrl-b g) and hunk's reviews (hunk.js). Herdr starts them in the
// login shell; `exec` makes quitting them close the tab. RAM labels their
// terminals (ram.lazygit, ram.hunk).
const TOOLS = {
  lazygit: { name: "lazygit", argv: ["exec", "lazygit"], label: "ram.lazygit" },
};
const labelled = label => new Set(terminals().filter(t => t.labels?.[label]).map(t => t.address));
const runsIn = (tabId, addresses) => panes().some(p => p.tab === tabId && p.terminal && addresses.has(p.terminal));
const isLazygitTab = (tabId, lazygit = labelled(TOOLS.lazygit.label)) => runsIn(tabId, lazygit);
const isHunkTab = (tabId, reviews = labelled(HUNK_LABEL)) => runsIn(tabId, reviews);
// A tab RAM opened for a tool (not one of the space's own tabs).
const isToolTab = tabId => isLazygitTab(tabId) || isHunkTab(tabId);
const activeSpace = () => spaces().find(s => s.active);
// Room on the left for macOS's window buttons. They sit at the layout's
// traffic_lights spot in screen points and don't grow with zoom, so this is
// about 100 points whatever the zoom; other systems need only a margin.
const inset = () => window()?.platform === "macos" ? Math.ceil(100 / (settings()?.zoom || 1)) : 16 * U;
export function level() {
  if (shared("ram.zoom") === "meta") return "meta";
  const tab = activeSpace()?.tabs.find(t => t.active);
  return tab && isHunkTab(tab.id) ? "hunk" : "space";
}
// The tab a space was on before its hunk or lazygit tab: the one to go back to.
function workTab(s) {
  if (!s) return null;
  const from = shared("ram.from")?.[s.id];
  return s.tabs.find(t => t.id === from && !isToolTab(t.id)) ?? s.tabs.find(t => !isToolTab(t.id)) ?? null;
}
// A tool's tab is being opened (for 15 s at most, in case that was interrupted).
function opening() {
  const o = shared("ram.opening");
  return Boolean(o && Date.now() - (o.at ?? 0) < 15000);
}
// Every open review (hunk.js entries()).
const reviews = () => entries(shared("ram.hunk.sessions"), terminals(), panes(), spaces());

export default class Ram extends View {
  init(_props, cx) {
    this.size = { width: 1200, height: 160 };
    this.history = [];
    this.busy = false;
    this.lastCheck = 0;
    this.lastSaved = 0;
    this.applied = null;
    this.drag = null;
    this.peekLines = [];
    const role = props()?.role;
    if (role === "hunk-menu") { this.menuView = new HunkMenu(cx); return; }
    if (role === "peek") {
      cx.timer.every(1500, cx => this.readPeek(cx));
      return;
    }
    this.gitInfo = new Git();
    // Whose git each copy keeps: the side column every space's (in meta it is
    // the main stick, which lists them all, so it's ready when meta shows), the
    // space sticks (rams) every space's while meta shows them, and the strip
    // (the map copy) the current space's, for the tools it opens.
    cx.timer.every(250, cx => {
      if (role === "rams" && level() !== "meta") return;
      this.gitInfo.tick(role ? spaces() : spaces().filter(s => s.active), panes(), cx);
    });
    if (role === "side") {
      // Other machines, as Traveler lists them: `hc machine ls`, every 15 s.
      this.machines = [];
      this.refreshMachines(cx);
      cx.timer.every(15000, cx => { if (window()?.active) this.refreshMachines(cx); });
      // In meta this column is the main stick (all.js).
      this.all = new AllStick(this);
      return;
    }
    if (role === "rams") {
      // The space sticks show the agents that just ended too (their blocks
      // "freed"), from this exit history.
      try {
        const stored = JSON.parse(localStorage.getItem("ram.history.v1") ?? "[]");
        if (Array.isArray(stored)) this.history = stored;
      } catch (_) { this.history = []; }
      cx.timer.every(10000, cx => {
        if (!window()?.active || level() !== "meta") return;
        this.update(readScene());
        this.checkExits(cx);
        cx.notify();
      });
      return;
    }
    if (role) return;
    // A drag on the side column's edge is kept for the level it was made in
    // (watchSide, keepSide). Only an active window can be dragged.
    // follow's trip (where it took you, and the tab to go back to) and its
    // move back while that hasn't shown yet (follow(), goBack()).
    this.trip = null;
    this.backTo = null;
    cx.timer.every(250, () => {
      if (!window()?.active) return;
      this.watchSide(level());
      this.keepSide();
    });
    // The open hunk reviews: polled here, shared with the other copies as
    // "ram.hunk.sessions".
    this.sessions = new Sessions();
    cx.timer.every(1000, cx => {
      if (window()?.active) this.sessions.tick(cx, labelled(HUNK_LABEL).size > 0);
    });
    // Commands for keys or the CLI: ram.meta (every space; again: back into
    // the space), ram.space, ram.hunk (a review: the space's last one, else
    // the menu; again: back), ram.git (lazygit), ram.follow (meta's follow on
    // or off), ram.changes (the main stick's view), ram.zoom, ram.back.
    cx.spawn(async cx => {
      for (;;) {
        const c = await nextCommand();
        const s = activeSpace(), lvl = level();
        if (c === "meta" || c === "zoom") {
          if (lvl === "meta") this.enter(s?.id); else setShared("ram.zoom", "meta");
        } else if (c === "space") this.enter(s?.id);
        else if (c === "hunk" && s) this.goHunk(s);
        else if (c === "git" && s) this.openLazygit(s, cx);
        else if (c === "follow") this.toggleFollow();
        else if (c === "changes") {
          // The main stick's changes view; outside meta, meta with it.
          if (lvl !== "meta") { setShared("ram.all.mode", "changes"); setShared("ram.zoom", "meta"); }
          else setShared("ram.all.mode", shared("ram.all.mode") === "changes" ? "memory" : "changes");
        }
        else if (c === "back" && s) this.backToWork(s);
        cx.notify();
      }
    });
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter(m => !m.temporary);
      } catch (_) { /* keep the last list */ }
      cx.notify();
    });
  }

  update(data) {
    this.history = remember(this.history, data.list, [...data.rawByAddress.values()], Date.now());
    if (Date.now() - this.lastSaved >= 5000) this.save();
  }

  save() {
    localStorage.setItem("ram.history.v1", JSON.stringify(this.history));
    this.lastSaved = Date.now();
  }

  checkExits(cx) {
    if (this.busy || !window()?.active || Date.now() - this.lastCheck < 10000 ||
      !this.history.some(a => a.missing)) return;
    this.busy = true;
    this.lastCheck = Date.now();
    cx.spawn(async cx => {
      let listing = null;
      try {
        // Inherit the app's core session from its launch environment.
        const r = await exec("hc", ["ls", "--all", "--json"]);
        if (r.code === 0) listing = JSON.parse(r.stdout);
      } catch (_) { /* Missing, offline or malformed is unavailable, never proof of exit. */ }
      this.history = confirm(this.history, listing, Date.now());
      this.save();
      this.busy = false;
      cx.notify();
    });
  }

  // Animations pause while the window is inactive.
  motion() { return window()?.active === true; }

  // A command's key after the prefix ("d" for ^b d), from keys.json.
  key(command) { return shortcut(command).split(" ").slice(1).join(" "); }

  // A space's marker for its open hunk reviews (◆n), or null.
  marker(spaceId) { return marker(this.reviewCount?.get(spaceId) ?? 0); }

  // ---------------------------------------------------------------- levels

  // The map copy sizes the layout for the level it sees (once per change).
  // The side column gets the level's width (sideWidth()); a drag on its edge
  // that wasn't kept yet belongs to the level being left, so it's kept first.
  applyLevel(lvl, cx) {
    if (this.applied === lvl) return;
    if (this.applied) { this.watchSide(this.applied); this.keepSide(true); }
    this.applied = lvl;
    const L = LEVELS[lvl], side = sideWidth(lvl);
    this.sideWant = { px: side, at: Date.now() };
    cx.spawn(async () => {
      run("layout.resize", { id: "ram-map", ...L.map });
      run("layout.resize", { id: "sidebar", px: side });
      run(L.peek ? "layout.show" : "layout.hide", { id: "ram-peek" });
      run(L.rams ? "layout.show" : "layout.hide", { id: "ram-rams" });
    });
  }

  // Whether the side column's edge was dragged: the layout's width for it
  // moved away from where it settled after the level's own resize (that one
  // is waited for, up to 2 s, so it never counts as a drag).
  watchSide(lvl) {
    const px = sidebarPx();
    if (px === null || this.applied !== lvl) return;
    const want = this.sideWant;
    if (want) {
      if (Math.abs(px - want.px) >= 1 && Date.now() - want.at < 2000) return;
      this.sideWant = null;
      this.sideBase = px;
      return;
    }
    if (this.sideBase == null) this.sideBase = px;
    if (Math.abs(px - this.sideBase) < 1) { this.sideDrag = null; return; }
    const r = Math.round(px);
    if (this.sideDrag?.px !== r || this.sideDrag.level !== lvl) this.sideDrag = { level: lvl, px: r, at: Date.now() };
  }

  // Keep a dragged width for its level once it has held still (or NOW). The
  // level's own width needs no keeping: dragging back to it forgets the drag.
  keepSide(now = false) {
    const d = this.sideDrag;
    if (!d || (!now && Date.now() - d.at < 300)) return;
    this.sideDrag = null;
    this.sideBase = d.px;
    if (d.px < SIDE_MIN) return;
    const kept = { ...(shared("ram.side") ?? {}) };
    if (d.px === LEVELS[d.level].side) delete kept[d.level]; else kept[d.level] = d.px;
    setShared("ram.side", kept);
  }

  // Remember each space's last tab that isn't a tool's (hunk, lazygit), for the
  // peek strip and for going back. Skipped while a tool's tab is being opened.
  // When the tool tab that was shown closes (the tool quit), go back to that tab.
  trackWork(cx) {
    const s = activeSpace(), tab = s?.tabs.find(t => t.active);
    const was = this.shown;
    this.shown = s && tab ? { space: s.id, tab: tab.id, tool: isToolTab(tab.id) } : null;
    if (was?.tool && s?.id === was.space && !s.tabs.some(t => t.id === was.tab)) {
      const back = workTab(s);
      if (back && back.id !== tab?.id) cx.spawn(async () => run("tab.select", { id: back.id }));
      return;
    }
    // The review shown last in each space: ^b r goes back to it.
    if (s && tab && this.shown.tool && isHunkTab(tab.id)) {
      const last = shared("ram.hunk.last") ?? {};
      if (last[s.id] !== tab.id) cx.spawn(async () => setShared("ram.hunk.last", { ...last, [s.id]: tab.id }));
    }
    if (!s || !tab || opening() || this.shown.tool) return;
    const from = shared("ram.from") ?? {};
    if (from[s.id] === tab.id) return;
    cx.spawn(async () => setShared("ram.from", { ...from, [s.id]: tab.id }));
  }

  // Show a space (and one of its tabs) without changing the level: clicks in
  // meta stay in meta, so only the selection and the terminal below change.
  // A space showing a tool's tab goes back to the tab before it unless that
  // tab is what was clicked.
  go(spaceId, tabId) {
    if (!spaceId) return;
    run("space.select", { id: spaceId });
    const s = spaces().find(x => x.id === spaceId), shown = s?.tabs.find(t => t.active);
    if (tabId) run("tab.select", { id: tabId });
    else if (shown && isToolTab(shown.id)) {
      const back = workTab(s);
      if (back) run("tab.select", { id: back.id });
    }
  }

  // Go into a space: the space level (the space button, ^b i).
  enter(spaceId, tabId) {
    if (!spaceId) return;
    this.go(spaceId, tabId);
    setShared("ram.zoom", "space");
  }

  // Remember the tab a space is on (unless it's a tool's): the one to go back to.
  rememberWork(s) {
    const tab = s.tabs.find(t => t.active);
    if (tab && !isToolTab(tab.id)) setShared("ram.from", { ...(shared("ram.from") ?? {}), [s.id]: tab.id });
  }

  // A tool's tab in a space (TOOLS): select it, or open the tool in a new tab
  // at the space's repo top, named after it and labelled for RAM. Without a
  // repo, a toast says so (and nothing else changes).
  openTool(s, cx, kind) {
    const tool = TOOLS[kind];
    const open = s.tabs.find(t => isLazygitTab(t.id));
    const g = open ? null : this.gitInfo?.info(s, panes());
    if (!open && !g) { this.noRepo(s, g, tool); return; }
    this.rememberWork(s);
    setShared("ram.zoom", "space");
    if (open) { run("tab.select", { id: open.id }); return; }
    const top = g.top;
    if (!top || opening()) return;
    setShared("ram.opening", { space: s.id, at: Date.now() });
    cx.spawn(async cx => {
      const fail = body => notify({ title: `Couldn't open ${tool.name}`, body, level: "error" });
      try {
        const r = await exec("herdr-app", ["do", "tab.new", "--space", s.id, "--name", tool.name, "--folder", top,
          "--argv", JSON.stringify(tool.argv)]);
        let made = {};
        try { made = JSON.parse(r.stdout || "{}"); } catch (_) { made = {}; }
        if (r.code !== 0 || made.error || !made.terminal) fail(made.error || r.stderr.trim() || "herdr-app do tab.new failed");
        else await hc(["label", made.terminal, `${tool.label}=1`]);
      } catch (e) { fail(String(e?.message ?? e)); }
      setShared("ram.opening", null);
      cx.notify();
    });
  }

  openLazygit(s, cx) { this.openTool(s, cx, "lazygit"); }

  // ---------------------------------------------------------------- hunk (hunk.js)

  // ^b r, the r hunk button: back to your tab from a review; else the space's
  // review shown last (its last one), or the menu when it has none.
  goHunk(s) {
    if (!s) return;
    if (level() === "hunk") { this.backToWork(s); return; }
    const tabs = s.tabs.filter(t => isHunkTab(t.id));
    if (!tabs.length) { this.hunkMenu(s); return; }
    const last = shared("ram.hunk.last")?.[s.id];
    const tab = tabs.find(t => t.id === last) ?? tabs.at(-1);
    this.rememberWork(s);
    setShared("ram.zoom", "space");
    run("tab.select", { id: tab.id });
  }

  // The menu of what to open (a dialog: this mod, role hunk-menu). It needs the
  // space's repo; without one a note says so.
  hunkMenu(s) {
    if (!s) return;
    const g = this.gitInfo?.info(s, panes());
    if (!g) { this.noRepo(s, g, { name: "hunk" }); return; }
    openOverlay({ mod: "ram", kind: "dialog", width: 470, height: 290,
      props: { role: "hunk-menu", space: s.id, name: s.name, repo: g.name } });
  }

  // What the menu picked (shared "ram.hunk.open", taken once, fresh ones only):
  // a new tab at the space's repo running hunk, named after what it shows,
  // labelled ram.hunk=<what>, and moved to the end so the space's own tabs keep
  // their numbers. A plain diff loads the repo's saved notes (.hunk/notes.json)
  // when there are some, as hunk-open does.
  takeHunkRequest(cx) {
    const req = shared("ram.hunk.open");
    if (!req || req.at === this.hunkReq || Date.now() - (req.at ?? 0) > 10000) return;
    this.hunkReq = req.at;
    cx.spawn(async () => setShared("ram.hunk.open", null));
    this.openHunk(req, cx);
  }

  openHunk(req, cx) {
    const s = spaces().find(x => x.id === req.space) ?? activeSpace();
    const cmd = COMMANDS.find(c => c.id === req.cmd) ?? COMMANDS[0];
    const g = s ? this.gitInfo?.info(s, panes()) : null;
    if (!s) return;
    if (!g) { this.noRepo(s, g, { name: "hunk" }); return; }
    if (opening()) return;
    const ref = cmd.ref ? String(req.ref ?? "").trim() : "";
    const label = labelOf(cmd, ref), last = s.tabs.length + 1;
    this.rememberWork(s);
    setShared("ram.zoom", "space");
    setShared("ram.opening", { space: s.id, at: Date.now() });
    cx.spawn(async cx => {
      const fail = body => notify({ title: "Couldn't open hunk", body, level: "error" });
      try {
        let args = cmd.args(ref);
        if (cmd.notes && !ref) {
          const f = await exec("test", ["-f", `${g.top}/.hunk/notes.json`], { on: s.machine ?? null });
          if (f.code === 0) args = [...args, "--agent-context", ".hunk/notes.json", "--agent-notes"];
        }
        const r = await exec("herdr-app", ["do", "tab.new", "--space", s.id, "--name", `hunk ${label}`, "--folder", g.top,
          "--argv", JSON.stringify(["exec", "hunk", ...args])]);
        let made = {};
        try { made = JSON.parse(r.stdout || "{}"); } catch (_) { made = {}; }
        if (r.code !== 0 || made.error || !made.terminal) fail(made.error || r.stderr.trim() || "herdr-app do tab.new failed");
        else {
          await hc(["label", made.terminal, `${HUNK_LABEL}=${label}`]);
          if (made.tab) run("tab.move", { id: made.tab, index: last });
          this.sessions?.soon();
        }
      } catch (e) { fail(String(e?.message ?? e)); }
      setShared("ram.opening", null);
      cx.notify();
    });
  }

  // A review's x (its row in the HUNK list, while the pointer is on it):
  // closes its tab, after asking when it has notes (they go with it unless
  // saved with /hunk save).
  closeHunk(id, e, size, shown) {
    const t = theme(), notes = (e.mine ?? 0) + (e.agent ?? 0);
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(2)
      .text_color(shown ? t.muted : "#00000000")
      .when(shown, el => el.cursor_pointer().hover(st => st.bg(t.hover).text_color(RED)).tooltip("Close this review"))
      .on_mouse_down("left", (_e, cx) => { if (shown) cx.stop_propagation(); })
      .on_click((_e, cx) => {
        if (!shown) return;
        cx.stop_propagation();
        if (!notes) { run("tab.close", { id: e.tab }); return; }
        openOverlay({ mod: "confirm", kind: "dialog", width: 440, height: 180, props: {
          title: `Close hunk ${nameOf(e)}?`,
          detail: `Its ${notes} ${notes === 1 ? "note goes" : "notes go"} with it, unless saved first (/hunk save).`,
          command: { name: "tab.close", args: { id: e.tab, confirmed: true } } } });
      })
      .child(svg("mods/pane/close.svg").size(size * 0.7));
  }

  // The open reviews per space, for the markers (counted once per render).
  countReviews() {
    const n = new Map();
    for (const e of reviews()) if (e.space) n.set(e.space, (n.get(e.space) ?? 0) + 1);
    this.reviewCount = n;
  }

  // ^b g, GIT or ^b r where there's no repo: say so. G undefined: its folders
  // haven't all been looked at yet (it takes a moment after a cd).
  noRepo(s, g, tool) {
    const folder = this.gitInfo?.folders(s, panes())[0] ?? s.folder ?? "";
    const where = folder && folder.startsWith(home()) ? "~" + folder.slice(home().length) : folder || s.name;
    if (g === undefined) notify({ title: "Checking git", body: `Still looking at ${where}. Try again in a moment.`, level: "info", timeout: 3000 });
    else notify({ title: "Not a git repo", body: `${where} isn't in a git repository, so ${tool.name} has nothing to open.`, level: "info", timeout: 4000 });
  }

  backToWork(s) {
    const tab = workTab(s);
    if (tab) run("tab.select", { id: tab.id });
  }

  // follow (meta: the f button, ^b f). On: shared "ram.follow".
  toggleFollow() {
    const on = shared("ram.follow") !== true;
    setShared("ram.follow", on);
    if (on && level() !== "meta") setShared("ram.zoom", "meta");
  }

  // With follow on in meta, an agent that starts needing you is shown: its
  // space and tab, so the region lights up and the terminal below is that
  // agent. While the agent in the shown tab needs you too, follow waits, and
  // moves on to the next once you've answered (the one waiting longest first).
  // When you answer the last one, it goes straight back to the tab you were on
  // before its first move (this.trip), unless that tab has closed: then you
  // stay. An agent that asks again is shown again at once, even if it asks
  // before the move back has shown (this.backTo). It only acts on those
  // changes, so picking a tab yourself is never undone: that also drops a
  // wait and the way back. The main stick never moves.
  follow(data, cx) {
    const on = shared("ram.follow") === true && level() === "meta";
    const now = new Map(data.list.filter(a => a.status === "blocked" && !a.child && a.pane)
      .map(a => [a.address, a.status_ms ?? 0]));
    // Turning follow on counts every agent that needs you as new.
    const seen = on && !this.followOn ? new Map() : this.followSeen ?? new Map();
    this.followSeen = now;
    this.followOn = on;
    if (!on) { this.followWait = null; this.trip = null; this.backTo = null; return; }
    const s = activeSpace(), tab = s?.tabs.find(t => t.active);
    // The move back hasn't shown yet: nothing is decided on the tab it's
    // leaving. Once it shows (or 3 s on, if it never does), follow looks at
    // everything that needs you again, so an ask in between isn't missed.
    let again = false;
    if (this.backTo) {
      if (tab?.id !== this.backTo.tab && Date.now() - this.backTo.sent < 3000) return;
      this.backTo = null;
      again = true;
    }
    this.watchTrip(tab);
    // On the tab follow took you to, with nothing needing you any more (you
    // answered, or it was answered before you got there): straight back.
    if (this.trip?.arrived && !now.size) { this.followWait = null; this.goBack(cx); return; }
    if (this.followWait && tab?.id !== this.followWait) this.followWait = null;
    const fresh = [...now].some(([address, ms]) => seen.get(address) !== ms);
    const answered = [...seen.keys()].some(address => !now.has(address));
    if (!fresh && !answered && !this.followWait && !again) return;
    const blocked = data.list.filter(a => now.has(a.address));
    if (!blocked.length) { this.followWait = null; return; }
    if (tab && blocked.some(a => a.tab === tab.id)) { this.followWait = tab.id; return; }
    this.followWait = null;
    const next = blocked.sort((a, b) => (a.status_ms ?? 0) - (b.status_ms ?? 0) || a.address.localeCompare(b.address))[0];
    // The first move remembers where you were; the moves after it keep that.
    if (!this.trip && s && tab) this.trip = { home: { space: s.id, tab: tab.id } };
    if (this.trip) Object.assign(this.trip, { to: next.tab, arrived: false, sent: Date.now() });
    cx.spawn(async () => run("agent.focus", { terminal: next.address }));
  }

  // The tab follow's last move went to: arrived once it shows. Any other tab
  // after that (or 3 s on, if the move never landed) is your own pick, so
  // follow won't take you back.
  watchTrip(tab) {
    const trip = this.trip;
    if (!trip) return;
    if (tab && tab.id === trip.to) { trip.arrived = true; return; }
    if (trip.arrived || Date.now() - trip.sent > 3000) this.trip = null;
  }

  // You answered the last agent that needed you, on the tab follow took you
  // to (or it was answered before you got there): back to the tab you were on
  // before its first move. You stay where you are when that tab has closed.
  goBack(cx) {
    const trip = this.trip;
    this.trip = null;
    const home = spaces().find(x => x.id === trip.home.space);
    if (!home?.tabs.some(t => t.id === trip.home.tab)) return;
    this.backTo = { tab: trip.home.tab, sent: Date.now() };
    cx.spawn(async () => this.go(home.id, trip.home.tab));
  }

  goMeta() {
    if (level() === "meta") this.enter(activeSpace()?.id); else setShared("ram.zoom", "meta");
  }

  // From another space (the map): show that space, then its lazygit tab.
  openLazygitIn(s, cx) {
    if (!s.active) run("space.select", { id: s.id });
    this.openLazygit(spaces().find(x => x.id === s.id) ?? s, cx);
  }

  // The three levels, top right: ctrl-b then the key on each button (from
  // keys.json, so they always match), the current one lit.
  levelButtons() {
    const t = theme(), lvl = level(), s = activeSpace();
    const repo = Boolean(s && this.gitInfo?.info(s, panes()));
    const key = command => shortcut(command).split(" ").slice(1).join(" ");
    const prefix = terse(shortcut("ram.meta").split(" ")[0]);
    const button = (id, name, k, here, enabled, action, tip) => h_flex().id(id).w(LEVEL_W).h(26 * U).px(8 * U).gap(6 * U).flex_none()
      .items_center().justify_center().rounded(2).border(1).border_color(here ? AMBER : t.input).when(here, el => el.bg(AMBER + "1f"))
      .cursor_pointer().hover(st => st.bg(t.hover)).tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) action(cx); })
      .when(Boolean(k), el => el.child(div().text_size(12 * U).font_semibold().text_color(enabled ? AMBER : t.dim).child(k)))
      .child(div().text_size(12 * U).text_color(here ? AMBER : enabled ? t.foreground : t.dim).child(name));
    return h_flex().id("ram-levels").flex_none().gap(6 * U).items_center()
      .when(Boolean(prefix), el => el.child(div().text_size(11 * U).text_color(t.dim).child(prefix)))
      .child(button("ram-level-meta", "meta", key("ram.meta"), lvl === "meta", true,
        () => this.goMeta(), "Meta: every space at once"))
      .child(button("ram-level-space", "space", key("ram.space"), lvl === "space", Boolean(s),
        () => this.enter(s?.id), s ? `Inside ${s.name}` : "No space yet"))
      .child(button("ram-level-hunk", "hunk", key("ram.hunk"), lvl === "hunk", repo || lvl === "hunk" || Boolean(s?.tabs.some(t => isHunkTab(t.id))),
        () => this.goHunk(s), lvl === "hunk" ? "Back to your tab (the review stays open)"
          : repo ? "hunk: review this space's changes" : "hunk needs a git repo"));
  }

  // ---------------------------------------------------------------- shared parts

  control(id, label, action) {
    const t = theme();
    return div().id(id).px(9 * U).h(24 * U).flex_none().rounded(3).flex().items_center()
      .border(1).border_color(t.border).text_size(12 * U).text_color(t.foreground)
      .cursor_pointer().hover(s => s.bg(t.raised))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); action(); }).child(label);
  }

  // A small button: 22 x 15, or a square of `side` px.
  mini(id, label, tip, action, side = null) {
    const t = theme();
    return div().id(id).w(side ?? 22 * U).h(side ?? 15 * U).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_color(t.input).text_size((side ? 13 : 12) * U).text_color(t.muted).cursor_pointer().tooltip(tip)
      .hover(st => st.bg(t.hover).text_color(AMBER))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); action(cx); }).child(label);
  }

  windowButtons() {
    if (!window()?.buttons) return [];
    return [["min", "_", "window.minimize"], ["max", "[]", "window.maximize"], ["close", "x", "window.close"]]
      .map(([id, text, command]) => this.control(`ram-${id}`, text, () => run(command)));
  }

  newSpace(size = NEW_W) {
    const t = theme();
    return div().id("ram-new-space").w(size).h(size).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_dashed().border_color(t.input).text_size(15 * U).text_color(t.muted).cursor_pointer()
      .hover(st => st.bg(t.hover).text_color(AMBER)).tooltip("New space")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); run("space.new"); }).child("+");
  }

  // follow's switch: a square under meta's + (follow only works in meta), its
  // letter the key after ctrl-b, lit while it's on.
  followButton(size = NEW_W) {
    const t = theme(), on = shared("ram.follow") === true, k = shortcut("ram.follow");
    const tip = (on ? "follow is on: each agent that needs you shows here, then your tab again (click to stop)"
      : "follow: show each agent that needs you, then go back to your tab") + (k ? "  " + terse(k) : "");
    return div().id("ram-follow").w(size).h(size).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).when(on, el => el.bg(AMBER + "1f"))
      .text_size(13 * U).font_semibold().text_color(on ? AMBER : t.muted).cursor_pointer()
      .hover(st => st.bg(t.hover).text_color(AMBER)).tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.toggleFollow(); }).child(this.key("ram.follow") || "f");
  }

  menu(spec, cx) {
    cx.stop_propagation();
    openOverlay({ mod: "menu", kind: "popup", width: 200, ...spec });
  }

  // + for a space's tabs: push a frame (the new-tab menu in that space).
  // A square of SIDE px.
  pushTab(s, side) {
    return this.mini(`tab-new-${s.id}`, "+", `Push a frame: new tab in ${s.name}`, () => {
      run("space.select", { id: s.id });
      openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 });
    }, side);
  }

  // A tab's own x, shown while the pointer is on that tab: closes it, as
  // Herdr's tab bar does (Herdr asks first only for a space's last tab).
  // Hidden, its spot is part of the tab (a click there shows the tab).
  closeX(id, tabId, size, shown) {
    const t = theme();
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(2)
      .text_color(shown ? t.muted : "#00000000")
      .when(shown, el => el.cursor_pointer().hover(st => st.bg(t.hover).text_color(RED)).tooltip("Close this tab"))
      .on_mouse_down("left", (_e, cx) => { if (shown) cx.stop_propagation(); })
      .on_click((_e, cx) => { if (!shown) return; cx.stop_propagation(); run("tab.close", { id: tabId }); })
      .child(svg("mods/pane/close.svg").size(size * 0.7));
  }

  // Which tab the pointer is on (its x shows).
  hovering(id) {
    return (hovered, cx) => {
      if (hovered) this.hoverTab = id;
      else if (this.hoverTab === id) this.hoverTab = null;
      cx.notify();
    };
  }

  // ---------------------------------------------------------------- drag to reorder

  // As Herdr's own lists do it: press a space (or a tab), move onto another of
  // its group (spaces on the same machine, tabs of the same space) and let go
  // there to move it to that spot. A line shows where it will land; a click
  // without moving still just goes in. this.drag = { kind, id, group, over }.
  grab(kind, id, group) { this.drag = { kind, id, group, over: id }; }

  // A space or tab others can be dropped on: MOVE(from) puts FROM at its spot.
  droppable(el, kind, id, group, move) {
    return el
      .on_mouse_move((_e, cx) => {
        const d = this.drag;
        if (!d || d.kind !== kind) return;
        const over = d.group === group ? id : null;
        if (d.over !== over) { d.over = over; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const d = this.drag;
        if (!d || d.kind !== kind) return;
        this.drag = null;
        if (d.over === id && d.id !== id) move(d.id);
        cx.notify();
      });
  }

  // While dragging, the dragged one dims and the one under the pointer gets a
  // line on the side it will land: before it when moving up (or left), after
  // it otherwise. ORDER: the ids as they are now. AXIS: "y" a column, "x" a row.
  dragMarks(el, kind, id, order, axis) {
    const d = this.drag;
    if (!d || d.kind !== kind || d.over === d.id) return el;
    if (d.id === id) return el.opacity(0.5);
    if (d.over !== id) return el;
    const before = order.indexOf(d.id) > order.indexOf(id);
    const line = div().absolute().bg(AMBER);
    return el.child(axis === "y"
      ? line.left(0).right(0).h(2).when(before, l => l.top(0)).when(!before, l => l.bottom(0))
      : line.top(0).bottom(0).w(2).when(before, l => l.left(0)).when(!before, l => l.right(0)));
  }

  moveSpace(from, to) {
    const index = spaces().findIndex(x => x.id === to);
    if (index !== -1) run("space.move", { id: from, index: index + 1 });
  }

  moveTab(spaceId, from, to) {
    const index = spaces().find(x => x.id === spaceId)?.tabs.findIndex(x => x.id === to) ?? -1;
    if (index !== -1) run("tab.move", { id: from, index: index + 1 });
  }

  open(a) {
    if (a.status === "dead" || a.status === "unavailable") return;
    if (a.child) run("terminal.peek", { terminal: a.address });
    else if (a.address && !["shell", "mod"].includes(a.status)) run("agent.focus", { terminal: a.address });
    else if (a.pane) run("pane.focus", { pane: a.pane });
  }

  // ---------------------------------------------------------------- meta: the space sticks

  // A block's own width: room for its light and its name, up to CHARS letters.
  blockW(a, small = false, chars = small ? 6 : 12) {
    return (small ? 10 : 18) * U + Math.min(chars, blockText(a).length) * CHAR_W;
  }

  // One heap block on the map: an agent, a terminal or a mod running in a tab.
  // WIDTH: as fitBlocks() gave it room (its name truncates), else its own.
  block(a, data, small = false, width = null) {
    const t = theme(), state = a.status ?? "shell";
    return h_flex().id(`block-${a.address || a.pane}`).h(small ? KID_H : BLOCK_H).w(width ?? this.blockW(a, small)).flex_none()
      .px(4 * U).gap(4 * U).items_center().rounded(2).overflow_hidden()
      .bg(CELL[state] ?? CELL.shell).border(1).border_color(a.focused ? AMBER : (LED[state] ?? LED.shell) + "66")
      .tooltip(identity(a))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.open(a); })
      .child(led(a, small ? 5 : 6, this.motion()))
      .child(div().min_w(0).truncate().text_size((small ? 10 : 11) * U)
        .text_color(state === "blocked" ? "#ffd0d4" : state === "dead" ? t.dim : t.foreground).child(blockText(a)));
  }

  // Wide enough for its name, its widest frame and its git line (up to a cap).
  regionWidth(s, data, sum) {
    const kids = a => (data.descendants.get(a.address) ?? []).reduce((m, k) => m + this.blockW(k, true) + 4 * U, 0);
    const row = f => SP_W + NUM_W + ARROW_W + 14 * U + f.windows.reduce((n, a) => n + this.blockW(a) + 4 * U + kids(a), 0);
    const head = (64 + Math.min(28, (s.name || "").length) * 7.5) * U;
    const words = [sum?.head?.text, ...(sum?.marks ?? []).map(m => m.short)].filter(Boolean);
    const foot = 12 * U + words.reduce((n, w) => n + w.length * CHAR_W + 6 * U, 0) + 2 * (22 + 6) * U;
    return Math.min(REGION_MAX_W, Math.max(REGION_MIN_W, head, foot, ...s.floors.map(row)));
  }

  // A space as a stick of memory, as tall as its block: STACK frames (tabs,
  // each pointing at its blocks) from the top, free space, HEAP (its agents, the
  // oldest at the bottom) growing up, its git line, and the gold pins.
  region(s, i, data, width, sum, height) {
    const t = theme(), live = data.spaces.find(x => x.id === s.id);
    const blocked = data.blockers.filter(a => a.space === s.id).length;
    // Every row fits inside the stick: its border (1 px each side) and a row's
    // padding (6 * U each side) leave INNER px, and each row's parts are sized
    // to it here, so nothing is cut off at the stick's edge.
    const inner = width - 2 - 12 * U, GAP = 6 * U;
    // The header: address, name (a few letters at least), ◆n, @machine, faults.
    // In a narrow stick FAULT n becomes !n, then @machine truncates and goes
    // (the tooltip and the dashed outline still say where the space is).
    const mark = this.marker(s.id), markW = mark ? textW(`\u25c6${this.reviewCount?.get(s.id) ?? 0}`, 10 * U) + 2 * U : 0;
    const faultW = compact => textW(compact ? `!${blocked}` : `FAULT ${blocked}`, (compact ? 10 : 10.5) * U) + (compact ? 6 : 8) * U + 2;
    const headUsed = compact => textW(ADDR(i), 11 * U) + GAP + Math.min(textW(s.name ?? "", 12 * U), textW("abc", 12 * U))
      + (mark ? GAP + markW : 0) + (blocked ? GAP + faultW(compact) : 0);
    const tight = blocked > 0 && headUsed(false) > inner;
    const machineW = s.machine ? Math.min(textW(`@${s.machine}`, 10.5 * U), 70 * U, inner - headUsed(tight) - GAP) : 0;
    const header = h_flex().id(`head-${s.id}`).h(HEADER_H).flex_none().px(6 * U).gap(GAP).items_center().border_b(1).border_color(t.border)
      .cursor_pointer().tooltip(`${ADDR(i)} ${s.name}${s.machine ? " @" + s.machine : ""}: show it (drag to move it)`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (live) this.grab("space", s.id, s.machine ?? ""); })
      .on_click(() => { if (live) this.go(s.id); })
      .child(div().flex_none().text_size(11 * U).text_color(CYAN).child(ADDR(i)))
      .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(s.active ? AMBER : t.foreground).child(s.name))
      .children(mark ? [mark] : [])
      .when(machineW >= textW("@ab", 10.5 * U), el => el.child(div().flex_none().max_w(machineW).truncate().text_size(10.5 * U)
        .text_color(t.dim).child(`@${s.machine}`)))
      .when(blocked > 0, el => el.child(fault(blocked, tight)));
    const label = text => div().h(LABELS_H).flex_none().px(6 * U).text_size(10 * U).text_color(t.dim).child(text);
    // What fits: frames get up to 55% of the room (the shown one always
    // stays), the heap what's left (the ones that need you first). A "+n more"
    // row only where it fits: both labels count them all.
    const born = a => data.rawByAddress.get(a.address)?.created_ms ?? 0;
    const heap = data.list.filter(a => a.space === s.id).sort((a, b) => born(b) - born(a));
    const room = Math.max(0, height - (HEADER_H + 2 * LABELS_H + BOTTOM_H + PINS_H + 20 * U));
    const fr = fit(s.floors.length, FRAME_H, room * 0.55, false, 1);
    const floors = pick(s.floors, fr.rows), hidden = fr.more ? s.floors.length - floors.length : 0;
    const hp = fit(heap.length, HEAP_H, room - (floors.length + (hidden ? 1 : 0)) * FRAME_H, false);
    const keep = new Set([...new Set([...heap.filter(a => a.status === "blocked"), ...heap])].slice(0, hp.rows));
    const shownHeap = heap.filter(a => keep.has(a));
    // A frame row: SP, &n, then the arrow and the blocks (fitBlocks).
    const frameRoom = inner - SP_W - NUM_W - 2 * BLOCK_GAP;
    const frames = floors.map(f => {
      const real = live && live.tabs?.some(x => x.id === f.id), here = f.active && s.active;
      const running = f.windows.some(a => a.status === "working");
      const lazygit = Boolean(real && isLazygitTab(f.id));
      const items = lazygit ? [] : f.windows.flatMap(a => [{ a, small: false },
        ...(data.descendants.get(a.address) ?? []).map(kid => ({ a: kid, small: true }))]);
      const fitted = fitBlocks(items.map(x => ({ natural: this.blockW(x.a, x.small), readable: this.blockW(x.a, x.small, 3),
        least: x.small ? KID_MIN : BLOCK_MIN })), frameRoom);
      const arrowW = fitted.arrow;
      const sp = div().w(SP_W).flex_none().text_size(10.5 * U).text_color(here ? AMBER : AMBER + "80").child(f.active ? "SP\u25b8" : "");
      if (here && this.motion()) sp.loop("opacity", { from: 0.3, to: 1, period: 1000 });
      // The arrow from &n to its blocks: a line, then the drawn head (it carries the
      // line on to its tip), both centered on the row so they meet; a working tab
      // sends a green dot along it.
      const arrow = h_flex().relative().w(arrowW).h(FRAME_H).flex_none().items_center()
        .child(div().flex_1().h(1 * U).bg(t.dim))
        .child(svg(ARROW_HEAD).w(5 * U).h(8 * U).flex_none().text_color(t.dim));
      if (running && this.motion()) arrow.child(div().absolute().top(FRAME_H / 2 - 2 * U).size(4 * U).rounded_full().bg(GREEN)
        .loop("left", { from: 0, to: arrowW - 9 * U, period: 900 }));
      const row = h_flex().id(`frame-${f.id}`).relative().h(FRAME_H).flex_none().px(6 * U).gap(BLOCK_GAP).items_center().overflow_hidden()
        .when(here, el => el.bg(AMBER + "14"))
        .when(Boolean(real), el => el.on_hover(this.hovering(f.id)))
        .tooltip(`${s.name} / ${f.name}${!real ? " (closed)" : f.settled ? " (settled)" : ""}`)
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (real) this.grab("tab", f.id, s.id); })
        .on_click(() => { if (real) this.go(s.id, f.id); })
        .when(Boolean(real), el => el.on_mouse_down("right", (_e, cx) =>
          this.menu({ props: { tab: "tab", target: { id: f.id, space: s.id } } }, cx)))
        .child(sp)
        .child(div().w(NUM_W).flex_none().text_size(11 * U).text_color(here ? AMBER : f.active ? AMBER + "80" : t.dim).child(REF(f.index, f.active)))
        .child(arrow);
      if (lazygit) row.child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(CYAN).child("lazygit"));
      fitted.widths.forEach((w, k) => row.child(this.block(items[k].a, data, items[k].small, w)));
      if (fitted.more) {
        const left = items.slice(fitted.widths.length).map(x => blockText(x.a));
        row.child(div().id(`more-${f.id}`).w(moreW(fitted.more)).flex_none().text_size(10 * U).text_color(t.dim)
          .tooltip(`${fitted.more} more: ${left.join(", ")}`).child(`+${fitted.more}`));
      }
      if (real && this.hoverTab === f.id) row.child(div().absolute().right(2 * U).top(1 * U).bg(t.background).rounded(2)
        .child(this.closeX(`framex-${f.id}`, f.id, FRAME_H - 2 * U, true)));
      if (!real) return row;
      return this.dragMarks(this.droppable(row, "tab", f.id, s.id, from => this.moveTab(s.id, from, f.id)),
        "tab", f.id, live.tabs.map(x => x.id), "y");
    });
    const shownTab = live?.tabs?.find(x => x.active)?.id;
    const heapRows = shownHeap.map(a => {
      const red = a.status === "blocked", mine = a.tab === shownTab;
      const ref = REF(a.tab_index, mine), name = `${a.program?.name || "agent"}${a.child ? " \u21b3" : ""}`, status = STATUS[a.status] ?? "";
      // Its light, &n, name, what it's doing and its state, in INNER px: in a
      // narrow stick the state's word goes first (the light and the row's color
      // still say it, the tooltip in words), then the name truncates.
      const nameW = Math.min(textW(name, 11.5 * U), 110 * U), statusW = status ? textW(status, 10.5 * U) : 0;
      const fixed = n => 6 * U + textW(ref, 10.5 * U) + n * GAP;
      const showStatus = Boolean(status) && inner - fixed(4) - statusW >= Math.min(nameW, textW("abc", 11.5 * U));
      const nameMax = Math.max(0, Math.min(110 * U, inner - (showStatus ? fixed(4) + statusW : fixed(3))));
      return h_flex().id(`alloc-${a.address}`).h(HEAP_H).flex_none().px(6 * U).gap(GAP).items_center().cursor_pointer()
        .when(red, el => el.bg("#2a0f14")).hover(st => st.bg(red ? "#3a1520" : t.hover))
        .tooltip(identity(a))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.open(a); })
        .child(led(a, 6, this.motion()))
        .child(div().flex_none().text_size(10.5 * U).text_color(mine && s.active ? AMBER : t.dim).child(ref))
        .child(div().flex_none().max_w(nameMax).truncate().text_size(11.5 * U).text_color(red ? "#ffd0d4" : t.foreground).child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(besides(a)))
        .when(showStatus, el => el.child(div().flex_none().text_size(10.5 * U).text_color(red ? RED : t[a.status] ?? t.dim).child(status)));
    });
    const more = (n, what) => div().h(FRAME_H).flex_none().px(6 * U).flex().items_center().text_size(10 * U).text_color(t.dim).child(`+${n} more ${what}`);
    // Its git as marks (↑2 ±3 ⌂, or ✓); the tooltip says them in words on one line.
    const repo = Boolean(live && sum?.repo);
    const bottom = h_flex().h(BOTTOM_H).flex_none().px(6 * U).gap(6 * U).items_center().border_t(1).border_color(t.border)
      .child(h_flex().id(`git-${s.id}`).flex_1().min_w(0).h_full().gap(6 * U).items_center().overflow_hidden().text_size(11 * U)
        .when(repo, el => el.cursor_pointer().hover(st => st.bg(t.hover)).tooltip(`${sum.tip} \u00b7 click: lazygit`)
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); this.openLazygitIn(live, cx); }))
        .when(Boolean(sum?.head?.text), el => el.child(headGroup(sum.head, t.muted)))
        .children(marks(sum)))
      .when(Boolean(live), el => el.child(this.pushTab(s, 17 * U)));
    // Its outline: cyan while ^b w's navigate mode is on it, amber for the space you're in.
    const box = v_flex().relative().w(width).flex_1().min_h(0).rounded(2).bg(s.active ? "#0f1c15" : "#0b130f")
      .border(1).border_color(navigating() === s.id ? CYAN : s.active ? AMBER : t.border)
      .when(Boolean(s.machine), el => el.border_dashed())
      .child(header).child(label(`STACK \u2193  ${s.floors.length}`)).children(frames)
      .when(hidden > 0, el => el.child(more(hidden, "frames")))
      .child(div().flex_1().min_h(4 * U).flex().items_center().px(12 * U)
        .child(div().w_full().h(0).border_t(1).border_dashed().border_color(t.border)))
      .children(heapRows)
      .when(hp.more && heap.length > shownHeap.length, el => el.child(more(heap.length - shownHeap.length, "blocks")))
      .child(label(`HEAP \u2191${heap.length ? "  " + heap.length : ""}`))
      .child(div().h(8 * U).flex_none())
      .child(bottom);
    if (blocked) {
      // A fault: the region's outline flashes red.
      const flash = div().absolute().top(0).left(0).w(width).h_full().rounded(2).border(1).border_color(RED);
      if (this.motion()) flash.loop("opacity", { from: 0.15, to: 1, period: 900 });
      box.child(flash);
    }
    // Gold contact pins along the bottom edge, with the key notch.
    const n = Math.max(0, Math.floor((width - 16) / 6)), notch = Math.floor(n * 0.4);
    const pins = h_flex().h(PINS_H).flex_none().px(8 * U).gap(3 * U)
      .children(Array.from({ length: n }, (_, k) => div().w(3 * U).h(PINS_H).flex_none().bg(k === notch || k === notch + 1 ? "#00000000" : GOLD)));
    const region = v_flex().id(`region-${s.id}`).relative().w(width).h(height).flex_none().gap(0)
      .when(Boolean(live), el => el.on_mouse_down("right", (_e, cx) =>
        this.menu({ height: 260, props: { tab: "space", target: { id: s.id } } }, cx)))
      .child(box).child(pins);
    // Drag a region by its name onto another to move that space there.
    if (!live) return region;
    return this.dragMarks(this.droppable(region, "space", s.id, s.machine ?? "", from => this.moveSpace(from, s.id)),
      "space", s.id, data.spaces.map(x => x.id), "x");
  }

  // Sizes come in screen points; the parts are drawn in px that zoom scales.
  // Each copy's root: its size (in design px), and a drag ends when the button
  // goes up anywhere in it (not on a spot to drop) or the pointer leaves it.
  sized(el) {
    const off = cx => { if (this.drag) { this.drag = null; cx.notify(); } };
    return el.on_size_change((size, cx) => {
      const z = settings()?.zoom || 1, w = size.width / z, h = size.height / z;
      if (w !== this.size.width || h !== this.size.height) { this.size = { width: w, height: h }; cx.notify(); }
    })
      .on_mouse_up("left", (_e, cx) => off(cx))
      .on_hover((hovered, cx) => { if (!hovered) off(cx); });
  }

  // meta, under the terminal: every space as a stick of memory, side by side,
  // as tall as this block, all the same width (narrowing to 80% of the least
  // before they scroll sideways); a scan line sweeps across. The main stick
  // (0x00 @) is the side column in meta (metaSide()).
  rams(cx) {
    const t = theme(), ps = panes(), data = readScene();
    // The exit history only shows here (agents that just ended, as "freed").
    this.update(data);
    this.checkExits(cx);
    // Each space's tabs, without hunk's reviews (each space's ◆n counts them).
    const reviewTabs = labelled(HUNK_LABEL);
    const blocks = towers(data, this.history).map(b => ({ ...b, floors: b.floors.filter(f => !isHunkTab(f.id, reviewTabs)) }));
    const items = blocks.map((s, i) => {
      const sum = this.gitInfo ? this.gitInfo.summary(s, ps) : null;
      return { s, i: i + 1, sum, w: this.regionWidth(s, data, sum) };
    });
    const width = this.size.width;
    // One width for every region, narrower (down to 80% of the least) so they all fit.
    const avail = width - (32 * U + NEW_W + REGION_GAP * items.length);
    const each = Math.max(REGION_MIN_W * 0.8, Math.min(REGION_W, Math.floor(avail / Math.max(1, items.length))));
    for (const x of items) x.w = each;
    const regionH = Math.max(REGION_MIN_H, this.size.height - 24 * U);
    const contentW = items.reduce((n, x) => n + x.w + REGION_GAP, 0) + NEW_W + 32 * U;
    const regions = h_flex().id("ram-regions").w(Math.max(width, contentW)).h(regionH + 24 * U).justify_center().items_start()
      .gap(REGION_GAP).px(16 * U).py(12 * U)
      .children(items.map(x => this.region(x.s, x.i, data, x.w, x.sum, regionH)))
      .when(!blocks.length, el => el.child(div().text_size(13 * U).text_color(t.muted).child("No regions yet: open a space to allocate one.")))
      // + (a new space) and, under it, follow's f: two squares as wide as NEW_W.
      .child(v_flex().id("ram-stick-buttons").flex_none().gap(6 * U).child(this.newSpace()).child(this.followButton()));
    const scan = div().id("ram-scan").absolute().top(0).bottom(0).left(0).w(2 * U).bg("#7dff9b1f");
    if (this.motion()) scan.loop("left", { from: 0, to: Math.max(2, width - 2), period: 7000 });
    return this.sized(v_flex().id("ram-rams").relative().size_full().overflow_hidden())
      .child(div().id("ram-rams-scroll").size_full().overflow_x_scrollbar().child(regions))
      .child(scan);
  }

  // meta's side column: the main stick (0x00 @, all.js) over .rodata and the
  // keys. The main stick has what the space level's column shows (the spaces,
  // the agents, the git) for every space at once; lazygit is on each space
  // stick's git line and ^b g.
  metaSide(cx) {
    const t = theme(), data = readScene();
    const pad = 6 * U, below = machinesHeight((this.machines ?? []).length) + KEYS_H;
    const w = Math.max(160 * U, this.size.width - 2 - 2 * pad), h = Math.max(150 * U, this.size.height - 2 - below - 2 * pad);
    return this.sized(v_flex().id("ram-side").size_full().bg(t.chrome).rounded(2).border(1).border_color(t.border).overflow_hidden())
      .child(div().id("ram-side-all").flex_1().min_h(0).p(pad).overflow_hidden().child(this.all.render(data, w, h, cx)))
      .child(this.machinesRegion(false))
      .child(this.keysRow(false));
  }

  // A tab on the strip: its &n / *n, its name (or what runs in it), a light
  // per agent in it or its faults (!n), and an x while the pointer is on it.
  // Click shows it; double-click renames it; drag it onto another tab to move
  // it there; right-click is the tab menu.
  tabChip(s, f, data) {
    const t = theme(), here = f.active, tab = s.tabs.find(x => x.id === f.id);
    const toolTab = isLazygitTab(f.id);
    const name = toolTab ? "lazygit" : tab?.named ? tab.name : (f.windows.map(blockText).join(" \u00b7 ") || "empty");
    const list = data.list.filter(a => a.space === s.id && a.tab === f.id);
    const blocked = list.filter(a => a.status === "blocked").length;
    const chip = h_flex().id(`tabchip-${f.id}`).relative().w(CHIP_W).h(CHIP_H).pl(7 * U).pr(3 * U).gap(5 * U).flex_none().items_center().rounded(2).overflow_hidden()
      .bg(here ? "#0f1c15" : "#0b130f").border(1).border_color(here ? AMBER : t.border)
      .cursor_pointer().hover(st => st.bg(t.hover))
      .on_hover(this.hovering(f.id))
      .tooltip(`${s.name} / ${REF(f.index, here)} ${name}`)
      // As in Traveler: a double-click renames the tab (Herdr asks for the name).
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.grab("tab", f.id, s.id);
        if (e.click_count === 2) run("tab.rename", { id: f.id });
      })
      .on_click(() => run("tab.select", { id: f.id }))
      .on_mouse_down("right", (_e, cx) => this.menu({ props: { tab: "tab", target: { id: f.id, space: s.id } } }, cx))
      .child(div().flex_none().text_size(10.5 * U).text_color(here ? AMBER : t.dim).child(REF(f.index, here)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).font_semibold()
        .text_color(toolTab ? CYAN : here ? AMBER : t.foreground).child(name))
      .when(list.length > 0 && !blocked, el => el.child(h_flex().flex_none().gap(2 * U).items_center().children(list.slice(0, 3).map(a => led(a, 5, this.motion())))))
      // A small chip has room for the count only: !1 (FAULT 1 in its tooltip).
      .when(blocked > 0, el => el.child(div().flex_none().px(3 * U).rounded(2).bg("#3a1118").border(1).border_color(RED)
        .text_size(10 * U).text_color(RED).tooltip(`FAULT ${blocked}: needs you`).child(`!${blocked}`)))
      .child(this.closeX(`tabx-${f.id}`, f.id, 15 * U, this.hoverTab === f.id));
    return this.dragMarks(this.droppable(chip, "tab", f.id, s.id, from => this.moveTab(s.id, from, f.id)),
      "tab", f.id, s.tabs.map(x => x.id), "x");
  }

  // The strip, on top in every level: the current space's name, then its tabs
  // as one strip of chips (each closes with its own x) and + to push a new tab;
  // the level buttons right.
  strip(data) {
    const t = theme(), width = this.size.width;
    const pl = inset(), s = data.spaces.find(x => x.active);
    const ruler = h_flex().h(12 * U).flex_none().pl(pl).overflow_hidden()
      .children(Array.from({ length: Math.max(1, Math.floor((width - pl) / (120 * U))) }, (_, k) =>
        div().w(120 * U).flex_none().text_size(9 * U).text_color("#3f5a49").child("0x" + (k * 0x400).toString(16).toUpperCase().padStart(4, "0"))));
    const row = h_flex().flex_1().min_h(0).pl(pl).pr(12 * U).gap(10 * U).items_center();
    if (s) {
      const i = data.spaces.indexOf(s) + 1;
      const tower = towers(data, []).find(x => x.id === s.id);
      row.child(h_flex().id("ram-strip-space").flex_none().max_w(150 * U).gap(6 * U).items_center()
          .tooltip(`${ADDR(i)} ${s.name}${s.machine ? " @" + s.machine : ""}`)
          .child(div().flex_none().text_size(10.5 * U).text_color(CYAN).child(ADDR(i)))
          .child(div().min_w(0).truncate().text_size(12.5 * U).font_semibold().text_color(AMBER).child(s.name))
          .children([this.marker(s.id)].filter(Boolean)))
        // Its tabs, without hunk's reviews (those are in the hunk level's list).
        .child(h_flex().id("ram-strip-scroll").flex_1().min_w(0).h_full().gap(8 * U).items_center().overflow_x_scrollbar()
          .children((tower?.floors ?? []).filter(f => !isHunkTab(f.id)).map(f => this.tabChip(s, f, data)))
          .child(this.pushTab(s, CHIP_H)));
    } else row.child(div().flex_1());
    return this.sized(v_flex().id("ram-strip").relative().size_full().overflow_hidden().border_b(1).border_color(t.border))
      .child(ruler)
      .child(row.child(this.levelButtons()).children(this.windowButtons()));
  }

  // ---------------------------------------------------------------- the side column

  // STACK (every space, 0x01 at the top, growing down; SP points at the one
  // you're in), free, HEAP (that space's agents, growing up to its label),
  // .rodata, GIT, then Settings / Keys / Commands. Narrower and shorter rows when
  // it isn't this column's level. Both labels count their rows, so a short
  // column (meta) can show fewer rows and still say how many there are.
  side(cx) {
    if (level() === "meta") return this.metaSide(cx);
    const t = theme(), lvl = level(), compact = lvl !== "space";
    const data = readScene(), s = data.spaces.find(x => x.active);
    const shell = v_flex().id("ram-side").size_full().bg(t.chrome).rounded(2).border(1).border_color(t.border).overflow_hidden();
    const label = (text, extra = []) => h_flex().h(20 * U).flex_none().px(10 * U).gap(5 * U).items_center()
      .child(div().flex_1().text_size(10.5 * U).text_color(t.dim).child(text)).children(extra);
    const count = n => n ? "  " + n : "";
    const stackLabel = label(`STACK \u2193${count(data.spaces.length)}`,
      [this.mini("ram-space-new", "+", "Push: new space", () => run("space.new"))]);
    if (!s) return this.sized(shell).child(stackLabel)
      .child(div().flex_1().px(10 * U).py(6 * U).text_size(13 * U).text_color(t.muted).child("No space yet"))
      .child(this.machinesRegion(compact)).child(this.keysRow(compact));
    const current = s.tabs.find(x => x.active);
    // HEAP: the space's agents and their sub-agents, oldest at the bottom.
    const born = a => data.rawByAddress.get(a.address)?.created_ms ?? 0;
    const heap = data.list.filter(a => a.space === s.id).sort((a, b) => born(b) - born(a));
    // Rows that fit under the fixed parts (both labels, .rodata, GIT, the
    // keys): the stack gets up to 55% of the room (the current space always
    // stays), the heap the rest (the agents that need you first). GIT's file
    // names give way first when even the current space wouldn't fit.
    const g = this.gitInfo?.info(s, panes());
    const stackRow = (compact ? 20 : 24) * U, heapRow = (compact ? 20 : 26) * U;
    const more = (id, n, what) => div().id(id).h(MORE_H).flex_none().px(10 * U).flex().items_center().text_size(10.5 * U).text_color(t.dim)
      .child(`+${n} more ${what}`);
    // hunk level: HUNK, the open reviews (this space's first), at the top; up
    // to 40% of the column, then "+n more".
    let hunkH = 0, hunkSection = null;
    if (lvl === "hunk") {
      const list = ordered(reviews(), data.spaces);
      const fits = Math.max(1, Math.floor((this.size.height * 0.4 - 20 * U) / HUNK_ROW));
      const rows = list.length > fits ? list.slice(0, Math.max(1, fits - 1)) : list;
      hunkSection = v_flex().id("ram-hunk").flex_none().border_b(1).border_color(t.border)
        .child(label(`HUNK${count(list.length)}`, [this.mini("ram-hunk-new", "+", "Open another review in this space", () => this.hunkMenu(s))]))
        .children(rows.map(e => hunkRow(this, e, current?.id)))
        .when(list.length > rows.length, el => el.child(more("ram-hunk-more", list.length - rows.length, "reviews")));
      hunkH = 1 + HUNK_HEAD + rows.length * HUNK_ROW + (list.length > rows.length ? MORE_H : 0);
    }
    const fixed = files => 2 + (20 + 20 + 6) * U + machinesHeight((this.machines ?? []).length) + gitHeight(g, files) + KEYS_H + hunkH;
    let gitFiles = compact ? 2 : 4;
    if (this.size.height - fixed(gitFiles) < stackRow) gitFiles = 0;
    const room = Math.max(0, this.size.height - fixed(gitFiles));
    const st = fit(data.spaces.length, stackRow, Math.max(stackRow, room * 0.55), compact, 1);
    const hp = fit(heap.length, heapRow, room - st.rows * stackRow - (st.more ? MORE_H : 0), compact);
    // The stack's "+n more" also goes in whatever room the heap left.
    if (st.rows < data.spaces.length && !st.more &&
      room - st.rows * stackRow - hp.rows * heapRow - (hp.more ? MORE_H : 0) >= MORE_H) st.more = true;
    const nav = navigating();
    const shownSpaces = { floors: pick(data.spaces, st.rows, nav), hidden: st.more ? data.spaces.length - st.rows : 0 };
    const first = [...new Set([...heap.filter(a => a.status === "blocked"), ...heap])];
    const keep = new Set(first.slice(0, hp.rows));
    const shownHeap = heap.filter(a => keep.has(a)), heapMore = hp.more;
    const spaceOrder = data.spaces.map(x => x.id);
    const frameRows = shownSpaces.floors.map(sp => {
      const i = data.spaces.indexOf(sp) + 1, here = sp.active, group = sp.machine ?? "";
      const blocked = data.blockers.filter(a => a.space === sp.id).length;
      // Every row has the same columns, SP last (only the current space's says
      // it), so the names line up. Drag a row onto another to move that space.
      const row = h_flex().id(`stack-${sp.id}`).relative().h(stackRow).flex_none().px(10 * U).gap(6 * U).items_center().cursor_pointer()
        .when(here, el => el.bg(AMBER + "14")).hover(st => st.bg(t.hover))
        .when(nav === sp.id, el => el.border(1).border_color(CYAN))
        .tooltip(`${ADDR(i)} ${sp.name}${sp.machine ? " @" + sp.machine : ""}`)
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          this.grab("space", sp.id, group);
          if (e.click_count === 2) run("space.rename", { id: sp.id });
        })
        .on_click(() => this.go(sp.id))
        .on_mouse_down("right", (_e, cx) => this.menu({ height: 260, props: { tab: "space", target: { id: sp.id } } }, cx))
        .child(div().w(34 * U).flex_none().text_size(11 * U).text_color(here ? AMBER : CYAN).child(ADDR(i)))
        .child(div().flex_1().min_w(0).truncate().text_size(12 * U).text_color(here ? AMBER : t.foreground)
          .when(here, el => el.font_semibold()).child(sp.name))
        .children([this.marker(sp.id)].filter(Boolean))
        .when(Boolean(sp.machine) && !compact, el => el.child(div().flex_none().max_w(70 * U).truncate().text_size(10.5 * U)
          .text_color(t.dim).child(`@${sp.machine}`)))
        .when(blocked > 0, el => el.child(fault(blocked)))
        .child(div().w(30 * U).flex_none().text_size(10.5 * U).text_color(AMBER).child(here ? "\u25c2SP" : ""));
      return this.dragMarks(this.droppable(row, "space", sp.id, group, from => this.moveSpace(from, sp.id)),
        "space", sp.id, spaceOrder, "y");
    });
    const blocks = shownHeap.map(a => {
      const red = a.status === "blocked", mine = a.tab === current?.id;
      return h_flex().id(`heap-${a.address}`).h(heapRow).flex_none().px(10 * U).gap(7 * U).items_center().cursor_pointer()
        .hover(st => st.bg(red ? "#3a1520" : t.hover)).when(red, el => el.bg("#2a0f14"))
        .tooltip(identity(a))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.open(a); })
        .child(led(a, 7, this.motion()))
        .child(div().w(24 * U).flex_none().text_size(11.5 * U).text_color(mine ? AMBER : t.dim).child(REF(a.tab_index, mine)))
        .child(div().flex_none().max_w(compact ? 120 * U : 140 * U).truncate().text_size((compact ? 11.5 : 12.5) * U).font_semibold()
          .text_color(red ? "#ffd0d4" : t.foreground).child(`${a.program?.name || "agent"}${a.child ? " \u21b3" : ""}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(red ? "#e9b3bb" : t.muted).child(compact ? "" : besides(a)))
        .when(!compact, el => el.child(div().flex_none().text_size(11 * U).text_color(red ? RED : t[a.status] ?? t.dim)
          .child(STATUS[a.status] ?? a.status ?? "")));
    });
    const stack = v_flex().id("ram-stack").flex_none().children(frameRows)
      .when(shownSpaces.hidden > 0, el => el.child(more("ram-stack-more", shownSpaces.hidden, "spaces")));
    const heapList = v_flex().id("ram-heap").flex_none().children(blocks)
      .when(heapMore && heap.length > shownHeap.length, el => el.child(more("ram-heap-more", heap.length - shownHeap.length, "blocks")));
    const free = div().id("ram-free").flex_1().min_h(6 * U).flex().items_center().px(14 * U)
      .child(div().w_full().h(0).border_t(1).border_dashed().border_color(t.border));
    // The stack and heap give way first (their labels count them), down to the
    // labels and the current space. Past that (a short column with machines and
    // a dirty repo), .rodata and GIT get what's left and scroll. The keys always show.
    const memoryMin = (20 + 20 + 6) * U + stackRow;
    const memory = v_flex().id("ram-side-memory").flex_1().min_h(memoryMin).overflow_hidden()
      .child(stackLabel)
      .child(stack)
      .child(free)
      .child(heapList)
      .child(label(`HEAP \u2191${count(heap.length)}`));
    const detailsH = machinesHeight((this.machines ?? []).length) + gitHeight(g, gitFiles);
    const detailsRoom = Math.max(0, this.size.height - 2 - memoryMin - KEYS_H - hunkH);
    const details = v_flex().id("ram-side-details").flex_none()
      .when(detailsH > detailsRoom, el => el.h(detailsRoom).overflow_y_scrollbar())
      .child(this.machinesRegion(compact))
      .child(this.gitRegion(s, gitFiles));
    return this.sized(shell)
      .children(hunkSection ? [hunkSection] : [])
      .child(memory)
      .child(details)
      .child(this.keysRow(compact));
  }

  // .rodata (the assembler's read-only data section): the other machines (ssh)
  // Herdr knows, each drawn as a read-only memory chip (purple, dashed, high
  // addresses 0xF1...) so they don't look like the spaces (RAM). A connected
  // one: click goes into its first space (or makes one), + makes a new space
  // there. One that isn't: click opens Settings' Machines to fix it. + at the
  // top adds a machine (the machine-add dialog).
  machinesRegion(compact) {
    const t = theme(), list = this.machines ?? [];
    const add = () => run("mod.open", { name: "machine-add" });
    // One line: .rodata, then (no machine yet) the way to add one, then +.
    const header = h_flex().h(18 * U).flex_none().items_center().gap(6 * U)
      .child(div().flex_none().text_size(10.5 * U).text_color(ROM).child(".rodata"))
      .child(list.length ? div().flex_1()
        : h_flex().id("ram-machine-none").flex_1().min_w(0).h_full().px(4 * U).items_center().rounded(2)
          .cursor_pointer().hover(st => st.bg(t.hover).text_color(AMBER)).text_size(11.5 * U).text_color(t.dim)
          .tooltip("Add a machine (ssh)")
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); add(); })
          .child(div().min_w(0).truncate().child("Add a machine")))
      .child(this.mini("ram-machine-add", "+", "Add a machine", add));
    const box = v_flex().id("ram-machines").flex_none().px(10 * U).py(6 * U).gap(4 * U).border_t(1).border_color(t.border)
      .child(header);
    if (!list.length) return box;
    const pinCount = Math.max(4, Math.floor((this.size.width - 36 * U) / (6 * U)));
    list.forEach((m, k) => {
      const on = m.state === "connected";
      const first = spaces().find(x => x.machine === m.name);
      const chip = h_flex().id(`ram-machine-${m.name}`).h(26 * U).flex_none().px(6 * U).gap(6 * U).items_center().rounded(2)
        .bg(ROM_BG).border(1).border_dashed().border_color(on ? ROM : ROM_LINE)
        .cursor_pointer().hover(st => st.bg(ROM_HOVER))
        .tooltip(on ? (first ? `Into ${first.name} on ${m.name}` : `New space on ${m.name}`) : (m.why || String(m.state ?? "asleep")))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (!on) run("app.settings", { section: "machines" });
          else if (first) this.go(first.id);
          else run("space.new", { machine: m.name });
        })
        .child(div().flex_none().text_size(10.5 * U).text_color(ROM).child("0x" + (0xF1 + k).toString(16).toUpperCase()))
        .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(on ? t.foreground : t.muted).child(m.name))
        .when(!compact, el => el.child(div().flex_none().px(3 * U).rounded(2).border(1).border_color(ROM_LINE)
          .text_size(9.5 * U).text_color(ROM).child("RO")))
        .child(div().size(7 * U).rounded_full().flex_none().bg(on ? GREEN : t.dim))
        .when(!on && !compact, el => el.child(div().flex_none().text_size(10.5 * U).text_color(t.dim)
          .child(String(m.state ?? "asleep").replace(/_/g, " "))))
        .when(on, el => el.child(this.mini(`ram-machine-new-${m.name}`, "+", `New space on ${m.name}`,
          () => run("space.new", { machine: m.name }))));
      const pins = h_flex().h(3 * U).flex_none().px(8 * U).gap(3 * U)
        .children(Array.from({ length: pinCount }, () => div().w(3 * U).h(3 * U).flex_none().bg(ROM_LINE)));
      box.child(v_flex().flex_none().child(chip).child(pins));
    });
    return box;
  }

  // GIT: the space's repo said the way its meta git line says it (branch, ↑↓,
  // uncommitted, unpushed, no remote) right after GIT, its key (^b g) at the
  // end, then up to MAXFILES changed files. A click or ^b g opens lazygit
  // there; without a repo the line says "not a repo", and so does a toast.
  // Its lines have fixed heights, the ones gitHeight() counts.
  gitRegion(s, maxFiles) {
    const t = theme(), ps = panes(), g = this.gitInfo?.info(s, ps);
    const sum = this.gitInfo?.summary(s, ps);
    const shown = s.tabs.find(x => x.active), here = Boolean(shown && isLazygitTab(shown.id));
    const key = terse(shortcut("lazygit"));
    const tip = `${sum?.tip ?? "Checking git\u2026"} \u00b7 ${here ? "lazygit is open" : `click: lazygit${key ? " (" + key + ")" : ""}`}`;
    const box = v_flex().id("ram-git").flex_none().px(10 * U).py(GIT_PAD).gap(GIT_GAP).border_t(1).border_color(here ? AMBER : t.border)
      .when(here, el => el.bg(AMBER + "10"))
      .cursor_pointer().hover(st => st.bg(t.hover)).tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.openLazygit(s, cx); });
    const top = h_flex().id("ram-git-line").h(GIT_TOP).flex_none().gap(6 * U).items_center().overflow_hidden().text_size(11.5 * U)
      .child(div().flex_none().text_size(10.5 * U).text_color(here ? AMBER : CYAN).child("GIT"));
    // What the line says, so its key only shows when it fits (the tooltip has it too).
    const said = !g ? [g === undefined ? "checking\u2026" : "not a repo"]
      : [sum.head?.text, ...sum.marks.map(m => m.short)].filter(Boolean);
    const need = textW("GIT", 10.5 * U) + said.reduce((n, x) => n + textW(x, 11.5 * U) + 6 * U, 0) + 6 * U + textW(key, 10.5 * U);
    const keyFits = Boolean(key) && need <= this.size.width - 2 - 20 * U;
    if (!g) top.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(said[0]));
    else top
      .when(Boolean(sum.head?.text), el => el.child(headGroup(sum.head, t.foreground)))
      .children(marks(sum, 11.5 * U))
      .child(div().flex_1());
    box.child(top.when(keyFits, el => el.child(div().flex_none().text_size(10.5 * U).text_color(t.dim).child(key))));
    if (!g) return box;
    const line = () => h_flex().h(GIT_LINE).flex_none().gap(6 * U).items_center().text_size(11 * U);
    const files = (g.files ?? []).slice(0, shownFiles(g, maxFiles));
    for (const f of files) box.child(line()
      .child(div().w(10 * U).flex_none().text_color(f.xy === "?" ? "#d38cff" : f.xy === "D" ? RED : f.xy === "A" ? GREEN : AMBER).child(f.xy))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(f.path)));
    if (moreFiles(g, files.length))
      box.child(line().text_size(10.5 * U).text_color(t.dim).child(`+${Math.max(g.dirty, g.files?.length ?? 0) - files.length} more`));
    return box;
  }

  keysRow(compact) {
    const t = theme();
    const item = (id, icon, label, command) => h_flex().id(`ram-${id}`).flex_1().h(KEY_H).gap(5 * U).items_center().justify_center().rounded(2)
      .cursor_pointer().hover(st => st.bg(t.hover)).tooltip(`${label}${shortcut(command) ? "  " + terse(shortcut(command)) : ""}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); run(command); })
      .child(svg(icon).size(14 * U).flex_none().text_color(t.muted))
      .when(!compact, el => el.child(div().text_size(11 * U).text_color(t.dim).child(terse(shortcut(command)) || label)));
    return h_flex().flex_none().px(4 * U).py(KEY_PAD).gap(2 * U).border_t(1).border_color(t.border)
      .child(item("settings", "mods/workspace-chrome/settings.svg", "Settings", "app.settings"))
      .child(item("keys", "frame/settings/keyboard.svg", "Keys", "app.help"))
      .child(item("commands", "mods/workspace-chrome/search.svg", "Commands", "app.palette"));
  }

  // ---------------------------------------------------------------- the peek strip

  // hunk level: the last lines of the tab you came from, read every 1.5 s.
  readPeek(cx) {
    if (level() !== "hunk" || !window()?.active || this.reading) return;
    const tab = workTab(activeSpace());
    const ps = panes().filter(p => p.tab === tab?.id && p.terminal);
    const pane = ps.find(p => p.focused) ?? ps[0];
    if (!pane) { this.peekLines = []; return; }
    this.reading = true;
    cx.spawn(async cx => {
      try {
        const r = await hc(["read", pane.terminal]);
        if (r.code === 0) {
          const lines = r.stdout.replace(ANSI, "").replace(/\s+$/, "").split("\n").map(l => l.replace(/\s+$/, ""));
          this.peekLines = lines.slice(-8);
        }
      } catch (_) { /* keep what it showed */ }
      this.reading = false;
      cx.notify();
    });
  }

  peek() {
    const t = theme(), s = activeSpace(), tab = workTab(s);
    const box = v_flex().id("ram-peek").size_full().bg(t.chrome).rounded(2).border(1).border_color(t.border).overflow_hidden();
    if (!tab) return box.child(div().p(10 * U).text_size(12 * U).text_color(t.dim).child("No other tab in this space"));
    const ps = panes().filter(p => p.tab === tab.id);
    const what = ps.map(p => p.program?.name || (p.mod ? p.title : "sh")).join(" \u00b7 ");
    const status = tab.status;
    return box.cursor_pointer().hover(st => st.border_color(AMBER)).tooltip(`Back to &${tab.index}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); run("tab.select", { id: tab.id }); })
      .child(h_flex().h(24 * U).flex_none().px(10 * U).gap(7 * U).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().text_size(12 * U).text_color(AMBER).child("\u21a9"))
        .child(div().flex_none().text_size(12 * U).text_color(t.foreground).child(`&${tab.index}${tab.named ? " " + tab.name : ""}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).text_color(t.muted).child(what))
        .when(Boolean(status), el => el.child(div().flex_none().text_size(11 * U).text_color(t[status] ?? t.dim).child(STATUS[status] ?? status))))
      .child(v_flex().flex_1().min_h(0).px(10 * U).py(4 * U).justify_end().overflow_hidden()
        .children(this.peekLines.map((l, k) => div().id(`peek-${k}`).h(13 * U).flex_none().truncate().text_size(11 * U).text_color(t.dim).child(l || " "))));
  }

  // ---------------------------------------------------------------- render

  render(cx) {
    const role = props()?.role;
    if (role === "hunk-menu") return this.menuView.render();
    this.countReviews();
    if (role === "side") return this.side(cx);
    if (role === "peek") return this.peek();
    if (role === "rams") return this.rams(cx);
    const lvl = level(), data = readScene();
    this.applyLevel(lvl, cx);
    this.trackWork(cx);
    this.follow(data, cx);
    this.takeHunkRequest(cx);
    // agent.next / prev: needs-you first, then the rest in space order.
    const rank = a => RANK[a.status] ?? 4;
    setAgentOrder([...data.list].filter(a => !a.child).sort((a, b) => rank(a) - rank(b)).map(a => a.address));
    return this.strip(data);
  }

  async close() { if (props()?.role === "rams") this.save(); }
}

// What runs there: the agent's own title when it says something, else the app's
// name. Titles that are only a path, user@host or the terminal's address say nothing.
function doing(a) {
  const prog = a.program?.name ?? "";
  const live = String(a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const telling = live && live !== prog && live.toLowerCase() !== a.program?.key &&
    live !== a.address && !live.endsWith(`/${a.address}`) && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@");
  return telling ? live : prog || a.address;
}
// What an agent is doing, when that says more than its name (shown next to it).
function besides(a) {
  const what = doing(a);
  return what && what !== (a.program?.name || "agent") && what !== a.address ? what : "";
}
