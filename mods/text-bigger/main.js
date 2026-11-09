// ⌘+ (keys.json binds cmd-= and cmd-+ to mod.open:text-bigger): every
// terminal's text one size bigger, the shell's, the agents', hunk's and
// lazygit's alike. The panels (RAM's sticks, Traveler's lists) keep their size;
// ^b + still zooms everything. mod.open shows this mod as an empty, frameless
// window, which doesn't take the keyboard; it changes settings.json the way
// Settings → Look's terminal font size does, then closes itself.
// Its twin is mods/text-smaller (⌘-): the same file but for STEP and its name.
import { View, div } from "gpui-kit";
import { props, closeOverlay, appHome, readTextFile, writeTextFile } from "herdr";

const STEP = 1;
// Settings → Look's range for the terminal font, and Herdr's size when
// settings.json names none.
const MIN = 8, MAX = 32, DEFAULT = 14;

// settings.json's font_size moved by BY: read the file, change it, write it
// back only if nobody changed it meanwhile (else read it again), as Settings
// does. A file that isn't a JSON object is left alone. Returns the new size, or
// null when nothing could be written.
export async function step(by = STEP) {
  const file = `${appHome()}/settings.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw = null, person = {};
    try {
      raw = await readTextFile(file);
      person = raw ? JSON.parse(raw) : {};
    } catch { return null; }
    if (!person || typeof person !== "object" || Array.isArray(person)) return null;
    const now = Number(person.font_size);
    const next = Math.max(MIN, Math.min(MAX, (Number.isFinite(now) ? Math.round(now) : DEFAULT) + by));
    if (next === now) return next;
    try {
      await writeTextFile(file, JSON.stringify({ ...person, font_size: next }, null, 2) + "\n", raw);
      return next;
    } catch { /* the file changed meanwhile: read it again */ }
  }
  return null;
}

export default class TextBigger extends View {
  init(_props, cx) {
    // Only when its key opened it (not, say, under herdr-app check).
    const overlay = props()?.overlay;
    if (!overlay) return;
    cx.spawn(async () => {
      try { await step(); } finally { closeOverlay(overlay); }
    });
  }

  render() { return div(); }
}
