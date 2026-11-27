// The search window end to end: mods/ram/search.js (this repo's, or RAM_HOME's)
// driven with Herdr's calls done for real. exec starts a process in its own
// session (setsid, as Herdr's does) and waits for it and its output;
// readTextFile reads UTF-8 or rejects, and writeTextFile writes only over the
// text it was given, whole, keeping permissions and links, as Herdr's do. It
// searches a folder it makes in $TMPDIR with the real rg, fzf, bat and
// ram-search, and compares what it finds with ripgrep's own results; it
// replaces in real files (small and big, UTF-8 and not) and compares them with
// what ripgrep itself writes, then undoes it. Only the window is a stand-in (no
// GPUI). It writes only under $TMPDIR and checks that nothing is left there.
//   node tests/search-e2e.mjs                                 (Node 22+)
//   RAM_HOME=~/.config/herdr-app node tests/search-e2e.mjs    an installed copy
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync, realpathSync, statSync, lstatSync,
  readlinkSync, renameSync, chmodSync, symlinkSync, appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOME = (process.env.RAM_HOME ?? fileURLToPath(new URL("..", import.meta.url))).replace(/\/+$/, "");
for (const tool of ["rg", "fzf", "bat"])
  if (spawnSync("sh", ["-c", `command -v ${tool}`], { stdio: "ignore" }).status !== 0) {
    console.error(`search-e2e needs ${tool} (ripgrep, fzf and bat, which RAM's search uses)`);
    process.exit(1);
  }
const TMP = (process.env.TMPDIR ?? "/tmp").replace(/\/+$/, "");
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const leftovers = () => readdirSync(TMP).filter(f => /^ram-(search(-list)?|replace)\./.test(f));
const before = new Set(leftovers());

// ---- Herdr's calls, for real -------------------------------------------------------
let inflight = 0;
// A file through its links, as Herdr's writeTextFile finds it (src/persist.rs).
const resolved = path => {
  let t = path;
  for (let i = 0; i < 40; i++) {
    let st;
    try { st = lstatSync(t); } catch (_) { return t; }
    if (!st.isSymbolicLink()) return t;
    const l = readlinkSync(t);
    t = l.startsWith("/") ? l : join(dirname(t), l);
  }
  throw new Error("Too many symlinks");
};
const host = globalThis.__e2e = {
  props: {}, shared: new Map(), calls: [], closed: [], notes: [], clipboard: null, focused: null, panes: [], spaces: [],
  execs: [],
  exec(command, args = [], opts = {}) {
    host.execs.push({ command, args, opts });
    inflight++;
    return new Promise((resolve, reject) => {
      const p = spawn(command, args, { cwd: opts.cwd || process.env.HOME, detached: true, stdio: ["ignore", "pipe", "pipe"] });
      const out = [], err = [];
      p.stdout.on("data", d => out.push(d));
      p.stderr.on("data", d => err.push(d));
      p.on("error", e => { inflight--; reject(new Error(`cannot run ${command}: ${e.message}`)); });
      p.on("close", code => { inflight--; resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }); });
    });
  },
  // As Herdr's (src/mod_files.rs): UTF-8 up to 1 MiB (a BOM kept), null when it isn't there.
  async readTextFile(path) {
    let buf;
    try { buf = await readFile(path); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
    if (buf.length > 1 << 20) throw new Error("Text file exceeds 1 MiB");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  },
  // As Herdr's: only while the file still holds EXPECTED (null: a new file), whole (a
  // file beside it, then renamed over it), with its permissions, through its links.
  writes: [],
  async writeTextFile(path, text, expected) {
    if (Buffer.byteLength(text) > 1 << 20) throw new Error("Text file exceeds 1 MiB");
    if ((await host.readTextFile(path)) !== expected) throw new Error("The file changed outside Herdr.");
    host.writes.push(path);
    if (expected === null) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text, { flag: "wx" }); return null; }
    const target = resolved(path), temp = join(dirname(target), `.herdr-app-write-${process.hrtime.bigint()}`);
    try {
      writeFileSync(temp, text, { flag: "wx" });
      chmodSync(temp, statSync(target).mode & 0o7777);
      if ((await host.readTextFile(target)) !== expected) throw new Error("The file changed while saving.");
      renameSync(temp, target);
    } finally { rmSync(temp, { force: true }); }
    return null;
  },
};
const themeFile = JSON.parse(readFileSync(`${HOME}/themes/ram.json`, "utf8"));
host.colors = { background: themeFile.background, foreground: themeFile.foreground, ...themeFile.colors,
  ...Object.fromEntries(themeFile.ansi.map((c, i) => [`ansi${i}`, c])) };
const stub = url(`
  const host = globalThis.__e2e;
  function node(kind) {
    const o = { kind, kids: [], ops: [], handlers: {} };
    const p = new Proxy(o, { get(o, key) {
      if (key in o) return o[key];
      if (key === "then") return undefined;
      return (...args) => {
        if (key === "child") o.kids.push(args[0]);
        else if (key === "children") o.kids.push(...args[0]);
        else if (key === "when") { if (args[0]) args[1](p); }
        else if (key.startsWith("on_")) o.handlers[key + (typeof args[0] === "string" ? ":" + args[0] : "")] = args.at(-1);
        else o.ops.push([key, ...args]);
        return p;
      };
    }}); return p;
  }
  export const div = () => node("div"), h_flex = () => node("h_flex"), v_flex = () => node("v_flex");
  export const exec = (c, a, o) => host.exec(c, a, o), readTextFile = p => host.readTextFile(p);
  export const writeTextFile = (p, t, e) => host.writeTextFile(p, t, e);
  export const props = () => host.props, theme = () => host.colors, settings = () => ({ zoom: 1, font_family: "JetBrains Mono" });
  export const shared = k => host.shared.get(k), setShared = (k, v) => { host.shared.set(k, v); return null; };
  export const run = (name, args) => { host.calls.push({ name, args }); return null; };
  export const closeOverlay = id => { host.closed.push(id); return null; }, openOverlay = () => "o1";
  export const notify = n => { host.notes.push(n); return "n1"; }, home = () => process.env.HOME;
  export const panes = () => host.panes, focused = () => host.focused, spaces = () => host.spaces, keys = () => [];
  export const window = () => ({ active: true, platform: "macos", buttons: false });
`);
const swap = s => s.replaceAll('"gpui-kit"', JSON.stringify(stub)).replaceAll('"gpui-base"', JSON.stringify(stub)).replaceAll('"herdr"', JSON.stringify(stub));
const ui = url(swap(readFileSync(`${HOME}/mods/ram/ui.js`, "utf8")));
const S = await import(url(swap(readFileSync(`${HOME}/mods/ram/search.js`, "utf8")).replaceAll('"./ui.js"', JSON.stringify(ui))));

