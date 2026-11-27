// RAM's search window (role "search"): rg-fzf drawn by Herdr, each of its keys
// a button as well, with search and replace the way VS Code (and serpl) do it.
// ripgrep searches as you type and its results stream in: a run in the
// background (RUN_SH) writes them into numbered files the window reads as they
// grow, and each change stops the run before it. bat colors the preview (your
// bat theme), scrolled to the line, with what matched lit.
//   Enter, Ctrl-O, Alt-Enter   the picked lines' files, the lines, or JSON, at
//                    the prompt of the terminal you came from (Alt-C: copied instead)
//   Ctrl-E, double-click  $EDITOR at the line, in a new tab
//   Ctrl-F           content (ripgrep's regex; Alt-P PCRE2) or filename (fzf's match)
//   Alt-M Alt-B Alt-L  match case, whole words, literal (no regex)
//   Alt-V Alt-I Alt-U  invert, hidden files, one result per file
//   Ctrl-R           replace on or off (a row for the new text); Alt-Up Alt-Down
//                    the field that types
//   Alt-R Alt-A Alt-Z  replace in the picked lines (else this one), in every
//                    line listed (it asks first), undo; Alt-K keeps the case
//   Tab Shift-Tab Ctrl-A Ctrl-Z  pick and move, all, none
//   Ctrl-P Ctrl-D Ctrl-U Alt-W Alt-N  preview, its scroll, wrap, line numbers
//   Alt-Shift-W      wrap the list
//   Alt-[ Alt-]      the divider between the list and the preview (or drag it)
//   Alt-S            the repo or the folder you're in; Alt-/ F1 every key; Esc closes
// A replace takes its new text from ripgrep itself (rg --json --replace, run
// with the options the list was found with), changes only the lines listed,
// and first checks that each still reads as it was found. Files go through
// Herdr's writeTextFile (it refuses a file that changed meanwhile, writes it
// whole and keeps its permissions and links); one it can't take (over 1 MiB,
// not UTF-8) goes through REPLACE_SH. Undo has the files as they were, while
// the window is open.
// ^b / opens it over the window (every layout: the key bar's searchHere(), in
// RAM openSearch() here); `ram-search` opens it in a tab of its own for the
// files piped to it. Each space keeps its last search (shared SEARCH_LAST).
// Props: at (SEARCH_TOP's value: a newer window closes this one), space, name,
// machine, target {pane, terminal} (where picks go), folder (that terminal's),
// repo (its repo's top, or null); from ram-search: list (a NUL-separated file
// list to search instead) and cwd (where its names are relative to).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, readTextFile, writeTextFile, props, closeOverlay, openOverlay, theme, shared, setShared, run, settings,
  notify, home, panes, focused, spaces } from "herdr";
import { AMBER, CYAN, GREEN, RED, U, realDir } from "./ui.js";

export const SEARCH_LAST = "ram.search.last";
export const SEARCH_TOP = "ram.search.top";
// A run's results come in files of CHUNK lines; it stops at MAX_ROWS ("+").
export const CHUNK = 500, MAX_ROWS = 20000;
// A replace's plan goes to REPLACE_SH in files of at most PLAN_MAX bytes
// (writeTextFile takes up to WRITE_MAX, 1 MiB). Undo keeps at most UNDO_MAX
// characters of files as they were, and UNDO_STEPS replaces (the oldest go first).
export const WRITE_MAX = 1024 * 1024, PLAN_MAX = 900 * 1024, UNDO_MAX = 64 * 1024 * 1024, UNDO_STEPS = 50;
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
// and returns. ripgrep's options are rg-fzf's: case-insensitive (Alt-M: match
// case), its default engine or PCRE2, long lines cut at 500 columns, hidden
// files, invert, one per file; and whole words, literal. An empty query lists
// the files instead. In content mode the file name query (fzf's filter) picks
// the files searched; in filename mode it filters what the content query
// found by the file's name, as rg-fzf does. Fields are split by \x1f (macOS's
// awk can't carry the NUL rg-fzf uses); the path, line and column lose their
// color codes, so only matches keep theirs. A replace's run ($15 json, $16 the
// new text) is ripgrep's JSON instead, each match with what it becomes (no
// config file, never inside .git, whole lines). The lines go into files of
// CHUNK lines named 000000, 000001...; "more" marks a run that stopped at
// MAX_ROWS, "end" one that finished, "err" holds what ripgrep or fzf said (a
// regex that doesn't parse).
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
  'cs=${12} word=${13} lit=${14} json=${15} rep=${16}',
  'if [ -n "$old" ] && [ ! -e "$olddir/end" ]; then kill -s TERM -- "-$old" 2>/dev/null; fi',
  // (A run still dying can write one more file: then once more, a moment later.)
  'case $olddir in */ram-search.??????) rm -rf -- "$olddir" 2>/dev/null || { (sleep 1; rm -rf -- "$olddir") </dev/null >/dev/null 2>&1 & } ;; esac',
  // Folders an earlier window left behind (one closed while its run started),
  // and a replace's copies a day old (a window that never closed).
  '[ "$sweep" = 1 ] && find "${TMPDIR:-/tmp}" -maxdepth 1 -type d \\( \\( -name "ram-search.??????" -mmin +60 \\) -o \\( -name "ram-replace.??????" -mmin +1440 \\) \\) -exec rm -rf {} + </dev/null >/dev/null 2>&1 &',
  'd=$(mktemp -d "${TMPDIR:-/tmp}/ram-search.XXXXXX") || exit 1',
  'echo "$$"',
  'echo "$d"',
  'H=; [ "$hidden" = 1 ] && H=--hidden',
  'C=--ignore-case; [ "$cs" = 1 ] && C=--case-sensitive',
  'G=; [ "$json" = 1 ] && G=--glob=!.git',
  'ff=; [ "$mode" = content ] && ff=$fq',
  'meta=3; [ "$invert" = 1 ] && meta=2; [ -z "$q" ] && meta=0',
  'if [ "$json" = 1 ]; then set -- --no-config --json --engine "$engine" $C $H $G',
  'else',
  '  set -- --engine "$engine" $C --column --line-number --no-heading --color=always \\',
  '    --colors path:none --colors line:none --colors column:none --with-filename \\',
  "    --field-match-separator '\\x1f' --max-columns 500 --max-columns-preview $H",
  '  [ "$invert" = 1 ] && set -- "$@" --invert-match',
  '  [ "$unique" = 1 ] && set -- "$@" --max-count 1',
  'fi',
  '[ "$word" = 1 ] && set -- "$@" --word-regexp',
  '[ "$lit" = 1 ] && set -- "$@" --fixed-strings',
  '[ "$json" = 1 ] && set -- "$@" --replace "$rep"',
  'set -- "$@" -e "$q"',
  '(',
  '  {',
  '    if [ -z "$q" ] || [ -n "$ff" ]; then',
  '      if [ -n "$list" ]; then xargs -0 -r rg --files --null $H $G -- < "$list"; else rg --files --null $H $G; fi |',
  '        if [ -n "$ff" ]; then fzf --filter "$ff" --read0 --print0 --no-sort; else cat; fi |',
  '        if [ -z "$q" ]; then LC_ALL=C tr "\\000" "\\n"; else xargs -0 -r rg "$@" --; fi',
  '    elif [ -n "$list" ]; then xargs -0 -r rg "$@" -- < "$list"',
  '    else rg "$@"',
  '    fi |',
  "      if [ \"$json\" = 1 ]; then grep '^{\"type\":\"match\"'; else",
  `        awk -v meta="$meta" '${CLEAN}' |`,
  '        if [ "$mode" = filename ] && [ -n "$fq" ]; then',
  '          if [ "$meta" = 0 ]; then fzf --filter "$fq" --no-sort',
  "          else fzf --filter \"$fq\" --delimiter '\\x1f' --nth 1 --no-sort; fi",
  '        else cat; fi',
  '      fi |',
  `      awk -v d="$d" -v n=${CHUNK} -v max=${MAX_ROWS} '${CHUNKS}'`,
  '  } 2> "$d/err"',
  '  : > "$d/end"',
  ') < /dev/null > /dev/null 2>&1 &',
].join("\n");
// Stops a run ($1 its process group, $2 its folder) and removes its folder,
// ram-search's file list ($3) and a replace's folder ($4: its plans and the
// copies undo would have put back).
export const STOP_SH = [
  'if [ -n "$1" ] && [ ! -e "$2/end" ]; then kill -s TERM -- "-$1" 2>/dev/null; fi',
  'case $2 in */ram-search.??????) rm -rf -- "$2" 2>/dev/null || { (sleep 1; rm -rf -- "$2") </dev/null >/dev/null 2>&1 & } ;; esac',
  'case $3 in */ram-search-list.??????) rm -f -- "$3" ;; esac',
  'case $4 in */ram-replace.??????) rm -rf -- "$4" ;; esac',
].join("\n");
// A replace's own folder (made the first time it needs one): its plans, and
// the copies undo puts back.
export const RDIR_SH = 'mktemp -d "${TMPDIR:-/tmp}/ram-replace.XXXXXX"';
// The file a path ($1) names, through its links (a replace writes the file,
// never the link), and its permissions, kept on what replaces it. (Bytes as
// bytes: macOS's tr refuses a file that isn't UTF-8 in a UTF-8 locale.)
const RESOLVE = [
  'export LC_ALL=C',
  't=$1 n=0',
  'while [ -L "$t" ]; do',
  '  n=$((n + 1)); [ "$n" -le 40 ] || { echo "too many links" >&2; exit 2; }',
  '  l=$(readlink -- "$t") || exit 2',
  '  case $l in /*) t=$l ;; *) t=$(dirname -- "$t")/$l ;; esac',
  'done',
  "[ -e \"$t\" ] || { echo \"it's gone\" >&2; exit 2; }",
  "[ -f \"$t\" ] || { echo \"it isn't a file\" >&2; exit 2; }",
  'mode=$(stat -c %a -- "$t" 2>/dev/null) || mode=$(stat -f %Lp -- "$t" 2>/dev/null) || mode=',
];
// The plan's changes applied to the file on stdin: in BEGIN the plan files
// (base.0, base.1... its parts, read as one) give each change as a line's
// number, then the line as the search found it and the new line, each on one
// or more plan lines ("+" before a piece that goes on, "=" before its last),
// with \\ for a backslash and \xHH for a byte. Then each line goes out as it
// was, or new where the plan says once it still reads as found (a UTF-8 BOM
// before line 1 stays). Exit 3: a line isn't what the search found (or isn't
// there); 2: the plan can't be read.
const PLAN_AWK = [
  'function hex(h) { return 16 * (index("0123456789abcdef", substr(h, 1, 1)) - 1) + index("0123456789abcdef", substr(h, 2, 1)) - 1 }',
  'function dec(s,   out, i, c) {',
  '  out = ""',
  '  while ((i = index(s, "\\\\")) > 0) {',
  '    out = out substr(s, 1, i - 1); c = substr(s, i + 1, 1)',
  '    if (c == "x") { out = out sprintf("%c", hex(substr(s, i + 2, 2))); s = substr(s, i + 4) }',
  '    else { out = out c; s = substr(s, i + 2) }',
  '  }',
  '  return out s',
  '}',
  'BEGIN {',
  '  k = 0',
  '  for (p = 0; p < parts; p++) {',
  '    f = base "." p',
  '    while ((got = (getline x < f)) > 0) {',
  '      if (k == 0) { at = x + 0; k = 1; v = ""; continue }',
  '      c = substr(x, 1, 1); v = v substr(x, 2)',
  '      if (c == "+") continue',
  '      if (c != "=") { bad = 2; exit }',
  '      if (k == 1) { was[at] = dec(v); k = 2; v = "" } else { now[at] = dec(v); want++; k = 0 }',
  '    }',
  '    if (got < 0) { bad = 2; exit }',
  '    close(f)',
  '  }',
  '  if (k != 0) { bad = 2; exit }',
  '}',
  '{ line = $0; pre = "" }',
  'NR == 1 && substr(line, 1, 3) == "\\357\\273\\277" { pre = substr(line, 1, 3); line = substr(line, 4) }',
  'NR in was { if (line != was[NR]) { bad = 3; exit } line = now[NR]; done++ }',
  '{ if (NR > 1) printf "%s\\n", prev; prev = pre line }',
  'END { if (bad) exit bad; if (done != want) exit 3; if (NR) printf "%s", prev }',
].join("\n");
// A replace in a file writeTextFile can't take (over 1 MiB, or not UTF-8):
// $1 the file, $2 where to keep a copy of it as it was (for undo), $3 the plan's
// files' name (base.0...), $4 how many. Only the planned lines change, and only
// when each still reads as the search found it; the rest stays byte for byte
// (its line ends, a last line without one). The new file goes in whole, with
// the old one's permissions, and its cksum is printed. Exit 3: it changed since
// the search; 4: a NUL in it (binary, or UTF-16); 2: anything else (stderr says).
export const REPLACE_SH = [
  ...RESOLVE,
  'keep=$2 base=$3 parts=$4',
  '[ "$(tr -d "\\000" < "$t" | wc -c)" -eq "$(wc -c < "$t")" ] || exit 4',
  // (\xHH escapes for bytes over 127 need an awk that writes %c as one byte.)
  "if grep -q '\\\\x[89a-f]' \"$base\".* 2>/dev/null && [ \"$(LC_ALL=C awk 'BEGIN { printf \"%c\", 233 }' | od -An -tx1 | tr -d ' \\n')\" != e9 ]; then",
  "  echo \"this awk can't write the file's bytes\" >&2; exit 2",
  'fi',
  'sum=$(cksum < "$t")',
  "tmp=$(mktemp \"$(dirname -- \"$t\")/.ram-replace.XXXXXX\") || { echo \"can't write in its folder\" >&2; exit 2; }",
  `LC_ALL=C awk -v base="$base" -v parts="$parts" '${PLAN_AWK}' < "$t" > "$tmp"`,
  'got=$?',
  'if [ "$got" != 0 ]; then rm -f -- "$tmp"; [ "$got" = 3 ] && exit 3; echo "the plan couldn\'t be read ($got)" >&2; exit 2; fi',
  'if [ -s "$t" ] && [ -z "$(tail -c 1 -- "$t")" ]; then printf "\\n" >> "$tmp"; fi',
  '[ -n "$mode" ] && chmod "$mode" "$tmp"',
  "cp -p -- \"$t\" \"$keep\" || { rm -f -- \"$tmp\"; echo \"can't keep a copy for undo\" >&2; exit 2; }",
  '[ "$(cksum < "$t")" = "$sum" ] || { rm -f -- "$tmp" "$keep"; exit 3; }',
  "mv -f -- \"$tmp\" \"$t\" || { rm -f -- \"$tmp\" \"$keep\"; echo \"can't put it in place\" >&2; exit 2; }",
  'cksum < "$t"',
].join("\n");
// Undo of such a replace: $1 the file, $2 its copy from before, $3 the cksum the
// replace left. Only while the file is still what the replace wrote; the copy
// goes in whole, with the file's permissions. Exit 3: it changed since.
export const UNDO_SH = [
  ...RESOLVE,
  'keep=$2 sum=$3',
  "[ -f \"$keep\" ] || { echo \"its copy is gone\" >&2; exit 2; }",
  '[ "$(cksum < "$t")" = "$sum" ] || exit 3',
  "tmp=$(mktemp \"$(dirname -- \"$t\")/.ram-replace.XXXXXX\") || { echo \"can't write in its folder\" >&2; exit 2; }",
  "cp -- \"$keep\" \"$tmp\" || { rm -f -- \"$tmp\"; echo \"can't copy it back\" >&2; exit 2; }",
  '[ -n "$mode" ] && chmod "$mode" "$tmp"',
  '[ "$(cksum < "$t")" = "$sum" ] || { rm -f -- "$tmp"; exit 3; }',
  "mv -f -- \"$tmp\" \"$t\" || { rm -f -- \"$tmp\"; echo \"can't put it back\" >&2; exit 2; }",
  'rm -f -- "$keep"',
].join("\n");
// $EDITOR at a line ($1) of a file ($2), as rg-fzf's ^e: the line first, which
// every editor it knows takes (Fresh needs it so).
export const EDIT_SH = 'exec ${EDITOR:-vim} "+$1" "$2"';

