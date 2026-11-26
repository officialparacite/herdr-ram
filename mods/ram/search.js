// RAM's search window (role "search"): rg-fzf drawn by Herdr, each of its keys
// a button as well. ripgrep searches as you type and its results stream in: a
// run in the background (RUN_SH) writes them into numbered files the window
// reads as they grow, and each change stops the run before it. bat colors the
// preview (your bat theme), scrolled to the line.
//   Enter, Ctrl-O, Alt-Enter   the picked lines' files, the lines, or JSON, at
//                    the prompt of the terminal you came from (Alt-C: copied instead)
//   Ctrl-E, double-click  $EDITOR at the line, in a new tab
//   Ctrl-F           content (ripgrep's regex; Alt-P PCRE2) or filename (fzf's match)
//   Alt-V Alt-I Alt-U  invert, hidden files, one result per file
//   Tab Shift-Tab Ctrl-A Ctrl-Z  pick and move, all, none
//   Ctrl-P Ctrl-D Ctrl-U Alt-W Alt-N  preview, its scroll, wrap, line numbers
//   Alt-[ Alt-]      the divider between the list and the preview (or drag it)
//   Alt-S            the repo or the folder you're in; Alt-/ F1 every key; Esc closes
// ^b / opens it over the window (every layout: the key bar's searchHere(), in
// RAM openSearch() here); `ram-search` opens it in a tab of its own for the
// files piped to it. Each space keeps its last search (shared SEARCH_LAST).
// Props: at (SEARCH_TOP's value: a newer window closes this one), space, name,
// machine, target {pane, terminal} (where picks go), folder (that terminal's),
// repo (its repo's top, or null); from ram-search: list (a NUL-separated file
// list to search instead) and cwd (where its names are relative to).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, readTextFile, props, closeOverlay, openOverlay, theme, shared, setShared, run, settings,
  notify, home, panes, focused, spaces } from "herdr";
import { AMBER, CYAN, RED, U, realDir } from "./ui.js";

export const SEARCH_LAST = "ram.search.last";
export const SEARCH_TOP = "ram.search.top";
// A run's results come in files of CHUNK lines; it stops at MAX_ROWS ("+").
export const CHUNK = 500, MAX_ROWS = 20000;
// How often the window looks for new results while a run goes on.
const POLL = 40;
// The preview asks bat for this many lines around what it shows.
const PV_SPAN = 300;
const ROW_H = 17 * U, LINE_H = 15 * U, TEXT = 11 * U, CODE = 11 * U, QUERY = 12 * U;
const zoom = () => Number(settings()?.zoom) || 1;
const mono = () => settings()?.font_family ?? "JetBrains Mono";
const charW = size => size * 0.6;

// The run, as sh (`sh -c RUN_SH sh ARGS`, runArgs()): it stops the run before
// ($1 its process group, $2 its folder, removed), makes a private folder and
// prints its process group and that folder, then searches in the background
// and returns. ripgrep's options are rg-fzf's: case-insensitive, its default
// engine or PCRE2, long lines cut at 500 columns, hidden files, invert, one
// per file. An empty query lists the files instead. In content mode the file
// name query (fzf's filter) picks the files searched; in filename mode it
// filters what the content query found by the file's name, as rg-fzf does.
// Fields are split by \x1f (macOS's awk can't carry the NUL rg-fzf uses); the
// path, line and column lose their color codes, so only matches keep theirs.
// The lines go into files of CHUNK lines named 000000, 000001...; "more"
// marks a run that stopped at MAX_ROWS, "end" one that finished, "err" holds
// what ripgrep or fzf said (a regex that doesn't parse).
const CLEAN = [
  'BEGIN { R = "\\033\\\\[0m" }',
  'meta == 0 { print; fflush(); next }',
  '{ n = split($0, p, "\\037"); if (n <= meta) { print; fflush(); next }',
  '  s = ""; for (i = 1; i <= meta; i++) { gsub(R, "", p[i]); s = s p[i] "\\037" }',
  '  t = p[meta + 1]; for (i = meta + 2; i <= n; i++) t = t "\\037" p[i]',
  '  print s t; fflush() }',
].join("\n");
const CHUNKS = [
  'NR > max { printf "" > (d "/more"); exit }',
  '(NR - 1) % n == 0 { if (f != "") close(f); f = sprintf("%s/%06d", d, int((NR - 1) / n)) }',
  '{ print > f; fflush(f) }',
].join("\n");
export const RUN_SH = [
  'old=$1 olddir=$2 mode=$3 q=$4 fq=$5 hidden=$6 invert=$7 engine=$8 unique=$9 list=${10} sweep=${11}',
  'if [ -n "$old" ] && [ ! -e "$olddir/end" ]; then kill -s TERM -- "-$old" 2>/dev/null; fi',
  // (A run still dying can write one more file: then once more, a moment later.)
  'case $olddir in */ram-search.??????) rm -rf -- "$olddir" 2>/dev/null || { (sleep 1; rm -rf -- "$olddir") </dev/null >/dev/null 2>&1 & } ;; esac',
  // Folders an earlier window left behind (one closed while its run started).
  '[ "$sweep" = 1 ] && find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name "ram-search.??????" -mmin +60 -exec rm -rf {} + </dev/null >/dev/null 2>&1 &',
  'd=$(mktemp -d "${TMPDIR:-/tmp}/ram-search.XXXXXX") || exit 1',
  'echo "$$"',
  'echo "$d"',
  'H=; [ "$hidden" = 1 ] && H=--hidden',
  'ff=; [ "$mode" = content ] && ff=$fq',
  'meta=3; [ "$invert" = 1 ] && meta=2; [ -z "$q" ] && meta=0',
  'set -- --engine "$engine" --ignore-case --column --line-number --no-heading --color=always \\',
  '  --colors path:none --colors line:none --colors column:none --with-filename \\',
  "  --field-match-separator '\\x1f' --max-columns 500 --max-columns-preview $H",
  '[ "$invert" = 1 ] && set -- "$@" --invert-match',
  '[ "$unique" = 1 ] && set -- "$@" --max-count 1',
  'set -- "$@" -e "$q"',
  '(',
  '  {',
  '    if [ -z "$q" ] || [ -n "$ff" ]; then',
  '      if [ -n "$list" ]; then xargs -0 -r rg --files --null $H -- < "$list"; else rg --files --null $H; fi |',
  '        if [ -n "$ff" ]; then fzf --filter "$ff" --read0 --print0 --no-sort; else cat; fi |',
  '        if [ -z "$q" ]; then tr "\\000" "\\n"; else xargs -0 -r rg "$@" --; fi',
  '    elif [ -n "$list" ]; then xargs -0 -r rg "$@" -- < "$list"',
  '    else rg "$@"',
  '    fi |',
  `      awk -v meta="$meta" '${CLEAN}' |`,
  '      if [ "$mode" = filename ] && [ -n "$fq" ]; then',
  '        if [ "$meta" = 0 ]; then fzf --filter "$fq" --no-sort',
  "        else fzf --filter \"$fq\" --delimiter '\\x1f' --nth 1 --no-sort; fi",
  '      else cat; fi |',
  `      awk -v d="$d" -v n=${CHUNK} -v max=${MAX_ROWS} '${CHUNKS}'`,
  '  } 2> "$d/err"',
  '  : > "$d/end"',
  ') < /dev/null > /dev/null 2>&1 &',
].join("\n");
// Stops a run ($1 its process group, $2 its folder) and removes its folder and
// ram-search's file list ($3).
export const STOP_SH = [
  'if [ -n "$1" ] && [ ! -e "$2/end" ]; then kill -s TERM -- "-$1" 2>/dev/null; fi',
  'case $2 in */ram-search.??????) rm -rf -- "$2" 2>/dev/null || { (sleep 1; rm -rf -- "$2") </dev/null >/dev/null 2>&1 & } ;; esac',
  'case $3 in */ram-search-list.??????) rm -f -- "$3" ;; esac',
].join("\n");
// $EDITOR at a line ($1) of a file ($2), as rg-fzf's ^e: the line first, which
// every editor it knows takes (Fresh needs it so).
export const EDIT_SH = 'exec ${EDITOR:-vim} "+$1" "$2"';