// ---- the window ---------------------------------------------------------------------
const flatten = t => (typeof t === "object" && t ? [t, ...t.kids.flatMap(flatten)] : []);
const idOf = n => n?.ops?.find(([k]) => k === "id")?.[1];
const withId = (t, id) => flatten(t).find(n => idOf(n) === id);
const textOf = t => flatten(t).flatMap(n => n.kids.filter(k => typeof k === "string"));
let timers = [];
const cx = { timer: { every: (ms, fn) => timers.push({ ms, fn }), after: () => {} }, notify() {}, spawn: fn => fn(cx),
  stop_propagation() {}, bind_keys: b => b.length, write_to_clipboard(t) { host.clipboard = t; }, read_from_clipboard: () => host.clipboard,
  focus_handle() { const h = { focus() { host.keyboard = h; }, is_focused: () => host.keyboard === h }; return h; } };
const opened = [];
function open(p) {
  host.props = p;
  timers = [];
  const v = new S.SearchView(cx);
  opened.push(v);
  v.tick = timers.find(t => t.ms === 40).fn;
  return v;
}
const render = v => { host.props = v.p; return v.render(cx); };
const key = (v, keystroke, extra = {}) => withId(render(v), "ram-search").handlers.on_key_down(
  { key: keystroke.split("-").pop(), keystroke, modifiers: {}, ...extra }, cx);
const type = (v, text) => { for (const ch of text) key(v, ch, { key_char: ch }); };
// Until the newest search has started and every line of it has been read.
async function done(v, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    await v.tick(cx);
    if (!v.starting && !v.leftover && v.run?.done && v.shown === v.run && inflight === 0) return;
    if (Date.now() > end) throw new Error(`the search didn't finish: starting ${v.starting}, run ${JSON.stringify(v.run)}`);
    await sleep(15);
  }
}
async function previewOf(v, file, ms = 10000) {
  const end = Date.now() + ms, key = v.pvFile({ file });
  for (;;) {
    render(v);
    await sleep(15);
    if (!v.pvBusy && v.pv.has(key) && inflight === 0) return v.pv.get(key);
    if (Date.now() > end) throw new Error(`no preview for ${file}`);
  }
}
const idle = async () => { for (let i = 0; i < 500 && inflight > 0; i++) await sleep(10); await sleep(20); };