// RUN_SH's arguments for search ST, stopping OLD ({ pgid, dir }), searching
// LIST's files instead of the folder when there is one; JSON: a replace's run.
export function runArgs(st, old, list, sweep, json = false) {
  return [old?.pgid ?? "", old?.dir ?? "", st.mode, st.q, st.fq, st.hidden ? "1" : "", st.invert ? "1" : "",
    st.pcre2 ? "pcre2" : "default", st.unique ? "1" : "", list ?? "", sweep ? "1" : "",
    st.case ? "1" : "", st.word ? "1" : "", st.literal ? "1" : "", json ? "1" : "", json ? st.rep ?? "" : ""];
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

// ---------------------------------------------------------------- a replace's lines

// Bytes from base64 (ripgrep's JSON gives a line, name or match that isn't
// UTF-8 so).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function b64(s) {
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of String(s ?? "")) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); acc &= (1 << bits) - 1; }
  }
  return out;
}
// TEXT as UTF-8 bytes.
export function utf8Bytes(text) {
  const out = [];
  for (const ch of String(text ?? "")) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
// The UTF-8 character at BYTES[i]: [code point, its length], or null where the
// bytes aren't UTF-8.
function utf8At(bytes, i) {
  const b = bytes[i];
  if (b < 0x80) return [b, 1];
  const n = b >= 0xf0 && b <= 0xf4 ? 4 : b >= 0xe0 ? 3 : b >= 0xc2 && b < 0xe0 ? 2 : 0;
  if (!n || i + n > bytes.length) return null;
  let c = b & (n === 2 ? 0x1f : n === 3 ? 0x0f : 0x07);
  for (let k = 1; k < n; k++) {
    const x = bytes[i + k];
    if ((x & 0xc0) !== 0x80) return null;
    c = (c << 6) | (x & 63);
  }
  if ((n === 3 && c < 0x800) || (n === 4 && (c < 0x10000 || c > 0x10ffff)) || (c >= 0xd800 && c <= 0xdfff)) return null;
  return [c, n];
}
// BYTES as text to show: a byte that isn't UTF-8 is U+FFFD. AT[b] is where
// byte b's character starts in TEXT (AT[length] is TEXT's length).
export function lossy(bytes) {
  let text = "";
  const at = new Array(bytes.length + 1);
  for (let i = 0; i < bytes.length;) {
    const u = utf8At(bytes, i), n = u ? u[1] : 1;
    for (let k = 0; k < n; k++) at[i + k] = text.length;
    text += u ? String.fromCodePoint(u[0]) : "\ufffd";
    i += n;
  }
  at[bytes.length] = text.length;
  return { text, at };
}
// Where byte offset BYTE (in UTF-8) is in TEXT, in JavaScript's units.
export function indexAt(text, byte) {
  let b = 0, i = 0;
  while (i < text.length && b < byte) {
    const c = text.codePointAt(i);
    b += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    i += c > 0xffff ? 2 : 1;
  }
  return i;
}
// TEXT's length in UTF-8 bytes.
export function utf8Length(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}
// A line for REPLACE_SH's plan: \\ for a backslash, \xHH for a NUL or a line
// end (neither is in a line, but never on a plan line), the rest as it is;
// from bytes, \xHH too for each byte that isn't UTF-8.
export const escText = s => String(s).replace(/[\\\x00\n]/g, c => c === "\\" ? "\\\\" : "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"));
export function escBytes(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length;) {
    const u = utf8At(bytes, i);
    if (u) { out += escText(String.fromCodePoint(u[0])); i += u[1]; }
    else { out += "\\x" + bytes[i].toString(16).padStart(2, "0"); i += 1; }
  }
  return out;
}

