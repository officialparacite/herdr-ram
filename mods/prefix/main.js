// tmux-style prefix (the Herdr TUI keymap from ~/.config/herdr/config.toml).
//
// keys.json binds ctrl-b to `mod.open:prefix` (the mod's name is NAME below; a copy
// under another name changes NAME and its keys). This opens as a transparent, frameless
// layer over the whole window and draws a key bar along its bottom edge, so the bar
// always sits at the bottom, full width.
//
// The second key is looked up in keys.json's "mod:prefix" section, so every prefix
// key shows in the keybinds screen and is edited in one place. Each action there is
// "prefix.<command>[:<first argument>]": Herdr hands it to nextCommand() below, the
// bar closes, then the command runs. Extras: "prefix.passthrough" types ctrl-b
// into the focused terminal, "prefix.worktree" opens the new-worktree dialog, and
// "prefix.navigate" (^b w) is the Herdr TUI's navigate mode (below).
// Esc, any other key, or a click outside the bar closes it at once; a key runs once.
//
// Navigate mode (^b w): move round the window with single keys, each move shown at
// once. j or down the next space, k or up the one before, h or left the tab before,
// l or right the tab after (round the ends), and H J K L the pane that way (outside
// navigate mode ^b H J K L swap panes). Enter, or any other key, stays where you
// are; Esc goes back to the space, tab and pane it started on. The space it's on is
// shared as "navigate.space" ({ id, at }), so each layout's list (RAM, Traveler,
// Night City) marks it, and the bar says which space and tab it is.
//
// How keys arrive: a key keys.json binds here (w, j, k, x...) runs as that binding,
// so it reaches nextCommand() as its action and never reaches on_key_down (GPUI
// dispatches a bound key as an action instead of to the key handlers). Only
// unbound keys (Enter, the arrows, a typo) reach on_key_down. So in navigate mode
// an action stands for the key it's bound to: j is pane.go:down there.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, nextCommand, keys, commands, focused, panes, hc, theme, shared,
  setShared, spaces, terminals, exec, notify, home } from "herdr";

// This mod's folder name: its keys.json section is mod:<NAME>, its actions <NAME>.<command>,
// and the key that opens it mod.open:<NAME>. mods/ram/ui.js names it too (BAR).
const NAME = "prefix";
const SECTION = `mod:${NAME}`, ACTION = `${NAME}.`;
const NAV = "navigate.space";

function newWorktree() {
  const f = focused();
  if (!f?.space) return;
  openOverlay({
    mod: "worktree", kind: "dialog", width: 440, height: 260,
    props: { space: f.space, folder: f.cwd ?? panes().find((p) => p.focused)?.cwd, action: "new" },
  });
}