// ---- a real folder --------------------------------------------------------------------
const root = mkdtempSync(`${TMP}/ram-e2e.`);
mkdirSync(`${root}/src`); mkdirSync(`${root}/.hid`);
writeFileSync(`${root}/a.txt`, "hello world\nfoo Hello bar hello\n\tindented hello\n");
writeFileSync(`${root}/src/main.rs`, Array.from({ length: 120 }, (_, i) => i === 59 ? "    println!(\"hello\");" : `// line ${i + 1}`).join("\n") + "\n");
writeFileSync(`${root}/src/lib.rs`, "pub fn nothing() {}\n");
writeFileSync(`${root}/we:ird 12.txt`, "x:1 hello\n");
writeFileSync(`${root}/.hid/h.txt`, "hello hidden\n");
writeFileSync(`${root}/-dash.txt`, "hello dash\n");
writeFileSync(`${root}/latin1.txt`, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a]));
// rg's own lines as file:line:column (--null: names with ":" in them stay whole).
const rgSet = (args, cwd = root) => new Set(spawnSync("rg", ["--ignore-case", "--line-number", "--column", "--no-heading", "--with-filename",
  "--null", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).stdout.split("\n").filter(Boolean)
  .map(l => { const [path, rest] = l.split("\0"); return `${path}:${rest.split(":").slice(0, 2).join(":")}`; }));
const rowSet = v => new Set(v.rows.map(r => `${r.file}:${r.line}:${r.col}`));
const sameSet = (a, b, what) => assert.deepEqual([...a].sort(), [...b].sort(), what);
host.panes = [{ pane: "p1", terminal: "t1", tab: "tb1", cwd: `${root}/src` }];
host.spaces = [{ id: "s1", name: "e2e", active: true, tabs: [{ id: "tb1", active: true }] }];
const base = { role: "search", space: "s1", name: "e2e", machine: null, target: { pane: "p1", terminal: "t1" }, folder: `${root}/src`, repo: root };
let n = 0;
const passed = what => console.log(`ok ${++n} - ${what}`);
let fake = null;

try {
  // 1. Opening: the repo's files, from the repo's top.
  let v = open({ ...base, at: 1, overlay: "o1" });
  await done(v);
  const files = new Set(spawnSync("rg", ["--files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).stdout.split("\n").filter(Boolean));
  sameSet(new Set(v.rows.map(r => r.file)), files, "an empty query lists the repo's files, as rg --files does");
  assert.equal(v.rows.length, files.size);
  passed(`opening lists the repo's ${files.size} files`);

  // 2. Typing (fast, without waiting): only the newest query's lines, as rg finds them.
  type(v, "hello");
  await done(v);
  assert.equal(v.st.q, "hello");
  sameSet(rowSet(v), new Set([...rgSet(["-e", "hello"])]), "the lines rg finds for hello");
  const runsTyped = host.execs.filter(e => e.args[1] === S.RUN_SH).length;
  assert(runsTyped <= 6, `one run per key at most (${runsTyped})`);
  const latin = v.rows.find(r => r.file === "latin1.txt");
  assert(latin && S.plainText(latin.text).includes("\ufffd"), "a line that isn't UTF-8 comes through cat, its odd byte as U+FFFD");
  passed("typing searches: the same lines as rg, a non-UTF-8 line included");

  // 3. The preview: bat's colors for the file under the cursor, around its line.
  const mainRow = v.rows.findIndex(r => r.file === "src/main.rs");
  v.cursor = mainRow;
  const pv = await previewOf(v, "src/main.rs");
  assert(pv.lines.length >= 100 && pv.a === 1 && pv.end, "bat's lines for the file");
  let tree = render(v);
  const lit = withId(tree, "search-pv-60-0");
  assert(lit && lit.ops.some(o => o[0] === "bg"), "line 60, the match, is lit");
  assert(textOf(lit).join("").includes("println!"), "with its text");
  assert(flatten(lit).some(n => n.ops.some(o => o[0] === "text_color" && /^#[0-9a-f]{6}$/i.test(o[1]) && o[1] !== host.colors.foreground)),
    "in bat's colors");
  assert.equal(v.pvTop, 60 - Math.floor(v.size.pvRows / 3), "a third down");
  passed("the preview: bat's colored lines, the match lit a third down");

  // 4. Options, each against rg itself.
  key(v, "alt-i", { modifiers: { alt: true } }); await done(v);
  sameSet(rowSet(v), rgSet(["--hidden", "-e", "hello"]), "Alt-I: hidden files too");
  key(v, "alt-i", { modifiers: { alt: true } }); await done(v);
  key(v, "alt-u", { modifiers: { alt: true } }); await done(v);
  sameSet(rowSet(v), rgSet(["--max-count", "1", "-e", "hello"]), "Alt-U: one per file");
  key(v, "alt-u", { modifiers: { alt: true } }); key(v, "alt-v", { modifiers: { alt: true } }); await done(v);
  const inverted = new Set(spawnSync("rg", ["--ignore-case", "--line-number", "--no-heading", "--with-filename", "--null", "--invert-match", "-e", "hello"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).stdout.split("\n").filter(Boolean).map(l => { const [path, rest] = l.split("\0"); return `${path}:${rest.split(":")[0]}`; }));
  sameSet(new Set(v.rows.map(r => `${r.file}:${r.line}`)), inverted, "Alt-V: the lines that don't match");
  assert(v.rows.every(r => r.kind === "line" && r.col === null));
  key(v, "alt-v", { modifiers: { alt: true } }); await done(v);
  for (let i = 0; i < 5; i++) key(v, "backspace");
  type(v, "hel(?=lo w)");
  await done(v);
  assert.match(v.shown.err, /look-?around/i, "the default engine can't look ahead: ripgrep says so");
  assert.equal(v.rows.length, 0);
  key(v, "alt-p", { modifiers: { alt: true } }); await done(v);
  sameSet(rowSet(v), rgSet(["--engine", "pcre2", "-e", "hel(?=lo w)"]), "Alt-P: PCRE2 looks ahead");
  key(v, "alt-p", { modifiers: { alt: true } });
  for (let i = 0; i < 11; i++) key(v, "backspace");
  type(v, "hello"); await done(v);
  passed("Alt-I Alt-U Alt-V Alt-P match rg's own results, and a regex rg refuses shows its error");

  // 5. Filename mode: what the content query found, by name; back in content
  // mode the name query picks the files searched.
  key(v, "ctrl-f", { modifiers: { control: true } });
  type(v, "weird");
  await done(v);
  sameSet(rowSet(v), new Set([...rgSet(["-e", "hello"])].filter(x => x.startsWith("we:ird 12.txt"))), "Ctrl-F: by the file's name");
  key(v, "ctrl-f", { modifiers: { control: true } }); await done(v);
  assert.equal(v.st.q, "hello");
  sameSet(rowSet(v), new Set([...rgSet(["-e", "hello"])].filter(x => x.startsWith("we:ird 12.txt"))), "content mode, searching only those files");
  key(v, "ctrl-f", { modifiers: { control: true } });
  for (let i = 0; i < 5; i++) key(v, "backspace");
  key(v, "ctrl-f", { modifiers: { control: true } }); await done(v);
  sameSet(rowSet(v), rgSet(["-e", "hello"]), "the name query cleared: everything again");
  passed("Ctrl-F: filename mode filters by name, and the name query picks the files content mode searches");

  // 6. Picks: the files at the prompt of the terminal (in src: paths from there).
  key(v, "ctrl-a", { modifiers: { control: true } });
  host.calls = []; host.clipboard = null;
  key(v, "enter");
  await idle();
  const expectFiles = [...new Set(v.rows.map(r => r.file))].map(f => f.startsWith("src/") ? f.slice(4) : `${root}/${f}`)
    .map(f => f.startsWith("-") ? `./${f}` : f).sort();
  assert.equal(host.clipboard, expectFiles.map(S.shellQuote).join(" "), "each file once, from the terminal's folder (src), quoted where needed");
  assert.deepEqual(host.calls.map(c => c.name), ["pane.focus", "terminal.paste"], "into that terminal");
  assert.deepEqual(host.closed, ["o1"]);
  passed("Enter: the picked files, from the terminal's folder, at its prompt; the window closes");
  await v.close();

  // 7. The next window: the same search back; Ctrl-O and Alt-Enter (rg's JSON).
  v = open({ ...base, at: 2, overlay: "o2" });
  assert.equal(v.st.q, "hello", "the space's last search");
  await done(v);
  v.cursor = v.rows.findIndex(r => r.file === "a.txt" && r.line === 2);
  key(v, "ctrl-o", { modifiers: { control: true } });
  await idle();
  assert.equal(host.clipboard, `${root}/a.txt:2:5:foo Hello bar hello`);
  await v.close();
  v = open({ ...base, at: 3, overlay: "o3" });
  await done(v);
  v.cursor = v.rows.findIndex(r => r.file === "a.txt" && r.line === 2);
  key(v, "alt-enter", { key: "enter", modifiers: { alt: true } });
  await idle();
  assert.deepEqual(JSON.parse(host.clipboard), { query: "hello", results: [{ file: `${root}/a.txt`, line: 2, column: 5,
    text: "foo Hello bar hello", matches: ["Hello", "hello"] }] }, "rg-fzf's JSON, from rg --json");
  await v.close();
  passed("the next window has the search back; Ctrl-O gives file:line:col:text, Alt-Enter rg's JSON");

  // 8. Alt-S: the folder the terminal is in instead of the repo; Ctrl-E opens the editor there.
  v = open({ ...base, at: 4, overlay: "o4" });
  await done(v);
  key(v, "alt-s", { modifiers: { alt: true } });
  await done(v);
  sameSet(rowSet(v), rgSet(["-e", "hello"], `${root}/src`), "only src's lines, as found from src");
  v.cursor = 0; host.calls = [];
  key(v, "ctrl-e", { modifiers: { control: true } });
  assert.deepEqual(host.calls[0], { name: "tab.new", args: { space: "s1", name: "main.rs", folder: `${root}/src`,
    argv: ["exec", "sh", "-c", S.EDIT_SH, "sh", "60", "main.rs"] } });
  await v.close();
  passed("Alt-S searches the terminal's folder; Ctrl-E opens $EDITOR at the line there");

  // 9. Many results: they stop at 20,000 ("+"), streamed in chunks.
  mkdirSync(`${root}/big`);
  for (let f = 0; f < 25; f++) writeFileSync(`${root}/big/f${f}.txt`, Array.from({ length: 1000 }, (_, i) => `needle ${f}-${i}`).join("\n") + "\n");
  v = open({ ...base, at: 5, overlay: "o5", folder: root });
  await done(v);
  for (let i = 0; i < 5; i++) key(v, "backspace");
  type(v, "needle");
  await done(v, 30000);
  assert.equal(v.rows.length, S.MAX_ROWS, "20,000 kept");
  assert.equal(v.shown.more, true, "and it says there were more");
  assert.match(textOf(withId(render(v), "search-count")).join(""), /\+ lines$/);
  passed(`a big search stops at ${S.MAX_ROWS} lines and says "+"`);

  // 10. Typing over a big search while it runs: the runs before stop; closing leaves nothing behind.
  for (let i = 0; i < 6; i++) key(v, "backspace");
  await done(v, 30000);
  type(v, "needle");
  await sleep(5);
  type(v, " 1-9");
  await done(v, 30000);
  sameSet(rowSet(v), rgSet(["-e", "needle 1-9"]), "the last query's lines only");
  await v.close();
  await sleep(1500);
  const left = leftovers().filter(f => !before.has(f));
  assert.deepEqual(left, [], "no run folders left behind");
  passed("typing over a running search: only the last query's lines, and no folders left after closing");

  // 11. ram-search: a list piped in, opened as a tab of its own.
  fake = mkdtempSync(`${TMP}/ram-e2e-bin.`);
  writeFileSync(`${fake}/herdr-app`, `#!/bin/sh\nprintf '%s\\n' "$@" > "${fake}/args"\n`, { mode: 0o755 });
  const r = spawnSync("sh", ["-c", `printf 'a.txt\\nsrc/main.rs\\n' | "${HOME}/mods/ram/ram-search"`],
    { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${fake}:${process.env.PATH}`, HC_TERMINAL_ID: "t9" } });
  assert.equal(r.status, 0, r.stderr);
  const sent = readFileSync(`${fake}/args`, "utf8").split("\n");
  assert.deepEqual(sent.slice(0, 6), ["do", "tab.new", "--name", "search", "--mod", "ram"]);
  const props = JSON.parse(sent[7]);
  host.focused = { space: "s1", tab: "tb2", pane: "pSearch", terminal: null };
  host.panes = [...host.panes, { pane: "p9", terminal: "t9", tab: "tb3", cwd: root }];
  v = open(props);
  assert.equal(realpathSync(props.cwd), realpathSync(root), "where ram-search ran");
  await done(v);
  sameSet(new Set(v.rows.map(r => r.file)), new Set(["a.txt", "src/main.rs"]), "the files given");
  type(v, "hello");
  await done(v);
  sameSet(rowSet(v), new Set([...rgSet(["-e", "hello"])].filter(x => x.startsWith("a.txt") || x.startsWith("src/main.rs"))), "searched in those only");
  // A replace in the files given: only those, and it asks (no repo known for a list).
  const aBefore = readFileSync(`${root}/a.txt`, "utf8");
  key(v, "ctrl-r", { modifiers: { control: true } });
  type(v, "bye");
  await done(v);
  assert(v.rows.length && v.rows.every(r => r.json && (r.file === "a.txt" || r.file === "src/main.rs")), "a replace's rows, from the list's files");
  v.cursor = v.rows.findIndex(r => r.file === "a.txt" && r.line === 1);
  key(v, "alt-r", { modifiers: { alt: true } });
  assert.match(v.ask?.text ?? "", /^Replace 1 match in 1 file\? Not in a git repo/);
  key(v, "enter");
  for (let i = 0; i < 500 && (v.busy || inflight > 0); i++) await sleep(10);
  await done(v);
  assert.equal(readFileSync(`${root}/a.txt`, "utf8"), aBefore.replace("hello world", "bye world"), "that line, in the file given");
  key(v, "alt-z", { modifiers: { alt: true } });
  for (let i = 0; i < 500 && (v.busy || inflight > 0); i++) await sleep(10);
  await done(v);
  assert.equal(readFileSync(`${root}/a.txt`, "utf8"), aBefore, "and back");
  withId(render(v), "search-replace-hide").handlers.on_click({}, cx);
  await done(v);
  assert(v.rows.length && !v.rows.some(r => r.json), "the row's \u2715: a plain search again");
  host.calls = [];
  key(v, "enter");
  await idle();
  assert.deepEqual(host.calls, [{ name: "pane.focus", args: { terminal: "t9" } }, { name: "terminal.paste", args: undefined },
    { name: "pane.close", args: { pane: "pSearch" } }], "to ram-search's terminal, then its tab closes");
  const listFile = props.list;
  assert(existsSync(listFile));
  await v.close();
  await sleep(300);
  assert(!existsSync(listFile), "its list is removed on close");
  rmSync(fake, { recursive: true, force: true });
  passed("ram-search: a piped list opens its own tab, searches (and replaces in) those files, picks go back to that terminal");

  // 12. A newer window closes an older one (^b / again); its run stops.
  host.shared.set(S.SEARCH_TOP, 10);
  const older = open({ ...base, at: 10, overlay: "o10" });
  await done(older);
  host.shared.set(S.SEARCH_TOP, 11);
  render(older);
  await idle();
  assert.deepEqual(host.closed.at(-1), "o10");
  await older.close();
  await sleep(1500);
  assert.deepEqual(leftovers().filter(f => !before.has(f)), [], "nothing left behind");
  passed("^b / again closes the older window, and nothing is left behind");

  // ---- Replace (Ctrl-R), in real files: small and big, UTF-8 and not, against ripgrep's own.
  const rep = `${root}/rep`;
  mkdirSync(`${rep}/.hid`, { recursive: true }); mkdirSync(`${rep}/.git`);
  const TEXT = { "a.txt": "user@host one\nUser@Host two\nno match\nUSER@HOST three\n", "crlf.txt": "x user@host\r\ny\r\nz user@host\r\n",
    "nofinal.txt": "first\nlast user@host", "uni.txt": "\u00e9 user@host \ud83d\ude00 user@host\n", "bom.txt": "\ufeffuser@host bom\nuser@host two\n",
    "run.sh": "echo user@host\n", ".hid/h.txt": "user@host hidden\n", ".git/config": "[user] email = user@host\n" };
  for (const [f, t] of Object.entries(TEXT)) writeFileSync(`${rep}/${f}`, t);
  chmodSync(`${rep}/run.sh`, 0o755);
  writeFileSync(`${rep}/latin1.txt`, Buffer.from("caf\xe9 user@host\nna\xefve\n", "latin1"));
  chmodSync(`${rep}/latin1.txt`, 0o640);
  const filler = "filler line without the at sign\n".repeat(40000);
  writeFileSync(`${rep}/big.txt`, "user@host top\n" + filler + "mid user@host\n" + filler + "end user@host\n");
  chmodSync(`${rep}/big.txt`, 0o755);
  writeFileSync(`${rep}/bombig.txt`, "\ufeffuser@host first\n" + filler + "last user@host\n");
  // A minified file: one 3 MiB line with matches (and backslashes) in it.
  writeFileSync(`${rep}/mini.js`, "var a='user@host',c='C:\\\\dir\\\\x';" + "f(1);".repeat(640 * 1024) + "var b='user@host'\n");
  writeFileSync(`${rep}/u16.txt`, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("user@host\n", "utf16le")]));
  const ALL = [...Object.keys(TEXT), "latin1.txt", "big.txt", "bombig.txt", "mini.js", "u16.txt"];
  const orig = Object.fromEntries(ALL.map(f => [f, readFileSync(`${rep}/${f}`)]));
  const modes = Object.fromEntries(ALL.map(f => [f, statSync(`${rep}/${f}`).mode & 0o777]));
  const sameModes = what => { for (const f of ALL) assert.equal(statSync(`${rep}/${f}`).mode & 0o777, modes[f], `${f}'s permissions kept ${what}`); };
  assert(orig["big.txt"].length > 1 << 20, "big.txt is over writeTextFile's 1 MiB");
  const Q = "(\\w+)@(\\w+)", NEW = "$2:$1";
  // ripgrep's own replace of a whole file (the oracle): its passthru, less the line end it adds to a last line without one.
  const oracle = (file, args) => {
    let out = spawnSync("rg", ["--no-config", "--passthru", "--color", "never", "--no-line-number", "--no-filename", ...args, "--", file],
      { cwd: rep, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).stdout;
    const was = orig[file];
    if (was.length && was[was.length - 1] !== 10 && out[out.length - 1] === 10) out = out.subarray(0, -1);
    if (was[0] === 0xef && was[1] === 0xbb && was[2] === 0xbf && out[0] !== 0xef) out = Buffer.concat([was.subarray(0, 3), out]);
    return out;
  };
  const rgRows = args => spawnSync("rg", ["--no-config", "--json", "--glob=!.git", ...args], { cwd: rep, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 })
    .stdout.split("\n").filter(l => l.startsWith('{"type":"match"')).map(l => JSON.parse(l).data)
    .map(d => `${d.path.text}:${d.line_number}:${d.submatches.map(s => s.replacement.text).join("|")}`);
  const repRows = v => v.rows.map(r => `${r.file}:${r.line}:${r.subs.map(s => s.r).join("|")}`);
  const quiet = async v => { for (let i = 0; i < 2000 && (v.busy || inflight > 0); i++) await sleep(15); await done(v, 30000); };
  const same = what => { for (const f of ALL) assert(readFileSync(`${rep}/${f}`).equals(orig[f]), `${f} as it was ${what}`); };
  const rbase = { ...base, folder: rep, repo: rep, target: null };
  host.shared.delete(S.SEARCH_LAST);

  // 13. Ctrl-R: the replace row; each match with what ripgrep makes of it ($1 and $2 too), as ripgrep's JSON says.
  v = open({ ...rbase, at: 20, overlay: "o20" });
  await done(v);
  type(v, Q);
  key(v, "ctrl-r", { modifiers: { control: true } });
  type(v, NEW);
  await done(v);
  sameSet(new Set(repRows(v)), new Set(rgRows(["--ignore-case", "--replace", NEW, "-e", Q])), "the rows and their new text, as rg's JSON");
  assert(v.rows.find(r => r.file === "latin1.txt")?.bytes, "a line that isn't UTF-8 comes as its bytes");
  assert.equal(v.rows.find(r => r.file === "uni.txt")?.subs.map(s => s.e - s.s).join(), "9,9", "places in a line with \u00e9 and an emoji");
  const pvRow = v.rows.findIndex(r => r.file === "a.txt" && r.line === 2);
  v.cursor = pvRow;
  await previewOf(v, "a.txt");
  tree = render(v);
  assert.deepEqual([textOf(withId(tree, "search-pv-2-0")).join(""), textOf(withId(tree, "search-pv-2-new-0")).join("")],
    ["2User@Host two", "+Host:User two"], "the preview: the line as it is, then as it will be");
  passed("Ctrl-R: each match's new text from ripgrep's JSON (groups too), shown in the list and the preview");

  // 14. Alt-I then Alt-A (after its question): every line listed, ripgrep's replace of each file
  // byte for byte; never inside .git; a big and a Latin-1 file through REPLACE_SH; UTF-16 left alone.
  key(v, "alt-i", { modifiers: { alt: true } });
  await done(v);
  assert(v.rows.some(r => r.file === ".hid/h.txt") && !v.rows.some(r => r.file.startsWith(".git")), "hidden files, but never .git");
  const listed = new Set(v.rows.map(r => r.file)), matches = v.rows.reduce((k, r) => k + (r.file === "u16.txt" ? 0 : r.subs.length), 0);
  key(v, "alt-a", { modifiers: { alt: true } });
  assert.equal(v.ask?.text, `Replace ${v.rows.reduce((k, r) => k + r.subs.length, 0)} matches in ${listed.size} files?`);
  key(v, "enter");
  await quiet(v);
  for (const f of ALL) {
    const now = readFileSync(`${rep}/${f}`);
    if (!listed.has(f) || f === "u16.txt") assert(now.equals(orig[f]), `${f} untouched`);
    else assert(now.equals(oracle(f, ["--ignore-case", "--hidden", "-r", NEW, "-e", Q])), `${f}: as ripgrep itself replaces it`);
  }
  assert.equal(statSync(`${rep}/run.sh`).mode & 0o777, 0o755, "its permissions kept");
  sameModes("by the replace (the big ones' too)");
  assert.equal(v.note.text, `Replaced ${matches} matches in ${listed.size - 1} files \u00b7 skipped 1: u16.txt (it isn't text)`);
  assert.deepEqual(readdirSync(rep).filter(f => f.startsWith(".ram-replace.") || f.startsWith(".herdr-app-write-")), [], "no files of its own left");
  passed(`Alt-A: ${matches} matches in ${listed.size - 1} files, each file as ripgrep itself replaces it (CRLF, no last line end, BOM, \u00e9, Latin-1, over 1 MiB with and without a BOM, a 3 MiB line); .git and UTF-16 untouched`);

  // 15. Alt-Z: every file back byte for byte (the big ones from their kept copies).
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  same("after undo");
  assert.equal(statSync(`${rep}/run.sh`).mode & 0o777, 0o755);
  sameModes("by undo");
  assert.equal(v.note.text, `Put back ${listed.size - 1} files`);
  passed("Alt-Z puts every file back byte for byte");

  // 16. Picks: Alt-R replaces only the picked lines (in a repo, without asking).
  const pickAt = (file, line) => { v.cursor = v.rows.findIndex(r => r.file === file && r.line === line); key(v, "tab"); };
  pickAt("a.txt", 1); pickAt("crlf.txt", 3);
  key(v, "alt-r", { modifiers: { alt: true } });
  assert.equal(v.ask, null, "no question in a repo");
  await quiet(v);
  assert.equal(readFileSync(`${rep}/a.txt`, "utf8"), "host:user one\nUser@Host two\nno match\nUSER@HOST three\n");
  assert.equal(readFileSync(`${rep}/crlf.txt`, "utf8"), "x user@host\r\ny\r\nz host:user\r\n");
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  same("after undo");
  passed("Alt-R: only the picked lines change");

  // 17. Literal, whole words, keep case; then match case.
  for (let i = 0; i < NEW.length; i++) key(v, "backspace");
  type(v, "account");
  key(v, "alt-up", { modifiers: { alt: true } });
  for (let i = 0; i < Q.length; i++) key(v, "backspace");
  type(v, "user");
  for (const k of ["alt-l", "alt-b", "alt-k"]) key(v, k, { modifiers: { alt: true } });
  await done(v);
  assert.deepEqual([v.st.q, v.st.rep, v.st.literal, v.st.word, v.st.keep], ["user", "account", true, true, true]);
  key(v, "alt-a", { modifiers: { alt: true } }); key(v, "enter");
  await quiet(v);
  assert.equal(readFileSync(`${rep}/a.txt`, "utf8"), "account@host one\nAccount@Host two\nno match\nACCOUNT@HOST three\n", "each in its case");
  assert.equal(readFileSync(`${rep}/uni.txt`, "utf8"), "\u00e9 account@host \ud83d\ude00 account@host\n");
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  key(v, "alt-m", { modifiers: { alt: true } });
  await done(v);
  key(v, "alt-a", { modifiers: { alt: true } }); key(v, "enter");
  await quiet(v);
  assert.equal(readFileSync(`${rep}/a.txt`, "utf8"), "account@host one\nUser@Host two\nno match\nUSER@HOST three\n", "match case: only user");
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  same("after undo");
  passed("literal, whole words and keep case (user, User, USER); match case only user");

  // 18. A file that changed after the search is left alone (and said so); undo takes back the rest.
  writeFileSync(`${rep}/a.txt`, "a new first line\n" + TEXT["a.txt"]);
  key(v, "alt-a", { modifiers: { alt: true } }); key(v, "enter");
  await quiet(v);
  assert.equal(readFileSync(`${rep}/a.txt`, "utf8"), "a new first line\n" + TEXT["a.txt"], "left as the other writer left it");
  assert(/ \u00b7 skipped 2: /.test(v.note.text) && v.note.text.includes("a.txt (it changed since the search)") && v.note.text.includes("u16.txt (it isn't text)"),
    v.note.text);
  assert.equal(readFileSync(`${rep}/uni.txt`, "utf8"), "\u00e9 account@host \ud83d\ude00 account@host\n", "the rest went ahead");
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  writeFileSync(`${rep}/a.txt`, TEXT["a.txt"]);
  same("after undo");
  passed("a file changed since the search is skipped and said so; the rest goes ahead and comes back");

  // 19. REPLACE_SH on its own: through a link, a name with = in it, a NUL (binary), a stale
  // line, and undo only while the file is what it wrote.
  const helperDir = mkdtempSync(`${TMP}/ram-replace.`);
  writeFileSync(`${rep}/target.txt`, "user@host target\nkeep me\n");
  symlinkSync("target.txt", `${rep}/link.txt`);
  writeFileSync(`${rep}/a=b.txt`, "x user@host\n");
  writeFileSync(`${rep}/bin.txt`, "user@host\0\n");
  const sh = (script, ...args) => spawnSync("sh", ["-c", script, "sh", ...args], { cwd: rep, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const planFor = (file, n) => {
    const rows = spawnSync("rg", ["--no-config", "--json", "--replace", "host:user", "-e", "user@host", "--", file], { cwd: rep, encoding: "utf8" })
      .stdout.split("\n").map(S.parseJsonRow).filter(Boolean);
    const parts = S.planParts(rows, false), planBase = `${helperDir}/plan-${n}`;
    parts.forEach((p, k) => writeFileSync(`${planBase}.${k}`, p));
    return [planBase, String(parts.length)];
  };
  let hr = sh(S.REPLACE_SH, `${rep}/link.txt`, `${helperDir}/kept-1`, ...planFor("link.txt", 1));
  assert.equal(hr.status, 0, hr.stderr);
  assert(lstatSync(`${rep}/link.txt`).isSymbolicLink(), "the link stays a link");
  assert.equal(readFileSync(`${rep}/target.txt`, "utf8"), "host:user target\nkeep me\n", "its file changed");
  assert.equal(readFileSync(`${helperDir}/kept-1`, "utf8"), "user@host target\nkeep me\n", "a copy kept for undo");
  const sum = hr.stdout.trim();
  appendFileSync(`${rep}/target.txt`, "later\n");
  assert.equal(sh(S.UNDO_SH, `${rep}/link.txt`, `${helperDir}/kept-1`, sum).status, 3, "changed since: undo leaves it");
  assert.equal(readFileSync(`${rep}/target.txt`, "utf8"), "host:user target\nkeep me\nlater\n");
  writeFileSync(`${rep}/target.txt`, "host:user target\nkeep me\n");
  hr = sh(S.UNDO_SH, `${rep}/link.txt`, `${helperDir}/kept-1`, sum);
  assert.equal(hr.status, 0, hr.stderr);
  assert.equal(readFileSync(`${rep}/target.txt`, "utf8"), "user@host target\nkeep me\n", "undo puts it back");
  assert(lstatSync(`${rep}/link.txt`).isSymbolicLink() && !existsSync(`${helperDir}/kept-1`), "still a link; its copy gone");
  hr = sh(S.REPLACE_SH, "a=b.txt", `${helperDir}/kept-2`, ...planFor("a=b.txt", 2));
  assert.deepEqual([hr.status, readFileSync(`${rep}/a=b.txt`, "utf8")], [0, "x host:user\n"], "a name awk would take for a=value: it reads the file on its stdin");
  const binPlan = planFor("a=b.txt", 3);
  hr = sh(S.REPLACE_SH, `${rep}/bin.txt`, `${helperDir}/kept-3`, ...binPlan);
  assert.deepEqual([hr.status, readFileSync(`${rep}/bin.txt`, "utf8")], [4, "user@host\0\n"], "a NUL: not text, left alone");
  const stalePlan = planFor("crlf.txt", 4);
  writeFileSync(`${rep}/crlf.txt`, "moved\r\n" + TEXT["crlf.txt"]);
  hr = sh(S.REPLACE_SH, `${rep}/crlf.txt`, `${helperDir}/kept-4`, ...stalePlan);
  assert.deepEqual([hr.status, readFileSync(`${rep}/crlf.txt`, "utf8")], [3, "moved\r\n" + TEXT["crlf.txt"]], "a line that moved: exit 3, left alone");
  assert.deepEqual(readdirSync(rep).filter(f => f.startsWith(".ram-replace.")), [], "its own file beside it removed each time");
  writeFileSync(`${rep}/crlf.txt`, TEXT["crlf.txt"]);
  rmSync(helperDir, { recursive: true, force: true });
  passed("REPLACE_SH: through a link, a name with =, a NUL refused, a moved line refused; undo only over what it wrote");

  // 20. Ctrl-R off: at once the rows as a search shows them (nothing struck out), then ripgrep's
  // plain search; on again: its JSON, the new text kept. Hidden files off and a name filter while
  // replacing; PCRE2 and $$; a regex that doesn't parse. Each run as ripgrep's own.
  for (const k of ["alt-l", "alt-b", "alt-k", "alt-m"]) key(v, k, { modifiers: { alt: true } });
  await done(v);
  assert.deepEqual([v.st.q, v.st.rep, v.st.literal, v.st.word, v.st.keep, v.st.case, v.st.hidden, v.replaceOn()],
    ["user", "account", false, false, false, false, true, true]);
  const asRg = args => new Set(rgRows(["--ignore-case", ...args]));
  sameSet(new Set(repRows(v)), asRg(["--hidden", "--replace", "account", "-e", "user"]), "a replace's rows");
  key(v, "ctrl-r", { modifiers: { control: true } });
  tree = render(v);
  assert(!withId(tree, "search-replace-row") && !flatten(withId(tree, "search-list")).some(x => x.ops.some(o => o[0] === "line_through")),
    "off at once: the row gone, nothing struck out");
  assert.equal(textOf(withId(tree, "search-head"))[0], "SEARCH");
  await done(v);
  assert(!v.rows.some(r => r.json), "a search's rows");
  sameSet(rowSet(v), rgSet(["--hidden", "-e", "user"], rep), "then ripgrep's plain search");
  key(v, "ctrl-r", { modifiers: { control: true } });
  await done(v);
  assert.equal(v.focus, "replace");
  sameSet(new Set(repRows(v)), asRg(["--hidden", "--replace", "account", "-e", "user"]), "on again: ripgrep's JSON, the new text kept");
  key(v, "alt-i", { modifiers: { alt: true } });
  key(v, "ctrl-f", { modifiers: { control: true } }); type(v, "txt"); key(v, "ctrl-f", { modifiers: { control: true } });
  await done(v);
  const txt = rows => new Set([...rows].filter(r => r.split(":")[0].endsWith(".txt")));
  assert.deepEqual([v.replaceOn(), v.st.fq, v.st.hidden], [true, "txt", false]);
  // (The name filter gives ripgrep the files themselves: as ripgrep searches files it's given.)
  const txtFiles = spawnSync("rg", ["--files", "--glob=!.git"], { cwd: rep, encoding: "utf8" }).stdout.split("\n").filter(f => f.endsWith(".txt"));
  sameSet(new Set(repRows(v)), txt(asRg(["--replace", "account", "-e", "user", "--", ...txtFiles])), "hidden off, the .txt files (fzf's filter)");
  const clear = () => { key(v, "end"); key(v, "cmd-backspace"); };
  key(v, "alt-p", { modifiers: { alt: true } });
  key(v, "alt-up", { modifiers: { alt: true } }); clear(); type(v, "(?<=@)host");
  key(v, "alt-down", { modifiers: { alt: true } }); clear(); type(v, "$$x");
  await done(v);
  const PC = ["--engine", "pcre2", "-e", "(?<=@)host"];
  sameSet(new Set(repRows(v)), txt(asRg(["--replace", "$$x", ...PC, "--", ...txtFiles])), "PCRE2 (a lookbehind) and $$, as ripgrep's");
  assert(v.rows.length && v.rows.every(r => r.subs.every(s => s.r === "$x")), "$$ is a dollar");
  const pcFiles = new Set(v.rows.map(r => r.file));
  key(v, "alt-a", { modifiers: { alt: true } }); key(v, "enter");
  await quiet(v);
  for (const f of ALL) {
    const now = readFileSync(`${rep}/${f}`);
    if (!pcFiles.has(f) || f === "u16.txt") assert(now.equals(orig[f]), `${f} untouched`);
    else assert(now.equals(oracle(f, ["--ignore-case", "-r", "$$x", ...PC])), `${f}: as ripgrep itself replaces it`);
  }
  key(v, "alt-z", { modifiers: { alt: true } });
  await quiet(v);
  same("after undo");
  key(v, "alt-up", { modifiers: { alt: true } }); type(v, "(");
  await done(v);
  tree = render(v);
  assert(/error/i.test(textOf(withId(tree, "search-empty")).join("")) && !v.rows.length, "a regex that doesn't parse: ripgrep's error");
  key(v, "alt-a", { modifiers: { alt: true } });
  assert.deepEqual([v.ask, v.note?.text], [null, "Nothing to replace here"]);
  same("(nothing replaced)");
  passed("Ctrl-R off and on, hidden and a name filter while replacing, PCRE2 and $$, a bad regex: each run as ripgrep's");

  // 21. A window from a saved replace (an older RAM saved replacing: true) opens to search, the new
  // text kept; Ctrl-R gives ripgrep's JSON. Halfway through a replace Esc waits; then it closes.
  host.shared.set(S.SEARCH_LAST, { look: {}, spaces: { s1: { q: "user", rep: "account", replacing: true } } });
  const w = open({ ...rbase, overlay: "o31" });
  await done(w);
  assert.deepEqual([w.st.replacing, w.st.rep, w.rows.some(r => r.json), textOf(withId(render(w), "search-head"))[0]], [false, "account", false, "SEARCH"]);
  sameSet(rowSet(w), rgSet(["-e", "user"], rep), "ripgrep's plain search");
  key(w, "ctrl-r", { modifiers: { control: true } });
  await done(w);
  sameSet(new Set(repRows(w)), asRg(["--replace", "account", "-e", "user"]), "Ctrl-R: its JSON, with the text kept");
  key(w, "alt-a", { modifiers: { alt: true } }); key(w, "enter");
  assert(w.busy, "replacing");
  key(w, "escape");
  assert(!host.closed.includes("o31"), "Esc waits while it replaces");
  await quiet(w);
  assert(!host.closed.includes("o31") && /^Replaced /.test(w.note.text), w.note.text);
  key(w, "alt-z", { modifiers: { alt: true } });
  await quiet(w);
  same("after undo");
  key(w, "escape");
  assert(host.closed.includes("o31"), "then Esc closes it");
  await w.close();
  passed("a new window opens to search (the new text kept), Ctrl-R gives ripgrep's JSON; Esc waits for a replace");

  // 22. Closing removes the replace's folder: nothing left behind.
  assert(v.rdir && existsSync(v.rdir), "the big files' plans and copies were in the replace's folder");
  const rdir = v.rdir;
  await v.close();
  await sleep(1500);
  assert(!existsSync(rdir), "removed on close");
  assert.deepEqual(leftovers().filter(f => !before.has(f)), [], "nothing left behind");
  passed("closing the window removes the replace's folder; nothing left behind");
} finally {
  // Even when a check failed: close every window (stopping its run), then
  // remove what this run made.
  for (const v of opened) await v.close().catch(() => null);
  await sleep(1500);
  for (const f of leftovers().filter(f => !before.has(f))) rmSync(`${TMP}/${f}`, { recursive: true, force: true });
  if (fake) rmSync(fake, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
}
console.log(`all ${n} end-to-end checks passed`);
