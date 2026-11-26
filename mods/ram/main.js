// RAM: the window as a computer's memory, in two levels, each with its own
// place, as a stack has two pointers (pointers.js). A strip on top (the map
// copy) shows the current space's tabs and the level buttons in both.
//   meta      SP, the stack pointer: the one that jumps. The terminal on top
//             shows its tab, and under it every space is a stick of memory
//             (role "rams"); the side column is the main stick (0x00 @,
//             all.js), every space and agent at once. follow (the f under the
//             sticks' +, ctrl-b f) moves SP to each agent that needs you, then
//             back to its return address (a dim RET▸ on that frame meanwhile),
//             in either level (outside meta without changing the screen).
//   space     BP, the base pointer: each space's work tab, which stays. The
//             terminal gets the room; the side column has the STACK (every
//             space, growing down from the top), HEAP (this space's agents and
//             the commands running in its tabs, procs.js, growing up from the
//             bottom), .rodata (other machines), GIT (a click or ctrl-b g opens
//             lazygit; in a folder that isn't a repo, its dialog, gitinit.js),
//             HUNK (its reviews, hunk.js) and LANG (its languages, langs.js).
//             Under the terminal a strip (role "peek") shows SP's tab; under a
//             review, where you came from.
// The level is shared "ram.zoom". Changing it shows that level's place (the
// map copy's applyLevel()). lazygit and hunk's reviews open in tabs of their
// own in the space you work in (its bright BP), for the repo it's named after;
// from meta they stay in meta unless the e square (ctrl-b e) is on. Search
// (ctrl-b /, the space level's / search) is a window over the window
// (search.js), for the terminal you're in.
// Roles "hunk-menu", "lang", "git-init" and "search" are dialogs ("search" is
// also ram-search's tab).
// The model, exit history and git info are night-city's (model.js, git.js).
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, panes, terminals, props, run, theme, setAgentOrder, window, exec, hc,
  settings, openOverlay, shared, setShared, notify, nextCommand, home, layout, focused } from "herdr";
import { scene, remember, confirm, towers } from "./model.js";
import { Git } from "./git.js";
import { AllStick } from "./all.js";
import { LangData, LangView, INCLUDE, summarize, langBar, shareText, filesText, visible } from "./langs.js";
import { HUNK_LABEL, COMMANDS, labelOf, Sessions, entries, nameOf, HunkMenu, marker,
  HUNK_PAD, HUNK_TOP, HUNK_GAP, hunkHeight, reviewsIn, forRepo, hunkLine } from "./hunk.js";
import { AMBER, CYAN, GOLD, GREEN, RED, ROM, ROM_LINE, ROM_BG, ROM_HOVER, U, CELL, LED, STATUS, RANK, ADDR, REF,
  stop, textW, terse, tipOf, shortcut, led, fault, finished, finishedW, DONE_BG, BP_ON, RET_DIM, marks, headGroup,
  navigating, sameDir, ago } from "./ui.js";
import { SP, BP, FRAME, CAME, GOTO, RET, live, spPlace, bpTab, frameSpace, bpPlace, show, goTo } from "./pointers.js";
import { PROCS, Tail, track, sameProcs, procRows } from "./procs.js";
import { GitInit, TOOL_OPEN } from "./gitinit.js";
import { SearchView, openSearch } from "./search.js";

// The space sticks (regions) in meta, under the terminal.
const HEADER_H = 19 * U, LABELS_H = 13 * U, FRAME_H = 18 * U, BOTTOM_H = 21 * U, PINS_H = 6 * U, HEAP_H = 20 * U;
const BLOCK_H = 14 * U, KID_H = 12 * U, CHAR_W = 7 * U;
const REGION_MIN_W = 160 * U, REGION_MAX_W = 360 * U, REGION_GAP = 14 * U, NEW_W = 30 * U;
// SP_W: room for a frame's pointer mark, up to RET▸.
const SP_W = 26 * U, NUM_W = 26 * U, ARROW_W = 26 * U;
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
const CHIP_W = 118 * U, CHIP_H = 23 * U, REGION_W = 200 * U, LEVEL_W = 100 * U;
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
// LANG (the space level, under GIT): its header line, the bar, then up to
// LANG_ROWS languages and a "+n more" line, LANG_GAP apart. Each has a 1 px top border.
const LANG_PAD = 6 * U, LANG_TOP = 17 * U, LANG_BAR = 6 * U, LANG_GAP = 4 * U, LANG_LINE = 16 * U, LANG_ROWS = 3;
const langHeight = (rows, more, bar) =>
  1 + 2 * LANG_PAD + LANG_TOP + (bar ? LANG_GAP + LANG_BAR : 0) + (rows + (more ? 1 : 0)) * (LANG_GAP + LANG_LINE);
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
// The strip (ram-map) is on top in both levels. meta: the main stick in the
// side column, the terminal over the space sticks (ram-rams). The peek strip
// (ram-peek) shows in the space level when there's something to show (peekSources()).
// Each level keeps its own side column shown or hidden (shared SIDE_HIDDEN:
// { meta: true } while you hid it in meta; applyLevel(), watchHidden()), and P
// (^b P) hides what's under its terminal: meta's sticks (shared STICKS false),
// the space level's peek strip (shared "ram.peek" false).
// The peek strip's height (main.js applyPeek): from the space level's side column,
// at least PEEK_MIN px (its header and a line). PEEK_KEEP: the most last lines
// each of its boxes keeps (a tall window's strip).
const PEEK_H = "ram.peek.h", PEEK_MIN = 56, PEEK_KEEP = 80;
export const LEVELS = {
  meta: { map: { px: 74 }, side: 390, rams: true },
  space: { map: { px: 74 }, side: 340, rams: false },
};
const SIDE_HIDDEN = "ram.side.hidden", STICKS = "ram.sticks";
// Whether level LVL keeps its side column hidden.
export const sideHidden = lvl => shared(SIDE_HIDDEN)?.[lvl] === true;
// Whether the space sticks show: in meta, unless P hid them.
export const sticksShown = () => LEVELS[level()].rams && shared(STICKS) !== false;
// Keep the side column shown or hidden for level LVL.
function keepHidden(lvl, hidden) {
  const kept = { ...(shared(SIDE_HIDDEN) ?? {}) };
  if ((kept[lvl] === true) === hidden) return;
  if (hidden) kept[lvl] = true; else delete kept[lvl];
  setShared(SIDE_HIDDEN, kept);
}
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
// Whether the layout has the side column hidden now, or null (no layout).
const sidebarHidden = () => {
  const node = findNode(layout(), "sidebar");
  return node ? node.hidden === true : null;
};
// The model, without hunk's terminals: hunk reports itself like an agent,
// but a review isn't one (the HUNK list shows reviews). Its procs are the
// commands running in your tabs (procs.js), for HEAP only: not agents (follow,
// faults, agent.next and the exit history are the agents'). VIEW: the copy
// reading it, whose own last lines (its Tail) the running ones show.
const readScene = (view = null) => {
  const reviewTerms = labelled(HUNK_LABEL);
  const data = scene(spaces(), panes(), agents().filter(a => !reviewTerms.has(a.address) && a.app !== "hunk"), terminals());
  data.procs = procRows(shared(PROCS), data.spaces, data.panes, view?.tail?.lines ?? {});
  return data;
};
// What a HEAP shows for a space (null: every space): its agents and its commands.
const heapOf = (data, spaceId = null) => [...data.list, ...data.procs].filter(a => spaceId === null || a.space === spaceId);
// When a row was allocated, for a heap's order: an agent's terminal's start, a command's.
const bornOf = data => a => a.proc ? a.since : data.rawByAddress.get(a.address)?.created_ms ?? 0;
// Finished and not seen yet in a space: its agents' and its commands'.
const doneIn = (data, spaceId) => heapOf(data, spaceId).filter(a => a.status === "done" && !a.child).length;
const blockText = a => a.status === "dead" ? "freed" : a.status === "unavailable" ? "?"
  : (a.program?.name || (a.status === "mod" ? (a.title || "mod") : "sh"));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

