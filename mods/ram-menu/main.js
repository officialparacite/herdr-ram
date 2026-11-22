// RAM's right-click menu for a terminal (the layout's terminal_menu): Copy and
// Paste first, as cmd-c and cmd-v do, then Herdr's own items (its menu mod's:
// split, zoom, where right-clicks go, back to the parent, close). Each says its
// key on the right. Herdr opens it as a popup with props
// { tab: "pane", target: { pane, terminal } }: the terminal right-clicked, which
// every item acts on (never just the focused one). Up/down (or j, k) move,
// Enter runs, Esc closes.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, keys, terminals, panes, window } from "herdr";

// An item: { label, icon, steps: [[command, args]...], key: the command its key runs }.
export function items(p) {
  const tg = p?.target ?? {};
  const all = terminals();
  const term = all.find(t => t.address === tg.terminal);
  const parent = term?.parent && all.find(t => t.address === term.parent);
  // Once they go to the program, Shift+right-click still opens this menu.
  const toProgram = term?.labels?.["herdr.right-click"] === "program";
  // A terminal shown outside a tab (a layout terminal block) has no pane to
  // split, zoom or close: its pane is the block's id.
  const inTab = panes().some(pane => pane.pane === tg.pane);
  // terminal.copy and terminal.paste act on the focused terminal, so the one
  // right-clicked is focused first (a click on it would have done the same).
  const focus = ["pane.focus", inTab ? { pane: tg.pane } : { terminal: tg.terminal }];
  const icon = name => `mods/workspace-chrome/${name}.svg`;
  return [
    ...(term ? [
      { label: "Copy", icon: "mods/ram-menu/copy.svg", steps: [focus, ["terminal.copy", {}]], key: "terminal.copy" },
      { label: "Paste", icon: "mods/ram-menu/paste.svg", steps: [focus, ["terminal.paste", {}]], key: "terminal.paste" },
    ] : []),
    ...(inTab ? [
      { label: "Split right", icon: icon("panel-right"), steps: [["pane.split", { direction: "right", pane: tg.pane }]], key: "pane.split:right", line: true },
      { label: "Split down", icon: icon("panel-right"), steps: [["pane.split", { direction: "down", pane: tg.pane }]], key: "pane.split:down" },
      { label: "Zoom", icon: icon("square"), steps: [["pane.zoom", { pane: tg.pane }]], key: "pane.zoom" },
    ] : []),
    ...(term ? [toProgram
      ? { label: "Use Herdr right-click menu", icon: icon("terminal"), steps: [["terminal.right_click", { terminal: term.address, to: "menu" }]] }
      : { label: "Send right-clicks to pane", icon: icon("terminal"), steps: [["terminal.right_click", { terminal: term.address, to: "program" }]] }] : []),
    ...(parent ? [{ label: `Send back to ${parent.name || parent.address}`, icon: icon("terminal"), steps: [["terminal.park", { terminal: term.address }]] }] : []),
    ...(inTab ? [{ label: "Close pane", icon: icon("x"), steps: [["pane.close", { pane: tg.pane }]], key: "pane.close", line: true }] : []),
  ];
}

// How RAM writes a key: ⌘C for cmd-c, ^⇧C for ctrl-shift-c, ^b for ctrl-b.
export const pretty = k => k.replace(/\bcmd-/g, "\u2318").replace(/\bctrl-/g, "^").replace(/\balt-/g, "\u2325")
  .replace(/\bshift-/g, "\u21e7").replace(/([\u2318\u21e7\u2325])([a-z])$/, (_, m, c) => m + c.toUpperCase());

// The key that runs COMMAND, from keys.json: a direct one (cmd-c on a Mac, else
// the shortest with a letter: ctrl-shift-c over ctrl-insert), else the key bar's:
// its key, then the second key (^b v).
export function hint(command) {
  if (!command) return "";
  const all = keys(), mac = window()?.platform === "macos";
  const direct = all.filter(k => (k.section === "global" || k.section === "terminal") && k.action === command).map(k => k.keys)
    .sort((a, b) => a.length - b.length);
  const own = direct.find(k => mac && k.startsWith("cmd-")) ?? direct.find(k => /-[a-z]$/.test(k)) ?? direct[0];
  if (own) return pretty(own);
  for (const k of all) {
    const bar = k.section.startsWith("mod:") ? k.section.slice(4) : "";
    if (!bar || k.action !== `${bar}.${command}` || k.keys.startsWith("shift-")) continue;
    const open = all.find(o => o.section === "global" && o.action === `mod.open:${bar}`);
    if (open) return `${pretty(open.keys)} ${k.keys}`;
  }
  return "";
}

export default class RamMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  // Run the item's steps, then close: closing hands the keyboard back to the
  // focused pane, so it goes last (the right-clicked one is focused by then).
  choose(i) {
    const it = items(props())[i];
    if (!it) return;
    for (const [name, args] of it.steps) run(name, args);
    closeOverlay(props()?.overlay);
  }

  render() {
    const t = theme(), list = items(props());
    this.at = Math.max(0, Math.min(this.at, list.length - 1));
    return v_flex().id("ram-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (!list.length) { if (e.key === "escape") closeOverlay(props()?.overlay); return; }
        if (e.key === "down" || e.key === "j") this.at = (this.at + 1) % list.length;
        else if (e.key === "up" || e.key === "k") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .children(list.map((it, i) => v_flex()
        .when(i > 0 && Boolean(it.line), el => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`ram-mi-${i}`).h(31).px(8).gap(9).rounded(7).items_center().justify_between()
          .text_color(t.foreground)
          .when(i === this.at, el => el.bg(t.selected))
          .hover(s => s.bg(t.hover))
          .on_click(() => this.choose(i))
          .child(svg(it.icon).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(it.label))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(hint(it.key))))));
  }
}