// ^b g outside RAM (RAM opens its own: ram.git): lazygit in a new tab at the
// repo of the terminal you're in, or that space's lazygit tab if one is open.
// The terminal labels itself (ram.lazygit) so ^b g finds it again, and RAM
// knows it as lazygit's tab. Not a repo: a note says so. Quitting lazygit
// closes its tab.
export async function lazygitHere() {
  const f = focused();
  const s = spaces().find((x) => x.id === f?.space) ?? spaces().find((x) => x.active);
  if (!s) return;
  const lazy = new Set(terminals().filter((t) => t.labels?.["ram.lazygit"]).map((t) => t.address));
  const tabs = new Set(s.tabs.map((t) => t.id));
  const open = panes().find((p) => tabs.has(p.tab) && p.terminal && lazy.has(p.terminal));
  if (open) { run("tab.select", { id: open.tab }); return; }
  const cwd = panes().find((p) => p.pane === f?.pane)?.cwd || f?.cwd || s.folder || "";
  let top = "";
  if (cwd) {
    try {
      const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on: s.machine ?? null });
      if (r.code === 0) top = r.stdout.trim();
    } catch (_) { /* a machine that can't be reached: same as no repo */ }
  }
  if (!top) {
    const where = cwd && cwd.startsWith(home()) ? "~" + cwd.slice(home().length) : cwd || s.name;
    notify({ title: "Not a git repo", body: `${where} isn't in a git repository, so lazygit has nothing to open.`, level: "info", timeout: 4000 });
    return;
  }
  run("tab.new", { space: s.id, name: "lazygit", folder: top,
    argv: ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" ram.lazygit=1 >/dev/null 2>&1; exec lazygit'] });
}

// ^b / outside RAM (RAM opens its own: ram.rg): rg-fzf in a new tab at the repo
// of the terminal you're in, else that terminal's folder. RG_TAB is RAM's script
// (mods/ram/main.js, the same text): while rg-fzf runs the tab is labelled ram.rg;
// what you pick stays printed and the tab turns into your shell; Esc (nothing
// picked) closes the tab.
export const RG_TAB = [
  '[ -n "$HC_TERMINAL_ID" ] && hc label "$HC_TERMINAL_ID" ram.rg=1 >/dev/null 2>&1',
  'out=$(rg-fzf); st=$?',
  '[ -n "$HC_TERMINAL_ID" ] && hc label "$HC_TERMINAL_ID" ram.rg= >/dev/null 2>&1',
  '[ -z "$out" ] && [ "$st" -eq 0 ] && exit 0',
  '[ -n "$out" ] && printf "%s\\n" "$out"',
  'exec "${SHELL:-/bin/sh}" -il',
].join("\n");

export async function rgHere() {
  const f = focused();
  const s = spaces().find((x) => x.id === f?.space) ?? spaces().find((x) => x.active);
  if (!s) return;
  const cwd = panes().find((p) => p.pane === f?.pane)?.cwd || f?.cwd || s.folder || "";
  let top = cwd;
  if (cwd) {
    try {
      const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on: s.machine ?? null });
      if (r.code === 0 && r.stdout.trim()) top = r.stdout.trim();
    } catch (_) { /* a machine that can't be reached: search the folder */ }
  }
  run("tab.new", { space: s.id, name: "rg-fzf", ...(top ? { folder: top } : {}), argv: ["exec", "sh", "-c", RG_TAB] });
}

// "pane.split:right" -> run("pane.split", { direction: "right" }); the value fills
// the command's first argument, as in keys.json. Digits become numbers (indexes).
function runCommand(text) {
  const at = text.indexOf(":");
  const name = at < 0 ? text : text.slice(0, at);
  if (name === "passthrough") {
    const term = focused()?.terminal;
    if (term) hc(["keys", term, "ctrl+b"]).catch(() => {});
    return;
  }
  if (name === "worktree") return newWorktree();
  if (name === "lazygit") return shared("layout") === "ram" ? run("ram.git", {}) : lazygitHere();
  if (name === "rg") return shared("layout") === "ram" ? run("ram.rg", {}) : rgHere();
  if (at < 0) return run(name, {});
  const value = text.slice(at + 1);
  const first = commands().find((c) => c.name === name)?.args?.[0]?.name;
  if (!first) return run(name, {});
  run(name, { [first]: /^\d+$/.test(value) ? Number(value) : value });
}

// The prefix action bound to a pressed key, or undefined. Shifted punctuation can
// arrive as "shift-9" or "(", so the typed character is tried too.
function boundAction(e) {
  const map = new Map();
  for (const k of keys()) {
    if (k.section === SECTION && k.action.startsWith(ACTION)) map.set(k.keys, k.action.slice(ACTION.length));
  }
  return map.get(e.keystroke) ?? (e.key_char ? map.get(e.key_char) : undefined);
}

// The keys keys.json binds to a prefix action: "pane.go:down" -> ["j"].
function keysFor(action) {
  return keys().filter((k) => k.section === SECTION && k.action === `${ACTION}${action}`).map((k) => k.keys);
}

// ---------------------------------------------------------------- the hints

