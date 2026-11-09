// RAM's look and small shared helpers, used by main.js, all.js and hunk.js.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { keys, theme, shared } from "herdr";

export const AMBER = "#ffb547", CYAN = "#6fe3d3", GOLD = "#c9a24a", GREEN = "#7dff9b", RED = "#ff5f6d";
// Other machines (.rodata, read-only memory): their own color, so they never pass for spaces.
export const ROM = "#b68cff", ROM_LINE = "#4a3b66", ROM_BG = "#130f1b", ROM_HOVER = "#1d1628";
// Everything RAM draws is U times its base size in px (zoom scales them all);
// the terminals' text keeps the person's own font size.
export const U = 1.25;
// A block's status light and its cell.
export const LED = { working: GREEN, blocked: RED, done: CYAN, idle: "#5f8a70", shell: "#5b6b61",
  mod: "#9cb8cb", dead: "#33443a", unavailable: "#4f6b5a" };
export const CELL = { working: "#123322", blocked: "#3a1118", done: "#0f2c2a", idle: "#0f1a14", shell: "#121a15",
  mod: "#121a15", dead: "#0b0f0d", unavailable: "#121a15" };
const LABEL = { working: "working", blocked: "needs you", done: "done, unseen",
  idle: "idle", shell: "shell", mod: "mod", dead: "dead, confirmed exit", unavailable: "unavailable" };
export const STATUS = { blocked: "Needs you", working: "Working", done: "Done", idle: "Idle" };
export const RANK = { blocked: 0, working: 1, done: 2, idle: 3 };
export const ADDR = i => "0x" + i.toString(16).toUpperCase().padStart(2, "0");
// A tab written as a pointer to its frame: &2 (a reference), *2 once it's the
// tab its space shows (dereferenced: clicking a tab turns its & into *).
export const REF = (index, shown) => `${shown ? "*" : "&"}${index ?? "?"}`;
export const stop = (_e, cx) => cx.stop_propagation();
// About how wide some text is, in px: the fonts are monospace, ~0.6 em a character.
export const textW = (text, size) => [...String(text ?? "")].length * size * 0.6;
// How RAM writes a key: ^b for ctrl-b (short, as the user asked).
export const terse = k => k.replace(/\bctrl-/g, "^");

// The space ^b w's navigate mode is on (the prefix bar shares it as
// "navigate.space"), or null; marked in cyan in every list of spaces. One left
// behind (a bar that never closed cleanly) is ignored after 5 minutes.
export const NAV_LIFE = 5 * 60000;
export function navigating() {
  const n = shared("navigate.space");
  return n && typeof n.id === "string" && Date.now() - (Number(n.at) || 0) < NAV_LIFE ? n.id : null;
}

// A block's tooltip, on one line (multi-line tooltips draw their lines over
// each other): what it is, where, and its state.
export function identity(a) {
  const where = [a.space_name, a.tab_name].filter(Boolean).join(" / ");
  return [a.title || a.program?.name || "terminal", where, LABEL[a.status] || "unreported"].filter(Boolean).join(" \u00b7 ");
}

// The key bar's mod (its NAME): its keys are keys.json's mod:<BAR> section.
export const BAR = "prefix";

// The key that runs a command, from keys.json: a direct key, else the ctrl-b
// prefix key then its second key ("ctrl-b :"). Empty when it has none.
export function shortcut(command) {
  const all = keys();
  const direct = all.find(k => k.section === "global" && k.action === command);
  if (direct) return direct.keys;
  const prefix = all.find(k => k.section === "global" && k.action === `mod.open:${BAR}`);
  const second = all.filter(k => k.section === `mod:${BAR}` && k.action === `${BAR}.${command}`).map(k => k.keys);
  if (!prefix || !second.length) return "";
  const plain = second.filter(k => !k.startsWith("shift-")).sort((a, b) => a.length - b.length)[0];
  return `${prefix.keys} ${plain ?? second[0]}`;
}

// A status light; it pulses while working or blocked (MOTION: the window is active).
export function led(a, size, motion) {
  const el = div().size(size * U).rounded(1).flex_none().bg(LED[a.status] ?? LED.shell);
  if (motion && a.status === "working") el.loop("opacity", { from: 0.35, to: 1, period: 700 });
  if (motion && a.status === "blocked") el.loop("opacity", { from: 0.2, to: 1, period: 900 });
  return el;
}

// A space's faults (agents that need you): FAULT n, or !n where room is short
// (its tooltip says it in words).
export function fault(n, compact = false) {
  const el = div().flex_none().px((compact ? 3 : 4) * U).rounded(2).bg("#3a1118").border(1).border_color(RED)
    .text_size((compact ? 10 : 10.5) * U).text_color(RED);
  return compact ? el.tooltip(`FAULT ${n}: needs you`).child(`!${n}`) : el.child(`FAULT ${n}`);
}

// Git marks (git.js summary()): ↑ push, ↓ pull, ± uncommitted, ⌂ no remote, ✓ clean.
const MARK = { push: () => GREEN, pull: () => RED, dirty: t => t.ansi3, local: t => t.ansi1, clean: () => LED.idle };
export function marks(sum, size = 11 * U) {
  const t = theme();
  return (sum?.marks ?? []).map(m => div().flex_none().text_size(size).text_color(MARK[m.kind]?.(t) ?? t.dim).child(m.short));
}
// A repo's "repo · branch" as one group: the repo name gives way first, so
// the branch stays readable (the tooltip has both in full).
export function headGroup(head, color) {
  if (!head.repo || !head.branch) return div().min_w(0).truncate().text_color(color).child(head.text);
  return h_flex().min_w(0).gap(4 * U).items_center()
    .child(div().min_w(0).truncate().text_color(color).child(head.repo))
    .child(div().flex_none().text_color(theme().dim).child("\u00b7"))
    .child(div().flex_none().max_w(130 * U).truncate().text_color(color).child(head.branch));
}
