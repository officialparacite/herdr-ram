// RAM layout checks. Static fixtures only: reads the RAM files, starts no
// Herdr, core, network or browser, and writes nothing.
//   node tests/verify.mjs                                   this package's files
//   RAM_HOME=~/.config/herdr-app node tests/verify.mjs      an installed copy whose
//                                                           keys.json is this one's
// (the hints they check come from keys.json: a home with direct keys of its own,
// e.g. Herdr's default ctrl-, for Settings, shows those instead).
// Besides RAM it checks the ^b key bar (mods/prefix), ^b w's navigate mode and
// the ⌘+/⌘- mods (text-bigger, text-smaller). Where the home also has the
// Traveler or Night City layout, it checks their navigate marks too.
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const home = process.env.RAM_HOME ? new URL(`file://${process.env.RAM_HOME.replace(/\/$/, "")}/`) : new URL("../", import.meta.url);
const read = path => readFile(new URL(path, home), "utf8");
const has = path => access(new URL(path, home)).then(() => true, () => false);
// The key bar and the text-size mods are prefix, text-bigger and text-smaller in the
// owner's own setup (the private branch), and ram-prefix, ram-text-bigger and
// ram-text-smaller in the package others install (main), so they can't clash with
// another layout's mods.
const BAR = (await has("mods/ram-prefix/main.js")) ? "ram-prefix" : "prefix";
const [BIG, SMALL] = BAR === "ram-prefix" ? ["ram-text-bigger", "ram-text-smaller"] : ["text-bigger", "text-smaller"];
// The package itself (it has a RECIPE.md), not a Herdr home it was installed in.
const PACKAGE = await has("RECIPE.md");
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const walk = n => [n, ...(n.children ?? []).flatMap(walk)];

// ---- Layout -----------------------------------------------------------------
const layout = JSON.parse(await read("layouts/ram.json"));
const nodes = walk(layout), byId = id => nodes.find(n => n.id === id);
assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length, "ids are unique");
assert.deepEqual(nodes.map(n => n.id), ["ram-root", "ram-map", "ram-work", "sidebar", "ram-main", "ram-terminals", "ram-rams", "ram-peek"]);
assert.equal(layout.theme, "ram");
assert.equal(layout.titlebar, "none");
assert.equal(layout.preview, "layouts/ram.svg");
assert((await read("layouts/ram.svg")).includes("<svg"));
assert.deepEqual([byId("ram-map").content, byId("ram-map").size, byId("ram-map").window_drag], [{ mod: "ram" }, { px: 74 }, true]);
assert.deepEqual([byId("sidebar").content, byId("sidebar").size], [{ mod: "ram", props: { role: "side" } }, { px: 340 }]);
// The side column's edge drags (the ram-work row's gap is the handle), down to 240 px;
// nothing else does.
assert.deepEqual([byId("ram-work").resizable, byId("sidebar").min], [true, 240]);
assert(byId("ram-root").resizable === false && byId("ram-main").resizable === false, "only the side column's edge drags");
const prefixKeys = JSON.parse(await read("keys.json"))[`mod:${BAR}`];
assert.equal(prefixKeys.b, `${BAR}.layout.toggle:sidebar`, "ctrl-b b toggles the node RAM calls sidebar");
// The bar's name, its folder, RAM's name for it and its keys agree.
assert((await read(`mods/${BAR}/main.js`)).includes(`const NAME = "${BAR}";`), "the bar knows its own name");
assert((await read("mods/ram/ui.js")).includes(`export const BAR = "${BAR}";`), "RAM looks up the bar's keys by that name");
assert(Object.values(prefixKeys).every(a => a.startsWith(`${BAR}.`)), "every second key is one of the bar's");
if (PACKAGE && BAR === "ram-prefix") assert.deepEqual(Object.keys(JSON.parse(await read("keys.json"))).sort(), ["global", `mod:${BAR}`],
  "the package's keys are only the ones RAM needs: no terminal keys of the owner's");
assert.deepEqual([byId("ram-peek").content, byId("ram-peek").size, byId("ram-peek").hidden], [{ mod: "ram", props: { role: "peek" } }, { px: 180 }, true]);
// meta: the space sticks under the terminal, which keeps 2/3 of the column. At
// its least the block still holds a stick's least height and the padding around it.
assert.deepEqual([byId("ram-rams").content, byId("ram-rams").size, byId("ram-rams").hidden], [{ mod: "ram", props: { role: "rams" } }, { weight: 1 }, true]);
assert(byId("ram-rams").min >= (110 + 24) * 1.25, `ram-rams min ${byId("ram-rams").min}`);
assert.deepEqual(byId("ram-terminals").size, { weight: 2 });
assert.equal(byId("ram-terminals").content.tab, "active");
assert.equal(byId("ram-terminals").content.pane.header, undefined, "no pane header bar");
const themeFile = JSON.parse(await read("themes/ram.json"));
assert.equal(byId("ram-terminals").content.pane.border.color, themeFile.colors.border);
assert.equal(byId("ram-terminals").content.pane.focus.color, themeFile.colors.accent);
if (await has("layouts/night-city.json")) {
  const city = JSON.parse(await read("layouts/night-city.json"));
  assert(walk(city).filter(n => n.content?.mod).every(n => n.content.mod === "night-city"));
}
console.log("PASS: layout: strip, side column, terminals over a hidden block of space sticks and a hidden peek strip; Night City untouched");

// ---- Fixtures -----------------------------------------------------------------
const modelURL = url(await read("mods/ram/model.js"));
const { scene } = await import(modelURL);
const now = Date.now();
const program = { name: "Claude", icon: null, tint: true, color: "#f1cf83" };
const spaces = ["api", "web", "ops", "docs"].map((name, i) => ({ id: `s${i}`, name, index: i + 1,
  machine: i === 2 ? "remote" : null, active: i === 0, folder: "",
  tabs: [0, 1].map(j => ({ id: `tab${i}-${j}`, name: String(j + 1), named: false, index: j + 1,
    active: j === 0, settled: false, status: null })) }));
const states = ["working", "blocked", "done", "idle", "working", "blocked", "idle", "working", "idle", "working"];
const agentList = states.map((status, i) => {
  const space = spaces[i % spaces.length], tab = space.tabs[i === 1 ? 1 : 0];
  return { address: `${space.machine ? "remote/" : ""}t${i + 1}`, pane: `p${i}`, space: space.id,
    space_name: space.name, tab: tab.id, tab_name: tab.name, tab_index: tab.index,
    status, title: `demo task ${i + 1}`, program, focused: i === 0 };
});
Object.assign(agentList[1], { space: "s0", space_name: "api", tab: "tab0-1", tab_name: "2", tab_index: 2 });
const panes = agentList.map(a => ({ pane: a.pane, terminal: a.address, tab: a.tab, title: a.title,
  status: a.status, program: a.program, focused: true, cwd: null }));
panes.push({ pane: "shell-pane", terminal: "shell", tab: "tab0-0", title: "zsh", status: null, focused: false, program: { name: "zsh" } });
const raw = agentList.map((a, i) => ({ address: a.address, status: a.status, state: "live", status_ms: now - i * 1000, created_ms: 1000 + i, labels: {} }));
raw.push({ address: "child", parent: "t1", state: "live", status: "error", title: "review", status_ms: now, created_ms: 5000, program, labels: {} },
  { address: "shell", state: "live", created_ms: 1, labels: {} });
const data = scene(spaces, panes, agentList, raw);
assert.equal(data.blockers.length, 3);

// ---- Element recorder -----------------------------------------------------------
const keysFile = JSON.parse(await read("keys.json"));
const keyList = Object.entries(keysFile).flatMap(([section, m]) =>
  typeof m === "object" && m ? Object.entries(m).map(([keys, action]) => ({ section, keys, action: String(action) })) : []);
const colors = { background: themeFile.background, foreground: themeFile.foreground, ...themeFile.colors,
  ...Object.fromEntries(themeFile.ansi.map((c, i) => [`ansi${i}`, c])) };
const host = globalThis.__ramFixture = { props: {}, spaces, panes, agents: agentList, raw, colors, keys: keyList,
  shared: new Map(), calls: [], overlays: [], execs: [], hcs: [], notes: [], active: true, platform: "macos",
  buttons: false, timers: [], storage: new Map() };
globalThis.localStorage = { getItem: k => host.storage.get(k) ?? null, setItem: (k, v) => host.storage.set(k, v) };
const stub = url(`
  const host = globalThis.__ramFixture;
  export class View {}
  function node(kind) {
    const o = { kind, kids: [], ops: [], handlers: {} };
    const p = new Proxy(o, { get(o, key) {
      if (key in o) return o[key];
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
  export const div = () => node("div"), svg = x => node("svg").child(x), image = x => node("image").child(x);
  export const h_flex = () => node("h_flex"), v_flex = () => node("v_flex");
  // A scroll position: the rows a test asked it to reveal (host.scrolls).
  export const ScrollHandle = { new: () => ({ scroll_to_item(i) { (host.scrolls ??= []).push(i); }, release: () => true }) };
  // A virtual list draws every row here, so the tests see them all.
  export const v_virtual_list = (id, count, sizes, key, render) => {
    const n = node("v_flex"); n.ops.push(["id", id], ["virtual", count, sizes]);
    n.kids.push(...render({ start: 0, end: count }, null)); return n;
  };
  // An input's text, as a test sets it (host.inputs[placeholder]).
  export const InputState = { new: (opts = {}) => {
    const state = { opts, value: opts.value ?? "", handlers: {},
      on(ev, fn) { this.handlers[ev] = fn; return true; }, set_value(v) { this.value = v; }, focus() { this.focused = true; } };
    state.value = () => state._v ?? ""; state.set_value = v => { state._v = v; };
    (host.inputs ??= []).push(state); return state; } };
  export const Input = { new: state => node("input").child(state.opts.placeholder ?? "") };
  export const readTextFile = async (path, opts) => { (host.reads ??= []).push({ path, opts });
    if (host.files?.[path] !== undefined) return host.files[path]; throw new Error("no such file"); };
  export const appHome = () => "/home/tester/.config/herdr-app";
  // As Herdr's: writes only if the file still matches EXPECTED. host.staleOnce changes the file
  // under it once (someone else wrote it meanwhile).
  export const writeTextFile = async (path, text, expected) => {
    if (host.staleOnce !== undefined) { host.files[path] = host.staleOnce; host.staleOnce = undefined; }
    if ((host.files?.[path] ?? null) !== expected) throw new Error("stale snapshot");
    (host.writes ??= []).push({ path, text }); (host.files ??= {})[path] = text; return null; };
  export const spaces = () => host.spaces, panes = () => host.panes, agents = () => host.agents, terminals = () => host.raw;
  export const props = () => host.props;
  export const theme = () => host.colors;
  export const settings = () => ({ zoom: 1, font_family: "JetBrains Mono" });
  export const keys = () => host.keys;
  export const machines = () => [];
  export const watchFolder = () => new Promise(() => {});
  // Each copy's command loop waits here; a test resolves the last one to send it a command.
  export const nextCommand = () => new Promise(r => (host.waiting ??= []).push(r));
  export const shared = k => host.shared.get(k), setShared = (k, v) => host.shared.set(k, v);
  export const setAgentOrder = x => host.order = x;
  export const window = () => ({ active: host.active, platform: host.platform, buttons: host.buttons });
  // layout(): the live layout tree (host.layout); layout.resize, show, hide and
  // toggle change it, as Herdr does, unless host.layoutLag holds it back.
  export const layout = () => host.layout ?? null;
  const findNode = (n, id) => n?.id === id ? n : (n?.children ?? []).map(c => findNode(c, id)).find(Boolean) ?? null;
  const LAYOUT_CMDS = ["layout.resize", "layout.show", "layout.hide", "layout.toggle"];
  // host.events: runs and overlay closes in the order they happened.
  export const run = (name, args) => { host.calls.push({ name, args }); (host.events ??= []).push("run " + name);
    const n = LAYOUT_CMDS.includes(name) && host.layout && !host.layoutLag ? findNode(host.layout, args.id) : null;
    if (n && name === "layout.resize") n.size = args.px !== undefined ? { px: args.px } : { weight: args.weight };
    else if (n) n.hidden = name === "layout.hide" || (name === "layout.toggle" && n.hidden !== true); };
  export const openOverlay = spec => { host.overlays.push(spec); return "o" + host.overlays.length; };
  export const notify = n => host.notes.push(n);
  export const closeOverlay = id => { (host.closed ??= []).push(id); (host.events ??= []).push("close " + id); }, commands = () => [], focused = () => host.focused ?? null, home = () => "/home/tester";
  export const hc = async args => { host.hcs.push(args);
    if (args[0] === "read" && host.readOut != null) return { code: 0, stdout: host.readOut };
    if (args[0] === "machine") return { code: 0, stdout: JSON.stringify({ machines: host.machines ?? [] }) };
    return args[0] === "read" ? { code: 0, stdout: "\\x1b[32mone\\x1b[0m\\ntwo   \\n\\n" } : { code: 0, stdout: "" }; };
  export const exec = async (command, args, opts) => { host.execs.push({ command, args, opts });
    // A test's own answers first (host.execHook returns one, or nothing for the rest).
    const hooked = host.execHook && host.execHook(command, args, opts);
    if (hooked) return hooked;
    if (command === "herdr-app") return { code: 0, stdout: JSON.stringify({ space: "s0", tab: "tabNEW", terminal: "tNEW" }), stderr: "" };
    // hunk: the live sessions (host.hunkSessions), and whether a repo has saved notes.
    if (command === "hunk" && args[0] === "session") return { code: 0, stdout: JSON.stringify({ sessions: host.hunkSessions ?? [] }), stderr: "" };
    if (command === "test") return { code: host.notesFile ? 0 : 1, stdout: "", stderr: "" };
    // A scripted repo per folder (host.repoOut[cwd]), for git.js's parsing.
    const fake = command === "git" && host.repoOut?.[opts?.cwd];
    if (fake) {
      if (args.includes("status")) return { code: 0, stdout: fake.status, stderr: "" };
      if (args.includes("--git-common-dir")) return { code: 0, stdout: fake.common + "\\n", stderr: "" };
      if (args.includes("--show-toplevel")) return { code: 0, stdout: fake.top + "\\n", stderr: "" };
      if (args.includes("--numstat")) { (host.numstats ??= []).push(args); return { code: 0, stdout: fake.numstat, stderr: "" }; }
    }
    // The main stick's diff and commit box.
    if (command === "git" && args.includes("diff") && args.includes("--")) return { code: 0, stdout: host.diffText ?? "", stderr: "" };
    if (command === "git" && (args[0] === "add" || args[0] === "commit")) return { code: host.commitCode ?? 0, stdout: "", stderr: host.commitErr ?? "" };
    // LANG's read: a repo's tree from host.lsTree (none: no commit yet).
    if (command === "git" && args.includes("ls-tree"))
      return host.lsTree ? { code: 0, stdout: host.lsTree, stderr: "" } : { code: 128, stdout: "", stderr: "fatal: Not a valid object name HEAD" };
    // Folders under /repo/<name> are in that repo, for the key bar's lazygit and search outside RAM.
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel" && opts?.cwd?.startsWith("/repo/"))
      return { code: 0, stdout: opts.cwd.split("/").slice(0, 3).join("/") + "\\n", stderr: "" };
    return { code: 1, stdout: "", stderr: "fatal: not a git repository" }; };
`);
const swap = src => src.replaceAll('"gpui-kit"', JSON.stringify(stub)).replaceAll('"gpui-base"', JSON.stringify(stub)).replaceAll('"herdr"', JSON.stringify(stub));
// A mod file as a data: URL, its herdr/gpui imports swapped for the stub and its
// own ./x.js imports for theirs (loaded the same way, once each).
const loaded = new Map();
async function load(path) {
  if (loaded.has(path)) return loaded.get(path);
  let src = swap(await read(path));
  const dir = path.replace(/[^/]*$/, "");
  for (const [, rel] of src.matchAll(/from "\.\/([a-z]+\.js)"/g))
    src = src.replaceAll(`"./${rel}"`, JSON.stringify(await load(`${dir}${rel}`)));
  assert(!/from "(?:herdr|gpui-kit|gpui-base|\.\/[a-z]+\.js)"/.test(src), `every import swapped in ${path}`);
  const u = url(src);
  loaded.set(path, u);
  return u;
}
const gitURL = await load("mods/ram/git.js");
const { default: Ram, LEVELS, level, sideWidth, sideHidden, sticksShown, fitBlocks } = await import(await load("mods/ram/main.js"));
const S = await import(await load("mods/ram/search.js"));
// Spawned tasks run at once; settle() lets their awaits finish. (Some never end,
// like the command loop waiting on nextCommand, so they can't be awaited.)
// A focus handle has the keyboard while host.keyboard is it (focus() gives it).
const cx = { timer: { every: (ms, fn) => host.timers.push({ ms, fn }), after: () => {} }, notify() {},
  spawn: fn => fn(cx), stop_propagation() { host.stopped = true; },
  // Key bindings a view installs (cx.bind_keys), and the clipboard.
  bind_keys(list) { (host.bindings ??= []).push(...list); return list.length; },
  write_to_clipboard(text) { host.clipboard = text; }, read_from_clipboard() { return host.clipboard; },
  focus_handle() { const h = { focus() { host.keyboard = h; }, is_focused: () => host.keyboard === h, release: () => true }; return h; } };
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };
const flatten = tree => typeof tree === "object" && tree ? [tree, ...tree.kids.flatMap(flatten)] : [];
const idOf = n => n?.ops?.find(([key]) => key === "id")?.[1];
const withId = (tree, id) => flatten(tree).find(n => idOf(n) === id);
const op = (n, key) => n?.ops.find(([k]) => k === key)?.slice(1);
const motions = tree => flatten(tree).flatMap(n => n.ops.filter(([key]) => ["loop", "frames", "transition", "spin"].includes(key)));
const textOf = tree => flatten(tree).flatMap(n => n.kids.filter(k => typeof k === "string"));
const click = (tree, id) => { const n = withId(tree, id); assert(n, `no ${id}`); (n.handlers["on_click"])({}, cx); };
const view = (role = {}) => { host.props = role; const v = new Ram(); v.init({}, cx); return v; };
const layoutCalls = () => host.calls.filter(c => c.name.startsWith("layout."));
// props() is one value in this fixture, so set each copy's own before it renders.
const R = (v, role) => { host.props = role; return v.render(cx); };
// A part's width as drawn, the least it takes: its w (or size), 0 for a flex_1 part (it takes
// what's left), else its parts side by side (an h_flex adds them up with its gaps) or the
// widest, plus padding and borders, capped by max_w. Text: 0.6 em a character (the fonts are
// monospace), at the text_size it inherits. Absolute parts take no room.
const widthOf = (n, size = 12) => {
  if (typeof n === "string") return [...n].length * size * 0.6;
  if (typeof n !== "object" || !n) return 0;
  const own = op(n, "text_size")?.[0] ?? size;
  const fixed = op(n, "w")?.[0] ?? op(n, "size")?.[0];
  if (fixed !== undefined) return fixed;
  if (op(n, "flex_1")) return op(n, "min_w")?.[0] ?? 0;
  const kids = n.kids.filter(k => typeof k === "string" || (typeof k === "object" && k && !op(k, "absolute")));
  const sizes = kids.map(k => widthOf(k, own));
  const inner = n.kind === "h_flex" ? sizes.reduce((a, b) => a + b, 0) + (op(n, "gap")?.[0] ?? 0) * Math.max(0, kids.length - 1)
    : Math.max(0, ...sizes);
  const total = inner + 2 * (op(n, "px")?.[0] ?? 0) + 2 * (op(n, "border")?.[0] ?? 0);
  const max = op(n, "max_w")?.[0];
  return max !== undefined ? Math.min(max, total) : total;
};
// A part's height as drawn: its h, else its rows (a v_flex adds them up), its padding and borders.
const heightOf = n => {
  if (typeof n !== "object" || !n) return 0;
  const h = op(n, "h")?.[0];
  if (h !== undefined) return h;
  const kids = n.kids.filter(k => typeof k === "object" && k), sizes = kids.map(heightOf);
  const inner = n.kind === "v_flex" ? sizes.reduce((a, b) => a + b, 0) + (op(n, "gap")?.[0] ?? 0) * Math.max(0, kids.length - 1)
    : Math.max(0, ...sizes);
  const border = (op(n, "border_t")?.[0] ?? 0) + (op(n, "border_b")?.[0] ?? 0) + 2 * (op(n, "border")?.[0] ?? 0);
  return Math.max(op(n, "min_h")?.[0] ?? 0, inner + 2 * (op(n, "py")?.[0] ?? 0) + border);
};

// ---- Levels -------------------------------------------------------------------
assert.deepEqual(LEVELS, { meta: { map: { px: 74 }, side: 390, rams: true }, space: { map: { px: 74 }, side: 340, rams: false } },
  "two levels: meta (SP) and the space level (BP)");
assert.equal(level(), "space");
const map = view({});
assert.deepEqual(host.timers.map(t => t.ms), [250, 250, 1000, 2000, 1000],
  "git, the side column's edge, the commands in HEAP and their last lines, hunk's sessions");
map.size = { width: 1600, height: 58 };
let tree = R(map, {});
await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.resize", args: { id: "ram-map", px: 74 } },
  { name: "layout.resize", args: { id: "sidebar", px: 340 } }, { name: "layout.hide", args: { id: "ram-rams" } },
  { name: "layout.hide", args: { id: "ram-peek" } }], "no SP yet: nothing for the peek strip");
host.calls = [];
R(map, {});
await settle();
assert.equal(layoutCalls().length, 0, "sizes are set once per level");
assert.deepEqual([host.shared.get("ram.bp"), host.shared.get("ram.frame")], [{ s0: "tab0-0" }, "s0"],
  "the space level's tab is its space's BP, and that space is the one you work in");
assert.equal(host.shared.get("ram.sp"), undefined, "SP is meta's: it hasn't shown yet");
console.log("PASS: levels: meta and space, space by default; the map copy sizes the layout once per level; the space level keeps each space's BP");

// ---- The strip (space level): the current space's tabs ------------------------------
assert.deepEqual(textOf(withId(tree, "ram-strip-space")), ["0x01", "api"], "the strip starts with the space it shows");
for (const tb of spaces[0].tabs) assert(withId(tree, `tabchip-${tb.id}`), tb.id);
assert(!withId(tree, "tabchip-tab1-0"), "only the current space's tabs");
assert.deepEqual(op(withId(tree, "tabchip-tab0-0"), "border_color"), ["#ffb547"], "the shown tab is amber");
assert.equal(textOf(withId(tree, "tabchip-tab0-0"))[0], "*1", "the shown tab is dereferenced: *1");
assert.equal(textOf(withId(tree, "tabchip-tab0-1"))[0], "&2", "the others are references: &2");
assert(textOf(withId(tree, "tabchip-tab0-1")).includes("!1"), "&2 has the agent that needs you: !1");
assert(!flatten(tree).some(n => /^tab-close-/.test(idOf(n) ?? "")), "no - any more: each tab has its own x");
const plus = withId(tree, "tab-new-s0");
assert(plus, "one + pushes a tab");
assert.equal(op(plus, "w")[0], op(plus, "h")[0], "+ is a square");
assert.equal(op(plus, "h")[0], 23 * 1.25, "+ is as tall as the tab chips");
assert(spaces[0].tabs.every(tb => op(withId(tree, `tabchip-${tb.id}`), "h")[0] === 23 * 1.25), "the chips are 23 px tall");
assert(textOf(tree).includes("0x0000"));
assert(flatten(tree).some(n => op(n, "pl")?.[0] === 100), "100 points of room for the traffic lights");
assert(spaces[0].tabs.every(tb => op(withId(tree, `tabchip-${tb.id}`), "w")[0] === 118 * 1.25), "every tab chip is one fixed size");
assert(op(withId(tree, "tabchip-tab0-0").kids[1], "truncate"), "a long tab name truncates (the tooltip has it all)");
// Each tab's x: room kept on every chip, shown only while the pointer is on that tab.
const HIDDEN = ["#00000000"];
assert.deepEqual(op(withId(tree, "tabx-tab0-1"), "text_color"), HIDDEN, "the x hides until the pointer is on the tab");
host.calls = []; host.stopped = false;
click(tree, "tabx-tab0-1");
assert.deepEqual(host.calls, [], "a hidden x closes nothing");
assert(!host.stopped, "hidden, its spot is part of the chip (the click shows the tab)");
withId(tree, "tabchip-tab0-1").handlers.on_hover(true, cx);
tree = R(map, {});
assert.notDeepEqual(op(withId(tree, "tabx-tab0-1"), "text_color"), HIDDEN, "on the tab, its x shows");
assert.deepEqual(op(withId(tree, "tabx-tab0-0"), "text_color"), HIDDEN, "only that tab's");
assert.deepEqual(op(withId(tree, "tabx-tab0-1"), "size"), [15 * 1.25]);
click(tree, "tabx-tab0-1");
assert.deepEqual(host.calls, [{ name: "tab.close", args: { id: "tab0-1" } }], "the x closes that tab");
assert(!host.overlays.some(o => o.mod === "confirm"), "at once: Herdr asks first only for a space's last tab");
assert(host.stopped, "and the click stays off the chip (it doesn't select the tab)");
withId(tree, "tabchip-tab0-1").handlers.on_hover(false, cx);
tree = R(map, {});
assert.deepEqual(op(withId(tree, "tabx-tab0-1"), "text_color"), HIDDEN, "the pointer leaves: hidden again");
host.calls = [];
click(tree, "tabchip-tab0-1");
assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab0-1" } }], "a tab chip shows that tab");
withId(tree, "tabchip-tab0-1").handlers["on_mouse_down:left"]({ click_count: 2 }, cx);
assert.deepEqual(host.calls.at(-1), { name: "tab.rename", args: { id: "tab0-1" } }, "a double-click renames it");
// The levels, top right: ^b, then each level's key (keys.json), its name and its
// pointer's mark (meta SP▸ in amber, space BP▸ in white); then b (the side column)
// and P (the peek strip), lit while they show.
const levels = textOf(withId(tree, "ram-levels"));
assert.deepEqual(levels, ["^b", "m", "meta", "SP\u25b8", "i", "space", "BP\u25b8", "b", "P"], levels);
assert.deepEqual(op(withId(tree, "ram-level-space"), "border_color"), ["#ffb547"], "the current level is lit");
assert.deepEqual(["meta", "space"].map(l => op(withId(tree, `ram-level-${l}`), "w")[0]), [100 * 1.25, 100 * 1.25], "two buttons, one size");
assert(!withId(tree, "ram-level-hunk"), "no hunk level: HUNK is a bar in the space level's column");
{
  const markColor = (id, mark) => op(flatten(withId(tree, id)).find(n => n.kids.includes(mark)), "text_color")[0];
  assert.deepEqual([markColor("ram-level-meta", "SP\u25b8"), markColor("ram-level-space", "BP\u25b8")], ["#ffb547", "#ffffff"], "SP amber, BP white");
  for (const id of ["ram-sidebar", "ram-peek-toggle"]) {
    assert.deepEqual(op(withId(tree, id), "size"), [26 * 1.25], `${id}: a square as tall as the buttons`);
    assert.deepEqual(op(withId(tree, id), "border_color"), ["#ffb547"], `${id}: lit, it shows`);
  }
  assert.equal(op(withId(tree, "ram-sidebar"), "tooltip")[0], "Hide the side column in the space level  ^b b");
  assert(op(withId(tree, "ram-peek-toggle"), "tooltip")[0].startsWith("Hide the peek strip in the space level (SP's tab") && op(withId(tree, "ram-peek-toggle"), "tooltip")[0].endsWith("  ^b P"));
  host.calls = [];
  click(tree, "ram-sidebar");
  assert.deepEqual(host.calls, [{ name: "layout.toggle", args: { id: "sidebar" } }], "b: the side column, as ^b b");
  host.layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "block", hidden: true }] };
  assert.notDeepEqual(op(withId(R(map, {}), "ram-sidebar"), "border_color"), ["#ffb547"], "hidden: not lit");
  host.layout = null;
  host.shared.delete("ram.side.hidden");
  click(tree, "ram-peek-toggle");
  assert.equal(host.shared.get("ram.peek"), false, "P: the peek strip off");
  assert.equal(host.shared.get("ram.sticks"), undefined, "(meta's sticks are meta's)");
  assert.notDeepEqual(op(withId(R(map, {}), "ram-peek-toggle"), "border_color"), ["#ffb547"], "off: not lit");
  assert(op(withId(R(map, {}), "ram-peek-toggle"), "tooltip")[0].startsWith("Show the peek strip in the space level"));
  click(R(map, {}), "ram-peek-toggle");
  assert.equal(host.shared.get("ram.peek"), true, "and on again");
  host.shared.delete("ram.peek");
}
assert(!withId(tree, "ram-close"));
host.platform = "linux"; host.buttons = true;
assert(withId(R(map, {}), "ram-close"));
host.platform = "macos"; host.buttons = false;
click(tree, "ram-level-meta");
assert.equal(host.shared.get("ram.zoom"), "meta");
assert.equal(level(), "meta");
console.log("PASS: strip: the space's tabs as small fixed chips (*n shown, &n the rest, !n faults), click shows, double-click renames, a hover x closes; one square +; ^b, the two levels with SP\u25b8 and BP\u25b8, b and P");

// ---- meta: the strip on top, the space sticks under the terminal --------------------------
host.calls = [];
map.size = { width: 1600, height: 58 };
tree = R(map, {});
await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.resize", args: { id: "ram-map", px: 74 } },
  { name: "layout.resize", args: { id: "sidebar", px: 390 } }, { name: "layout.show", args: { id: "ram-rams" } }],
  "(the peek strip stays hidden: meta has none)");
// In meta, b and P are meta's: its side column, and the sticks under its terminal.
assert.equal(op(withId(tree, "ram-sidebar"), "tooltip")[0], "Hide the side column in meta  ^b b");
assert.equal(op(withId(tree, "ram-peek-toggle"), "tooltip")[0], "Hide the sticks in meta  ^b P");
assert.equal(sticksShown(), true, "meta shows its sticks");
assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-0", pane: null }, "meta's first show: SP is the tab it shows");
assert(withId(tree, "ram-strip") && withId(tree, "tabchip-tab0-0"), "the strip stays on top: the space's tabs");
assert(!withId(tree, "ram-follow"), "follow isn't on the strip: its f is under the sticks' +");
assert(!flatten(tree).some(n => /^region-/.test(idOf(n) ?? "")), "the space sticks aren't on the strip");
assert.deepEqual(op(withId(tree, "ram-level-meta"), "border_color"), ["#ffb547"], "meta is lit");
// The space sticks are a copy of their own (role rams), in the block under the terminal.
let timersBefore = host.timers.length;
const rams = view({ role: "rams" });
assert.deepEqual(host.timers.slice(timersBefore).map(t => t.ms), [250, 10000, 2000], "its git, the exit history, its commands' last lines");
rams.size = { width: 1400, height: 340 };
const RR = () => R(rams, { role: "rams" });
tree = RR();
for (const s of spaces) assert(withId(tree, `region-${s.id}`) && withId(tree, `head-${s.id}`), s.id);
assert.equal(op(withId(tree, "region-s0"), "h")[0], 340 - 24 * 1.25, "the sticks are as tall as their block");
const widths = spaces.map(s => op(withId(tree, `region-${s.id}`), "w")[0]);
assert(widths.reduce((n, w) => n + w, 0) <= 1400, `the sticks fit the block: ${widths}`);
assert.equal(new Set(widths).size, 1, `every stick one width: ${widths}`);
for (const id of ["frame-tab0-0", "frame-tab0-1", "alloc-t1", "alloc-t2", "alloc-child", "block-t1", "block-child", "ram-scan", "ram-new-space"])
  assert(withId(tree, id), id);
// Right of the last stick: + (a new space), then follow's f and the e switch, squares of one size.
assert.equal(idOf(withId(tree, "ram-regions").kids.at(-1)), "ram-stick-buttons", "after the last stick");
assert.deepEqual(withId(tree, "ram-stick-buttons").kids.map(idOf), ["ram-new-space", "ram-follow", "ram-enter"], "f and e under the +");
assert.equal(withId(tree, "ram-stick-buttons").kind, "v_flex", "one over the other");
for (const id of ["ram-new-space", "ram-follow", "ram-enter"])
  assert.deepEqual([op(withId(tree, id), "w")[0], op(withId(tree, id), "h")[0]], [30 * 1.25, 30 * 1.25], `${id} is a square`);
assert.deepEqual([textOf(withId(tree, "ram-follow")), textOf(withId(tree, "ram-enter"))], [["f"], ["e"]], "just their keys");
// *1 of api has five blocks (t1, its sub-agent, t5, t9 and a shell): the first two fit, +3 counts the rest.
assert.deepEqual(textOf(withId(tree, "more-tab0-0")), ["+3"]);
assert.equal(op(withId(tree, "more-tab0-0"), "tooltip")[0], "3 more: Claude, Claude, zsh");
assert(!withId(tree, "block-shell"), "the shell is in the +3, not cut off at the stick's edge");
// A frame shows its tab's x while the pointer is on it.
assert(!flatten(tree).some(n => /^framex-/.test(idOf(n) ?? "")), "no x until the pointer is on a frame");
withId(tree, "frame-tab0-1").handlers.on_hover(true, cx);
tree = RR();
assert.deepEqual(op(withId(tree, "framex-tab0-1"), "size"), [(18 - 2) * 1.25]);
assert(!withId(tree, "framex-tab0-0"), "only on that frame");
host.calls = [];
click(tree, "framex-tab0-1");
assert.deepEqual(host.calls, [{ name: "tab.close", args: { id: "tab0-1" } }], "a frame's x closes its tab");
withId(tree, "frame-tab0-1").handlers.on_hover(false, cx);
tree = RR();
assert(!withId(tree, "framex-tab0-1"), "the pointer leaves: gone");
const text = textOf(tree);
for (const want of ["STACK \u2193  2", "HEAP \u2191  5", "*1", "&2", "@remote", "FAULT 2"]) assert(text.includes(want), want);
// The pointers: one SP in all the sticks (the tab meta shows, api *1) and a BP on each
// stick's work tab, white for the space you work in (api) and dim for the others. api's
// *1 is both: S (amber) B (white) \u25b8.
{
  const ptr = id => textOf(withId(tree, `ptr-${id}`));
  const colorOf = (id, mark) => op(flatten(withId(tree, `ptr-${id}`)).find(n => n.kids.includes(mark)), "text_color")[0];
  assert.deepEqual(ptr("tab0-0"), ["S", "B", "\u25b8"], "api *1: SP and api's BP");
  assert.deepEqual([colorOf("tab0-0", "S"), colorOf("tab0-0", "B"), colorOf("tab0-0", "\u25b8")], ["#ffb547", "#ffffff", "#ffb547"]);
  for (const id of ["tab1-0", "tab2-0", "tab3-0"]) {
    assert.deepEqual(ptr(id), ["BP\u25b8"], `${id}: its space's BP (the tab it shows, until you pick one)`);
    assert.equal(colorOf(id, "BP\u25b8"), host.colors.dim, `${id}: dim, not the space you work in`);
  }
  for (const id of ["tab0-1", "tab1-1", "tab2-1", "tab3-1"]) assert.deepEqual(ptr(id), [], `${id}: no pointer`);
  assert.equal(text.filter(x => x === "SP\u25b8" || x === "S").length, 1, "one SP");
  assert(op(withId(tree, "ptr-tab0-0"), "tooltip")[0].startsWith("SP and BP: the tab meta shows"), "SP's mark says what it is");
  assert(op(withId(tree, "ptr-tab0-0"), "tooltip")[0].endsWith("click: BP here (^b I)"), "and that a click moves the BP there");
  assert.equal(op(withId(tree, "ptr-tab1-0"), "tooltip")[0], "BP: web's work tab");
  assert(withId(tree, "ptr-tab0-0").ops.some(([k, prop]) => k === "loop" && prop === "opacity"), "SP's mark breathes");
}
// Each frame's arrow from &n to its blocks: a line, then the drawn head (mods/ram/arrow.svg),
// centered together on the row so they meet. Before, a "\u203a" glyph placed by hand sat
// off the line and looked wrong.
assert(!text.includes("\u203a"), "no hand-placed \u203a head");
{
  const frames = flatten(tree).filter(n => /^frame-/.test(idOf(n) ?? ""));
  assert(frames.length >= 5, `${frames.length} frames`);
  for (const row of frames) {
    const arrow = row.kids.find(k => typeof k === "object" && k.kids.some(c => typeof c === "object" && c.kind === "svg"));
    assert(arrow, `${idOf(row)} has an arrow`);
    const [line, head] = arrow.kids.filter(c => typeof c === "object" && !op(c, "absolute"));
    assert(op(arrow, "items_center") && op(line, "flex_1") && op(head, "flex_none"), `${idOf(row)}: line then head, centered on the row`);
    assert.deepEqual([head.kind, head.kids[0], op(head, "w"), op(head, "h")], ["svg", "mods/ram/arrow.svg", [5 * 1.25], [8 * 1.25]]);
    assert.deepEqual(op(line, "h"), [1.25], "a line as thick as the head's stroke (1 of its 5x8 units)");
    assert.equal(op(line, "bg")[0], op(head, "text_color")[0], "one color");
    assert.equal(op(arrow, "w")[0] >= 12 * 1.25, true, "at least ARROW_MIN: the head and some line");
  }
  // A working tab's green dot rides on the line (the line's middle is the row's: FRAME_H / 2).
  const running = frames.map(r => r.kids.find(k => typeof k === "object" && k.kids.some(c => typeof c === "object" && c.kind === "svg")))
    .map(a => a.kids.find(c => typeof c === "object" && op(c, "absolute") && c.ops.some(([k, prop]) => k === "loop" && prop === "left")))
    .filter(Boolean);
  assert(running.length > 0, "a working tab's dot");
  for (const dot of running) assert.deepEqual([op(dot, "top")[0] + op(dot, "size")[0] / 2], [18 * 1.25 / 2], "the dot is centered on the line");
  const asset = await read("mods/ram/arrow.svg");
  assert(/viewBox="0 0 5 8"/.test(asset) && /stroke-width="1"/.test(asset) && /stroke="currentColor"/.test(asset), "the head: 5x8 units, 1 thick, tinted");
  assert(/M0 4H4\.3/.test(asset), "its own short line runs on from the div's to the tip, at the middle (y 4 of 8)");
}
assert(!text.some(x => /^#\d+$/.test(x)), "tabs read as &n / *n, not #n");
// In a stick, an agent's row starts with its tab: *1 (the shown tab) or &2.
const t2row = textOf(withId(tree, "alloc-t2")), t1row = textOf(withId(tree, "alloc-t1"));
assert.equal(t2row[0], "&2"); assert.equal(t1row[0], "*1");
assert(withId(tree, "ram-scan").ops.some(([k, prop]) => k === "loop" && prop === "left"));
// The heap of s0, newest first: child (5000), t9 (1008), t5 (1004), t2 (1001), t1 (1000).
const heapOrder = flatten(withId(tree, "region-s0")).map(idOf).filter(id => id?.startsWith("alloc-"));
assert.deepEqual(heapOrder, ["alloc-child", "alloc-t9", "alloc-t5", "alloc-t2", "alloc-t1"], "the heap grows up: oldest at the bottom");
const region0 = withId(tree, "region-s0");
const heapAt = flatten(region0).findIndex(n => n.kids.includes("HEAP \u2191  5"));
assert(flatten(region0).findIndex(n => idOf(n) === "alloc-t1") < heapAt, "HEAP's label is under its blocks");
assert(flatten(region0).findIndex(n => n.kids.includes("STACK \u2193  2")) < flatten(region0).findIndex(n => idOf(n) === "frame-tab0-0"),
  "STACK's label (counting the frames) is over them");
assert(flatten(tree).flatMap(n => n.ops).filter(([key]) => key === "text_size").every(([, v]) => v >= 9), "text at least 9px");
// Clicks in meta only select: the level stays meta (the terminal above shows it).
host.calls = [];
click(tree, "head-s1");
assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab1-0" } }], "a stick's name shows its BP tab (SP goes there)");
assert.equal(host.shared.get("ram.zoom"), "meta", "a stick's name selects that space, still in meta");
host.calls = [];
click(tree, "frame-tab3-1");
assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab3-1" } }], "one command: the tab (and so its space)");
assert.equal(host.shared.get("ram.zoom"), "meta", "a frame selects that tab, still in meta");
host.calls = [];
click(tree, "alloc-t2");
assert.deepEqual(host.calls, [{ name: "agent.focus", args: { terminal: "t2" } }]);
click(tree, "block-t1");
assert.deepEqual(host.calls.at(-1), { name: "agent.focus", args: { terminal: "t1" } });
assert.equal(host.shared.get("ram.zoom"), "meta", "and so do heap rows and blocks");
// The level buttons are on the strip: meta again goes back into the space.
const metaStrip = R(map, {});
click(metaStrip, "ram-level-meta");
assert.equal(host.shared.get("ram.zoom"), "space", "meta again goes back into the space");
host.shared.set("ram.zoom", "meta");
click(metaStrip, "ram-level-space");
assert.equal(host.shared.get("ram.zoom"), "space");
// A stick's git line opens lazygit in that space (once its repo is known).
rams.gitInfo.git[JSON.stringify([null, "/repo/web"])] = { name: "web", branch: "main", ahead: 0, behind: 0, dirty: 0,
  upstream: true, top: "/repo/web", repo: JSON.stringify([null, "/repo/web/.git"]), files: [] };
spaces[1].folder = "/repo/web";
host.shared.set("ram.zoom", "meta");
tree = RR();
host.calls = []; host.execs = []; host.hcs = [];
click(tree, "git-s1");
await settle();
assert.deepEqual(host.execs.at(-1)?.args, ["do", "tab.new", "--space", "s1", "--name", "lazygit web", "--folder", "/repo/web",
  "--argv", '["exec","lazygit"]'], "a stick's git line opens lazygit in that space, for its repo, named after it");
assert.deepEqual(host.hcs.at(-1), ["label", "tNEW", "ram.lazygit=/repo/web"], "labelled with its folder: one lazygit per repo");
assert.equal(host.shared.get("ram.zoom"), "meta", "e is off: it shows in meta, at SP");
host.shared.set("ram.enter", true); host.execs = [];
click(RR(), "git-s1");
await settle();
assert.equal(host.execs.at(-1)?.args[5], "lazygit web");
assert.equal(host.shared.get("ram.zoom"), "space", "e on: it takes you into the space level");
host.shared.delete("ram.enter");
assert(!flatten(tree).some(n => idOf(n) === "git-s3" && n.handlers.on_click), "no repo, no click");
// The git line in symbols: web on main with a remote and nothing to do is just ✓.
assert.deepEqual(textOf(withId(tree, "git-s1")), ["\u2713"]);
assert.equal(op(withId(tree, "git-s1"), "tooltip")[0], "web \u00b7 main: clean \u00b7 click: lazygit");
spaces[1].folder = "";
// Short sticks: a "+n more" row where it fits (the labels count them all), the
// agents that need you first. From the block's least height up, every stick's
// parts fit in it and the sticks with their padding fit the block.
host.shared.set("ram.zoom", "meta");
rams.size = { width: 1400, height: 265 };
tree = RR();
const s0rows = flatten(withId(tree, "region-s0")).map(idOf).filter(id => id?.startsWith("alloc-"));
assert.deepEqual(s0rows, ["alloc-child", "alloc-t2"], "short of room: the agents that need you stay");
assert(textOf(withId(tree, "region-s0")).includes("+3 more blocks") && textOf(withId(tree, "region-s0")).includes("HEAP \u2191  5"),
  "a short stick says what it hides");
for (let height = byId("ram-rams").min; height <= 520; height += 4) {
  rams.size = { width: 1400, height };
  tree = RR();
  assert(op(withId(tree, "ram-regions"), "h")[0] <= height + 1e-9, `${height} px: the sticks and their padding fit`);
  for (const s of spaces) {
    const region = withId(tree, `region-${s.id}`), need = heightOf(region.kids[0]) + 6 * 1.25;
    assert(need <= op(region, "h")[0] + 1e-9, `${height} px: ${s.id} needs ${need} of ${op(region, "h")[0]}`);
    assert(textOf(region).some(x => x.startsWith("STACK")) && textOf(region).some(x => x.startsWith("HEAP")) && withId(tree, `git-${s.id}`),
      `${height} px: ${s.id} keeps its labels and git line`);
  }
  assert(flatten(withId(tree, "region-s0")).some(n => /^frame-/.test(idOf(n) ?? "") && textOf(n).includes("*1")), `${height} px: the shown frame stays`);
}
const r0 = flatten(withId(tree, "region-s0"));
const heapLabelAt = r0.findIndex(n => n.kids.includes("HEAP \u2191  5")), gitAt = r0.findIndex(n => idOf(n) === "git-s0");
assert(r0.slice(heapLabelAt + 1, gitAt).some(n => op(n, "h")?.[0] === 8 * 1.25), "a gap between HEAP's label and the git line");
rams.size = { width: 1400, height: 340 };
console.log("PASS: meta: the strip on top (tabs); under the terminal every space a stick of one width that fits its block (frames down with a hover x, heap up, +n more where it fits), one SP and a BP per stick, clicks only select, git lines open lazygit (in meta unless e is on)");

// ---- Nothing in a stick goes past its edge, however narrow it gets ----------------------
{
  const B = 4 * 1.25, ARROW = 26 * 1.25, ARROW_MIN = 12 * 1.25, MORE = n => `+${n}`.length * 10 * 1.25 * 0.6 + 2 * 1.25;
  const span = (ws, more) => (ws.length ? B * ws.length + ws.reduce((a, b) => a + b, 0) : 0) + (more ? B + MORE(more) : 0);
  const item = (natural, readable, least) => ({ natural, readable, least });
  // fitBlocks: room is what a frame row has after SP and &n.
  let f = fitBlocks([item(57.5, 48.75, 25)], 160);
  assert.deepEqual(f, { arrow: ARROW, widths: [57.5], more: 0 }, "room enough: the block at its own width, the arrow full length");
  f = fitBlocks([item(57.5, 48.75, 25)], 80);
  assert.deepEqual(f, { arrow: 80 - B - 57.5, widths: [57.5], more: 0 }, "the arrow gives way first");
  f = fitBlocks([item(57.5, 48.75, 25)], 60);
  assert.deepEqual([f.arrow, f.more], [ARROW_MIN, 0]);
  assert(Math.abs(f.widths[0] - (60 - ARROW_MIN - B)) < 1e-9, "then the block narrows (its name truncates)");
  f = fitBlocks([item(57.5, 48.75, 25)], 45);
  assert.deepEqual(f, { arrow: ARROW_MIN, widths: [25], more: 0 }, "no room for a readable name: the block keeps its light");
  f = fitBlocks([item(57.5, 48.75, 25), item(57.5, 48.75, 25)], 70.5);
  assert.deepEqual([f.widths.length, f.more], [1, 1], "at the narrowest stick, two blocks: the first's light and +1");
  assert(f.widths[0] >= 25 && f.arrow + span(f.widths, 1) <= 70.5 + 1e-9);
  assert.deepEqual(fitBlocks([item(57.5, 48.75, 25)], 20), { arrow: ARROW_MIN, widths: [], more: 1 }, "not even its light: +1");
  const five = [item(57.5, 48.75, 25), item(47.5, 38.75, 23.75), item(57.5, 48.75, 25), item(57.5, 48.75, 25), item(48.75, 48.75, 25)];
  for (let room = 30; room <= 400; room += 0.5) {
    const r = fitBlocks(five, room);
    const used = r.arrow + span(r.widths, r.more);
    assert(used <= room + 1e-9 || r.widths.length <= 1, `room ${room}: ${used}`);
    assert.equal(r.widths.length + r.more, 5, "every block is shown or counted");
    assert(r.arrow >= ARROW_MIN - 1e-9 && r.arrow <= ARROW + 1e-9);
    r.widths.forEach((w, k) => assert(w <= five[k].natural + 1e-9 && (w >= five[k].readable - 1e-9 || r.widths.length === 1), `room ${room}: block ${k} ${w}`));
  }
  assert.deepEqual(fitBlocks(five, 400).widths, five.map(x => x.natural));
  assert.equal(fitBlocks([], 100).arrow, ARROW, "no blocks (lazygit): the whole arrow");
  // The sticks, from the narrowest (80% of 200) up: every row's parts fit inside the border.
  // Fixture: api's *1 gets a long-named program; ops (another machine) needs you twice and has
  // an open review, so its header has ◆1, @remote and FAULT.
  host.shared.set("ram.zoom", "meta");
  agentList[4].program = { name: "a-very-long-program-name" };
  const ops = spaces[2];
  const reviewTab = { id: "tabR", name: "hunk", named: true, index: 3, active: false, settled: false, status: null };
  ops.tabs.push(reviewTab);
  panes.push({ pane: "pR", terminal: "remote/tR", tab: "tabR", title: "hunk", status: null, focused: false, cwd: null });
  raw.push({ address: "remote/tR", state: "live", created_ms: 9100, pid: 99, labels: { "ram.hunk": "diff" } });
  agentList[2].status = "blocked"; agentList[6].status = "blocked";
  const inside = (t2, width, where) => {
    for (const s of spaces) {
      const region = withId(t2, `region-${s.id}`), box = region.kids[0];
      assert.equal(op(region, "w")[0], width, `${where}: ${s.id} is ${op(region, "w")[0]} wide`);
      for (const row of box.kids.filter(k => typeof k === "object" && !op(k, "absolute"))) {
        const w = widthOf(row);
        assert(w <= width - 2 + 1e-9, `${where}: ${s.id}'s ${idOf(row) ?? textOf(row).join(" ")} needs ${w} of ${width - 2}`);
      }
    }
  };
  for (let each = 160; each <= 260; each += 4) {
    // The block's width that gives each stick EACH px: its padding, the + and the gaps.
    rams.size = { width: Math.max(each * 4 + 32 * 1.25 + 30 * 1.25 + 14 * 1.25 * 4, 0), height: 340 };
    const t2 = RR();
    inside(t2, Math.min(each, 200 * 1.25), `${each} px`);
  }
  rams.size = { width: 700, height: 340 };   // narrower than four sticks of 160 need: they keep 160 and scroll
  inside(RR(), 160, "scrolling");
  // At the narrowest: !n for FAULT n, @remote gives way, a heap row drops its state's word.
  let t2 = RR();
  const opsHead = textOf(withId(t2, "head-s2"));
  assert(opsHead.includes("!2") && !opsHead.includes("FAULT 2") && opsHead.includes("\u25c61"), opsHead.join("|"));
  assert.equal(flatten(withId(t2, "head-s2")).find(n => n.kids.includes("!2")) && op(flatten(withId(t2, "head-s2")).find(n => n.kids.includes("!2")), "tooltip")[0],
    "FAULT 2: needs you");
  assert(!textOf(withId(t2, "alloc-t2")).includes("Needs you") && textOf(withId(t2, "alloc-t1")).includes("Working"),
    "Needs you doesn't fit at 160 (the red row and its light say it); Working does");
  const longName = flatten(withId(t2, "alloc-t5")).find(n => n.kids.includes("a-very-long-program-name"));
  assert(op(longName, "truncate") && op(longName, "max_w")[0] < 110 * 1.25, "a long name truncates to the room it has");
  // Wide: everything in full.
  rams.size = { width: 1400, height: 340 };
  t2 = RR();
  const wideHead = textOf(withId(t2, "head-s2"));
  assert(wideHead.includes("FAULT 2") && wideHead.includes("@remote"), wideHead.join("|"));
  assert(textOf(withId(t2, "alloc-t2")).includes("Needs you"));
  inside(t2, 250, "wide");
  // Back to the fixture as it was.
  agentList[4].program = program; agentList[2].status = "done"; agentList[6].status = "idle";
  ops.tabs.pop(); panes.pop(); raw.pop();
  host.shared.set("ram.zoom", "space");
}
console.log("PASS: sticks: a frame's arrow gives way, then its blocks narrow, then +n counts the rest; headers and heap rows fit too, so nothing goes past a stick's edge at any width");

// ---- The side column (space level) ----------------------------------------------------
host.shared.set("ram.zoom", "space");
timersBefore = host.timers.length;
const side = view({ role: "side" });
side.size = { width: 300, height: 700 };
assert.deepEqual(host.timers.slice(timersBefore).map(t => t.ms), [250, 15000, 2000], "the side adds its git tick, a gentle machines check and its commands' last lines");
spaces[0].folder = "/repo/api";
side.gitInfo.git[JSON.stringify([null, "/repo/api"])] = { name: "herdr", branch: "feat-x", ahead: 2, behind: 1, dirty: 5,
  upstream: true, top: "/repo/api", repo: JSON.stringify([null, "/repo/api/.git"]),
  files: [{ xy: "M", path: "src/app.ts" }, { xy: "?", path: "notes.md" }, { xy: "D", path: "old.txt" }, { xy: "A", path: "new.rs" }, { xy: "M", path: "x.js" }] };
tree = R(side, { role: "side" });
for (const id of ["stack-s0", "stack-s1", "stack-s2", "stack-s3", "ram-space-new", "heap-t1", "heap-t2", "heap-child", "ram-git", "ram-settings", "ram-keys", "ram-commands"])
  assert(withId(tree, id), id);
const st = textOf(tree);
for (const want of ["0x01", "api", "STACK \u2193  4", "HEAP \u2191  5", "\u25c2BP", "GIT", "herdr", "feat-x", "\u21912", "\u21931",
  "\u00b15", "src/app.ts", "notes.md", "+1 more", "Needs you", "Working", "^b s", "^b ?", "^b :"])
  assert(st.includes(want), want);
// GIT's line says what the meta git line says, right after GIT: repo · branch (the
// repo name gives way first), then short marks: ↑ to push, ↓ to pull, ± uncommitted.
// Its key shows when there's room; the tooltip says it all in words, on one line.
assert.deepEqual(textOf(withId(tree, "ram-git-line")), ["GIT", "herdr", "\u00b7", "feat-x", "\u21912", "\u21931", "\u00b15", "^b g"]);
assert.equal(op(withId(tree, "ram-git"), "tooltip")[0],
  "herdr \u00b7 feat-x: 2 commits to push, 1 commit to pull, 5 uncommitted files \u00b7 click: lazygit (^b g)");
const headRow = flatten(withId(tree, "ram-git-line")).find(n => n.kids.some(k => typeof k === "object" && k.kids.includes("herdr")));
assert(op(headRow.kids.find(k => k.kids?.includes("herdr")), "truncate") && op(headRow.kids.find(k => k.kids?.includes("feat-x")), "flex_none"),
  "the repo name truncates, the branch stays");
side.size = { width: 150, height: 700 };
assert.notEqual(textOf(withId(R(side, { role: "side" }), "ram-git-line")).at(-1), "^b g", "a narrow column leaves ^b g out");
side.size = { width: 300, height: 700 };
assert(!st.some(x => /\bt\d+\b/.test(x)), "no terminal addresses");
assert.deepEqual(textOf(withId(tree, "stack-s0")).slice(0, 2), ["0x01", "api"]);
assert.equal(textOf(withId(tree, "stack-s0")).at(-1), "\u25c2BP", "BP marks the space you work in, from the right");
assert.equal(op(flatten(withId(tree, "stack-s0")).find(n => n.kids.includes("\u25c2BP")), "text_color")[0], "#ffffff", "in BP's white");
assert.deepEqual(textOf(withId(tree, "stack-s1")).slice(0, 2), ["0x02", "web"]);
assert.equal(textOf(withId(tree, "stack-s1")).at(-1), "", "the others keep the BP column empty, so names line up");
assert(st.includes("^b w"), "STACK's row says its key (^b w, navigate) where it fits");
assert.equal(motions(withId(tree, "ram-stack")).length, 0, "nothing blinks in the stack");
assert(!flatten(withId(tree, "ram-stack")).some(n => idOf(n)?.startsWith?.("led") || (op(n, "size") && op(n, "rounded"))),
  "no status lights in the stack rows");
assert(textOf(withId(tree, "stack-s0")).includes("FAULT 2") && textOf(withId(tree, "stack-s1")).includes("FAULT 1"), "faults per space");
assert(textOf(withId(tree, "stack-s2")).includes("@remote"), "a space on another machine says where");
assert(!withId(tree, "stack-tab0-0"), "tabs aren't in the stack any more");
// A heap row is one line: its tab first, then the agent, what it does and its state.
assert.deepEqual(textOf(withId(tree, "heap-t2")).slice(0, 2), ["&2", "Claude"]);
assert.deepEqual(textOf(withId(tree, "heap-t1")).slice(0, 2), ["*1", "Claude"]);
assert.equal(op(withId(tree, "heap-t1"), "h")[0], 26 * 1.25);
const order = (t2, ...texts) => texts.map(x => flatten(t2).findIndex(n => n.kids.includes(x)));
const ids = (t2, ...want) => want.map(id => flatten(t2).findIndex(n => idOf(n) === id));
const [stackLabel, heapLabel] = order(tree, "STACK \u2193  4", "HEAP \u2191  5");
const [firstFrame, firstBlock, lastBlock] = ids(tree, "stack-s0", "heap-child", "heap-t1");
assert(stackLabel < firstFrame, "STACK's label is above its frames");
assert(firstBlock < lastBlock && lastBlock < heapLabel, "HEAP's label is under its blocks, at the heap's base");
const sideHeap = flatten(withId(tree, "ram-heap")).map(idOf).filter(id => id?.startsWith("heap-"));
assert.deepEqual(sideHeap, ["heap-child", "heap-t9", "heap-t5", "heap-t2", "heap-t1"]);
host.calls = [];
click(tree, "stack-s3");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab3-0" } }, "a space in the stack shows it at its BP");
assert.equal(host.shared.get("ram.zoom"), "space", "a space in the stack shows it, in the space level");
withId(tree, "stack-s3").handlers["on_mouse_down:left"]({ click_count: 2 }, cx);
assert.deepEqual(host.calls.at(-1), { name: "space.rename", args: { id: "s3" } }, "a double-click renames it");
click(tree, "ram-space-new");
assert.deepEqual(host.calls.at(-1), { name: "space.new", args: undefined }, "+ pushes a new space");
click(tree, "heap-t2");
assert.deepEqual(host.calls.at(-1), { name: "agent.focus", args: { terminal: "t2" } });
assert.equal(host.shared.get("ram.zoom"), "space", "so does a heap block");
const stripTree = R(map, {});
click(stripTree, "tab-new-s0");
assert.deepEqual(host.calls.at(-1), { name: "space.select", args: { id: "s0" } });
assert.equal(host.overlays.at(-1).mod, "new-menu");
tree = R(side, { role: "side" });
click(tree, "ram-commands");
assert.equal(host.calls.at(-1).name, "app.palette");
// GIT opens lazygit in a new tab at the repo's top, named after it and labelled with it.
click(tree, "ram-git");
await settle();
assert.deepEqual(host.execs.at(-1), { command: "herdr-app", args: ["do", "tab.new", "--space", "s0", "--name", "lazygit api",
  "--folder", "/repo/api", "--argv", '["exec","lazygit"]'], opts: undefined });
assert.deepEqual(host.hcs.at(-1), ["label", "tNEW", "ram.lazygit=/repo/api"]);
assert.equal(host.shared.get("ram.opening"), null);
// HUNK, under GIT (the space has a repo): no review yet, so its + and its header open
// the menu of what to review.
map.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
host.shared.set("ram.zoom", "space");
assert.deepEqual(textOf(withId(tree, "ram-hunk-head")), ["HUNK", "no reviews", "^b r", "+"], "HUNK, no reviews, its key, +");
host.overlays = [];
click(tree, "ram-hunk-new");
assert.deepEqual(host.overlays.at(-1), { mod: "ram", kind: "dialog", width: 470, height: 290,
  props: { role: "hunk-menu", space: "s0", name: "api", repo: "herdr" } });
host.overlays = [];
click(tree, "ram-hunk-head");
assert.equal(host.overlays.at(-1)?.props?.role, "hunk-menu", "no review yet: the header (^b r) opens the menu too");
assert.equal(host.notes.length, 0);
// MACHINES, above the keys: state dots, + for a space there, + to add one.
host.machines = [{ name: "remote", state: "connected" }, { name: "pc", state: "unreachable", why: "cannot reach pc" },
  { name: "tmp-box", state: "connected", temporary: true }];
const side2 = view({ role: "side" });
side2.size = { width: 340, height: 900 };
await settle();
tree = R(side2, { role: "side" });
assert(withId(tree, "ram-machines") && withId(tree, "ram-machine-remote") && withId(tree, "ram-machine-pc"));
assert(!withId(tree, "ram-machine-tmp-box"), "temporary machines stay out");
const mt = textOf(withId(tree, "ram-machines"));
assert(mt.includes(".rodata") && !mt.includes("ROM") && mt.includes("remote") && mt.includes("pc") && mt.includes("unreachable"), mt);
assert(mt.includes("0xF1") && mt.includes("0xF2") && mt.includes("RO"), "machines read as read-only chips at high addresses");
assert(op(withId(tree, "ram-machine-remote"), "border_dashed") && op(withId(tree, "ram-machine-remote"), "bg")[0] === "#130f1b",
  ".rodata looks unlike a space: dashed, its own color");
const at = id => flatten(tree).findIndex(n => idOf(n) === id);
assert(at("ram-heap") < at("ram-machines") && at("ram-machines") < at("ram-git") && at("ram-git") < at("ram-settings"),
  ".rodata under the heap, GIT under .rodata, then the keys");
// meta's column keeps .rodata, under the main stick: a machine selects its space there too.
host.calls = []; host.shared.set("ram.zoom", "meta");
tree = R(side2, { role: "side" });
assert(withId(tree, "ram-all") && withId(tree, "ram-machine-remote") && withId(tree, "ram-machine-pc"), "meta: the main stick, then .rodata");
click(tree, "ram-machine-remote");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab2-0" } }, "a connected machine selects its space (at its BP)");
assert.equal(host.shared.get("ram.zoom"), "meta", "without leaving meta");
click(tree, "ram-machine-new-remote");
assert.deepEqual(host.calls.at(-1), { name: "space.new", args: { machine: "remote" } });
click(tree, "ram-machine-pc");
assert.deepEqual(host.calls.at(-1), { name: "app.settings", args: { section: "machines" } }, "one that isn't connected opens Settings");
click(tree, "ram-machine-add");
assert.deepEqual(host.calls.at(-1), { name: "mod.open", args: { name: "machine-add" } });
host.machines = [];
side2.refreshMachines(cx); await settle();
tree = R(side2, { role: "side" });
click(tree, "ram-machine-none");
assert.deepEqual(host.calls.at(-1), { name: "mod.open", args: { name: "machine-add" } });
assert.equal(op(withId(tree, "ram-machine-none"), "flex_1").length, 0, "no machine yet: 'Add a machine' fills .rodata's own line");
const header = flatten(withId(tree, "ram-machines")).find(n => n.kids.includes(".rodata") && n.kind === "div");
const headerRow = flatten(withId(tree, "ram-machines")).find(n => n.kids.includes(header));
assert(headerRow.kids.some(k => idOf(k) === "ram-machine-none") && headerRow.kids.some(k => idOf(k) === "ram-machine-add"),
  ".rodata, Add a machine and + on one line");
// A short column (a small window) fits: its parts add up to no more than its
// height, so the keys at the bottom always show. Rows give way first (their labels
// count them), then GIT's file names; past that, .rodata and GIT scroll. Here in the
// space level.
host.shared.set("ram.zoom", "space");
const short = view({ role: "side" });
await settle();
short.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
const fits = (machines, height) => {
  short.machines = machines;
  short.size = { width: 290, height };
  const t2 = R(short, { role: "side" });
  return { tree: t2, total: heightOf(withId(t2, "ram-side")), text: textOf(t2) };
};
for (const [machines, height] of [[[], 270], [[], 330], [[{ name: "remote", state: "connected" }], 300], [[], 900]]) {
  const r = fits(machines, height);
  assert(r.total <= height, `${height} px with ${machines.length} machine(s) needs ${r.total}`);
  for (const id of ["stack-s0", "ram-machines", "ram-git", "ram-settings", "ram-keys", "ram-commands"]) assert(withId(r.tree, id), `${height}: ${id}`);
  assert(r.text.includes("STACK \u2193  4") && r.text.includes("HEAP \u2191  5"), "the labels count every space and agent");
}
let r = fits([], 270);
assert(!withId(r.tree, "stack-s1") && !withId(r.tree, "heap-t1") && !r.text.includes("src/app.ts") && r.text.includes("+5 more"),
  "at 270 px: the current space, GIT's counts, no file names");
r = fits([], 345 + 37.25);  // (HUNK, under GIT, takes 37.25 px)
assert(["src/app.ts", "notes.md", "old.txt", "new.rs"].every(x => r.text.includes(x)) && !r.text.includes("x.js") && r.text.includes("+1 more"),
  "with room, four file names (and +1 more)");
r = fits([], 900);
assert(withId(r.tree, "stack-s3") && withId(r.tree, "heap-t1"), "a tall column shows every space and agent");
// Too short even so (a machine and a dirty repo at 270 px): .rodata and GIT scroll,
// the labels, the current space and the keys stay.
r = fits([{ name: "remote", state: "connected" }], 270);
const memory = withId(r.tree, "ram-side-memory"), details = withId(r.tree, "ram-side-details");
const keysRowNode = flatten(r.tree).find(n => n.kids.some(k => idOf(k) === "ram-settings"));
assert(op(memory, "flex_1") && op(memory, "overflow_hidden") && op(memory, "min_h")[0] === heightOf(memory), "the memory part keeps its minimum");
assert(op(details, "overflow_y_scrollbar") && 2 + heightOf(memory) + op(details, "h")[0] + heightOf(keysRowNode) === 270,
  ".rodata and GIT get what's left and scroll");
assert(op(keysRowNode, "flex_none"), "the keys always show");
// When everything fits, nothing scrolls and nothing has a set height (HUNK, under GIT,
// takes 37.25 px more than the 270 px this needed before).
r = fits([], 270 + 37.25);
assert(!op(withId(r.tree, "ram-side-details"), "h") && !op(withId(r.tree, "ram-side-details"), "overflow_y_scrollbar"));
// Every height from 200 to 420 px, with and without a repo and a machine: the
// column never needs more than it has, and when spaces are hidden and there's
// room left for it, "+n more spaces" shows.
const sweep = lvl => {
  assert.equal(level(), lvl);
  for (const folder of ["/repo/api", "/nowhere"]) {
    spaces[0].folder = folder;
    for (const machines of [[], [{ name: "remote", state: "connected" }]]) {
      for (let height = 200; height <= 420; height += 5) {
        const r2 = fits(machines, height);
        const d = withId(r2.tree, "ram-side-details"), scrolls = Boolean(op(d, "overflow_y_scrollbar"));
        const keysNode = flatten(r2.tree).find(n => n.kids.some(k => idOf(k) === "ram-settings"));
        const need = scrolls ? 2 + heightOf(withId(r2.tree, "ram-side-memory")) + op(d, "h")[0] + heightOf(keysNode) : r2.total;
        const where = `${lvl}: ${folder}, ${machines.length} machine(s), ${height} px`;
        assert(need <= height + 1e-9, `${where} needs ${need}`);
        assert(withId(r2.tree, "stack-s0") && withId(r2.tree, "ram-settings"), where);
        const shownSpaces = spaces.filter(sp => withId(r2.tree, `stack-${sp.id}`)).length;
        if (!scrolls && shownSpaces < spaces.length && height - r2.total >= 18 * 1.25)
          assert(withId(r2.tree, "ram-stack-more"), `${where}: room for +n more spaces`);
      }
    }
  }
  spaces[0].folder = "/repo/api";
};
sweep("space");
host.shared.set("ram.zoom", "space");
console.log("PASS: side: stack down, heap up to its label, .rodata (Add a machine on its line) then GIT; in meta the column is the main stick over .rodata and the keys; a short column fits, the keys always show; the hunk button opens its menu");

// ---- Drag to reorder ----------------------------------------------------------------
// As Herdr's own lists: press a space or tab, move onto another of its group, let go there.
const down = (t2, id) => withId(t2, id).handlers["on_mouse_down:left"]({ click_count: 1 }, cx);
const over = (t2, id) => withId(t2, id).handlers.on_mouse_move({}, cx);
const up = (t2, id) => withId(t2, id).handlers["on_mouse_up:left"]({}, cx);
const dropLine = n => n.kids.find(k => typeof k === "object" && op(k, "absolute") && (op(k, "w")?.[0] === 2 || op(k, "h")?.[0] === 2));
host.shared.set("ram.zoom", "space");
map.size = { width: 1600, height: 58 };
let dt = R(map, {});
host.calls = [];
down(dt, "tabchip-tab0-1"); over(dt, "tabchip-tab0-0");
dt = R(map, {});
assert.deepEqual(op(withId(dt, "tabchip-tab0-1"), "opacity"), [0.5], "the dragged tab dims");
const tabLine = dropLine(withId(dt, "tabchip-tab0-0"));
assert(tabLine && op(tabLine, "left") && op(tabLine, "w")[0] === 2, "a line where it lands: before *1");
up(dt, "tabchip-tab0-0");
assert.deepEqual(host.calls, [{ name: "tab.move", args: { id: "tab0-1", index: 1 } }], "&2 onto *1 moves it first");
dt = R(map, {});
assert(!dropLine(withId(dt, "tabchip-tab0-0")) && !op(withId(dt, "tabchip-tab0-1"), "opacity"), "dropped: the marks go");
host.calls = [];
down(dt, "tabchip-tab0-0"); over(dt, "tabchip-tab0-0"); up(dt, "tabchip-tab0-0");
assert.deepEqual(host.calls, [], "pressed and let go on the same tab: nothing moves (its click shows it)");
assert(!op(withId(R(map, {}), "tabchip-tab0-0"), "opacity"), "and a plain press doesn't dim it");
down(dt, "tabchip-tab0-0"); over(dt, "tabchip-tab0-1");
withId(dt, "ram-strip").handlers["on_mouse_up:left"]({}, cx);
assert.equal(map.drag, null, "let go elsewhere in the strip: the drag is off");
down(dt, "tabchip-tab0-0"); over(dt, "tabchip-tab0-1");
withId(dt, "ram-strip").handlers.on_hover(false, cx);
assert.equal(map.drag, null, "the pointer leaves the strip: the drag is off");
up(dt, "tabchip-tab0-1");
assert.deepEqual(host.calls, [], "nothing moves after that");
// Spaces in the side's STACK: 0x04 onto 0x02 moves it second; never onto another machine's.
let ds = R(side, { role: "side" });
down(ds, "stack-s3"); over(ds, "stack-s1");
ds = R(side, { role: "side" });
const spaceLine = dropLine(withId(ds, "stack-s1"));
assert(spaceLine && op(spaceLine, "top") && op(spaceLine, "h")[0] === 2, "moving up: the line above 0x02");
up(ds, "stack-s1");
assert.deepEqual(host.calls, [{ name: "space.move", args: { id: "s3", index: 2 } }]);
host.calls = [];
down(ds, "stack-s0"); over(ds, "stack-s2");
ds = R(side, { role: "side" });
assert(!dropLine(withId(ds, "stack-s2")), "0x03 is on another machine: no line");
up(ds, "stack-s2");
assert.deepEqual(host.calls, [], "and nothing moves");
withId(ds, "ram-side").handlers["on_mouse_up:left"]({}, cx);
assert.equal(side.drag, null);
// meta, under the terminal: a stick by its name onto another stick; a frame onto a frame of its own space.
host.shared.set("ram.zoom", "meta");
rams.size = { width: 1400, height: 340 };
let dm = RR();
host.calls = [];
down(dm, "head-s0"); over(dm, "region-s1");
dm = RR();
const regionLine = dropLine(withId(dm, "region-s1"));
assert(regionLine && op(regionLine, "right") && op(regionLine, "w")[0] === 2, "moving right: the line after web");
up(dm, "region-s1");
assert.deepEqual(host.calls, [{ name: "space.move", args: { id: "s0", index: 2 } }]);
host.calls = [];
down(dm, "frame-tab3-0"); over(dm, "frame-tab3-1");
dm = RR();
assert(dropLine(withId(dm, "frame-tab3-1")), "a frame shows where the tab lands");
up(dm, "frame-tab3-1");
assert.deepEqual(host.calls, [{ name: "tab.move", args: { id: "tab3-0", index: 2 } }]);
host.calls = [];
down(dm, "frame-tab0-0"); over(dm, "frame-tab1-0"); up(dm, "frame-tab1-0");
assert.deepEqual(host.calls, [], "a tab stays in its own space");
down(dm, "frame-tab0-0"); over(dm, "region-s1"); up(dm, "region-s1");
assert.deepEqual(host.calls, [], "a tab dropped on a region isn't a space move");
withId(dm, "ram-rams").handlers["on_mouse_up:left"]({}, cx);
assert.equal(rams.drag, null);
// meta's main stick: a space by its row onto another space (its row or its files).
const mside = view({ role: "side" });
mside.size = { width: 390, height: 700 };
const MS = () => R(mside, { role: "side" });
let dg = MS();
host.calls = [];
down(dg, "all-space-s3"); over(dg, "all-group-s1");
dg = MS();
const groupLine = dropLine(withId(dg, "all-group-s1"));
assert(groupLine && op(groupLine, "top") && op(groupLine, "h")[0] === 2, "moving up: the line above web and its files");
assert.deepEqual(op(withId(dg, "all-group-s3"), "opacity"), [0.5], "the dragged space dims");
up(dg, "all-group-s1");
assert.deepEqual(host.calls, [{ name: "space.move", args: { id: "s3", index: 2 } }], "0x04 onto 0x02 moves it second");
host.calls = [];
down(dg, "all-space-s0"); over(dg, "all-group-s2");
dg = MS();
assert(!dropLine(withId(dg, "all-group-s2")), "0x03 is on another machine: no line");
up(dg, "all-group-s2");
assert.deepEqual(host.calls, [], "and nothing moves");
down(dg, "all-space-s0"); over(dg, "all-group-s1");
dg = MS();
const afterLine = dropLine(withId(dg, "all-group-s1"));
assert(afterLine && op(afterLine, "bottom"), "moving down: the line under web and its files");
withId(dg, "ram-side").handlers["on_mouse_up:left"]({}, cx);
assert.equal(mside.drag, null, "let go elsewhere in the column: the drag is off");
assert.deepEqual(host.calls, [], "and nothing moves");
host.shared.set("ram.zoom", "space");
console.log("PASS: drag to reorder: tabs on the strip and the sticks' frames (tab.move), spaces in the stack, the sticks and the main stick (space.move, same machine), a line shows where");

// ---- The side column's edge: drag it wider or narrower; each level keeps its width ----
{
  const sidebarNode = () => {
    const find = (n, id) => n?.id === id ? n : (n?.children ?? []).map(c => find(c, id)).find(Boolean) ?? null;
    return find(host.layout, "sidebar");
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sideCall = () => layoutCalls().find(c => c.args.id === "sidebar");
  assert.deepEqual(["meta", "space"].map(sideWidth), [390, 340], "each level's own width, until you drag it");
  host.shared.set("ram.side", { meta: 239, space: "wide" });
  assert.deepEqual(["meta", "space"].map(sideWidth), [390, 340], "a kept width under the side column's min (or not a number) is ignored");
  host.shared.delete("ram.side");
  host.layout = JSON.parse(JSON.stringify(layout));  // the live layout, as the file has it
  host.shared.set("ram.zoom", "space");
  const before = host.timers.length;
  const smap = view({});
  const watch = host.timers.slice(before)[1];
  assert.equal(watch.ms, 250);
  host.calls = [];
  R(smap, {}); await settle();
  assert.deepEqual(sideCall(), { name: "layout.resize", args: { id: "sidebar", px: 340 } });
  watch.fn(cx);
  assert.equal(smap.sideBase, 340, "it settles on the level's width");
  // You drag the edge to 610: kept for the space level once it holds still.
  sidebarNode().size = { px: 610 };
  watch.fn(cx);
  assert.equal(host.shared.get("ram.side"), undefined, "not while it may still be moving");
  sidebarNode().size = { px: 612.4 };
  watch.fn(cx);
  await sleep(320);
  watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 612 }, "held still: kept for the space level");
  // meta has its own width; back in the space level, the one you dragged.
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  R(smap, {}); await settle();
  assert.equal(sideCall().args.px, 390, "meta: its own width");
  watch.fn(cx);
  host.shared.set("ram.zoom", "space"); host.calls = [];
  R(smap, {}); await settle();
  assert.equal(sideCall().args.px, 612, "the space level: the width you dragged");
  watch.fn(cx);
  // A drag right before a level change is kept for the level it was made in.
  sidebarNode().size = { px: 500 };
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  R(smap, {}); await settle();
  assert.deepEqual(host.shared.get("ram.side"), { space: 500 });
  assert.equal(sideCall().args.px, 390);
  // The level's own resize is never a drag, even while the layout is slow to follow it...
  watch.fn(cx);
  host.layoutLag = true;
  host.shared.set("ram.zoom", "space");
  R(smap, {}); await settle();
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 500 }, "still the space level's 500, not meta's 390");
  sidebarNode().size = { px: 500 };
  watch.fn(cx);
  assert.equal(smap.sideBase, 500);
  host.layoutLag = false;
  // ...or when the layout holds it back for good (after 2 s it's where the level is).
  host.layoutLag = true;
  host.shared.set("ram.zoom", "meta");
  R(smap, {}); await settle();
  smap.sideWant.at -= 2500;
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 500 }, "a width the layout kept isn't a drag");
  assert.equal(smap.sideBase, 500);
  host.layoutLag = false;
  // In meta: drag to 760, kept for meta.
  sidebarNode().size = { px: 760 };
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 500, meta: 760 });
  // Dragged back to the level's own width: nothing to keep.
  sidebarNode().size = { px: 390 };
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 500 }, "back at meta's own 390: forgotten");
  sidebarNode().size = { px: 760 };
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.deepEqual(host.shared.get("ram.side"), { space: 500, meta: 760 });
  // Only an active window is watched; too narrow is never kept.
  host.active = false;
  sidebarNode().size = { px: 700 };
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.equal(host.shared.get("ram.side").meta, 760, "an inactive window isn't dragged");
  host.active = true;
  sidebarNode().size = { px: 200 };
  watch.fn(cx); await sleep(320); watch.fn(cx);
  assert.equal(host.shared.get("ram.side").meta, 760, "under the min isn't kept");
  // The main stick follows the column's width.
  const wide = view({ role: "side" });
  wide.size = { width: 760, height: 700 };
  assert.equal(op(withId(R(wide, { role: "side" }), "ram-all"), "w")[0], 760 - 2 - 2 * 6 * 1.25, "the main stick is as wide as you drag the column");
  host.layout = null;
  host.shared.delete("ram.side");
  host.shared.set("ram.zoom", "space");
}
console.log("PASS: the side column's edge drags (ram-work's gap); each level keeps the width you leave it at, the level's own resize never counts, the main stick follows");

// ---- The side column shown or hidden, and P, each level's own ---------------------------------
{
  const saved = new Map(host.shared);
  const find = (n, id) => n?.id === id ? n : (n?.children ?? []).map(c => find(c, id)).find(Boolean) ?? null;
  const sidebarNode = () => find(host.layout, "sidebar");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toggles = id => layoutCalls().filter(c => c.args.id === id && c.name !== "layout.resize");
  const SHOW = id => ({ name: "layout.show", args: { id } }), HIDE = id => ({ name: "layout.hide", args: { id } });
  const kept = () => host.shared.get("ram.side.hidden");
  host.layout = JSON.parse(JSON.stringify(layout));  // the live layout, as the file has it: the side column shown
  host.shared.set("ram.zoom", "space");
  const before = host.timers.length;
  const hm = view({});
  const watch = host.timers.slice(before)[1];
  assert.equal(watch.ms, 250);
  await settle();
  let next = host.waiting.at(-1);
  const sendHm = async c => { const w = next, b = host.waiting.length; w(c); await settle(); next = host.waiting.slice(b).at(-1); };
  const HR = () => R(hm, {});
  host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [], "at the start the side column stays as the layout has it");
  assert.equal(kept(), undefined, "shown: nothing kept");
  // b (as ^b b: Herdr's layout.toggle) in the space level: the space level keeps it hidden.
  click(HR(), "ram-sidebar");
  assert.equal(sidebarNode().hidden, true);
  let t = HR();
  assert.deepEqual(kept(), { space: true }, "hidden in the space level: kept for it");
  assert.deepEqual([sideHidden("space"), sideHidden("meta")], [true, false]);
  assert.equal(op(withId(t, "ram-sidebar"), "tooltip")[0], "Show the side column in the space level  ^b b");
  assert.notDeepEqual(op(withId(t, "ram-sidebar"), "border_color"), ["#ffb547"], "hidden: not lit");
  // meta keeps its own: ^b m shows it there, and that show isn't yours.
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")], "meta: shown, as meta has it");
  t = HR();
  assert.deepEqual(kept(), { space: true }, "meta's own show isn't kept as yours");
  assert.deepEqual(op(withId(t, "ram-sidebar"), "border_color"), ["#ffb547"], "meta: lit");
  watch.fn(cx);
  assert.equal(hm.hiddenBase, false, "it settles on meta's");
  // ^b i: hidden again in the space level; shown there, nothing to keep.
  host.shared.set("ram.zoom", "space"); host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [HIDE("sidebar")], "the space level: hidden, as you left it");
  assert.equal(sidebarNode().hidden, true);
  click(HR(), "ram-sidebar");
  HR();
  assert.deepEqual(kept(), {}, "shown in the space level: forgotten");
  // A hide right before a level change is kept for the level it was made in,
  // even when the timer looks before the new level is applied.
  sidebarNode().hidden = true;
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  watch.fn(cx);
  assert.equal(kept().meta, undefined, "not taken for meta's");
  HR(); await settle();
  assert.deepEqual(kept(), { space: true }, "kept for the space level, where you hid it");
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")], "and meta shows its own");
  HR();
  // The timer keeps one too, with no render in between.
  sidebarNode().hidden = true;
  watch.fn(cx);
  assert.deepEqual(kept(), { space: true, meta: true }, "hidden in meta: kept for meta");
  sidebarNode().hidden = false;
  watch.fn(cx);
  assert.deepEqual(kept(), { space: true });
  // The level's own show or hide is never yours, even while the layout is slow to follow it...
  host.layoutLag = true;
  host.shared.set("ram.zoom", "space"); host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [HIDE("sidebar")]);
  watch.fn(cx); HR(); await sleep(50); watch.fn(cx);
  assert.deepEqual(kept(), { space: true }, "not taken for a show in the space level");
  sidebarNode().hidden = true;
  watch.fn(cx);
  assert.equal(hm.hiddenBase, true);
  host.layoutLag = false;
  // ...or when the layout holds it back for good (after 2 s it's where the level is).
  host.layoutLag = true;
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  HR(); await settle();
  hm.hideWant.at -= 2500;
  watch.fn(cx);
  assert.deepEqual(kept(), { space: true }, "a state the layout kept isn't yours");
  assert.equal(hm.hiddenBase, true);
  host.layoutLag = false;
  // That show is given up: the space level, which keeps it hidden, has nothing to do.
  host.shared.set("ram.zoom", "space"); host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [], "hidden already: nothing to do");
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  HR(); await settle(); HR();
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")], "meta's show, sent again");
  sidebarNode().hidden = false; watch.fn(cx);
  // Two level changes before the first one's own show or hide lands: the second
  // goes after it, and neither is yours when they land.
  host.layoutLag = true;
  host.shared.set("ram.zoom", "space"); host.calls = [];
  HR(); await settle();
  host.shared.set("ram.zoom", "meta");
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [HIDE("sidebar"), SHOW("sidebar")], "meta shows it after the space level's hide");
  host.layoutLag = false;
  sidebarNode().hidden = true; watch.fn(cx);
  sidebarNode().hidden = false; watch.fn(cx);
  assert.deepEqual(kept(), { space: true }, "neither counted as yours");
  assert.equal(hm.hiddenBase, false);
  // Back again before the hide lands: it's already going where the space level wants.
  host.layoutLag = true;
  host.shared.set("ram.zoom", "space"); host.calls = [];
  HR(); await settle();
  host.shared.set("ram.zoom", "meta"); HR(); await settle();
  host.shared.set("ram.zoom", "space"); HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [HIDE("sidebar"), SHOW("sidebar"), HIDE("sidebar")]);
  host.layoutLag = false;
  sidebarNode().hidden = true; watch.fn(cx);
  assert.deepEqual(kept(), { space: true });
  host.calls = [];
  host.shared.set("ram.zoom", "meta"); HR(); await settle(); HR();
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")]);
  // ^b d: the diff view is in meta's side column, so it shows the column again.
  sidebarNode().hidden = true; watch.fn(cx);
  assert.deepEqual(kept(), { space: true, meta: true });
  host.shared.set("ram.all.mode", "memory"); host.calls = [];
  await sendHm("changes");
  assert.deepEqual([host.shared.get("ram.all.mode"), kept()], ["changes", { space: true }], "meta, its column hidden: the diff, and the column back");
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")]);
  assert.equal(sidebarNode().hidden, false);
  watch.fn(cx);
  await sendHm("changes");
  assert.equal(host.shared.get("ram.all.mode"), "memory", "its column shown: d switches the view, as before");
  host.shared.set("ram.side.hidden", { space: true, meta: true });
  host.shared.set("ram.zoom", "space"); HR(); await settle(); HR();
  host.calls = [];
  await sendHm("changes");
  assert.deepEqual([host.shared.get("ram.zoom"), host.shared.get("ram.all.mode"), kept()], ["meta", "changes", { space: true }],
    "from the space level: meta with the diff, its column kept shown");
  HR(); await settle();
  assert.deepEqual(toggles("sidebar"), [SHOW("sidebar")], "meta shows the main stick");
  HR();
  host.shared.set("ram.all.mode", "memory");
  // P in meta: its sticks hide (the terminal takes their room); the space level's peek strip stays on.
  host.calls = [];
  click(HR(), "ram-peek-toggle");
  assert.deepEqual([host.shared.get("ram.sticks"), host.shared.get("ram.peek")], [false, undefined]);
  t = HR(); await settle();
  assert.deepEqual(toggles("ram-rams"), [HIDE("ram-rams")], "meta's sticks hide");
  assert.equal(sticksShown(), false);
  assert.equal(op(withId(t, "ram-peek-toggle"), "tooltip")[0], "Show the sticks in meta  ^b P");
  assert.notDeepEqual(op(withId(t, "ram-peek-toggle"), "border_color"), ["#ffb547"], "not lit");
  host.shared.set("ram.zoom", "space"); host.calls = [];
  t = HR(); await settle();
  assert.deepEqual(toggles("ram-rams"), [], "the space level has no sticks anyway");
  assert.deepEqual(op(withId(t, "ram-peek-toggle"), "border_color"), ["#ffb547"], "its P is the peek strip's, on");
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  HR(); await settle();
  assert.deepEqual(toggles("ram-rams"), [], "back in meta: still hidden");
  click(HR(), "ram-peek-toggle");
  HR(); await settle();
  assert.deepEqual(toggles("ram-rams"), [SHOW("ram-rams")], "P again: back");
  assert.equal(host.shared.get("ram.sticks"), true);
  // Hidden, the sticks' copy reads nothing (as in the space level).
  const tb = host.timers.length;
  const rv = view({ role: "rams" });
  const [gitT, exitsT, tailsT] = host.timers.slice(tb);
  assert.deepEqual([gitT.ms, exitsT.ms, tailsT.ms], [250, 10000, 2000]);
  const ran = { git: 0, exits: 0, tails: 0 };
  rv.gitInfo.tick = () => ran.git++; rv.checkExits = () => ran.exits++; rv.readTails = () => ran.tails++; rv.update = () => {};
  host.shared.set("ram.sticks", false);
  gitT.fn(cx); exitsT.fn(cx); tailsT.fn(cx);
  assert.deepEqual(ran, { git: 0, exits: 0, tails: 0 }, "hidden in meta: nothing");
  host.shared.delete("ram.sticks");
  gitT.fn(cx); exitsT.fn(cx); tailsT.fn(cx);
  assert.deepEqual(ran, { git: 1, exits: 1, tails: 1 }, "shown: its git, the exit history and the last lines");
  // A copy that starts (the app, a reload) keeps what the layout has for its level.
  host.shared.delete("ram.side.hidden");
  sidebarNode().hidden = true;
  const fresh = view({}); host.calls = [];
  R(fresh, {}); await settle();
  assert.deepEqual(toggles("sidebar"), [], "nothing shown or hidden at the start");
  assert.deepEqual(kept(), { meta: true }, "meta keeps the hidden column it started with");
  host.layout = null; host.calls = [];
  host.shared.clear(); for (const [k, v] of saved) host.shared.set(k, v);
}
console.log("PASS: each level keeps its side column shown or hidden (b, ^b b) and its own P (meta: the sticks, the space level: the peek strip); the level's own show never counts; ^b d shows meta's column");

// ---- The main stick (0x00 @) ---------------------------------------------------------------
// git.js: each changed file with its Changes-panel letter and its +/- line counts.
{
  const { Git: G } = await import(gitURL);
  host.repoOut = { "/repo/z": { top: "/repo/z", common: "/repo/z/.git", numstat: "12\t3\tsrc/app.ts\u00000\t40\told.txt\u0000",
    status: "# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +1 -0\n" +
      "1 .M N... 100644 100644 100644 h1 h2 src/app.ts\n1 D. N... 100644 000000 000000 h1 h2 old.txt\n? new.md\n" } };
  const g = new G();
  await g.check(JSON.stringify([null, "/repo/z"]), cx);
  const z = g.git[JSON.stringify([null, "/repo/z"])];
  assert.deepEqual([z.name, z.branch, z.ahead, z.dirty, z.upstream, z.initial], ["z", "main", 1, 3, true, false]);
  assert.deepEqual(z.files, [
    { xy: "M", status: "M", path: "src/app.ts", add: 12, del: 3, binary: false },
    { xy: "D", status: "D", path: "old.txt", add: 0, del: 40, binary: false },
    { xy: "?", status: "A", fresh: true, path: "new.md", add: 0, del: 0, binary: false }]);
  assert.deepEqual(host.numstats.at(-1).slice(-5), ["diff", "HEAD", "--numstat", "-z", "--no-renames"]);
  // No commit yet: staged and unstaged changes (no HEAD to compare with).
  host.repoOut["/repo/z"].status = "# branch.oid (initial)\n# branch.head main\n? a.txt\n";
  host.numstats = [];
  await g.check(JSON.stringify([null, "/repo/z"]), cx);
  assert.equal(g.git[JSON.stringify([null, "/repo/z"])].initial, true);
  assert.deepEqual(host.numstats.map(a => a.slice(5, -3)), [["diff", "--cached"], ["diff"]]);
  host.repoOut = null;
}
// In meta the side column (role side) is the main stick, over .rodata and the keys.
const aside = view({ role: "side" });
aside.size = { width: 390, height: 700 };
const AS = () => R(aside, { role: "side" });
const apiGit = { name: "herdr", branch: "feat-x", ahead: 2, behind: 1, dirty: 3, upstream: true, initial: false, top: "/repo/api",
  repo: JSON.stringify([null, "/repo/api/.git"]),
  files: [{ xy: "M", status: "M", path: "src/app.ts", add: 12, del: 3 }, { xy: "?", status: "A", fresh: true, path: "notes.md", add: 0, del: 0 },
    { xy: "D", status: "D", path: "old.txt", add: 0, del: 40 }] };
const webGit = { name: "web", branch: "main", ahead: 0, behind: 0, dirty: 0, upstream: true, top: "/repo/web", repo: JSON.stringify([null, "/repo/web/.git"]), files: [] };
aside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = apiGit;
aside.gitInfo.git[JSON.stringify([null, "/repo/web"])] = webGit;
spaces[0].folder = "/repo/api"; spaces[1].folder = "/repo/web";
host.shared.set("ram.zoom", "meta");
aside.all.setMode("memory");
let at2 = AS();
const allStick = withId(at2, "ram-all");
assert(allStick, "in meta the side column is the main stick");
const underIt = (1 + 30 * 1.25) + (1 + 2 * 3 * 1.25 + 28 * 1.25);  // .rodata (no machine yet) and the keys
assert.deepEqual([op(allStick, "w")[0], op(allStick, "h")[0]], [390 - 2 - 2 * 6 * 1.25, 700 - 2 - underIt - 2 * 6 * 1.25],
  "it fills the column over .rodata and the keys");
const metaIds = flatten(at2).map(idOf);
for (const id of ["ram-side-all", "ram-machines", "ram-settings", "ram-keys", "ram-commands"]) assert(metaIds.includes(id), id);
assert(metaIds.indexOf("ram-all") < metaIds.indexOf("ram-machines") && metaIds.indexOf("ram-machines") < metaIds.indexOf("ram-settings"),
  "the main stick, then .rodata, then the keys");
assert(!metaIds.some(id => /^(stack|heap)-/.test(id ?? "") || ["ram-stack", "ram-heap", "ram-git"].includes(id)),
  "no small stack in meta: the main stick has the spaces, the agents and the git");
assert.deepEqual(textOf(withId(at2, "ram-all-head")).slice(0, 2), ["0x00", "@"], "the main stick is called @");
assert(textOf(at2).includes("STACK \u2193  4"), "STACK counts the spaces");
// memory: every space as a tree of its changed files, each with its marks.
for (const sp of spaces) assert(withId(at2, `all-space-${sp.id}`) && withId(at2, `all-group-${sp.id}`), sp.id);
assert.deepEqual(textOf(withId(at2, "all-space-s0")), ["\u25be", "0x01", "api", "\u21912", "\u21931", "\u00b13", "!2"], "t2 and its sub-agent need you");
assert.deepEqual(textOf(withId(at2, "all-space-s1")), ["", "0x02", "web", "\u2713", "!1"], "a clean space: no arrow, just ✓");
assert.deepEqual(textOf(withId(at2, "all-file-s0:src/app.ts")), ["M", "src/", "app.ts", "+12", "\u22123"],
  "as the Changes panel: letter, folder/ name, +added −removed");
assert.deepEqual(textOf(withId(at2, "all-file-s0:old.txt")), ["D", "", "old.txt", "\u221240"]);
assert(withId(at2, "all-file-s0:notes.md"));
// A tree: a space's files start one step (12) in from where its address does, so
// they read as its rows, not as more spaces. Several repos in one space: each repo
// one step in, its files another.
{
  const spaceRow = withId(at2, "all-space-s0");
  const addrX = op(spaceRow, "px")[0] + op(withId(at2, "all-fold-s0"), "w")[0] + op(spaceRow, "gap")[0];
  const step = 12 * 1.25;
  for (const id of ["all-file-s0:src/app.ts", "all-file-s0:old.txt", "all-file-s0:notes.md"])
    assert.equal(op(withId(at2, id), "pl")[0], addrX + step, `${id}: one step in from its space's address`);
  const s0 = spaces[0], r = { ...apiGit, name: "herdr" }, f = apiGit.files[0], t = host.colors;
  assert.equal(op(aside.all.row({ kind: "repo", s: s0, r }, {}, t), "pl")[0], addrX + step, "a repo: one step in");
  assert.equal(op(aside.all.row({ kind: "file", s: s0, r, f, depth: 2 }, {}, t), "pl")[0], addrX + 2 * step, "its files: two");
  assert.equal(op(aside.all.row({ kind: "more", n: 3, depth: 2 }, {}, t), "pl")[0], addrX + 2 * step + 2 * 1.25, "its +n more, with them");
  assert.equal(op(aside.all.row({ kind: "more", n: 3, depth: 1 }, {}, t), "pl")[0], addrX + step + 2 * 1.25);
}
host.calls = [];
click(at2, "all-space-s1");
assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab1-0" } }], "at its BP tab (SP goes there)");
assert.equal(host.shared.get("ram.zoom"), "meta", "a space in the tree selects it, still in meta");
click(at2, "all-fold-s0");
at2 = AS();
assert(!withId(at2, "all-file-s0:src/app.ts") && textOf(withId(at2, "all-space-s0"))[0] === "\u25b8", "the arrow folds a space");
click(at2, "all-fold-s0");
at2 = AS();
assert(withId(at2, "all-file-s0:src/app.ts"), "and unfolds it");
// As the space level's stack: + pushes a new space, a double-click renames one;
// a press on the fold arrow is the arrow's own (no drag, no rename).
host.calls = [];
click(at2, "ram-all-space-new");
assert.deepEqual(host.calls.at(-1), { name: "space.new", args: undefined }, "+ pushes a new space");
withId(at2, "all-space-s3").handlers["on_mouse_down:left"]({ click_count: 2 }, cx);
assert.deepEqual(host.calls.at(-1), { name: "space.rename", args: { id: "s3" } }, "a double-click renames it");
aside.drag = null; host.stopped = false;
const callsNow = host.calls.length;
withId(at2, "all-fold-s0").handlers["on_mouse_down:left"]({ click_count: 2 }, cx);
assert(host.stopped && aside.drag === null && host.calls.length === callsNow, "pressing the arrow starts no drag and renames nothing");
// HEAP: every agent from every space, the oldest at the bottom; a click shows it, in meta.
const allHeap = flatten(withId(at2, "ram-all")).map(idOf).filter(id => id?.startsWith("all-heap-"));
// Short of room: the ones that need you stay, then the newest; "+n more" says the rest.
assert.deepEqual(allHeap, ["all-heap-child", "all-heap-t10", "all-heap-t9", "all-heap-t8", "all-heap-remote/t7", "all-heap-t6", "all-heap-t2"]);
assert(textOf(withId(at2, "ram-all")).includes("+4 more blocks") && textOf(withId(at2, "ram-all")).includes("HEAP \u2191  11"));
// HEAP's label has room under it before the totals line, as a space stick's has before its git line.
{
  const box = flatten(withId(at2, "ram-all")).find(n => n.kids.some(k => idOf(k) === "ram-all-totals"));
  const kids = box.kids.filter(k => typeof k === "object");
  const heapLabel = kids.findIndex(k => k.kids.includes("HEAP \u2191  11")), totalsAt = kids.findIndex(k => idOf(k) === "ram-all-totals");
  assert.deepEqual([totalsAt - heapLabel, idOf(kids[heapLabel + 1]), op(kids[heapLabel + 1], "h")[0]], [2, "ram-all-heap-gap", 8 * 1.25],
    "a gap of 8 * U between HEAP's label and the totals");
  // And the memory view fits its box at any height of the column.
  for (let height = 330; height <= 1100; height += 10) {
    aside.size = { width: 390, height };
    const stick = withId(AS(), "ram-all"), inner = stick.kids[0];
    assert(heightOf(inner) + 6 * 1.25 <= op(stick, "h")[0] + 1e-9, `${height} px: the main stick needs ${heightOf(inner) + 6 * 1.25} of ${op(stick, "h")[0]}`);
  }
  aside.size = { width: 390, height: 700 };
}
aside.size = { width: 390, height: 1400 };
const tallHeap = flatten(withId(AS(), "ram-all")).map(idOf).filter(id => id?.startsWith("all-heap-"));
assert.equal(tallHeap.length, 11, "room for every agent of every space");
assert.equal(tallHeap.at(-1), "all-heap-t1", "the oldest at the bottom");
aside.size = { width: 390, height: 700 };
assert.equal(textOf(withId(at2, "all-heap-t6"))[0], "web", "each row says its space");
host.calls = [];
click(at2, "all-heap-t6");
assert.deepEqual(host.calls, [{ name: "agent.focus", args: { terminal: "t6" } }]);
assert.equal(host.shared.get("ram.zoom"), "meta");
assert.deepEqual(textOf(withId(at2, "ram-all-totals")), ["@", "\u21912", "\u21931", "\u00b13"], "every repo added up, under @");
// A file opens it in the changes view: its diff, and the commit box for its repo.
host.diffText = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,3 @@\n one\n-two\n+TWO\n+three\n";
host.execs = [];
click(at2, "all-file-s0:src/app.ts");
await settle();
assert.equal(aside.all.mode, "changes");
assert.equal(host.shared.get("ram.all.mode"), "changes", "the view is shared, so ^b d (the strip's copy) can switch it");
assert.deepEqual(host.execs.at(-1), { command: "git", args: ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false",
  "diff", "HEAD", "--no-ext-diff", "--no-textconv", "--no-color", "--", "src/app.ts"], opts: { cwd: "/repo/api", on: null } });
at2 = AS();
assert.deepEqual(textOf(withId(at2, "ram-all-diff-head")), ["api \u00b7 src/app.ts", "+12", "\u22123", "\u00d7"]);
const diffText2 = textOf(withId(at2, "ram-all-diff"));
for (const want of ["@@ -1,2 +1,3 @@", "one", "two", "TWO", "three", "1", "2", "3"]) assert(diffText2.includes(want), want);
assert(!withId(at2, "all-space-s1"), "changes lists only the spaces with changes");
assert(textOf(at2).includes("3 files in 1 spaces") && textOf(at2).includes("+12") && textOf(at2).includes("\u221243"));
assert.deepEqual(op(withId(at2, "ram-all-toggle"), "border_color"), ["#ffb547"], "the toggle is lit");
assert.deepEqual(textOf(withId(at2, "ram-all-toggle")), ["d", "diff"], "it reads d diff (the user's word), not changes");
assert.equal(op(withId(at2, "ram-all-toggle"), "tooltip")[0], "Back to memory: the tree and every agent");
host.shared.set("ram.all.mode", "memory");
assert.deepEqual([textOf(withId(AS(), "ram-all-toggle")), op(withId(AS(), "ram-all-toggle"), "tooltip")[0]],
  [["d", "diff"], "Diff: each changed file's diff, and a commit box"], "in memory too");
host.shared.set("ram.all.mode", "changes");
assert.equal(textOf(withId(at2, "ram-all-commit")).at(-1), "Commit herdr", "the commit box is for that file's repo");
// w, next to changes: wrap the diff's long lines (off by default: one row each, scrolling sideways).
{
  const allMod = await import(await load("mods/ram/all.js"));
  const head = withId(at2, "ram-all-head");
  const headIds = head.kids.map(idOf);
  assert.deepEqual(headIds.slice(-2), ["ram-all-toggle", "ram-all-wrap"], "w right after the changes box");
  assert.deepEqual([textOf(withId(at2, "ram-all-wrap")), op(withId(at2, "ram-all-wrap"), "size")[0]], [["w"], 15 * 1.25]);
  assert.notDeepEqual(op(withId(at2, "ram-all-wrap"), "border_color"), ["#ffb547"], "off by default");
  assert(withId(at2, "ram-all-diff-x"), "off: the rows scroll sideways together");
  const long = "const answer = compute(alpha, beta, gamma) + more(delta)\t// a tab, \u4e2d\u6587 and long text past any narrow stick";
  host.diffText = `diff --git a/src/app.ts b/src/app.ts\n@@ -1,2 +1,3 @@\n one\n-two\n+${long}\n+three\n`;
  aside.all.load(cx); await settle();
  const plain = textOf(withId(AS(), "ram-all-diff"));
  assert(plain.includes(long), "off: the long line is one row");
  click(at2, "ram-all-wrap");
  assert.equal(host.shared.get("ram.all.wrap"), true);
  for (const width of [390, 300, 760]) {
    aside.size = { width, height: 700 };
    const t2 = AS();
    assert.deepEqual(op(withId(t2, "ram-all-wrap"), "border_color"), ["#ffb547"], "on: lit");
    assert(!withId(t2, "ram-all-diff-x"), "on: nothing to scroll sideways");
    const stickW = width - 2 - 2 * 6 * 1.25;
    const cols = allMod.wrapColumns(stickW);
    const textArea = stickW - 2 - 32 * 1.25;
    assert(cols * 10.5 * 1.25 * 0.6 <= textArea - 12, `${width}: ${cols} columns fit ${textArea}`);
    const rows = flatten(withId(t2, "ram-all-diff")).filter(n => n.kind === "h_flex" && op(n, "h")?.[0] === 15 * 1.25);
    const pieces = rows.map(r => ({ number: textOf(r.kids[0])[0], text: textOf(r.kids[1])[0] }));
    const start = pieces.findIndex(p => p.text === allMod.cut(long, cols)[0]);
    const mine = allMod.cut(long, cols);
    assert(start >= 0 && mine.length > 1, `${width}: the long line wraps`);
    assert.deepEqual(pieces.slice(start, start + mine.length).map(p => p.text), mine);
    assert.equal(pieces[start].number, "2", "its first piece keeps the line's number");
    assert(pieces.slice(start + 1, start + mine.length).every(p => p.number === ""), "the rest go on under it with none");
    assert.equal(mine.join(""), long.replace(/\t/g, "    "), "no text lost (a tab is 4 spaces)");
    const colsOf = str => [...str].reduce((n, ch) => n + (/[\u4e00-\u9fff]/.test(ch) ? 2 : 1), 0);
    assert(mine.every(p => colsOf(p) <= cols), `${width}: every piece fits ${cols} columns (wide characters count 2)`);
    assert(rows[start].ops.some(([k, c]) => k === "bg" && c === "#7dff9b18") && rows[start + 1].ops.some(([k, c]) => k === "bg" && c === "#7dff9b18"),
      "pieces of an added line stay green");
  }
  assert.deepEqual(allMod.cut("", 10), [" "]);
  assert.deepEqual(allMod.cut("abcdef", 3), ["abc", "def"]);
  assert.deepEqual(allMod.cut("ab\u4e2dc", 3), ["ab", "\u4e2dc"], "a wide character doesn't split across the edge");
  click(AS(), "ram-all-wrap");
  assert.equal(host.shared.get("ram.all.wrap"), false, "and off again");
  aside.size = { width: 390, height: 700 };
  host.diffText = "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,3 @@\n one\n-two\n+TWO\n+three\n";
  aside.all.load(cx); await settle();
  at2 = AS();
}
// Commit: everything in that repo, as the Changes panel does.
const msgInput = aside.all.input;
assert.equal(msgInput.opts.placeholder, "Commit message");
msgInput.set_value("fix the app"); msgInput.handlers.change({}, cx);
host.execs = [];
click(AS(), "ram-all-commit");
await settle();
assert.deepEqual(host.execs.slice(0, 2).map(e => [e.args, e.opts.cwd]), [[["add", "-A"], "/repo/api"], [["commit", "-m", "fix the app"], "/repo/api"]]);
assert.equal(aside.all.sel, null, "committed: the diff closes");
assert.equal(msgInput.value(), "", "and the message clears");
// It also looked at the repo again (here the stub's git says "not a repo"); put the fixture back.
assert(host.execs.some(e => e.args.includes("status") && e.opts.cwd === "/repo/api"), "the repo is checked again after a commit");
aside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = apiGit;
// A failed commit says why and keeps the file.
click(AS(), "all-file-s0:src/app.ts"); await settle();
msgInput.set_value("again"); msgInput.handlers.change({}, cx);
host.commitCode = 1; host.commitErr = "nothing to commit";
click(AS(), "ram-all-commit"); await settle();
aside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = apiGit;
assert(textOf(AS()).includes("Commit failed: nothing to commit") && aside.all.sel?.path === "src/app.ts");
host.commitCode = 0; host.commitErr = "";
// A new file shows its text, all added; clicking the open file again closes it.
host.files = { "/repo/api/notes.md": "first\nsecond\n" };
click(AS(), "all-file-s0:notes.md"); await settle();
assert.deepEqual(host.reads.at(-1), { path: "/repo/api/notes.md", opts: { on: null } });
const newText = textOf(withId(AS(), "ram-all-diff"));
assert(newText.includes("@@ -0,0 +1,2 @@") && newText.includes("first") && newText.includes("second"), newText.join("|"));
click(AS(), "all-file-s0:notes.md");
assert.equal(aside.all.sel, null, "the same file again: closed");
// The file goes (committed elsewhere): the selection goes with it.
click(AS(), "all-file-s0:old.txt"); await settle();
aside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = { ...apiGit, dirty: 2, files: apiGit.files.slice(0, 2) };
AS();
assert.equal(aside.all.sel, null);
aside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = apiGit;
// No space has anything uncommitted: the diff view says so, without the word "changes".
{
  assert.equal(aside.all.mode, "changes");
  const keys2 = Object.keys(aside.gitInfo.git), saved = keys2.map(k => aside.gitInfo.git[k]);
  for (const k of keys2) aside.gitInfo.git[k] = { ...aside.gitInfo.git[k], dirty: 0, files: [] };
  const cleanText = textOf(AS());
  assert(cleanText.includes("Nothing uncommitted in any space") && !cleanText.some(x => /changes/i.test(x)), cleanText.join("|"));
  keys2.forEach((k, i) => { aside.gitInfo.git[k] = saved[i]; });
}
// The toggle, and ^b d (the strip's copy gets it; outside meta it shows meta in changes).
click(AS(), "ram-all-toggle");
assert.equal(aside.all.mode, "memory");
host.shared.set("ram.zoom", "space");
assert.equal(keysFile[`mod:${BAR}`].d, `${BAR}.ram.changes`);
host.waiting = [];
const cmap = view({}); await settle();
host.waiting.at(-1)("changes"); await settle();
assert.deepEqual([host.shared.get("ram.zoom"), aside.all.mode], ["meta", "changes"], "^b d from the space level: meta, in changes");
host.waiting.at(-1)("changes"); await settle();
assert.equal(aside.all.mode, "memory", "in meta it switches the view");
assert(cmap.sessions, "(the strip's copy runs the command loop)");
host.shared.set("ram.zoom", "space");
spaces[1].folder = "";  // api keeps /repo/api, as the side section set it
console.log("PASS: main stick (0x00 @): meta's side column over .rodata and the keys (no small stack there); memory = every space's changed files as a tree (+, double-click rename, drag) and every agent; changes = diff and commit box by space; ^b d");

// ---- ^b g: lazygit, as GIT's click ------------------------------------------------------
assert.equal(keysFile[`mod:${BAR}`].g, `${BAR}.lazygit`, "^b g is bound in every layout (the key bar sends RAM's to ram.git)");
const cmdMap = view({});
await settle();
// The strip copy's command loop: each command it takes, it waits for the next one
// (other copies wait on theirs too, so this one's is kept by hand).
let cmdNext = host.waiting.at(-1);
const send = async c => { const w = cmdNext, before = host.waiting.length; w(c); await settle(); cmdNext = host.waiting.slice(before).at(-1); };
cmdMap.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
host.execs = []; host.notes = []; host.calls = []; host.hcs = [];
await send("git");
assert.deepEqual(host.execs.at(-1)?.args, ["do", "tab.new", "--space", "s0", "--name", "lazygit api", "--folder", "/repo/api",
  "--argv", '["exec","lazygit"]'], "^b g opens lazygit at the repo of the space you work in, as clicking GIT does");
assert.equal(host.notes.length, 0);
// Not a repo: GIT's dialog (role git-init) asks what lazygit would ask there, and
// nothing opens yet.
spaces[0].folder = "/home/tester/notes";
for (const copy of [cmdMap, side]) copy.gitInfo.git[JSON.stringify([null, "/home/tester/notes"])] = null;
host.execs = []; host.hcs = []; host.overlays = []; host.shared.set("ram.zoom", "meta");
await send("git");
assert.equal(host.execs.filter(e => e.command === "herdr-app").length, 0, "nothing opens yet");
assert.deepEqual(host.overlays.at(-1), { mod: "ram", kind: "dialog", width: 520, height: 340,
  props: { role: "git-init", space: "s0", name: "api", folder: "/home/tester/notes", machine: null } }, "the dialog, for that folder");
assert.equal(host.notes.length, 0, "no toast for that");
assert.equal(host.shared.get("ram.zoom"), "meta", "and the level stays");
host.shared.set("ram.zoom", "space");
let gt = R(side, { role: "side" });
assert.deepEqual(textOf(withId(gt, "ram-git-line")), ["GIT", "not a repo", "^b g"], "GIT's line says it's not a repo");
host.overlays = [];
click(gt, "ram-git"); await settle();
assert.equal(host.overlays.at(-1)?.props?.role, "git-init", "and clicking it asks too");
// A lazygit tab open there already (lazygit ran there before): it shows instead.
spaces[0].tabs.push({ id: "tabLGN", name: "lazygit notes", named: true, index: 3, active: false, settled: false, status: null });
panes.push({ pane: "pLGN", terminal: "tLGN", tab: "tabLGN", title: "lazygit", status: null, focused: false, cwd: "/home/tester/notes", program: { name: "lazygit" } });
raw.push({ address: "tLGN", state: "live", created_ms: 9990, labels: { "ram.lazygit": "/home/tester/notes" } });
host.overlays = []; host.calls = [];
await send("git");
assert.deepEqual([host.overlays.length, host.calls.at(-1)], [0, { name: "tab.select", args: { id: "tabLGN" } }], "its tab shows, no dialog");
spaces[0].tabs.pop(); panes.pop(); raw.pop();
host.notes = [];
await send("hunk");
assert.match(host.notes.at(-1)?.body ?? "", /hunk has nothing to open/, "^b r without a repo says so (hunk needs one)");
// No folder at all: nowhere to open it.
spaces[0].folder = ""; host.execs = []; host.notes = [];
await send("git");
assert.deepEqual([host.execs.length, host.notes.at(-1)?.title, host.notes.at(-1)?.body], [0, "Nowhere for lazygit", "api has no folder yet."]);
spaces[0].folder = "/repo/unchecked";
await send("git");
assert.equal(host.notes.at(-1)?.title, "Checking git", "not looked at yet: try again in a moment");
spaces[0].folder = "/repo/api";

// ---- ^b /: the search window (search.js) over the window (the space level's / search) -------
assert.equal(keysFile[`mod:${BAR}`]["/"], `${BAR}.rg`, "^b / is bound in every layout (the key bar sends RAM's to ram.rg)");
{
  host.shared.set("ram.zoom", "space");
  side.gitInfo.git[JSON.stringify([null, "/repo/api"])] ??= cmdMap.gitInfo.git[JSON.stringify([null, "/repo/api"])];
  const shellPane = panes.find(p => p.pane === "shell-pane");
  let st = R(side, { role: "side" });
  const sb = withId(st, "ram-rg");
  assert(sb, "the space level's top row has search's button");
  assert.deepEqual(textOf(sb), ["/", "search"], "its key, then search, as meta's d diff");
  assert.equal(op(sb, "tooltip")[0], "Search api  ^b /");
  const row = flatten(st).find(n => n.kids.includes(sb));
  assert.deepEqual(row.kids.slice(1).map(idOf), [undefined, "ram-rg", "ram-space-new"], "STACK's row: ^b w, search, then +");
  assert.deepEqual(textOf(row.kids[1]), ["^b w"]);
  // A click: the window, for the terminal you're in: its folder and its repo's top
  // (git asked there); what you pick goes to it.
  shellPane.cwd = "/repo/api/src";
  host.focused = { space: "s0", tab: "tab0-0", pane: "shell-pane", terminal: "shell", cwd: "/repo/api/src" };
  host.overlays = []; host.execs = []; host.calls = [];
  click(st, "ram-rg"); await settle();
  const o = host.overlays.at(-1);
  assert(o?.props?.at > 0, "it carries its mark");
  assert.deepEqual(o, { mod: "ram", kind: "dialog", width: 0.9, height: 0.86, props: { role: "search", at: o.props.at, space: "s0",
    name: "api", machine: null, target: { pane: "shell-pane", terminal: "shell" }, folder: "/repo/api/src", repo: "/repo/api" } },
    "a dialog over the window: the terminal's folder, its repo, and where picks go");
  assert.equal(host.shared.get(S.SEARCH_TOP), o.props.at, "the newest window's mark (an older one closes)");
  assert.deepEqual(host.execs.find(e => e.command === "git")?.args, ["rev-parse", "--show-toplevel"]);
  assert.equal(host.execs.find(e => e.command === "git")?.opts?.cwd, "/repo/api/src");
  assert.equal(host.calls.filter(c => c.name === "tab.new").length, 0, "no tab of its own any more");
  // ram.rg (^b / in RAM) does the same, and the level stays.
  host.shared.set("ram.zoom", "meta"); host.overlays = [];
  await send("rg");
  assert.equal(host.overlays.at(-1)?.props?.folder, "/repo/api/src", "^b / opens it as the button does");
  assert.equal(host.shared.get("ram.zoom"), "meta", "in meta, where you are");
  host.shared.set("ram.zoom", "space");
  // The keyboard in a mod's pane (no terminal): the space's repo, nowhere to paste.
  delete shellPane.cwd;   // (so the space is at its own folder, whose git RAM knows)
  host.focused = { space: "s0", tab: "tab0-0", pane: "pMOD", terminal: null, cwd: "/home/tester/elsewhere" }; host.overlays = [];
  const apiGitKey = JSON.stringify([null, "/repo/api"]), apiGit = cmdMap.gitInfo.git[apiGitKey];
  cmdMap.gitInfo.git[apiGitKey] = { ...apiGit, top: "/repo/api-top" };
  await send("rg");
  cmdMap.gitInfo.git[apiGitKey] = apiGit;
  assert.deepEqual([host.overlays.at(-1)?.props?.folder, host.overlays.at(-1)?.props?.repo, host.overlays.at(-1)?.props?.target],
    ["/repo/api-top", "/repo/api-top", null], "no terminal: the space's repo (as its tools open it); picks are copied");
  // The keyboard in another space's terminal: this space's repo, nowhere to paste.
  host.focused = { space: "s1", tab: "tab1-0", pane: "p5", terminal: "t6", cwd: "/repo/web" }; host.overlays = [];
  click(R(side, { role: "side" }), "ram-rg"); await settle();
  assert.deepEqual([host.overlays.at(-1)?.props?.space, host.overlays.at(-1)?.props?.folder, host.overlays.at(-1)?.props?.target],
    ["s0", "/repo/api", null], "the button's space, not the other one's terminal");
  // Not in a repo: that folder, no repo.
  shellPane.cwd = "/home/tester/notes";
  host.focused = { space: "s0", tab: "tab0-0", pane: "shell-pane", terminal: "shell", cwd: "/home/tester/notes" }; host.overlays = [];
  await send("rg");
  assert.deepEqual([host.overlays.at(-1)?.props?.folder, host.overlays.at(-1)?.props?.repo], ["/home/tester/notes", null]);
  // Nowhere at all: a toast.
  delete shellPane.cwd;
  host.focused = null; spaces[0].folder = ""; host.overlays = []; host.notes = [];
  await send("rg");
  assert.deepEqual([host.overlays.length, host.notes.at(-1)?.title, host.notes.at(-1)?.body], [0, "Nowhere to search", "api has no folder yet."]);
  spaces[0].folder = "/repo/api"; host.notes = [];
  // Only the space level has the button (meta's column is the main stick).
  host.shared.set("ram.zoom", "meta");
  assert(!withId(R(side, { role: "side" }), "ram-rg"), "not in meta");
  host.shared.set("ram.zoom", "space");
  // (The side column as it was, so the peek strip's height is as before.)
  R(side, { role: "side" }); R(map, {}); await settle();
}
console.log("PASS: ^b / and the space level's / search: the search window over the window, for the terminal you're in (its folder and repo; no terminal: the space's repo, picks copied); the level stays");

// ---- The search window itself (role search) ------------------------------------------------
{
  const DIR = n => `/tmp/T/ram-search.R${String(n).padStart(5, "0")}`;
  const runs = [], stops = [], bats = [], rgJson = [];
  host.execHook = (command, args, opts) => {
    if (command === "sh" && args[1] === S.RUN_SH) {
      const n = runs.push({ args: args.slice(3), opts });
      return { code: 0, stdout: `${4000 + n}\n${DIR(n)}\n`, stderr: "" };
    }
    if (command === "sh" && args[1] === S.STOP_SH) { stops.push(args.slice(3)); return { code: 0, stdout: "", stderr: "" }; }
    if (command === "env" && args[1] === "bat") { bats.push({ args, opts }); return { code: 0, stdout: batText(args), stderr: "" }; }
    if (command === "rg" && args[0] === "--json") { rgJson.push({ args, opts }); return { code: 0, stdout: host.rgJsonOut ?? "", stderr: "" }; }
    return null;
  };
  const filesBefore = host.files;
  host.files = {};
  host.bindings = [];
  let batText = a => {
    const [from, to] = a[a.indexOf("--line-range") + 1].split(":").map(Number);
    return Array.from({ length: Math.min(to, 5) - from + 1 }, (_, i) => from + i === 4 ? "x".repeat(200)
      : from + i === 5 ? "\x1b[38;5;196mred\x1b[0m" : `\x1b[38;2;117;113;94m// line ${from + i}\x1b[0m`).join("\n") + "\n";
  };
  const M = "\x1b[0m\x1b[1m\x1b[31m", E = "\x1b[0m";
  const line = (f, l, c, text) => [f, l, c, text].join("\x1f");
  const props0 = { role: "search", at: 111, space: "s0", name: "api", machine: null, overlay: "o9",
    target: { pane: "shell-pane", terminal: "shell" }, folder: "/repo/api/src", repo: "/repo/api" };
  host.shared.set(S.SEARCH_TOP, 111);
  host.shared.delete(S.SEARCH_LAST);
  host.keyboard = null;
  const sv = view(props0);
  await settle();
  const SV = () => R(sv, props0);
  const poll = host.timers.filter(t => t.ms === 40).at(-1).fn;
  const look = async () => { await poll(cx); await settle(); };
  const keyOn = (tree, keystroke, extra = {}) => {
    host.stopped = false;
    withId(tree, "ram-search").handlers.on_key_down({ key: keystroke.split("-").pop(), keystroke, modifiers: {}, ...extra }, cx);
  };
  const press = async (keystroke, extra) => { keyOn(SV(), keystroke, extra); await settle(); };
  const type = async text => { for (const ch of text) { keyOn(SV(), ch, { key_char: ch }); await settle(); } };
  const args = n => runs[n - 1].args;
  // It takes the keyboard, binds tab and shift-tab in its own key context (the
  // UI kit's root would take them), and searches at once: the repo, an empty
  // query (the files), every option off.
  assert.equal(host.keyboard, sv.searchView.handle, "the window has the keyboard");
  assert.deepEqual(host.bindings, [{ keystroke: "tab", action: "ram_search.next", context: "RamSearch" },
    { keystroke: "shift-tab", action: "ram_search.prev", context: "RamSearch" }]);
  let tree = SV();
  assert.deepEqual(op(withId(tree, "ram-search"), "key_context"), ["RamSearch"]);
  assert(withId(tree, "ram-search").handlers["on_action:ram_search.next"] && withId(tree, "ram-search").handlers["on_action:ram_search.prev"]);
  assert.equal(runs.length, 1, "one run");
  assert.deepEqual(args(1), ["", "", "content", "", "", "", "", "default", "", "", "1"], "nothing to stop, the files, a sweep of old folders");
  assert.deepEqual(runs[0].opts, { cwd: "/repo/api", on: null }, "in the repo");
  assert(textOf(tree).includes("Searching\u2026"), "nothing yet");
  // Results stream in: whole lines only, chunk after chunk.
  host.files[`${DIR(1)}/000000`] = "src/main.rs\nREADME.md\nsrc/li";
  await look();
  assert.deepEqual(sv.searchView.rows.map(r => r.file), ["src/main.rs", "README.md"], "the whole lines so far");
  host.files[`${DIR(1)}/000000`] = "src/main.rs\nREADME.md\nsrc/lib.rs\n";
  host.files[`${DIR(1)}/end`] = "";
  await look();
  assert.deepEqual(sv.searchView.rows.map(r => [r.kind, r.file]), [["file", "src/main.rs"], ["file", "README.md"], ["file", "src/lib.rs"]]);
  tree = SV();
  assert.equal(textOf(withId(tree, "search-count")).join(""), "3 files", "done: how many");
  assert(withId(tree, "search-row-0") && withId(tree, "search-row-2") && !withId(tree, "search-row-3"));
  // A chunk that's full means the next one: a run's lines come in files of CHUNK.
  // Typing searches again: the run before is stopped by the next one's script,
  // and its rows stay until the new one's first lines.
  await type("hel");
  assert.equal(sv.searchView.field(), "hel");
  assert.deepEqual(args(2).slice(0, 4), ["4001", DIR(1), "content", "h"], "the first key: run 2 stops run 1");
  assert.deepEqual(args(4).slice(0, 4), ["4003", DIR(3), "content", "hel"], "each key, the newest wins");
  assert.equal(sv.searchView.rows.length, 3, "the files stay until the new lines come");
  {
    // In words on every part: the pick boxes' and the clear button's tooltips too.
    const t2 = SV(), tips = flatten(t2).flatMap(n => n.ops.filter(o => o[0] === "tooltip").map(o => o[1]));
    assert(withId(t2, "search-pick-0") && withId(t2, "search-clear"), "(rows and a query, so both show)");
    for (const x of [...textOf(t2), ...tips]) assert(!/[\u2325\u21e5\u21e7\u23ce\u2318\u232b]|\^[a-z]/.test(x), `in words: ${x}`);
    assert.equal(op(withId(t2, "search-clear"), "tooltip")[0], "Clear the query  Cmd-Backspace");
    assert.equal(op(withId(t2, "search-pick-0"), "tooltip")[0], "Pick  Tab");
  }
  host.files[`${DIR(4)}/000000`] = [line("src/main.rs", 2, 15, `    println!("${M}hel${E}lo");`),
    line("a.txt", 1, 1, `${M}Hel${E}lo world`), line("a.txt", 3, 11, `\tindented ${M}hel${E}lo`)].join("\n") + "\n";
  host.files[`${DIR(4)}/end`] = "";
  await look();
  const rows = sv.searchView.rows;
  assert.deepEqual(rows.map(r => [r.kind, r.file, r.line, r.col]), [["match", "src/main.rs", 2, 15], ["match", "a.txt", 1, 1], ["match", "a.txt", 3, 11]]);
  tree = SV();
  assert.equal(textOf(withId(tree, "search-count")).join(""), "3 lines");
  const r0 = withId(tree, "search-row-0");
  assert.deepEqual(textOf(r0), ["src/", "main.rs", ":2:15", "println!(\"", "hel", "lo\");"], "where it is, then the line, its indent dropped");
  assert(flatten(r0).some(n => n.kids.includes("hel") && op(n, "text_color")?.[0] === "#ffb547"), "the match in amber");
  assert.deepEqual(op(r0, "bg"), ["#ffb5471f"], "the cursor's row is lit");
  // The preview: bat, around the line, in its colors; the line lit, numbered.
  tree = SV(); await settle(); tree = SV();
  const batMain = bats.find(b => b.args.at(-1) === "src/main.rs");
  assert.deepEqual(batMain.args, ["COLORTERM=truecolor", "bat", "--color=always", "--paging=never", "--wrap=never", "--style=plain", "--tabs=4",
    "--line-range", "1:331", "--", "src/main.rs"], "bat for the file, plain style (the window draws the rest), your theme");
  assert.deepEqual(batMain.opts, { cwd: "/repo/api", on: null, timeout: 15000 });
  assert.equal(bats.filter(b => b.args.at(-1) === "src/main.rs").length, 1, "once: its lines are kept while the window is open");
  const pv = withId(tree, "search-pv");
  assert(pv, "the preview shows");
  assert.deepEqual(textOf(withId(pv, "search-pv-head")), ["src/main.rs:2", "1\u20135"]);
  const pvLine = withId(pv, "search-pv-2-0");
  assert.deepEqual(textOf(pvLine), ["2", "// line 2"], "its number, then bat's text");
  assert.deepEqual(op(pvLine, "bg"), ["#ffb5472e"], "the match's line is lit");
  assert(flatten(pvLine).some(n => n.kids.includes("// line 2") && op(n, "text_color")?.[0] === "#75715e"), "in bat's color");
  assert(!withId(pv, "search-pv-6-0"), "the file ends at 5");
  assert(flatten(withId(pv, "search-pv-5-0")).some(n => n.kids.includes("red") && op(n, "text_color")?.[0] === "#ff0000"), "256 colors too");
  // A long line is cut at the preview's edge; ⌥w wraps it (rows that continue it
  // have no number).
  assert(withId(SV(), "search-pv-4-0") && !withId(SV(), "search-pv-4-1"), "cut");
  await press("alt-w");
  tree = SV();
  assert(withId(tree, "search-pv-4-2") && !withId(tree, "search-pv-4-3"), "wrapped: 200 characters on three rows");
  assert.deepEqual(textOf(withId(tree, "search-pv-4-1"))[0], "", "no number on the rows that continue it");
  await press("alt-w");
  // ⌥n: no numbers; ⌥w: wrapped; ^p: no preview (and back).
  await press("alt-n");
  assert.deepEqual(textOf(withId(SV(), "search-pv-2-0")), ["// line 2"]);
  await press("alt-n");
  await press("ctrl-p");
  assert(!withId(SV(), "search-pv"), "^p hides the preview");
  await press("ctrl-p");
  assert(withId(SV(), "search-pv"));
  // Moving: the cursor and the preview go along; bat runs again for another file only.
  bats.length = 0;
  await press("down");
  tree = SV(); await settle();
  assert.equal(sv.searchView.cursor, 1);
  assert.deepEqual(bats.map(b => b.args.at(-1)), ["a.txt"], "a.txt's lines");
  bats.length = 0;
  await press("down"); SV(); await settle();
  assert.deepEqual(bats.length, 0, "the same file's lines are kept");
  assert.deepEqual(op(withId(SV(), "search-pv-3-0"), "bg"), ["#ffb5472e"], "its line lit now");
  await press("up"); await press("up"); await press("up");
  assert.equal(sv.searchView.cursor, 0, "the first row is as far as it goes");
  // ⇥ (bound, as an action): pick and go down; ⇧⇥ pick and go up; ^a all; ^z none.
  withId(SV(), "ram-search").handlers["on_action:ram_search.next"]({ action: "ram_search.next" }, cx);
  assert.deepEqual([...sv.searchView.picked].map(k => k.split("\x1f")[0]), ["src/main.rs"]);
  assert.equal(sv.searchView.cursor, 1);
  keyOn(SV(), "tab");
  assert.equal(sv.searchView.picked.size, 2, "a tab that comes as a key works too");
  keyOn(SV(), "shift-tab");
  assert.deepEqual([sv.searchView.picked.size, sv.searchView.cursor], [3, 1], "\u21e7\u21e5: picks and goes up");
  withId(SV(), "ram-search").handlers["on_action:ram_search.prev"]({ action: "ram_search.prev" }, cx);
  assert.deepEqual([sv.searchView.picked.size, sv.searchView.cursor], [2, 0], "as the bound action too");
  keyOn(SV(), "down");
  tree = SV();
  assert.equal(textOf(withId(tree, "search-picked")).join(""), "2 picked");
  assert.deepEqual(op(withId(tree, "search-pick-0"), "bg"), ["#ffb547"], "a picked row's box is filled");
  keyOn(SV(), "ctrl-z");
  assert.equal(sv.searchView.picked.size, 0);
  keyOn(SV(), "ctrl-a");
  assert.equal(sv.searchView.picked.size, 3);
  keyOn(SV(), "ctrl-z");
  // A click on a row: the cursor there; on its box: picked; a double-click: ^e.
  click(SV(), "search-pick-2");
  assert.equal(sv.searchView.picked.size, 1);
  click(SV(), "search-pick-2");
  assert.equal(sv.searchView.picked.size, 0);
  withId(SV(), "search-row-2").handlers.on_click({ click_count: 1, modifiers: {} }, cx);
  assert.equal(sv.searchView.cursor, 2);
  // Enter: the files (picked, else this row's), as shell words, at the prompt you
  // came from: its pane gets the keyboard, Herdr pastes, then the window closes.
  host.events = []; host.calls = []; host.clipboard = null;
  keyOn(SV(), "enter"); await settle();
  assert.equal(host.clipboard, "/repo/api/a.txt", "a.txt isn't under src (where the terminal is): its whole path");
  assert.deepEqual(host.events, ["run pane.focus", "run terminal.paste", "close o9"], "focus, paste, then close");
  assert.deepEqual(host.calls.slice(0, 2), [{ name: "pane.focus", args: { pane: "shell-pane" } }, { name: "terminal.paste", args: undefined }]);
  // The terminal at the repo's top: paths as found.
  const shellPaneOf = panes.find(p => p.pane === "shell-pane");
  shellPaneOf.cwd = "/repo/api";
  const sv2 = view(props0); await settle();
  const SV2 = () => R(sv2, props0);
  assert.deepEqual(runs.at(-1).args.slice(2, 4), ["content", "hel"], "the space's last search, again");
  const D2 = DIR(runs.length);
  host.files[`${D2}/000000`] = [line("we ird.txt", 1, 5, `x ${M}hel${E}lo`), line("src/main.rs", 2, 15, `${M}hel${E}lo`),
    line("src/main.rs", 9, 1, `${M}hel${E}p`)].join("\n") + "\n";
  host.files[`${D2}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  const k2 = (ks, extra = {}) => withId(SV2(), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx);
  k2("ctrl-a"); host.clipboard = null;
  k2("enter"); await settle();
  assert.equal(host.clipboard, "src/main.rs 'we ird.txt'", "each file once, sorted, quoted where it must be");
  // ^o: the lines, file:line:column:text, one a line.
  const sv3 = view(props0); await settle();
  const D3 = DIR(runs.length);
  host.files[`${D3}/000000`] = host.files[`${D2}/000000`]; host.files[`${D3}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  const k3 = (ks, extra = {}) => withId(R(sv3, props0), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx);
  k3("ctrl-a"); k3("ctrl-o"); await settle();
  assert.equal(host.clipboard, "we ird.txt:1:5:x hello\nsrc/main.rs:2:15:hello\nsrc/main.rs:9:1:help", "in the list's order");
  // ⌥⏎: JSON, the whole lines and matches from ripgrep's own JSON.
  const sv4 = view(props0); await settle();
  const D4 = DIR(runs.length);
  host.files[`${D4}/000000`] = host.files[`${D2}/000000`]; host.files[`${D4}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  host.rgJsonOut = [
    JSON.stringify({ type: "match", data: { path: { text: "src/main.rs" }, lines: { text: "hello there\n" }, line_number: 2, submatches: [{ match: { text: "hel" } }] } }),
    JSON.stringify({ type: "summary", data: {} })].join("\n");
  withId(R(sv4, props0), "ram-search").handlers.on_key_down({ key: "a", keystroke: "ctrl-a", modifiers: { control: true } }, cx);
  withId(R(sv4, props0), "ram-search").handlers.on_key_down({ key: "enter", keystroke: "alt-enter", modifiers: { alt: true } }, cx); await settle();
  assert.deepEqual(rgJson.at(-1).args, ["--json", "--engine", "default", "--ignore-case", "-e", "hel", "--", "we ird.txt", "src/main.rs"]);
  assert.deepEqual(JSON.parse(host.clipboard).results, [{ file: "we ird.txt", line: 1, column: 5, text: "x hello", matches: [] },
    { file: "src/main.rs", line: 2, column: 15, text: "hello there", matches: ["hel"] },
    { file: "src/main.rs", line: 9, column: 1, text: "help", matches: [] }], "ripgrep's whole line and matches where it has them");
  assert.deepEqual(JSON.parse(host.clipboard).query, "hel");
  assert.equal(host.clipboard.split("\n")[1], '  "query": "hel",', "two spaces, as jq writes it");
  // The terminal's pane is gone (closed meanwhile): copied instead.
  const svGone = view({ ...props0, target: { pane: "pGONE", terminal: "tGONE" } }); await settle();
  const DG = DIR(runs.length);
  host.files[`${DG}/000000`] = host.files[`${D2}/000000`]; host.files[`${DG}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  host.calls = []; host.notes = [];
  withId(R(svGone, props0), "ram-search").handlers.on_key_down({ key: "enter", keystroke: "enter", modifiers: {} }, cx); await settle();
  assert.deepEqual([host.calls.filter(c => c.name === "terminal.paste").length, host.notes.at(-1)?.title], [0, "Copied"], "its pane is gone: copied");
  // ⌥c: copied instead (a toast says so), nothing pasted.
  const sv5 = view(props0); await settle();
  const D5 = DIR(runs.length);
  host.files[`${D5}/000000`] = host.files[`${D2}/000000`]; host.files[`${D5}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  const k5 = (ks, extra = {}) => withId(R(sv5, props0), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx);
  k5("alt-c");
  assert.deepEqual(op(withId(R(sv5, props0), "search-copy"), "border_color"), ["#ffb547"], "copy is lit");
  host.calls = []; host.notes = [];
  k5("enter"); await settle();
  assert.deepEqual([host.clipboard, host.calls.filter(c => c.name === "terminal.paste").length, host.notes.at(-1)?.title], ["'we ird.txt'", 0, "Copied"]);
  assert.equal(host.shared.get(S.SEARCH_LAST).look.copy, true, "and the next window copies too");
  // ^e: $EDITOR at the line, in a new tab of the space, in the folder searched.
  const sv6 = view(props0); await settle();
  const D6 = DIR(runs.length);
  host.files[`${D6}/000000`] = host.files[`${D2}/000000`]; host.files[`${D6}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  assert.deepEqual(op(withId(R(sv6, props0), "search-copy"), "border_color"), ["#ffb547"], "a new window copies too (as it was left)");
  // A cmd-click (or ctrl or shift) on a row picks it, as \u21e5 does.
  withId(R(sv6, props0), "search-row-0").handlers.on_click({ click_count: 1, modifiers: { platform: true } }, cx);
  assert.equal(sv6.searchView.picked.size, 1);
  withId(R(sv6, props0), "search-row-0").handlers.on_click({ click_count: 1, modifiers: { platform: true } }, cx);
  assert.equal(sv6.searchView.picked.size, 0);
  host.calls = []; host.closed = [];
  withId(R(sv6, props0), "search-row-2").handlers.on_click({ click_count: 2, modifiers: {} }, cx);
  assert.deepEqual(host.calls.at(-1), { name: "tab.new", args: { space: "s0", name: "main.rs", folder: "/repo/api",
    argv: ["exec", "sh", "-c", S.EDIT_SH, "sh", "9", "src/main.rs"] } }, "a double-click opens it as ^e does, at its line");
  assert.equal(S.EDIT_SH, 'exec ${EDITOR:-vim} "+$1" "$2"', "the line first, as rg-fzf's ^e");
  assert.deepEqual(host.closed, ["o9"], "and the window closes");
  // Closing stops its run and keeps the search for this space.
  stops.length = 0;
  await sv6.close();
  assert.deepEqual(stops, [[String(4000 + runs.length), D6, ""]], "its run stopped, its folder removed");
  const kept = host.shared.get(S.SEARCH_LAST).spaces.s0;
  assert.deepEqual(kept, { q: "hel", fq: "", mode: "content", hidden: false, invert: false, pcre2: false, unique: false, scope: "repo" });
  delete shellPaneOf.cwd;
  host.files = filesBefore;
  host.execHook = null;
}
console.log("PASS: the search window: results stream in from its run's files, typing starts a new run that stops the last, bat's preview at the line; keys and clicks pick, Enter/^o/⌥⏎ paste files/lines/JSON at the prompt you came from (⌥c copies), ^e or a double-click edits; closing stops the run and keeps the search");

{
  // Options and modes: each a key and a button; the run gets them.
  const DIR = n => `/tmp/T/ram-search.R${String(n).padStart(5, "0")}`;
  const runs = [];
  host.execHook = (command, args, opts) => {
    if (command === "sh" && args[1] === S.RUN_SH) { const n = runs.push({ args: args.slice(3), opts }); return { code: 0, stdout: `${7000 + n}\n${DIR(n)}\n`, stderr: "" }; }
    if (command === "sh" && args[1] === S.STOP_SH) return { code: 0, stdout: "", stderr: "" };
    return null;
  };
  host.shared.delete(S.SEARCH_LAST);
  const p = { role: "search", at: 222, space: "s1", name: "web", machine: null, overlay: "o10",
    target: { pane: "shell-pane", terminal: "shell" }, folder: "/repo/web/app", repo: "/repo/web" };
  host.shared.set(S.SEARCH_TOP, 222);
  const sv = view(p); await settle();
  const T = () => R(sv, p);
  const k = (ks, extra = {}) => { withId(T(), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx); };
  const last = () => runs.at(-1).args;
  for (const ch of "foo") k(ch, { key_char: ch });
  await settle();
  assert.deepEqual(last().slice(2, 11), ["content", "foo", "", "", "", "default", "", "", ""]);
  assert.deepEqual([runs.length, last().slice(0, 2)], [3, [String(7002), DIR(2)]],
    "typed while a run started: only the newest query runs next, and it stops the one that started");
  k("alt-v"); await settle(); assert.equal(last()[6], "1", "\u2325v invert");
  k("alt-i"); await settle(); assert.equal(last()[5], "1", "\u2325i hidden");
  k("alt-p"); await settle(); assert.equal(last()[7], "pcre2", "\u2325p PCRE2");
  k("alt-u"); await settle(); assert.equal(last()[8], "1", "\u2325u one per file");
  let tree = T();
  for (const id of ["search-invert", "search-hidden", "search-pcre2", "search-unique"])
    assert.deepEqual(op(withId(tree, id), "border_color"), ["#ffb547"], `${id} lit`);
  assert(textOf(withId(tree, "search-mode")).includes("Content (pcre2)"), "the mode says which engine");
  // Its buttons do the same.
  for (const id of ["search-invert", "search-hidden", "search-pcre2", "search-unique"]) click(T(), id);
  await settle();
  assert.deepEqual(last().slice(5, 9), ["", "", "default", ""], "a click toggles each back");
  // ^f: filename mode, with its own query (fzf's match on the file's name); the
  // content query stays, and the run filters what it finds by name.
  k("ctrl-f");
  assert.equal(sv.searchView.field(), "", "the name query is its own");
  for (const ch of "ma") k(ch, { key_char: ch });
  await settle();
  assert.deepEqual(last().slice(2, 5), ["filename", "foo", "ma"]);
  assert(textOf(withId(T(), "search-mode")).includes("Filename (fuzzy)"));
  k("ctrl-f"); await settle();
  assert.deepEqual([sv.searchView.field(), last().slice(2, 5)], ["foo", ["content", "foo", "ma"]], "back in content mode: the name query picks the files searched");
  click(T(), "search-mode"); await settle();
  assert.equal(last()[2], "filename", "the mode's button does it too");
  click(T(), "search-mode"); await settle();
  // ⌥s: the folder you're in instead of the repo (and back); its button too.
  k("alt-s"); await settle();
  assert.deepEqual(runs.at(-1).opts, { cwd: "/repo/web/app", on: null }, "the folder");
  assert(textOf(withId(T(), "search-scope")).includes("folder"));
  click(T(), "search-scope"); await settle();
  assert.deepEqual(runs.at(-1).opts, { cwd: "/repo/web", on: null }, "the repo");
  // Editing the query: the cursor moves, words go, the clipboard pastes; a click puts the cursor there.
  k("left"); k("left"); k("x", { key_char: "x" });
  assert.deepEqual([sv.searchView.field(), sv.searchView.at], ["fxoo", 2]);
  k("alt-backspace");
  assert.deepEqual([sv.searchView.field(), sv.searchView.at], ["oo", 0]);
  host.clipboard = "bar\n"; k("cmd-v");
  assert.deepEqual([sv.searchView.field(), sv.searchView.at], ["bar oo", 4]);
  k("backspace");
  assert.deepEqual([sv.searchView.field(), sv.searchView.at], ["baroo", 3], "backspace takes the character before the cursor");
  k("ctrl-x", { key_char: "x", modifiers: { control: true } });
  k("alt-x", { key_char: "x", modifiers: { alt: true } });
  assert.equal(sv.searchView.field(), "baroo", "ctrl keys and Option as Alt (its plain letter) type nothing");
  k("alt-x", { key_char: "\u2248", modifiers: { alt: true } });
  assert.deepEqual([sv.searchView.field(), sv.searchView.at], ["bar\u2248oo", 4], "where Option types (\u2248), it's typed");
  withId(T(), "search-field").handlers["on_mouse_down:left"]({ local_position: { x: 2.2 * 12 * 1.25 * 0.6 } }, cx);
  assert.equal(sv.searchView.at, 2, "a click between characters");
  click(T(), "search-clear"); await settle();
  assert.deepEqual([sv.searchView.field(), last()[3]], ["", ""], "\u2715 clears it: the files again");
  // \u2325/ and F1: every key, each a button that does it.
  k("alt-/");
  tree = T();
  assert(withId(tree, "search-keylist"), "the key list");
  for (const [, action] of S.KEYS) assert(withId(tree, `search-key-${action}`), `the list has ${action}`);
  assert.deepEqual(textOf(withId(tree, "search-key-keys")).slice(0, 1), ["Alt-/ F1"]);
  assert.deepEqual(["up", "down", "pageup", "pagedown"].map(a => textOf(withId(tree, `search-key-${a}`))[0]),
    ["Up Ctrl-K", "Down Ctrl-J Ctrl-N", "PageUp", "PageDown"], "the list's moves are in it too");
  click(tree, "search-key-down");
  assert(!withId(T(), "search-keylist"), "a move from the list closes it");
  k("alt-/"); tree = T();
  click(tree, "search-key-invert"); await settle();
  assert.equal(last()[6], "1", "a click on a key in the list does it");
  assert(!withId(T(), "search-keylist"), "and the list goes");
  k("f1"); assert(withId(T(), "search-keylist")); k("f1"); assert(!withId(T(), "search-keylist"));
  // Keys are written in words, as rg-fzf's help writes them (the user's ask), on
  // the buttons, in their tooltips and in the key list.
  tree = T();
  assert.deepEqual([["search-lines"], ["search-json"], ["search-next"], ["search-prev"], ["search-close"], ["search-invert"],
    ["search-files"], ["search-mode"], ["search-numbers"]].map(([id]) => textOf(withId(tree, id))[0]),
    ["Ctrl-O", "Alt-Enter", "Tab", "Shift-Tab", "Esc", "Alt-V", "Enter", "Ctrl-F", "Alt-N"]);
  assert(op(withId(tree, "search-foot"), "flex_wrap") && op(withId(tree, "search-flags"), "flex_wrap"),
    "the button rows wrap in a narrow window rather than run past its edge");
  const symbols = /[\u2325\u21e5\u21e7\u23ce\u2318\u232b]|\^[a-z]/;
  const tips = t2 => flatten(t2).flatMap(n => n.ops.filter(o => o[0] === "tooltip").map(o => o[1]));
  k("alt-/");
  for (const t2 of [T(), (k("alt-/"), T())])
    for (const x of [...textOf(t2), ...tips(t2)]) assert(!symbols.test(x), `in words, not symbols: ${x}`);
  // Every key has a button on the window (or the wheel: Ctrl-D Ctrl-U scroll the preview).
  tree = T();
  const buttons = { files: "search-files", lines: "search-lines", json: "search-json", copy: "search-copy", edit: "search-edit",
    mode: "search-mode", pcre2: "search-pcre2", invert: "search-invert", hidden: "search-hidden", unique: "search-unique",
    scope: "search-scope", next: "search-next", prev: "search-prev", all: "search-all", none: "search-none", preview: "search-preview",
    wrap: "search-wrap", numbers: "search-numbers", keys: "search-keys", close: "search-close" };
  for (const [, action] of S.KEYS) {
    if (action === "pvdown" || action === "pvup" || action === "divleft" || action === "divright") continue;
    assert(withId(tree, buttons[action]), `${action}: a button`);
    assert.match(op(withId(tree, buttons[action]), "tooltip")[0], /  \S+$/, `${action}'s tooltip ends with its key`);
  }
  assert(withId(tree, "search-pv-body") === undefined || withId(tree, "search-pv-body").handlers.on_scroll_wheel, "the preview scrolls with the wheel");
  // A newer window (^b / again) closes this one.
  host.closed = [];
  host.shared.set(S.SEARCH_TOP, 333);
  T(); await settle();
  assert.deepEqual(host.closed, ["o10"]);
  await sv.close();
  // Options are each space's: s1's are kept, s0's untouched.
  assert.deepEqual(Object.keys(host.shared.get(S.SEARCH_LAST).spaces), ["s1"]);
  assert.equal(host.shared.get(S.SEARCH_LAST).spaces.s1.invert, true);
  host.execHook = null;
}
console.log("PASS: the search window's options: \u2325v \u2325i \u2325p \u2325u and their buttons, ^f filename mode with its own query, \u2325s repo or folder, the field's keys and clicks, \u2325/ F1 the key list (each key a button); a newer window closes this one; each space keeps its own");

{
  // ram-search's tab (a file list piped in): its own pane, which a pick or Esc
  // closes; its runs search the list from where it ran; closing removes the list.
  const DIR = n => `/tmp/T/ram-search.L${String(n).padStart(5, "0")}`;
  const runs = [], stops = [];
  host.execHook = (command, args, opts) => {
    if (command === "sh" && args[1] === S.RUN_SH) { const n = runs.push({ args: args.slice(3), opts }); return { code: 0, stdout: `${9000 + n}\n${DIR(n)}\n`, stderr: "" }; }
    if (command === "sh" && args[1] === S.STOP_SH) { stops.push(args.slice(3)); return { code: 0, stdout: "", stderr: "" }; }
    return null;
  };
  const filesBefore = host.files;
  host.files = {};
  host.shared.set(S.SEARCH_LAST, { look: {}, spaces: { s0: { q: "kept", mode: "content" } } });
  const LIST = "/tmp/T/ram-search-list.AbCdEf";
  const p = { role: "search", list: LIST, cwd: "/repo/api", target: { pane: null, terminal: "shell" } };
  host.focused = { space: "s0", tab: "tabS", pane: "pS", terminal: null, cwd: null };
  const sv = view(p); await settle();
  const T = () => R(sv, p);
  const k = (ks, extra = {}) => { withId(T(), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx); };
  const poll = host.timers.filter(t => t.ms === 40).at(-1).fn;
  assert.deepEqual(runs[0].args.slice(2), ["content", "", "", "", "", "default", "", LIST, "1"], "a fresh search (not the space's), on the list");
  assert.deepEqual(runs[0].opts, { cwd: "/repo/api", on: null }, "from where ram-search ran");
  assert.equal(sv.searchView.p.space, "s0", "its space: where it opened");
  assert(textOf(withId(T(), "search-scope")).includes("files given"), "the scope is the list");
  assert.equal(op(withId(T(), "search-scope"), "cursor_pointer"), undefined, "and can't change");
  k("alt-s"); await settle();
  assert.equal(runs.length, 1, "\u2325s does nothing here");
  // Many results: a full chunk (CHUNK lines) goes on to the next; a run that
  // stopped at MAX_ROWS says "+".
  const many = Array.from({ length: S.CHUNK + 3 }, (_, i) => i === 7 ? "caf\ufffd.txt" : `f${String(i).padStart(4, "0")}.txt`);
  host.files[`${DIR(1)}/000000`] = many.slice(0, S.CHUNK).join("\n") + "\n";
  // (the second chunk isn't UTF-8: readTextFile refuses it, cat gives it with U+FFFD)
  const hookBefore = host.execHook, second = many.slice(S.CHUNK).join("\n") + "\n";
  host.execHook = (command, args, opts) => command === "cat" && args[0] === `${DIR(1)}/000001` ? { code: 0, stdout: second, stderr: "" }
    : hookBefore(command, args, opts);
  host.files[`${DIR(1)}/more`] = "";
  host.files[`${DIR(1)}/end`] = "";
  await poll(cx); await settle();
  assert.equal(sv.searchView.rows.length, S.CHUNK + 3, "both chunks read in one look");
  assert.equal(sv.searchView.rows[7].file, "caf\ufffd.txt");
  host.execHook = hookBefore;
  assert.equal(textOf(withId(T(), "search-count")).join(""), `${(S.CHUNK + 3).toLocaleString("en-US")}+ files`, "+: more than it kept");
  // Its size: as many rows as fit; the wheel scrolls (the cursor stays on screen),
  // page down jumps a screen.
  withId(T(), "search-list").handlers.on_size_change({ width: 700, height: 5 * 17 * 1.25 + 4 * 1.25 }, cx);
  assert.equal(sv.searchView.size.rows, 5);
  let tree = T();
  assert(withId(tree, "search-row-4") && !withId(tree, "search-row-5"), "only the rows that fit are drawn");
  withId(tree, "search-list").handlers.on_scroll_wheel({ delta: { x: 0, y: -3 * 17 * 1.25 } }, cx);
  assert.deepEqual([sv.searchView.top, sv.searchView.cursor], [3, 3], "the wheel: three rows down, the cursor along");
  tree = T();
  assert(withId(tree, "search-row-3") && !withId(tree, "search-row-2") && withId(tree, "search-row-7"));
  withId(tree, "search-list").handlers.on_scroll_wheel({ delta: { x: 0, y: 1 }, delta_lines: { x: 0, y: 2 } }, cx);
  assert.equal(sv.searchView.top, 1, "lines from a wheel that counts them");
  k("pagedown");
  assert.deepEqual([sv.searchView.cursor, sv.searchView.top], [7, 3], "a screen down, kept in view");
  k("pageup"); k("pageup");
  assert.deepEqual([sv.searchView.cursor, sv.searchView.top], [0, 0], "back at the top, and shown");
  k("ctrl-j"); k("ctrl-n"); k("down");
  assert.equal(sv.searchView.cursor, 3, "^j ^n and \u2193 go down");
  k("ctrl-k"); k("up");
  assert.equal(sv.searchView.cursor, 1, "^k and \u2191 go up");
  // A new search: its first lines replace the list, the cursor back at the top.
  k("ctrl-j"); k("ctrl-j");
  k("f", { key_char: "f" }); await settle();
  assert.equal(sv.searchView.cursor, 3, "the last search's rows stay meanwhile");
  host.files[`${DIR(2)}/000000`] = ["f0001.txt", "1", "1", "\x1b[0m\x1b[1m\x1b[31mf\x1b[0m"].join("\x1f") + "\n";
  host.files[`${DIR(2)}/end`] = "";
  await poll(cx); await settle();
  assert.deepEqual([sv.searchView.rows.length, sv.searchView.cursor, sv.searchView.top], [1, 0, 0]);
  k("backspace"); await settle();
  host.files[`${DIR(3)}/000000`] = host.files[`${DIR(1)}/000000`];
  host.files[`${DIR(3)}/end`] = "";
  await poll(cx); await settle();
  // A pick goes to ram-search's terminal (by its address: it's not a pane of a
  // layout block), then its tab's pane closes.
  host.events = []; host.calls = []; host.clipboard = null;
  k("enter"); await settle();
  assert.equal(host.clipboard, "f0000.txt");
  assert.deepEqual(host.calls, [{ name: "pane.focus", args: { terminal: "shell" } }, { name: "terminal.paste", args: undefined },
    { name: "pane.close", args: { pane: "pS" } }], "its terminal, paste, then this tab's pane closes");
  assert.equal(host.shared.get(S.SEARCH_LAST).spaces.s0.q, "kept", "a list's search isn't kept for the space");
  stops.length = 0;
  await sv.close();
  assert.deepEqual(stops, [[String(9003), DIR(3), LIST]], "closing stops its run and removes the list");
  // Esc in the tab (no dialog: Esc comes as a key) closes it too.
  const sv2 = view(p); await settle();
  host.calls = [];
  withId(R(sv2, p), "ram-search").handlers.on_key_down({ key: "escape", keystroke: "escape", modifiers: {} }, cx);
  assert.deepEqual(host.calls, [{ name: "pane.close", args: { pane: "pS" } }], "Esc closes its tab");
  // A run that can't start says why; one that ends with nothing says what rg said.
  const sv3 = view({ ...p, list: undefined, folder: "/repo/api", repo: "/repo/api" }); await settle();
  const n3 = runs.length;
  host.files[`${DIR(n3)}/err`] = "rg: regex parse error:\n    (?:(foo)\n    ^\nerror: unclosed group\n";
  host.files[`${DIR(n3)}/end`] = "";
  await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
  tree = R(sv3, { ...p, list: undefined });
  assert.deepEqual(textOf(withId(tree, "search-empty")), ["rg: regex parse error:\n    (?:(foo)\n    ^\nerror: unclosed group"]);
  assert.deepEqual(op(withId(tree, "search-empty"), "text_color"), ["#ff5f6d"], "in red");
  host.execHook = (command, args) => (command === "sh" && args[1] === S.RUN_SH ? { code: 127, stdout: "", stderr: "sh: rg: command not found" } : null);
  const sv4 = view({ ...p, list: undefined, folder: "/repo/api", repo: "/repo/api" }); await settle();
  tree = R(sv4, { ...p, list: undefined });
  assert.deepEqual([textOf(withId(tree, "search-empty")), textOf(withId(tree, "search-count"))], [["sh: rg: command not found"], ["couldn't search"]]);
  host.files = filesBefore;
  host.execHook = null;
  host.focused = null;
}
{
  // The preview scrolls: ^d ^u by half its height, the wheel by lines, down to the
  // file's last screen; past what bat gave, bat again for those lines.
  const DIR = n => `/tmp/T/ram-search.P${String(n).padStart(5, "0")}`;
  const runs = [], bats = [];
  host.execHook = (command, args, opts) => {
    if (command === "sh" && args[1] === S.RUN_SH) { const n = runs.push({ args: args.slice(3) }); return { code: 0, stdout: `${5000 + n}\n${DIR(n)}\n`, stderr: "" }; }
    if (command === "sh" && args[1] === S.STOP_SH) return { code: 0, stdout: "", stderr: "" };
    if (command === "env" && args[1] === "bat") {
      bats.push(args);
      const [from, to] = args[args.indexOf("--line-range") + 1].split(":").map(Number), last = Math.min(to, 2000);
      return { code: 0, stdout: Array.from({ length: Math.max(0, last - from + 1) }, (_, i) => `line ${from + i}`).join("\n") + "\n", stderr: "" };
    }
    return null;
  };
  const filesBefore = host.files;
  host.files = {};
  host.shared.delete(S.SEARCH_LAST);
  const p = { role: "search", at: 444, space: "s0", name: "api", machine: null, overlay: "o12", target: null, folder: "/repo/api", repo: "/repo/api" };
  host.shared.set(S.SEARCH_TOP, 444);
  const sv = view(p); await settle();
  const T = () => R(sv, p);
  sv.searchView.rows = [S.parseRow(["big.txt", "1000", "1", "x"].join("\x1f"), 3)];
  T(); await settle();
  withId(T(), "search-pv-body").handlers.on_size_change({ width: 600, height: 20 * 15 * 1.25 + 4 * 1.25 }, cx);
  assert.equal(sv.searchView.size.pvRows, 20);
  assert.equal(sv.searchView.pvTop, 1000 - Math.floor(30 / 3), "its line a third down (as sized when it first showed)");
  const top0 = sv.searchView.pvTop;
  const key = (ks, n = 1) => { for (let i = 0; i < n; i++) withId(T(), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: { control: true } }, cx); };
  key("ctrl-d");
  assert.equal(sv.searchView.pvTop, top0 + 10, "^d: half of 20 lines");
  key("ctrl-u", 2);
  assert.equal(sv.searchView.pvTop, top0 - 10, "^u twice");
  withId(T(), "search-pv-body").handlers.on_scroll_wheel({ delta: { x: 0, y: -4 * 15 * 1.25 } }, cx);
  assert.equal(sv.searchView.pvTop, top0 - 6, "the wheel: four lines down");
  // Holding ^d: as far as bat's lines go, then bat again for the next ones, to the
  // file's last screen and no further.
  const got = bats.length;
  key("ctrl-d", 100);
  assert.equal(sv.searchView.pvTop, sv.searchView.pv.get("big.txt").b - 20 + 1, "no further than bat's lines");
  for (let i = 0; i < 20; i++) { key("ctrl-d", 50); T(); await settle(); }
  assert(bats.length > got + 1, "bat again for the lines further down");
  assert.equal(sv.searchView.pvTop, 2000 - 20 + 1, "down to the file's last screen, no further");
  assert(withId(T(), "search-pv-2000-0") && !withId(T(), "search-pv-2001-0"), "its last line shows");
  key("ctrl-u", 400);
  assert.equal(sv.searchView.pvTop, 1, "up to its first line");
  // No terminal to paste in: the copy button shows it's copying, and can't be turned off.
  const copy = withId(T(), "search-copy");
  assert.deepEqual([op(copy, "border_color"), op(copy, "cursor_pointer")], [["#ffb547"], undefined]);
  await sv.close();
  host.files = filesBefore;
  host.execHook = null;
}
{
  // The divider between the list and the preview: a drag moves it (the preview's
  // edge follows the pointer anywhere in the window until the button goes up),
  // Alt-[ and Alt-] move it a step, within limits; the next window starts there.
  const DIR = n => `/tmp/T/ram-search.D${String(n).padStart(5, "0")}`;
  const runs = [];
  host.execHook = (command, args) => {
    if (command === "sh" && args[1] === S.RUN_SH) { const n = runs.push(1); return { code: 0, stdout: `${3000 + n}\n${DIR(n)}\n`, stderr: "" }; }
    if (command === "sh" && args[1] === S.STOP_SH) return { code: 0, stdout: "", stderr: "" };
    return null;
  };
  host.shared.delete(S.SEARCH_LAST);
  const p = { role: "search", at: 666, space: "s3", name: "docs", machine: null, overlay: "o14", target: null, folder: "/repo/docs", repo: null };
  host.shared.set(S.SEARCH_TOP, 666);
  const sv = view(p); await settle();
  const T = () => R(sv, p);
  const k = ks => withId(T(), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: { alt: true } }, cx);
  const pvW = () => op(withId(T(), "search-pv"), "w")[0];
  withId(T(), "search-body").handlers.on_size_change({ width: 1000, height: 600 }, cx);
  assert.equal(pvW(), 550, "the preview's share, 55%, by default");
  let dv = withId(T(), "search-divider");
  assert(dv && op(dv, "cursor_col_resize"), "between the list and the preview: a divider with a resize cursor");
  assert.match(op(dv, "tooltip")[0], /Alt-\[ Alt-\]$/, "its keys in its tooltip");
  assert.deepEqual(flatten(withId(T(), "search-body")).filter(n => idOf(n)).map(idOf).filter(id => ["search-list", "search-divider", "search-pv"].includes(id)),
    ["search-list", "search-divider", "search-pv"], "list, divider, preview");
  // The drag: the divider's middle under the pointer (body px, zoom 1).
  host.keyboard = null;
  dv.handlers["on_mouse_down:left"]({ position: { x: 0, y: 0 }, local_position: { x: 3, y: 10 }, click_count: 1 }, cx);
  assert.equal(host.keyboard, sv.searchView.handle, "a press on the divider gives the window the keyboard");
  const move = (x, pressed = "left") => withId(T(), "search-body").handlers.on_window_mouse_move({ local_position: { x, y: 10 }, pressed_button: pressed }, cx);
  move(600);
  assert.equal(pvW(), Math.round(1000 * Math.round((1000 - 600 - 7 * 1.25 / 2) / 1000 * 1000) / 1000), "the preview's edge follows the pointer");
  assert(flatten(withId(T(), "search-divider")).some(n => op(n, "bg")?.[0] === "#ffb547"), "amber while dragged");
  move(10);
  assert.equal(sv.searchView.look.split, S.SPLIT_MAX, "no further than 80%");
  assert.equal(pvW(), 1000 - 7 * 1.25 - 200 | 0, "and the list keeps its least width");
  move(990);
  assert.equal(sv.searchView.look.split, S.SPLIT_MIN, "no less than 20%");
  move(500);
  withId(T(), "search-body").handlers["on_window_mouse_up:left"]({}, cx);
  const kept = sv.searchView.look.split;
  move(700);
  assert.equal(sv.searchView.look.split, kept, "the button went up: moving doesn't drag");
  assert(!flatten(withId(T(), "search-divider")).some(n => op(n, "bg")?.[0] === "#ffb547"), "not amber then");
  // A release outside the window: the next move without the button ends the drag.
  withId(T(), "search-divider").handlers["on_mouse_down:left"]({ local_position: { x: 3, y: 10 } }, cx);
  move(400, null);
  move(300);
  assert.equal(sv.searchView.look.split, kept, "no drag after a move without the button");
  // The keys: a step each way, within the limits.
  k("alt-[");
  assert.equal(sv.searchView.look.split, Math.round((kept + S.DIV_STEP) * 1000) / 1000, "Alt-[: the divider left, a wider preview");
  k("alt-]"); k("alt-]");
  assert.equal(sv.searchView.look.split, Math.round((kept - S.DIV_STEP) * 1000) / 1000, "Alt-]: right, a wider list");
  for (let i = 0; i < 20; i++) k("alt-]");
  assert.equal(sv.searchView.look.split, S.SPLIT_MIN);
  for (let i = 0; i < 20; i++) k("alt-[");
  assert.equal(sv.searchView.look.split, S.SPLIT_MAX);
  k("alt-]");
  // No preview: no divider, the list has the room.
  withId(T(), "ram-search").handlers.on_key_down({ key: "p", keystroke: "ctrl-p", modifiers: { control: true } }, cx);
  assert(!withId(T(), "search-divider") && !withId(T(), "search-pv"), "hidden with the preview");
  withId(T(), "ram-search").handlers.on_key_down({ key: "p", keystroke: "ctrl-p", modifiers: { control: true } }, cx);
  // The next window starts where this one left it.
  const left = sv.searchView.look.split;
  await sv.close();
  assert.equal(host.shared.get(S.SEARCH_LAST).look.split, left);
  const sv2 = view(p); await settle();
  withId(R(sv2, p), "search-body").handlers.on_size_change({ width: 1000, height: 600 }, cx);
  assert.equal(op(withId(R(sv2, p), "search-pv"), "w")[0], Math.round(1000 * left), "kept");
  host.shared.set(S.SEARCH_LAST, { look: { split: 7 } });
  const sv3 = view(p); await settle();
  assert.equal(sv3.searchView.look.split, S.SPLIT_MAX, "a kept value out of range comes back within it");
  host.shared.set(S.SEARCH_LAST, { look: { split: "x" } });
  assert.equal(view(p).searchView.look.split, S.SPLIT, "a broken one: the default");
  await settle();
  host.execHook = null;
}
console.log("PASS: the search window's divider: a drag moves it (until the button goes up, even outside the window), Alt-[ Alt-] step it, 20-80% and the list's least width; hidden with the preview; kept for the next window");
// The run's script: rg-fzf's ripgrep options, the stop of the run before, and what it writes.
for (const part of [
  'if [ -n "$old" ] && [ ! -e "$olddir/end" ]; then kill -s TERM -- "-$old" 2>/dev/null; fi',
  'case $olddir in */ram-search.??????) rm -rf -- "$olddir" 2>/dev/null || { (sleep 1; rm -rf -- "$olddir") </dev/null >/dev/null 2>&1 & } ;; esac',
  'd=$(mktemp -d "${TMPDIR:-/tmp}/ram-search.XXXXXX") || exit 1', 'echo "$$"', 'echo "$d"',
  'H=; [ "$hidden" = 1 ] && H=--hidden', 'ff=; [ "$mode" = content ] && ff=$fq', 'meta=3; [ "$invert" = 1 ] && meta=2; [ -z "$q" ] && meta=0',
  'set -- --engine "$engine" --ignore-case --column --line-number --no-heading --color=always',
  '--colors path:none --colors line:none --colors column:none --with-filename',
  "--field-match-separator '\\x1f' --max-columns 500 --max-columns-preview $H",
  '[ "$invert" = 1 ] && set -- "$@" --invert-match', '[ "$unique" = 1 ] && set -- "$@" --max-count 1', 'set -- "$@" -e "$q"',
  'if [ -n "$list" ]; then xargs -0 -r rg --files --null $H -- < "$list"; else rg --files --null $H; fi |',
  'if [ -n "$ff" ]; then fzf --filter "$ff" --read0 --print0 --no-sort; else cat; fi |',
  'if [ -z "$q" ]; then tr "\\000" "\\n"; else xargs -0 -r rg "$@" --; fi',
  'elif [ -n "$list" ]; then xargs -0 -r rg "$@" -- < "$list"', 'else rg "$@"',
  'if [ "$meta" = 0 ]; then fzf --filter "$fq" --no-sort', "else fzf --filter \"$fq\" --delimiter '\\x1f' --nth 1 --no-sort; fi",
  `awk -v d="$d" -v n=${S.CHUNK} -v max=${S.MAX_ROWS} '`, 'NR > max { printf "" > (d "/more"); exit }',
  '(NR - 1) % n == 0 { if (f != "") close(f); f = sprintf("%s/%06d", d, int((NR - 1) / n)) }', '{ print > f; fflush(f) }',
  '} 2> "$d/err"', ': > "$d/end"', ') < /dev/null > /dev/null 2>&1 &'])
  assert(S.RUN_SH.includes(part), `the run's script has: ${part}`);
assert.deepEqual(S.STOP_SH.split("\n"), ['if [ -n "$1" ] && [ ! -e "$2/end" ]; then kill -s TERM -- "-$1" 2>/dev/null; fi',
  'case $2 in */ram-search.??????) rm -rf -- "$2" 2>/dev/null || { (sleep 1; rm -rf -- "$2") </dev/null >/dev/null 2>&1 & } ;; esac',
  'case $3 in */ram-search-list.??????) rm -f -- "$3" ;; esac']);
{
  // Inverted lines (no column, no matches), a tab inside a line, a file whose name
  // reads as an option.
  const DIR = n => `/tmp/T/ram-search.V${String(n).padStart(5, "0")}`;
  const runs = [], rgJson = [];
  host.execHook = (command, args) => {
    if (command === "sh" && args[1] === S.RUN_SH) { const n = runs.push({ args: args.slice(3) }); return { code: 0, stdout: `${6000 + n}\n${DIR(n)}\n`, stderr: "" }; }
    if (command === "sh" && args[1] === S.STOP_SH) return { code: 0, stdout: "", stderr: "" };
    if (command === "rg") { rgJson.push(args); return { code: 0, stdout: "", stderr: "" }; }
    return null;
  };
  const filesBefore = host.files;
  host.files = {};
  host.shared.set(S.SEARCH_LAST, { look: {}, spaces: { s2: { q: "x", invert: true } } });
  const p = { role: "search", at: 555, space: "s2", name: "ops", machine: null, overlay: "o13",
    target: { pane: "shell-pane", terminal: "shell" }, folder: "/repo/ops", repo: "/repo/ops" };
  host.shared.set(S.SEARCH_TOP, 555);
  const fresh = async () => {
    const v = view(p); await settle();
    host.files[`${DIR(runs.length)}/000000`] = ["-dash.txt\x1f3\x1fa\tb", "src/x.rs\x1f1\x1fno match here"].join("\n") + "\n";
    host.files[`${DIR(runs.length)}/end`] = "";
    await host.timers.filter(t => t.ms === 40).at(-1).fn(cx); await settle();
    const k = (ks, extra = {}) => withId(R(v, p), "ram-search").handlers.on_key_down({ key: ks.split("-").pop(), keystroke: ks, modifiers: {}, ...extra }, cx);
    return { v, k };
  };
  let { v, k } = await fresh();
  assert.deepEqual([runs[0].args[3], runs[0].args[6]], ["x", "1"], "the space's search again: invert on");
  assert.deepEqual(v.searchView.rows.map(r => [r.kind, r.file, r.line, r.col]), [["line", "-dash.txt", 3, null], ["line", "src/x.rs", 1, null]]);
  assert.deepEqual(textOf(withId(R(v, p), "search-row-0")), ["-dash.txt", ":3", "a   b"], "no column; a tab is 4 spaces");
  k("ctrl-a"); k("ctrl-o"); await settle();
  assert.equal(host.clipboard, "./-dash.txt:3:a\tb\nsrc/x.rs:1:no match here", "file:line:text, the tab as it is");
  ({ v, k } = await fresh());
  k("ctrl-a"); k("enter"); await settle();
  assert.equal(host.clipboard, "./-dash.txt src/x.rs", "a name like an option starts with ./");
  ({ v, k } = await fresh());
  k("ctrl-a"); k("alt-enter", { key: "enter", modifiers: { alt: true } }); await settle();
  assert.deepEqual(JSON.parse(host.clipboard).results, [{ file: "./-dash.txt", line: 3, text: "a\tb" }, { file: "src/x.rs", line: 1, text: "no match here" }],
    "inverted lines: file, line, text");
  assert.equal(rgJson.length, 0, "no ripgrep JSON for them (they have no matches)");
  // macOS's /private/var is /var (and /private/tmp /tmp): paths come out relative either way.
  assert.equal(S.pathFor("src/a.rs", "/private/var/x/repo", "/var/x/repo/src"), "a.rs");
  assert.equal(S.pathFor("lib/c.rs", "/private/tmp/r", "/tmp/r/src"), "/tmp/r/lib/c.rs", "outside it: the whole path (one spelling)");
  assert.equal(S.pathFor("src/a.rs", "/var/x/repo", "/private/var/x/repo/src"), "a.rs", "/private on the terminal's side");
  assert.equal(S.pathFor("/private/tmp/r/b.rs", "/tmp/r", "/tmp/r"), "b.rs", "a name given whole with /private");
  ({ v, k } = await fresh());
  host.calls = [];
  k("ctrl-e");
  assert.deepEqual(host.calls.at(-1)?.args?.argv, ["exec", "sh", "-c", S.EDIT_SH, "sh", "3", "./-dash.txt"]);
  host.files = filesBefore;
  host.execHook = null;
}
console.log("PASS: the search window in ram-search's tab (a list, its terminal, Esc and picks close the tab, the list removed); results past a chunk, + at the cap, errors; the wheel, page keys and sizes; the preview's ^d ^u and wheel; the run's script");

// ---- LANG: the space's repo by language, under GIT (space level) ---------------------------
{
  const lg = await import(await load("mods/ram/langs.js"));
  // A file's language: by extension, by name, or its key when the table doesn't know it.
  assert.deepEqual(["src/a.rs", "x/Makefile", "app.TSX", ".zshrc", "notes.md", "a.weird", "LICENSE", "a.min.js"].map(p => lg.langOf(p).key),
    ["Rust", "Makefile", "TSX", "Shell", "Markdown", ".weird", "(no extension)", "JavaScript"]);
  // git ls-tree -r -l -z: blobs with sizes; symlinks, submodules and vendored files are left out.
  const tree = ["100644 blob aaa     1200\tsrc/main.rs", "100644 blob bbb      300\tsrc/lib.rs", "100755 blob ccc       90\tbuild.sh",
    "100644 blob ddd      400\tREADME.md", "100644 blob eee      100\t.github/ci.yml", "100644 blob fff       50\tdata.weird",
    "120000 blob ggg       11\tlink.rs", "160000 commit hhh       -\tsub", "100644 blob iii     9000\tCargo.lock",
    "100644 blob jjj     5000\tnode_modules/x/i.js", "100644 blob kkk      700\tweb/app.min.js", "100644 blob lll       60\tweb/app.ts", ""].join("\0");
  const files = lg.parseTree(tree);
  assert.deepEqual(files.map(f => [f.path, f.size]), [["src/main.rs", 1200], ["src/lib.rs", 300], ["build.sh", 90], ["README.md", 400],
    [".github/ci.yml", 100], ["data.weird", 50], ["web/app.ts", 60]], "no symlink, submodule, lock file, node_modules or .min.js");
  // By default programming and markup count, biggest first, shares of the bytes counted.
  let list = lg.summarize(files);
  assert.deepEqual(list.map(l => [l.name, l.bytes, l.count]), [["Rust", 1500, 2], ["Shell", 90, 1], ["TypeScript", 60, 1]]);
  assert.equal(Math.round(list.reduce((n, l) => n + l.share, 0) * 1e9), 1e9, "the shares add up to all of it");
  assert.deepEqual(list.map(l => lg.shareText(l.share)), ["90.9%", "5.5%", "3.6%"]);
  assert.deepEqual(list[0].files.map(f => f.path), ["src/main.rs", "src/lib.rs"], "a language's files, biggest first");
  // Included: data, prose and unknown types count too.
  list = lg.summarize(files, ["Markdown", "YAML", ".weird"]);
  assert.deepEqual(list.map(l => l.name), ["Rust", "Markdown", "YAML", "Shell", "TypeScript", ".weird"]);
  assert.deepEqual(lg.others(files, ["YAML"]).map(o => [o.key, o.count, o.on, o.exts.join(" ")]),
    [["Markdown", 1, false, ".md .markdown"], ["YAML", 1, true, ".yml .yaml"], [".weird", 1, false, ""]], "the picker: what doesn't count by default");
  assert.deepEqual([lg.shareText(0.0001), lg.shareText(1), lg.sizeText(900), lg.sizeText(2048), lg.sizeText(3 * 1048576)],
    ["<0.1%", "100.0%", "900 B", "2.0 KB", "3.0 MB"]);
  assert.deepEqual([lg.visible("#292929"), lg.visible("#dea584")], ["#898989", "#dea584"], "the darkest colors are lifted to show on black");
  // The side column reads the repo on its 250 ms tick: git ls-tree at the repo's top, on its machine.
  host.shared.set("ram.zoom", "space"); host.shared.delete("ram.lang.include");
  spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
  const lside = view({ role: "side" });
  lside.size = { width: 340, height: 1100 };
  lside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
  let lt = R(lside, { role: "side" });
  assert.deepEqual(textOf(withId(lt, "ram-lang-head")), ["LANG", "counting\u2026", "ext"], "under GIT, before the first read");
  host.execs = []; host.lsTree = tree;
  const ticks = host.timers.filter(tm => tm.ms === 250);
  const apiGit = lside.gitInfo.git[JSON.stringify([null, "/repo/api"])];
  ticks.at(-1).fn(cx); await settle();
  // (That tick also asked git again, which this fixture can't answer for /repo/api.)
  lside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = apiGit;
  const reads = host.execs.filter(e => e.args.includes("ls-tree"));
  assert.deepEqual(reads.map(e => [e.args.slice(-6), e.opts]), [[["ls-tree", "-r", "-l", "-z", "--full-tree", "HEAD"], { cwd: "/repo/api", on: null }]]);
  ticks.at(-1).fn(cx); await settle();
  assert.equal(host.execs.filter(e => e.args.includes("ls-tree")).length, 1, "not again within the minute");
  lt = R(lside, { role: "side" });
  const order = flatten(lt).map(idOf).filter(id => ["ram-git", "ram-lang", "ram-settings"].includes(id));
  assert.deepEqual(order, ["ram-git", "ram-lang", "ram-settings"], "LANG sits between GIT and the keys");
  assert.deepEqual(textOf(withId(lt, "ram-lang-head")), ["LANG", "3 languages", "ext"]);
  assert.equal(withId(lt, "ram-lang-bar").kids.length, 3, "a bar segment per language");
  assert.deepEqual(textOf(withId(lt, "ram-lang-0")), ["Rust", "90.9%", "2 files"]);
  assert(withId(lt, "ram-lang-2") && !withId(lt, "ram-lang-more"), "three languages: all three, no +n more");
  // More than three: the biggest three, then +n more.
  host.shared.set("ram.lang.include", ["Markdown", "YAML", ".weird"]);
  lt = R(lside, { role: "side" });
  assert(withId(lt, "ram-lang-2") && !withId(lt, "ram-lang-3"));
  assert.deepEqual(textOf(withId(lt, "ram-lang-more")), ["+3 more"]);
  // Clicks: a language opens its files, the header and +n more all of them, ext the picker.
  host.overlays = [];
  const want = (mode, lang = null) => ({ mod: "ram", kind: "dialog", width: 500, height: 420,
    props: { role: "lang", space: "s0", top: "/repo/api", machine: null, repo: "herdr", mode, lang } });
  click(lt, "ram-lang-1"); click(lt, "ram-lang-head"); click(lt, "ram-lang-more"); click(lt, "ram-lang-ext");
  assert.deepEqual(host.overlays, [want("files", "Markdown"), want("list"), want("list"), want("ext")]);
  // A short column: LANG's rows give way, then LANG, so the stack and heap keep room.
  const heightWith = h => { lside.size = { width: 340, height: h }; const tr = R(lside, { role: "side" });
    return { rows: flatten(tr).filter(n => /^ram-lang-\d$/.test(idOf(n) ?? "")).length, lang: Boolean(withId(tr, "ram-lang")), tr }; };
  const tall = heightWith(1100), mid = heightWith(560), short = heightWith(470);
  assert.deepEqual([tall.rows, tall.lang], [3, true]);
  assert(mid.lang && mid.rows < 3, `a shorter column has fewer language rows (${mid.rows})`);
  assert.deepEqual([short.rows, short.lang], [0, false], "a short one has no LANG");
  for (const { tr } of [tall, mid, short]) assert(withId(tr, "stack-s0") && withId(tr, "ram-git") && withId(tr, "ram-settings"));
  lside.size = { width: 340, height: 1100 };
  // Only the space level, and only with a repo.
  host.shared.set("ram.zoom", "meta");
  assert(!withId(R(lside, { role: "side" }), "ram-lang"), "not in meta");
  host.shared.set("ram.zoom", "space");
  spaces[0].tabs.push({ id: "tabHK2", name: "hunk diff", named: true, index: 3, active: false, settled: false, status: null });
  panes.push({ pane: "pHK2", terminal: "tHK2", tab: "tabHK2", title: "hunk", status: null, focused: true, program: { name: "hunk" } });
  raw.push({ address: "tHK2", state: "live", created_ms: 9800, labels: { "ram.hunk": "diff" } });
  spaces[0].tabs.forEach(t => t.active = t.id === "tabHK2");
  assert.equal(level(), "space", "a review shows in the space level (there's no hunk level)");
  assert(withId(R(lside, { role: "side" }), "ram-git") && withId(R(lside, { role: "side" }), "ram-lang"), "GIT and LANG stay");
  spaces[0].tabs.pop(); panes.pop(); raw.pop();
  spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
  spaces[0].folder = "/home/tester/notes"; lside.gitInfo.git[JSON.stringify([null, "/home/tester/notes"])] = null;
  const keepGit = lside.gitInfo.git[JSON.stringify([null, "/repo/api"])];
  delete lside.gitInfo.git[JSON.stringify([null, "/repo/api"])];
  assert(!withId(R(lside, { role: "side" }), "ram-lang"), "not a repo: no LANG");
  spaces[0].folder = "/repo/api"; lside.gitInfo.git[JSON.stringify([null, "/repo/api"])] = keepGit;
  // The dialog (role "lang"): every language, a language's files, the picker. It reads the repo itself.
  host.shared.delete("ram.lang.include");
  const dprops = mode => ({ role: "lang", space: "s0", top: "/repo/api", machine: null, repo: "herdr", mode, lang: null, overlay: "oL" });
  let dv = view(dprops("list")); await settle();
  let dt = R(dv, dprops("list"));
  assert.deepEqual(textOf(withId(dt, "lang-row-0")), ["Rust", "90.9%", "2 files"]);
  assert.equal(withId(dt, "lang-view-bar").kids.length, 3);
  host.props = dprops("list");
  click(dt, "lang-row-0");
  dt = R(dv, dprops("list"));
  assert.deepEqual(textOf(withId(dt, "lang-file-0")), ["src/main.rs", "1.2 KB"], "Rust's files, biggest first");
  host.calls = []; host.closed = [];
  click(dt, "lang-file-1");
  assert.deepEqual(host.calls, [{ name: "tab.new", args: { space: "s0", folder: "/repo/api", name: "lib.rs",
    argv: ["exec", "sh", "-c", 'exec "${EDITOR:-vi}" "$1"', "sh", "src/lib.rs"] } }], "a file opens in $EDITOR in a new tab");
  assert.deepEqual(host.closed, ["oL"], "and the dialog closes");
  click(dt, "lang-back");
  assert(withId(R(dv, dprops("list")), "lang-row-0"), "← all: the list again");
  // The picker: a click includes a type in every repo's LANG; again leaves it out.
  dv = view(dprops("ext")); await settle();
  dt = R(dv, dprops("ext"));
  assert.deepEqual(textOf(withId(dt, "lang-ext-0")).slice(1), ["Markdown", ".md .markdown", "1 file", "400 B"]);
  click(dt, "lang-ext-1");
  assert.deepEqual(host.shared.get("ram.lang.include"), ["YAML"]);
  click(R(dv, dprops("ext")), "lang-ext-0");
  assert.deepEqual(host.shared.get("ram.lang.include"), ["Markdown", "YAML"]);
  assert.deepEqual(textOf(withId(R(dv, dprops("ext")), "lang-ext-0"))[0], "\u2713", "ticked");
  click(R(dv, dprops("ext")), "lang-ext-0");
  assert.deepEqual(host.shared.get("ram.lang.include"), ["YAML"], "again: left out");
  assert.deepEqual(textOf(withId(R(lside, { role: "side" }), "ram-lang-head")).slice(0, 2), ["LANG", "4 languages"], "the column counts it");
  host.shared.delete("ram.lang.include"); host.lsTree = null; host.props = {};
}
console.log("PASS: LANG (space level, under GIT): the repo's committed files by language, GitHub's way (bytes, programming and markup; vendored out); a bar, the top three and +n more; a language's files open in $EDITOR; ext picks what else counts");
// The space's repo is the one it's named after: its first terminal's folder's (the
// first tab with a terminal in a folder), and only that one. Another tab in another
// repo doesn't stand in for it, even while that tab shows.
const { Git } = await import(gitURL);
const gi = new Git(), K = d => JSON.stringify([null, d]);
const homeSpace = { id: "x", name: "~", machine: null, folder: "/home/tester", tabs: [{ id: "a", active: false }, { id: "b", active: true }] };
const homePanes = [{ tab: "a", cwd: "/home/tester", focused: false }, { tab: "b", cwd: "/repo/other", focused: true }];
const other = { name: "other", branch: "mainline", ahead: 1, behind: 0, dirty: 1, upstream: false, top: "/repo/other",
  repo: JSON.stringify([null, "/repo/other/.git"]), files: [] };
assert.equal(gi.info(homeSpace, homePanes), undefined, "nothing looked at yet");
gi.git[K("/repo/other")] = other;
assert.equal(gi.info(homeSpace, homePanes), undefined, "its first terminal's folder isn't looked at yet: the other tab's repo doesn't count");
gi.git[K("/home/tester")] = null;
assert.equal(gi.info(homeSpace, homePanes), null, "~ isn't a repo: the space has none, though the tab that shows is in one");
assert.deepEqual([gi.summary(homeSpace, homePanes).repo, gi.summary(homeSpace, homePanes).tip], [null, "Not a git repo"]);
assert.deepEqual(gi.folders(homeSpace, homePanes), ["/home/tester", "/repo/other"], "its folders: its first terminal's first");
const { place } = await import(gitURL);
assert.equal(place(homeSpace, homePanes), "/home/tester");
assert.equal(place({ ...homeSpace, tabs: [] }, homePanes), "/home/tester", "no terminal in a folder: where it was made");
// The first tab's terminal in the repo: that repo is the space's.
const repoSpace = { ...homeSpace, tabs: [homeSpace.tabs[1], homeSpace.tabs[0]] };
assert.equal(gi.info(repoSpace, homePanes)?.name, "other");
const sum = gi.summary(repoSpace, homePanes);
assert.equal(sum.head.text, "other \u00b7 mainline");
assert.deepEqual(sum.marks.map(m => m.short), ["\u21911", "\u00b11", "\u2302"], "↑ to push, ± uncommitted, ⌂ no remote");
assert.equal(sum.tip, "other \u00b7 mainline: 1 commit to push, 1 uncommitted file, no remote", "the same in words, one line");
// A third repo in another tab adds nothing to its marks (the main stick lists it).
gi.git[K("/repo/third")] = { ...other, name: "third", top: "/repo/third", ahead: 0, behind: 2, dirty: 0, repo: JSON.stringify([null, "/repo/third/.git"]) };
const both = [...homePanes, { tab: "a", cwd: "/repo/third", focused: false }];
assert.deepEqual(gi.summary(repoSpace, both).marks.map(m => m.short), ["\u21911", "\u00b11", "\u2302"], "only the space's own repo");
assert.deepEqual(gi.repos(repoSpace, both).map(r => r.name), ["other", "third"], "every repo, its own first, for the main stick");
const cleanRepo = { ...other, ahead: 0, behind: 0, dirty: 0, upstream: true, files: [] };
gi.git[K("/repo/other")] = cleanRepo;
assert.deepEqual(gi.summary(repoSpace, homePanes).marks.map(m => [m.short, m.text]), [["\u2713", "clean"]]);
assert.equal(new Git().summary(repoSpace, homePanes).tip, "Checking git\u2026");
gi.git[K("/repo/other")] = other;
gi.git[K("/home/tester")] = { ...other, name: "dots", top: "/home/tester", repo: JSON.stringify([null, "/home/tester/.git"]) };
assert.equal(gi.info(homeSpace, homePanes)?.name, "dots", "~ as a repo: the space's");
console.log("PASS: ^b g opens lazygit like GIT's click, at the repo (a folder that isn't one: GIT's dialog); the space's repo is its first terminal's, and only that one");

// ---- GIT's dialog: a folder that isn't in a repo (role git-init) ------------------------------
{
  const gi2 = await import(await load("mods/ram/gitinit.js"));
  // lazygit's state.yml: its recent repos, in its order (quoted or not), up to the next key.
  assert.deepEqual(gi2.recentRepos("lastupdatecheck: 0\nrecentrepos:\n    - /a\n    - '/b c'\n    - \"/d\"\nstartuppopupversion: 5\n    - /e\n"),
    ["/a", "/b c", "/d"]);
  assert.deepEqual([gi2.recentRepos("recentrepos: []\n"), gi2.recentRepos(""), gi2.recentRepos(undefined)], [[], [], []]);
  const gp = { role: "git-init", space: "s0", name: "api", folder: "/home/tester/notes", machine: null, overlay: "oG" };
  host.files = { "/home/tester/lg/state.yml": "lastupdatecheck: 0\nrecentrepos:\n    - /home/tester/notes\n    - /repo/api\n    - '/repo/gone'\n    - \"/home/tester/dots\"\nstartuppopupversion: 5\n" };
  // (notes has a .git that git won't read: not a repo here, and never offered as one.)
  const realRepos = new Set(["/repo/api", "/home/tester/dots", "/home/tester/notes"]);
  let initAnswer = { code: 0, stdout: "Initialized empty Git repository\n", stderr: "" };
  host.execHook = (command, args) => {
    if (command === "git" && args[0] === "var") return { code: 0, stdout: "main\n", stderr: "" };
    if (command === "lazygit") return { code: 0, stdout: "/home/tester/lg\n", stderr: "" };
    if (command === "sh") return { code: 0, stdout: args.slice(3).filter(d => realRepos.has(d)).join("\n") + "\n", stderr: "" };
    if (command === "git" && args[0] === "init") return initAnswer;
  };
  host.shared.set("layout", "ram");
  host.execs = [];
  let gv = view(gp);
  assert(gv.gitView.branch.focused, "the branch name has the keyboard");
  await settle();
  const GV = () => R(gv, gp);
  let gt2 = GV();
  for (const want of ["GIT", "api \u00b7 ~/notes", "~/notes isn't in a git repository.", "Its first branch: the name typed, else git's default (main)",
    "Create a repo here", "git init, then lazygit", "Open a recent repo \u25b8", "2 of lazygit's, to open instead", "\u2191\u2193 choose \u00b7 Enter open \u00b7 Esc close"])
    assert(textOf(gt2).includes(want), want);
  assert.deepEqual(host.execs.map(e => [e.command, e.args[0], e.opts?.on ?? null]), [["git", "var", null], ["lazygit", "--print-config-dir", null], ["sh", "-c", null]],
    "git's default branch, lazygit's list and which of its repos still are, on the space's machine");
  assert.equal(textOf(withId(gt2, "git-create"))[0], "\u25b8", "Create is chosen first");
  const gkey = k => { host.stopped = false; withId(GV(), "git-init").handlers.on_key_down({ key: k }, cx); };
  gkey("down");
  assert.deepEqual([textOf(withId(GV(), "git-recent-open"))[0], host.stopped], ["\u25b8", true], "down: the recent repos");
  gkey("up");
  assert.equal(textOf(withId(GV(), "git-create"))[0], "\u25b8");
  host.stopped = false;
  gkey("enter");
  assert(!host.stopped, "Enter in the name field is its own (submit)");
  // Enter (submit) on Create, no name: git init with git's default, in that folder; then
  // every copy looks there again, and RAM's strip opens lazygit there.
  host.execs = []; host.closed = [];
  gv.gitView.branch.handlers.submit({}, cx); await settle();
  assert.deepEqual(host.execs.map(e => [e.args, e.opts]), [[["init"], { cwd: "/home/tester/notes", on: null }]]);
  assert.deepEqual([host.shared.get("ram.git.again")?.folder, host.shared.get("ram.git.again")?.on], ["/home/tester/notes", null]);
  const req = host.shared.get("ram.tool.open");
  assert.deepEqual([req.kind, req.space, req.folder], ["lazygit", "s0", "/home/tester/notes"], "RAM's strip opens it, by its own rules");
  assert.deepEqual(host.closed, ["oG"], "and the dialog closes");
  // A name: that first branch.
  gv = view(gp); await settle();
  gv.gitView.branch.set_value("trunk");
  host.execs = [];
  gv.gitView.branch.handlers.submit({}, cx); await settle();
  assert.deepEqual(host.execs.at(-1).args, ["init", "--initial-branch=trunk"]);
  // git says no: its error shows, the dialog stays.
  initAnswer = { code: 128, stdout: "", stderr: "hint: something\nfatal: invalid initial branch name: 'a b'\n" };
  gv = view(gp); await settle();
  gv.gitView.branch.set_value("a b");
  host.closed = [];
  click(R(gv, gp), "git-create"); await settle();
  gt2 = R(gv, gp);
  assert.deepEqual([textOf(withId(gt2, "git-error")), host.closed, textOf(withId(gt2, "git-create"))[1]],
    [["fatal: invalid initial branch name: 'a b'"], [], "Create a repo here"], "the error, the dialog, and Create again");
  initAnswer = { code: 0, stdout: "", stderr: "" };
  // Open a recent repo: lazygit's list (but this folder and what isn't a repo any more).
  gv = view(gp); await settle();
  gkey("down");
  gv.gitView.branch.handlers.submit({}, cx);
  gt2 = GV();
  assert.equal(gv.gitView.mode, "recent");
  assert(gv.gitView.handle.is_focused(), "the list has the keyboard (not the name field)");
  assert.deepEqual([textOf(withId(gt2, "git-recent-0"))[1], textOf(withId(gt2, "git-recent-1"))[1], withId(gt2, "git-recent-2")], ["/repo/api", "~/dots", undefined]);
  assert.equal(textOf(withId(gt2, "git-recent-0"))[0], "\u25b8");
  gkey("down"); gkey("down");
  assert.equal(textOf(withId(GV(), "git-recent-1"))[0], "\u25b8", "down stops at the last");
  gkey("left");
  assert.deepEqual([gv.gitView.mode, gv.gitView.choice, gv.gitView.branch.focused], ["main", 1, true], "\u2190: back, on that row");
  gkey("enter");
  assert.equal(gv.gitView.mode, "main", "(Enter is the name field's)");
  gv.gitView.branch.handlers.submit({}, cx);
  gkey("down");
  host.closed = [];
  gkey("enter");
  assert.equal(host.shared.get("ram.tool.open").folder, "/home/tester/dots", "Enter: lazygit in that repo");
  assert.deepEqual(host.closed, ["oG"]);
  // Clicks do the same; outside RAM, a tab of its own (labelled as the key bar's).
  host.shared.set("layout", "traveler");
  gv = view(gp); await settle();
  click(R(gv, gp), "git-recent-open");
  host.calls = [];
  click(R(gv, gp), "git-recent-0");
  assert.deepEqual(host.calls, [{ name: "tab.new", args: { space: "s0", name: "lazygit api", folder: "/repo/api",
    argv: ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" "ram.lazygit=$PWD" >/dev/null 2>&1; exec lazygit'] } }]);
  gv = view(gp); await settle();
  host.calls = [];
  click(R(gv, gp), "git-create"); await settle();
  assert.deepEqual([host.calls.at(-1)?.args?.name, host.calls.at(-1)?.args?.folder], ["lazygit notes", "/home/tester/notes"]);
  assert.deepEqual(gi2.LAZY_ARGV, ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" "ram.lazygit=$PWD" >/dev/null 2>&1; exec lazygit']);
  host.shared.set("layout", "ram");
  // No lazygit (or no recent repos): that row says so and does nothing.
  host.execHook = (command, args) => {
    if (command === "git" && args[0] === "var") return { code: 1, stdout: "", stderr: "" };
    if (command === "lazygit") return { code: 127, stdout: "", stderr: "not found" };
  };
  gv = view(gp); await settle();
  gt2 = R(gv, gp);
  assert(textOf(gt2).includes("lazygit has none") && textOf(gt2).includes("Its first branch: the name typed, else git's default (master)"),
    "an older git: master");
  click(gt2, "git-recent-open");
  assert.equal(gv.gitView.mode, "main", "nothing to open");
  withId(R(gv, gp), "git-init").handlers.on_key_down({ key: "down" }, cx);
  gv.gitView.branch.handlers.submit({}, cx);
  assert.equal(gv.gitView.mode, "main", "nor by Enter");
  host.execHook = null; host.files = {};
  // RAM's strip takes the request once (fresh ones only): lazygit there, labelled with it.
  host.shared.set("ram.zoom", "space");
  const toolReq = { at: Date.now(), kind: "lazygit", space: "s0", folder: "/home/tester/notes" };
  host.shared.set("ram.tool.open", toolReq);
  host.execs = []; host.hcs = [];
  R(map, {}); await settle();
  assert.deepEqual(host.execs.filter(e => e.command === "herdr-app").map(e => e.args.slice(4, 8)), [["--name", "lazygit notes", "--folder", "/home/tester/notes"]]);
  assert.deepEqual(host.hcs.at(-1), ["label", "tNEW", "ram.lazygit=/home/tester/notes"]);
  assert.equal(host.shared.get("ram.tool.open"), null, "taken");
  host.shared.set("ram.tool.open", toolReq);   // (as if its clearing hadn't landed yet)
  host.execs = [];
  R(map, {}); await settle();
  assert.equal(host.execs.filter(e => e.command === "herdr-app").length, 0, "once");
  host.shared.set("ram.tool.open", { at: Date.now() - 60000, kind: "lazygit", space: "s0", folder: "/x" });
  R(map, {}); await settle();
  assert.equal(host.execs.filter(e => e.command === "herdr-app").length, 0, "an old one is left alone");
  host.shared.set("ram.tool.open", null);
  // Every copy's git looks again at the folder made a repo (and the folders under it).
  const { Git: G2, GIT_AGAIN } = await import(gitURL);
  assert.equal(GIT_AGAIN, "ram.git.again");
  const g2 = new G2();
  const gsp = [{ id: "x", name: "notes", machine: null, folder: "/home/tester/notes", tabs: [{ id: "a", active: true }, { id: "b", active: false }] }];
  const gps = [{ pane: "pa", terminal: "ta", tab: "a", cwd: "/home/tester/notes/src", program: { shell: true } },
    { pane: "pb", terminal: "tb", tab: "b", cwd: "/home/tester/other", program: { shell: true } }];
  const first = g2.due(Date.now(), gsp, gps);
  for (const k of first) g2.git[k] = null;
  host.shared.delete("ram.git.again");
  assert.equal(g2.due(Date.now(), gsp, gps).size, 0, "known and not repos: not asked again");
  host.shared.set("ram.git.again", { at: 123, on: null, folder: "/home/tester/notes/" });
  assert.deepEqual([...g2.due(Date.now(), gsp, gps)], [JSON.stringify([null, "/home/tester/notes/src"])], "the folder under it, not the other");
  assert.equal(g2.due(Date.now(), gsp, gps).size, 0, "once");
  host.shared.set("ram.git.again", { at: 124, on: "pc", folder: "/home/tester" });
  assert.equal(g2.due(Date.now(), gsp, gps).size, 0, "another machine's folder isn't this one");
  host.shared.delete("ram.git.again");
  spaces[0].folder = "/repo/api";
}
console.log("PASS: GIT's dialog (a folder that isn't a repo): lazygit's questions as a menu; Create runs git init (the name typed, else git's default) and opens lazygit; Open a recent repo lists lazygit's; RAM's strip opens it; every copy's git looks again");

// ---- Follow: SP to each agent that needs you, then back --------------------------------
// Fixture: t2 (api, &2) and t6 (web, &1) need you; t6 has waited longer. You're on api *1.
const show = (spaceId, tabId) => {
  for (const s of spaces) { s.active = s.id === spaceId; if (s.active) s.tabs.forEach(t => t.active = t.id === tabId); }
  for (const a of agentList) a.focused = a.tab === tabId;
};
const focusCalls = () => host.calls.filter(c => c.name === "agent.focus");
const fmap = view({});
fmap.size = { width: 1600, height: 700 };
// follow's f is on the sticks (role rams); follow itself runs in the strip's copy.
const frams = view({ role: "rams" });
frams.size = { width: 1400, height: 340 };
const FR = () => R(frams, { role: "rams" });
host.shared.set("ram.zoom", "meta"); host.shared.set("ram.follow", false);
host.calls = [];
let ft = R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "follow off: nothing moves");
assert(withId(FR(), "ram-follow") && !op(withId(FR(), "ram-follow"), "bg"), "meta's f is off");
assert(op(withId(FR(), "ram-follow"), "tooltip")[0].endsWith("  ^b f"), "its tooltip says its key");
click(FR(), "ram-follow");
assert.equal(host.shared.get("ram.follow"), true);
R(fmap, {}); await settle();
assert.deepEqual(focusCalls(), [{ name: "agent.focus", args: { terminal: "t6" } }], "on: the agent that has waited longest");
show("s1", "tab1-0");
host.calls = [];
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "it stays there: nothing new happened");
assert.deepEqual(op(withId(FR(), "ram-follow"), "border_color"), ["#ffb547"], "the f is lit");
// Another agent starts needing you while the one you're on still does: follow waits.
agentList[3].status = "blocked"; raw[3].status_ms = Date.now();
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "the shown tab's agent needs you too: it waits");
// You answer it: follow moves on, to the one waiting longest (t2, not the newer t4).
agentList[5].status = "working";
R(fmap, {}); await settle();
assert.deepEqual(focusCalls(), [{ name: "agent.focus", args: { terminal: "t2" } }], "answered: on to the next");
show("s0", "tab0-1");
host.calls = [];
// While it waits, picking another tab yourself ends the wait: nothing pulls you back.
agentList[6].status = "blocked"; raw[6].status_ms = Date.now() + 5;
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "on t2 (needs you): t7 waits");
show("s3", "tab3-1");
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "you picked a tab yourself: follow leaves you there");
// In the space level follow moves SP too, never the screen: t9 asks, and t2 (waiting
// longest, api &2) gets SP.
host.shared.set("ram.zoom", "space");
agentList[8].status = "blocked"; raw[8].status_ms = Date.now() + 9;
host.calls = [];
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "in the space level the screen stays");
assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-1", pane: "p1" }, "SP moves to it");
// Off is off.
host.shared.set("ram.zoom", "meta"); host.shared.set("ram.follow", false);
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0);
// ^b f: on or off, in the level you're in.
host.shared.set("ram.zoom", "space");
await send("follow");
assert.equal(host.shared.get("ram.follow"), true);
assert.equal(host.shared.get("ram.zoom"), "space", "^b f turns it on where you are: follow works in both levels");
await send("follow");
assert.equal(host.shared.get("ram.follow"), false, "again: off");
assert.equal(keysFile[`mod:${BAR}`].f, `${BAR}.ram.follow`);
// Back to the fixture as it was.
Object.assign(agentList[3], { status: "idle" }); Object.assign(agentList[5], { status: "blocked" });
Object.assign(agentList[6], { status: "idle" }); Object.assign(agentList[8], { status: "idle" });
raw.forEach((r, i) => { if (i < 10) r.status_ms = now - i * 1000; });
// The way back: when you answer the last agent that needed you, follow goes
// straight back to the tab you were on before its first move. A fresh strip
// copy, so nothing above carries over; the clock is moved on by hand (later).
{
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  const later = ms => { skew += ms; };
  const fb = view({});
  fb.size = { width: 1600, height: 700 };
  const FB = async () => { R(fb, {}); await settle(); };
  const selects = () => host.calls.filter(c => c.name === "space.select" || c.name === "tab.select");
  const back = [{ name: "tab.select", args: { id: "tab3-1" } }];
  const t2 = agentList[1], t6 = agentList[5];
  const ask = (a, i) => { a.status = "blocked"; raw[i].status_ms = Date.now(); };
  const focus = terminal => ({ name: "agent.focus", args: { terminal } });
  host.shared.set("ram.zoom", "meta"); host.shared.set("ram.follow", true);
  // Only t6 (web *1) needs you; you're on docs &2.
  t2.status = "idle";
  show("s3", "tab3-1"); host.calls = [];
  await FB();
  assert.deepEqual(focusCalls(), [focus("t6")]);
  show("s1", "tab1-0"); await FB();
  assert.deepEqual(selects(), [], "it waits for your answer");
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), back, "answered: straight back to docs &2");
  show("s3", "tab3-1"); host.calls = [];
  await FB();
  assert.deepEqual(selects(), [], "only once");
  // It asks again once you're back: shown again at once.
  ask(t6, 5); await FB();
  assert.deepEqual(focusCalls(), [focus("t6")], "asked again: straight to it");
  // It asks again before the move back has shown: not missed.
  show("s1", "tab1-0"); await FB();
  t6.status = "working"; host.calls = []; await FB();
  assert.deepEqual(selects(), back);
  ask(t6, 5); await FB();
  assert.deepEqual(focusCalls(), [], "still on web *1: nothing is decided before the move back shows");
  show("s3", "tab3-1"); await FB();
  assert.deepEqual(focusCalls(), [focus("t6")], "then it's shown again, though it asked before you got back");
  show("s1", "tab1-0"); await FB();
  t6.status = "working"; await FB();
  show("s3", "tab3-1"); await FB(); host.calls = [];
  // Answered before follow's move has shown: back once it shows.
  ask(t6, 5); await FB();
  assert.deepEqual(focusCalls(), [focus("t6")]);
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), [], "not before follow's move shows");
  show("s1", "tab1-0"); await FB();
  assert.deepEqual(selects(), back, "it showed with nothing needing you: straight back");
  show("s3", "tab3-1"); await FB(); host.calls = [];
  // Two agents one after the other: back to where you were before the first.
  ask(t2, 1); raw[1].status_ms -= 5000; ask(t6, 5); await FB();
  assert.deepEqual(focusCalls(), [focus("t2")], "t2 waited longest");
  show("s0", "tab0-1"); await FB();
  t2.status = "idle"; await FB();
  assert.deepEqual(focusCalls().at(-1), focus("t6"), "then t6");
  assert.deepEqual(selects(), [], "not back while t6 needs you");
  show("s1", "tab1-0"); await FB();
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), back, "back to docs &2, not to api &2");
  show("s3", "tab3-1"); await FB(); host.calls = [];
  // Your tab closed meanwhile: you stay on the one you answered in.
  ask(t6, 5); await FB();
  show("s1", "tab1-0"); await FB();
  const docs = spaces[3], gone = docs.tabs.splice(1, 1)[0];
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), [], "docs &2 closed: you stay");
  docs.tabs.splice(1, 0, gone);
  // You picked another tab yourself after follow's move: it leaves you there.
  show("s3", "tab3-1"); await FB(); host.calls = [];
  ask(t6, 5); await FB();
  show("s1", "tab1-0"); await FB();
  show("s0", "tab0-0"); await FB();
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), [], "you moved: no way back");
  // Even when you go back to that agent's tab yourself before you answer.
  show("s3", "tab3-1"); await FB(); host.calls = [];
  ask(t6, 5); await FB();
  show("s1", "tab1-0"); await FB();
  show("s0", "tab0-0"); await FB();
  show("s1", "tab1-0"); await FB();
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), [], "you picked its tab yourself: you stay");
  // follow turned off: no way back either.
  show("s3", "tab3-1"); await FB(); host.calls = [];
  ask(t6, 5); await FB();
  show("s1", "tab1-0"); await FB();
  host.shared.set("ram.follow", false); await FB();
  t6.status = "working"; await FB();
  assert.deepEqual(selects(), [], "follow off: you stay");
  // The move back never shows: 3 s on, follow looks at what needs you again.
  host.shared.set("ram.follow", true);
  show("s3", "tab3-1"); await FB(); host.calls = [];
  ask(t6, 5); await FB();
  show("s1", "tab1-0"); await FB();
  t6.status = "working"; await FB();
  ask(t2, 1); await FB();
  assert.deepEqual(focusCalls(), [focus("t6")], "t2 waits while the move back is out");
  later(3100); await FB();
  assert.deepEqual(focusCalls().at(-1), focus("t2"), "3 s on: t2 is shown");
  // follow turned off while a move back is out (it never shows), then on: it
  // decides at once.
  show("s0", "tab0-1"); await FB();
  t2.status = "idle"; await FB();
  host.shared.set("ram.follow", false); await FB();
  host.shared.set("ram.follow", true); ask(t6, 5); host.calls = []; await FB();
  assert.deepEqual(focusCalls(), [focus("t6")], "off and on again: no move back left over");
  Date.now = realNow;
  Object.assign(t2, { status: "blocked" }); Object.assign(t6, { status: "blocked" });
  raw.forEach((r, i) => { if (i < 10) r.status_ms = now - i * 1000; });
  host.shared.set("ram.follow", false);
}
// In the space level: SP goes to each agent that needs you and back, and the screen
// stays where you work. The meta button turns red while SP's agent needs you.
{
  const fs = view({});
  fs.size = { width: 1600, height: 700 };
  // (A tree can't come out of an async function: the recorder answers "then", so it
  // would pass for a promise. Render, settle, then render again to look.)
  const FS = async () => { R(fs, {}); await settle(); };
  const t2 = agentList[1], t6 = agentList[5];
  const metaButton = () => withId(R(fs, {}), "ram-level-meta");
  const moves = () => host.calls.filter(c => ["agent.focus", "tab.select", "space.select", "pane.focus"].includes(c.name));
  host.shared.set("ram.zoom", "space"); host.shared.set("ram.follow", true);
  host.shared.set("ram.sp", { space: "s3", tab: "tab3-1", pane: null });
  t2.status = "idle";
  show("s0", "tab0-0"); host.calls = [];
  await FS();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s1", tab: "tab1-0", pane: "p5" }, "SP to t6, web *1");
  assert.deepEqual(moves(), [], "nothing else moves");
  assert.deepEqual(op(metaButton(), "border_color"), ["#ff5f6d"], "meta's button is red: SP's agent needs you");
  assert.equal(op(metaButton(), "tooltip")[0], "meta: SP is on an agent that needs you");
  assert(flatten(metaButton()).some(n => n.ops.some(([k, prop]) => k === "loop" && prop === "opacity")), "and pulses");
  t6.status = "working";
  await FS();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s3", tab: "tab3-1", pane: null }, "answered: SP goes back");
  assert.notDeepEqual(op(metaButton(), "border_color"), ["#ff5f6d"], "and the button calms down");
  assert.deepEqual(moves(), [], "the screen never moved");
  // Then into meta: it shows SP, where follow left it.
  t6.status = "blocked"; raw[5].status_ms = Date.now() + 20;
  await FS();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s1", tab: "tab1-0", pane: "p5" });
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  await FS();
  assert.deepEqual(host.calls.filter(c => c.name === "pane.focus" || c.name === "tab.select"), [{ name: "pane.focus", args: { pane: "p5" } }],
    "meta shows SP: t6's pane");
  // You answer it there: SP goes back to where it was before follow's move.
  show("s1", "tab1-0"); await FS();
  t6.status = "working"; host.calls = [];
  await FS();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab3-1" } }], "answered in meta: back (the way back lived through the level change)");
  show("s3", "tab3-1"); await FS();
  t2.status = "blocked"; t6.status = "blocked";
  raw.forEach((r, i) => { if (i < 10) r.status_ms = now - i * 1000; });
  host.shared.set("ram.follow", false);
}
show("s0", "tab0-0");
host.shared.set("ram.bp", { s0: "tab0-0" }); host.shared.set("ram.frame", "s0"); host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
host.shared.set("ram.zoom", "space"); host.calls = [];
console.log("PASS: follow (its f under the sticks' +, ^b f, in either level): SP to the agent waiting longest, waits while yours needs you, moves on once answered, never undoes your own pick, and goes straight back after the last answer (unless it closed or you moved), without missing an agent that asks again; in the space level only SP moves and meta's button turns red");

// ---- RET: follow's return address, a dim mark on that frame while follow is away ------------
{
  const fr = view({});
  fr.size = { width: 1600, height: 700 };
  const FRR = async () => { R(fr, {}); await settle(); };
  const t2 = agentList[1], t6 = agentList[5];
  const ptrText = id => textOf(withId(RR(), `ptr-${id}`));
  const ptrColors = id => flatten(withId(RR(), `ptr-${id}`)).filter(n => n.kind === "div").map(n => op(n, "text_color")?.[0]);
  host.shared.set("ram.zoom", "meta"); host.shared.set("ram.follow", true);
  host.shared.set("ram.bp", { s3: "tab3-0" });
  t2.status = "idle";   // only t6 (web *1) needs you
  show("s3", "tab3-1");
  await FRR();
  assert.deepEqual(host.shared.get("ram.ret"), { space: "s3", tab: "tab3-1", pane: null }, "follow's first move: the return address");
  show("s1", "tab1-0"); await FRR();   // (its move shows: SP is on web *1)
  assert.deepEqual(host.shared.get("ram.ret"), { space: "s3", tab: "tab3-1", pane: null }, "kept while t6 needs you");
  rams.size = { width: 1400, height: 340 };
  assert.deepEqual(ptrText("tab3-1"), ["RET\u25b8"], "a RET mark on docs &2");
  assert.deepEqual(ptrColors("tab3-1"), ["#ffb54788"], "in SP's amber, dimmed");
  assert.equal(op(withId(RR(), "ptr-tab3-1"), "tooltip")[0], "RET: follow takes SP back here once you've answered");
  assert.equal(textOf(withId(RR(), "frame-tab3-1"))[1], "*2", "a pointer points there: *2");
  assert(widthOf(withId(RR(), "ptr-tab3-1")) >= [..."RET\u25b8"].length * 10.5 * 1.25 * 0.6, "RET\u25b8 fits its column");
  // On docs' BP: both, by their initials.
  host.shared.set("ram.bp", { s3: "tab3-1" });
  assert.deepEqual(ptrText("tab3-1"), ["B", "R", "\u25b8"]);
  assert.equal(op(withId(RR(), "ptr-tab3-1"), "tooltip")[0], "BP: docs's work tab \u00b7 RET: follow takes SP back here once you've answered");
  host.shared.set("ram.bp", { s3: "tab3-0" });
  // You answer: SP goes back, and the mark goes.
  show("s1", "tab1-0"); await FRR();
  t6.status = "working"; await FRR();
  show("s3", "tab3-1"); await FRR();
  assert.equal(host.shared.get("ram.ret"), null, "home: no return address");
  assert(!ptrText("tab3-1").some(x => x.startsWith("RET") || x === "R"), "no RET mark");
  // follow off while away: the mark goes too.
  t6.status = "blocked"; raw[5].status_ms = Date.now() + 30;
  await FRR();
  assert(host.shared.get("ram.ret"));
  host.shared.set("ram.follow", false); await FRR();
  assert.equal(host.shared.get("ram.ret"), null, "follow off: no return address");
  t2.status = "blocked"; t6.status = "blocked";
  raw.forEach((r, i) => { if (i < 10) r.status_ms = now - i * 1000; });
  show("s0", "tab0-0");
  host.shared.set("ram.bp", { s0: "tab0-0" }); host.shared.set("ram.frame", "s0"); host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
  host.shared.set("ram.zoom", "space"); await FRR();
}
console.log("PASS: RET: while follow is away, a dim RET\u25b8 marks its return address (BR\u25b8 on a BP); it goes once SP is back or follow is off");

// ---- Commands running in your tabs, in HEAP (procs.js) ------------------------------------------
{
  const pr = await import(await load("mods/ram/procs.js"));
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  const later = ms => { skew += ms; };
  const shellProg = { key: "shell", name: "zsh", shell: true, agent: false };
  const cargo = { key: "cargo", name: "Cargo", shell: false, agent: false };
  // web &2 runs a shell, its terminal tB.
  const term = { address: "tB", state: "live", created_ms: 9800, labels: {}, program: shellProg, foreground: { pid: 600, argv: ["zsh", "-i"] } };
  raw.push(term);
  panes.push({ pane: "pB", terminal: "tB", tab: "tab1-1", title: "zsh", status: null, focused: false, cwd: "/repo/web", program: shellProg });
  const runs = (program, argv, pid) => Object.assign(term, { program, foreground: { pid, argv } });
  // What counts as a command: not a shell at its prompt, an agent, a sub-agent, a tool's
  // tab, or a program that waits for you; an interpreter alone is a REPL.
  const c = (program, argv, extra = {}) => pr.command({ state: "live", labels: {}, program, foreground: { pid: 1, argv }, ...extra });
  assert.deepEqual(c(cargo, ["cargo", "test"]), { pid: 1, name: "Cargo" });
  assert.equal(c(shellProg, ["zsh"]), null, "a shell at its prompt");
  assert.equal(c({ key: "kiro", name: "Kiro", agent: true }, ["kiro-cli"]), null, "an agent");
  assert.equal(c(cargo, ["cargo"], { status: "working" }), null, "a terminal reporting a status is an agent's");
  assert.equal(c(cargo, ["cargo"], { parent: "t1" }), null, "a sub-agent");
  assert.equal(c(cargo, ["cargo"], { labels: { "ram.lazygit": "/r" } }), null, "a tool's tab");
  for (const [key, argv] of [["nvim", ["nvim", "x"]], ["program", ["fresh", "x"]], ["lazygit", ["lazygit"]], ["less", ["less", "f"]], ["htop", ["top"]], ["ssh", ["ssh", "pc"]], ["program", ["fzf"]], ["program", ["hunk", "diff"]]])
    assert.equal(c({ key, name: key }, argv), null, `${argv[0]} waits for you`);
  assert.equal(c({ key: "python", name: "Python" }, ["python3"]), null, "a REPL");
  assert.deepEqual(c({ key: "python", name: "Python" }, ["python3", "x.py"]), { pid: 1, name: "Python" }, "a script runs");
  assert.equal(c({}, []), null, "nothing known: not a command");
  assert.deepEqual([pr.lastLine("\x1b[32mok\x1b[0m 12 tests\r\nlast \x1b]0;t\x07line  \n\n  \n"), pr.lastLine(""), pr.lastLine("x".repeat(200)).length],
    ["last line", "", 160], "the last line with text, colors and controls out, 160 at most");
  assert(pr.sameProcs({ a: { x: 1 }, b: { y: 2 } }, { b: { y: 2 }, a: { x: 1 } }) && !pr.sameProcs({ a: 1 }, { a: 2 }), "key order aside");
  // The strip's copy keeps a command the moment it sees it run: no wait.
  host.shared.delete("ram.procs");
  const pmBefore = host.timers.length;
  const pm = view({});
  const pmTail = host.timers.slice(pmBefore).find(tm => tm.ms === 2000);   // its last-lines reader
  show("s0", "tab0-0");
  runs(cargo, ["cargo", "test"], 700);
  pm.trackProcs();
  const counted = host.shared.get("ram.procs").tB;
  assert.deepEqual([counted.pid, counted.name, counted.done, counted.line], [700, "Cargo", null, null], "at once");
  assert(Math.abs(Date.now() - counted.since) < 300, "since now");
  later(1000); pm.trackProcs();
  assert.equal(host.shared.get("ram.procs").tB, counted, "the same command: kept as it is");
  runs({ key: "npm", name: "npm" }, ["npm", "test"], 699); pm.trackProcs();
  assert.deepEqual([host.shared.get("ram.procs").tB.name, host.shared.get("ram.procs").tB.pid], ["npm", 699], "another command (the one between not seen): that one");
  runs(cargo, ["cargo", "test"], 700); pm.trackProcs();
  host.hcs = [];
  pmTail.fn(cx); await settle();
  assert.deepEqual(host.hcs, [["read", "tB"]], "the strip's copy reads its last line too (every 2 s)");
  // The space level's column (web): its row, working, with its last output line.
  show("s1", "tab1-0");
  host.shared.set("ram.zoom", "space");
  const ps = view({ role: "side" });
  ps.size = { width: 340, height: 900 };
  let pt = R(ps, { role: "side" });
  assert.deepEqual(textOf(withId(pt, "heap-tB")), ["&2", "Cargo", "", "Working"], "web &2, Cargo, (no line read yet here), Working");
  assert(textOf(pt).includes("HEAP \u2191  3"), "HEAP counts it: web's two agents and it");
  host.hcs = []; host.readOut = "Compiling ram v0.1.0\n   Running 48 tests\n";
  host.timers.filter(tm => tm.ms === 2000).at(-1).fn(cx); await settle();
  assert.deepEqual(host.hcs, [["read", "tB"]], "the column reads the running commands of the space it shows");
  pt = R(ps, { role: "side" });
  assert.deepEqual(textOf(withId(pt, "heap-tB")), ["&2", "Cargo", "Running 48 tests", "Working"], "and shows their last lines");
  host.readOut = "/repo/web/src/lib.rs:3: warning: unused\n";
  host.timers.filter(tm => tm.ms === 2000).at(-1).fn(cx); await settle();
  assert.equal(textOf(withId(R(ps, { role: "side" }), "heap-tB"))[2], "/repo/web/src/lib.rs:3: warning: unused", "whatever it says (a path too)");
  host.readOut = "Compiling ram v0.1.0\n   Running 48 tests\n";
  host.timers.filter(tm => tm.ms === 2000).at(-1).fn(cx); await settle();
  pt = R(ps, { role: "side" });
  host.shared.set("ram.zoom", "meta");
  host.hcs = [];
  host.timers.filter(tm => tm.ms === 2000).at(-1).fn(cx); await settle();
  assert.deepEqual(host.hcs, [], "(not in meta: the column is the main stick there)");
  host.shared.set("ram.zoom", "space");
  pmTail.fn(cx); await settle();
  host.readOut = null;
  assert(op(withId(pt, "heap-tB"), "tooltip")[0].startsWith("Cargo: Running 48 tests \u00b7 web / 2 \u00b7 working") &&
    op(withId(pt, "heap-tB"), "tooltip")[0].endsWith("click: peek at its output"));
  // A click (or Enter) peeks at its output, over the tab you're on.
  host.calls = [];
  click(pt, "heap-tB");
  assert.deepEqual(host.calls, [{ name: "terminal.peek", args: { terminal: "tB" } }]);
  // Not agents: agent.next and follow don't see it.
  R(pm, {}); await settle();
  assert(!host.order.includes("tB"), "not in agent.next's order");
  // It ends while you're on web &1: done, with its last line, until you look.
  runs(shellProg, ["zsh", "-i"], 600);
  later(1000); pm.trackProcs();
  const ended = host.shared.get("ram.procs").tB;
  assert.deepEqual([ended.done != null, ended.line], [true, "Running 48 tests"], "done, keeping its last line (the strip read it)");
  pt = R(ps, { role: "side" });
  assert.deepEqual(textOf(withId(pt, "heap-tB")), ["&2", "Cargo", "Running 48 tests", "Done"]);
  assert.deepEqual(op(withId(pt, "heap-tB"), "bg"), ["#12423caa"], "lit as a finished agent's");
  host.hcs = [];
  pmTail.fn(cx); await settle();
  host.timers.filter(tm => tm.ms === 2000).at(-1).fn(cx); await settle();
  assert.deepEqual(host.hcs, [], "a done one isn't read again (its screen is your prompt now)");
  assert(textOf(withId(pt, "stack-s1")).includes("+1"), "web's +1 counts it");
  // In meta: its stick's row and its block, done.
  host.shared.set("ram.zoom", "meta");
  pt = RR();
  assert(withId(pt, "alloc-tB") && textOf(withId(pt, "alloc-tB")).includes("Running 48 tests"), "the stick's heap row, with its last line");
  assert.deepEqual([op(withId(pt, "block-tB"), "bg")[0], op(withId(pt, "block-tB"), "border_color")[0]], ["#12423c", "#6fe3d3"], "its block, done");
  assert(textOf(withId(pt, "head-s1")).includes("+1"));
  const ms = view({ role: "side" }); ms.size = { width: 390, height: 1400 };
  assert(withId(R(ms, { role: "side" }), "all-heap-tB"), "the main stick lists it too");
  host.shared.set("ram.zoom", "space");
  // A running one shows its block working.
  // You look at web &2: seen, gone (the strip's copy looks as it draws, too).
  show("s1", "tab1-1");
  R(pm, {}); await settle();
  assert.equal(host.shared.get("ram.procs").tB, undefined, "seen");
  assert(!withId(R(ps, { role: "side" }), "heap-tB"));
  // It ends while you look: never done. While the window is inactive: done.
  runs(cargo, ["cargo", "build"], 701); pm.trackProcs();
  assert(host.shared.get("ram.procs").tB && !host.shared.get("ram.procs").tB.done, "running on the tab you're on: still listed");
  runs(shellProg, ["zsh", "-i"], 600); pm.trackProcs();
  assert.equal(host.shared.get("ram.procs").tB, undefined, "ended where you looked: gone");
  runs(cargo, ["cargo", "build"], 702); pm.trackProcs();
  host.active = false;
  runs(shellProg, ["zsh", "-i"], 600); pm.trackProcs();
  assert(host.shared.get("ram.procs").tB?.done, "ended while the window wasn't active: done");
  host.active = true;
  // Peeking at a done one is seeing it.
  show("s1", "tab1-0");
  host.calls = [];
  click(R(ps, { role: "side" }), "heap-tB");
  assert.deepEqual([host.calls, host.shared.get("ram.procs").tB], [[{ name: "terminal.peek", args: { terminal: "tB" } }], undefined]);
  // A short one shows too, and ends done (it ran where you weren't looking); a new
  // command there replaces a done mark; a closed tab drops it.
  runs({ key: "program", name: "ls" }, ["ls"], 703); pm.trackProcs();
  assert.equal(host.shared.get("ram.procs").tB.name, "ls", "an ls shows at once");
  runs(shellProg, ["zsh", "-i"], 600); pm.trackProcs();
  assert(host.shared.get("ram.procs").tB.done, "and stays done until you look");
  runs(cargo, ["cargo", "run"], 703); pm.trackProcs();
  assert.deepEqual([host.shared.get("ram.procs").tB.name, host.shared.get("ram.procs").tB.done], ["Cargo", null],
    "a new command there replaces it (even one given the same pid)");
  // The exit history is the agents': a command never shows there as freed.
  host.shared.set("ram.zoom", "meta");
  RR();   // (the sticks keep the exit history as they draw)
  assert(rams.history.length > 0 && !rams.history.some(a => a.address === "tB"));
  host.shared.set("ram.zoom", "space");
  raw.splice(raw.indexOf(term), 1);
  panes.splice(panes.findIndex(p => p.pane === "pB"), 1);
  pm.trackProcs();
  assert.deepEqual(host.shared.get("ram.procs"), {}, "its terminal gone: dropped");
  Date.now = realNow;
  host.shared.delete("ram.procs");
  show("s0", "tab0-0");
  host.shared.set("ram.zoom", "space");
}
console.log("PASS: commands in HEAP: a shell's command shows the moment it runs (not agents, sub-agents, tools or programs that wait for you), working with its last line, done until you look (or peek), and a click peeks at it");

// ---- SP and BP: the two levels' places ------------------------------------------------------
// SP (shared ram.sp) is the tab meta shows: there's one, and it jumps. Each space has a
// BP (ram.bp), its work tab, which the space level shows in it; the space you work in
// (ram.frame) has the bright one. A level change shows that level's place.
{
  const pm = view({});
  pm.size = { width: 1600, height: 700 };
  const PM = async () => { R(pm, {}); await settle(); };
  const moves = () => host.calls.filter(c => ["tab.select", "pane.focus", "space.select"].includes(c.name));
  host.shared.set("ram.zoom", "space");
  host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
  host.shared.set("ram.bp", { s0: "tab0-0" }); host.shared.set("ram.frame", "s0");
  show("s0", "tab0-0");
  await PM();
  // Into meta: SP's tab shows. Until it has, what still shows isn't taken for SP.
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab1-0" } }], "meta shows SP's tab");
  await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s1", tab: "tab1-0", pane: null }, "the space level's tab, still showing, isn't SP");
  show("s1", "tab1-0"); await PM();
  // In meta what shows is SP: picking a tab moves SP, and the BPs stay.
  show("s0", "tab0-1"); await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-1", pane: null }, "SP follows what meta shows");
  assert.deepEqual([host.shared.get("ram.bp"), host.shared.get("ram.frame")], [{ s0: "tab0-0" }, "s0"], "BP and the frame stay");
  // Back in the space level: the bright BP shows (api *1), and SP stays.
  host.shared.set("ram.zoom", "space"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab0-0" } }], "the space level shows the bright BP");
  show("s0", "tab0-0"); await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-1", pane: null }, "SP stays where meta left it");
  // In the space level what shows is the BP: a tab change moves it; another space is the frame.
  show("s0", "tab0-1"); await PM();
  assert.deepEqual(host.shared.get("ram.bp"), { s0: "tab0-1" });
  show("s1", "tab1-1"); await PM();
  assert.deepEqual([host.shared.get("ram.bp"), host.shared.get("ram.frame")], [{ s0: "tab0-1", s1: "tab1-1" }, "s1"], "web is where you work now");
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-1", pane: null }, "and SP never moved");
  // SP on a pane: meta shows that pane (pane.focus shows its tab and space too).
  host.shared.set("ram.sp", { space: "s3", tab: "tab3-0", pane: "p3" });
  host.shared.set("ram.zoom", "meta"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [{ name: "pane.focus", args: { pane: "p3" } }]);
  host.focused = { space: "s3", tab: "tab3-0", pane: "p3" }; show("s3", "tab3-0");
  await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s3", tab: "tab3-0", pane: "p3" });
  host.focused = null;
  // ^b I (ram.bp): the bright BP moves to SP. In the space level that shows.
  host.shared.set("ram.zoom", "space"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab1-1" } }], "(the space level at web's BP)");
  show("s1", "tab1-1"); await PM();
  host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null }); host.calls = [];
  await send("bp");
  assert.deepEqual([host.shared.get("ram.frame"), host.shared.get("ram.bp").s0], ["s0", "tab0-0"], "^b I: api is where you work, at SP's tab");
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab0-0" } }], "in the space level it shows");
  show("s0", "tab0-0"); await PM();
  // From meta it only moves the BP (the sticks show it), unless e is on.
  host.shared.set("ram.zoom", "meta");
  await PM();
  show("s3", "tab3-1"); await PM();
  host.calls = [];
  await send("bp");
  assert.deepEqual([host.shared.get("ram.frame"), host.shared.get("ram.bp").s3, host.shared.get("ram.zoom")], ["s3", "tab3-1", "meta"],
    "from meta: docs &2 is the bright BP, and you stay in meta");
  assert.deepEqual(moves(), []);
  host.shared.set("ram.enter", true);
  show("s1", "tab1-0"); await PM();
  await send("bp");
  assert.deepEqual([host.shared.get("ram.frame"), host.shared.get("ram.bp").s1, host.shared.get("ram.zoom")], ["s1", "tab1-0", "space"],
    "e on: into the space level, at SP's tab");
  await PM();
  assert.deepEqual(moves(), [], "it shows already: nothing to do");
  host.shared.delete("ram.enter");
  // A click on SP's mark in a stick does what ^b I does.
  host.shared.set("ram.zoom", "meta");
  await PM();
  show("s0", "tab0-1"); await PM();
  let mt3 = RR();
  host.stopped = false;
  click(mt3, "ptr-tab0-1");
  assert(host.stopped, "(the click stays off the frame)");
  assert.deepEqual([host.shared.get("ram.frame"), host.shared.get("ram.bp").s0, host.shared.get("ram.zoom")], ["s0", "tab0-1", "meta"]);
  mt3 = RR();
  assert.deepEqual(textOf(withId(mt3, "ptr-tab0-1")), ["S", "B", "\u25b8"], "SP and the bright BP on one frame");
  assert.deepEqual(textOf(withId(mt3, "ptr-tab0-0")), [], "api's old work tab: no mark");
  assert(textOf(withId(mt3, "ptr-tab1-0")).includes("BP\u25b8"), "web keeps its (dim) BP");
  // e: the square under f (off by default), and ^b e.
  assert.deepEqual(op(withId(mt3, "ram-enter"), "border_color"), [host.colors.input], "e is off by default");
  assert(op(withId(mt3, "ram-enter"), "tooltip")[0].endsWith("  ^b e"), "its tooltip says its key");
  click(mt3, "ram-enter");
  assert.equal(host.shared.get("ram.enter"), true);
  assert.deepEqual(op(withId(RR(), "ram-enter"), "border_color"), ["#ffb547"], "lit while on");
  await send("enter");
  assert.equal(host.shared.get("ram.enter"), false, "^b e: off again");
  // A tool from meta (e off) shows in meta: SP moves onto it, and back when you quit it.
  show("s0", "tab0-0"); await PM();
  spaces[0].tabs.push({ id: "tabLG2", name: "lazygit api", named: true, index: 3, active: false, settled: false, status: null });
  panes.push({ pane: "pLG2", terminal: "tLG2", tab: "tabLG2", title: "lazygit", status: null, focused: true, cwd: "/repo/api", program: { name: "lazygit" } });
  raw.push({ address: "tLG2", state: "live", created_ms: Date.now(), labels: { "ram.lazygit": "/repo/api" } });
  show("s0", "tabLG2"); await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tabLG2", pane: null }, "meta shows lazygit: SP is on it");
  assert.deepEqual(host.shared.get("ram.came"), { level: "meta", space: "s0", tab: "tab0-0", pane: null }, "where SP was is kept");
  spaces[0].tabs.pop(); panes.pop(); raw.pop();
  show("s0", "tab0-1"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab0-0" } }], "lazygit quit: SP goes back (not where Herdr went)");
  show("s0", "tab0-0"); await PM();
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-0", pane: null });
  // e on: the tool takes you into the space level (SP stays put), and quitting it brings
  // you back to meta, at SP.
  host.shared.set("ram.enter", true);
  spaces[0].tabs.push({ id: "tabLG2", name: "lazygit api", named: true, index: 3, active: false, settled: false, status: null });
  panes.push({ pane: "pLG2", terminal: "tLG2", tab: "tabLG2", title: "lazygit", status: null, focused: true, cwd: "/repo/api", program: { name: "lazygit" } });
  raw.push({ address: "tLG2", state: "live", created_ms: Date.now(), labels: { "ram.lazygit": "/repo/api" } });
  host.shared.set("ram.opening", { space: "s0", at: Date.now() }); host.shared.set("ram.zoom", "space");  // (as openTool does)
  show("s0", "tabLG2"); host.calls = [];
  await PM();
  assert.deepEqual(moves(), [], "while it opens, the level change shows nothing of its own");
  host.shared.set("ram.opening", null);
  await PM();
  assert.deepEqual(host.shared.get("ram.came"), { level: "meta", space: "s0", tab: "tab0-0", pane: null }, "it came from meta");
  assert.deepEqual(host.shared.get("ram.sp"), { space: "s0", tab: "tab0-0", pane: null }, "SP stayed on what you watched");
  spaces[0].tabs.pop(); panes.pop(); raw.pop();
  show("s0", "tab0-1"); host.calls = [];
  await PM();
  assert.equal(host.shared.get("ram.zoom"), "meta", "lazygit quit: back to meta");
  await PM();
  assert.deepEqual(moves(), [{ name: "tab.select", args: { id: "tab0-0" } }], "at SP's tab (ram.goto)");
  show("s0", "tab0-0"); await PM();
  host.shared.delete("ram.enter");
  // ^b P (ram.peek): what's under the terminal, the level's own. In meta its
  // sticks off and on, the space level's peek strip left as it was...
  await send("peek");
  assert.deepEqual([host.shared.get("ram.sticks"), host.shared.get("ram.peek")], [false, undefined], "meta: the sticks off");
  await send("peek");
  assert.deepEqual([host.shared.get("ram.sticks"), host.shared.get("ram.peek")], [true, undefined], "and on");
  // ...and in the space level its peek strip, meta's sticks left as they were.
  host.shared.set("ram.zoom", "space");
  await send("peek");
  assert.deepEqual([host.shared.get("ram.sticks"), host.shared.get("ram.peek")], [true, false], "the space level: the peek strip off");
  await send("peek");
  assert.equal(host.shared.get("ram.peek"), true);
  host.shared.set("ram.zoom", "meta");
  host.shared.delete("ram.peek"); host.shared.delete("ram.sticks");
  // Meta has no peek strip; the space level's shows SP's tab, unless it's the tab you're on.
  const pk = view({ role: "peek" });
  host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
  assert.equal(withId(R(pk, { role: "peek" }), "ram-peek").kids.length, 0, "meta: none");
  host.shared.set("ram.zoom", "space");
  assert.deepEqual(withId(R(pk, { role: "peek" }), "ram-peek").kids.map(idOf), ["peek-sp"], "the space level: SP's tab");
  host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
  assert.equal(withId(R(pk, { role: "peek" }), "ram-peek").kids.length, 0, "SP is the tab you're on: nothing to peek at");
  host.shared.set("ram.bp", { s0: "tab0-0" }); host.shared.set("ram.frame", "s0");
  host.shared.delete("ram.came"); host.calls = [];
}
console.log("PASS: SP and BP: meta shows SP and the space level the bright BP; a level change shows its place (what still shows isn't taken for it); ^b I and SP's mark move the BP to SP (from meta into the space level only with e on); a tool from meta (e off) takes SP and gives it back; ^b e, ^b P; no peek strip in meta");

// ---- Finished agents (done, unseen): +n, and brighter in meta ---------------------------------
{
  // remote/t3 (ops *1) finished while you weren't looking.
  host.shared.set("ram.zoom", "space");
  let ft3 = R(side, { role: "side" });
  assert(textOf(withId(ft3, "stack-s2")).includes("+1"), "STACK: ops +1");
  assert.equal(op(flatten(withId(ft3, "stack-s2")).find(n => n.kids.includes("+1")), "border_color")[0], "#6fe3d3", "in done's cyan");
  assert(!textOf(withId(ft3, "stack-s1")).some(x => /^\u2713\d/.test(x)), "web has none");
  host.shared.set("ram.zoom", "meta");
  rams.size = { width: 1400, height: 340 };
  ft3 = RR();
  assert(textOf(withId(ft3, "head-s2")).includes("+1"), "its stick's header: +1");
  const doneBlock = withId(ft3, "block-remote/t3");
  assert.deepEqual([op(doneBlock, "bg")[0], op(doneBlock, "border_color")[0]], ["#12423c", "#6fe3d3"], "its block: a brighter cell, a cyan outline");
  const doneRow = withId(ft3, "alloc-remote/t3");
  assert.deepEqual(op(doneRow, "bg"), ["#12423caa"], "its heap row is lit");
  const doneWord = flatten(doneRow).find(n => n.kids.includes("Done"));
  assert(doneWord && op(doneWord, "font_semibold") && op(doneWord, "text_color")[0] === "#6fe3d3", "Done, in bold cyan");
  assert(textOf(withId(AS(), "all-space-s2")).includes("+1"), "the main stick: +1 too");
  aside.size = { width: 390, height: 1400 };  // room for every agent's row
  const doneMain = flatten(withId(AS(), "all-heap-remote/t3")).find(n => n.kids.includes("Done"));
  assert(doneMain && op(doneMain, "font_semibold") && op(doneMain, "text_color")[0] === "#6fe3d3", "and its heap row's Done is bold cyan");
  assert.deepEqual(op(withId(AS(), "all-heap-remote/t3"), "bg"), ["#12423caa"]);
  aside.size = { width: 390, height: 700 };
  host.shared.set("ram.zoom", "space");
}
console.log("PASS: finished agents: +n by their space in STACK, the sticks and the main stick; in meta their blocks and rows are brighter and say Done in bold cyan");

// ---- hunk: reviews in tabs of their own ---------------------------------------------------
// hunk.js on its own: what each menu item runs, what a review is called, notes.
const hk = await import(await load("mods/ram/hunk.js"));
const cmd = id => hk.COMMANDS.find(c => c.id === id);
assert.deepEqual(hk.COMMANDS.map(c => c.name), ["diff", "diff --staged", "show", "log", "stash show", "status"]);
assert.deepEqual(cmd("diff").args(""), ["diff", "--watch", "--transparent-bg"], "a diff is live, on RAM's background");
assert.deepEqual(cmd("diff").args("main"), ["diff", "main", "--watch", "--transparent-bg"]);
assert.deepEqual(cmd("staged").args("x"), ["diff", "--staged", "--watch", "--transparent-bg"]);
assert.deepEqual(cmd("show").args("HEAD~2"), ["show", "HEAD~2", "--transparent-bg"]);
assert.deepEqual(cmd("log").args(""), ["log"], "hunk log has no --transparent-bg");
assert.deepEqual(cmd("stash").args("stash@{1}"), ["stash", "show", "stash@{1}", "--transparent-bg"]);
assert.deepEqual(cmd("status").args(""), ["status", "--transparent-bg"]);
assert.deepEqual([hk.labelOf(cmd("diff"), ""), hk.labelOf(cmd("show"), "HEAD~2"), hk.labelOf(cmd("staged"), "x")], ["diff", "show HEAD~2", "diff --staged"]);
assert.deepEqual(hk.reduce({ sessionId: "abcd1234", pid: 7, cwd: "/r", repoRoot: "/r", title: "r working tree", fileCount: 3,
  snapshot: { state: { reviewNoteCount: 3, reviewNotes: [{ source: "user" }, { source: "agent" }, { source: "user" }] } } }),
  { id: "abcd1234", pid: 7, cwd: "/r", repo: "/r", title: "r working tree", files: 3, mine: 2, agent: 1 }, "your notes apart from the agents'");
// A session finds its tab: by its terminal's pid (RAM starts hunk with exec), the
// foreground pid (typed in a shell), a pane running hunk in its folder (/private/tmp
// is /tmp), or none (outside Herdr). RAM's tab with no session yet is listed too.
{
  const sp2 = [{ id: "a", name: "alpha", tabs: [{ id: "ta" }, { id: "tb" }, { id: "tc" }] }];
  const ps2 = [{ pane: "p1", terminal: "x1", tab: "ta", cwd: "/r" }, { pane: "p2", terminal: "x2", tab: "tb", cwd: "/tmp/w", program: { name: "hunk" } },
    { pane: "p3", terminal: "x3", tab: "tc", cwd: "/r" }];
  const ts2 = [{ address: "x1", pid: 10, foreground: { pid: 11 } }, { address: "x2", pid: 20 }, { address: "x3", pid: 30, labels: { "ram.hunk": "log" } }];
  const got = hk.entries([{ id: "s1", pid: 11, cwd: "/r" }, { id: "s2", pid: 99, cwd: "/private/tmp/w" }, { id: "s3", pid: 98, cwd: "/far" }], ts2, ps2, sp2);
  assert.deepEqual(got.map(e => [e.id, e.terminal, e.tab, e.space, e.ram, e.label]), [
    ["s1", "x1", "ta", "a", false, null], ["s2", "x2", "tb", "a", false, null], ["s3", null, null, null, false, null], [null, "x3", "tc", "a", true, "log"]]);
  assert.deepEqual(hk.entries([{ id: "s4", pid: 30, cwd: "/r" }], ts2, ps2, sp2).map(e => [e.id, e.tab, e.label]), [["s4", "tc", "log"]], "RAM's own, by pid");
}
// RAM's review tab (labelled ram.hunk), last in its space, opened 5 minutes ago. It
// shows in the space level (there's no hunk level of its own) as a tool's tab: never a
// BP, and quitting it comes back.
spaces[0].tabs.push({ id: "tabNEW", name: "hunk diff", named: true, index: 3, active: false, settled: false, status: null });
panes.push({ pane: "pNEW", terminal: "tNEW", tab: "tabNEW", title: "hunk", status: null, focused: true, cwd: "/repo/api", program: { name: "hunk" } });
raw.push({ address: "tNEW", state: "live", created_ms: Date.now() - 5 * 60000 - 1000, pid: 4242, labels: { "ram.hunk": "diff" } });
// hunk reports itself like an agent: it isn't one (not in any heap).
agentList.push({ address: "tNEW", pane: "pNEW", space: "s0", space_name: "api", tab: "tabNEW", tab_name: "hunk diff", tab_index: 3,
  status: "idle", title: "hunk", app: "hunk", program: { name: "Hunk" }, focused: false });
host.shared.set("ram.zoom", "space");
R(map, {}); await settle();
spaces[0].tabs.forEach(t => t.active = t.id === "tabNEW");
assert.equal(level(), "space", "no hunk level");
host.calls = [];
R(map, {});
await settle();
// (The peek strip may take its kept height, ram.peek.h, the first time it shows.)
const keptPeek = c => c.name === "layout.resize" && c.args.id === "ram-peek" && c.args.px === host.shared.get("ram.peek.h");
assert.deepEqual(layoutCalls().filter(c => !keptPeek(c)), [{ name: "layout.show", args: { id: "ram-peek" } }], "nothing resizes; the peek strip shows (where you came from)");
assert.equal(host.shared.get("ram.bp").s0, "tab0-0", "the review's tab isn't a BP");
assert.deepEqual(host.shared.get("ram.came"), { level: "space", space: "s0", tab: "tab0-0", pane: null }, "where you came from is kept");
assert.deepEqual(host.shared.get("ram.hunk.last"), { s0: "tabNEW" }, "it's the space's last review");
const stripHunk = R(map, {});
assert(!withId(stripHunk, "tabchip-tabNEW"), "reviews stay out of the tab strip");
assert.deepEqual(textOf(withId(stripHunk, "ram-strip-space")), ["0x01", "api", "\u25c61"], "the space says it has one");
// The side column: HUNK, between GIT and LANG, a line per review of this space (no
// session yet: RAM's label). Each says what it shows, its notes and how long ago it opened.
const hside = view({ role: "side" });
hside.size = { width: 340, height: 900 };
hside.gitInfo.git[K("/repo/api")] = side.gitInfo.git[K("/repo/api")];
tree = R(hside, { role: "side" });
const sideIds = flatten(tree).map(idOf);
assert(sideIds.indexOf("ram-git") < sideIds.indexOf("ram-hunk") && sideIds.indexOf("ram-hunk") < sideIds.indexOf("ram-lang"), "HUNK between GIT and LANG");
assert.deepEqual(textOf(withId(tree, "ram-hunk-head")), ["HUNK", "1", "^b r", "+"]);
const words = n => textOf(n).filter(x => !x.endsWith(".svg"));  // without icons' file names
assert.deepEqual(words(withId(tree, "hunk-tNEW")), ["\u25c6", "diff", "5m"], "what it shows, how long ago it opened");
assert.deepEqual(op(withId(tree, "hunk-tNEW"), "bg"), ["#ffb54714"], "the one on screen is lit");
assert.equal(op(withId(tree, "hunk-tNEW"), "h")[0], 17 * 1.25);
assert.equal(heightOf(withId(tree, "ram-hunk")), hk.hunkHeight(1), "HUNK is as tall as hunkHeight() counts");
assert.deepEqual(textOf(withId(tree, "stack-s0")).slice(0, 3), ["0x01", "api", "\u25c61"], "the stack marks the space too");
assert(!sideIds.includes("heap-tNEW"), "hunk isn't in the heap");
// Only this space's reviews: web's isn't listed under api's HUNK.
spaces[1].tabs.push({ id: "tabW", name: "hunk log", named: true, index: 3, active: false, settled: false, status: null });
panes.push({ pane: "pW", terminal: "tW", tab: "tabW", title: "hunk", status: null, focused: false, cwd: "/repo/web", program: { name: "hunk" } });
raw.push({ address: "tW", state: "live", created_ms: Date.now() - 2 * 3600000, labels: { "ram.hunk": "log" } });
tree = R(hside, { role: "side" });
assert(!withId(tree, "hunk-tW") && textOf(withId(tree, "ram-hunk-head"))[1] === "1", "web's review is web's");
assert.deepEqual(textOf(withId(tree, "stack-s1")).slice(0, 3), ["0x02", "web", "\u25c61"], "(the stack still marks web)");
spaces[1].tabs.pop(); panes.pop(); raw.pop();
assert.deepEqual([hk.reviewsIn([{ ram: true, tab: "a", space: "x" }, { ram: false, tab: "b", space: "x" }, { ram: true, tab: null, space: "x" },
  { ram: true, tab: "c", space: "y" }], "x").map(e => e.tab), hk.forRepo([{ cwd: "/private/tmp/r/" }, { cwd: "/tmp/q" }], "/tmp/r").length], [["a"], 1],
  "RAM's own reviews in that space; for a repo, /private/tmp is /tmp");
{
  const { ago } = await import(await load("mods/ram/ui.js"));
  const t0 = 10 * 86400000;
  assert.deepEqual([ago(t0 - 59000, t0), ago(t0 - 60000, t0), ago(t0 - 3599000, t0), ago(t0 - 3600000, t0), ago(t0 - 86400000, t0), ago(t0 + 5000, t0)],
    ["now", "1m", "59m", "1h", "1d", "now"]);
}
// Its session registers: notes and its id show (the map copy polls hunk and shares it).
host.hunkSessions = [{ sessionId: "9ff4921d-337b-420c-bee1-f1ca7b1176ac", pid: 4242, cwd: "/repo/api", repoRoot: "/repo/api",
  title: "herdr working tree", fileCount: 3, snapshot: { state: { reviewNoteCount: 3, reviewNotes: [{ source: "user" }, { source: "user" }, { source: "agent" }] } } }];
host.execs = [];
host.timers.filter(tm => tm.ms === 1000).forEach(tm => tm.fn(cx));
await settle();
assert(host.execs.some(e => e.command === "hunk" && e.args.join(" ") === "session list --json"));
assert.deepEqual(host.shared.get("ram.hunk.sessions")?.map(x => [x.id.slice(0, 4), x.mine, x.agent]), [["9ff4", 2, 1]]);
tree = R(hside, { role: "side" });
const sessRow = withId(tree, "hunk-tNEW");
assert.deepEqual(words(sessRow), ["\u25c6", "diff", "\u270e3", "5m"], "its 3 notes (yours and the agent's)");
assert.equal(op(sessRow, "tooltip")[0], "herdr working tree: 2 of your notes, 1 agent notes \u00b7 /hunk 9ff4", "and the id /hunk takes");
host.calls = [];
click(tree, "hunk-tNEW");
assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tabNEW" } }], "a click shows it");
// Its x (on hover) asks first: closing loses notes that weren't saved.
assert.deepEqual(op(withId(tree, "hunkx-tNEW"), "text_color"), ["#00000000"], "the x hides until the pointer is on the line");
sessRow.handlers.on_hover(true, cx);
tree = R(hside, { role: "side" });
host.overlays = [];
click(tree, "hunkx-tNEW");
assert.deepEqual(host.overlays.at(-1).props, { title: "Close hunk diff?", detail: "Its 3 notes go with it, unless saved first (/hunk save).",
  command: { name: "tab.close", args: { id: "tabNEW", confirmed: true } } });
// (hunk is asked again every 3 s while a review is open; here, at once.)
host.hunkSessions[0].snapshot.state = { reviewNoteCount: 0, reviewNotes: [] };
map.sessions.soon();
host.timers.filter(tm => tm.ms === 1000).forEach(tm => tm.fn(cx)); await settle();
assert.deepEqual(host.shared.get("ram.hunk.sessions").map(x => x.mine + x.agent), [0]);
tree = R(hside, { role: "side" }); host.calls = [];
click(tree, "hunkx-tNEW");
assert.deepEqual(host.calls, [{ name: "tab.close", args: { id: "tabNEW" } }], "no notes: it just closes");
withId(tree, "hunk-tNEW").handlers.on_hover(false, cx);
// In meta the main stick and the space's stick mark it as well (the review has no frame).
host.shared.set("ram.zoom", "meta");
assert(textOf(withId(AS(), "all-space-s0")).includes("\u25c61"));
const hr = RR();
assert(textOf(withId(hr, "head-s0")).includes("\u25c61") && !withId(hr, "frame-tabNEW"), "the stick: ◆1 by its name, no frame for the review");
host.shared.set("ram.zoom", "space");
// ^b r on the review: back where you came from (it stays open); from there, back to it.
host.calls = [];
await send("hunk");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-0" } }, "^b r on a review goes back");
assert.equal(host.shared.get("ram.came"), null);
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
R(map, {}); await settle();
host.calls = [];
await send("hunk");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tabNEW" } }, "^b r: the space's last review");
spaces[0].tabs.forEach(t => t.active = t.id === "tabNEW");
R(map, {}); await settle();
assert.deepEqual(host.shared.get("ram.came"), { level: "space", space: "s0", tab: "tab0-0", pane: null });
// HUNK's header (^b r) does the same.
host.calls = [];
click(R(hside, { role: "side" }), "ram-hunk-head");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-0" } }, "HUNK's header, on the review: back");
host.shared.set("ram.came", { level: "space", space: "s0", tab: "tab0-0", pane: null });
// The peek strip, under a review: split, where you came from on the left (↩) and SP's
// tab on the right. It reads both terminals every 1.5 s.
host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
const peek = view({ role: "peek" });
assert.equal(host.timers.at(-1).ms, 1500);
host.hcs = [];
host.timers.at(-1).fn(cx);
await settle();
tree = R(peek, { role: "peek" });
assert.deepEqual(host.hcs, [["read", "t1"], ["read", "t6"]], "the tab you came from (its focused terminal) and SP's");
assert.deepEqual(withId(tree, "ram-peek").kids.map(idOf), ["peek-came", "peek-sp"], "where you came from left, SP right");
const came = textOf(withId(tree, "peek-came")), spBox = textOf(withId(tree, "peek-sp"));
assert(came[0] === "\u21a9" && came.includes("api \u00b7 *1") && came.includes("one") && came.includes("two"), came.join("|"));
assert(spBox[0] === "SP\u25b8" && spBox.includes("web \u00b7 *1") && spBox.includes("Claude \u00b7 Claude"), spBox.join("|"));
assert.deepEqual(op(withId(tree, "peek-sp"), "border_color"), ["#ff5f6d"], "SP's agent needs you: its box is red");
assert(op(withId(tree, "peek-came"), "tooltip")[0].startsWith("Back to api \u00b7 *1") && op(withId(tree, "peek-sp"), "tooltip")[0].includes("click: meta (^b m)"));
host.calls = [];
click(tree, "peek-came");
assert.deepEqual([host.calls.at(-1), host.shared.get("ram.came")], [{ name: "tab.select", args: { id: "tab0-0" } }, null], "↩: back there");
host.shared.set("ram.came", { level: "space", space: "s0", tab: "tab0-0", pane: null });
click(tree, "peek-sp");
assert.equal(host.shared.get("ram.zoom"), "meta", "SP's box: meta, at SP");
host.shared.set("ram.zoom", "space");
// No box repeats a tab: SP where you came from is one box.
host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
assert.deepEqual(withId(R(peek, { role: "peek" }), "ram-peek").kids.map(idOf), ["peek-came"], "SP's tab is where you came from: one box");
// A review opened from meta (came is meta's place): only SP's box.
host.shared.set("ram.came", { level: "meta", space: "s1", tab: "tab1-0", pane: null });
host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
assert.deepEqual(withId(R(peek, { role: "peek" }), "ram-peek").kids.map(idOf), ["peek-sp"], "came from meta: SP's box only");
host.shared.set("ram.came", { level: "space", space: "s0", tab: "tab0-0", pane: null });
// P (shared ram.peek false) turns it off everywhere; the map copy hides its block.
host.shared.set("ram.peek", false); host.calls = [];
assert.equal(withId(R(peek, { role: "peek" }), "ram-peek").kids.length, 0, "P off: nothing");
R(map, {}); await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.hide", args: { id: "ram-peek" } }], "and its block hides");
host.shared.delete("ram.peek"); host.calls = [];
R(map, {}); await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.show", args: { id: "ram-peek" } }], "P on: back");
// hunk quits: its tab goes, and the window goes back to the tab you came from.
spaces[0].tabs.splice(spaces[0].tabs.findIndex(t => t.id === "tabNEW"), 1);
panes.splice(panes.findIndex(p => p.pane === "pNEW"), 1);
agentList.splice(agentList.findIndex(a => a.address === "tNEW"), 1);
raw.splice(raw.findIndex(r => r.address === "tNEW"), 1);
host.hunkSessions = [];
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-1");
host.calls = [];
R(map, {});
await settle();
assert(host.calls.some(c => c.name === "tab.select" && c.args.id === "tab0-0"), "back to the tab before the review");
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");  // (as the window would, after that tab.select)
// The menu (this mod as a dialog): an optional ref, then what to open.
const menu = view({ role: "hunk-menu", space: "s0", name: "api", repo: "herdr", overlay: "oM" });
let mt2 = R(menu, { role: "hunk-menu", space: "s0", name: "api", repo: "herdr", overlay: "oM" });
for (const c of hk.COMMANDS) assert(withId(mt2, `hunk-cmd-${c.id}`), c.id);
assert(textOf(mt2).includes("api \u00b7 herdr") && menu.menuView.ref.focused, "its input has the keyboard");
assert.equal(textOf(withId(mt2, "hunk-cmd-diff"))[0], "\u25b8", "Enter opens the first, diff");
withId(mt2, "hunk-menu").handlers.on_key_down({ key: "down" }, cx);
mt2 = R(menu, { role: "hunk-menu", space: "s0", name: "api", repo: "herdr", overlay: "oM" });
assert.equal(textOf(withId(mt2, "hunk-cmd-staged"))[0], "\u25b8", "down moves the choice");
menu.menuView.ref.set_value("HEAD~2");
host.closed = [];
host.props = { role: "hunk-menu", space: "s0", name: "api", repo: "herdr", overlay: "oM" };
click(mt2, "hunk-cmd-show");
const req = host.shared.get("ram.hunk.open");
assert.deepEqual([req.space, req.cmd, req.ref], ["s0", "show", "HEAD~2"]);
assert.deepEqual(host.closed, ["oM"], "and it closes");
// The map copy opens it: a tab at the repo, named and labelled, moved to the end.
host.execs = []; host.hcs = []; host.calls = [];
R(map, {}); await settle();
assert.deepEqual(host.execs.at(-1), { command: "herdr-app", args: ["do", "tab.new", "--space", "s0", "--name", "hunk show HEAD~2",
  "--folder", "/repo/api", "--argv", '["exec","hunk","show","HEAD~2","--transparent-bg"]'], opts: undefined });
assert.deepEqual(host.hcs.at(-1), ["label", "tNEW", "ram.hunk=show HEAD~2"]);
assert.deepEqual(host.calls.find(c => c.name === "tab.move"), { name: "tab.move", args: { id: "tabNEW", index: 3 } }, "last: the space's own tabs keep their numbers");
assert.equal(host.shared.get("ram.hunk.open"), null, "taken once");
host.execs = [];
R(map, {}); await settle();
assert(!host.execs.some(e => e.command === "herdr-app"), "not twice");
// A plain diff loads the repo's saved notes when it has some (as hunk-open does).
host.notesFile = true; host.execs = [];
host.shared.set("ram.hunk.open", { at: Date.now() + 1, space: "s0", cmd: "diff", ref: "" });
R(map, {}); await settle();
assert.deepEqual(host.execs.find(e => e.command === "test"), { command: "test", args: ["-f", "/repo/api/.hunk/notes.json"], opts: { on: null } });
assert.equal(host.execs.at(-1).args.at(-1), '["exec","hunk","diff","--watch","--transparent-bg","--agent-context",".hunk/notes.json","--agent-notes"]');
host.notesFile = false;
// An old request (from before a restart) is left alone.
host.execs = [];
host.shared.set("ram.hunk.open", { at: Date.now() - 60000, space: "s0", cmd: "log", ref: "" });
R(map, {}); await settle();
assert(!host.execs.some(e => e.command === "herdr-app"));
host.shared.set("ram.hunk.open", null);
// lazygit's tab works the same way: not a level of its own, and quitting it comes back.
spaces[0].tabs.push({ id: "tabLG", name: "lazygit", named: true, index: 3, active: false, settled: false, status: null });
panes.push({ pane: "pLG", terminal: "tLG", tab: "tabLG", title: "lazygit", status: null, focused: true, program: { name: "lazygit" } });
raw.push({ address: "tLG", state: "live", created_ms: 9500, labels: { "ram.lazygit": "1" } });
spaces[0].tabs.forEach(t => t.active = t.id === "tabLG");
R(map, {}); await settle();
tree = R(side, { role: "side" });
assert.deepEqual(textOf(withId(R(map, {}), "tabchip-tabLG")).filter(x => x === "lazygit"), ["lazygit"]);
assert.deepEqual(op(withId(tree, "ram-git"), "border_color"), ["#ffb547"], "GIT is lit while lazygit shows");
assert.equal(host.shared.get("ram.bp").s0, "tab0-0", "lazygit's tab isn't a BP");
spaces[0].tabs.splice(spaces[0].tabs.findIndex(t => t.id === "tabLG"), 1);
panes.splice(panes.findIndex(p => p.pane === "pLG"), 1);
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-1");
host.calls = [];
R(map, {}); await settle();
assert(host.calls.some(c => c.name === "tab.select" && c.args.id === "tab0-0"), "back to the tab before lazygit");
console.log("PASS: hunk: menu, reviews in their own tabs (out of the strip, ◆n on the space), HUNK under GIT with this space's reviews (notes, age, a hover x), sessions matched to tabs; the peek strip (split under a review, P turns it off); quitting returns");

// ---- The peek strip's height: up to the line over .rodata --------------------------------------
{
  host.shared.set("ram.zoom", "space");
  spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
  const ph = view({ role: "side" });
  ph.gitInfo.git[K("/repo/api")] = side.gitInfo.git[K("/repo/api")];
  const parts = (t, height) => {
    const details = withId(t, "ram-side-details"), keysNode = flatten(t).find(n => n.kids.some(k => idOf(k) === "ram-settings"));
    return { details: op(details, "h")?.[0] ?? heightOf(details), keys: heightOf(keysNode), height };
  };
  // (At 270 px with a machine and a dirty repo, .rodata..LANG scroll in what's left.)
  for (const [height, machines] of [[900, []], [900, [{ name: "remote", state: "connected" }]], [270, [{ name: "remote", state: "connected" }]]]) {
    ph.machines = machines;
    ph.size = { width: 340, height };
    host.shared.delete("ram.peek.h");
    const t = R(ph, { role: "side" }); await settle();
    const p2 = parts(t, height), want = Math.round(p2.details + p2.keys + 1);
    assert.equal(host.shared.get("ram.peek.h"), want, `${height} px, ${machines.length} machine(s): .rodata, GIT, HUNK, LANG, the keys and the border`);
    // The column from its top: its border, STACK..HEAP, then the line over .rodata, at
    // the height the peek strip's top is at (the row's bottom minus the strip).
    assert(Math.abs((height - p2.details - p2.keys - 1) - (height - want)) < 1, "its top on that line");
    if (height === 270) assert(op(withId(t, "ram-side-details"), "overflow_y_scrollbar"), "(scrolling: the part as drawn)");
  }
  ph.machines = [];
  ph.size = { width: 340, height: 900 };
  R(ph, { role: "side" }); await settle();
  const want = host.shared.get("ram.peek.h");
  // The strip's copy gives the peek block that height when it shows (SP's tab is web *1).
  host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
  const pk2 = view({});
  host.calls = [];
  R(pk2, {}); await settle();
  const peekCalls = () => layoutCalls().filter(c => c.args.id === "ram-peek");
  assert.deepEqual(peekCalls(), [{ name: "layout.resize", args: { id: "ram-peek", px: want } }, { name: "layout.show", args: { id: "ram-peek" } }]);
  host.calls = [];
  R(pk2, {}); await settle();
  assert.deepEqual(peekCalls(), [], "once");
  host.shared.set("ram.peek.h", want + 40);
  R(pk2, {}); await settle();
  assert.deepEqual(peekCalls(), [{ name: "layout.resize", args: { id: "ram-peek", px: want + 40 } }], "a new height: resized");
  host.calls = [];
  host.shared.set("ram.peek.h", "tall");
  R(pk2, {}); await settle();
  assert.deepEqual(peekCalls(), [{ name: "layout.resize", args: { id: "ram-peek", px: 180 } }], "nothing usable: the layout's 180");
  ph.sharePeekHeight(12, cx);
  assert.equal(host.shared.get("ram.peek.h"), 56, "never under its header and a line");
  // With the side column hidden (^b b in the space level) there's no line to meet:
  // the peek strip keeps the height it had.
  host.shared.set("ram.peek.h", want);
  host.layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "block", hidden: true }] };
  ph.size = { width: 340, height: 270 };
  R(ph, { role: "side" }); await settle();
  assert.equal(host.shared.get("ram.peek.h"), want, "the column hidden: the height it had");
  host.layout.children[0].hidden = false;
  R(ph, { role: "side" }); await settle();
  assert.notEqual(host.shared.get("ram.peek.h"), want, "shown: from the column again");
  host.layout = null; ph.size = { width: 340, height: 900 };
  host.shared.delete("ram.peek.h"); host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
}
// Its boxes show as many of their last lines as fit that height (not a fixed 8).
{
  host.shared.set("ram.zoom", "space");
  spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
  host.shared.set("ram.sp", { space: "s1", tab: "tab1-0", pane: null });
  host.readOut = Array.from({ length: 40 }, (_, k) => `line ${k + 1}`).join("\n") + "\n";
  const pv = view({ role: "peek" });
  host.timers.at(-1).fn(cx); await settle();
  const shownLines = height => {
    pv.size = { width: 900, height };
    return textOf(withId(R(pv, { role: "peek" }), "peek-sp")).filter(x => /^line \d+$/.test(x));
  };
  const fitRows = height => Math.floor((height - 2 - 24 * 1.25 - 8 * 1.25) / (13 * 1.25));
  for (const height of [120, 300, 520]) {
    const got = shownLines(height);
    assert.equal(got.length, fitRows(height), `${height} px: ${fitRows(height)} lines`);
    assert.equal(got.at(-1), "line 40", `${height} px: the last ones`);
  }
  assert(shownLines(520).length > 8, "a tall strip shows more than 8");
  assert.deepEqual(shownLines(56), ["line 40"], "the shortest: one line");
  // The box's lines, its header and padding fit inside it.
  pv.size = { width: 900, height: 300 };
  const box = withId(R(pv, { role: "peek" }), "peek-sp");
  assert(heightOf(box) <= 300 + 1e-9, `the box needs ${heightOf(box)} of 300`);
  // Its size comes from the block it's drawn in.
  withId(R(pv, { role: "peek" }), "ram-peek").handlers.on_size_change({ width: 900, height: 400 }, cx);
  assert.deepEqual(pv.size, { width: 900, height: 400 });
  host.readOut = null;
  host.shared.set("ram.sp", { space: "s0", tab: "tab0-0", pane: null });
}
console.log("PASS: the peek strip is as tall as the side column from the line over .rodata down, so its top lines up with that line, and shows as many lines as fit");

// ---- The keyboard in the side column (^b h; RAM's mod.json is "focusable") ---------------------
{
  assert.deepEqual(JSON.parse(await read("mods/ram/mod.json")), { place: "none", focusable: true }, "pane.go can give RAM's copies the keyboard");
  host.shared.set("ram.zoom", "space");
  show("s0", "tab0-0");
  // A review in api, for HUNK's line.
  spaces[0].tabs.push({ id: "tabK", name: "hunk diff", named: true, index: 3, active: false, settled: false, status: null });
  panes.push({ pane: "pK", terminal: "tK", tab: "tabK", title: "hunk", status: null, focused: false, cwd: "/repo/api", program: { name: "hunk" } });
  raw.push({ address: "tK", state: "live", created_ms: Date.now() - 120000, labels: { "ram.hunk": "diff" } });
  const ks = view({ role: "side" });
  let kNext = host.waiting.at(-1);  // its nextCommand()
  const take = async c => { const w = kNext, before = host.waiting.length; w(c); await settle(); kNext = host.waiting.slice(before).at(-1); };
  ks.size = { width: 340, height: 900 };
  ks.gitInfo.git[K("/repo/api")] = side.gitInfo.git[K("/repo/api")];
  const KS = () => R(ks, { role: "side" });
  // The part with the keyboard has a cyan outline: an absolute child with a cyan border.
  const outlined = t => flatten(t).filter(n => n.kids.some(k => typeof k === "object" && k && op(k, "absolute") && op(k, "border")?.[0] === 1
    && op(k, "border_color")?.[0] === "#6fe3d3" && op(k, "top")?.[0] === 0)).map(idOf);
  const press = k => { host.stopped = false; withId(KS(), "ram-side").handlers.on_key_down({ key: k }, cx); };
  const to = id => {
    for (let i = 0; i < 80 && outlined(KS())[0] !== id; i++) press("down");
    assert.deepEqual(outlined(KS()), [id], `the keyboard reaches ${id}`);
  };
  let kt = KS();
  assert(!withId(kt, "ram-kb-keys") && withId(kt, "ram-settings") && !outlined(kt).length, "without the keyboard: the keys row, nothing outlined");
  await take("focus");
  assert(ks.handle.is_focused(), "\"focus\" (pane.go into the column): it takes the keyboard");
  kt = KS();
  assert.deepEqual(outlined(kt), ["ram-rg"], "its first part is outlined: search's button");
  assert.deepEqual(textOf(withId(kt, "ram-kb-keys")), ["\u2191\u2193", "move", "\u23ce", "search", "esc", "back"], "the bottom row: its keys");
  assert(!withId(kt, "ram-settings"), "instead of Settings, Keys and Commands");
  press("down");
  assert.deepEqual(outlined(KS()), ["ram-space-new"], "down: the next");
  assert(host.stopped, "the column keeps the key");
  press("j");
  assert.deepEqual(outlined(KS()), ["stack-s0"], "j too");
  assert.deepEqual(textOf(withId(KS(), "ram-kb-keys")), ["\u2191\u2193", "move", "\u23ce", "show", "r", "rename", "esc", "back"]);
  host.calls = [];
  press("enter");
  assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab0-0" } }], "Enter: what a click does (api at its BP)");
  press("r");
  assert.deepEqual(host.calls.at(-1), { name: "space.rename", args: { id: "s0" } }, "r renames");
  press("k"); press("up"); press("up");
  assert.deepEqual(outlined(KS()), ["ram-rg"], "k and up go back, and stop at the first");
  to("heap-t2");
  host.calls = [];
  press("enter");
  assert.deepEqual(host.calls, [{ name: "agent.focus", args: { terminal: "t2" } }], "a heap row: that agent");
  to("ram-git");
  host.execs = [];
  press("enter"); await settle();
  assert.equal(host.execs.at(-1)?.args[5], "lazygit api", "GIT: lazygit");
  to("ram-hunk-new");
  host.overlays = [];
  press("enter");
  assert.equal(host.overlays.at(-1)?.props?.role, "hunk-menu", "HUNK's +: the menu");
  to("hunk-tK");
  assert.deepEqual(textOf(withId(KS(), "ram-kb-keys")), ["\u2191\u2193", "move", "\u23ce", "show", "x", "close", "esc", "back"]);
  host.calls = [];
  press("x");
  assert.deepEqual(host.calls, [{ name: "tab.close", args: { id: "tabK" } }], "x: what its \u2715 does");
  to("ram-lang-ext");
  host.overlays = [];
  press("enter");
  assert.equal(host.overlays.at(-1)?.props?.mode, "ext", "LANG's ext: the picker");
  for (let i = 0; i < 20; i++) press("down");
  const last = outlined(KS())[0];
  press("down");
  assert.deepEqual(outlined(KS()), [last], "down stops at the last");
  host.stopped = false;
  press("q");
  assert(!host.stopped, "other keys aren't the column's");
  // Esc: the keyboard back to the terminal (to the right).
  host.calls = [];
  press("escape");
  assert.deepEqual(host.calls, [{ name: "pane.go", args: { direction: "right" } }], "Esc: back to the terminal");
  kt = KS();
  assert(withId(kt, "ram-settings") && !outlined(kt).length, "the keys row again");
  // A click elsewhere takes the keyboard away: the outline goes too.
  await take("focus");
  assert(outlined(KS()).length === 1);
  host.keyboard = null; ks.kb.since -= 1000;
  assert(!outlined(KS()).length && withId(KS(), "ram-settings"), "the keyboard went elsewhere: back to normal");
  // In meta the main stick's rows: Enter shows, ← → fold a space.
  host.shared.set("ram.zoom", "meta");
  ks.gitInfo.git[K("/repo/web")] = webGit;
  ks.all.setMode("memory");
  await take("focus");
  to("all-space-s0");
  assert(textOf(withId(KS(), "ram-kb-keys")).includes("fold"), "a space with files can fold");
  press("left");
  assert(!withId(KS(), "all-file-s0:src/app.ts"), "\u2190 folds it");
  press("left");
  assert(!withId(KS(), "all-file-s0:src/app.ts"), "and again stays folded");
  press("right");
  assert(withId(KS(), "all-file-s0:src/app.ts"), "\u2192 unfolds it");
  host.scrolls = [];
  press("down");
  assert.deepEqual(outlined(KS()), ["all-file-s0:src/app.ts"], "its files come next");
  assert.deepEqual(host.scrolls, [0], "the tree scrolls to the row the keyboard is on (its space's group)");
  host.scrolls = [];
  to("all-space-s1");
  assert.equal(host.scrolls.at(-1), 1, "web's group");
  host.calls = [];
  press("enter");
  assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab1-0" } }], "Enter: web at its BP (SP goes there)");
  press("escape");
  host.shared.set("ram.zoom", "space");
  spaces[0].tabs.pop(); panes.pop(); raw.pop();
  // The strip, the sticks and the peek strip hand the keyboard straight back.
  host.calls = [];
  await send("focus");
  assert.deepEqual(host.calls, [{ name: "pane.go", args: { direction: "down" } }], "the strip: back down to the terminal");
  for (const role of ["rams", "peek"]) {
    const v2 = view({ role }), w2 = host.waiting.at(-1);
    host.calls = [];
    w2("focus"); await settle();
    assert.deepEqual(host.calls, [{ name: "pane.go", args: { direction: "up" } }], `${role}: back up to the terminal`);
    assert(v2);
  }
}
console.log("PASS: keyboard: \"focus\" gives the side column the keyboard (^b h); \u2191\u2193 j k move an outline over every part a click reaches, Enter clicks, x closes, r renames, \u2190 \u2192 fold, Esc goes back; the bottom row says the keys; the other copies hand it back");

// ---- LANG's dialog by keyboard --------------------------------------------------------------
{
  host.lsTree = ["100644 blob a     1200\tsrc/main.rs", "100644 blob b      300\tsrc/lib.rs", "100755 blob c       90\tbuild.sh", ""].join("\0");
  const lp = { role: "lang", space: "s0", top: "/repo/api", machine: null, repo: "herdr", mode: "list", lang: null, overlay: "oK" };
  const lv = view(lp);
  assert(lv.langView.handle.is_focused(), "the dialog takes the keyboard");
  const LV = () => R(lv, lp);
  const lkey = k => { host.stopped = false; withId(LV(), "lang-view").handlers.on_key_down({ key: k }, cx); };
  lkey("down");
  assert.equal(lv.langView.at, 0, "nothing read yet: nothing to move to");
  await settle();
  const lit = t => flatten(t).filter(n => /^lang-(row|file|ext)-\d+$/.test(idOf(n) ?? "") && op(n, "bg")?.[0] === "#ffb5471f").map(idOf);
  assert.deepEqual(lit(LV()), ["lang-row-0"], "the first language is chosen");
  lkey("down");
  assert.deepEqual(lit(LV()), ["lang-row-1"], "down: the next");
  assert(host.stopped);
  lkey("up"); lkey("up");
  assert.deepEqual(lit(LV()), ["lang-row-0"], "up stops at the first");
  lkey("down"); lkey("enter");
  assert.deepEqual([lv.langView.mode, lv.langView.lang, lit(LV())], ["files", "Shell", ["lang-file-0"]], "Enter: its files");
  host.calls = []; host.closed = [];
  lkey("enter");
  assert.deepEqual(host.calls.at(-1), { name: "tab.new", args: { space: "s0", folder: "/repo/api", name: "build.sh",
    argv: ["exec", "sh", "-c", 'exec "${EDITOR:-vi}" "$1"', "sh", "build.sh"] } }, "Enter on a file: $EDITOR");
  assert.deepEqual(host.closed, ["oK"]);
  lkey("left");
  assert.deepEqual([lv.langView.mode, lit(LV())], ["list", ["lang-row-0"]], "\u2190: every language again");
  lkey("down"); lkey("enter"); lkey("backspace");
  assert.equal(lv.langView.mode, "list", "Backspace too");
  host.closed = [];
  lkey("escape");
  assert.deepEqual(host.closed, ["oK"], "Esc closes it");
  host.lsTree = null; host.props = {};
}
console.log("PASS: LANG's dialog: \u2191\u2193 choose, Enter does what a click does, \u2190 or Backspace go back, Esc closes");

// ---- RAM's right-click menu (the layout's terminal_menu) -------------------------------------
{
  assert.equal(layout.terminal_menu, "ram-menu", "a terminal's right-click opens RAM's menu");
  assert.deepEqual(JSON.parse(await read("mods/ram-menu/mod.json")), { place: "none", overlay: { width: 250, height: 300 } });
  for (const icon of ["copy", "paste"]) {
    const art = await read(`mods/ram-menu/${icon}.svg`);
    assert(/viewBox="0 0 24 24"/.test(art) && /stroke="currentColor"/.test(art) && /fill="none"/.test(art), `${icon}.svg: 24 units, tinted`);
  }
  const rm = await import(await load("mods/ram-menu/main.js"));
  const term = keysFile.terminal ?? {};
  const keyOf = action => term["cmd-c"] === action ? "\u2318C" : term["cmd-v"] === action ? "\u2318V" : "";
  const mp = { tab: "pane", target: { pane: "p0", terminal: "t1" }, overlay: "oR" };
  host.props = mp;
  const mv = new rm.default(); mv.init({}, cx);
  assert(mv.handle.is_focused(), "it takes the keyboard");
  const rows = () => flatten(mv.render(cx)).filter(n => /^ram-mi-\d+$/.test(idOf(n) ?? ""));
  const words2 = n => textOf(n).filter(x => !x.endsWith(".svg"));
  assert.deepEqual(rows().map(words2), [["Copy", keyOf("terminal.copy")], ["Paste", keyOf("terminal.paste")], ["Split right", "^b v"],
    ["Split down", "^b -"], ["Zoom", "^b z"], ["Send right-clicks to pane", ""], ["Close pane", "^b x"]], "Copy and Paste, then Herdr's items, each with its key");
  assert.deepEqual(op(rows()[0], "bg"), [host.colors.selected], "the first is chosen");
  // Copy and Paste focus the terminal right-clicked first (they act on the focused one),
  // then the menu closes (closing hands the keyboard to the focused pane).
  host.calls = []; host.closed = []; host.events = [];
  click(mv.render(cx), "ram-mi-0");
  assert.deepEqual(host.calls, [{ name: "pane.focus", args: { pane: "p0" } }, { name: "terminal.copy", args: {} }]);
  assert.deepEqual(host.events, ["run pane.focus", "run terminal.copy", "close oR"], "in that order: the menu closes last");
  host.calls = []; host.closed = [];
  click(mv.render(cx), "ram-mi-1");
  assert.deepEqual(host.calls, [{ name: "pane.focus", args: { pane: "p0" } }, { name: "terminal.paste", args: {} }]);
  host.calls = [];
  click(mv.render(cx), "ram-mi-2");
  assert.deepEqual(host.calls, [{ name: "pane.split", args: { direction: "right", pane: "p0" } }], "the others act on that pane");
  // The keyboard: down/up (or j, k) round the ends, Enter runs, Esc closes.
  const mkey = k => { host.stopped = false; withId(mv.render(cx), "ram-menu").handlers.on_key_down({ key: k }, cx); };
  mkey("up");
  assert.deepEqual(op(rows().at(-1), "bg"), [host.colors.selected], "up from the first: the last");
  mkey("j"); mkey("j");
  host.calls = []; host.closed = [];
  mkey("enter");
  assert.deepEqual([host.calls, host.closed], [[{ name: "pane.focus", args: { pane: "p0" } }, { name: "terminal.paste", args: {} }], ["oR"]], "Enter on Paste");
  host.closed = [];
  mkey("escape");
  assert.deepEqual(host.closed, ["oR"]);
  // A sub-agent can go back under its parent; one that sends right-clicks to its program says so.
  raw.push({ address: "kid", parent: "t1", state: "live", labels: { "herdr.right-click": "program" } });
  host.props = { tab: "pane", target: { pane: "p0", terminal: "kid" }, overlay: "oR" };
  const labels2 = rows().map(n => words2(n)[0]);
  assert(labels2.includes("Use Herdr right-click menu") && labels2.includes("Send back to t1"), labels2.join("|"));
  raw.pop();
  // A terminal outside a tab (a layout terminal block): no pane to split, zoom or close.
  host.props = { tab: "pane", target: { pane: "block-x", terminal: "t1" }, overlay: "oR" };
  assert.deepEqual(rows().map(n => words2(n)[0]), ["Copy", "Paste", "Send right-clicks to pane"]);
  host.calls = [];
  click(mv.render(cx), "ram-mi-0");
  assert.deepEqual(host.calls[0], { name: "pane.focus", args: { terminal: "t1" } }, "it's focused by its terminal");
  // How it writes keys.
  assert.deepEqual(["cmd-c", "ctrl-shift-c", "ctrl-b", "alt-x", "cmd-shift-k"].map(rm.pretty), ["\u2318C", "^\u21e7C", "^b", "\u2325X", "\u2318\u21e7K"]);
  host.platform = "linux";
  const linuxKeys = host.keys;
  host.keys = [{ section: "terminal", keys: "ctrl-insert", action: "terminal.copy" }, { section: "terminal", keys: "ctrl-shift-c", action: "terminal.copy" }];
  assert.equal(rm.hint("terminal.copy"), "^\u21e7C", "elsewhere: the one with a letter");
  host.platform = "macos";
  host.keys = [{ section: "terminal", keys: "alt-c", action: "terminal.copy" }, { section: "terminal", keys: "cmd-c", action: "terminal.copy" }];
  assert.equal(rm.hint("terminal.copy"), "\u2318C", "on a Mac: the cmd key");
  host.keys = linuxKeys;
  host.props = {};
}
console.log("PASS: RAM's right-click menu: Copy and Paste (on the terminal right-clicked, then it closes), then Herdr's items with their keys; the keyboard works it");

// ---- Every click has a key: the new ones are bound -------------------------------------------
{
  const bar = keysFile[`mod:${BAR}`];
  const want = { "shift-c": "newmenu", "<": "tab.left", "shift-,": "tab.left", ">": "tab.right", "shift-.": "tab.right",
    "{": "space.earlier", "shift-[": "space.earlier", "}": "space.later", "shift-]": "space.later",
    e: "ram.enter", "shift-i": "ram.bp", "shift-p": "ram.peek", m: "ram.meta", i: "ram.space", r: "ram.hunk", f: "ram.follow",
    g: "lazygit", "/": "rg", d: "ram.changes", b: "layout.toggle:sidebar", w: "navigate", h: "pane.go:left" };
  for (const [k, action] of Object.entries(want)) assert.equal(bar[k], `${BAR}.${action}`, `^b ${k}`);
  // Keys show where their buttons are: the levels, e and f, HUNK, GIT, search, STACK's row.
  host.shared.set("ram.zoom", "space");
  const t5 = R(side, { role: "side" });
  assert(textOf(withId(t5, "ram-git-line")).includes("^b g") && textOf(withId(t5, "ram-hunk-head")).includes("^b r")
    && textOf(withId(t5, "ram-rg")).includes("/") && textOf(t5).includes("^b w"), "GIT ^b g, HUNK ^b r, search /, STACK ^b w");
}
console.log("PASS: keys: C, < >, { }, e, I and P are bound after ^b, with the rest; the side column shows its keys by their parts");

// ---- Inactive window, empty state, text ---------------------------------------------------
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
host.active = false;
host.shared.set("ram.zoom", "meta");
assert.equal(motions(R(map, {})).length, 0);
assert.equal(motions(RR()).length, 0, "the sticks' scan line and lights wait too");
assert.equal(motions(R(side, { role: "side" })).length, 0);
host.shared.set("ram.zoom", "space");
assert.equal(motions(R(map, {})).length, 0);
assert.equal(motions(R(side, { role: "side" })).length, 0);
host.active = true;
assert(motions(R(side, { role: "side" })).length > 0);
host.shared.set("ram.zoom", "meta");
assert(motions(RR()).length > 0, "active again: the scan line sweeps the sticks");
host.shared.set("ram.zoom", "space");
Object.assign(host, { spaces: [], panes: [], agents: [], raw: [], calls: [] });
host.storage.clear();  // no exit history: nothing retained from closed spaces
for (const role of [{}, { role: "side" }, { role: "peek" }, { role: "rams" }, { role: "lang" }, { role: "git-init" }]) {
  const v = view(role);
  assert(v.render(cx), JSON.stringify(role));
}
assert(textOf(view({ role: "side" }).render(cx)).includes("No space yet"));
assert(withId(view({}).render(cx), "ram-level-meta"));
host.shared.set("ram.zoom", "meta");
assert(textOf(view({ role: "rams" }).render(cx)).includes("No regions yet: open a space to allocate one."));
assert(textOf(view({ role: "side" }).render(cx)).includes("STACK \u2193  0"), "meta's main stick with nothing open");
await settle();
assert(!host.calls.some(c => !c.name.startsWith("layout.")), "an empty window runs nothing but sizes");
for (const file of ["mods/ram/main.js", "mods/ram/ui.js", "mods/ram/all.js", "mods/ram/hunk.js", "mods/ram/model.js", "mods/ram/git.js", "mods/ram/langs.js",
  "mods/ram/pointers.js", "mods/ram/procs.js", "mods/ram/gitinit.js", "mods/ram/mod.json", "mods/ram-menu/main.js", "mods/ram-menu/mod.json", "mods/ram-menu/copy.svg", "mods/ram-menu/paste.svg",
  "layouts/ram.json", "layouts/ram.svg", "themes/ram.json", `mods/${BAR}/main.js`]) {
  const content = await read(file);
  assert(!/\/(?:Users|home)\/[^/\s]+/.test(content), `private home path in ${file}`);
  assert(!/[\u2013\u2014]/u.test(content), `en/em dash in ${file}`);
}
// Tooltips are one line: GPUI draws a multi-line tooltip's lines over each other.
Object.assign(host, { spaces, panes, agents: agentList, raw });
for (const zoom of ["meta", "space"]) {
  host.shared.set("ram.zoom", zoom);
  for (const [copy, role] of [[map, {}], [side, { role: "side" }], [rams, { role: "rams" }]]) {
    const tips = flatten(R(copy, role)).flatMap(n => n.ops.filter(([k]) => k === "tooltip").map(([, t]) => t));
    assert(tips.length > 5 && tips.every(t => !String(t).includes("\n")), `${zoom} ${role.role ?? "map"}: ${tips.find(t => String(t).includes("\n"))}`);
  }
}
host.shared.set("ram.zoom", "space");
Object.assign(host, { spaces: [], panes: [], agents: [], raw: [] });
console.log("PASS: animations stop while inactive; every role builds with nothing open; one-line tooltips; no home paths or long dashes");
// ---- ⌘+ and ⌘-: every terminal's text a size bigger or smaller -----------------------
{
  const keysNow = JSON.parse(await read("keys.json"));
  // RAM's global keys are there (a home they were merged into has its own too).
  const want = { "ctrl-b": `mod.open:${BAR}`, "cmd-=": `mod.open:${BIG}`, "cmd-+": `mod.open:${BIG}`, "cmd--": `mod.open:${SMALL}` };
  assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, keysNow.global[k]])), want,
    "⌘= and ⌘+ (one key on a US keyboard) make it bigger, ⌘- smaller");
  for (const [section, m] of Object.entries(keysNow))
    if (section !== "global") assert(!["cmd-=", "cmd-+", "cmd--"].some(k => k in m), `${section} doesn't take ⌘+ or ⌘- back`);
  assert.equal(keysNow[`mod:${BAR}`]["+"], `${BAR}.app.zoom_in`, "^b + still zooms everything");
  // In a Herdr home kept in git with an allowlist .gitignore, both mods are tracked.
  const ignore = (await has(".gitignore")) ? await read(".gitignore") : "";
  if (ignore.includes("!/mods/")) assert(ignore.includes(`!/mods/${BIG}/\n!/mods/${SMALL}/`), "both are tracked");
  const SETTINGS = "/home/tester/.config/herdr-app/settings.json";
  const mods = {};
  for (const name of [BIG, SMALL]) {
    const spec = JSON.parse(await read(`mods/${name}/mod.json`));
    // A width or height of 1 would be the whole window ("up to 1: a share of the window").
    assert.deepEqual([spec.place, spec.overlay], ["none", { kind: "window", frame: "none" }],
      `${name}: never docked; an empty frameless window, which doesn't take the keyboard`);
    mods[name] = await import(url(swap(await read(`mods/${name}/main.js`))));
  }
  const fnOf = src => src.slice(src.indexOf("export async function step"), src.indexOf("export default class"));
  const [big, small] = await Promise.all([BIG, SMALL].map(n => read(`mods/${n}/main.js`)));
  assert.equal(fnOf(big), fnOf(small), "the twins share one step()");
  assert(big.includes("const STEP = 1;") && small.includes("const STEP = -1;"));
  const person = '{\n  "zoom": 0.8,\n  "sounds": {\n    "enabled": true\n  },\n  "font_size": 16.0,\n  "font_ligatures": false\n}\n';
  host.files = { [SETTINGS]: person }; host.writes = [];
  assert.equal(await mods[BIG].step(), 17);
  assert.deepEqual(JSON.parse(host.files[SETTINGS]), { zoom: 0.8, sounds: { enabled: true }, font_size: 17, font_ligatures: false },
    "font_size one bigger, the rest kept");
  assert.deepEqual(Object.keys(JSON.parse(host.files[SETTINGS])), ["zoom", "sounds", "font_size", "font_ligatures"], "in its order");
  assert(host.files[SETTINGS].endsWith("}\n") && host.files[SETTINGS].includes('\n  "zoom": 0.8,'), "written as Settings writes it");
  assert.equal(await mods[SMALL].step(), 16);
  assert.equal(await mods[SMALL].step(), 15);
  assert.equal(host.writes.length, 3);
  host.files[SETTINGS] = '{ "font_size": 32 }'; host.writes = [];
  assert.equal(await mods[BIG].step(), 32);
  host.files[SETTINGS] = '{ "font_size": 8 }';
  assert.equal(await mods[SMALL].step(), 8);
  assert.equal(host.writes.length, 0, "at 32 or 8 (Settings' range) nothing changes");
  host.files[SETTINGS] = '{ "zoom": 0.8 }';
  assert.equal(await mods[BIG].step(), 15, "no font_size yet: Herdr's 14, one bigger");
  host.files[SETTINGS] = null;
  assert.equal(await mods[SMALL].step(), 13, "no settings.json: one made");
  for (const broken of ["{ zoom: 0.8", "[1, 2]", "7"]) {
    host.files[SETTINGS] = broken; host.writes = [];
    assert.equal(await mods[BIG].step(), null);
    assert.deepEqual([host.writes.length, host.files[SETTINGS]], [0, broken], `${broken}: left alone`);
  }
  // Someone wrote the file between the read and the write: it reads again and builds on theirs.
  host.files[SETTINGS] = '{ "font_size": 16 }';
  host.staleOnce = '{ "font_size": 20, "zoom": 1.1 }';
  assert.equal(await mods[BIG].step(), 21);
  assert.deepEqual(JSON.parse(host.files[SETTINGS]), { font_size: 21, zoom: 1.1 });
  // Opened by its key (an overlay): one step, then it closes itself. Anywhere else, nothing.
  host.files[SETTINGS] = person; host.writes = []; host.closed = [];
  host.props = { overlay: "oT" };
  const opened = new mods[BIG].default(); opened.init({}, cx);
  await settle();
  assert.deepEqual([JSON.parse(host.files[SETTINGS]).font_size, host.closed], [17, ["oT"]]);
  assert(opened.render(cx), "it draws nothing much");
  host.props = {}; host.writes = []; host.reads = [];
  new mods[SMALL].default().init({}, cx);
  await settle();
  assert.deepEqual([host.writes.length, host.reads.length, host.closed], [0, 0, ["oT"]], "not opened by its key (herdr-app check): nothing");
  host.props = { overlay: "oU" };
  new mods[SMALL].default().init({}, cx);
  await settle();
  assert.deepEqual([JSON.parse(host.files[SETTINGS]).font_size, host.closed], [16, ["oT", "oU"]]);
  host.files = {}; host.props = {};
  for (const file of [`mods/${BIG}/main.js`, `mods/${SMALL}/main.js`, `mods/${BIG}/mod.json`, `mods/${SMALL}/mod.json`]) {
    const content = await read(file);
    assert(!/\/(?:Users|home)\/[^/\s]+/.test(content) && !/[\u2013\u2014]/u.test(content), file);
  }
}
console.log("PASS: ⌘+ and ⌘- (cmd-= cmd-+ cmd--): every terminal's text a size bigger or smaller in settings.json, as Settings does it (8 to 32, the rest kept, a broken file left alone); ^b + still zooms everything");
// ---- The ctrl-b bar ------------------------------------------------------------------
const { default: Prefix } = await import(url(swap(await read(`mods/${BAR}/main.js`))));
const cx2 = { ...cx, focus_handle: () => ({ focus() {} }), timer: { ...cx.timer, after: () => {} } };
host.props = { overlay: "o1" };
host.shared.set("layout", "ram");
const bar = new Prefix(); bar.init({}, cx2);
let barText = textOf(bar.render(cx2));
assert(barText.includes("RAM") && barText.includes("meta") && barText.includes("hunk") && barText.includes("r") && !barText.includes("rift"), barText);
assert(barText.includes("follow") && barText.includes("f") && barText.includes("diff") && barText.includes("d"), "f follow, d diff");
{
  // Each key right before what it does (the bar writes shift-i as I).
  const pair = (k, label) => barText.some((x, i) => x === k && barText[i + 1] === label);
  const zoomWas = host.shared.get("ram.zoom");
  host.shared.set("ram.zoom", "space");
  barText = textOf(bar.render(cx2));
  for (const [k, label] of [["e", "enter"], ["I", "BP here"], ["P", "peek"], ["C", "new\u2026"], ["<", "move \u2190"], [">", "move \u2192"],
    ["{", "move \u2191"], ["}", "move \u2193"], ["m", "meta"], ["i", "space"], ["r", "hunk"]])
    assert(pair(k, label), `${k} ${label}`);
  // In meta, P hides the sticks under its terminal.
  host.shared.set("ram.zoom", "meta");
  barText = textOf(bar.render(cx2));
  assert(pair("P", "sticks") && !barText.includes("peek"), "meta: P sticks");
  host.shared.set("ram.zoom", zoomWas);
  barText = textOf(bar.render(cx2));
}
assert(!barText.includes("changes"), "the bar says diff, as the main stick does");
assert(barText.includes("^b") && !barText.some(x => /ctrl-b/.test(x)), `the bar writes the prefix as ^b: ${barText}`);
assert(barText.includes("send ^b"), "even the passthrough");
assert(barText.includes("git") && barText.includes("g") && barText.includes("lazygit"), "git: g lazygit");
assert(barText.indexOf("git") < barText.indexOf("RAM"), "git before RAM's own keys");
host.shared.set("layout", "traveler");
barText = textOf(bar.render(cx2));
assert(!barText.includes("RAM") && !barText.includes("meta") && !barText.includes("BP here"), barText);
assert(barText.includes("new\u2026") && barText.includes("move \u2190"), "C, < > and { } work in every layout");
assert(barText.includes("git") && barText.includes("lazygit"), "g lazygit shows in every layout");
assert(barText.includes("^b") && !barText.some(x => /ctrl-b/.test(x)), "every layout's bar says ^b");
// ^b g outside RAM: lazygit in a new tab at the focused terminal's repo, labelled
// so ^b g finds it again; the bar stays up until git answered.
const prefixMod = await import(url(swap(await read(`mods/${BAR}/main.js`))));
Object.assign(host, { spaces, panes, agents: agentList, raw });  // the fixtures again (the empty-state check cleared them)
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/repo/api" };
host.calls = []; host.notes = []; host.closed = [];
const bar2 = new prefixMod.default(); host.props = { overlay: "o9" }; bar2.init({}, cx2);
bar2.finish("lazygit", cx2);
await settle();
const lazyArgv = ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" "ram.lazygit=$PWD" >/dev/null 2>&1; exec lazygit'];
assert.deepEqual(host.calls.at(-1), { name: "tab.new", args: { space: "s0", name: "lazygit api", folder: "/repo/api", argv: lazyArgv } },
  "named after the repo; it labels itself with its folder");
assert.deepEqual(host.closed, ["o9"], "then the bar closes");
assert.deepEqual(prefixMod.LAZY_ARGV, lazyArgv);
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/home/tester/notes" };
host.calls = []; host.notes = []; host.overlays = [];
await prefixMod.lazygitHere();
assert.deepEqual([host.calls.length, host.overlays.at(-1)], [0, { mod: "ram", kind: "dialog", width: 520, height: 340,
  props: { role: "git-init", space: "s0", name: "api", folder: "/home/tester/notes", machine: null } }],
  "not a repo: RAM's GIT dialog, in any layout");
assert.equal(host.notes.length, 0);
// git can't be asked (a machine that's away): lazygit there, which asks itself.
host.execHook = command => { if (command === "git") throw new Error("unreachable"); };
host.overlays = [];
await prefixMod.lazygitHere();
assert.deepEqual([host.overlays.length, host.calls.at(-1)?.args?.folder], [0, "/home/tester/notes"]);
host.execHook = null; host.calls = [];
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "" };
spaces[0].folder = ""; host.calls = [];
await prefixMod.lazygitHere();
assert.deepEqual([host.calls.length, host.notes.at(-1)?.title], [0, "Nowhere for lazygit"], "no folder at all: nowhere");
spaces[0].folder = "/repo/api";
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/repo/api" };
raw.push({ address: "tLZ", state: "live", created_ms: 9900, labels: { "ram.lazygit": "/repo/api" } });
panes.push({ pane: "pLZ", terminal: "tLZ", tab: "tab0-1", title: "lazygit", status: null, focused: false, program: { name: "lazygit" } });
host.calls = [];
await prefixMod.lazygitHere();
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-1" } }, "one already open for this repo: show it");
raw.at(-1).labels = { "ram.lazygit": "/repo/web" };
await prefixMod.lazygitHere();
assert.equal(host.calls.at(-1).name, "tab.new", "the open one is another repo's: a new one");
raw.pop(); panes.pop();
host.shared.set("layout", "ram"); host.calls = [];
const bar3 = new prefixMod.default(); bar3.init({}, cx2);
bar3.finish("lazygit", cx2);
assert.deepEqual(host.calls.at(-1), { name: "ram.git", args: {} }, "in RAM, RAM opens it (its own repo choice)");
// ^b / the same way: RAM's search window over the window, for the terminal you're in
// (its folder and its repo's top), in any layout; in RAM, RAM's ram.rg.
host.shared.set("layout", "traveler");
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/repo/api/src" };
host.calls = []; host.closed = []; host.overlays = [];
const bar6 = new prefixMod.default(); host.props = { overlay: "o11" }; bar6.init({}, cx2);
bar6.finish("rg", cx2);
await settle();
const so = host.overlays.at(-1);
assert.deepEqual(so, { mod: "ram", kind: "dialog", width: 0.9, height: 0.86, props: { role: "search", at: so?.props?.at, space: "s0",
  name: "api", machine: null, target: { pane: "p0", terminal: "t1" }, folder: "/repo/api/src", repo: "/repo/api" } },
  "RAM's search window (as RAM opens it), for the terminal you're in");
assert.equal(host.shared.get("ram.search.top"), so.props.at, "the newest window's mark");
assert.deepEqual(host.closed, ["o11"], "then the bar closes");
assert.equal(host.calls.filter(c => c.name === "tab.new").length, 0, "no tab");
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/home/tester/notes" };
host.overlays = [];
await prefixMod.searchHere();
assert.deepEqual([host.overlays.at(-1)?.props?.folder, host.overlays.at(-1)?.props?.repo], ["/home/tester/notes", null], "not a repo: that folder");
host.focused = { space: "s0", tab: "tab0-0", pane: "pX", terminal: null, cwd: "/home/tester/elsewhere" };
host.overlays = [];
await prefixMod.searchHere();
assert.deepEqual([host.overlays.at(-1)?.props?.folder, host.overlays.at(-1)?.props?.target], ["/repo/api", null],
  "no terminal has the keyboard: the space's folder, and picks are copied");
spaces[0].folder = ""; host.overlays = []; host.notes = [];
await prefixMod.searchHere();
assert.deepEqual([host.overlays.length, host.notes.at(-1)?.title], [0, "Nowhere to search"], "no folder at all: nowhere");
spaces[0].folder = "/repo/api";
// The key's other way in (finish without a task context: runCommand) does the same.
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/repo/api" };
host.overlays = []; host.calls = [];
const bar8 = new prefixMod.default(); bar8.init({}, cx2);
bar8.finish("rg"); await settle();
assert.equal(host.overlays.at(-1)?.props?.role, "search", "outside RAM: the window, not ram.rg");
host.shared.set("layout", "ram"); host.calls = [];
const bar7 = new prefixMod.default(); bar7.init({}, cx2);
bar7.finish("rg", cx2);
assert.deepEqual(host.calls.at(-1), { name: "ram.rg", args: {} }, "in RAM, RAM opens it");
barText = textOf(bar.render(cx2));
assert(barText.includes("search") && barText.includes("/") && !barText.includes("rg-fzf"), "search: / search");
// The bar's own commands: ^b < > move the tab, ^b { } the space, ^b C the new-tab menu;
// in RAM ^b ( ) show a space at its BP, as clicking it does.
{
  const runBar = c => { host.calls = []; host.overlays = []; const b = new prefixMod.default(); b.init({}, cx2); b.finish(c); };
  host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1" };
  host.shared.set("layout", "traveler");
  runBar("tab.left");
  assert.deepEqual(host.calls, [], "the first tab can't go further left");
  runBar("tab.right");
  assert.deepEqual(host.calls, [{ name: "tab.move", args: { id: "tab0-0", index: 2 } }], "^b >: one place right");
  host.focused = { space: "s0", tab: "tab0-1", pane: "p1", terminal: "t2" };
  runBar("tab.left");
  assert.deepEqual(host.calls, [{ name: "tab.move", args: { id: "tab0-1", index: 1 } }], "^b <: one place left");
  runBar("tab.right");
  assert.deepEqual(host.calls, [], "the last can't go right");
  host.focused = { space: "s1", tab: "tab1-0", pane: "p5", terminal: "t6" };
  runBar("space.earlier");
  assert.deepEqual(host.calls, [{ name: "space.move", args: { id: "s1", index: 1 } }], "^b {: one place up");
  runBar("space.later");
  assert.deepEqual(host.calls, [{ name: "space.move", args: { id: "s1", index: 3 } }], "^b }: one place down");
  runBar("newmenu");
  assert.deepEqual([host.calls, host.overlays], [[{ name: "space.select", args: { id: "s1" } }],
    [{ mod: "new-menu", kind: "popup", width: 250, height: 512 }]], "^b C: the + menu, in the space you're in");
  runBar("space.next");
  assert.deepEqual(host.calls, [{ name: "space.next", args: {} }], "outside RAM ^b ) is Herdr's");
  host.shared.set("layout", "ram");
  host.shared.set("ram.bp", { s2: "tab2-1" });
  runBar("space.next");
  assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab2-1" } }], "in RAM: the next space at its BP");
  runBar("space.prev");
  assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s0" } }], "no BP kept there yet: the space as it is");
  host.shared.set("ram.bp", { s0: "tab0-0" });
  for (const [c, cmd] of [["ram.enter", "enter"], ["ram.bp", "bp"], ["ram.peek", "peek"]]) {
    runBar(c);
    assert.deepEqual(host.calls, [{ name: c, args: {} }], `${c} goes to RAM (which hears it as ${cmd})`);
  }
}
host.focused = null;
console.log("PASS: the ^b bar (every layout) lists g lazygit and / search (they work everywhere), C, < > and { }, and RAM's keys under RAM only while RAM shows");
// ^b w: navigate mode, as in the Herdr TUI, each move shown at once: j/k through the
// spaces (the layout's own list marks the one it's on), h/l through that space's
// tabs, H J K L the panes; Enter stays, Esc goes back. No picker.
{
  const lastOp = (n, key) => [...(n?.ops ?? [])].reverse().find(([k]) => k === key)?.slice(1);
  // Each check finds its row first, so a "not marked" can't pass on a row that isn't there.
  const must = (tree, id) => { const n = withId(tree, id); assert(n, `no ${id}`); return n; };
  assert.equal(keysFile[`mod:${BAR}`].w, `${BAR}.navigate`, "^b w is navigate mode, not the picker");
  assert.equal(keysFile[`mod:${BAR}`].j, `${BAR}.pane.go:down`, "(j and k are pane keys after ^b: navigate mode takes them over)");
  Object.assign(host, { spaces, panes, agents: agentList, raw });
  host.shared.set("layout", "traveler"); host.shared.delete("navigate.space");
  host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1" };
  const bar = () => {
    host.props = { overlay: "oN" }; host.closed = []; host.calls = [];
    const b = new prefixMod.default(); b.init({}, cx2);
    b.resolve = host.waiting.at(-1);   // its nextCommand()
    return b;
  };
  // Keys the way Herdr 0.1.14 routes them (src/keys.rs, src/window.rs): a key keys.json
  // binds in mod:prefix runs as that binding, a GPUI action handled at the window, so
  // it reaches the bar's nextCommand() as its action and never on_key_down. Esc is
  // bound in a popup (overlay.close): Herdr closes the bar. Other keys reach on_key_down.
  const deliver = async (b, action) => { b.resolve(action); await settle(); b.resolve = host.waiting.at(-1); };
  const keyDown = (b, k, c = cx2) => withId(b.render(cx2), "prefix-layer").handlers.on_key_down({ key: k, keystroke: k }, c);
  const press = async (b, k) => {
    const action = keysFile[`mod:${BAR}`][k];
    if (action) return deliver(b, action.slice(`${BAR}.`.length));
    if (k === "escape") return b.close();
    keyDown(b, k);
  };
  const on = () => host.shared.get("navigate.space")?.id ?? null;
  let nb = bar();
  const before = textOf(nb.render(cx2));
  assert(before.includes("navigate") && !before.includes("picker"), "the bar's spaces area: w navigate");
  await press(nb, "w");
  assert.equal(on(), "s0", "it starts on the space you're in");
  let nt = nb.render(cx2);
  assert.deepEqual(textOf(withId(nt, "prefix-nav")).slice(0, 3), ["navigate", "api", "1 of 4"], "the bar says which space it's on");
  for (const label of ["space", "tab", "pane", "stay", "back"]) assert(textOf(withId(nt, "prefix-nav")).includes(label), `the bar's keys: ${label}`);
  assert.deepEqual(textOf(withId(nt, "prefix-nav")).slice(3, 5), ["tab 1", "1 of 2"], "and which tab");
  assert(!textOf(nt).includes("then a key \u00b7 Esc cancels"), "one row: no hints");
  const path = [];
  for (const k of ["j", "down", "k", "up", "k", "j"]) { await press(nb, k); path.push(on()); }
  assert.deepEqual(path, ["s1", "s2", "s1", "s0", "s3", "s0"], "j/down next, k/up back, round the ends");
  assert.deepEqual(host.calls, path.map(id => ({ name: "space.select", args: { id } })), "each one shows at once (no pane.go)");
  assert.deepEqual(host.closed, [], "and the bar stays");
  // Should a Herdr hand a bound key to on_key_down as well, it still moves once.
  keyDown(nb, "j"); await deliver(nb, "pane.go:down");
  assert.equal(on(), "s1", "one move, not two");
  await press(nb, "j");
  assert.deepEqual(textOf(withId(nb.render(cx2), "prefix-nav")).slice(0, 4), ["navigate", "ops", "@remote", "3 of 4"], "ops is on another machine: it says so");
  // h/left and l/right: the tabs of the space it's on, round the ends, each shown at once.
  host.calls = [];
  for (const k of ["l", "l", "h", "right", "left"]) await press(nb, k);
  assert.deepEqual(host.calls.map(c => [c.name, c.args.id]), ["tab2-1", "tab2-0", "tab2-1", "tab2-0", "tab2-1"].map(id => ["tab.select", id]),
    "l/right the next tab, h/left the one before (h and l are pane keys after ^b: navigate takes them over)");
  assert.deepEqual(textOf(withId(nb.render(cx2), "prefix-nav")).slice(4, 6), ["tab 2", "2 of 2"], "the bar follows");
  // A settled tab is skipped, as tab.next does.
  await press(nb, "l");
  spaces[2].tabs[1].settled = true; host.calls = [];
  await press(nb, "l");
  assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab2-0" } }], "&2 is settled: l stays on &1");
  spaces[2].tabs[1].settled = false;
  // H J K L: the pane that way (outside navigate mode ^b H J K L swap panes).
  host.calls = [];
  for (const k of ["shift-h", "shift-j", "shift-k", "shift-l"]) await press(nb, k);
  keyDown(nb, "H");
  assert.deepEqual(host.calls, ["left", "down", "up", "right", "left"].map(direction => ({ name: "pane.go", args: { direction } })),
    "H J K L focus that way, as keys.json spells them or as typed");
  // Another space: its tabs start from the one it shows.
  host.calls = [];
  const docsTabs = spaces[3].tabs, after = docsTabs[(docsTabs.findIndex(x => x.active) + 1) % docsTabs.length].id;
  await press(nb, "j"); await press(nb, "l");
  assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s3" } }, { name: "tab.select", args: { id: after } }]);
  await press(nb, "k");
  assert.equal(on(), "s2");
  // In RAM a space shows at its BP, as clicking it does, and its tabs go on from there.
  {
    const bpWas = host.shared.get("ram.bp");
    host.shared.set("layout", "ram"); host.shared.set("ram.bp", { s3: "tab3-1" }); host.calls = [];
    await press(nb, "j");
    assert.deepEqual(host.calls, [{ name: "tab.select", args: { id: "tab3-1" } }], "RAM: docs at its BP (&2)");
    await press(nb, "l");
    assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab3-0" } }, "l: the tab after its BP");
    host.calls = [];
    await press(nb, "k");
    assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s2" } }], "no BP kept for ops: the space as it is");
    assert.equal(on(), "s2");
    host.shared.set("ram.bp", bpWas); host.shared.set("layout", "traveler");
  }
  // The lists mark it: RAM's stack (space level), its main stick and sticks (meta), Traveler, Night City.
  host.shared.set("ram.zoom", "space");
  assert.deepEqual(lastOp(must(R(side, { role: "side" }), "stack-s2"), "border_color"), ["#6fe3d3"], "RAM's stack: cyan");
  assert(!lastOp(must(R(side, { role: "side" }), "stack-s1"), "border_color"), "only that one");
  host.shared.set("ram.zoom", "meta");
  assert.deepEqual(lastOp(must(AS(), "all-space-s2"), "border_color"), ["#6fe3d3"], "the main stick: cyan");
  assert.notDeepEqual(lastOp(must(AS(), "all-space-s1"), "border_color"), ["#6fe3d3"]);
  const navBox = must(RR(), "region-s2").kids[0];
  assert.notDeepEqual(op(must(RR(), "region-s1").kids[0], "border_color"), ["#6fe3d3"]);
  assert.deepEqual(op(navBox, "border_color"), ["#6fe3d3"], "its stick: a cyan outline");
  assert.deepEqual(op(withId(RR(), "region-s0").kids[0], "border_color"), ["#ffb547"], "the space you're in stays amber");
  // Traveler and Night City, where this home has them.
  let tsp = null, towerBody = null;
  if (await has("mods/traveler-spaces/main.js")) {
  const { default: Spaces } = await import(await load("mods/traveler-spaces/main.js"));
  host.props = {};
  tsp = new Spaces(); tsp.init({}, cx); await settle();
  let tt = tsp.render(cx);
  assert.deepEqual(lastOp(must(tt, "space-s2"), "border_color"), [host.colors.ansi6], "Traveler: teal (its gold marks the space you're in)");
  assert.notDeepEqual(lastOp(must(tt, "space-s1"), "border_color"), [host.colors.ansi6]);
  // Its rail (a sidebar under 160 px) marks it the same way.
  const roomy = host.layout;
  host.layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "block", size: { px: 100 } }] };
  tt = tsp.render(cx);
  assert.deepEqual(op(must(tt, "space-s2"), "h"), [26], "(the rail's compact rows)");
  assert.deepEqual(lastOp(must(tt, "space-s2"), "border_color"), [host.colors.ansi6], "Traveler's rail: teal too");
  assert.notDeepEqual(lastOp(must(tt, "space-s1"), "border_color"), [host.colors.ansi6]);
  host.layout = roomy;
  }
  if (await has("mods/night-city/main.js")) {
  const { default: City } = await import(await load("mods/night-city/main.js"));
  host.props = {};
  const city = new City(); city.init({}, cx); await settle();
  towerBody = id => { const n = flatten(must(city.render(cx), `tower-${id}`)).find(n => op(n, "border_t")?.[0] === 2); assert(n, `no body for ${id}`); return n; };
  assert.deepEqual(lastOp(towerBody("s2"), "border_color"), [host.colors.ansi15], "Night City: a white outline");
  assert.notDeepEqual(lastOp(towerBody("s1"), "border_color"), [host.colors.ansi15]);
  }
  // In a short stack the one it's on stays in view (with the space you're in).
  host.shared.set("ram.zoom", "space");
  const shortSide = view({ role: "side" }); shortSide.size = { width: 300, height: 350 };
  host.shared.set("navigate.space", { id: "s3", at: Date.now() });
  const shownIds = flatten(R(shortSide, { role: "side" })).map(idOf).filter(id => /^stack-/.test(id ?? ""));
  assert.deepEqual(shownIds, ["stack-s0", "stack-s3"], "two rows fit: the space you're in and the one it's on");
  host.shared.set("navigate.space", { id: "s2", at: Date.now() });
  // Enter: you're already there, so it only closes the bar.
  host.props = { overlay: "oN" }; host.calls = [];
  await press(nb, "enter");
  assert.deepEqual(host.calls, [], "nothing more to show");
  assert.deepEqual(host.closed, ["oN"]);
  assert.equal(on(), null, "and nothing is marked any more");
  assert(!lastOp(must(R(side, { role: "side" }), "stack-s2"), "border_color"));
  // Esc (Herdr closes the popup; or on_key_down, should one get it): back to the space,
  // tab and pane it started on.
  const home = [{ name: "space.select", args: { id: "s0" } }, { name: "tab.select", args: { id: "tab0-0" } },
    { name: "pane.focus", args: { pane: "p0" } }];
  for (const k of ["escape", "escape-key"]) {
    nb = bar(); await press(nb, "w"); await press(nb, "j"); await press(nb, "l"); await press(nb, "shift-l");
    host.calls = [];
    if (k === "escape-key") keyDown(nb, "escape"); else await press(nb, k);
    assert.deepEqual([host.calls, on()], [home, null], `${k}: back where it started`);
    assert.deepEqual(host.closed, k === "escape" ? [] : ["oN"], `${k}: the bar goes`);
  }
  // Only a pane moved: back to that pane too.
  nb = bar(); await press(nb, "w"); await press(nb, "shift-j"); host.calls = [];
  await press(nb, "escape");
  assert.deepEqual(host.calls, home);
  // Esc before any move: nothing to undo.
  nb = bar(); await press(nb, "w"); await press(nb, "escape");
  assert.deepEqual([host.calls, on()], [[], null], "nothing moved: nothing to undo");
  // What it started on has gone: back to what's left of it.
  nb = bar(); await press(nb, "w"); await press(nb, "j");
  const gone = spaces[0].tabs.splice(0, 1)[0]; host.calls = [];
  await press(nb, "escape");
  assert.deepEqual(host.calls, [home[0], home[2]], "its tab closed: the space and pane only");
  spaces[0].tabs.splice(0, 0, gone);
  // Enter or any other key, bound (x is pane.close, w again) or not (q): you stay where
  // you are, and that key does nothing else.
  for (const k of ["enter", "x", "w", "q"]) {
    nb = bar(); await press(nb, "w"); await press(nb, "j");
    assert.equal(on(), "s1");
    host.calls = [];
    await press(nb, k);
    assert.deepEqual([host.calls, host.closed, on()], [[], ["oN"], null], `${k}: you stay`);
  }
  // A click outside the bar stays too; the bar going any other way clears the mark.
  nb = bar(); await press(nb, "w"); await press(nb, "j"); host.calls = [];
  withId(nb.render(cx2), "prefix-layer").handlers["on_mouse_down:left"]({}, cx2);
  assert.deepEqual([host.calls, host.closed, on()], [[], ["oN"], null]);
  nb = bar(); await press(nb, "w"); await press(nb, "j");
  await nb.close();
  assert.equal(on(), null);
  // on_key_down's fallback for a bound key (150 ms on, should Herdr not deliver it):
  // after the delivery started navigate mode it does nothing (it would cancel);
  // with no delivery it starts it.
  const later = [];
  const cxT = { ...cx2, timer: { ...cx2.timer, after: (_ms, fn) => later.push(fn) } };
  nb = bar(); keyDown(nb, "w", cxT); await deliver(nb, "navigate");
  later.splice(0).forEach(fn => fn(cxT));
  assert.deepEqual([on(), host.closed], ["s0", []], "w by both ways starts it once");
  await press(nb, "escape");
  nb = bar(); keyDown(nb, "w", cxT);
  assert.equal(on(), null, "not before the fallback");
  later.splice(0).forEach(fn => fn(cxT));
  assert.equal(on(), "s0", "the fallback starts it");
  await press(nb, "j");
  assert.equal(on(), "s1");
  await press(nb, "escape");
  // It starts on the space you're in wherever that is in the list; with no focus, the shown one.
  host.focused = { space: "s1", tab: "tab1-0", pane: "p2", terminal: "t3" };
  nb = bar(); await press(nb, "w");
  assert.equal(on(), "s1", "focus in the second space: it starts there");
  await press(nb, "escape");
  host.focused = null;
  nb = bar(); await press(nb, "w");
  assert.equal(on(), spaces.find(s => s.active).id, "no focus: the shown space");
  await press(nb, "escape");
  host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1" };
  // No spaces: nothing to navigate.
  Object.assign(host, { spaces: [] });
  nb = bar(); await press(nb, "w");
  assert.deepEqual([on(), host.closed], [null, ["oN"]]);
  Object.assign(host, { spaces, panes, agents: agentList, raw });
  // A mark left behind (the bar never closed cleanly) fades after 5 minutes.
  host.shared.set("navigate.space", { id: "s2", at: Date.now() - 5 * 60000 - 1 });
  assert(!lastOp(must(R(side, { role: "side" }), "stack-s2"), "border_color"), "RAM ignores an old one");
  if (tsp) assert.notDeepEqual(lastOp(must(tsp.render(cx), "space-s2"), "border_color"), [host.colors.ansi6], "so does Traveler");
  if (towerBody) assert.notDeepEqual(lastOp(towerBody("s2"), "border_color"), [host.colors.ansi15], "and Night City");
  host.shared.delete("navigate.space");
  host.focused = null; host.props = {};
  host.shared.set("ram.zoom", "space"); host.shared.set("layout", "ram");
}
console.log("PASS: ^b w is navigate mode, each move shown at once: j/k the spaces, h/l the tabs, H J K L the panes (they come as their keys.json actions); Enter or any other key stays, Esc goes back; RAM, Traveler and Night City mark the space it's on, the bar names it and the tab");
// Night City's footer writes its keys the same way.
if (await has("mods/night-city/main.js"))
  assert((await read("mods/night-city/main.js")).includes('shortcut(command).replace(/\\bctrl-/g, "^")'), "Night City shows ^b too");
delete globalThis.__ramFixture;
delete globalThis.localStorage;
