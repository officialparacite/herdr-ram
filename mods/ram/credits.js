// RAM's credits (role "credits"): who made it, its license and where it
// lives (NOTICE lists the projects it builds on). A click on the strip's space
// name (top left) or ^b R (ram.credits) opens it; Esc, Enter or its close
// button closes it, and a click on the repo's address opens that page in the
// browser.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, theme } from "herdr";
import { AMBER, CYAN, U, stop, textW } from "./ui.js";

export const AUTHOR = "Srivatsa Kannan";
export const REPO = "https://github.com/officialparacite/herdr-ram";
const COPYRIGHT = `Copyright 2026 ${AUTHOR} \u00b7 Apache License 2.0`;
const WEB = REPO.replace(/^https:\/\//, ""), ARROW = "\u2197";

// Sizes are N * U, as everywhere in RAM. The dialog is as wide as its longest
// line (the fonts are monospace: textW) plus its padding and border, and has
// no height: Herdr fits a dialog opened without one to what's in it.
const PAD = 14 * U, TITLE = 15 * U, NAME = 13 * U, TEXT = 11.5 * U, SMALL = 11 * U;
const TITLE_GAP = 8 * U, NAME_GAP = 6 * U, LINK_GAP = 4 * U;
const LINES = [
  textW("RAM", TITLE) + TITLE_GAP + textW("a Herdr layout", TEXT),
  textW("Made by", TEXT) + NAME_GAP + textW(AUTHOR, NAME),
  textW(COPYRIGHT, SMALL),
  textW(WEB, SMALL) + LINK_GAP + textW(ARROW, SMALL),
];
export const CREDITS_W = Math.ceil(2 * PAD + 2 + Math.max(...LINES)) + 8;

export function openCredits() {
  openOverlay({ mod: "ram", kind: "dialog", width: CREDITS_W, props: { role: "credits" } });
}

export class Credits {
  constructor(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  close() {
    const o = props()?.overlay;
    if (o) closeOverlay(o);
  }

  // Enter closes it too (Esc is Herdr's: it closes any dialog).
  key(e, cx) {
    if (e.keystroke !== "enter" && e.keystroke !== "escape") return;
    cx.stop_propagation();
    this.close();
  }

  render() {
    const t = theme(), space = h => div().h(h).flex_none();
    return v_flex().id("ram-credits").size_full().p(PAD).gap(4 * U).bg(t.popover)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().flex_none().gap(TITLE_GAP).items_baseline()
        .child(div().flex_none().text_size(TITLE).font_semibold().text_color(CYAN).child("RAM"))
        .child(div().flex_none().text_size(TEXT).text_color(t.muted).child("a Herdr layout")))
      .child(space(6 * U))
      .child(h_flex().flex_none().gap(NAME_GAP).items_baseline()
        .child(div().flex_none().text_size(TEXT).text_color(t.dim).child("Made by"))
        .child(div().id("credits-author").flex_none().text_size(NAME).font_semibold().text_color(AMBER).child(AUTHOR)))
      .child(div().flex_none().text_size(SMALL).text_color(t.dim).child(COPYRIGHT))
      // The address in the parts' own color, so the hover's amber reaches them.
      .child(h_flex().id("credits-repo").flex_none().gap(LINK_GAP).items_center().text_size(SMALL).text_color(t.muted)
        .cursor_pointer().hover(st => st.text_color(AMBER)).tooltip("Open it in your browser")
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(REPO); })
        .child(div().flex_none().underline().child(WEB))
        .child(div().flex_none().child(ARROW)))
      .child(space(6 * U))
      .child(h_flex().flex_none().justify_end()
        .child(h_flex().id("credits-close").h(20 * U).px(7 * U).gap(5 * U).flex_none().items_center().rounded(2)
          .border(1).border_color(t.input).cursor_pointer().hover(st => st.bg(t.hover)).tooltip("Close  Esc")
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); this.close(); })
          .child(div().text_size(10 * U).font_semibold().text_color(AMBER).child("Esc"))
          .child(div().text_size(10.5 * U).text_color(t.muted).child("close"))));
  }
}