// Areas in the order they're shown.
const AREAS = [
  ["tabs", /^tab\./],
  ["spaces", /^(space\.|worktree$|navigate$|mod\.open:picker$)/],
  ["panes", /^pane\./],
  ["agents", /^agent\./],
  ["git", /^lazygit$/],
  ["search", /^rg$/],
  ["levels", /^ram\./],
  ["app", /./],
];
// Labels for known actions; this order is also the order hints appear in.
const LABELS = {
  "tab.select": "go to", "tab.new": "new", "tab.next": "next", "tab.prev": "prev",
  "tab.rename": "rename", "tab.close": "close tab",
  "navigate": "navigate", "space.new": "new", "space.next": "next", "space.prev": "prev", "space.rename": "rename",
  "space.close": "close space", "worktree": "new worktree", "mod.open:picker": "picker",
  "pane.go": "focus", "pane.swap": "swap", "pane.split:right": "split right",
  "pane.split:down": "split down", "pane.close": "close pane", "pane.zoom": "zoom",
  "agent.next": "next", "agent.prev": "prev", "lazygit": "lazygit", "rg": "rg-fzf",
  "ram.meta": "meta", "ram.space": "space", "ram.hunk": "hunk", "ram.follow": "follow", "ram.changes": "diff",
  "app.palette": "palette", "app.help": "all keys", "app.settings": "settings",
  "layout.toggle:sidebar": "sidebar", "layout.switch": "layout", "app.zoom_in": "bigger",
  "app.zoom_out": "smaller", "app.zoom_reset": "normal size", "passthrough": "send ^b",
};
const ORDER = Object.keys(LABELS);
const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
// These merge into one hint: "h j k l  focus", "1…9  go to".
const MERGED = new Set(["pane.go", "pane.swap", "tab.select"]);
// How the bar writes a key, short as the user asked: ctrl-b is ^b.
const terse = (k) => k.replace(/\bctrl-/g, "^");

// One spelling per key: "shift-t" -> "T", and "(" wins over "shift-9".
function shown(spellings) {
  const plain = spellings.filter((k) => !k.startsWith("shift-"));
  if (plain.length) return plain.sort((a, b) => a.length - b.length)[0];
  const k = spellings[0].slice("shift-".length);
  return /^[a-z]$/.test(k) ? k.toUpperCase() : `shift-${k}`;
}

function hints() {
  const byAction = new Map(); // action -> spellings, in keys() order
  for (const k of keys()) {
    if (k.section !== SECTION || !k.action.startsWith(ACTION)) continue;
    const action = k.action.slice(ACTION.length);
    // The RAM layout's levels only mean something while it shows.
    if (action.startsWith("ram.") && shared("layout") !== "ram") continue;
    byAction.set(action, [...(byAction.get(action) ?? []), k.keys]);
  }
  const items = new Map(); // label key -> { keys: [], label }
  for (const [action, spellings] of byAction) {
    const base = action.split(":")[0];
    const id = MERGED.has(base) ? base : action;
    const item = items.get(id) ?? { id, keys: [], label: LABELS[id] ?? action.replace(/[._:]/g, " ") };
    item.keys.push(shown(spellings));
    items.set(id, item);
  }
  const all = [...items.values()].sort((a, b) => rank(a.id) - rank(b.id));
  for (const it of all) {
    if (it.id === "tab.select" && it.keys.length > 2) it.keys = [`${it.keys[0]}…${it.keys[it.keys.length - 1]}`];
  }
  const used = new Set();
  return AREAS.map(([area, re]) => {
    const rows = all.filter((it) => !used.has(it) && re.test(it.id) && (used.add(it) || true));
    return [area, rows];
  }).filter(([, rows]) => rows.length);
}

