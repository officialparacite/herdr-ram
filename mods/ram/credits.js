// RAM's credits (role "credits"): who made it, its license, where it lives
// and what it builds on (NOTICE has the details). A click on the strip's space
// name (top left) or ^b R (ram.credits) opens it; Esc, Enter or its close
// button closes it, and a click on the repo's address opens that page in the
// browser.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, theme } from "herdr";
import { AMBER, CYAN, U, stop, textW } from "./ui.js";

export const AUTHOR = "Srivatsa Kannan";
export const REPO = "https://github.com/officialparacite/herdr-ram";
export const ABOUT = "Work on many projects at once and see all of them on one screen.";
// What RAM builds on, as NOTICE says: [project, by, what it gave, license].
export const THANKS = [
  ["Night City", "vib-z", "the agent model the sticks use", "MIT"],
  ["Traveler", "Frank Lin", "git branch and counts", "Apache 2.0"],
  ["Herdr", null, "the right-click menu and text size", "Apache 2.0"],
  ["GitHub Linguist", null, "LANG's colors", "MIT"],
  ["serpl", "Yassine Bridi", "the idea for search and replace", null],
  ["rg-fzf", null, "the search window's keys and options", null],
];

// Sizes are N * U, as everywhere in RAM. Thanks' first column is as wide as
// its widest name and author, and the dialog as wide as its longest line (the
// fonts are monospace: textW) plus its padding and border. It has no height:
// Herdr fits a dialog opened without one to what's in it.
const PAD = 14 * U, GAP = 8 * U, BY_GAP = 5 * U, TEXT = 11.5 * U, SMALL = 11 * U;
const whatOf = ([, , what, license]) => license ? `${what} (${license})` : what;
export const NAME_W = Math.ceil(Math.max(...THANKS.map(([name, by]) => textW(name, TEXT) + (by ? BY_GAP + textW(`by ${by}`, SMALL) : 0))));
export const CREDITS_W = Math.ceil(2 * PAD + 2 + Math.max(textW(ABOUT, TEXT),
  NAME_W + GAP + Math.max(...THANKS.map(x => textW(whatOf(x), SMALL))))) + 8;

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
    const t = theme(), web = REPO.replace(/^https:\/\//, "");
    const line = (text, color, size = TEXT) => div().flex_none().text_size(size).text_color(color).child(text);
    const space = h => div().h(h).flex_none();
    const thank = (x, k) => h_flex().id(`credits-thanks-${k}`).flex_none().gap(GAP).items_center()
      .child(h_flex().w(NAME_W).flex_none().gap(BY_GAP).items_center().overflow_hidden()
        .child(div().flex_none().text_size(TEXT).font_semibold().text_color(t.foreground).child(x[0]))
        .when(Boolean(x[1]), el => el.child(div().flex_none().text_size(SMALL).text_color(t.muted).child(`by ${x[1]}`))))
      .child(div().flex_1().min_w(0).truncate().text_size(SMALL).text_color(t.dim).child(whatOf(x)));
    return v_flex().id("ram-credits").size_full().p(PAD).gap(4 * U).bg(t.popover)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().flex_none().gap(GAP).items_baseline()
        .child(div().flex_none().text_size(15 * U).font_semibold().text_color(CYAN).child("RAM"))
        .child(div().flex_none().text_size(TEXT).text_color(t.muted).child("a Herdr layout")))
      .child(line(ABOUT, t.foreground))
      .child(space(6 * U))
      .child(h_flex().flex_none().gap(6 * U).items_baseline()
        .child(div().flex_none().text_size(TEXT).text_color(t.dim).child("Made by"))
        .child(div().id("credits-author").flex_none().text_size(13 * U).font_semibold().text_color(AMBER).child(AUTHOR)))
      .child(line(`Copyright 2026 ${AUTHOR} \u00b7 Apache License 2.0`, t.dim, SMALL))
      // The address in the parts' own color, so the hover's amber reaches them.
      .child(h_flex().id("credits-repo").flex_none().gap(4 * U).items_center().text_size(SMALL).text_color(t.muted)
        .cursor_pointer().hover(st => st.text_color(AMBER)).tooltip("Open it in your browser")
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(REPO); })
        .child(div().flex_none().underline().child(web))
        .child(div().flex_none().child("\u2197")))
      .child(space(6 * U))
      .child(line("Thanks to", CYAN, SMALL))
      .child(v_flex().id("credits-thanks").flex_none().gap(1 * U).children(THANKS.map(thank)))
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