// The tools RAM opens in a tab of their own, in the space you work in, at the
// repo it's named after (else that folder): lazygit (GIT's click, ctrl-b g)
// and hunk's reviews (hunk.js). Herdr starts them in the login shell; `exec`
// makes quitting them close the tab. Their terminals are labelled with the
// folder they're for (ram.lazygit=<folder>; a review is ram.hunk=<what>), so
// each folder has its own.
const TOOLS = {
  lazygit: { name: "lazygit", argv: ["exec", "lazygit"], label: "ram.lazygit" },
};
const labelled = label => new Set(terminals().filter(t => t.labels?.[label]).map(t => t.address));
const runsIn = (tabId, addresses) => panes().some(p => p.tab === tabId && p.terminal && addresses.has(p.terminal));
const isLazygitTab = (tabId, lazygit = labelled(TOOLS.lazygit.label)) => runsIn(tabId, lazygit);
const isHunkTab = (tabId, reviews = labelled(HUNK_LABEL)) => runsIn(tabId, reviews);
// A tool's tab: never a BP, and quitting it goes back where you came from.
const isToolTab = tabId => isLazygitTab(tabId) || isHunkTab(tabId);
// The folder a tool's tab is for: its label's (an old "1": where it runs), or null.
function toolFolderOf(tabId, label) {
  for (const p of panes()) {
    if (p.tab !== tabId || !p.terminal) continue;
    const v = terminals().find(t => t.address === p.terminal)?.labels?.[label];
    if (v) return v === "1" ? p.cwd ?? null : v;
  }
  return null;
}
const activeSpace = () => spaces().find(s => s.active);
const shownTab = () => activeSpace()?.tabs.find(t => t.active) ?? null;
// The place that shows: its space, tab and focused pane.
function shownPlace() {
  const s = activeSpace(), t = s?.tabs.find(x => x.active);
  return s && t ? { space: s.id, tab: t.id, pane: focused()?.pane ?? null } : null;
}
// The agents in a tab that need you (not sub-agents).
const askingIn = (data, tabId) => data.list.filter(a => a.tab === tabId && a.status === "blocked" && !a.child);
// Room on the left for macOS's window buttons. They sit at the layout's
// traffic_lights spot in screen points and don't grow with zoom, so this is
// about 100 points whatever the zoom; other systems need only a margin.
const inset = () => window()?.platform === "macos" ? Math.ceil(100 / (settings()?.zoom || 1)) : 16 * U;
export const level = () => shared("ram.zoom") === "meta" ? "meta" : "space";
// A space's work tab (its BP), never a tool's.
const workTab = s => bpTab(s, isToolTab);
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
    this.peekLines = {};
    const role = props()?.role;
    if (role === "hunk-menu") { this.menuView = new HunkMenu(cx); return; }
    if (role === "lang") { this.langView = new LangView(cx); return; }
    if (role === "git-init") { this.gitView = new GitInit(cx); return; }
    if (role === "search") { this.searchView = new SearchView(cx); return; }
    // With "focusable" (mod.json), ctrl-b h j k l can give a copy the keyboard.
    // The side column takes it (its rows, keyboard()); the strip, the sticks and
    // the peek strip hand it straight back the way it came.
    if (role === "peek") {
      cx.timer.every(1500, cx => this.readPeek(cx));
      this.bounce("up", cx);
      return;
    }
    this.gitInfo = new Git();
    // Whose git each copy keeps: the side column every space's (in meta it is
    // the main stick, which lists them all, so it's ready when meta shows), the
    // space sticks (rams) every space's while they show (sticksShown()), and the
    // strip (the map copy) every space's too, for the tools it opens where you work.
    cx.timer.every(250, cx => {
      if (role === "rams" && !sticksShown()) return;
      this.gitInfo.tick(spaces(), panes(), cx);
      // LANG reads the shown space's repo (langs.js reads only when it must).
      if (role === "side" && level() === "space" && this.langs) {
        const s = activeSpace(), g = s ? this.gitInfo.info(s, panes()) : null;
        if (g?.top) this.langs.tick(s.machine, g.top, g.branch, cx);
      }
    });
    if (role === "side") {
      // Other machines, as Traveler lists them: `hc machine ls`, every 15 s.
      this.machines = [];
      this.refreshMachines(cx);
      cx.timer.every(15000, cx => { if (window()?.active) this.refreshMachines(cx); });
      // In meta this column is the main stick (all.js).
      this.all = new AllStick(this);
      this.langs = new LangData();
      // The running commands' last lines, for its heap's rows (the space level's).
      this.tail = new Tail();
      cx.timer.every(2000, cx => {
        if (window()?.active && level() === "space") this.readTails(cx, activeSpace()?.id ?? "");
      });
      // The keyboard, while ctrl-b h has given it to this column (keyboard()).
      this.handle = cx.focus_handle();
      this.kb = null;
      cx.spawn(async cx => {
        for (;;) {
          const c = await nextCommand();
          if (c !== "focus") continue;
          this.kb = { at: this.kb?.at ?? 0, since: Date.now() };
          this.handle.focus();
          cx.notify();
        }
      });
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
        if (!window()?.active || !sticksShown()) return;
        this.update(readScene(this));
        this.checkExits(cx);
        cx.notify();
      });
      // The running commands' last lines, for the sticks' heaps (while they show).
      this.tail = new Tail();
      cx.timer.every(2000, cx => {
        if (window()?.active && sticksShown()) this.readTails(cx);
      });
      this.bounce("up", cx);
      return;
    }
    if (role) return;
    // A drag on the side column's edge is kept for the level it was made in
    // (watchSide, keepSide), and so is showing or hiding it (watchHidden). Only
    // an active window can be dragged.
    // follow's trip (where it took SP, and where SP was before) and its move
    // back while that hasn't shown yet (follow(), goBack()).
    this.trip = null;
    this.backTo = null;
    cx.timer.every(250, () => {
      if (!window()?.active) return;
      this.watchSide(level());
      this.keepSide();
      this.watchHidden(level());
    });
    // The commands running in your tabs (procs.js): kept here (as it draws, and
    // every second), shared with the other copies as "ram.procs"; their last
    // lines are read here too, so a command that ends keeps its last one.
    this.tail = new Tail();
    cx.timer.every(1000, () => this.trackProcs());
    cx.timer.every(2000, cx => { if (window()?.active) this.readTails(cx); });
    // The open hunk reviews: polled here, shared with the other copies as
    // "ram.hunk.sessions".
    this.sessions = new Sessions();
    cx.timer.every(1000, cx => {
      if (window()?.active) this.sessions.tick(cx, labelled(HUNK_LABEL).size > 0);
    });
    // Commands for keys or the CLI (every copy hears them; this one acts):
    // ram.meta (meta at SP; again: the space level), ram.space (the space level
    // at the bright BP), ram.hunk (the space you work in's review: its last
    // one, else the menu; on a review: back), ram.git (lazygit), ram.rg
    // (search, search.js), ram.follow, ram.enter (the e square), ram.bp (BP moves to SP),
    // ram.peek (P: meta's sticks, or the space level's peek strip, on or off),
    // ram.changes (the main stick's view), ram.zoom, ram.back. "focus": the
    // keyboard, handed straight back.
    cx.spawn(async cx => {
      for (;;) {
        const c = await nextCommand();
        const lvl = level();
        if (c === "focus") { run("pane.go", { direction: "down" }); continue; }
        if (c === "meta" || c === "zoom") this.goMeta();
        else if (c === "space") this.enter();
        else if (c === "hunk") this.goHunk(cx);
        else if (c === "git") { const s = frameSpace(); if (s) this.openLazygit(s, cx); }
        else if (c === "rg") this.search(cx);
        else if (c === "follow") this.toggleFollow();
        else if (c === "enter") setShared("ram.enter", shared("ram.enter") !== true);
        else if (c === "bp") this.bpHere();
        else if (c === "peek") {
          if (lvl === "meta") setShared(STICKS, shared(STICKS) === false);
          else setShared("ram.peek", shared("ram.peek") === false);
        }
        else if (c === "changes") {
          // The main stick's changes view; outside meta, meta with it. The main
          // stick is meta's side column: hidden, it shows again, and meta keeps it.
          if (lvl !== "meta") { setShared("ram.all.mode", "changes"); keepHidden("meta", false); setShared("ram.zoom", "meta"); }
          else if (sidebarHidden()) { setShared("ram.all.mode", "changes"); keepHidden("meta", false); run("layout.show", { id: "sidebar" }); }
          else setShared("ram.all.mode", shared("ram.all.mode") === "changes" ? "memory" : "changes");
        }
        else if (c === "back") this.back(cx);
        cx.notify();
      }
    });
  }

  // The keyboard came here (ctrl-b j, k): give it straight back, toward DIR.
  bounce(dir, cx) {
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") run("pane.go", { direction: dir });
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
  // It shows or hides as the level keeps it (sideHidden(); a show or hide of
  // yours not kept yet is the level being left's too). At the start it stays as
  // the layout has it, which the level then keeps (watchHidden()).
  // Then the level's place shows (restore()): not at the start, where Herdr
  // shows what it showed, nor while a tool's tab is being opened (it shows that).
  applyLevel(lvl, cx) {
    if (this.applied === lvl) return;
    const was = this.applied;
    if (was) { this.watchSide(was); this.keepSide(true); this.watchHidden(was); }
    this.applied = lvl;
    const L = LEVELS[lvl], side = sideWidth(lvl);
    this.sideWant = { px: side, at: Date.now() };
    // Where the side column is going: an own show or hide still on its way
    // decides (watchHidden() above dropped one that landed or went stale), else
    // the layout. The level's own goes after it.
    const pending = this.hideWant;
    const now = pending ? pending.hidden : sidebarHidden(), hide = was ? sideHidden(lvl) : now;
    const toggle = now !== null && hide !== now ? (hide ? "layout.hide" : "layout.show") : null;
    if (toggle) this.hideWant = { hidden: hide, at: Date.now() };
    cx.spawn(async () => {
      run("layout.resize", { id: "ram-map", ...L.map });
      run("layout.resize", { id: "sidebar", px: side });
      if (toggle) run(toggle, { id: "sidebar" });
    });
    if (was && !opening()) this.restore(lvl, cx);
  }

  // The space sticks' block (ram-rams): shown while they show (sticksShown():
  // meta, unless P hid them).
  applySticks(cx) {
    const want = sticksShown();
    if (this.sticksOn === want) return;
    this.sticksOn = want;
    cx.spawn(async () => run(want ? "layout.show" : "layout.hide", { id: "ram-rams" }));
  }

  // Whether you showed or hid the side column (^b b, the b square): the layout's
  // flag for it moved away from where it settled after the level's own show or
  // hide (that one is waited for, up to 2 s, so it never counts as yours). The
  // level keeps it (keepHidden()); the first look keeps what the layout has.
  watchHidden(lvl) {
    const hidden = sidebarHidden();
    if (hidden === null || this.applied !== lvl) return;
    const want = this.hideWant;
    if (want) {
      if (hidden !== want.hidden && Date.now() - want.at < 2000) return;
      this.hideWant = null;
      this.hiddenBase = hidden;
      return;
    }
    if (hidden === this.hiddenBase) return;
    this.hiddenBase = hidden;
    keepHidden(lvl, hidden);
  }

  // A level change shows that level's place: SP for meta, the bright BP for
  // the space level, or a fresh ram.goto instead. Until it shows (3 s at most)
  // nothing is tracked, so the place being left isn't taken for the new one's.
  restore(lvl, cx) {
    const asked = shared(GOTO);
    let to = asked && Date.now() - (asked.at ?? 0) < 3000 ? live(asked) : null;
    if (asked) cx.spawn(async () => setShared(GOTO, null));
    to ??= lvl === "meta" ? spPlace() : bpPlace(isToolTab);
    const now = shownPlace();
    if (!to || (to.tab === now?.tab && (!to.pane || to.pane === now?.pane))) return;
    this.restoring = { tab: to.tab, at: Date.now() };
    cx.spawn(async () => show(to));
  }

  // The peek strip's block, shown while it has something to show, as tall as the
  // space level's side column says (shared PEEK_H, sharePeekHeight()), else its
  // layout's 180 px.
  applyPeek(want, cx) {
    const kept = Number(shared(PEEK_H)), px = Number.isFinite(kept) && kept >= PEEK_MIN ? kept : 180;
    if (want && this.peekPx !== px) {
      this.peekPx = px;
      cx.spawn(async () => run("layout.resize", { id: "ram-peek", px }));
    }
    if (this.peekShown === want) return;
    this.peekShown = want;
    cx.spawn(async () => run(want ? "layout.show" : "layout.hide", { id: "ram-peek" }));
  }

  // The side column (space level): the peek strip's height, PX design px (whole px,
  // and only when it changed: a resize moves the terminal's rows).
  sharePeekHeight(px, cx) {
    const want = Math.max(PEEK_MIN, Math.round(px));
    if (shared(PEEK_H) !== want) cx.spawn(async () => setShared(PEEK_H, want));
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

  // ---------------------------------------------------------------- the pointers (pointers.js)

  // What shows is the level's place: in meta SP follows it, in the space level
  // the frame (the space you work in) and its BP do (a tool's tab is never a BP).
  // When a tool's tab shows, where you were is kept (came); when it closes (the
  // tool quit) you go back there. The review shown last in each space is kept
  // for ^b r. Nothing is tracked while a tool's tab is being opened, or until a
  // level's place shows (restore()).
  track(lvl, cx) {
    const now = shownPlace();
    if (!now || opening()) return;
    if (this.restoring) {
      if (now.tab !== this.restoring.tab && Date.now() - this.restoring.at < 3000) return;
      this.restoring = null;
    }
    const tool = isToolTab(now.tab), was = this.shown, set = (k, v) => cx.spawn(async () => setShared(k, v));
    this.shown = { ...now, level: lvl, tool };
    if (was?.tool && was.tab !== now.tab && !live(was)) { if (this.backFromTool(lvl, was, cx)) return; }
    else if (tool && was && !was.tool && was.tab !== now.tab) set(CAME, { level: was.level, space: was.space, tab: was.tab, pane: was.pane });
    else if (!tool && was?.tool && shared(CAME)) set(CAME, null);
    if (lvl === "meta") {
      const sp = shared(SP);
      if (sp?.space !== now.space || sp?.tab !== now.tab || (sp?.pane ?? null) !== now.pane) set(SP, { space: now.space, tab: now.tab, pane: now.pane });
    } else {
      if (shared(FRAME) !== now.space) set(FRAME, now.space);
      const bp = shared(BP) ?? {};
      if (!tool && bp[now.space] !== now.tab) set(BP, { ...bp, [now.space]: now.tab });
    }
    if (isHunkTab(now.tab)) {
      const last = shared("ram.hunk.last") ?? {};
      if (last[now.space] !== now.tab) set("ram.hunk.last", { ...last, [now.space]: now.tab });
    }
  }

  // The tool's tab that showed has closed: back where you came from, in that
  // level (else, in the space level, the space's BP). False when there's
  // nowhere to go, and Herdr's choice stands.
  backFromTool(lvl, was, cx) {
    const came = shared(CAME);
    if (came) cx.spawn(async () => setShared(CAME, null));
    let to = live(came), into = came?.level ?? lvl;
    if (!to && lvl === "space") {
      const s = spaces().find(x => x.id === was.space), tab = workTab(s);
      to = tab ? { space: s.id, tab: tab.id, pane: null } : null;
      into = "space";
    }
    if (!to) return false;
    this.restoring = { tab: to.tab, at: Date.now() };
    cx.spawn(async () => {
      if (into !== lvl) { goTo(to); setShared("ram.zoom", into); }
      else show(to);
    });
    return true;
  }

  // Show a space (and one of its tabs) without changing the level: clicks in
  // meta move SP and stay in meta; in the space level they move the BP. A
  // space alone shows its BP tab (a stick or a STACK row: where its mark is).
  go(spaceId, tabId) {
    const s = spaces().find(x => x.id === spaceId);
    if (!s) return;
    const tab = tabId ?? workTab(s)?.id;
    if (tab) run("tab.select", { id: tab }); else run("space.select", { id: s.id });
  }

  // The space level (the space button, ^b i), at the bright BP; with a space
  // (and a tab), there instead.
  enter(spaceId, tabId) {
    const s = spaceId ? spaces().find(x => x.id === spaceId) : null;
    if (s) goTo({ tab: tabId ?? workTab(s)?.id });
    setShared("ram.zoom", "space");
  }

  // meta (^b m, its button), at SP; in meta, the space level.
  goMeta() {
    if (level() === "meta") this.enter(); else setShared("ram.zoom", "meta");
  }

  // ^b I, a click on SP's mark: the bright BP moves to SP's tab (its space is
  // now the one you work in; a tool's tab never is a BP, so then only the
  // space changes). In the space level that shows it; from meta, only with
  // the e square on.
  bpHere() {
    const sp = spPlace();
    if (!sp) return;
    setShared(FRAME, sp.space);
    if (!isToolTab(sp.tab)) setShared(BP, { ...(shared(BP) ?? {}), [sp.space]: sp.tab });
    if (level() === "space") show(sp);
    else if (shared("ram.enter") === true) { goTo(sp); setShared("ram.zoom", "space"); }
  }

  // ---------------------------------------------------------------- tools

  // Where a tool opened now shows: meta stays meta while the e square is off
  // (the tool shows in meta's pane, so SP moves onto it); else the space level.
  toolLevel() { return level() === "meta" && shared("ram.enter") !== true ? "meta" : "space"; }

  // Show a tool's open tab, in toolLevel().
  showTool(tabId) {
    if (!tabId) return;
    if (this.toolLevel() === "space" && level() === "meta") { goTo({ tab: tabId }); setShared("ram.zoom", "space"); }
    else run("tab.select", { id: tabId });
  }

  // What a space's tools open on: the top of the repo it's named after, else
  // that folder (lazygit's dialog offers to make it a repo; search looks there
  // when the keyboard isn't in a terminal).
  // undefined while git hasn't looked at it yet; "" when there's no folder.
  toolFolder(s) {
    const ps = panes(), g = this.gitInfo?.info(s, ps);
    if (g === undefined) return undefined;
    return g?.top || this.gitInfo?.folders(s, ps)[0] || s.folder || "";
  }

  // A tool (TOOLS) in space S, at toolFolder(). lazygit in a folder that isn't
  // in a repo first asks what lazygit would ask (its dialog, gitinit.js), unless
  // a lazygit tab is open there already.
  openTool(s, cx, kind) {
    const tool = TOOLS[kind], folder = this.toolFolder(s);
    if (folder === undefined) { this.noRepo(s, undefined, tool); return; }
    if (!folder) { notify({ title: `Nowhere for ${tool.name}`, body: `${s.name} has no folder yet.`, level: "info", timeout: 4000 }); return; }
    if (kind === "lazygit" && this.gitInfo?.info(s, panes()) === null && !this.toolTab(s, tool, folder)) {
      this.gitInit(s, folder);
      return;
    }
    this.openToolAt(s, cx, kind, folder);
  }

  // A tool's open tab in space S for FOLDER, or null.
  toolTab(s, tool, folder) { return s.tabs.find(t => sameDir(toolFolderOf(t.id, tool.label), folder)) ?? null; }

  // A tool (TOOLS) at FOLDER in space S: its tab for that folder if one is open,
  // else a new tab there, named after the tool and the folder and labelled for
  // RAM. It shows in toolLevel() (a new tab shows as Herdr makes it; ram.opening
  // keeps RAM from moving anything meanwhile).
  openToolAt(s, cx, kind, folder) {
    const tool = TOOLS[kind], open = this.toolTab(s, tool, folder);
    if (open) { this.showTool(open.id); return; }
    if (opening()) return;
    const into = this.toolLevel(), name = `${tool.name} ${folder.replace(/\/+$/, "").split("/").pop()}`;
    setShared("ram.opening", { space: s.id, at: Date.now() });
    if (into !== level()) setShared("ram.zoom", into);
    cx.spawn(async cx => {
      const fail = body => notify({ title: `Couldn't open ${tool.name}`, body, level: "error" });
      try {
        const r = await exec("herdr-app", ["do", "tab.new", "--space", s.id, "--name", name, "--folder", folder,
          "--argv", JSON.stringify(tool.argv)]);
        let made = {};
        try { made = JSON.parse(r.stdout || "{}"); } catch (_) { made = {}; }
        if (r.code !== 0 || made.error || !made.terminal) fail(made.error || r.stderr.trim() || "herdr-app do tab.new failed");
        else if (!tool.own) await hc(["label", made.terminal, `${tool.label}=${folder}`]);
      } catch (e) { fail(String(e?.message ?? e)); }
      setShared("ram.opening", null);
      cx.notify();
    });
  }

  openLazygit(s, cx) { this.openTool(s, cx, "lazygit"); }

  // GIT's dialog for space S's FOLDER, not in a repo (gitinit.js).
  gitInit(s, folder) {
    openOverlay({ mod: "ram", kind: "dialog", width: 520, height: 340,
      props: { role: "git-init", space: s.id, name: s.name, folder, machine: s.machine ?? null } });
  }

  // What the dialog picked (shared TOOL_OPEN, taken once, fresh ones only):
  // lazygit at that folder, in that space.
  takeToolRequest(cx) {
    const req = shared(TOOL_OPEN);
    if (!req || req.at === this.toolReq || Date.now() - (req.at ?? 0) > 10000) return;
    this.toolReq = req.at;
    cx.spawn(async () => setShared(TOOL_OPEN, null));
    const s = spaces().find(x => x.id === req.space);
    if (s && TOOLS[req.kind] && req.folder) this.openToolAt(s, cx, req.kind, req.folder);
  }

  // ^b / (ram.rg) and the space level's / search: the search window
  // (search.js) for the terminal you're in, in its space; S: the button's
  // space, where the terminal you're in is unless the keyboard is elsewhere.
  search(cx, s = null) {
    const f = focused();
    const space = s ?? spaces().find(x => x.id === f?.space) ?? frameSpace();
    if (!space) return;
    const from = f?.space === space.id ? f : null;
    cx.spawn(async () => openSearch(space, from, this.toolFolder(space) || ""));
  }

  // A stick's git line: lazygit for that stick's space.
  openLazygitIn(s, cx) { this.openLazygit(spaces().find(x => x.id === s.id) ?? s, cx); }

  // ---------------------------------------------------------------- hunk (hunk.js)

  // The reviews RAM opened in space S (hunk.js reviewsIn()).
  reviewsHere(s) { return s ? reviewsIn(reviews(), s.id) : []; }

  // ^b r, HUNK's header: on a review, back where you came from; else the
  // review shown last in the space you work in (for its repo), or its latest,
  // or the menu when it has none.
  goHunk(cx) {
    const now = shownTab();
    if (now && isHunkTab(now.id)) { this.back(cx); return; }
    const s = frameSpace();
    if (!s) return;
    const top = this.gitInfo?.info(s, panes())?.top;
    const mine = top ? forRepo(this.reviewsHere(s), top) : [];
    if (!mine.length) { this.hunkMenu(s); return; }
    const last = shared("ram.hunk.last")?.[s.id];
    this.showTool((mine.find(e => e.tab === last) ?? mine.at(-1)).tab);
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
    const s = spaces().find(x => x.id === req.space) ?? frameSpace();
    const cmd = COMMANDS.find(c => c.id === req.cmd) ?? COMMANDS[0];
    const g = s ? this.gitInfo?.info(s, panes()) : null;
    if (!s) return;
    if (!g) { this.noRepo(s, g, { name: "hunk" }); return; }
    if (opening()) return;
    const ref = cmd.ref ? String(req.ref ?? "").trim() : "";
    const label = labelOf(cmd, ref), last = s.tabs.length + 1, into = this.toolLevel();
    setShared("ram.opening", { space: s.id, at: Date.now() });
    if (into !== level()) setShared("ram.zoom", into);
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

  // A review's x (its line under HUNK, while the pointer is on it; x with the
  // keyboard): closes its tab, after asking when it has notes (they go with it
  // unless saved with /hunk save).
  closeHunk(id, e, size, shown) {
    const t = theme();
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(2)
      .text_color(shown ? t.muted : "#00000000")
      .when(shown, el => el.cursor_pointer().hover(st => st.bg(t.hover).text_color(RED)).tooltip("Close this review"))
      .on_mouse_down("left", (_e, cx) => { if (shown) cx.stop_propagation(); })
      .on_click((_e, cx) => {
        if (!shown) return;
        cx.stop_propagation();
        this.closeReview(e);
      })
      .child(svg("mods/pane/close.svg").size(size * 0.7));
  }

  closeReview(e) {
    const notes = (e.mine ?? 0) + (e.agent ?? 0);
    if (!e.tab) return;
    if (!notes) { run("tab.close", { id: e.tab }); return; }
    openOverlay({ mod: "confirm", kind: "dialog", width: 440, height: 180, props: {
      title: `Close hunk ${nameOf(e)}?`,
      detail: `Its ${notes} ${notes === 1 ? "note goes" : "notes go"} with it, unless saved first (/hunk save).`,
      command: { name: "tab.close", args: { id: e.tab, confirmed: true } } } });
  }

  // The open reviews per space, for the markers (counted once per render).
  countReviews() {
    const n = new Map();
    for (const e of reviews()) if (e.space) n.set(e.space, (n.get(e.space) ?? 0) + 1);
    this.reviewCount = n;
  }

  // ^b g, GIT or ^b r while git hasn't looked yet, or ^b r where there's no
  // repo: say so. G undefined: its folder hasn't been looked at yet (it takes
  // a moment after a cd).
  noRepo(s, g, tool) {
    const folder = this.gitInfo?.folders(s, panes())[0] ?? s.folder ?? "";
    const where = folder && folder.startsWith(home()) ? "~" + folder.slice(home().length) : folder || s.name;
    if (g === undefined) notify({ title: "Checking git", body: `Still looking at ${where}. Try again in a moment.`, level: "info", timeout: 3000 });
    else notify({ title: "Not a git repo", body: `${where} isn't in a git repository, so ${tool.name} has nothing to open.`, level: "info", timeout: 4000 });
  }

  // ^b r on a review (ram.back too): back where you came from, in that level;
  // else, in the space level, the space's BP.
  back(cx) {
    const came = shared(CAME), to = live(came);
    if (to) {
      cx.spawn(async () => setShared(CAME, null));
      if ((came.level ?? level()) !== level()) { goTo(to); setShared("ram.zoom", came.level); }
      else show(to);
      return;
    }
    const s = activeSpace(), tab = workTab(s);
    if (tab && tab.id !== shownTab()?.id) run("tab.select", { id: tab.id });
  }

  // follow (the f square, ^b f). On: shared "ram.follow". It works in both
  // levels, so turning it on never changes the level.
  toggleFollow() {
    setShared("ram.follow", shared("ram.follow") !== true);
  }

  // With follow on, an agent that starts needing you gets SP: in meta its
  // space and tab show (its stick lights up, the terminal is that agent);
  // in the space level SP moves without changing the screen (the meta button
  // lights up, the peek strip shows it). While the agent on SP's tab needs you
  // too, follow waits, and moves on to the next once you've answered (the one
  // waiting longest first). When you answer the last one, SP goes straight
  // back to where it was before follow's first move (this.trip), unless that
  // tab has closed: then it stays. An agent that asks again gets SP again at
  // once, even if it asks before the move back has shown (this.backTo). It
  // only acts on those changes, so moving SP yourself is never undone: that
  // also drops a wait and the way back. The main stick never moves.
  follow(data, cx) {
    const on = shared("ram.follow") === true, meta = level() === "meta";
    // A level change into meta hasn't shown SP yet (restore()): what shows isn't SP,
    // so nothing is decided until it is (the next render looks again).
    if (on && meta && this.restoring) return;
    const now = new Map(data.list.filter(a => a.status === "blocked" && !a.child && a.pane)
      .map(a => [a.address, a.status_ms ?? 0]));
    // Turning follow on counts every agent that needs you as new.
    const seen = on && !this.followOn ? new Map() : this.followSeen ?? new Map();
    this.followSeen = now;
    this.followOn = on;
    if (!on) { this.followWait = null; this.trip = null; this.backTo = null; return; }
    // SP: in meta the tab that shows, outside meta the one kept.
    const sp = meta ? shownPlace() : spPlace();
    // The move back hasn't shown yet: nothing is decided on the tab it's
    // leaving. Once it shows (or 3 s on, if it never does), follow looks at
    // everything that needs you again, so an ask in between isn't missed.
    let again = false;
    if (this.backTo) {
      if (meta && sp?.tab !== this.backTo.tab && Date.now() - this.backTo.sent < 3000) return;
      this.backTo = null;
      again = true;
    }
    this.watchTrip(sp?.tab);
    // On the tab follow took SP to, with nothing needing you any more (you
    // answered, or it was answered before SP got there): straight back.
    if (this.trip?.arrived && !now.size) { this.followWait = null; this.goBack(meta, cx); return; }
    if (this.followWait && sp?.tab !== this.followWait) this.followWait = null;
    const fresh = [...now].some(([address, ms]) => seen.get(address) !== ms);
    const answered = [...seen.keys()].some(address => !now.has(address));
    if (!fresh && !answered && !this.followWait && !again) return;
    const blocked = data.list.filter(a => now.has(a.address));
    if (!blocked.length) { this.followWait = null; return; }
    if (sp && blocked.some(a => a.tab === sp.tab)) { this.followWait = sp.tab; return; }
    this.followWait = null;
    const next = blocked.sort((a, b) => (a.status_ms ?? 0) - (b.status_ms ?? 0) || a.address.localeCompare(b.address))[0];
    // The first move remembers where SP was; the moves after it keep that.
    if (!this.trip && sp) this.trip = { home: sp };
    if (this.trip) Object.assign(this.trip, { to: next.tab, arrived: !meta, sent: Date.now() });
    if (meta) cx.spawn(async () => run("agent.focus", { terminal: next.address }));
    else cx.spawn(async () => setShared(SP, { space: next.space, tab: next.tab, pane: next.pane ?? null }));
  }

  // The tab follow's last move took SP to: arrived once SP is on it. SP on any
  // other tab after that (or 3 s on, if the move never landed) is your own
  // move, so follow won't take it back.
  watchTrip(tab) {
    const trip = this.trip;
    if (!trip) return;
    if (tab && tab === trip.to) { trip.arrived = true; return; }
    if (trip.arrived || Date.now() - trip.sent > 3000) this.trip = null;
  }

  // You answered the last agent that needed you, on the tab follow took SP to
  // (or it was answered before SP got there): SP goes back to where it was
  // before follow's first move, unless that tab has closed. In meta that
  // shows; outside meta only SP moves.
  goBack(meta, cx) {
    const trip = this.trip;
    this.trip = null;
    const home = live(trip.home);
    if (!home) return;
    if (meta) {
      this.backTo = { tab: home.tab, sent: Date.now() };
      cx.spawn(async () => show(home));
    } else cx.spawn(async () => setShared(SP, home));
  }

  // follow's return address for the sticks (shared RET, their dim RET▸): where
  // SP goes back to, while follow is away; null once it's home (or gave up).
  shareRet(cx) {
    const want = this.trip?.home ?? null;
    if (JSON.stringify(want) !== JSON.stringify(shared(RET) ?? null)) cx.spawn(async () => setShared(RET, want));
  }

  // ---------------------------------------------------------------- the commands in HEAP (procs.js)

  // The commands running in your tabs, counted and kept (procs.js track()): one
  // that ends while its tab is on screen in an active window is seen.
  trackProcs() {
    const prev = shared(PROCS) ?? {};
    const tab = window()?.active ? shownTab() : null;
    const next = track(prev, terminals(), panes(), new Set(tab ? [tab.id] : []), this.tail.lines, Date.now());
    if (!sameProcs(prev, next)) setShared(PROCS, next);
  }

  // Read the running commands' last lines (Tail): those in space SPACE (null:
  // every space; the strip's copy keeps a command's last line for when it ends).
  readTails(cx, spaceId = null) {
    const state = shared(PROCS) ?? {}, ps = panes(), all = spaces();
    const keep = new Set(Object.keys(state));
    const spaceOf = address => {
      const p = ps.find(x => x.terminal === address);
      return p ? all.find(x => x.tabs?.some(t => t.id === p.tab))?.id ?? null : null;
    };
    const want = Object.entries(state).filter(([address, e]) => !e.done && (spaceId === null || spaceOf(address) === spaceId)).map(([a]) => a);
    this.tail.tick(want, keep, cx);
  }

  // A command's row was opened (a peek at it): one that ended is seen now.
  seeProc(a) {
    const state = shared(PROCS) ?? {};
    if (!state[a.address]?.done) return;
    const next = { ...state };
    delete next[a.address];
    setShared(PROCS, next);
  }

  // The two levels, top right: ctrl-b then the key on each button (from
  // keys.json, so they always match), the current one lit, and each with the
  // mark of its pointer (SP▸ amber, BP▸ white), as on the sticks. While SP is
  // on an agent that needs you, meta's turns red and pulses. Then b (the side
  // column) and P (what's under the terminal: meta's sticks, the space level's
  // peek strip), each for the level you're in, lit while they show.
  levelButtons(data) {
    const t = theme(), lvl = level(), s = frameSpace();
    const key = command => shortcut(command).split(" ").slice(1).join(" ");
    const prefix = terse(shortcut("ram.meta").split(" ")[0]);
    const sp = spPlace(), asking = sp ? askingIn(data, sp.tab).length : 0;
    const button = (id, name, k, here, mark, markColor, action, tip, alarm = false) => {
      const el = h_flex().id(id).relative().w(LEVEL_W).h(26 * U).px(8 * U).gap(6 * U).flex_none()
        .items_center().justify_center().rounded(2).border(1)
        .border_color(alarm ? RED : here ? AMBER : t.input).when(alarm, b => b.bg("#3a1118")).when(here && !alarm, b => b.bg(AMBER + "1f"))
        .cursor_pointer().hover(st => st.bg(t.hover)).tooltip(tip)
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
        .when(Boolean(k), b => b.child(div().text_size(12 * U).font_semibold().text_color(alarm ? RED : AMBER).child(k)))
        .child(div().text_size(12 * U).text_color(alarm ? "#ffd0d4" : here ? AMBER : t.foreground).child(name))
        .child(div().text_size(10 * U).font_semibold().text_color(markColor).child(mark));
      if (alarm) {
        const pulse = div().absolute().top(0).left(0).right(0).bottom(0).rounded(2).border(1).border_color(RED);
        if (this.motion()) pulse.loop("opacity", { from: 0.2, to: 1, period: 900 });
        el.child(pulse);
      }
      return el;
    };
    const square = (id, k, on, action, tip) => div().id(id).size(26 * U).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).when(on, el => el.bg(AMBER + "1f"))
      .text_size(12 * U).font_semibold().text_color(on ? AMBER : t.muted).cursor_pointer()
      .hover(st => st.bg(t.hover).text_color(AMBER)).tooltip(tip)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); action(); }).child(k);
    const sideShown = sidebarHidden() !== true, where = lvl === "meta" ? "in meta" : "in the space level";
    // P: what's under this level's terminal, meta's sticks or the space level's peek strip.
    const under = lvl === "meta"
      ? { key: STICKS, what: "the sticks in meta" }
      : { key: "ram.peek", what: "the peek strip in the space level (SP's tab; under a review: where you came from)" };
    const underOn = shared(under.key) !== false;
    return h_flex().id("ram-levels").flex_none().gap(6 * U).items_center()
      .when(Boolean(prefix), el => el.child(div().text_size(11 * U).text_color(t.dim).child(prefix)))
      .child(button("ram-level-meta", "meta", key("ram.meta"), lvl === "meta", "SP\u25b8", AMBER, () => this.goMeta(),
        asking ? `meta: SP is on ${asking === 1 ? "an agent that needs" : `${asking} agents that need`} you` : "meta: every space, at SP (the pointer that jumps)",
        asking > 0))
      .child(button("ram-level-space", "space", key("ram.space"), lvl === "space", "BP\u25b8", BP_ON, () => this.enter(),
        s ? `space: ${s.name}, at its BP (your work tab)` : "No space yet"))
      .child(square("ram-sidebar", key("layout.toggle:sidebar") || "b", sideShown, () => run("layout.toggle", { id: "sidebar" }),
        `${sideShown ? "Hide" : "Show"} the side column ${where}${shortcut("layout.toggle:sidebar") ? "  " + terse(shortcut("layout.toggle:sidebar")) : ""}`))
      .child(square("ram-peek-toggle", key("ram.peek") || "P", underOn, () => setShared(under.key, !underOn),
        `${underOn ? "Hide" : "Show"} ${under.what}${shortcut("ram.peek") ? "  " + terse(shortcut("ram.peek")) : ""}`));
  }

  // ---------------------------------------------------------------- the keyboard in the side column

  // ctrl-b h moves the keyboard into the side column (it's "focusable", and
  // pane.go sends it "focus"). Its clickable parts are listed as they're drawn
  // (reach()), one outlined: ↑↓ (or j k) move, Enter does what a click does,
  // x what an ✕ does, r renames, ← → fold the main stick's spaces, and Esc
  // gives the keyboard back to the terminal. While it has the keyboard, the
  // keys row shows the keys for the outlined part instead.
  kbStart() { this.kbList = []; }

  // Whether this column has the keyboard (a moment's grace while it arrives).
  kbOn() {
    if (!this.kb) return false;
    if (this.handle?.is_focused?.() || Date.now() - this.kb.since < 500) return true;
    this.kb = null;
    return false;
  }

  // A clickable part, ACT its keys: { open, close, rename, fold(open), hint }.
  // The outlined one is drawn with a cyan outline over it.
  reach(el, id, act) {
    const at = this.kbList?.length ?? 0;
    this.kbList?.push({ id, ...act });
    if (!this.kbOn() || this.kb.at !== at) return el;
    return el.relative().child(div().absolute().top(0).left(0).right(0).bottom(0).rounded(2).border(1).border_color(CYAN));
  }

  // The column's root takes the keys while it has the keyboard.
  kbRoot(el, cx) {
    if (!this.handle) return el;
    return el.track_focus(this.handle).on_key_down((e, cx) => this.kbKey(e, cx));
  }

  kbKey(e, cx) {
    if (!this.kbOn()) return;
    const list = this.kbList ?? [], k = e.key;
    if (k === "escape") {
      this.kb = null;
      cx.stop_propagation();
      run("pane.go", { direction: "right" });
      cx.notify();
      return;
    }
    this.kb.at = Math.max(0, Math.min(this.kb.at, list.length - 1));
    const it = list[this.kb.at];
    if (k === "down" || k === "j") this.kb.at = Math.min(list.length - 1, this.kb.at + 1);
    else if (k === "up" || k === "k") this.kb.at = Math.max(0, this.kb.at - 1);
    else if (k === "enter") it?.open?.(cx);
    else if (k === "x") it?.close?.(cx);
    else if (k === "r") it?.rename?.(cx);
    else if (k === "left" || k === "right") it?.fold?.(k === "right", cx);
    else return;
    if (this.kb) list[this.kb.at]?.scroll?.();
    cx.stop_propagation();
    cx.notify();
  }

  // The bottom row: Settings / Keys / Commands, or while the column has the
  // keyboard the keys for the outlined part.
  kbBottom(compact) {
    if (!this.kbOn()) return this.keysRow(compact);
    const t = theme(), it = (this.kbList ?? [])[Math.max(0, Math.min(this.kb.at, (this.kbList ?? []).length - 1))];
    const part = (k, what) => h_flex().gap(4 * U).flex_none().items_center()
      .child(div().text_size(10.5 * U).font_semibold().text_color(AMBER).child(k))
      .child(div().text_size(10.5 * U).text_color(t.muted).child(what));
    return h_flex().id("ram-kb-keys").h(KEYS_H).flex_none().px(10 * U).gap(10 * U).items_center().overflow_hidden()
      .border_t(1).border_color(CYAN)
      .child(part("\u2191\u2193", "move"))
      .when(Boolean(it?.open), el => el.child(part("\u23ce", it.hint ?? "open")))
      .when(Boolean(it?.close), el => el.child(part("x", "close")))
      .when(Boolean(it?.rename), el => el.child(part("r", "rename")))
      .when(Boolean(it?.fold), el => el.child(part("\u2190\u2192", "fold")))
      .child(part("esc", "back"));
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

  // Search's button for space S, drawn as meta's d diff: its ^b key in amber,
  // then "search" (the window over the window, search.js).
  searchButton(s) {
    const t = theme(), k = this.key("rg"), full = shortcut("rg");
    return h_flex().id("ram-rg").h(15 * U).px(5 * U).gap(4 * U).flex_none().items_center().rounded(2)
      .border(1).border_color(t.input)
      .cursor_pointer().hover(st => st.bg(t.hover))
      .tooltip(`Search ${s.name}${full ? "  " + terse(full) : ""}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.search(cx, s); })
      .children(k ? [div().text_size(10 * U).font_semibold().text_color(AMBER).child(k)] : [])
      .child(div().text_size(10 * U).text_color(t.muted).child("search"));
  }

  windowButtons() {
    if (!window()?.buttons) return [];
    return [["min", "_", "window.minimize"], ["max", "[]", "window.maximize"], ["close", "x", "window.close"]]
      .map(([id, text, command]) => this.control(`ram-${id}`, text, () => run(command)));
  }

  newSpace(size = NEW_W) {
    const t = theme(), k = shortcut("space.new");
    return div().id("ram-new-space").w(size).h(size).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_dashed().border_color(t.input).text_size(15 * U).text_color(t.muted).cursor_pointer()
      .hover(st => st.bg(t.hover).text_color(AMBER)).tooltip(`New space${k ? "  " + terse(k) : ""}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); run("space.new"); }).child("+");
  }

  // A switch under meta's +, as wide as it: its letter the key after ctrl-b,
  // lit while it's on.
  toggle(id, command, letter, on, action, tip, size = NEW_W) {
    const t = theme(), k = shortcut(command);
    return div().id(id).w(size).h(size).flex_none().flex().items_center().justify_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).when(on, el => el.bg(AMBER + "1f"))
      .text_size(13 * U).font_semibold().text_color(on ? AMBER : t.muted).cursor_pointer()
      .hover(st => st.bg(t.hover).text_color(AMBER)).tooltip(tip + (k ? "  " + terse(k) : ""))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); action(); }).child(this.key(command) || letter);
  }

  // follow's switch (f): SP goes to each agent that needs you, then back.
  followButton() {
    const on = shared("ram.follow") === true;
    return this.toggle("ram-follow", "ram.follow", "f", on, () => this.toggleFollow(), on
      ? "follow is on: SP goes to each agent that needs you, then back (click to stop)"
      : "follow: SP goes to each agent that needs you, then back");
  }

  // e (enter): the tools and ^b I take you into the space level from meta.
  enterButton() {
    const on = shared("ram.enter") === true;
    return this.toggle("ram-enter", "ram.enter", "e", on, () => setShared("ram.enter", !on), on
      ? "e is on: from meta, ^b I and the tools take you into the space level (click: stay in meta)"
      : "e: from meta, ^b I and the tools take you into the space level (off: you stay in meta)");
  }

  menu(spec, cx) {
    cx.stop_propagation();
    openOverlay({ mod: "menu", kind: "popup", width: 200, ...spec });
  }

  // + for a space's tabs: push a frame (the new-tab menu in that space).
  // A square of SIDE px.
  pushTab(s, side) {
    const k = shortcut("newmenu");
    return this.mini(`tab-new-${s.id}`, "+", `Push a frame: new tab in ${s.name}${k ? "  " + terse(k) : ""}`, () => {
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

  // A heap row or a block: the agent (its pane, or a peek for a sub-agent); a
  // command: a peek at its output, over the tab you're on.
  open(a) {
    if (a.proc) { this.seeProc(a); run("terminal.peek", { terminal: a.address }); return; }
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
      .bg(CELL[state] ?? CELL.shell).border(1).border_color(a.focused ? AMBER : state === "done" ? CYAN : (LED[state] ?? LED.shell) + "66")
      .tooltip(tipOf(a))
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
    const done = doneIn(data, s.id);
    // Every row fits inside the stick: its border (1 px each side) and a row's
    // padding (6 * U each side) leave INNER px, and each row's parts are sized
    // to it here, so nothing is cut off at the stick's edge.
    const inner = width - 2 - 12 * U, GAP = 6 * U;
    // The header: address, name (a few letters at least), ◆n, @machine, faults,
    // finished agents (+n). In a narrow stick FAULT n becomes !n, +n goes, then
    // @machine truncates and goes (the tooltip and the dashed outline still say
    // where the space is).
    const mark = this.marker(s.id), markW = mark ? textW(`\u25c6${this.reviewCount?.get(s.id) ?? 0}`, 10 * U) + 2 * U : 0;
    const faultW = compact => textW(compact ? `!${blocked}` : `FAULT ${blocked}`, (compact ? 10 : 10.5) * U) + (compact ? 6 : 8) * U + 2;
    const headUsed = (compact, withDone = done > 0) => textW(ADDR(i), 11 * U) + GAP + Math.min(textW(s.name ?? "", 12 * U), textW("abc", 12 * U))
      + (mark ? GAP + markW : 0) + (blocked ? GAP + faultW(compact) : 0) + (withDone ? GAP + finishedW(done) : 0);
    const tight = blocked > 0 && headUsed(false) > inner;
    const showDone = done > 0 && headUsed(tight) <= inner;
    const machineW = s.machine ? Math.min(textW(`@${s.machine}`, 10.5 * U), 70 * U, inner - headUsed(tight, showDone) - GAP) : 0;
    const header = h_flex().id(`head-${s.id}`).h(HEADER_H).flex_none().px(6 * U).gap(GAP).items_center().border_b(1).border_color(t.border)
      .cursor_pointer().tooltip(`${ADDR(i)} ${s.name}${s.machine ? " @" + s.machine : ""}: show it (drag to move it)`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (live) this.grab("space", s.id, s.machine ?? ""); })
      .on_click(() => { if (live) this.go(s.id); })
      .child(div().flex_none().text_size(11 * U).text_color(CYAN).child(ADDR(i)))
      .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(s.active ? AMBER : t.foreground).child(s.name))
      .children(mark ? [mark] : [])
      .when(machineW >= textW("@ab", 10.5 * U), el => el.child(div().flex_none().max_w(machineW).truncate().text_size(10.5 * U)
        .text_color(t.dim).child(`@${s.machine}`)))
      .when(blocked > 0, el => el.child(fault(blocked, tight)))
      .when(showDone, el => el.child(finished(done)));
    const label = text => div().h(LABELS_H).flex_none().px(6 * U).text_size(10 * U).text_color(t.dim).child(text);
    // What fits: frames get up to 55% of the room (the shown one always
    // stays), the heap what's left (the ones that need you first). A "+n more"
    // row only where it fits: both labels count them all.
    const born = bornOf(data);
    const heap = heapOf(data, s.id).sort((a, b) => born(b) - born(a));
    const room = Math.max(0, height - (HEADER_H + 2 * LABELS_H + BOTTOM_H + PINS_H + 20 * U));
    const fr = fit(s.floors.length, FRAME_H, room * 0.55, false, 1);
    const floors = pick(s.floors, fr.rows), hidden = fr.more ? s.floors.length - floors.length : 0;
    const hp = fit(heap.length, HEAP_H, room - (floors.length + (hidden ? 1 : 0)) * FRAME_H, false);
    const keep = new Set([...new Set([...heap.filter(a => a.status === "blocked"), ...heap])].slice(0, hp.rows));
    const shownHeap = heap.filter(a => keep.has(a));
    // A frame row: its pointers' mark, &n (*n where a pointer points), then the
    // arrow and the blocks (fitBlocks). SP is on one frame in all the sticks;
    // each stick's BP is on its work tab, white on the space you work in and dim
    // on the others; while follow is away, a dim RET on its return address. One
    // pointer is written out (SP\u25b8, BP\u25b8, RET\u25b8), two by their initials
    // (SB\u25b8, BR\u25b8), each in its color. A command's block (procs.js) shows
    // its state as an agent's does.
    const frameRoom = inner - SP_W - NUM_W - 2 * BLOCK_GAP;
    const spTab = this.spAt?.tab ?? null, retTab = this.retAt?.tab ?? null;
    const bpId = live ? workTab(live)?.id : null, bright = Boolean(live) && this.frameId === s.id;
    const bpColor = bright ? BP_ON : t.dim;
    const procOf = new Map(data.procs.map(p => [p.address, p]));
    const frames = floors.map(f => {
      const real = live && live.tabs?.some(x => x.id === f.id);
      const isSP = f.id === spTab, isBP = f.id === bpId, isRET = f.id === retTab, here = isSP;
      const lazygit = Boolean(real && isLazygitTab(f.id));
      const items = lazygit ? [] : f.windows.flatMap(a => [{ a: procOf.get(a.address) ?? a, small: false },
        ...(data.descendants.get(a.address) ?? []).map(kid => ({ a: kid, small: true }))]);
      const running = items.some(x => !x.small && x.a.status === "working");
      const fitted = fitBlocks(items.map(x => ({ natural: this.blockW(x.a, x.small), readable: this.blockW(x.a, x.small, 3),
        least: x.small ? KID_MIN : BLOCK_MIN })), frameRoom);
      const arrowW = fitted.arrow;
      const ptrs = [isSP && ["S", "SP", AMBER], isBP && ["B", "BP", bpColor], isRET && ["R", "RET", RET_DIM]].filter(Boolean);
      const sp = h_flex().id(`ptr-${f.id}`).w(SP_W).flex_none().items_center().text_size(10.5 * U).font_semibold();
      if (ptrs.length === 1) sp.child(div().text_color(ptrs[0][2]).child(`${ptrs[0][1]}\u25b8`));
      else if (ptrs.length) sp.children(ptrs.map(([k, , c]) => div().text_color(c).child(k))).child(div().text_color(ptrs[0][2]).child("\u25b8"));
      const bpTip = bright ? "BP: your work tab here, where the space level is" : `BP: ${s.name}'s work tab`;
      const ptrTip = isSP ? `SP${isBP ? " and BP" : ""}: the tab meta shows \u00b7 click: BP here${shortcut("ram.bp") ? " (" + terse(shortcut("ram.bp")) + ")" : ""}`
        : [isBP && bpTip, isRET && "RET: follow takes SP back here once you've answered"].filter(Boolean).join(" \u00b7 ");
      if (ptrTip) sp.tooltip(ptrTip);
      if (isSP) sp.cursor_pointer().on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); this.bpHere(); });
      if (isSP && this.motion()) sp.loop("opacity", { from: 0.45, to: 1, period: 1000 });
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
        .child(div().w(NUM_W).flex_none().text_size(11 * U).text_color(isSP ? AMBER : isBP ? (bright ? BP_ON : t.muted) : isRET ? RET_DIM : t.dim)
          .child(REF(f.index, isSP || isBP || isRET)))
        .child(arrow);
      if (lazygit) row.child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(CYAN).child(f.named ? f.name : "lazygit"));
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
    const heapRows = shownHeap.map(a => {
      const red = a.status === "blocked", fin = a.status === "done", ptr = a.tab === spTab || a.tab === bpId;
      const ref = REF(a.tab_index, ptr), name = `${a.program?.name || "agent"}${a.child ? " \u21b3" : ""}`, status = STATUS[a.status] ?? "";
      // Its light, &n, name, what it's doing and its state, in INNER px: in a
      // narrow stick the state's word goes first (the light and the row's color
      // still say it, the tooltip in words), then the name truncates.
      const nameW = Math.min(textW(name, 11.5 * U), 110 * U), statusW = status ? textW(status, 10.5 * U) : 0;
      const fixed = n => 6 * U + textW(ref, 10.5 * U) + n * GAP;
      const showStatus = Boolean(status) && inner - fixed(4) - statusW >= Math.min(nameW, textW("abc", 11.5 * U));
      const nameMax = Math.max(0, Math.min(110 * U, inner - (showStatus ? fixed(4) + statusW : fixed(3))));
      return h_flex().id(`alloc-${a.address}`).h(HEAP_H).flex_none().px(6 * U).gap(GAP).items_center().cursor_pointer()
        .when(red, el => el.bg("#2a0f14")).when(fin, el => el.bg(DONE_BG + "aa")).hover(st => st.bg(red ? "#3a1520" : t.hover))
        .tooltip(tipOf(a))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.open(a); })
        .child(led(a, 6, this.motion()))
        .child(div().flex_none().text_size(10.5 * U).text_color(a.tab === spTab ? AMBER : a.tab === bpId && bright ? BP_ON : t.dim).child(ref))
        .child(div().flex_none().max_w(nameMax).truncate().text_size(11.5 * U).text_color(red ? "#ffd0d4" : t.foreground).child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(besides(a)))
        .when(showStatus, el => el.child(div().flex_none().text_size(10.5 * U).when(fin, d => d.font_semibold())
          .text_color(red ? RED : fin ? CYAN : t[a.status] ?? t.dim).child(status)));
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
    const t = theme(), ps = panes(), data = readScene(this);
    // The exit history only shows here (agents that just ended, as "freed").
    this.update(data);
    this.checkExits(cx);
    // Each space's tabs, without hunk's reviews (each space's ◆n counts them).
    const reviewTabs = labelled(HUNK_LABEL);
    const blocks = towers(data, this.history).map(b => ({ ...b, floors: b.floors.filter(f => !isHunkTab(f.id, reviewTabs)) }));
    // The pointers, once for every stick (region()).
    this.spAt = spPlace();
    this.retAt = live(shared(RET));
    this.frameId = frameSpace()?.id ?? null;
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
      // + (a new space), then follow's f and the e switch: squares as wide as NEW_W.
      .child(v_flex().id("ram-stick-buttons").flex_none().gap(6 * U).child(this.newSpace()).child(this.followButton()).child(this.enterButton()));
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
    const t = theme(), data = readScene(this);
    const pad = 6 * U, below = machinesHeight((this.machines ?? []).length) + KEYS_H;
    const w = Math.max(160 * U, this.size.width - 2 - 2 * pad), h = Math.max(150 * U, this.size.height - 2 - below - 2 * pad);
    this.kbStart();
    return this.sized(this.kbRoot(v_flex().id("ram-side").size_full().bg(t.chrome).rounded(2).border(1).border_color(t.border).overflow_hidden(), cx))
      .child(div().id("ram-side-all").flex_1().min_h(0).p(pad).overflow_hidden().child(this.all.render(data, w, h, cx)))
      .child(this.machinesRegion(false))
      .child(this.kbBottom(false));
  }

  // A tab on the strip: its &n / *n, its name (or what runs in it), a light
  // per agent in it or its faults (!n), and an x while the pointer is on it.
  // Click shows it; double-click renames it; drag it onto another tab to move
  // it there; right-click is the tab menu.
  tabChip(s, f, data) {
    const t = theme(), here = f.active, tab = s.tabs.find(x => x.id === f.id);
    const toolTab = isLazygitTab(f.id);
    const name = tab?.named ? tab.name : isLazygitTab(f.id) ? "lazygit" : (f.windows.map(blockText).join(" \u00b7 ") || "empty");
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
        // Its tabs, without hunk's reviews (HUNK lists those in the space level).
        .child(h_flex().id("ram-strip-scroll").flex_1().min_w(0).h_full().gap(8 * U).items_center().overflow_x_scrollbar()
          .children((tower?.floors ?? []).filter(f => !isHunkTab(f.id)).map(f => this.tabChip(s, f, data)))
          .child(this.pushTab(s, CHIP_H)));
    } else row.child(div().flex_1());
    return this.sized(v_flex().id("ram-strip").relative().size_full().overflow_hidden().border_b(1).border_color(t.border))
      .child(ruler)
      .child(row.child(this.levelButtons(data)).children(this.windowButtons()));
  }

  // ---------------------------------------------------------------- the side column

  // STACK (every space, 0x01 at the top, growing down; SP points at the one
  // you're in), free, HEAP (that space's agents, growing up to its label),
  // .rodata, GIT, then Settings / Keys / Commands. Narrower and shorter rows when
  // it isn't this column's level. Both labels count their rows, so a short
  // column (meta) can show fewer rows and still say how many there are.
  side(cx) {
    if (level() === "meta") return this.metaSide(cx);
    const t = theme(), compact = false;
    const data = readScene(this), s = data.spaces.find(x => x.active);
    this.kbStart();
    const shell = this.kbRoot(v_flex().id("ram-side").size_full().bg(t.chrome).rounded(2).border(1).border_color(t.border).overflow_hidden(), cx);
    const label = (text, extra = []) => h_flex().h(20 * U).flex_none().px(10 * U).gap(5 * U).items_center()
      .child(div().flex_1().text_size(10.5 * U).text_color(t.dim).child(text)).children(extra);
    const count = n => n ? "  " + n : "";
    // The top row: STACK, its key (^b w, where it fits), search's button (as
    // meta's main stick has d diff) and + for a new space.
    const stackText = `STACK \u2193${count(data.spaces.length)}`, navKey = terse(shortcut("navigate"));
    const rgW = s ? 10 * U + textW(this.key("rg"), 10 * U) + 4 * U + textW("search", 10 * U) + 2 : 0;
    const keyFits = Boolean(navKey) && 20 * U + textW(stackText, 10.5 * U) + 3 * 5 * U + rgW + 22 * U + textW(navKey, 10 * U) + 2 <= this.size.width - 2;
    const stackLabel = label(stackText, [
      ...(keyFits ? [div().flex_none().text_size(10 * U).text_color(t.dim).child(navKey)] : []),
      ...(s ? [this.reach(this.searchButton(s), "ram-rg", { open: cx => this.search(cx, s), hint: "search" })] : []),
      this.reach(this.mini("ram-space-new", "+", `Push: new space${shortcut("space.new") ? "  " + terse(shortcut("space.new")) : ""}`, () => run("space.new")),
        "ram-space-new", { open: () => run("space.new"), hint: "new space" })]);
    if (!s) return this.sized(shell).child(stackLabel)
      .child(div().flex_1().px(10 * U).py(6 * U).text_size(13 * U).text_color(t.muted).child("No space yet"))
      .child(this.machinesRegion(compact)).child(this.kbBottom(compact));
    const current = s.tabs.find(x => x.active);
    // HEAP: the space's agents and their sub-agents, and the commands running in
    // its tabs (procs.js), oldest at the bottom.
    const born = bornOf(data);
    const heap = heapOf(data, s.id).sort((a, b) => born(b) - born(a));
    // Rows that fit under the fixed parts (both labels, .rodata, GIT, HUNK,
    // LANG, the keys): the stack gets up to 55% of the room (the current space
    // always stays), the heap the rest (the agents that need you first).
    const g = this.gitInfo?.info(s, panes());
    const stackRow = 24 * U, heapRow = 26 * U;
    const more = (id, n, what) => div().id(id).h(MORE_H).flex_none().px(10 * U).flex().items_center().text_size(10.5 * U).text_color(t.dim)
      .child(`+${n} more ${what}`);
    // HUNK (with a repo): the space's reviews, every one (they never give way;
    // the details scroll first).
    const hunkList = g ? this.reviewsHere(s) : [];
    const hunkH = g ? hunkHeight(hunkList.length) : 0;
    // LANG (with a repo): the bar and up to LANG_ROWS languages. Its rows give
    // way first, then LANG itself, so the stack and heap keep room for a few
    // rows; then GIT's file names.
    const langFiles = g ? this.langs?.files(s.machine, g.top) : undefined;
    const langList = langFiles ? summarize(langFiles, shared(INCLUDE) ?? []) : [];
    let langOn = Boolean(g), langRows = Math.min(LANG_ROWS, langList.length);
    const langH = () => langOn ? langHeight(langRows, langRows > 0 && langRows < langList.length, langList.length > 0) : 0;
    const fixed = files => 2 + (20 + 20 + 6) * U + machinesHeight((this.machines ?? []).length) + gitHeight(g, files) + hunkH + langH() + KEYS_H;
    let gitFiles = 4;
    const enough = 3 * stackRow + 2 * heapRow;
    while (langOn && langRows > 0 && this.size.height - fixed(gitFiles) < enough) langRows--;
    if (langOn && this.size.height - fixed(gitFiles) < enough) langOn = false;
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
      const done = doneIn(data, sp.id);
      // Every row has the same columns, BP last (only the space you work in
      // says it), so the names line up. Drag a row onto another to move that space.
      const row = h_flex().id(`stack-${sp.id}`).relative().h(stackRow).flex_none().px(10 * U).gap(6 * U).items_center().cursor_pointer()
        .when(here, el => el.bg(AMBER + "14")).hover(st => st.bg(t.hover))
        .when(nav === sp.id, el => el.border(1).border_color(CYAN))
        .tooltip(`${ADDR(i)} ${sp.name}${sp.machine ? " @" + sp.machine : ""}${here ? "" : ": its BP"}`)
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
        .when(done > 0, el => el.child(finished(done)))
        .child(div().w(30 * U).flex_none().text_size(10.5 * U).font_semibold().text_color(BP_ON).child(here ? "\u25c2BP" : ""));
      return this.reach(this.dragMarks(this.droppable(row, "space", sp.id, group, from => this.moveSpace(from, sp.id)),
        "space", sp.id, spaceOrder, "y"), `stack-${sp.id}`, { open: () => this.go(sp.id), rename: () => run("space.rename", { id: sp.id }), hint: "show" });
    });
    const blocks = shownHeap.map(a => {
      const red = a.status === "blocked", fin = a.status === "done", mine = a.tab === current?.id;
      return this.reach(h_flex().id(`heap-${a.address}`).h(heapRow).flex_none().px(10 * U).gap(7 * U).items_center().cursor_pointer()
        .hover(st => st.bg(red ? "#3a1520" : t.hover)).when(red, el => el.bg("#2a0f14")).when(fin, el => el.bg(DONE_BG + "aa"))
        .tooltip(tipOf(a))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.open(a); })
        .child(led(a, 7, this.motion()))
        .child(div().w(24 * U).flex_none().text_size(11.5 * U).text_color(mine ? BP_ON : t.dim).child(REF(a.tab_index, mine)))
        .child(div().flex_none().max_w(140 * U).truncate().text_size(12.5 * U).font_semibold()
          .text_color(red ? "#ffd0d4" : t.foreground).child(`${a.program?.name || "agent"}${a.child ? " \u21b3" : ""}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(red ? "#e9b3bb" : t.muted).child(besides(a)))
        .child(div().flex_none().text_size(11 * U).when(fin, el => el.font_semibold()).text_color(red ? RED : fin ? CYAN : t[a.status] ?? t.dim)
          .child(STATUS[a.status] ?? a.status ?? "")),
        `heap-${a.address}`, { open: () => this.open(a), hint: a.proc ? "peek" : "show" });
    });
    const stack = v_flex().id("ram-stack").flex_none().children(frameRows)
      .when(shownSpaces.hidden > 0, el => el.child(more("ram-stack-more", shownSpaces.hidden, "spaces")));
    const heapList = v_flex().id("ram-heap").flex_none().children(blocks)
      .when(heapMore && heap.length > shownHeap.length, el => el.child(more("ram-heap-more", heap.length - shownHeap.length, "blocks")));
    const free = div().id("ram-free").flex_1().min_h(6 * U).flex().items_center().px(14 * U)
      .child(div().w_full().h(0).border_t(1).border_dashed().border_color(t.border));
    // The stack and heap give way first (their labels count them), down to the
    // labels and the current space. Past that (a short column with machines,
    // a dirty repo and reviews), .rodata, GIT, HUNK and LANG get what's left and
    // scroll. The keys always show.
    const memoryMin = (20 + 20 + 6) * U + stackRow;
    const memory = v_flex().id("ram-side-memory").flex_1().min_h(memoryMin).overflow_hidden()
      .child(stackLabel)
      .child(stack)
      .child(free)
      .child(heapList)
      .child(label(`HEAP \u2191${count(heap.length)}`));
    const detailsH = machinesHeight((this.machines ?? []).length) + gitHeight(g, gitFiles) + hunkH + langH();
    const detailsRoom = Math.max(0, this.size.height - 2 - memoryMin - KEYS_H);
    // The peek strip under the terminal is as tall as this column is from the line
    // over .rodata down (.rodata, GIT, HUNK, LANG, the keys, the bottom border), so
    // its top lines up with that line. With the column hidden it keeps its height.
    if (sidebarHidden() !== true) this.sharePeekHeight(Math.min(detailsH, detailsRoom) + KEYS_H + 1, cx);
    const details = v_flex().id("ram-side-details").flex_none()
      .when(detailsH > detailsRoom, el => el.h(detailsRoom).overflow_y_scrollbar())
      .child(this.machinesRegion(compact))
      .child(this.gitRegion(s, gitFiles))
      .when(Boolean(g), el => el.child(this.hunkRegion(s, hunkList)))
      .when(langOn, el => el.child(this.langRegion(s, g, langList, langRows)));
    return this.sized(shell)
      .child(memory)
      .child(details)
      .child(this.kbBottom(compact));
  }

  // HUNK: the space's reviews (hunk.js), a line each; the header shows the
  // last one (^b r, its key where it fits) and + opens the menu. Its lines have
  // the heights hunkHeight() counts.
  hunkRegion(s, list) {
    const t = theme(), key = terse(shortcut("ram.hunk")), shown = shownTab()?.id;
    const made = new Map(terminals().map(x => [x.address, x.created_ms ?? null])), created = e => made.get(e.terminal) ?? null;
    const word = `HUNK${list.length ? "  " + list.length : ""}`;
    const keyFits = Boolean(key) && 20 * U + textW(word, 10.5 * U) + 2 * 6 * U + textW(key, 10.5 * U) + 22 * U + 2 <= this.size.width - 2;
    const head = this.reach(h_flex().id("ram-hunk-head").h(HUNK_TOP).flex_none().gap(6 * U).items_center().rounded(2).cursor_pointer()
      .hover(st => st.bg(t.hover)).tooltip(list.length ? "hunk: the last review shown here" : "hunk: review this space's changes")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.goHunk(cx); })
      .child(div().flex_none().text_size(10.5 * U).text_color(CYAN).child("HUNK"))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5 * U).text_color(t.dim).child(list.length ? String(list.length) : "no reviews"))
      .when(keyFits, el => el.child(div().flex_none().text_size(10.5 * U).text_color(t.dim).child(key))),
      "ram-hunk-head", { open: cx => this.goHunk(cx), hint: "review" });
    head.child(this.reach(this.mini("ram-hunk-new", "+", "Open a review here (the menu)", () => this.hunkMenu(s)),
      "ram-hunk-new", { open: () => this.hunkMenu(s), hint: "menu" }));
    const box = v_flex().id("ram-hunk").flex_none().px(10 * U).py(HUNK_PAD).gap(HUNK_GAP).border_t(1).border_color(t.border)
      .child(head);
    for (const e of list) box.child(this.reach(hunkLine(this, e, shown, created(e)), `hunk-${e.terminal ?? e.tab}`,
      { open: () => this.showTool(e.tab), close: () => this.closeReview(e), hint: "show" }));
    return box;
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
        : this.reach(h_flex().id("ram-machine-none").flex_1().min_w(0).h_full().px(4 * U).items_center().rounded(2)
          .cursor_pointer().hover(st => st.bg(t.hover).text_color(AMBER)).text_size(11.5 * U).text_color(t.dim)
          .tooltip("Add a machine (ssh)")
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); add(); })
          .child(div().min_w(0).truncate().child("Add a machine")), "ram-machine-none", { open: add, hint: "add a machine" }))
      .when(list.length > 0, el => el.child(this.reach(this.mini("ram-machine-add", "+", "Add a machine", add), "ram-machine-add", { open: add, hint: "add a machine" })))
      .when(!list.length, el => el.child(this.mini("ram-machine-add", "+", "Add a machine", add)));
    const box = v_flex().id("ram-machines").flex_none().px(10 * U).py(6 * U).gap(4 * U).border_t(1).border_color(t.border)
      .child(header);
    if (!list.length) return box;
    const pinCount = Math.max(4, Math.floor((this.size.width - 36 * U) / (6 * U)));
    list.forEach((m, k) => {
      const on = m.state === "connected";
      const first = spaces().find(x => x.machine === m.name);
      const into = () => {
        if (!on) run("app.settings", { section: "machines" });
        else if (first) this.go(first.id);
        else run("space.new", { machine: m.name });
      };
      const chip = this.reach(h_flex().id(`ram-machine-${m.name}`).h(26 * U).flex_none().px(6 * U).gap(6 * U).items_center().rounded(2)
        .bg(ROM_BG).border(1).border_dashed().border_color(on ? ROM : ROM_LINE)
        .cursor_pointer().hover(st => st.bg(ROM_HOVER))
        .tooltip(on ? (first ? `Into ${first.name} on ${m.name}` : `New space on ${m.name}`) : (m.why || String(m.state ?? "asleep")))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); into(); }), `ram-machine-${m.name}`, { open: into, hint: on ? "go" : "settings" })
        .child(div().flex_none().text_size(10.5 * U).text_color(ROM).child("0x" + (0xF1 + k).toString(16).toUpperCase()))
        .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(on ? t.foreground : t.muted).child(m.name))
        .when(!compact, el => el.child(div().flex_none().px(3 * U).rounded(2).border(1).border_color(ROM_LINE)
          .text_size(9.5 * U).text_color(ROM).child("RO")))
        .child(div().size(7 * U).rounded_full().flex_none().bg(on ? GREEN : t.dim))
        .when(!on && !compact, el => el.child(div().flex_none().text_size(10.5 * U).text_color(t.dim)
          .child(String(m.state ?? "asleep").replace(/_/g, " "))))
        .when(on, el => el.child(this.reach(this.mini(`ram-machine-new-${m.name}`, "+", `New space on ${m.name}`,
          () => run("space.new", { machine: m.name })), `ram-machine-new-${m.name}`, { open: () => run("space.new", { machine: m.name }), hint: "new space" })));
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
    this.reach(box, "ram-git", { open: cx => this.openLazygit(s, cx), hint: "lazygit" });
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

  // LANG: the space's repo by language (langs.js), as GitHub shows it: a bar of
  // each language's share of the bytes, then the biggest ROWS (share, files),
  // then "+n more". A language opens its files in a dialog (a click there opens
  // one in $EDITOR); the header and "+n more" open them all; ext picks what else
  // counts (YAML, Markdown...). Its lines have the heights langHeight() counts.
  langRegion(s, g, list, rows) {
    const t = theme(), files = this.langs?.files(s.machine, g.top);
    const open = (mode, lang = null) => openOverlay({ mod: "ram", kind: "dialog", width: 500, height: 420,
      props: { role: "lang", space: s.id, top: g.top, machine: s.machine ?? null, repo: g.name, mode, lang } });
    const said = files === undefined ? "counting\u2026"
      : list.length ? `${list.length} ${list.length === 1 ? "language" : "languages"}` : "no code counted";
    const head = this.reach(h_flex().id("ram-lang-head").h(LANG_TOP).flex_none().gap(6 * U).items_center().rounded(2).cursor_pointer()
      .hover(st => st.bg(t.hover)).tooltip(`${g.name}: every language, by size`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); open("list"); })
      .child(div().flex_none().text_size(10.5 * U).text_color(CYAN).child("LANG"))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(said)), "ram-lang-head", { open: () => open("list"), hint: "languages" });
    head.child(this.reach(h_flex().id("ram-lang-ext").h(15 * U).px(4 * U).flex_none().items_center().rounded(2).border(1).border_color(t.input)
      .text_size(10 * U).text_color(t.muted).cursor_pointer().hover(st => st.bg(t.hover).text_color(AMBER))
      .tooltip("Count more file types: YAML, Markdown and others")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); open("ext"); })
      .child("ext"), "ram-lang-ext", { open: () => open("ext"), hint: "more types" }));
    const box = v_flex().id("ram-lang").flex_none().px(10 * U).py(LANG_PAD).gap(LANG_GAP).border_t(1).border_color(t.border)
      .child(head);
    if (!list.length) return box;
    box.child(langBar("ram-lang-bar", list, Math.max(20, this.size.width - 2 - 20 * U), LANG_BAR));
    list.slice(0, rows).forEach((l, k) => box.child(this.reach(h_flex().id(`ram-lang-${k}`).h(LANG_LINE).flex_none().gap(6 * U).items_center()
      .rounded(2).cursor_pointer().hover(st => st.bg(t.hover)).tooltip(`${l.name}: ${filesText(l.count)} (click: the files)`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); open("files", l.name); })
      .child(div().size(7 * U).flex_none().rounded_full().bg(visible(l.color)))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.foreground).child(l.name))
      .child(div().flex_none().text_size(10.5 * U).text_color(t.muted).child(shareText(l.share)))
      .child(div().w(52 * U).flex_none().text_size(10.5 * U).text_color(t.dim).child(filesText(l.count))),
      `ram-lang-${k}`, { open: () => open("files", l.name), hint: "its files" })));
    if (rows > 0 && rows < list.length) box.child(this.reach(h_flex().id("ram-lang-more").h(LANG_LINE).flex_none().items_center().rounded(2)
      .cursor_pointer().hover(st => st.bg(t.hover)).text_size(10.5 * U).text_color(t.dim).tooltip("Every language")
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); open("list"); })
      .child(`+${list.length - rows} more`), "ram-lang-more", { open: () => open("list"), hint: "languages" }));
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

  // What the peek strip shows, in the space level (P or ^b P turns it off):
  // SP's tab (what meta shows), and under a review the place you came from
  // when that's in the space level (left of SP's). It leaves out the tab that
  // shows, and the same tab twice. Each is { kind: "came" | "sp", place }.
  peekSources() {
    if (level() !== "space" || shared("ram.peek") === false) return [];
    const now = shownTab(), out = [];
    if (now && isHunkTab(now.id)) {
      const came = shared(CAME), c = live(came);
      if (c && came.level === "space") out.push({ kind: "came", place: c });
    }
    const sp = spPlace();
    if (sp) out.push({ kind: "sp", place: sp });
    return out.filter((x, i) => x.place.tab !== now?.id && out.findIndex(y => y.place.tab === x.place.tab) === i);
  }

  // The last lines of each source's tab (its focused terminal), every 1.5 s.
  readPeek(cx) {
    if (!window()?.active || this.reading) return;
    const list = this.peekSources();
    if (!list.length) return;
    this.reading = true;
    cx.spawn(async cx => {
      for (const x of list) {
        const ps = panes().filter(p => p.tab === x.place.tab && p.terminal);
        const pane = ps.find(p => p.pane === x.place.pane) ?? ps.find(p => p.focused) ?? ps[0];
        if (!pane) { this.peekLines[x.place.tab] = []; continue; }
        try {
          const r = await hc(["read", pane.terminal]);
          if (r.code === 0) {
            const lines = r.stdout.replace(ANSI, "").replace(/\s+$/, "").split("\n").map(l => l.replace(/\s+$/, ""));
            // Kept to the most the strip could show; it draws those that fit (peekRows()).
            this.peekLines[x.place.tab] = lines.slice(-PEEK_KEEP);
          }
        } catch (_) { /* keep what it showed */ }
      }
      this.reading = false;
      cx.notify();
    });
  }

  // How many of a box's last lines fit the strip's height: under its header
  // (24 * U) and the body's padding (2 * 4 * U), 13 * U each, inside the border.
  peekRows() {
    return Math.max(1, Math.floor((this.size.height - 2 - 24 * U - 8 * U) / (13 * U)));
  }

  // One box per source, side by side. SP's: its mark, where it is and what
  // runs there, and a click goes to meta. Where you came from: ↩, and a click
  // goes back there (as ^b r does). Each shows as many of its last lines as fit.
  peek() {
    const t = theme(), list = this.peekSources(), data = readScene(this), rows = this.peekRows();
    const row = this.sized(h_flex().id("ram-peek").size_full().gap(8 * U));
    if (!list.length) return row;
    for (const x of list) {
      const s = spaces().find(v => v.id === x.place.space), tab = s?.tabs.find(v => v.id === x.place.tab);
      if (!s || !tab) continue;
      const sp = x.kind === "sp", asking = askingIn(data, tab.id).length > 0;
      const ps = panes().filter(p => p.tab === tab.id);
      const what = ps.map(p => p.program?.name || (p.mod ? p.title : "sh")).join(" \u00b7 ");
      const status = tab.status;
      const where = `${s.name} \u00b7 ${REF(tab.index, true)}${tab.named ? " " + tab.name : ""}`;
      row.child(v_flex().id(`peek-${x.kind}`).flex_1().min_w(0).h_full().bg(t.chrome).rounded(2).border(1)
        .border_color(asking ? RED : t.border).overflow_hidden()
        .cursor_pointer().hover(st => st.border_color(sp ? AMBER : BP_ON))
        .tooltip(sp ? `SP: ${where}, what meta shows \u00b7 click: meta${shortcut("ram.meta") ? " (" + terse(shortcut("ram.meta")) + ")" : ""}`
          : `Back to ${where}${shortcut("ram.hunk") ? " (" + terse(shortcut("ram.hunk")) + ")" : ""}`)
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          if (sp) setShared("ram.zoom", "meta");
          else { setShared(CAME, null); show(x.place); }
        })
        .child(h_flex().h(24 * U).flex_none().px(10 * U).gap(7 * U).items_center().border_b(1).border_color(t.border)
          .child(div().flex_none().text_size(11 * U).font_semibold().text_color(sp ? AMBER : BP_ON).child(sp ? "SP\u25b8" : "\u21a9"))
          .child(div().flex_none().max_w(220 * U).truncate().text_size(12 * U).text_color(t.foreground).child(where))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).text_color(t.muted).child(what))
          .when(Boolean(status), el => el.child(div().flex_none().text_size(11 * U).text_color(asking ? RED : t[status] ?? t.dim).child(STATUS[status] ?? status))))
        .child(v_flex().flex_1().min_h(0).px(10 * U).py(4 * U).justify_end().overflow_hidden()
          .children((this.peekLines[tab.id] ?? []).slice(-rows).map((l, k) => div().id(`peek-${x.kind}-${k}`).h(13 * U).flex_none().truncate().text_size(11 * U).text_color(t.dim).child(l || " ")))));
    }
    return row;
  }

  // ---------------------------------------------------------------- render

  render(cx) {
    const role = props()?.role;
    if (role === "hunk-menu") return this.menuView.render();
    if (role === "lang") return this.langView.render();
    if (role === "git-init") return this.gitView.render();
    if (role === "search") return this.searchView.render(cx);
    this.countReviews();
    if (role === "side") return this.side(cx);
    if (role === "peek") return this.peek();
    if (role === "rams") return this.rams(cx);
    const lvl = level(), data = readScene(this);
    this.applyLevel(lvl, cx);
    this.applySticks(cx);
    this.watchHidden(lvl);
    this.track(lvl, cx);
    this.follow(data, cx);
    this.shareRet(cx);
    this.applyPeek(this.peekSources().length > 0, cx);
    this.takeHunkRequest(cx);
    this.takeToolRequest(cx);
    cx.spawn(async () => this.trackProcs());
    // agent.next / prev: needs-you first, then the rest in space order.
    const rank = a => RANK[a.status] ?? 4;
    setAgentOrder([...data.list].filter(a => !a.child).sort((a, b) => rank(a) - rank(b)).map(a => a.address));
    return this.strip(data);
  }

  async close() {
    const role = props()?.role;
    if (role === "rams") this.save();
    if (role === "search") await this.searchView?.close();
  }
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
// What an agent is doing, when that says more than its name (shown next to it);
// a command: its last output line.
function besides(a) {
  if (a.proc) return a.title || "";
  const what = doing(a);
  return what && what !== (a.program?.name || "agent") && what !== a.address ? what : "";
}