export default class Prefix extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => this.handle.focus());
    this.done = false;
    this.nav = null;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") { this.handle.focus(); continue; }
        this.dispatch(c, cx);
        if (!this.done) cx.notify();
      }
    });
  }

  // A prefix key's action (see "How keys arrive" above). In navigate mode it
  // stands for the key it's bound to.
  dispatch(c, cx) {
    if (this.nav) this.navKey(keysFor(c));
    else if (c === "navigate") this.startNav();
    else this.finish(c, cx);
  }

  // The one way a key runs: once per bar, then the bar is gone. lazygit and
  // rg-fzf outside RAM first ask git where the repo is, and the bar stays up for
  // that moment (once it closes, its tasks stop).
  finish(c, cx) {
    if (this.done) return;
    this.done = true;
    if ((c === "lazygit" || c === "rg") && shared("layout") !== "ram" && cx) {
      cx.spawn(async () => {
        try { await (c === "rg" ? rgHere() : lazygitHere()); } finally { this.hide(); }
      });
      return;
    }
    this.hide();
    runCommand(c);
  }

  // ---------------------------------------------------------------- navigate mode

  // It starts on the space, tab and pane you're in: where Esc goes back to.
  startNav() {
    if (this.done || this.nav) return;
    const list = spaces();
    if (!list.length) { this.cancel(); return; }
    const f = focused();
    const here = list.find((s) => s.id === f?.space) ?? list.find((s) => s.active) ?? list[0];
    const tab = here.tabs.find((t) => t.id === f?.tab) ?? here.tabs.find((t) => t.active) ?? null;
    this.origin = { space: here.id, tab: tab?.id ?? null, pane: f?.pane ?? null };
    this.moved = false;
    this.navTab = tab?.id ?? null;
    this.pointAt(here.id);
  }

  pointAt(id) {
    this.nav = id;
    setShared(NAV, { id, at: Date.now() });
  }

  // One key in navigate mode, by its spellings (see the top of this file). The
  // pane keys are H J K L as keys.json spells them (shift-h) or as typed (H).
  navKey(spellings) {
    const is = (...ks) => spellings.some((k) => ks.includes(k));
    const pane = [["shift-h", "H", "left"], ["shift-j", "J", "down"], ["shift-k", "K", "up"], ["shift-l", "L", "right"]]
      .find(([a, b]) => is(a, b));
    if (is("j", "down")) this.moveNav(1);
    else if (is("k", "up")) this.moveNav(-1);
    else if (is("h", "left")) this.moveTab(-1);
    else if (is("l", "right")) this.moveTab(1);
    else if (pane) { this.moved = true; run("pane.go", { direction: pane[2] }); }
    else if (is("escape")) this.back();
    else this.stay();
  }

  // BY spaces on, round the ends (from the shown one if its space has gone), and
  // show it. Its tabs start from the one it shows (moveTab: the last tab moved to
  // isn't one of them).
  moveNav(by) {
    const list = spaces();
    if (!list.length) return;
    let i = list.findIndex((s) => s.id === this.nav);
    if (i < 0) i = Math.max(0, list.findIndex((s) => s.active));
    const next = list[(((i + by) % list.length) + list.length) % list.length];
    this.pointAt(next.id);
    this.moved = true;
    run("space.select", { id: next.id });
  }

  // BY tabs on in the space it's on, round the ends, skipping settled tabs (as
  // tab.next does), and show it.
  moveTab(by) {
    const s = spaces().find((x) => x.id === this.nav);
    const tabs = (s?.tabs ?? []).filter((t) => !t.settled);
    if (!tabs.length) return;
    let i = tabs.findIndex((t) => t.id === this.navTab);
    if (i < 0) i = Math.max(0, tabs.findIndex((t) => t.active));
    const next = tabs[(((i + by) % tabs.length) + tabs.length) % tabs.length];
    this.navTab = next.id;
    this.moved = true;
    run("tab.select", { id: next.id });
  }

  // Enter (or any other key, or a click outside the bar): stay where you are.
  stay() {
    this.endNav();
    if (this.done) return;
    this.done = true;
    this.hide();
  }

  // Esc: back to the space, tab and pane it started on (those still there),
  // when it moved at all.
  back() {
    const o = this.origin, moved = this.moved;
    this.endNav();
    if (o && moved) {
      const s = spaces().find((x) => x.id === o.space);
      if (s) run("space.select", { id: s.id });
      if (s?.tabs.some((t) => t.id === o.tab)) run("tab.select", { id: o.tab });
      if (o.pane && panes().some((p) => p.pane === o.pane)) run("pane.focus", { pane: o.pane });
    }
    if (this.done) return;
    this.done = true;
    this.hide();
  }

  endNav() {
    if (!this.nav) return;
    this.nav = null;
    setShared(NAV, null);
  }

  hide() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  // When the bar goes (a key ran, Esc, a click outside), it must never act again,
  // and the layouts stop marking a space. Still navigating means Herdr closed it
  // for Esc (a popup's Esc never reaches on_key_down): back to where it started.
  async close() {
    this.done = true;
    if (this.nav) this.back();
    this.endNav();
  }

  cancel() {
    this.endNav();
    if (this.done) return;
    this.done = true;
    this.hide();
  }

  render(cx) {
    const t = theme();
    const prefix = terse(keys().find((k) => k.section === "global" && k.action === `mod.open:${NAME}`)?.keys ?? "ctrl-b");
    const hint = (it) =>
      h_flex().gap(5).flex_none()
        .child(div().text_color(t.accent).font_semibold().child(it.keys.map(terse).join(" ")))
        .child(div().text_color(t.foreground).child(it.label));
    const area = ([name, rows]) =>
      h_flex().gap(12).flex_none().items_center()
        .child(div().text_color(t.dim).text_size(12).child(name))
        .children(rows.map(hint));
    const badge = (text) => div().px(6).bg(t.accent).text_color(t.accent_foreground).font_semibold().child(text);
    // Navigate mode: which space and tab it's on, then its keys.
    const list = spaces(), at = list.findIndex((s) => s.id === this.nav), on = list[at];
    const tabs = (on?.tabs ?? []).filter((x) => !x.settled);
    const tab = tabs.find((x) => x.id === this.navTab) ?? tabs.find((x) => x.active);
    const navRow = () => h_flex().id("prefix-nav").gap(10).items_center()
      .child(badge("navigate"))
      .child(div().text_color(t.foreground).font_semibold().child(on ? on.name : "no space"))
      .when(Boolean(on?.machine), (el) => el.child(div().text_color(t.dim).child(`@${on.machine}`)))
      .when(Boolean(on), (el) => el.child(div().text_color(t.dim).child(`${at + 1} of ${list.length}`)))
      .when(Boolean(tab), (el) => el.child(div().text_color(t.foreground).child(`tab ${tab.index}${tab.named ? " " + tab.name : ""}`))
        .child(div().text_color(t.dim).child(`${tabs.indexOf(tab) + 1} of ${tabs.length}`)))
      .child(div().w(18))
      .children([{ keys: ["j k"], label: "space" }, { keys: ["h l"], label: "tab" }, { keys: ["H J K L"], label: "pane" },
        { keys: ["Enter"], label: "stay" }, { keys: ["Esc"], label: "back" }].map(hint));
    return v_flex()
      .id("prefix-layer")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (["shift", "control", "alt", "platform", "function"].includes(e.key)) return;
        if (this.done) return;
        const action = boundAction(e);
        if (this.nav) {
          cx.stop_propagation();
          // A bound key (j, k) comes as its action, to dispatch(): acting here
          // too would move twice.
          if (!action) { this.navKey([e.keystroke]); cx.notify(); }
          return;
        }
        // Not a prefix key (Esc, a typo): close at once, so nothing typed next can act.
        if (!action) { cx.stop_propagation(); this.cancel(); return; }
        // A prefix key: Herdr hands it to nextCommand(). Should it not arrive, run
        // it here, unless it started navigate mode meanwhile (^b w).
        cx.timer.after(150, (tcx) => { if (!this.nav) this.dispatch(action, tcx); });
      })
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (this.nav) this.stay(); else this.cancel(); })
      // Popups size to their content, so the layer asks for more height than any
      // window has: Herdr clips it to the window, and justify_end puts the bar on
      // the bottom edge.
      .w_full()
      .h(4000)
      .justify_end()
      .child(
        v_flex()
          .id("prefix-bar")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .w_full()
          .px(14)
          .pt(9)
          .pb(24) // a blank line's worth of room below the last row
          .gap(6)
          .bg(t.popover)
          .border_t(1)
          .border_color(t.accent)
          .text_size(13)
          // Navigate mode has one row: the space it's on and its keys.
          .when(Boolean(this.nav), (el) => el.child(navRow()))
          .when(!this.nav, (el) => el
            .child(h_flex().gap(10).items_center()
              .child(badge(prefix))
              .child(div().text_color(t.dim).child("then a key · Esc cancels")))
            .child(h_flex().flex_wrap().gap_x(28).gap_y(6).children(hints().map(area)))),
      );
  }
}