// A replace run's line (one of ripgrep's JSON "match" messages) as a row: where
// it is, the line as found (raw: with its line end; bytes instead when it isn't
// UTF-8) and each match (subs): its place in bytes (sb, eb) and in the shown
// text (s, e), what it matched (m) and what it becomes (r; mb, rb when they
// aren't UTF-8). text: the line to show, without its line end. Null: not one.
export function parseJsonRow(line) {
  let d;
  try { d = JSON.parse(line)?.data; } catch (_) { return null; }
  if (!d || !Number.isInteger(d.line_number)) return null;
  const badPath = d.path?.text == null;
  const file = d.path?.text ?? (d.path?.bytes != null ? lossy(b64(d.path.bytes)).text : null);
  const raw = typeof d.lines?.text === "string" ? d.lines.text : null;
  const bytes = raw === null && d.lines?.bytes != null ? b64(d.lines.bytes) : null;
  if (file == null || (raw === null && !bytes)) return null;
  const shown = raw !== null ? null : lossy(bytes), whole = raw ?? shown.text;
  const text = whole.replace(/\r?\n$/, "");
  const place = byte => Math.min(text.length, raw !== null ? indexAt(raw, byte) : shown.at[Math.min(byte, bytes.length)]);
  const subs = (d.submatches ?? []).filter(s => Number.isInteger(s?.start) && Number.isInteger(s?.end) && s.end >= s.start)
    .map(s => ({ sb: s.start, eb: s.end, s: place(s.start), e: place(s.end),
      m: s.match?.text ?? null, mb: s.match?.bytes != null ? b64(s.match.bytes) : null,
      r: s.replacement?.text ?? null, rb: s.replacement?.bytes != null ? b64(s.replacement.bytes) : null }));
  return { kind: "match", json: true, file, badPath, line: d.line_number, col: (subs[0]?.sb ?? 0) + 1, raw, bytes, text, subs };
}

// Keep case (Alt-K): the new text in the case of what it replaces. All capitals
// (USER becomes ACCOUNT), a capital first (User: Account), else a small letter
// first (user: account); the rest of it as typed (accountHolder: AccountHolder).
export function keepCase(match, rep) {
  const cased = c => c.toLowerCase() !== c.toUpperCase();
  const letters = Array.from(String(match ?? "")).filter(cased);
  if (!letters.length || !rep) return rep;
  if (letters.length > 1 && letters.every(c => c === c.toUpperCase())) return rep.toUpperCase();
  const chars = Array.from(rep), i = chars.findIndex(cased);
  if (i < 0) return rep;
  chars[i] = letters[0] === letters[0].toUpperCase() ? chars[i].toUpperCase() : chars[i].toLowerCase();
  return chars.join("");
}
// What a match becomes (KEEP: in its case), as text; null when only bytes say.
export function subText(s, keep) {
  if (s.r === null) return null;
  return keep && s.m !== null ? keepCase(s.m, s.r) : s.r;
}
// The same to show: bytes that aren't UTF-8 as U+FFFD; what it matched when
// ripgrep didn't say (ripgrep before 14 gives no replacements).
export const shownNew = (s, keep, was) => subText(s, keep) ?? (s.rb !== null ? lossy(s.rb).text : was);
// Whether a row's line changes (a match that becomes what it was doesn't).
export const changes = (r, keep) => r.subs.some(s => { const t = subText(s, keep); return t === null || s.m === null || t !== s.m; });
// A row a replace can take: a replace run's, each match with what it becomes
// (ripgrep gives that for every one; without it nothing is done).
export const replaceable = r => Boolean(r.json && r.subs?.length && r.subs.every(s => s.r !== null || s.rb !== null));
// A file a replace has nothing to change in.
export const SAME = "same";
// A row's line as it will be, its line end kept (a UTF-8 row).
export function newLineText(r, keep) {
  let out = "", last = 0;
  for (const s of r.subs) {
    const a = indexAt(r.raw, s.sb), b = indexAt(r.raw, s.eb);
    out += r.raw.slice(last, a) + (subText(s, keep) ?? "");
    last = b;
  }
  return out + r.raw.slice(last);
}
// The same as bytes (any row: a line that isn't UTF-8 has its bytes).
export function newLineBytes(r, keep) {
  const from = r.bytes ?? utf8Bytes(r.raw), out = [];
  let last = 0;
  for (const s of r.subs) {
    for (let i = last; i < s.sb; i++) out.push(from[i]);
    const t = subText(s, keep);
    for (const b of t !== null ? utf8Bytes(t) : s.rb ?? []) out.push(b);
    last = s.eb;
  }
  for (let i = last; i < from.length; i++) out.push(from[i]);
  return out;
}
// TEXT (a file as read) with each of ROWS' lines replaced, or null when one of
// them doesn't read as the search found it there (the file changed since). A
// UTF-8 BOM before the first line stays (ripgrep doesn't count it).
export function spliceLines(text, rows, keep) {
  const want = [...new Map(rows.map(r => [r.line, r])).values()].sort((a, b) => a.line - b.line), out = [];
  let at = text.charCodeAt(0) === 0xfeff ? 1 : 0, line = 1, last = 0;
  for (const r of want) {
    while (line < r.line) {
      const nl = text.indexOf("\n", at);
      if (nl < 0) return null;
      at = nl + 1;
      line += 1;
    }
    const nl = text.indexOf("\n", at), end = nl < 0 ? text.length : nl + 1;
    if (at >= text.length && r.raw !== "") return null;
    if (text.slice(at, end) !== r.raw) return null;
    out.push(text.slice(last, at), newLineText(r, keep));
    last = at = end;
    line += 1;
  }
  out.push(text.slice(last));
  return out.join("");
}
// REPLACE_SH's plan for ROWS (one file's): each change as its line's number,
// then the line as found and the new one (escaped, without the line's \n), each
// in pieces of at most PIECE characters on plan lines of their own ("+" before
// one that goes on, "=" before the last), in parts of at most PLAN_MAX bytes
// (a change can go on in the next part).
const PIECE = 64 * 1024;
const isHigh = c => c >= 0xd800 && c <= 0xdbff;
function pieces(s) {
  const out = [];
  let i = 0;
  do {
    let j = Math.min(s.length, i + PIECE);
    if (j < s.length && isHigh(s.charCodeAt(j - 1))) j -= 1;   // (never half a character)
    out.push(s.slice(i, j));
    i = j;
  } while (i < s.length);
  return out.map((p, k, all) => `${k < all.length - 1 ? "+" : "="}${p}\n`);
}
export function planParts(rows, keep) {
  const want = [...new Map(rows.map(r => [r.line, r])).values()].sort((a, b) => a.line - b.line);
  const parts = [];
  let part = "", size = 0;
  const put = line => {
    const n = utf8Length(line);
    if (size + n > PLAN_MAX && part) { parts.push(part); part = ""; size = 0; }
    part += line;
    size += n;
  };
  for (const r of want) {
    const text = r.raw !== null && r.subs.every(s => s.r !== null);
    const was = r.bytes ? escBytes(r.bytes.at(-1) === 10 ? r.bytes.slice(0, -1) : r.bytes) : escText(r.raw.replace(/\n$/, ""));
    const nb = text ? null : newLineBytes(r, keep);
    const now = text ? escText(newLineText(r, keep).replace(/\n$/, "")) : escBytes(nb.at(-1) === 10 ? nb.slice(0, -1) : nb);
    put(`${r.line}\n`);
    for (const p of [...pieces(was), ...pieces(now)]) put(p);
  }
  if (part) parts.push(part);
  return parts;
}

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
// carriage return too, other control characters show as U+FFFD (a tab stays).
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
// Where a list row's text matched (rg colors only its matches): [{ s, e }] in
// its plain text.
export function hitRanges(text) {
  const out = [];
  let i = 0;
  for (const r of sgrRuns(text).runs) {
    const n = r.text.length;
    if (r.fg || r.bg || r.bold || r.underline) {
      const last = out.at(-1);
      if (last && last.e === i) last.e = i + n; else out.push({ s: i, e: i + n });
    }
    i += n;
  }
  return out;
}

// Runs [{ text, mark }] for the list: the indent dropped, tabs as 4 spaces,
// runs of one mark joined. mark: "hit" (a match), "old" and "new" (a replace's
// match and what it becomes), or "".
export function viewRuns(runs) {
  const out = [];
  let col = 0, lead = true;
  for (const r of runs) {
    let s = "";
    for (const ch of r.text) {
      if (lead && (ch === " " || ch === "\t")) continue;
      lead = false;
      if (ch === "\t") { const n = 4 - (col % 4); s += " ".repeat(n); col += n; }
      else { s += ch; col += 1; }
    }
    if (!s) continue;
    const mark = r.mark || "", prev = out.at(-1);
    if (prev && prev.mark === mark) prev.text += s; else out.push({ text: s, mark });
  }
  return out;
}
// A result's text for the list: its matches marked (rg colors only those).
export const lineView = text => viewRuns(sgrRuns(text).runs.map(r =>
  ({ text: r.text, mark: r.fg || r.bg || r.bold || r.underline ? "hit" : "" })));
