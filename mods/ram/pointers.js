// SP and BP, RAM's two places, as a stack has them: one stack pointer that
// jumps, and a base pointer per frame that stays. They're shared state, so
// every copy of the mod sees them, and they outlive a restart.
//   SP     "ram.sp" {space, tab, pane}: the tab meta shows. There's one. Meta's
//          own moves set it (main.js track() while meta shows), and follow
//          moves it in either level, without changing the screen outside meta.
//   BP     "ram.bp" {space id: tab id}: each space's work tab, the one the
//          space level shows in that space. It moves when you change tabs in
//          the space level, and with ^b I. A tool's tab (lazygit, a review,
//          rg-fzf) never is one.
//   frame  "ram.frame": the space you work in, whose BP is the bright one: the
//          space the space level shows, where ^b g, ^b r and ^b / open their tools.
//   came   "ram.came" {level, space, tab, pane}: where you were when a tool's
//          tab showed, so quitting the tool (or ^b r on a review) goes back there.
//   goto   "ram.goto" {tab, pane, at}: what the next level change shows instead
//          of that level's own place, for a moment (a tool in the other level,
//          ^b I into the space level, the way back from a tool).
//   ret    "ram.ret" {space, tab, pane}: follow's return address, where SP was
//          before follow's first move and goes back to once you've answered
//          (a dim RET▸ on that frame); null while follow is home.
import { shared, setShared, spaces, panes, run } from "herdr";

export const SP = "ram.sp", BP = "ram.bp", FRAME = "ram.frame", CAME = "ram.came", GOTO = "ram.goto", RET = "ram.ret";
const tabIn = (s, id) => s?.tabs?.find(t => t.id === id) ?? null;

// A place {space, tab, pane} as it is now: its tab, its space now, and its pane
// while it's still in that tab; null once the tab is gone.
export function live(p) {
  if (!p?.tab) return null;
  const s = spaces().find(x => x.tabs?.some(t => t.id === p.tab));
  if (!s) return null;
  const pane = p.pane && panes().some(x => x.pane === p.pane && x.tab === p.tab) ? p.pane : null;
  return { space: s.id, tab: p.tab, pane };
}

// The tab meta shows, as a place (null before meta has shown anything).
export const spPlace = () => live(shared(SP));

// A space's BP: its work tab while it's there, else the tab it shows, else its
// first tab that isn't a tool's. ISTOOL(tab id): a tool's tab.
export function bpTab(s, isTool) {
  if (!s) return null;
  const ok = t => Boolean(t) && !isTool(t.id);
  const kept = tabIn(s, shared(BP)?.[s.id]);
  if (ok(kept)) return kept;
  const shown = s.tabs?.find(t => t.active);
  if (ok(shown)) return shown;
  return s.tabs?.find(t => !isTool(t.id)) ?? null;
}

// The space you work in (frame), else the one that shows.
export function frameSpace() {
  const id = shared(FRAME), all = spaces();
  return all.find(s => s.id === id) ?? all.find(s => s.active) ?? null;
}

// The bright BP as a place: the frame's work tab.
export function bpPlace(isTool) {
  const s = frameSpace(), tab = bpTab(s, isTool);
  return tab ? { space: s.id, tab: tab.id, pane: null } : null;
}

// Show a place: its pane (which shows its tab and space too), else its tab
// (which shows its space). One command each, so nothing shows in between.
export function show(p) {
  if (!p?.tab) return;
  if (p.pane) run("pane.focus", { pane: p.pane });
  else run("tab.select", { id: p.tab });
}

// The next level change shows P instead of that level's own place.
export function goTo(p) { if (p?.tab) setShared(GOTO, { tab: p.tab, pane: p.pane ?? null, at: Date.now() }); }