// RUN_SH's arguments for search ST, stopping OLD ({ pgid, dir }), searching
// LIST's files instead of the folder when there is one.
export function runArgs(st, old, list, sweep) {
  return [old?.pgid ?? "", old?.dir ?? "", st.mode, st.q, st.fq, st.hidden ? "1" : "", st.invert ? "1" : "",
    st.pcre2 ? "pcre2" : "default", st.unique ? "1" : "", list ?? "", sweep ? "1" : ""];
}
// How many fields come before a result's text: 3 (file, line, column), 2 for
// an inverted line (no column), 0 for a listed file (an empty query).
export const metaOf = st => !st.q ? 0 : st.invert ? 2 : 3;

// One of RUN_SH's lines as a row: a match, an inverted line or a listed file.
export function parseRow(raw, meta) {
  if (!meta) return { kind: "file", file: raw };
  const p = raw.split("\x1f");
  if (p.length <= meta) return { kind: "file", file: p[0] };
  return { kind: meta === 3 ? "match" : "line", file: p[0], line: Number(p[1]) || 1,
    col: meta === 3 ? Number(p[2]) || 1 : null, text: p.slice(meta).join("\x1f") };
}
// A row's identity across runs (what stays picked when a search changes),
// kept on the row once made.
export const keyOf = r => r.key ?? (r.key = `${r.file}\x1f${r.line ?? ""}\x1f${r.col ?? ""}`);

// ---------------------------------------------------------------- colors

const BASE16 = ["#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
  "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"];