// A replace row's text: each match struck out ("old") and what it becomes after
// it ("new"); a match that stays the same is only lit.
export function replaceRuns(r, keep) {
  const out = [];
  let last = 0;
  for (const s of r.subs) {
    const a = Math.max(last, s.s), b = Math.max(a, s.e), was = r.text.slice(a, b), now = shownNew(s, keep, was);
    if (a > last) out.push({ text: r.text.slice(last, a), mark: "" });
    if (now === was) out.push({ text: was, mark: "hit" });
    else { if (was) out.push({ text: was, mark: "old" }); if (now) out.push({ text: now, mark: "new" }); }
    last = b;
  }
  if (last < r.text.length) out.push({ text: r.text.slice(last), mark: "" });
  return out;
}
// A replace run's row with replace off (until a plain search's rows come): its
// matches only lit.
export function hitRuns(r) {
  const out = [];
  let last = 0;
  for (const s of r.subs) {
    const a = Math.max(last, s.s), b = Math.max(a, s.e);
    if (a > last) out.push({ text: r.text.slice(last, a), mark: "" });
    if (b > a) out.push({ text: r.text.slice(a, b), mark: "hit" });
    last = b;
  }
  if (last < r.text.length) out.push({ text: r.text.slice(last), mark: "" });
  return out;
}
// The preview's line (bat's RUNS) with the chars in HITS ({ s, e }) marked TAG.
export function markRuns(runs, hits, tag) {
  const len = runs.reduce((k, r) => k + r.text.length, 0), on = new Array(len).fill(false);
  for (const x of hits) for (let k = Math.max(0, x.s); k < Math.min(len, x.e); k++) on[k] = true;
  const out = [];
  let i = 0;
  for (const r of runs) {
    for (let a = 0; a < r.text.length;) {
      const v = on[i + a];
      let b = a + 1;
      while (b < r.text.length && on[i + b] === v) b++;
      out.push(v ? { ...r, text: r.text.slice(a, b), hit: tag } : { ...r, text: r.text.slice(a, b) });
      a = b;
    }
    i += r.text.length;
  }
  return out;
}
// The same line as a replace leaves it: each hit's chars out, what it becomes
// ({ r }) in their place (marked "new"), the rest in bat's colors.
export function swapRuns(runs, hits) {
  const len = runs.reduce((k, r) => k + r.text.length, 0), cut = new Array(len).fill(false), at = new Map();
  for (const x of hits) {
    const s = clamp(x.s, 0, len), e = clamp(x.e, s, len);
    for (let k = s; k < e; k++) cut[k] = true;
    if (!at.has(s)) at.set(s, []);
    at.get(s).push(x);
  }
  const out = [];
  const put = i => { for (const x of at.get(i) ?? []) if (x.r) out.push({ text: x.r, hit: "new" }); };
  const add = (r, ch) => {
    const prev = out.at(-1);
    if (prev && !prev.hit && sameStyle(prev, r)) prev.text += ch; else out.push({ ...r, text: ch });
  };
  let i = 0;
  for (const r of runs) for (let a = 0; a < r.text.length; a++, i++) { put(i); if (!cut[i]) add(r, r.text[a]); }
  put(len);
  return out;
}
// RUNS with each tab as spaces up to the next stop of WIDTH.
export function expandTabs(runs, width = 4) {
  const out = [];
  let col = 0;
  for (const r of runs) {
    let s = "";
    for (const ch of r.text) {
      if (ch === "\t") { const n = width - (col % width); s += " ".repeat(n); col += n; }
      else { s += ch; col += 1; }
    }
    if (s) out.push({ ...r, text: s });
  }
  return out;
}
// RUNS cut into rows of COLS characters (WRAP), else only its first row.
export function cutRuns(runs, cols, wrap) {
  return wrapRuns(runs, cols, cols, wrap ? Infinity : 1);
}
// RUNS in rows: FIRST characters on the first, REST on each one after it (at
// most MAX rows).
export function wrapRuns(runs, first, rest, max = Infinity) {
  const rows = [[]];
  let n = 0, cols = Math.max(1, first);
  for (const r of runs) {
    let chars = Array.from(r.text);
    while (chars.length) {
      if (n >= cols) {
        if (rows.length >= max) return rows;
        rows.push([]);
        n = 0;
        cols = Math.max(1, rest);
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

// ---------------------------------------------------------------- the fields

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
// A key in a field (the query, or a replace's new text): V with the cursor AT,
// after it. Returns { value, at } or null (not the field's key). PASTE: the
// clipboard's text.
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

// Every key, in the order the key list (Alt-/, F1) shows them: [keystroke,
// action, label, what it does]. Each has a button too.
export const KEYS = [
  ["enter", "files", "files", "The picked lines' files (else this line's) at the prompt you came from"],
  ["ctrl-o", "lines", "lines", "The picked lines as file:line:column:text"],
  ["alt-enter", "json", "JSON", "The picked lines as JSON, with the query and what matched"],
  ["alt-c", "copy", "copy", "Copy those instead of putting them at the prompt"],
  ["ctrl-e", "edit", "edit", "This line in $EDITOR, in a new tab (a double-click too)"],
  ["ctrl-r", "replace", "replace", "Replace: show or hide the row for the new text"],
  ["alt-up", "tofind", "find", "Type in the query (the field above)"],
  ["alt-down", "torep", "replace with", "Type in the new text (the field below)"],
  ["alt-r", "apply", "replace", "Replace in the picked lines (else this line)"],
  ["alt-a", "applyall", "replace all", "Replace in every line listed (it asks first)"],
  ["alt-z", "undo", "undo", "Put back the files the last replace changed"],
  ["alt-k", "keep", "keep case", "Keep each match's case: User becomes Account, USER becomes ACCOUNT"],
  ["ctrl-f", "mode", "filename", "Content (ripgrep's regex) or filename (fzf's fuzzy match)"],
  ["alt-m", "case", "match case", "Match case: Foo finds Foo, not foo"],
  ["alt-b", "word", "whole words", "Whole words only: foo finds foo, not foobar"],
  ["alt-l", "literal", "literal", "The query as plain text, not a regex"],
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
  ["alt-w", "wrap", "wrap preview", "Wrap the preview's long lines"],
  ["alt-shift-w", "listwrap", "wrap list", "Wrap the list's long lines"],
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
// Tab, shift-tab and escape are bound (cx.bind_keys) in this window's key
// context: the UI kit's root takes tab and shift-tab for moving the keyboard
// between controls otherwise, and Herdr's dialog takes escape to close (here it
// says no to a question first).
export const KEY_CONTEXT = "RamSearch";
export const BINDINGS = [
  { keystroke: "tab", action: "ram_search.next", context: KEY_CONTEXT },
  { keystroke: "shift-tab", action: "ram_search.prev", context: KEY_CONTEXT },
  { keystroke: "escape", action: "ram_search.escape", context: KEY_CONTEXT },
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
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const lastLine = s => String(s ?? "").trim().split("\n").pop() ?? "";
const locText = r => r.kind === "file" ? "" : r.kind === "line" ? `:${r.line}` : `:${r.line}:${r.col}`;
// A file's path for a replace: whole, from the folder it was found from.
const absPath = (file, from) => file.startsWith("/") ? file : `${String(from).replace(/\/+$/, "")}/${file.replace(/^\.\//, "")}`;
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
      scope: mine.scope === "folder" ? "folder" : "repo", case: mine.case === true, word: mine.word === true,
      literal: mine.literal === true, rep: str(mine.rep), keep: mine.keep === true };
    // A window opens to search: the replace row only when asked for (Ctrl-R); its new text is kept.
    this.st.replacing = false;
    this.look = { preview: look.preview !== false, wrap: look.wrap === true, numbers: look.numbers !== false, copy: look.copy === true,
      split: splitOf(look.split), listWrap: look.listWrap === true };
    this.focus = "query";     // the field that types: "query", or "replace" (the new text)
    this.at = this.field().length;
    this.rat = this.st.rep.length;
    this.rows = [];
    this.ver = 0;             // goes up whenever this.rows change
    this.picked = new Set();
    this.cursor = 0;
    this.top = 0;
    this.run = null;          // the run being read
    this.shown = null;        // the run this.rows came from
    this.want = 0;            // searches asked for (the newest wins)
    this.starting = false;
    this.first = true;
    this.pv = new Map();      // file -> { a, b, lines, end, binary, error }
    this.pvGen = 0;           // goes up when those are dropped (dropPreview)
    this.pvKey = null;
    this.pvTop = 1;
    this.size = { list: 400, rows: 24, pv: 600, pvRows: 30, field: 600, rfield: 600 };
    this.wheel = { list: 0, pv: 0 };
    this.help = false;
    this.ask = null;          // a question before a replace: { rows, text }
    this.busy = null;         // what a replace or undo is doing, while it does it
    this.note = null;         // what the last one did: { text, level: ok | warn | bad | info }
    this.undos = [];          // each replace's files as they were: [{ files, chars }]
    this.rdir = null;         // the replace's own folder (RDIR_SH), once made
    this.seq = 0;
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
  // The folder the list's paths are from: the shown search's (a scope change
  // leaves its rows until the next search's come).
  rowsCwd() { return this.shown?.cwd ?? this.cwd(); }
  // A row's file for the preview, whichever folder its search ran in.
  pvFile(row) { return absPath(row.file, this.rowsCwd()); }
  // The query being typed: the content one, or in filename mode the name one.
  field() { return this.st.mode === "filename" ? this.st.fq : this.st.q; }
  setField(v) { if (this.st.mode === "filename") this.st.fq = v; else this.st.q = v; }
  where(path) {
    const h = home();
    return !this.machine() && h && (path === h || String(path).startsWith(h + "/")) ? "~" + String(path).slice(h.length) : path;
  }
  // The replace row shows: content mode, on this Mac (writeTextFile writes here only).
  replaceOn() { return this.st.replacing && this.st.mode === "content" && !this.machine(); }
  // A run for search ST is a replace's (ripgrep's JSON with the new text).
  jsonOf(st) { return st.replacing && st.mode === "content" && st.q !== "" && !this.machine(); }
  // A repo holds what's searched, so git can undo a replace too (ram-search's
  // files: no repo known).
  inRepo() { return Boolean(this.p.repo); }
  say(text, level = "info") { this.note = { text, level }; }

  // ---------------------------------------------------------------- runs

  // A search for the current query and options: the newest asked for wins,
  // and each run's script stops the one before (one starts at a time). What a
  // replace said stays only for the search it starts itself (KEEP).
  search(cx, keep = false) {
    if (!keep) this.note = null;
    this.want += 1;
    if (!this.starting) this.launch(cx);
  }

  launch(cx) {
    const want = this.want, old = this.leftover ?? this.run, st = { ...this.st }, sweep = this.first, json = this.jsonOf(st), cwd = this.cwd();
    this.run = null;
    this.leftover = null;
    this.starting = true;
    this.first = false;
    cx.spawn(async cx => {
      let made = null, error = null;
      try {
        const r = await exec("sh", ["-c", RUN_SH, "sh", ...runArgs(st, old, this.p.list, sweep, json)], { cwd, on: this.machine() });
        const [pgid, dir] = String(r.stdout ?? "").split("\n");
        if (r.code === 0 && /^\d+$/.test(pgid) && dir)
          made = { pgid, dir, want, meta: metaOf(st), json, q: st.q, rep: st.rep, pcre2: st.pcre2, case: st.case, word: st.word,
            literal: st.literal, cwd, chunk: 0, taken: 0, fresh: true };
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

  stop(r, list = "", rdir = "") {
    if (!r && !list && !rdir) return Promise.resolve();
    return exec("sh", ["-c", STOP_SH, "sh", r?.pgid ?? "", r?.dir ?? "", list, rdir], { on: this.machine() }).catch(() => null);
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
    const rows = [];
    for (const l of lines) {
      if (l === "") continue;
      const row = r.json ? parseJsonRow(l) : parseRow(l, r.meta);
      if (row) rows.push(row);
    }
    this.ver += 1;
    if (r.fresh) { r.fresh = false; this.setRows(rows, r); return; }
    for (const row of rows) this.rows.push(row);
  }

  setRows(rows, r) {
    this.rows = rows;
    this.shown = r;
    this.cursor = 0;
    this.top = 0;
    this.ver += 1;
  }

  // The shown rows are the newest search's (so a replace does what they show).
  current() { return Boolean(this.shown) && this.shown.want === this.want && !this.starting; }

  // ---------------------------------------------------------------- actions

  act(name, cx) {
    this.handle.focus();
    if (name !== "keys" && name !== "close") this.help = false;
    // A question is answered by yes or no; anything else lets it go.
    if (this.ask && name !== "yes" && name !== "no") this.ask = null;
    const n = this.rows.length;
    switch (name) {
      case "files": case "lines": case "json": this.output(name, cx); return;
      case "copy": this.look.copy = !this.look.copy; return;
      case "edit": this.edit(); return;
      case "mode":
        this.st.mode = this.st.mode === "content" ? "filename" : "content";
        // (Back in content mode with the replace row kept: invert and one per file off again.)
        if (this.replaceOn()) { this.st.invert = false; this.st.unique = false; }
        this.focus = "query";
        this.at = this.field().length;
        this.search(cx);
        return;
      case "pcre2": case "hidden": case "case": case "word": case "literal": this.st[name] = !this.st[name]; this.search(cx); return;
      case "invert": case "unique":
        if (this.replaceOn()) { this.say(`Off while replacing (${keyText("ctrl-r")} turns replace off)`); return; }
        this.st[name] = !this.st[name];
        this.search(cx);
        return;
      case "scope":
        if (!this.canScope()) return;
        this.st.scope = this.st.scope === "repo" ? "folder" : "repo";
        this.search(cx);
        return;
      case "replace": this.toggleReplace(cx); return;
      case "hide": this.hideReplace(cx); return;
      case "tofind": this.toField("query"); return;
      case "torep": this.toField("replace"); return;
      case "keep": this.st.keep = !this.st.keep; return;
      case "apply": this.askReplace(false, cx); return;
      case "applyall": this.askReplace(true, cx); return;
      case "undo": this.undoLast(cx); return;
      case "yes": { const a = this.ask; this.ask = null; if (a) this.replace(a.rows, cx); return; }
      case "no": this.ask = null; return;
      case "next": case "prev": if (n) { this.pick(this.cursor); this.move(name === "next" ? 1 : -1); } return;
      case "all": for (const r of this.rows) this.picked.add(keyOf(r)); return;
      case "none": this.picked.clear(); return;
      case "preview": this.look.preview = !this.look.preview; return;
      case "pvdown": case "pvup": this.scrollPv((name === "pvdown" ? 1 : -1) * Math.max(1, Math.floor(this.size.pvRows / 2))); return;
      case "wrap": this.look.wrap = !this.look.wrap; return;
      case "listwrap": this.look.listWrap = !this.look.listWrap; return;
      case "numbers": this.look.numbers = !this.look.numbers; return;
      case "divleft": case "divright": this.look.split = splitOf(this.look.split + (name === "divleft" ? DIV_STEP : -DIV_STEP)); return;
      case "keys": this.help = !this.help; return;
      case "close": this.finish(); return;
      case "up": this.move(-1); return;
      case "down": this.move(1); return;
      case "pageup": this.move(-Math.max(1, this.fitFrom(this.top) - 1)); return;
      case "pagedown": this.move(Math.max(1, this.fitFrom(this.top) - 1)); return;
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

  // How many characters a list row has (after its pick box).
  listCols() { return Math.max(10, Math.floor((this.size.list - 30 * U) / charW(TEXT))); }
  // How the replace's rows look now: struck out with the new text (KEEP's case
  // or as given), or with replace off only lit, as a search shows them.
  viewMode() { return this.replaceOn() ? (this.st.keep ? "keep" : "new") : "hit"; }
  // A row's text as the list shows it (what comes after where it is).
  rowView(r) {
    if (r.kind === "file") return [];
    if (r.json) {
      const mode = this.viewMode();
      if (!r.view || r.viewMode !== mode) { r.view = viewRuns(mode === "hit" ? hitRuns(r) : replaceRuns(r, this.st.keep)); r.viewMode = mode; }
      return r.view;
    }
    return (r.view ??= lineView(r.text));
  }
  // The text's parts, one a line of the list: the first after where it is, the
  // rest (with the list wrapped, Alt-Shift-W) under it; unwrapped, one line.
  rowParts(r, cols = this.listCols()) {
    const key = `${cols}|${this.look.listWrap ? 1 : 0}|${this.viewMode()}`;
    if (r.partsKey === key) return r.parts;
    const view = this.rowView(r), room = Math.max(4, cols - Array.from(r.file + locText(r)).length - 2);
    r.parts = this.look.listWrap ? wrapRuns(view, room, Math.max(4, cols - 2)) : cutRuns(view, room + 8, false);
    r.partsKey = key;
    return r.parts;
  }
  linesOf(i) { return this.look.listWrap ? this.rowParts(this.rows[i]).length : 1; }
  // How many rows from TOP fit the list (at least one).
  fitFrom(top) {
    const room = Math.max(1, this.size.rows);
    if (!this.look.listWrap) return room;
    let lines = 0, k = 0;
    while (top + k < this.rows.length && lines + this.linesOf(top + k) <= room) { lines += this.linesOf(top + k); k++; }
    return Math.max(1, k);
  }
  // The first row of the list's last screen.
  maxTop() {
    const room = Math.max(1, this.size.rows);
    if (!this.look.listWrap) return Math.max(0, this.rows.length - room);
    let lines = 0, i = this.rows.length;
    while (i > 0 && lines + this.linesOf(i - 1) <= room) { lines += this.linesOf(i - 1); i--; }
    return clamp(i, 0, Math.max(0, this.rows.length - 1));
  }

  // The list's first shown row, so the cursor is on screen.
  keepCursor() {
    this.top = clamp(this.top, 0, this.maxTop());
    if (this.cursor < this.top) this.top = this.cursor;
    while (this.top < this.cursor && this.cursor >= this.top + this.fitFrom(this.top)) this.top++;
  }

  // The wheel moves the list; the cursor stays on a shown row.
  scrollList(by) {
    this.top = clamp(this.top + by, 0, this.maxTop());
    this.cursor = clamp(this.cursor, this.top, Math.min(this.rows.length - 1, this.top + this.fitFrom(this.top) - 1));
  }

  // ^d ^u and the wheel: down as far as bat's lines go (each fetch takes it
  // further, up to the file's last screen; never back up from where its line
  // put it), up to line 1.
  scrollPv(by) {
    const row = this.rows[this.cursor], c = row ? this.pv.get(this.pvFile(row)) : null;
    // (Not read yet: how far down it goes isn't known, so it stays.)
    const cap = c ? Math.max(1, c.b - this.size.pvRows + 1) : this.pvTop;
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
    if (!rows.length || this.busy) return;
    const from = this.rowsCwd(), to = this.target() ? this.targetDir() : from, path = f => pathFor(f, from, to);
    if (kind === "files") { this.deliver(filesText(rows, path), `${new Set(rows.map(r => r.file)).size} file(s)`, cx); return; }
    if (kind === "lines") { this.deliver(linesText(rows, path), `${rows.length} line(s)`, cx); return; }
    // JSON: the whole lines and matched text from ripgrep's own JSON, for the
    // files picked (an inverted or listed file has none), as the list found them.
    const run = this.shown, q = run?.q ?? this.st.q, meta = run?.meta ?? metaOf(this.st), o = run ?? this.st;
    cx.spawn(async cx => {
      let hits = new Map();
      if (meta === 3) {
        try {
          const files = [...new Set(rows.map(r => r.file))].map(argPath);
          const r = await exec("rg", ["--json", "--engine", o.pcre2 ? "pcre2" : "default", o.case ? "--case-sensitive" : "--ignore-case",
            ...(o.word ? ["--word-regexp"] : []), ...(o.literal ? ["--fixed-strings"] : []), "-e", q, "--", ...files],
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
    if (!r || this.busy) return;
    run("tab.new", { space: this.p.space, name: baseName(r.file), folder: this.rowsCwd(),
      argv: ["exec", "sh", "-c", EDIT_SH, "sh", String(r.kind === "file" ? 1 : r.line), argPath(r.file)] });
    this.finish();
  }

  // ---------------------------------------------------------------- replace

  // Ctrl-R: replace on (content mode; invert and one per file go off; the new
  // text's field types) or off again (the search as it was, its new text kept).
  toggleReplace(cx) {
    if (this.machine()) { this.say("Replace works on this Mac's files only"); return; }
    if (this.replaceOn()) { this.hideReplace(cx); return; }
    const st = this.st;
    if (st.mode !== "content") { st.mode = "content"; this.at = st.q.length; }
    st.replacing = true;
    st.invert = false;
    st.unique = false;
    this.focus = "replace";
    this.rat = clamp(this.rat, 0, st.rep.length);
    this.search(cx);
  }

  // Replace off (Ctrl-R again, or the row's ✕): the search as it was, its new
  // text kept for next time.
  hideReplace(cx) {
    if (!this.st.replacing) return;
    this.st.replacing = false;
    this.focus = "query";
    this.search(cx);
  }

  // Alt-Up and Alt-Down (or a click): which field types, with the replace row there.
  toField(which) {
    if (!this.replaceOn()) return;
    this.focus = which;
    if (which === "replace") this.rat = clamp(this.rat, 0, this.st.rep.length);
  }

  // Alt-R (ALL false: the picked lines, else this one) and Alt-A (every line
  // listed, once the search is done and nothing was left out): what's shown is
  // what's done. Replace all always asks first, the rest only outside a repo.
  askReplace(all, cx) {
    if (!this.replaceOn()) { this.say(`${keyText("ctrl-r")} first: the row for the new text`); return; }
    if (this.busy) return;
    if (!this.st.q) { this.say("Type what to find first"); return; }
    if (!this.current() || !this.shown?.json) { this.say("Still searching: a moment"); return; }
    const run = this.shown;
    if (all && !run.done) { this.say("Still searching: replace all waits for every line"); return; }
    if (all && run.more) { this.say(`Over ${MAX_ROWS.toLocaleString("en-US")} lines: narrow the search to replace them all`); return; }
    const rows = (all ? this.rows : this.chosen()).filter(replaceable);
    if (!rows.length) {
      const old = (all ? this.rows : this.chosen()).some(r => r.json && r.subs?.length);
      this.say(old ? "This ripgrep doesn't say what each match becomes: replace needs ripgrep 14 or newer" : "Nothing to replace here");
      return;
    }
    if (!all && this.inRepo()) { this.replace(rows, cx); return; }
    const m = rows.reduce((k, r) => k + r.subs.length, 0), f = new Set(rows.map(r => r.file)).size;
    this.ask = { rows, text: `${run.rep === "" ? "Delete" : "Replace"} ${plural(m, "match", "matches")} in ${plural(f, "file")}?`
      + (this.inRepo() ? "" : ` Not in a git repo: only ${keyText("alt-z")} undoes it.`) };
  }

  // Replaces ROWS' matches, file by file; then the search runs again.
  replace(rows, cx) {
    if (this.busy || !rows.length) return;
    this.busy = "Replacing\u2026";
    const from = this.rowsCwd(), keep = this.st.keep, files = new Map();
    for (const r of rows) { const k = absPath(r.file, from); if (!files.has(k)) files.set(k, []); files.get(k).push(r); }
    cx.spawn(async cx => {
      const batch = [], skipped = [];
      let matches = 0, changed = 0;
      for (const [abs, list] of files) {
        if (this.closed) return;
        const why = await this.replaceFile(abs, list, keep, batch);
        if (why === SAME) continue;
        if (why) skipped.push(`${list[0].file} (${why})`);
        else { changed += 1; matches += list.reduce((k, r) => k + r.subs.length, 0); }
      }
      if (batch.length) this.keepUndo(batch);
      this.busy = null;
      if (batch.length) this.dropPreview();   // (the preview shows the files as they are now)
      const done = changed ? `Replaced ${plural(matches, "match", "matches")} in ${plural(changed, "file")}` : "";
      const left = skipped.length ? `${done ? "skipped" : "Skipped"} ${skipped.length}: ${skipped.join(", ")}` : "";
      this.note = { text: [done, left].filter(Boolean).join(" \u00b7 ") || "Nothing changed",
        level: !skipped.length ? "ok" : changed ? "warn" : "bad" };
      this.picked.clear();
      this.setRows([], null);
      this.search(cx, true);
      cx.notify();
    });
  }

  // One file's replace: null when done, SAME when nothing in it changes, else
  // why not. Herdr's writeTextFile when it can read the file (UTF-8, up to 1
  // MiB), else REPLACE_SH. BATCH gets what undo needs.
  async replaceFile(abs, rows, keep, batch) {
    if (rows.some(r => r.badPath)) return "its name isn't UTF-8";
    if (/(^|\/)\.git(\/|$)/.test(abs)) return "it's in .git";
    if (!rows.some(r => changes(r, keep))) return SAME;
    let text;
    if (rows.every(r => r.raw !== null && r.subs.every(s => s.r !== null))) {
      try { text = await readTextFile(abs); } catch (_) { text = undefined; }
      if (text === null) return "it's gone";
    }
    if (typeof text !== "string") return this.replaceBig(abs, rows, keep, batch);
    if (text.includes("\0")) return "it isn't text";
    const next = spliceLines(text, rows, keep);
    if (next === null) return "it changed since the search";
    if (next === text) return SAME;
    // (Grown past what writeTextFile takes: the script instead.)
    if (utf8Length(next) > WRITE_MAX) return this.replaceBig(abs, rows, keep, batch);
    try { await writeTextFile(abs, next, text); } catch (_) { return "it changed since the search"; }
    batch.push({ kind: "text", file: abs, name: rows[0].file, before: text, after: next });
    return null;
  }

  async replaceBig(abs, rows, keep, batch) {
    const dir = await this.replaceDir();
    if (!dir) return "no folder for its plan";
    const parts = planParts(rows, keep);
    const n = (this.seq += 1), base = `${dir}/plan-${n}`, kept = `${dir}/kept-${n}`;
    try { for (let k = 0; k < parts.length; k++) await writeTextFile(`${base}.${k}`, parts[k], null); }
    catch (e) { return `its plan couldn't be written: ${String(e?.message ?? e)}`; }
    let r;
    try { r = await exec("sh", ["-c", REPLACE_SH, "sh", abs, kept, base, String(parts.length)], { timeout: 600000 }); }
    catch (e) { return String(e?.message ?? e); }
    if (r.code === 3) return "it changed since the search";
    if (r.code === 4) return "it isn't text";
    if (r.code !== 0 || !r.stdout.trim()) return lastLine(r.stderr) || "it couldn't be replaced";
    batch.push({ kind: "copy", file: abs, name: rows[0].file, kept, sum: r.stdout.trim() });
    return null;
  }

  async replaceDir() {
    if (this.rdir) return this.rdir;
    try {
      const r = await exec("sh", ["-c", RDIR_SH]);
      if (r.code === 0 && r.stdout.trim()) this.rdir = r.stdout.trim();
    } catch (_) { /* none: big files can't be replaced */ }
    return this.rdir;
  }

  // Undo keeps the newest replaces, up to UNDO_STEPS of them and UNDO_MAX
  // characters of files as they were.
  keepUndo(files) {
    this.undos.push({ files, chars: files.reduce((k, f) => k + (f.before?.length ?? 0) + (f.after?.length ?? 0), 0) });
    let chars = this.undos.reduce((k, u) => k + u.chars, 0);
    while (this.undos.length > 1 && (this.undos.length > UNDO_STEPS || chars > UNDO_MAX)) chars -= this.undos.shift().chars;
  }

  // Alt-Z: the last replace's files back as they were, each only while it's
  // still what the replace wrote.
  undoLast(cx) {
    if (this.busy) return;
    const u = this.undos.pop();
    if (!u) { this.say("Nothing to undo"); return; }
    this.busy = "Undoing\u2026";
    cx.spawn(async cx => {
      const left = [];
      let back = 0;
      for (const f of [...u.files].reverse()) {
        if (this.closed) return;
        let why = null;
        if (f.kind === "text") {
          try { await writeTextFile(f.file, f.before, f.after); } catch (_) { why = "it changed since the replace"; }
        } else {
          try {
            const r = await exec("sh", ["-c", UNDO_SH, "sh", f.file, f.kept, f.sum], { timeout: 600000 });
            if (r.code === 3) why = "it changed since the replace";
            else if (r.code !== 0) why = lastLine(r.stderr) || "it couldn't be put back";
          } catch (e) { why = String(e?.message ?? e); }
        }
        if (why) left.push(`${f.name} (${why})`); else back += 1;
      }
      this.busy = null;
      if (back) this.dropPreview();
      const done = back ? `Put back ${plural(back, "file")}` : "";
      const kept = left.length ? `${done ? "left" : "Left"} ${left.length} as ${left.length === 1 ? "it is" : "they are"}: ${left.join(", ")}` : "";
      this.note = { text: [done, kept].filter(Boolean).join(" \u00b7 "), level: !left.length ? "ok" : back ? "warn" : "bad" };
      this.setRows([], null);
      this.search(cx, true);
      cx.notify();
    });
  }

  // ---------------------------------------------------------------- closing

  // What this space's next search starts with (and how the window looks).
  save() {
    const all = shared(SEARCH_LAST) ?? {}, st = this.st;
    const next = { look: { ...this.look }, spaces: { ...(all.spaces ?? {}) } };
    if (!this.p.list && this.p.space) next.spaces[this.p.space] = { q: st.q, fq: st.fq, mode: st.mode, hidden: st.hidden,
      invert: st.invert, pcre2: st.pcre2, unique: st.unique, scope: st.scope, case: st.case, word: st.word, literal: st.literal,
      rep: st.rep, keep: st.keep };
    if (JSON.stringify(next) !== JSON.stringify(all)) setShared(SEARCH_LAST, next);
  }

  // Close: the dialog, or ram-search's tab. Not halfway through a replace or
  // an undo (its note row says so): the window waits for it, then goes (a
  // newer window's too: render asks again).
  finish() {
    if (this.closed || this.leaving || this.busy) return;
    this.leaving = true;
    this.save();
    const o = this.p.overlay;
    if (o) closeOverlay(o);
    else if (this.ownPane) run("pane.close", { pane: this.ownPane });
  }

  // The copy is closing: keep the search, stop its run (and remove ram-search's
  // list and the replace's folder: undo ends with the window).
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.save();
    await this.stop(this.run ?? this.shown, this.p.list ?? "", this.rdir ?? "");
  }

  // ---------------------------------------------------------------- keys

  key(e, cx) {
    if (["shift", "control", "alt", "platform", "function"].includes(e.key)) return;
    if (!this.ownPane && !this.p.overlay) this.ownPane = focused()?.terminal ? null : focused()?.pane ?? null;
    // A question: Enter says yes, Esc no; other keys do nothing meanwhile.
    if (this.ask) {
      cx.stop_propagation();
      if (e.keystroke === "enter") this.act("yes", cx);
      else if (e.keystroke === "escape") this.act("no", cx);
      cx.notify();
      return;
    }
    const act = ACTIONS[e.keystroke];
    if (act) { cx.stop_propagation(); this.act(act, cx); cx.notify(); return; }
    const rep = this.focus === "replace" && this.replaceOn();
    const v = rep ? this.st.rep : this.field(), got = editField(v, rep ? this.rat : this.at, e, () => cx.read_from_clipboard?.());
    if (!got) return;
    cx.stop_propagation();
    if (rep) this.rat = got.at; else this.at = got.at;
    if (got.value !== v) {
      if (rep) this.st.rep = got.value; else this.setField(got.value);
      this.search(cx);
    }
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
    const file = this.pvFile(row), c = this.pv.get(file), lo = Math.max(1, this.pvTop - 20), hi = this.pvTop + this.size.pvRows + 20;
    if (c && (c.binary || c.error || (c.a <= lo && (c.b >= hi || c.end)))) return;
    const want = { file, name: row.file, cwd: this.rowsCwd(), a: Math.max(1, this.pvTop - PV_SPAN), b: this.pvTop + this.size.pvRows + PV_SPAN };
    if (this.pvBusy) { this.pvNext = want; return; }
    this.fetch(want, cx);
  }

  // WANT: lines a..b of a row's file (NAME, as its search gave it, in CWD),
  // kept by its whole path (FILE).
  fetch(want, cx) {
    this.pvBusy = true;
    const gen = this.pvGen;
    cx.spawn(async cx => {
      const got = await this.bat(want.name, want.a, want.b, want.cwd);
      // (Dropped meanwhile: what it read may be from before a replace.)
      if (gen === this.pvGen) {
        this.pv.delete(want.file);
        this.pv.set(want.file, got);
        while (this.pv.size > 24) this.pv.delete(this.pv.keys().next().value);
      }
      this.pvBusy = false;
      const next = this.pvNext;
      this.pvNext = null;
      if (this.closed) return;
      if (next && (next.file !== want.file || next.a !== want.a)) this.fetch(next, cx);
      cx.notify();
    });
  }

  // The preview's lines are read again: the files changed (a replace or an undo).
  dropPreview() {
    this.pv.clear();
    this.pvGen += 1;
  }

  // Lines A..B of FILE (in CWD), colored by bat (its theme, your bat config), else
  // plain; tabs as they are (the preview lays them out, so what matched keeps
  // its place). { a, b, lines, end (the file ends there), binary, error }
  async bat(file, a, b, cwd = this.cwd()) {
    const opts = { cwd, on: this.machine(), timeout: 15000 };
    try {
      const r = await exec("env", ["COLORTERM=truecolor", "bat", "--color=always", "--paging=never", "--wrap=never",
        "--style=plain", "--tabs=0", "--line-range", `${a}:${b}`, "--", file], opts);
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
      return { a, b: a + lines.length - 1, lines, end: lines.length < b - a + 1 };
    } catch (e) { return { a, b, lines: [], error: String(e?.message ?? e) }; }
  }

  // What the list found in FILE, by line: [{ s, e, r }] (r: what a replace
  // makes of it), from the list's own rows (kept until they change).
  hitsOf(file) {
    const c = this.hits;
    if (c && c.ver === this.ver && c.file === file && c.keep === this.st.keep) return c.map;
    const map = new Map();
    for (const r of this.rows) {
      if (r.file !== file || r.kind !== "match") continue;
      map.set(r.line, r.json ? r.subs.map(s => { const m = r.text.slice(s.s, s.e); return { s: s.s, e: s.e, m, r: shownNew(s, this.st.keep, m) }; })
        : hitRanges(r.text));
    }
    this.hits = { ver: this.ver, file, keep: this.st.keep, map };
    return map;
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
      .on_action("ram_search.next", (_e, cx) => { if (!this.ask) this.act("next", cx); cx.notify(); })
      .on_action("ram_search.prev", (_e, cx) => { if (!this.ask) this.act("prev", cx); cx.notify(); })
      .on_action("ram_search.escape", (_e, cx) => { this.act(this.ask ? "no" : "close", cx); cx.notify(); })
      .child(this.head(t))
      .child(this.query(t))
      .when(this.replaceOn(), el => el.child(this.replaceRow(t)))
      .child(this.flags(t))
      .child(this.help ? this.keyList(t) : this.body(t))
      .when(Boolean(this.busy || this.note), el => el.child(this.noteRow(t)))
      .child(this.foot(t));
  }

  // A key's button: the key in amber, then what it does; lit while on. KS: its
  // key when the action isn't one of KEYS (a question's yes and no).
  button(id, action, label, on = false, enabled = true, tip = null, ks = null) {
    const t = theme(), key = ks ?? (keyFor(action) || Object.keys(MOVES).find(k => MOVES[k] === action) || ""), k = keyText(key);
    const what = tip ?? KEYS.find(x => x[1] === action)?.[3] ?? label;
    return h_flex().id(id).h(18 * U).px(5 * U).gap(4 * U).flex_none().items_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).when(on, el => el.bg(AMBER + "1f"))
      .when(enabled, el => el.cursor_pointer().hover(st => st.bg(t.hover)))
      .tooltip(key ? `${what}  ${k}` : what)
      .on_click((_e, cx) => { cx.stop_propagation(); if (enabled) { this.act(action, cx); cx.notify(); } })
      .children(key ? [div().text_size(10 * U).font_semibold().text_color(enabled ? AMBER : t.dim).child(k)] : [])
      .child(div().text_size(10.5 * U).text_color(!enabled ? t.dim : on ? AMBER : t.muted).child(label));
  }

  countText() {
    const n = this.rows.length, r = this.shown, kind = (r?.meta ?? metaOf(this.st)) === 0 ? "file" : "line";
    if (this.error) return "couldn't search";
    const busy = this.starting || (this.run && !this.run.done) || (this.run && this.run !== r), more = r?.more ? "+" : "", dots = busy ? " \u2026" : "";
    if (r?.json && this.replaceOn()) {
      if (this.counts?.ver !== this.ver)
        this.counts = { ver: this.ver, m: this.rows.reduce((k, x) => k + (x.subs?.length ?? 0), 0), f: new Set(this.rows.map(x => x.file)).size };
      const { m, f } = this.counts;
      return `${m.toLocaleString("en-US")}${more} ${m === 1 ? "match" : "matches"} in ${plural(f, "file")}${dots}`;
    }
    return `${n.toLocaleString("en-US")}${more} ${kind}${n === 1 ? "" : "s"}${dots}`;
  }

  head(t) {
    const p = this.p, scope = p.list ? "files given" : this.st.scope === "repo" && p.repo ? "repo" : "folder";
    return h_flex().id("search-head").h(20 * U).flex_none().gap(8 * U).items_center()
      .child(div().flex_none().text_size(12.5 * U).font_semibold().text_color(CYAN).child(this.replaceOn() ? "SEARCH & REPLACE" : "SEARCH"))
      .when(Boolean(p.name), el => el.child(div().flex_none().text_size(11.5 * U).text_color(t.foreground).child(p.name)))
      .child(this.button("search-scope", "scope", scope, false, this.canScope(),
        this.canScope() ? `Search the ${scope === "repo" ? "folder you're in" : "repo"} instead` : "Where it searches"))
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(t.dim).child(this.where(this.cwd())))
      .child(div().id("search-count").flex_none().text_size(11 * U).text_color(this.error ? RED : t.muted).child(this.countText()))
      .child(this.button("search-keys", "keys", "keys", this.help))
      .child(this.button("search-close", "close", "close"));
  }

  // A field (the query, or the replace's new text): its text around the cursor,
  // which shows where it types; a click puts the cursor there (and the typing).
  fieldEl(t, which, v, at0, on, hint) {
    const key = which === "query" ? "field" : "rfield", cw = charW(QUERY), fit = Math.max(4, Math.floor((this.size[key] - 4 * U) / cw));
    const start = clamp(at0 - fit + 2, 0, Math.max(0, v.length - fit + 1));
    const shown = v.slice(start, start + fit), at = at0 - start;
    const caret = el => el.child(div().flex_none().w(1.5 * U).h(QUERY * 1.2).bg(AMBER));
    return h_flex().id(which === "query" ? "search-field" : "search-rfield").flex_1().min_w(0).h_full().items_center().overflow_hidden()
      .cursor_text().font_family(mono()).text_size(QUERY)
      .on_size_change((size, cx) => {
        const w = size.width / zoom();
        if (Math.abs(w - this.size[key]) > 1) { this.size[key] = w; cx.notify(); }
      })
      .on_mouse_down("left", (e, cx) => {
        const x = (e?.local_position?.x ?? 0) / zoom(), to = clamp(start + Math.round(x / cw), 0, v.length);
        if (which === "query") this.at = to; else this.rat = to;
        this.focus = which;
        this.ask = null;   // (a click anywhere else lets a question go, as another button's does)
        this.handle.focus();
        cx.notify();
      })
      .when(!v, el => el.when(on, caret).child(div().flex_none().text_color(t.dim).child(hint)))
      .when(Boolean(v), el => el
        .child(div().flex_none().text_color(t.foreground).child(shown.slice(0, at)))
        .when(on, caret)
        .child(div().flex_none().text_color(t.foreground).child(shown.slice(at))));
  }

  // The query: its mode (^f), then the field with its cursor.
  query(t) {
    const v = this.field(), filename = this.st.mode === "filename", on = this.focus === "query" || !this.replaceOn();
    const mode = filename ? "Filename (fuzzy)" : `Content (${this.st.literal ? "literal" : this.st.pcre2 ? "pcre2" : "regex"})`;
    const hint = filename ? " a file's name, as fzf matches it"
      : this.st.literal ? " the text to find; empty lists the files" : " ripgrep's regex; empty lists the files";
    return h_flex().id("search-query").h(26 * U).flex_none().px(6 * U).gap(8 * U).items_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).bg(t.background ?? t.chrome)
      .when(this.replaceOn(), el => el.child(this.button("search-find", "tofind", "find", on)))
      .child(this.button("search-mode", "mode", mode, filename))
      .child(this.fieldEl(t, "query", v, this.at, on, hint))
      .when(Boolean(v), el => el.child(div().id("search-clear").flex_none().px(4 * U).text_size(11 * U).text_color(t.dim)
        .cursor_pointer().hover(st => st.text_color(AMBER)).tooltip(`Clear the query  ${keyText("cmd-backspace")}`)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.ask = null;
          this.setField(""); this.at = 0; this.focus = "query"; this.search(cx); this.handle.focus(); cx.notify();
        })
        .child("\u2715")));
  }

  // The replace row (Ctrl-R): the new text's field, the row's ✕, then keep case
  // and the replace keys.
  replaceRow(t) {
    const on = this.focus === "replace", can = !this.busy && Boolean(this.shown?.json) && this.rows.length > 0;
    const hint = this.st.literal ? " the new text ($$ for a $); empty deletes what's found"
      : " the new text: $1 or ${name} for the regex's groups, $$ for a $; empty deletes the match";
    const box = h_flex().id("search-replace").flex_1().min_w(120 * U).h(26 * U).px(6 * U).gap(8 * U).items_center().rounded(2)
      .border(1).border_color(on ? AMBER : t.input).bg(t.background ?? t.chrome)
      .child(this.button("search-replace-field", "torep", "replace with", on))
      .child(this.fieldEl(t, "replace", this.st.rep, this.rat, on, hint))
      .child(div().id("search-replace-hide").flex_none().px(4 * U).text_size(11 * U).text_color(t.dim)
        .cursor_pointer().hover(st => st.text_color(AMBER)).tooltip("Hide the replace row")
        .on_click((_e, cx) => { cx.stop_propagation(); this.act("hide", cx); cx.notify(); })
        .child("\u2715"));
    return h_flex().id("search-replace-row").min_h(26 * U).flex_none().flex_wrap().gap(5 * U).items_center()
      .child(box)
      .child(this.button("search-keep", "keep", "keep case", this.st.keep))
      .child(this.button("search-apply", "apply", "replace", false, can))
      .child(this.button("search-applyall", "applyall", "replace all", false, can))
      .child(this.button("search-undo", "undo", "undo", false, !this.busy && this.undos.length > 0));
  }

  flags(t) {
    const st = this.st, rep = this.replaceOn(), off = "Off while replacing", gap = () => div().w(6 * U).flex_none();
    return h_flex().id("search-flags").min_h(20 * U).flex_none().flex_wrap().gap(5 * U).items_center()
      .child(this.button("search-replace-on", "replace", "replace", rep, !this.machine(),
        this.machine() ? "Replace works on this Mac's files only" : null))
      .child(gap())
      .child(this.button("search-case", "case", "match case", st.case))
      .child(this.button("search-word", "word", "whole words", st.word))
      .child(this.button("search-literal", "literal", "literal", st.literal))
      .child(this.button("search-pcre2", "pcre2", "pcre2", st.pcre2))
      .child(this.button("search-invert", "invert", "invert", st.invert, !rep, rep ? off : null))
      .child(this.button("search-hidden", "hidden", "hidden", st.hidden))
      .child(this.button("search-unique", "unique", "one per file", st.unique, !rep, rep ? off : null))
      .child(div().flex_1())
      .child(this.button("search-preview", "preview", "preview", this.look.preview))
      .child(this.button("search-wrap", "wrap", "wrap preview", this.look.wrap))
      .child(this.button("search-listwrap", "listwrap", "wrap list", this.look.listWrap))
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
  // them), each with its pick box, where it is, and its text with the matches
  // lit (a replace's struck out, the new text after them).
  list(t) {
    const cols = this.listCols(), shown = this.rows.slice(this.top, this.top + this.fitFrom(this.top));
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
    const at = locText(r), parts = this.rowParts(r, cols);
    const color = x => x.mark === "old" ? RED : x.mark === "new" ? GREEN : x.mark ? AMBER : t.foreground;
    const runs = part => part.map(x => div().flex_none().text_color(color(x)).when(Boolean(x.mark), el => el.font_semibold())
      .when(x.mark === "old", el => el.line_through()).child(x.text));
    const first = h_flex().h(ROW_H).flex_none().gap(6 * U).items_center().overflow_hidden()
      .child(div().id(`search-pick-${i}`).size(10 * U).flex_none().rounded(1).border(1).border_color(picked ? AMBER : t.input)
        .when(picked, el => el.bg(AMBER)).tooltip(`${picked ? "Picked: click to unpick" : "Pick"}  ${keyText("tab")}`)
        .on_click((_e, cx) => { cx.stop_propagation(); this.ask = null; this.pick(i); this.handle.focus(); cx.notify(); }))
      .child(h_flex().flex_none()
        .when(Boolean(dir), el => el.child(div().flex_none().text_color(t.dim).child(dir)))
        .child(div().flex_none().text_color(here ? AMBER : t.muted).child(name))
        .when(Boolean(at), el => el.child(div().flex_none().text_color(t.dim).child(at))))
      .children(runs(parts[0] ?? []));
    return v_flex().id(`search-row-${i}`).h(ROW_H * parts.length).flex_none().px(5 * U).overflow_hidden()
      .font_family(mono()).text_size(TEXT).cursor_pointer()
      .when(here, el => el.bg(AMBER + "1f")).when(!here, el => el.hover(st => st.bg(t.hover)))
      .on_click((e, cx) => {
        this.ask = null;
        if (e?.modifiers?.platform || e?.modifiers?.control || e?.modifiers?.shift) this.pick(i);
        else { this.cursor = i; if ((e?.click_count ?? 1) >= 2) this.edit(); }
        this.handle.focus();
        cx.notify();
      })
      .child(first)
      .children(parts.slice(1).map((part, k) => h_flex().id(`search-row-${i}-${k + 1}`).h(ROW_H).flex_none().gap(6 * U)
        .items_center().overflow_hidden().child(div().w(10 * U).flex_none()).children(runs(part))));
  }

  // The preview: the file under the cursor from about a third above its line
  // (lit), in bat's colors, with line numbers (Alt-N) and long lines cut or
  // wrapped (Alt-W); what the list found is lit, and in a replace each such
  // line shows twice, as it is (struck out, red) and as it will be (+, green).
  // The wheel and ^d ^u scroll it.
  preview(t, w) {
    const row = this.rows[this.cursor], c = row ? this.pv.get(this.pvFile(row)) : null;
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
    const hits = this.hitsOf(row.file), swap = Boolean(this.shown?.json) && this.replaceOn();
    const lineBg = (kind, lit) => kind === "old" ? RED + (lit ? "38" : "1f") : kind === "new" ? GREEN + (lit ? "2e" : "17") : lit ? AMBER + "2e" : null;
    const span = x => div().flex_none()
      .text_color(x.hit === "old" ? RED : x.hit === "new" ? GREEN : x.fg ?? t.foreground)
      .when(Boolean(x.bg) && !x.hit, el => el.bg(x.bg))
      .when(x.hit === "hit", el => el.bg(AMBER + "4d"))
      .when(x.hit === "old", el => el.bg(RED + "40").line_through())
      .when(x.hit === "new", el => el.bg(GREEN + "33").font_semibold())
      .when(Boolean(x.bold) && x.hit !== "new", el => el.font_semibold()).when(Boolean(x.italic), el => el.italic())
      .when(Boolean(x.underline), el => el.underline()).when(Boolean(x.dim), el => el.opacity(0.7)).child(x.text);
    // (bat ends each line's colors, so each line is read on its own.)
    c.runs ??= [];
    const out = [];
    for (let n = Math.max(c.a, this.pvTop); n <= c.b && out.length < this.size.pvRows; n++) {
      const i = n - c.a;
      c.runs[i] ??= sgrRuns(c.lines[i] ?? "", {}, ansi).runs;
      const lit = n === lineAt, found = hits.get(n), changing = swap && found?.some(x => x.r !== x.m);
      const shows = !found?.length ? [{ runs: c.runs[i], kind: "" }]
        : !changing ? [{ runs: markRuns(c.runs[i], found, "hit"), kind: "" }]
        : [{ runs: markRuns(c.runs[i], found, "old"), kind: "old" }, { runs: swapRuns(c.runs[i], found), kind: "new" }];
      for (const s of shows) {
        const parts = cutRuns(expandTabs(s.runs), this.look.wrap ? cols : cols + 8, this.look.wrap);
        parts.forEach((part, k) => {
          if (out.length >= this.size.pvRows) return;
          const num = k ? "" : s.kind === "new" ? "+".padStart(digits) : String(n).padStart(digits), bg = lineBg(s.kind, lit);
          out.push(h_flex().id(`search-pv-${n}${s.kind === "new" ? "-new" : ""}-${k}`).h(LINE_H).flex_none().overflow_hidden()
            .when(Boolean(bg), el => el.bg(bg))
            .when(this.look.numbers, el => el.child(div().w(gutter).flex_none().pr(8 * U)
              .text_color(s.kind === "new" ? GREEN : lit ? AMBER : s.kind === "old" ? RED : t.dim).child(num)))
            .children(part.map(span)));
        });
      }
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

  // What a replace or undo is doing, or what it did (and what it left alone).
  noteRow(t) {
    const n = this.busy ? { text: this.busy, level: "info" } : this.note;
    const color = n.level === "ok" ? GREEN : n.level === "bad" ? RED : AMBER;
    return h_flex().id("search-note").h(16 * U).flex_none().items_center().overflow_hidden()
      .child(div().flex_1().min_w(0).truncate().text_size(11 * U).text_color(color).tooltip(n.text).child(n.text));
  }

  foot(t) {
    // A question before a replace: yes (Enter) or no (Esc).
    if (this.ask) return h_flex().id("search-foot").min_h(20 * U).flex_none().flex_wrap().gap(5 * U).items_center()
      .child(div().id("search-ask").flex_none().text_size(11.5 * U).font_semibold().text_color(AMBER).child(this.ask.text))
      .child(div().flex_1())
      .child(this.button("search-yes", "yes", "yes", false, true, "Do it", "enter"))
      .child(this.button("search-no", "no", "no", false, true, "Leave the files as they are", "escape"));
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
