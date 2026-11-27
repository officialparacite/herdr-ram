// RAM's look and small shared helpers, used by main.js, all.js and hunk.js.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { keys, theme, shared, window } from "herdr";

export const AMBER = "#ffb547", CYAN = "#6fe3d3", GOLD = "#c9a24a", GREEN = "#7dff9b", RED = "#ff5f6d";
// Other machines (.rodata, read-only memory): their own color, so they never pass for spaces.
export const ROM = "#b68cff", ROM_LINE = "#4a3b66", ROM_BG = "#130f1b", ROM_HOVER = "#1d1628";
// Everything RAM draws is U times its base size in px (zoom scales them all);
// the terminals' text keeps the person's own font size.
export const U = 1.25;
// A block's status light and its cell.
export const LED = { working: GREEN, blocked: RED, done: CYAN, idle: "#5f8a70", shell: "#5b6b61",
  mod: "#9cb8cb", dead: "#33443a", unavailable: "#4f6b5a" };
// A finished agent's cell is the brightest after a fault's, so it stands out on a stick.
export const CELL = { working: "#123322", blocked: "#3a1118", done: "#12423c", idle: "#0f1a14", shell: "#121a15",
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
// A heap row's or a block's tooltip: a command's (procs.js) also says a click peeks at it.
export const tipOf = a => a.proc ? `${a.program?.name ?? "command"}: ${identity(a)} \u00b7 click: peek at its output` : identity(a);
// follow's return address (RET\u25b8): SP's amber, dimmed.
export const RET_DIM = AMBER + "88";

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
  // One spelling per key, as the bar writes it: "shift-p" is P.
  return `${prefix.keys} ${(plain ?? second[0]).replace(/^shift-([a-z])$/, (_, c) => c.toUpperCase())}`;
}

// The key a terminal command has (keys.json's terminal or global section), as
// RAM's right-click menu writes it: ⌘ cmd, ^ ctrl, ⌥ alt, ⇧ shift, and a letter
// after ⌘ ⌥ or ⇧ in capitals (ctrl-shift-f is ^⇧F). Of several, the one the menu
// shows: on a Mac the cmd- one, else the shortest ending in a letter. "" for none.
export function terminalKey(command) {
  const all = keys().filter(k => (k.section === "terminal" || k.section === "global") && k.action === command).map(k => k.keys)
    .sort((a, b) => a.length - b.length);
  const mac = window()?.platform === "macos";
  const k = all.find(x => mac && x.startsWith("cmd-")) ?? all.find(x => /-[a-z]$/.test(x)) ?? all[0];
  return k ? k.replace(/\bcmd-/g, "\u2318").replace(/\bctrl-/g, "^").replace(/\balt-/g, "\u2325").replace(/\bshift-/g, "\u21e7")
    .replace(/([\u2318\u21e7\u2325])([a-z])$/, (_, m, c) => m + c.toUpperCase()) : "";
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
// A space's finished agents and commands you haven't looked at yet: +n in done's
// cyan, boxed (the sticks' dim +n counts blocks that don't fit; ✓ is git's clean).
export const DONE_BG = "#12423c";
export function finished(n) {
  return div().flex_none().px(3 * U).rounded(2).bg(DONE_BG).border(1).border_color(CYAN)
    .text_size(10 * U).text_color(CYAN).tooltip(`${n} finished while you weren't looking`).child(`+${n}`);
}
export const finishedW = n => textW(`+${n}`, 10 * U) + 6 * U + 2;

// The pointers' marks: SP (amber, the tab meta shows) and BP (white: the space
// you work in; dim: the others' work tabs).
export const BP_ON = "#ffffff";

// How long ago, short: now, 5m, 2h, 3d.
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// /private/tmp and /tmp are the same folder on macOS (hunk reports the first),
// and a folder is the same with or without its last slash.
export const realDir = p => String(p ?? "").replace(/^\/private(?=\/(?:tmp|var)(?:\/|$))/, "").replace(/(.)\/+$/, "$1");
export const sameDir = (a, b) => Boolean(a && b) && realDir(a) === realDir(b);

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