const hex2 = n => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, "0");
// An xterm color number as #rrggbb: the 16 (the theme's ansi colors when it
// has them), the 6x6x6 cube, the grays.
export function xterm(n, ansi = BASE16) {
  n = Number(n) || 0;
  if (n < 16) return ansi[n] ?? BASE16[n];
  if (n < 232) {
    const L = [0, 95, 135, 175, 215, 255], i = n - 16;
    return `#${hex2(L[Math.floor(i / 36)])}${hex2(L[Math.floor(i / 6) % 6])}${hex2(L[i % 6])}`;
  }
  const g = 8 + 10 * (n - 232);
  return `#${hex2(g)}${hex2(g)}${hex2(g)}`;
}
function applySgr(st, params, ansi) {
  const p = params === "" ? [0] : params.split(/[;:]/).map(x => (x === "" ? 0 : Number(x)));
  const s = { ...st };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === 0) { for (const k of Object.keys(s)) delete s[k]; }
    else if (c === 1) s.bold = true;
    else if (c === 2) s.dim = true;
    else if (c === 3) s.italic = true;
    else if (c === 4) s.underline = true;
    else if (c === 22) { delete s.bold; delete s.dim; }
    else if (c === 23) delete s.italic;
    else if (c === 24) delete s.underline;
    else if (c >= 30 && c <= 37) s.fg = xterm(c - 30, ansi);
    else if (c >= 90 && c <= 97) s.fg = xterm(c - 82, ansi);
    else if (c === 39) delete s.fg;
    else if (c >= 40 && c <= 47) s.bg = xterm(c - 40, ansi);
    else if (c >= 100 && c <= 107) s.bg = xterm(c - 92, ansi);
    else if (c === 49) delete s.bg;
    else if (c === 38 || c === 48) {
      const k = c === 38 ? "fg" : "bg";
      if (p[i + 1] === 2) { s[k] = `#${hex2(p[i + 2])}${hex2(p[i + 3])}${hex2(p[i + 4])}`; i += 4; }
      else if (p[i + 1] === 5) { s[k] = xterm(p[i + 2], ansi); i += 2; }
    }
  }
  return s;
}
// Text with SGR color codes (bat's, rg's) as runs [{ text, fg, bg, bold, dim,
// italic, underline }], starting in style FROM; other escapes are dropped, a
// carriage return too, other control characters show as U+FFFD.
const ESCAPES = /\x1b\[([0-9;:]*)m|\x1b\[[0-9;:?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]?/g;
const tidy = s => s.replace(/\r/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "\ufffd");
export function sgrRuns(line, from = {}, ansi = BASE16) {
  const runs = [];
  let st = { ...from }, last = 0, m;
  const add = text => {
    if (!text) return;
    const prev = runs.at(-1);
    if (prev && sameStyle(prev, st)) prev.text += text;
    else runs.push({ ...st, text });
  };
  ESCAPES.lastIndex = 0;
  while ((m = ESCAPES.exec(line))) {
    add(tidy(line.slice(last, m.index)));
    last = ESCAPES.lastIndex;
    if (m[1] !== undefined) st = applySgr(st, m[1], ansi);
  }
  add(tidy(line.slice(last)));
  return { runs, style: st };
}
const STYLE = ["fg", "bg", "bold", "dim", "italic", "underline"];
const sameStyle = (a, b) => STYLE.every(k => a[k] === b[k]);
// Without the color codes (what ^o and JSON give).
export const plainText = line => sgrRuns(line).runs.map(r => r.text).join("");

// A result's text for the list: its matches marked (rg colors only those),
// the indent dropped, tabs as 4 spaces. [{ text, mark }]
export function lineView(text) {
  const out = [];
  let col = 0, lead = true;
  for (const r of sgrRuns(text).runs) {
    let s = "";
    for (const ch of r.text) {
      if (lead && (ch === " " || ch === "\t")) continue;
      lead = false;
      if (ch === "\t") { const n = 4 - (col % 4); s += " ".repeat(n); col += n; }
      else { s += ch; col += 1; }
    }
    if (!s) continue;
    const mark = Boolean(r.fg || r.bg || r.bold || r.underline), prev = out.at(-1);
    if (prev && prev.mark === mark) prev.text += s; else out.push({ text: s, mark });
  }
  return out;
}
// RUNS cut into rows of COLS characters (WRAP), else only its first row.
export function cutRuns(runs, cols, wrap) {
  const rows = [[]];
  let n = 0;
  for (const r of runs) {
    let chars = Array.from(r.text);
    while (chars.length) {
      if (n >= cols) {
        if (!wrap) return rows;
        rows.push([]);
        n = 0;
      }
      const part = chars.slice(0, cols - n);
      rows.at(-1).push({ ...r, text: part.join("") });
      n += part.length;
      chars = chars.slice(part.length);
    }
  }
  return rows;
}

// ---------------------------------------------------------------- what picks give

// A shell word: as is when it's plain, else in single quotes.
export const shellQuote = s => /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`;
// A file as a program's argument: ./ before a name that would read as an option.
export const argPath = f => f.startsWith("-") ? `./${f}` : f;
// A result's path for the terminal it lands in: relative to TO (that terminal's
// folder) when it's under it, else from / . FROM: the folder it was found from.
// /private/tmp and /tmp (and /var) are one folder on macOS (realDir).
export function pathFor(file, from, to) {
  if (!to || !from) return argPath(file);
  const under = d => (d === "/" ? "/" : d + "/");
  const abs = file.startsWith("/") ? file : under(realDir(from)) + file.replace(/^\.\//, "");
  const a = realDir(abs), base = realDir(to);
  if (a === base) return ".";
  return a.startsWith(under(base)) ? argPath(a.slice(under(base).length)) : abs;
}
const byBytes = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Enter: the rows' files, each once, sorted, as shell words on one line (a
// multi-line paste at a shell's prompt would run each line).
export const filesText = (rows, path) =>
  [...new Set(rows.map(r => path(r.file)))].sort(byBytes).map(shellQuote).join(" ");
// ^o: each row as file:line:column:text (an inverted line has no column, a
// listed file is file:1:1:), one a line, as rg-fzf prints them.
export const linesText = (rows, path) => rows.map(r => r.kind === "file" ? `${path(r.file)}:1:1:`
  : r.kind === "line" ? `${path(r.file)}:${r.line}:${plainText(r.text)}`
  : `${path(r.file)}:${r.line}:${r.col}:${plainText(r.text)}`).join("\n");
// ripgrep's JSON for the picked files: each match's whole line and matched
// text, by file and line.
export function jsonHits(stdout) {
  const hits = new Map();
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.startsWith('{"type":"match"')) continue;
    let d;
    try { d = JSON.parse(line).data; } catch (_) { continue; }
    if (d?.path?.text == null || d.line_number == null) continue;
    hits.set(`${d.path.text}\x1f${d.line_number}`, {
      text: typeof d.lines?.text === "string" ? d.lines.text.replace(/\n$/, "").replace(/\r$/, "") : null,
      matches: (d.submatches ?? []).map(s => s?.match?.text).filter(x => typeof x === "string") });
  }
  return hits;
}
// ⌥⏎: rg-fzf's JSON, { query, results }: a listed file is { file }, an inverted
// line { file, line, text }, a match { file, line, column, text, matches } with
// its whole line and matched text from ripgrep's own JSON (HITS).
export function jsonText(query, rows, hits, path) {
  const results = rows.map(r => {
    if (r.kind === "file") return { file: path(r.file) };
    if (r.kind === "line") return { file: path(r.file), line: r.line, text: plainText(r.text) };
    const h = hits.get(`${r.file}\x1f${r.line}`);
    return { file: path(r.file), line: r.line, column: r.col, text: h?.text ?? plainText(r.text), matches: h?.matches ?? [] };
  });
  return JSON.stringify({ query, results }, null, 2);
}

// ---------------------------------------------------------------- the field

const isLow = c => c >= 0xdc00 && c <= 0xdfff;
const before = (v, at) => (at > 1 && isLow(v.charCodeAt(at - 1)) ? at - 2 : Math.max(0, at - 1));
const after = (v, at) => (at < v.length - 1 && isLow(v.charCodeAt(at + 1)) ? at + 2 : Math.min(v.length, at + 1));
const WORD = /[\p{L}\p{N}_]/u;
export function wordBack(v, at) {
  let i = at;
  while (i > 0 && !WORD.test(v[i - 1])) i--;
  while (i > 0 && WORD.test(v[i - 1])) i--;
  return i;
}
export function wordOn(v, at) {
  let i = at;
  while (i < v.length && !WORD.test(v[i])) i++;
  while (i < v.length && WORD.test(v[i])) i++;
  return i;
}
// A key in the query field: V with the cursor AT, after it. Returns
// { value, at } or null (not the field's key). PASTE: the clipboard's text.
export function editField(v, at, e, paste = () => "") {
  const ks = e.keystroke, m = e.modifiers ?? {};
  at = Math.max(0, Math.min(at, v.length));
  if (ks === "backspace") { const b = before(v, at); return { value: v.slice(0, b) + v.slice(at), at: b }; }
  if (ks === "delete") return { value: v.slice(0, at) + v.slice(after(v, at)), at };
  if (ks === "alt-backspace" || ks === "ctrl-w") { const b = wordBack(v, at); return { value: v.slice(0, b) + v.slice(at), at: b }; }
  if (ks === "cmd-backspace") return { value: v.slice(at), at: 0 };
  if (ks === "left") return { value: v, at: before(v, at) };
  if (ks === "right") return { value: v, at: after(v, at) };
  if (ks === "alt-left") return { value: v, at: wordBack(v, at) };
  if (ks === "alt-right") return { value: v, at: wordOn(v, at) };
  if (ks === "home" || ks === "cmd-left") return { value: v, at: 0 };
  if (ks === "end" || ks === "cmd-right") return { value: v, at: v.length };
  if (ks === "cmd-v") {
    const t = String(paste() ?? "").replace(/[\r\n\t]+/g, " ");
    return { value: v.slice(0, at) + t + v.slice(at), at: at + t.length };
  }
  const ch = e.key_char;
  // With Option as Alt (Herdr's default on US layouts) an alt key carries its
  // plain letter: it types nothing. Where Option types (π, ≈), that's typed.
  if (m.alt && typeof ch === "string" && ch.toLowerCase() === String(e.key ?? "").toLowerCase()) return null;
  if (typeof ch === "string" && ch && !m.control && !m.platform && !/[\x00-\x1f\x7f]/.test(ch))
    return { value: v.slice(0, at) + ch + v.slice(at), at: at + ch.length };
  return null;
}

// ---------------------------------------------------------------- keys

// Every key, in the order the key list (⌥/, F1) shows them: [keystroke,
// action, label, what it does]. Each has a button too.
export const KEYS = [
  ["enter", "files", "files", "The picked lines' files (else this line's) at the prompt you came from"],
  ["ctrl-o", "lines", "lines", "The picked lines as file:line:column:text"],
  ["alt-enter", "json", "JSON", "The picked lines as JSON, with the query and what matched"],
  ["alt-c", "copy", "copy", "Copy those instead of putting them at the prompt"],
  ["ctrl-e", "edit", "edit", "This line in $EDITOR, in a new tab (a double-click too)"],
  ["ctrl-f", "mode", "filename", "Content (ripgrep's regex) or filename (fzf's fuzzy match)"],
  ["alt-p", "pcre2", "pcre2", "PCRE2: lookarounds and backreferences"],
  ["alt-v", "invert", "invert", "The lines that don't match"],
  ["alt-i", "hidden", "hidden", "Hidden files too (the files listed are always searched)"],
  ["alt-u", "unique", "one per file", "Only each file's first result"],
  ["alt-s", "scope", "scope", "The repo or the folder you're in"],
  ["tab", "next", "pick \u2193", "Pick this line (or unpick it) and go down"],
  ["shift-tab", "prev", "pick \u2191", "Pick this line (or unpick it) and go up"],
  ["ctrl-a", "all", "all", "Pick every line"],
  ["ctrl-z", "none", "none", "Unpick them all"],
  ["ctrl-p", "preview", "preview", "Show or hide the preview"],
  ["ctrl-d", "pvdown", "preview \u2193", "Scroll the preview down half a page"],
  ["ctrl-u", "pvup", "preview \u2191", "Scroll the preview up half a page"],
  ["alt-w", "wrap", "wrap", "Wrap the preview's long lines"],
  ["alt-n", "numbers", "numbers", "The preview's line numbers"],
  ["alt-[", "divleft", "divider \u2190", "Move the divider left: a wider preview (or drag it)"],
  ["alt-]", "divright", "divider \u2192", "Move the divider right: a wider list (or drag it)"],
  ["alt-/", "keys", "keys", "This list of keys"],
  ["f1", "keys", "keys", "This list of keys"],
  ["escape", "close", "close", "Close"],
];
// The keys that move in the list (a click or the wheel does it with the mouse).
const MOVES = { up: "up", "ctrl-k": "up", down: "down", "ctrl-j": "down", "ctrl-n": "down", pageup: "pageup", pagedown: "pagedown" };
export const ACTIONS = { ...Object.fromEntries(KEYS.map(([k, a]) => [k, a])), ...MOVES };
// Tab and shift-tab are bound (cx.bind_keys) in this window's key context: the
// UI kit's root takes them for moving the keyboard between controls otherwise.
export const KEY_CONTEXT = "RamSearch";
export const BINDINGS = [
  { keystroke: "tab", action: "ram_search.next", context: KEY_CONTEXT },
  { keystroke: "shift-tab", action: "ram_search.prev", context: KEY_CONTEXT },
];
// How a key is written, in words as rg-fzf's help writes them (the user asked
// for words, not symbols): Ctrl-O, Alt-V, Tab, Shift-Tab, Enter, Esc, F1.
const KEY_WORDS = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Cmd" };
const KEY_NAMES = { enter: "Enter", tab: "Tab", escape: "Esc", backspace: "Backspace", delete: "Delete", up: "Up",
  down: "Down", left: "Left", right: "Right", pageup: "PageUp", pagedown: "PageDown", home: "Home", end: "End", space: "Space" };
export function keyText(ks) {
  const parts = String(ks).split("-"), key = parts.pop();
  const name = KEY_NAMES[key] ?? (/^f\d+$/.test(key) ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key);
  return [...parts.map(p => KEY_WORDS[p] ?? p), name].join("-");
}
const keyFor = action => KEYS.find(k => k[1] === action)?.[0] ?? "";

// ---------------------------------------------------------------- opening it

const baseName = p => String(p ?? "").replace(/\/+$/, "").split("/").pop() || String(p ?? "");
async function repoTop(folder, machine) {
  try {
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on: machine });
    if (r.code === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch (_) { /* a machine that can't be reached, or no git: the folder */ }
  return null;
}

// The search window over the window, for the terminal FROM (focused()) in
// space S: its folder, and its repo's top when it's in one; what you pick goes
// to its prompt. No terminal (a mod's pane has the keyboard): the FALLBACK
// folder (RAM: the space's repo), else the space's, and picks are copied.
export async function openSearch(s, from, fallback = "") {
  if (!s) return;
  const term = from?.terminal ?? null;
  const pane = from?.pane ? panes().find(p => p.pane === from.pane) : null;
  const folder = (term && (pane?.cwd || from?.cwd)) || fallback || s.folder || "";
  if (!folder) {
    notify({ title: "Nowhere to search", body: `${s.name} has no folder yet.`, level: "info", timeout: 4000 });
    return;
  }
  const repo = await repoTop(folder, s.machine ?? null);
  const at = Date.now();
  setShared(SEARCH_TOP, at);
  openOverlay({ mod: "ram", kind: "dialog", width: 0.9, height: 0.86,
    props: { role: "search", at, space: s.id, name: s.name, machine: s.machine ?? null,
      target: term ? { pane: from.pane ?? null, terminal: term } : null, folder, repo } });
}

// ---------------------------------------------------------------- the window

const str = v => (typeof v === "string" ? v : "");
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// The preview's share of the body (the divider's place): kept in look.split,
// moved by a drag or Alt-[ Alt-], DIV_STEP at a time, within SPLIT_MIN..SPLIT_MAX.
export const SPLIT = 0.55, SPLIT_MIN = 0.2, SPLIT_MAX = 0.8, DIV_STEP = 0.05;
const DIV_W = 7 * U, LIST_MIN = 200, PV_MIN = 220;
const splitOf = v => (Number.isFinite(v) ? Math.round(clamp(v, SPLIT_MIN, SPLIT_MAX) * 1000) / 1000 : SPLIT);

export class SearchView {
  constructor(cx) {
    const p = { ...(props() ?? {}) };
    if (!p.space) p.space = focused()?.space ?? spaces().find(s => s.active)?.id ?? null;
    this.p = p;
    const last = shared(SEARCH_LAST) ?? {}, mine = p.list ? {} : last.spaces?.[p.space] ?? {}, look = last.look ?? {};
    this.st = { q: str(mine.q), fq: str(mine.fq), mode: mine.mode === "filename" ? "filename" : "content",
      hidden: mine.hidden === true, invert: mine.invert === true, pcre2: mine.pcre2 === true, unique: mine.unique === true,
      scope: mine.scope === "folder" ? "folder" : "repo" };
    this.look = { preview: look.preview !== false, wrap: look.wrap === true, numbers: look.numbers !== false, copy: look.copy === true,
      split: splitOf(look.split) };
    this.at = this.field().length;
    this.rows = [];
    this.picked = new Set();
    this.cursor = 0;
    this.top = 0;
    this.run = null;          // the run being read
    this.shown = null;        // the run this.rows came from
    this.want = 0;            // searches asked for (the newest wins)
    this.starting = false;
    this.first = true;
    this.pv = new Map();      // file -> { a, b, lines, end, binary, error }
    this.pvKey = null;
    this.pvTop = 1;
    this.size = { list: 400, rows: 24, pv: 600, pvRows: 30, field: 600 };
    this.wheel = { list: 0, pv: 0 };
    this.help = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => { if (!this.closed) this.handle.focus(); });
    try { cx.bind_keys?.(BINDINGS); } catch (_) { /* tab and shift-tab still come as keys, if at all */ }
    // ram-search's tab: this pane, so a pick can close it (the keyboard is here).
    if (!p.overlay) cx.timer.after(60, () => { this.ownPane ??= focused()?.terminal ? null : focused()?.pane ?? null; });
    cx.timer.every(POLL, cx => this.poll(cx));
    this.search(cx);
  }

  machine() { return this.p.machine ?? null; }
  // Where the search runs: ram-search's folder, else the repo or the folder you're in.
  cwd() {
    const p = this.p;
    if (p.list) return p.cwd || home();
    return (this.st.scope === "repo" && p.repo) || p.folder || p.repo || home();
  }
  canScope() { return !this.p.list && Boolean(this.p.repo && this.p.folder && this.p.repo !== this.p.folder); }
  // The query being typed: the content one, or in filename mode the name one.
  field() { return this.st.mode === "filename" ? this.st.fq : this.st.q; }
  setField(v) { if (this.st.mode === "filename") this.st.fq = v; else this.st.q = v; }
  where(path) {
    const h = home();
    return !this.machine() && h && (path === h || String(path).startsWith(h + "/")) ? "~" + String(path).slice(h.length) : path;
  }

  // ---------------------------------------------------------------- runs

  // A search for the current query and options: the newest asked for wins,
  // and each run's script stops the one before (one starts at a time).
  search(cx) {
    this.want += 1;
    if (!this.starting) this.launch(cx);
  }

  launch(cx) {
    const want = this.want, old = this.leftover ?? this.run, st = { ...this.st }, sweep = this.first;
    this.run = null;
    this.leftover = null;
    this.starting = true;
    this.first = false;
    cx.spawn(async cx => {
      let made = null, error = null;
      try {
        const r = await exec("sh", ["-c", RUN_SH, "sh", ...runArgs(st, old, this.p.list, sweep)], { cwd: this.cwd(), on: this.machine() });
        const [pgid, dir] = String(r.stdout ?? "").split("\n");
        if (r.code === 0 && /^\d+$/.test(pgid) && dir)
          made = { pgid, dir, meta: metaOf(st), q: st.q, pcre2: st.pcre2, chunk: 0, taken: 0, fresh: true };
        else error = String(r.stderr ?? "").trim().split("\n").pop() || "The search couldn't start.";
      } catch (e) { error = String(e?.message ?? e); }
      this.starting = false;
      if (this.closed) { if (made) this.stop(made); return; }
      // Typed again meanwhile: the next run stops this one.
      if (this.want !== want) { this.leftover = made; this.launch(cx); return; }
      this.run = made;
      this.error = error;
      if (!made) this.setRows([], null);
      cx.notify();
    });
  }

  stop(r, list = "") {
    if (!r && !list) return Promise.resolve();
    return exec("sh", ["-c", STOP_SH, "sh", r?.pgid ?? "", r?.dir ?? "", list], { on: this.machine() }).catch(() => null);
  }

  // A file of the run's, or null when it isn't there (yet). Text that isn't
  // UTF-8 comes through cat, its odd bytes replaced.
  async read(path) {
    const on = this.machine();
    try { return (await readTextFile(path, { on })) ?? null; } catch (_) {
      try {
        const r = await exec("cat", [path], { on });
        return r.code === 0 ? r.stdout : null;
      } catch (_) { return null; }
    }
  }

  // New results: whole lines only, chunk after chunk. "end" is looked at first,
  // so once it's there every line has been read by the end of this look.
  async poll(cx) {
    const r = this.run;
    if (!r || r.done || this.reading || this.closed) return;
    this.reading = true;
    let changed = false;
    try {
      const ended = (await this.read(`${r.dir}/end`)) !== null;
      for (let k = 0; k < 40 && this.run === r; k++) {
        const text = await this.read(`${r.dir}/${String(r.chunk).padStart(6, "0")}`);
        if (text === null || this.run !== r) break;
        const parts = text.split("\n"), whole = parts.length - 1;
        if (whole > r.taken) { this.take(r, parts.slice(r.taken, whole)); r.taken = whole; changed = true; }
        if (r.taken < CHUNK) break;
        r.chunk += 1;
        r.taken = 0;
      }
      if (ended && this.run === r) {
        r.done = true;
        r.more = (await this.read(`${r.dir}/more`)) !== null;
        r.err = String((await this.read(`${r.dir}/err`)) ?? "").trim().split("\n").slice(0, 6).join("\n");
        if (r.fresh) { r.fresh = false; this.setRows([], r); }
        changed = true;
      }
    } finally { this.reading = false; }
    if (changed && !this.closed) cx.notify();
  }

  // A run's first lines replace the list (until then the last search's stay).
  take(r, lines) {
    const rows = lines.filter(l => l !== "").map(l => parseRow(l, r.meta));
    if (r.fresh) { r.fresh = false; this.setRows(rows, r); return; }
    for (const row of rows) this.rows.push(row);
  }

  setRows(rows, r) {
    this.rows = rows;
    this.shown = r;
    this.cursor = 0;
    this.top = 0;
  }

  // ---------------------------------------------------------------- actions

  act(name, cx) {
    this.handle.focus();
    if (name !== "keys" && name !== "close") this.help = false;
    const n = this.rows.length;
    switch (name) {
      case "files": case "lines": case "json": this.output(name, cx); return;
      case "copy": this.look.copy = !this.look.copy; return;
      case "edit": this.edit(); return;
      case "mode":
        this.st.mode = this.st.mode === "content" ? "filename" : "content";
        this.at = this.field().length;
        this.search(cx);
        return;
      case "pcre2": case "invert": case "hidden": case "unique": this.st[name] = !this.st[name]; this.search(cx); return;
      case "scope":
        if (!this.canScope()) return;
        this.st.scope = this.st.scope === "repo" ? "folder" : "repo";
        this.pv.clear();   // (its paths are from the other folder now)
        this.search(cx);
        return;
      case "next": case "prev": if (n) { this.pick(this.cursor); this.move(name === "next" ? 1 : -1); } return;
      case "all": for (const r of this.rows) this.picked.add(keyOf(r)); return;
      case "none": this.picked.clear(); return;
      case "preview": this.look.preview = !this.look.preview; return;
      case "pvdown": case "pvup": this.scrollPv((name === "pvdown" ? 1 : -1) * Math.max(1, Math.floor(this.size.pvRows / 2))); return;
      case "wrap": this.look.wrap = !this.look.wrap; return;
      case "numbers": this.look.numbers = !this.look.numbers; return;
      case "divleft": case "divright": this.look.split = splitOf(this.look.split + (name === "divleft" ? DIV_STEP : -DIV_STEP)); return;
      case "keys": this.help = !this.help; return;
      case "close": this.finish(); return;
      case "up": this.move(-1); return;
      case "down": this.move(1); return;
      case "pageup": this.move(-Math.max(1, this.size.rows - 1)); return;
      case "pagedown": this.move(Math.max(1, this.size.rows - 1)); return;
    }
  }

  pick(i) {
    const r = this.rows[i];
    if (!r) return;
    const k = keyOf(r);
    if (this.picked.has(k)) this.picked.delete(k); else this.picked.add(k);
  }

  move(by) {
    if (!this.rows.length) return;
    this.cursor = clamp(this.cursor + by, 0, this.rows.length - 1);
    this.keepCursor();
  }

  // The list's first shown row, so the cursor is on screen.
  keepCursor() {
    const rows = Math.max(1, this.size.rows);
    this.top = clamp(this.top, 0, Math.max(0, this.rows.length - rows));
    if (this.cursor < this.top) this.top = this.cursor;
    if (this.cursor >= this.top + rows) this.top = this.cursor - rows + 1;
  }

  // The wheel moves the list; the cursor stays on a shown row.
  scrollList(by) {
    const rows = Math.max(1, this.size.rows);
    this.top = clamp(this.top + by, 0, Math.max(0, this.rows.length - rows));
    this.cursor = clamp(this.cursor, this.top, Math.min(this.rows.length - 1, this.top + rows - 1));
  }

  // ^d ^u and the wheel: down as far as bat's lines go (each fetch takes it
  // further, up to the file's last screen; never back up from where its line
  // put it), up to line 1.
  scrollPv(by) {
    const c = this.pv.get(this.rows[this.cursor]?.file);
    const cap = c ? Math.max(1, c.b - this.size.pvRows + 1) : Infinity;
    this.pvTop = by > 0 ? Math.max(this.pvTop, Math.min(this.pvTop + by, cap)) : Math.max(1, this.pvTop + by);
  }

  // The rows a pick acts on: the picked ones, in the list's order, else the cursor's.
  chosen() {
    const picked = this.rows.filter(r => this.picked.has(keyOf(r)));
    return picked.length ? picked : this.rows[this.cursor] ? [this.rows[this.cursor]] : [];
  }

  // The terminal picks go to, while it's still there.
  target() {
    const t = this.p.target;
    if (!t?.terminal) return null;
    if (t.pane && !panes().some(x => x.pane === t.pane)) return null;
    return t;
  }

  // Where the target terminal is now (its pane's live folder), so paths fit its prompt.
  targetDir() {
    const t = this.target();
    return (t?.pane && panes().find(x => x.pane === t.pane)?.cwd) || (this.p.list ? this.p.cwd : this.p.folder) || null;
  }

  output(kind, cx) {
    const rows = this.chosen();
    if (!rows.length) return;
    const from = this.cwd(), to = this.target() ? this.targetDir() : from, path = f => pathFor(f, from, to);
    if (kind === "files") { this.deliver(filesText(rows, path), `${new Set(rows.map(r => r.file)).size} file(s)`, cx); return; }
    if (kind === "lines") { this.deliver(linesText(rows, path), `${rows.length} line(s)`, cx); return; }
    // JSON: the whole lines and matched text from ripgrep's own JSON, for the
    // files picked (an inverted or listed file has none).
    const run = this.shown, q = run?.q ?? this.st.q, meta = run?.meta ?? metaOf(this.st), pcre2 = run?.pcre2 ?? this.st.pcre2;
    cx.spawn(async cx => {
      let hits = new Map();
      if (meta === 3) {
        try {
          const files = [...new Set(rows.map(r => r.file))].map(argPath);
          const r = await exec("rg", ["--json", "--engine", pcre2 ? "pcre2" : "default", "--ignore-case", "-e", q, "--", ...files],
            { cwd: from, on: this.machine() });
          hits = jsonHits(r.stdout);
        } catch (_) { /* the shown text, no matches */ }
      }
      this.deliver(jsonText(q, rows, hits, path), `${rows.length} result(s) as JSON`, cx);
    });
  }

  // TEXT at the prompt of the terminal you came from (through the clipboard:
  // its pane gets the keyboard, then Herdr pastes), or copied (⌥c, or no
  // terminal to go to). Then the window closes.
  deliver(text, what, cx) {
    if (this.closed) return;
    cx.write_to_clipboard(text);
    const t = this.look.copy ? null : this.target();
    if (t) {
      run("pane.focus", t.pane ? { pane: t.pane } : { terminal: t.terminal });
      run("terminal.paste");
    } else notify({ title: "Copied", body: what, level: "success", timeout: 2500 });
    this.finish();
  }

  // ^e: $EDITOR at this line, in a new tab of the space, in the folder searched.
  edit() {
    const r = this.rows[this.cursor];
    if (!r) return;
    run("tab.new", { space: this.p.space, name: baseName(r.file), folder: this.cwd(),
      argv: ["exec", "sh", "-c", EDIT_SH, "sh", String(r.kind === "file" ? 1 : r.line), argPath(r.file)] });
    this.finish();
  }

  // What this space's next search starts with (and how the window looks).
  save() {
    const all = shared(SEARCH_LAST) ?? {}, st = this.st;
    const next = { look: { ...this.look }, spaces: { ...(all.spaces ?? {}) } };
    if (!this.p.list && this.p.space) next.spaces[this.p.space] = { q: st.q, fq: st.fq, mode: st.mode, hidden: st.hidden,
      invert: st.invert, pcre2: st.pcre2, unique: st.unique, scope: st.scope };
    if (JSON.stringify(next) !== JSON.stringify(all)) setShared(SEARCH_LAST, next);
  }

  // Close: the dialog, or ram-search's tab.
  finish() {
    if (this.closed || this.leaving) return;
    this.leaving = true;
    this.save();
    const o = this.p.overlay;
    if (o) closeOverlay(o);
    else if (this.ownPane) run("pane.close", { pane: this.ownPane });
  }

  // The copy is closing: keep the search, stop its run (and remove ram-search's list).
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.save();
    await this.stop(this.run ?? this.shown, this.p.list ?? "");
  }

  // ---------------------------------------------------------------- keys

  key(e, cx) {
    if (["shift", "control", "alt", "platform", "function"].includes(e.key)) return;
    if (!this.ownPane && !this.p.overlay) this.ownPane = focused()?.terminal ? null : focused()?.pane ?? null;
    const act = ACTIONS[e.keystroke];
    if (act) { cx.stop_propagation(); this.act(act, cx); cx.notify(); return; }
    const v = this.field(), got = editField(v, this.at, e, () => cx.read_from_clipboard?.());
    if (!got) return;
    cx.stop_propagation();
    this.at = got.at;
    if (got.value !== v) { this.setField(got.value); this.search(cx); }
    cx.notify();
  }

  // ---------------------------------------------------------------- the preview

  // bat's lines for the file under the cursor, around where the preview is
  // (one fetch at a time; the newest wanted goes next).
  wantPreview(cx) {
    const row = this.rows[this.cursor];
    if (!this.look.preview || !row) return;
    const key = keyOf(row);
    if (this.pvKey !== key) {
      this.pvKey = key;
      this.pvTop = Math.max(1, (row.kind === "file" ? 1 : row.line) - Math.floor(this.size.pvRows / 3));
    }
    const c = this.pv.get(row.file), lo = Math.max(1, this.pvTop - 20), hi = this.pvTop + this.size.pvRows + 20;
    if (c && (c.binary || c.error || (c.a <= lo && (c.b >= hi || c.end)))) return;
    const want = { file: row.file, a: Math.max(1, this.pvTop - PV_SPAN), b: this.pvTop + this.size.pvRows + PV_SPAN };
    if (this.pvBusy) { this.pvNext = want; return; }
    this.fetch(want, cx);
  }

  fetch(want, cx) {
    this.pvBusy = true;
    cx.spawn(async cx => {
      const got = await this.bat(want.file, want.a, want.b);
      this.pv.delete(want.file);
      this.pv.set(want.file, got);
      while (this.pv.size > 24) this.pv.delete(this.pv.keys().next().value);
      this.pvBusy = false;
      const next = this.pvNext;
      this.pvNext = null;
      if (this.closed) return;
      if (next && (next.file !== want.file || next.a !== want.a)) this.fetch(next, cx);
      cx.notify();
    });
  }

  // Lines A..B of FILE, colored by bat (its theme, your bat config), else
  // plain. { a, b, lines, end (the file ends there), binary, error }
  async bat(file, a, b) {
    const opts = { cwd: this.cwd(), on: this.machine(), timeout: 15000 };
    try {
      const r = await exec("env", ["COLORTERM=truecolor", "bat", "--color=always", "--paging=never", "--wrap=never",
        "--style=plain", "--tabs=4", "--line-range", `${a}:${b}`, "--", file], opts);
      if (r.code === 0) {
        if (!r.stdout && /binary/i.test(r.stderr)) return { a, b, lines: [], binary: true };
        const lines = r.stdout.split("\n");
        if (lines.at(-1) === "") lines.pop();
        return { a, b: a + lines.length - 1, lines, end: lines.length < b - a + 1 };
      }
      if (r.code !== 127) return { a, b, lines: [], error: String(r.stderr ?? "").trim().split("\n")[0] || "bat couldn't show it" };
    } catch (_) { /* no env or bat: plain below */ }
    try {
      const r = await exec("sed", ["-n", `${a},${b}p`, argPath(file)], opts);
      if (r.code !== 0) return { a, b, lines: [], error: String(r.stderr ?? "").trim().split("\n")[0] || "can't read it" };
      const lines = r.stdout.split("\n");
      if (lines.at(-1) === "") lines.pop();
      return { a, b: a + lines.length - 1, lines: lines.map(l => l.replace(/\t/g, "    ")), end: lines.length < b - a + 1 };
    } catch (e) { return { a, b, lines: [], error: String(e?.message ?? e) }; }
  }

  // ---------------------------------------------------------------- render

  render(cx) {
    const t = theme();
    // A newer search window (^b / again): this one goes.
    if (this.p.at && shared(SEARCH_TOP) !== this.p.at && !this.leaving) cx.spawn(async () => this.finish());
    this.keepCursor();
    this.wantPreview(cx);
    return v_flex().id("ram-search").size_full().p(8 * U).gap(6 * U).bg(t.popover)
      .key_context(KEY_CONTEXT).track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_action("ram_search.next", (_e, cx) => { this.act("next", cx); cx.notify(); })
      .on_action("ram_search.prev", (_e, cx) => { this.act("prev", cx); cx.notify(); })
      .child(this.head(t))
      .child(this.query(t))
      .child(this.flags(t))
      .child(this.help ? this.keyList(t) : this.body(t))
      .child(this.foot(t));
  }

  // A key's button: the key in amber, then what it does; lit while on.
  button(id, action, label, on = false, enabled = true, tip = null) {
    const t = theme(), ks = keyFor(action) || Object.keys(MOVES).find(k => MOVES[k] === action) || "", k = keyText(ks);
    const what = tip ?? KEYS.find(x => x[1] === action)?.[3] ?? label;
    return h_flex().id(id).h(18 * U).px(5 * U).gap(4 * U).flex_none().items_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).when(on, el => el.bg(AMBER + "1f"))
      .when(enabled, el => el.cursor_pointer().hover(st => st.bg(t.hover)))
      .tooltip(k ? `${what}  ${k}` : what)
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) { this.act(action, cx); cx.notify(); } })
      .children(k ? [div().text_size(10 * U).font_semibold().text_color(enabled ? AMBER : t.dim).child(k)] : [])
      .child(div().text_size(10.5 * U).text_color(!enabled ? t.dim : on ? AMBER : t.muted).child(label));
  }

  countText() {
    const n = this.rows.length, r = this.shown, kind = (r?.meta ?? metaOf(this.st)) === 0 ? "file" : "line";
    if (this.error) return "couldn't search";
    const busy = this.starting || (this.run && !this.run.done) || (this.run && this.run !== r);
    return `${n.toLocaleString("en-US")}${r?.more ? "+" : ""} ${kind}${n === 1 ? "" : "s"}${busy ? " \u2026" : ""}`;
  }

  head(t) {
    const p = this.p, scope = p.list ? "files given" : this.st.scope === "repo" && p.repo ? "repo" : "folder";
    return h_flex().id("search-head").h(20 * U).flex_none().gap(8 * U).items_center()
      .child(div().flex_none().text_size(12.5 * U).font_semibold().text_color(CYAN).child("SEARCH"))
      .when(Boolean(p.name), el => el.child(div().flex_none().text_size(11.5 * U).text_color(t.foreground).child(p.name)))
      .child(this.button("search-scope", "scope", scope, false, this.canScope(),
        this.canScope() ? `Search the ${scope === "repo" ? "folder you're in" : "repo"} instead` : "Where it searches"))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(this.where(this.cwd())))
      .child(div().id("search-count").flex_none().text_size(11 * U).text_color(this.error ? RED : t.muted).child(this.countText()))
      .child(this.button("search-keys", "keys", "keys", this.help))
      .child(this.button("search-close", "close", "close"));
  }

  // The query: its mode (^f), then the field with its cursor.
  query(t) {
    const v = this.field(), filename = this.st.mode === "filename";
    const mode = filename ? "Filename (fuzzy)" : `Content (${this.st.pcre2 ? "pcre2" : "regex"})`;
    const cw = charW(QUERY), fit = Math.max(4, Math.floor((this.size.field - 4 * U) / cw));
    const start = clamp(this.at - fit + 2, 0, Math.max(0, v.length - fit + 1));
    const shown = v.slice(start, start + fit), at = this.at - start;
    const field = h_flex().id("search-field").flex_1().min_w(0).h_full().items_center().overflow_hidden().cursor_text()
      .font_family(mono()).text_size(QUERY)
      .on_size_change((size, cx) => {
        const w = size.width / zoom();
        if (Math.abs(w - this.size.field) > 1) { this.size.field = w; cx.notify(); }
      })
      .on_mouse_down("left", (e, cx) => {
        const x = (e?.local_position?.x ?? 0) / zoom();
        this.at = clamp(start + Math.round(x / cw), 0, v.length);
        this.handle.focus();
        cx.notify();
      })
      .when(!v, el => el.child(div().flex_none().w(1.5 * U).h(QUERY * 1.2).bg(AMBER))
        .child(div().flex_none().text_color(t.dim).child(filename ? " a file's name, as fzf matches it" : " ripgrep's regex; empty lists the files")))
      .when(Boolean(v), el => el
        .child(div().flex_none().text_color(t.foreground).child(shown.slice(0, at)))
        .child(div().flex_none().w(1.5 * U).h(QUERY * 1.2).bg(AMBER))
        .child(div().flex_none().text_color(t.foreground).child(shown.slice(at))));
    return h_flex().id("search-query").h(26 * U).flex_none().px(6 * U).gap(8 * U).items_center().rounded(2)
      .border(1).border_color(AMBER).bg(t.background ?? t.chrome)
      .child(this.button("search-mode", "mode", mode, filename))
      .child(field)
      .when(Boolean(v), el => el.child(div().id("search-clear").flex_none().px(4 * U).text_size(11 * U).text_color(t.dim)
        .cursor_pointer().hover(st => st.text_color(AMBER)).tooltip(`Clear the query  ${keyText("cmd-backspace")}`)
        .on_click((_e, cx) => { cx.stop_propagation(); this.setField(""); this.at = 0; this.search(cx); this.handle.focus(); cx.notify(); })
        .child("\u2715")));
  }

  flags(t) {
    const st = this.st, gap = () => div().w(6 * U).flex_none();
    return h_flex().id("search-flags").min_h(20 * U).flex_none().flex_wrap().gap(5 * U).items_center()
      .child(this.button("search-pcre2", "pcre2", "pcre2", st.pcre2))
      .child(this.button("search-invert", "invert", "invert", st.invert))
      .child(this.button("search-hidden", "hidden", "hidden", st.hidden))
      .child(this.button("search-unique", "unique", "one per file", st.unique))
      .child(div().flex_1())
      .child(this.button("search-preview", "preview", "preview", this.look.preview))
      .child(this.button("search-wrap", "wrap", "wrap", this.look.wrap))
      .child(this.button("search-numbers", "numbers", "numbers", this.look.numbers))
      .child(gap());
  }

  // The preview's width: its share of the body (look.split), leaving the list
  // and the preview at least LIST_MIN and PV_MIN px.
  pvWidth() {
    const body = this.size.body ?? 1200;
    return Math.round(clamp(body * this.look.split, PV_MIN, Math.max(PV_MIN, body - DIV_W - LIST_MIN)));
  }

  // The list, the divider and the preview. A drag on the divider moves it: the
  // preview's edge follows the pointer anywhere in the window until the button
  // goes up (Alt-[ and Alt-] move it too); the place is kept (look.split).
  body(t) {
    const shown = this.look.preview;
    return h_flex().id("search-body").flex_1().min_h(0)
      .on_size_change((size, cx) => {
        const w = size.width / zoom();
        if (Math.abs(w - (this.size.body ?? 0)) > 1) { this.size.body = w; cx.notify(); }
      })
      .on_window_mouse_move((e, cx) => {
        if (!this.drag) return;
        if (!e?.pressed_button) { this.drag = false; cx.notify(); return; }
        const body = this.size.body ?? 1200, x = (e?.local_position?.x ?? 0) / zoom();
        const split = splitOf((body - x - DIV_W / 2) / body);
        if (split !== this.look.split) { this.look.split = split; cx.notify(); }
      })
      .on_window_mouse_up("left", (_e, cx) => { if (this.drag) { this.drag = false; cx.notify(); } })
      .child(this.list(t))
      .when(shown, el => el.child(this.divider(t)).child(this.preview(t, this.pvWidth())));
  }

  // The divider between the list and the preview: a line, amber while dragged.
  divider(t) {
    const on = Boolean(this.drag);
    return h_flex().id("search-divider").w(DIV_W).h_full().flex_none().justify_center().cursor_col_resize()
      .rounded(2).hover(st => st.bg(t.hover))
      .tooltip(`Drag to move the divider  ${keyText("alt-[")} ${keyText("alt-]")}`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.drag = true; this.handle.focus(); cx.notify(); })
      .child(div().w(on ? 2 : 1).h_full().bg(on ? AMBER : t.border));
  }

  // The results: only the rows that fit are drawn (the wheel and the keys move
  // them), each with its pick box, where it is, and its text with the matches lit.
  list(t) {
    const rows = Math.max(1, this.size.rows), shown = this.rows.slice(this.top, this.top + rows);
    const cols = Math.max(10, Math.floor((this.size.list - 30 * U) / charW(TEXT)));
    const box = v_flex().id("search-list").flex_1().min_w(0).h_full().overflow_hidden().rounded(2).border(1).border_color(t.border)
      .bg(t.chrome).py(2 * U)
      .on_size_change((size, cx) => {
        const w = size.width / zoom(), h = size.height / zoom(), n = Math.max(1, Math.floor((h - 4 * U) / ROW_H));
        if (Math.abs(w - this.size.list) > 1 || n !== this.size.rows) { this.size.list = w; this.size.rows = n; cx.notify(); }
      })
      .on_scroll_wheel((e, cx) => {
        const dy = e?.delta_lines ? e.delta_lines.y : (e?.delta?.y ?? 0) / (ROW_H * zoom());
        this.wheel.list -= dy;
        const by = Math.trunc(this.wheel.list);
        if (by) { this.wheel.list -= by; this.scrollList(by); cx.notify(); }
      });
    if (!shown.length) return box.child(div().id("search-empty").px(8 * U).py(6 * U).text_size(11.5 * U)
      .text_color(this.error || this.shown?.err ? RED : t.dim).child(this.emptyText()));
    return box.children(shown.map((r, k) => this.rowEl(this.top + k, r, t, cols)));
  }

  emptyText() {
    if (this.error) return this.error;
    const r = this.shown;
    if (!r || !r.done) return "Searching\u2026";
    if (r.err) return r.err;
    return r.meta === 0 ? "No files" : "No matches";
  }

  rowEl(i, r, t, cols) {
    const here = i === this.cursor, picked = this.picked.has(keyOf(r));
    const slash = r.file.lastIndexOf("/"), dir = slash >= 0 ? r.file.slice(0, slash + 1) : "", name = r.file.slice(slash + 1);
    const at = r.kind === "file" ? "" : r.kind === "line" ? `:${r.line}` : `:${r.line}:${r.col}`;
    r.view ??= r.kind === "file" ? [] : lineView(r.text);
    const room = Math.max(4, cols - Array.from(r.file + at).length - 2);
    const text = cutRuns(r.view, room + 8, false)[0];
    return h_flex().id(`search-row-${i}`).h(ROW_H).flex_none().px(5 * U).gap(6 * U).items_center().overflow_hidden()
      .font_family(mono()).text_size(TEXT).cursor_pointer()
      .when(here, el => el.bg(AMBER + "1f")).when(!here, el => el.hover(st => st.bg(t.hover)))
      .on_click((e, cx) => {
        if (e?.modifiers?.platform || e?.modifiers?.control || e?.modifiers?.shift) this.pick(i);
        else { this.cursor = i; if ((e?.click_count ?? 1) >= 2) this.edit(); }
        this.handle.focus();
        cx.notify();
      })
      .child(div().id(`search-pick-${i}`).size(10 * U).flex_none().rounded(1).border(1).border_color(picked ? AMBER : t.input)
        .when(picked, el => el.bg(AMBER)).tooltip(`${picked ? "Picked: click to unpick" : "Pick"}  ${keyText("tab")}`)
        .on_click((_e, cx) => { cx.stop_propagation(); this.pick(i); this.handle.focus(); cx.notify(); }))
      .child(h_flex().flex_none()
        .when(Boolean(dir), el => el.child(div().flex_none().text_color(t.dim).child(dir)))
        .child(div().flex_none().text_color(here ? AMBER : t.muted).child(name))
        .when(Boolean(at), el => el.child(div().flex_none().text_color(t.dim).child(at))))
      .children(text.map(x => div().flex_none().text_color(x.mark ? AMBER : t.foreground).when(x.mark, el => el.font_semibold()).child(x.text)));
  }

  // The preview: the file under the cursor from about a third above its line
  // (lit), in bat's colors, with line numbers (⌥n) and long lines cut or
  // wrapped (⌥w); the wheel and ^d ^u scroll it.
  preview(t, w) {
    const row = this.rows[this.cursor], c = row ? this.pv.get(row.file) : null;
    const lineAt = row && row.kind !== "file" ? row.line : null;
    const ansi = Array.from({ length: 16 }, (_, i) => t[`ansi${i}`] ?? BASE16[i]);
    const box = v_flex().id("search-pv").w(w).h_full().flex_none().rounded(2).border(1).border_color(t.border)
      .bg(t.background ?? t.chrome).overflow_hidden();
    const head = h_flex().id("search-pv-head").h(18 * U).flex_none().px(6 * U).gap(6 * U).items_center().border_b(1).border_color(t.border)
      .font_family(mono()).text_size(TEXT)
      .when(Boolean(row), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(`${row.file}${lineAt ? ":" + lineAt : ""}`)))
      .when(Boolean(c && c.lines.length), el => el.child(div().flex_none().text_color(t.dim)
        .child(`${this.pvTop}\u2013${Math.min(c.b, this.pvTop + this.size.pvRows - 1)}`)));
    const body = v_flex().id("search-pv-body").flex_1().min_h(0).px(4 * U).py(2 * U).overflow_hidden()
      .font_family(mono()).text_size(CODE)
      .on_size_change((size, cx) => {
        const bw = size.width / zoom(), n = Math.max(1, Math.floor((size.height / zoom() - 4 * U) / LINE_H));
        if (Math.abs(bw - this.size.pv) > 1 || n !== this.size.pvRows) { this.size.pv = bw; this.size.pvRows = n; cx.notify(); }
      })
      .on_scroll_wheel((e, cx) => {
        const dy = e?.delta_lines ? e.delta_lines.y : (e?.delta?.y ?? 0) / (LINE_H * zoom());
        this.wheel.pv -= dy;
        const by = Math.trunc(this.wheel.pv);
        if (by) { this.wheel.pv -= by; this.scrollPv(by); cx.notify(); }
      });
    const note = text => box.child(head).child(body.child(div().px(4 * U).py(4 * U).text_color(t.dim).child(text)));
    if (!row) return note("");
    if (!c) return note("\u2026");
    if (c.binary) return note("A binary file: not shown");
    if (c.error) return note(c.error);
    if (!c.lines.length) return note(c.end && this.pvTop <= c.a ? "(empty)" : "\u2026");
    const digits = String(Math.min(c.b, this.pvTop + this.size.pvRows)).length;
    const gutter = this.look.numbers ? digits * charW(CODE) + 8 * U : 0;
    const cols = Math.max(8, Math.floor((this.size.pv - 8 * U - gutter) / charW(CODE)));
    // (bat ends each line's colors, so each line is read on its own.)
    c.runs ??= [];
    const out = [];
    for (let n = Math.max(c.a, this.pvTop); n <= c.b && out.length < this.size.pvRows; n++) {
      const i = n - c.a;
      c.runs[i] ??= sgrRuns(c.lines[i] ?? "", {}, ansi).runs;
      const lit = n === lineAt;
      const parts = cutRuns(c.runs[i], this.look.wrap ? cols : cols + 8, this.look.wrap);
      parts.forEach((part, k) => {
        if (out.length >= this.size.pvRows) return;
        out.push(h_flex().id(`search-pv-${n}-${k}`).h(LINE_H).flex_none().overflow_hidden().when(lit, el => el.bg(AMBER + "2e"))
          .when(this.look.numbers, el => el.child(div().w(gutter).flex_none().pr(8 * U).text_color(lit ? AMBER : t.dim)
            .child(k ? "" : String(n).padStart(digits))))
          .children(part.map(x => div().flex_none().text_color(x.fg ?? t.foreground).when(Boolean(x.bg), el => el.bg(x.bg))
            .when(Boolean(x.bold), el => el.font_semibold()).when(Boolean(x.italic), el => el.italic())
            .when(Boolean(x.underline), el => el.underline()).when(Boolean(x.dim), el => el.opacity(0.7)).child(x.text))));
      });
    }
    return box.child(head).child(body.children(out));
  }

  // Alt-/ and F1: every key, each a button that does what it says. Its key
  // column fits the longest key text (keys in words are long).
  keyList(t) {
    const seen = new Set(), moves = [["up", "move up", "Up the list (the wheel, or a click)"],
      ["down", "move down", "Down the list (the wheel, or a click)"], ["pageup", "page up", "A screen up the list"],
      ["pagedown", "page down", "A screen down the list"]];
    const entries = [...KEYS.filter(([, a]) => !seen.has(a) && seen.add(a)).map(([, a, label, what]) => [a, label, what]), ...moves]
      .map(([a, label, what]) => [a, label, what, [...KEYS.filter(x => x[1] === a), ...Object.entries(MOVES).filter(([, m]) => m === a)]
        .map(x => keyText(x[0])).join(" ")]);
    const keyW = Math.max(...entries.map(e => e[3].length)) * charW(11 * U) + 8 * U;
    const rows = entries.map(([a, label, what, k]) =>
      h_flex().id(`search-key-${a}`).h(17 * U).flex_none().px(6 * U).gap(10 * U).items_center().rounded(2)
        .cursor_pointer().hover(st => st.bg(t.hover))
        .on_click((_e, cx) => { cx.stop_propagation(); if (a !== "keys") this.act(a, cx); else this.help = false; cx.notify(); })
        .child(div().w(keyW).flex_none().text_size(11 * U).font_semibold().text_color(AMBER).child(k))
        .child(div().w(90 * U).flex_none().text_size(11 * U).text_color(t.foreground).child(label))
        .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(what)));
    return v_flex().id("search-keylist").flex_1().min_h(0).py(4 * U).gap(1 * U).overflow_y_scroll().rounded(2).border(1).border_color(t.border)
      .bg(t.chrome)
      .child(div().px(6 * U).pb(4 * U).text_size(11 * U).text_color(t.muted)
        .child(`Keys (as rg-fzf's) \u00b7 click one to use it \u00b7 ${keyText("alt-/")} or F1 closes this`))
      .children(rows);
  }

  foot(t) {
    const n = this.picked.size ? this.rows.reduce((k, r) => k + (this.picked.has(keyOf(r)) ? 1 : 0), 0) : 0, term = Boolean(this.target());
    return h_flex().id("search-foot").min_h(20 * U).flex_none().flex_wrap().gap(5 * U).items_center()
      .child(this.button("search-files", "files", "files"))
      .child(this.button("search-lines", "lines", "lines"))
      .child(this.button("search-json", "json", "JSON"))
      .child(this.button("search-copy", "copy", "copy", this.look.copy || !term, term,
        term ? "Copy them instead of putting them at the prompt" : "No terminal to put them in: they're copied"))
      .child(div().w(6 * U).flex_none())
      .child(this.button("search-edit", "edit", "edit"))
      .child(div().flex_1())
      .child(div().id("search-picked").flex_none().text_size(11 * U).text_color(n ? AMBER : t.dim).child(n ? `${n} picked` : ""))
      .child(this.button("search-next", "next", "pick \u2193"))
      .child(this.button("search-prev", "prev", "pick \u2191"))
      .child(this.button("search-all", "all", "all"))
      .child(this.button("search-none", "none", "none"));
  }
}
