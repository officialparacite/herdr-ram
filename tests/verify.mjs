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
  // layout(): the live layout tree (host.layout); layout.resize changes it, as
  // Herdr does, unless host.layoutLag holds it back.
  export const layout = () => host.layout ?? null;
  const findNode = (n, id) => n?.id === id ? n : (n?.children ?? []).map(c => findNode(c, id)).find(Boolean) ?? null;
  export const run = (name, args) => { host.calls.push({ name, args });
    const n = name === "layout.resize" && host.layout && !host.layoutLag ? findNode(host.layout, args.id) : null;
    if (n) n.size = args.px !== undefined ? { px: args.px } : { weight: args.weight }; };
  export const openOverlay = spec => { host.overlays.push(spec); return "o" + host.overlays.length; };
  export const notify = n => host.notes.push(n);
  export const closeOverlay = id => { (host.closed ??= []).push(id); }, commands = () => [], focused = () => host.focused ?? null, home = () => "/home/tester";
  export const hc = async args => { host.hcs.push(args);
    if (args[0] === "machine") return { code: 0, stdout: JSON.stringify({ machines: host.machines ?? [] }) };
    return args[0] === "read" ? { code: 0, stdout: "\\x1b[32mone\\x1b[0m\\ntwo   \\n\\n" } : { code: 0, stdout: "" }; };
  export const exec = async (command, args, opts) => { host.execs.push({ command, args, opts });
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
    // Folders under /repo/ are repos, for the key bar's lazygit outside RAM.
    if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel" && opts?.cwd?.startsWith("/repo/"))
      return { code: 0, stdout: opts.cwd + "\\n", stderr: "" };
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
const { default: Ram, LEVELS, level, sideWidth, fitBlocks } = await import(await load("mods/ram/main.js"));
// Spawned tasks run at once; settle() lets their awaits finish. (Some never end,
// like the command loop waiting on nextCommand, so they can't be awaited.)
const cx = { timer: { every: (ms, fn) => host.timers.push({ ms, fn }), after: () => {} }, notify() {},
  spawn: fn => fn(cx), stop_propagation() { host.stopped = true; } };
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
assert.deepEqual(LEVELS, { meta: { map: { px: 74 }, side: 390, peek: false, rams: true },
  space: { map: { px: 74 }, side: 340, peek: false, rams: false }, hunk: { map: { px: 74 }, side: 280, peek: true, rams: false } });
assert.equal(level(), "space");
const map = view({});
assert.deepEqual(host.timers.map(t => t.ms), [250, 250, 1000], "git, the side column's edge, hunk's sessions");
map.size = { width: 1600, height: 58 };
let tree = R(map, {});
await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.resize", args: { id: "ram-map", px: 74 } },
  { name: "layout.resize", args: { id: "sidebar", px: 340 } }, { name: "layout.hide", args: { id: "ram-peek" } },
  { name: "layout.hide", args: { id: "ram-rams" } }]);
host.calls = [];
R(map, {});
await settle();
assert.equal(layoutCalls().length, 0, "sizes are set once per level");
assert.deepEqual(host.shared.get("ram.from"), { s0: "tab0-0" }, "the shown tab is remembered");
console.log("PASS: levels: space by default; the map copy sizes the layout once per level");

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
// The levels, top right: ^b, then each button's key from keys.json.
const levels = textOf(withId(tree, "ram-levels"));
assert.deepEqual(levels, ["^b", "m", "meta", "i", "space", "r", "hunk"], levels);
assert.deepEqual(op(withId(tree, "ram-level-space"), "border_color"), ["#ffb547"], "the current level is lit");
assert.deepEqual(["meta", "space", "hunk"].map(l => op(withId(tree, `ram-level-${l}`), "w")[0]), [78 * 1.25, 78 * 1.25, 78 * 1.25], "three buttons, one size");
assert(!withId(tree, "ram-close"));
host.platform = "linux"; host.buttons = true;
assert(withId(R(map, {}), "ram-close"));
host.platform = "macos"; host.buttons = false;
click(tree, "ram-level-meta");
assert.equal(host.shared.get("ram.zoom"), "meta");
assert.equal(level(), "meta");
console.log("PASS: strip: the space's tabs as small fixed chips (*n shown, &n the rest, !n faults), click shows, double-click renames, a hover x closes; one square +; ^b level buttons");

// ---- meta: the strip on top, the space sticks under the terminal --------------------------
host.calls = [];
map.size = { width: 1600, height: 58 };
tree = R(map, {});
await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.resize", args: { id: "ram-map", px: 74 } },
  { name: "layout.resize", args: { id: "sidebar", px: 390 } }, { name: "layout.hide", args: { id: "ram-peek" } },
  { name: "layout.show", args: { id: "ram-rams" } }]);
assert(withId(tree, "ram-strip") && withId(tree, "tabchip-tab0-0"), "the strip stays on top: the space's tabs");
assert(!withId(tree, "ram-follow"), "follow isn't on the strip: its f is under the sticks' +");
assert(!flatten(tree).some(n => /^region-/.test(idOf(n) ?? "")), "the space sticks aren't on the strip");
assert.deepEqual(op(withId(tree, "ram-level-meta"), "border_color"), ["#ffb547"], "meta is lit");
// The space sticks are a copy of their own (role rams), in the block under the terminal.
let timersBefore = host.timers.length;
const rams = view({ role: "rams" });
assert.deepEqual(host.timers.slice(timersBefore).map(t => t.ms), [250, 10000], "its git and the exit history");
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
// Right of the last stick: + (a new space) and under it follow's f, two squares of one size.
assert.equal(idOf(withId(tree, "ram-regions").kids.at(-1)), "ram-stick-buttons", "after the last stick");
assert.deepEqual(withId(tree, "ram-stick-buttons").kids.map(idOf), ["ram-new-space", "ram-follow"], "the f is under the +");
assert.equal(withId(tree, "ram-stick-buttons").kind, "v_flex", "one over the other");
for (const id of ["ram-new-space", "ram-follow"])
  assert.deepEqual([op(withId(tree, id), "w")[0], op(withId(tree, id), "h")[0]], [30 * 1.25, 30 * 1.25], `${id} is a square`);
assert.deepEqual(textOf(withId(tree, "ram-follow")), ["f"], "just its key");
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
assert(text.includes("SP\u25b8"), "SP marks each stick's shown tab");
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
assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s1" } }]);
assert.equal(host.shared.get("ram.zoom"), "meta", "a stick's name selects that space, still in meta");
host.calls = [];
click(tree, "frame-tab3-1");
assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s3" } }, { name: "tab.select", args: { id: "tab3-1" } }]);
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
host.calls = []; host.execs = [];
click(tree, "git-s1");
await settle();
assert.deepEqual(host.calls[0], { name: "space.select", args: { id: "s1" } });
assert.deepEqual(host.execs.at(-1)?.args, ["do", "tab.new", "--space", "s1", "--name", "lazygit", "--folder", "/repo/web",
  "--argv", '["exec","lazygit"]'], "a stick's git line opens lazygit in that space");
assert.equal(host.shared.get("ram.zoom"), "space");
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
console.log("PASS: meta: the strip on top (tabs); under the terminal every space a stick of one width that fits its block (frames down with a hover x, heap up, +n more where it fits), clicks only select, git lines open lazygit");

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
assert.deepEqual(host.timers.slice(timersBefore).map(t => t.ms), [250, 15000], "the side adds its git tick and a gentle machines check");
spaces[0].folder = "/repo/api";
side.gitInfo.git[JSON.stringify([null, "/repo/api"])] = { name: "herdr", branch: "feat-x", ahead: 2, behind: 1, dirty: 5,
  upstream: true, top: "/repo/api", repo: JSON.stringify([null, "/repo/api/.git"]),
  files: [{ xy: "M", path: "src/app.ts" }, { xy: "?", path: "notes.md" }, { xy: "D", path: "old.txt" }, { xy: "A", path: "new.rs" }, { xy: "M", path: "x.js" }] };
tree = R(side, { role: "side" });
for (const id of ["stack-s0", "stack-s1", "stack-s2", "stack-s3", "ram-space-new", "heap-t1", "heap-t2", "heap-child", "ram-git", "ram-settings", "ram-keys", "ram-commands"])
  assert(withId(tree, id), id);
const st = textOf(tree);
for (const want of ["0x01", "api", "STACK \u2193  4", "HEAP \u2191  5", "\u25c2SP", "GIT", "herdr", "feat-x", "\u21912", "\u21931",
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
assert.equal(textOf(withId(tree, "stack-s0")).at(-1), "\u25c2SP", "SP points at the space you're in, from the right");
assert.deepEqual(textOf(withId(tree, "stack-s1")).slice(0, 2), ["0x02", "web"]);
assert.equal(textOf(withId(tree, "stack-s1")).at(-1), "", "the others keep the SP column empty, so names line up");
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
assert.deepEqual(host.calls.at(-1), { name: "space.select", args: { id: "s3" } });
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
// GIT opens lazygit in a new tab at the repo's top, labels it and names the tab.
click(tree, "ram-git");
await settle();
assert.deepEqual(host.execs.at(-1), { command: "herdr-app", args: ["do", "tab.new", "--space", "s0", "--name", "lazygit",
  "--folder", "/repo/api", "--argv", '["exec","lazygit"]'], opts: undefined });
assert.deepEqual(host.hcs.at(-1), ["label", "tNEW", "ram.lazygit=1"]);
assert.equal(host.shared.get("ram.opening"), null);
// The hunk button, with no review open yet, opens the menu of what to review.
map.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
host.shared.set("ram.zoom", "space");
const strip2 = R(map, {});
host.overlays = [];
click(strip2, "ram-level-hunk");
assert.deepEqual(host.overlays.at(-1), { mod: "ram", kind: "dialog", width: 470, height: 290,
  props: { role: "hunk-menu", space: "s0", name: "api", repo: "herdr" } });
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
assert.deepEqual(host.calls.at(-1), { name: "space.select", args: { id: "s2" } }, "a connected machine selects its space");
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
// space level; the hunk level's (HUNK on top, compact rows) is checked with hunk.
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
r = fits([], 345);
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
// When everything fits, nothing scrolls and nothing has a set height.
r = fits([], 270);
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
        const need = scrolls ? 2 + heightOf(withId(r2.tree, "ram-hunk")) + heightOf(withId(r2.tree, "ram-side-memory")) + op(d, "h")[0] + heightOf(keysNode)
          : r2.total;
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
  assert.deepEqual(["meta", "space", "hunk"].map(sideWidth), [390, 340, 280], "each level's own width, until you drag it");
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
assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s1" } }]);
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
const send = async c => { host.waiting.at(-1)(c); await settle(); };
cmdMap.gitInfo.git[JSON.stringify([null, "/repo/api"])] = side.gitInfo.git[JSON.stringify([null, "/repo/api"])];
host.execs = []; host.notes = []; host.calls = [];
await send("git");
assert.deepEqual(host.execs.at(-1)?.args, ["do", "tab.new", "--space", "s0", "--name", "lazygit", "--folder", "/repo/api",
  "--argv", '["exec","lazygit"]'], "^b g opens lazygit at the space's repo, as clicking GIT does");
assert.equal(host.notes.length, 0);
// Not a repo: a toast says so; nothing opens, the level stays.
spaces[0].folder = "";
host.execs = []; host.shared.set("ram.zoom", "meta");
await send("git");
assert.equal(host.execs.length, 0, "no repo: nothing opens");
assert.deepEqual([host.notes.at(-1)?.title, host.notes.at(-1)?.body], ["Not a git repo", "api isn't in a git repository, so lazygit has nothing to open."]);
assert.equal(host.shared.get("ram.zoom"), "meta", "and the level stays");
host.shared.set("ram.zoom", "space");
let gt = R(side, { role: "side" });
assert.deepEqual(textOf(withId(gt, "ram-git-line")), ["GIT", "not a repo", "^b g"], "GIT's line says it too");
host.notes = [];
click(gt, "ram-git");
assert.equal(host.notes.at(-1)?.title, "Not a git repo", "and so does clicking it");
await send("hunk");
assert.match(host.notes.at(-1)?.body ?? "", /hunk has nothing to open/, "^b r without a repo says so");
spaces[0].folder = "/repo/unchecked";
await send("git");
assert.equal(host.notes.at(-1)?.title, "Checking git", "not looked at yet: try again in a moment");
spaces[0].folder = "/repo/api";
// The space's repo: the shown tab's folder (its focused terminal first), else another tab's.
const { Git } = await import(gitURL);
const gi = new Git(), K = d => JSON.stringify([null, d]);
const homeSpace = { id: "x", name: "~", machine: null, folder: "/home/tester", tabs: [{ id: "a", active: true }, { id: "b", active: false }] };
const homePanes = [{ tab: "a", cwd: "/home/tester", focused: true }, { tab: "b", cwd: "/repo/other", focused: false }];
const other = { name: "other", branch: "mainline", ahead: 1, behind: 0, dirty: 1, upstream: false, top: "/repo/other",
  repo: JSON.stringify([null, "/repo/other/.git"]), files: [] };
assert.equal(gi.info(homeSpace, homePanes), undefined, "nothing looked at yet");
gi.git[K("/home/tester")] = null;
assert.equal(gi.info(homeSpace, homePanes), undefined, "the other tab's folder isn't looked at yet");
gi.git[K("/repo/other")] = other;
assert.equal(gi.info(homeSpace, homePanes)?.name, "other", "the shown tab's folder isn't a repo: another tab's is the space's");
const sum = gi.summary(homeSpace, homePanes);
assert.equal(sum.head.text, "other \u00b7 mainline");
assert.deepEqual(sum.marks.map(m => m.short), ["\u21911", "\u00b11", "\u2302"], "↑ to push, ± uncommitted, ⌂ no remote");
assert.equal(sum.tip, "other \u00b7 mainline: 1 commit to push, 1 uncommitted file, no remote", "the same in words, one line");
// Two repos without a remote: ⌂2; behind: ↓; nothing at all: ✓.
gi.git[K("/repo/third")] = { ...other, name: "third", top: "/repo/third", ahead: 0, behind: 2, dirty: 0, repo: JSON.stringify([null, "/repo/third/.git"]) };
const both = [...homePanes, { tab: "b", cwd: "/repo/third", focused: false }];
assert.deepEqual(gi.summary(homeSpace, both).marks.map(m => m.short), ["\u21911", "\u21932", "\u00b11", "\u23022"]);
const cleanRepo = { ...other, ahead: 0, behind: 0, dirty: 0, upstream: true, files: [] };
gi.git[K("/repo/other")] = cleanRepo;
assert.deepEqual(gi.summary(homeSpace, homePanes).marks.map(m => [m.short, m.text]), [["\u2713", "clean"]]);
assert.equal(new Git().summary(homeSpace, homePanes).tip, "Checking git\u2026");
gi.git[K("/repo/other")] = other;
gi.git[K("/home/tester")] = { ...other, name: "dots", top: "/home/tester", repo: JSON.stringify([null, "/home/tester/.git"]) };
assert.equal(gi.info(homeSpace, homePanes)?.name, "dots", "the shown tab's repo comes first");
console.log("PASS: ^b g opens lazygit like GIT's click; without a repo GIT says \"not a repo\" and a toast says why; the space's repo is the shown tab's, else another tab's");

// ---- Follow (meta) ------------------------------------------------------------------
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
// Only meta follows; and off is off.
host.shared.set("ram.zoom", "space");
agentList[8].status = "blocked"; raw[8].status_ms = Date.now() + 9;
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0, "in the space level nothing follows");
host.shared.set("ram.zoom", "meta"); host.shared.set("ram.follow", false);
R(fmap, {}); await settle();
assert.equal(focusCalls().length, 0);
// ^b f: on, and into meta.
host.shared.set("ram.zoom", "space");
await send("follow");
assert.equal(host.shared.get("ram.follow"), true);
assert.equal(host.shared.get("ram.zoom"), "meta", "^b f outside meta turns it on and shows meta");
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
  const back = [{ name: "space.select", args: { id: "s3" } }, { name: "tab.select", args: { id: "tab3-1" } }];
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
show("s0", "tab0-0");
host.shared.set("ram.from", { s0: "tab0-0" });
host.shared.set("ram.zoom", "space"); host.calls = [];
console.log("PASS: follow (meta, its f under the sticks' +): shows the agent waiting longest, waits while yours needs you, moves on once answered, never undoes your own pick, and goes straight back to your tab after the last answer (unless it closed or you moved), without missing an agent that asks again; ^b f");

// ---- Hunk level -------------------------------------------------------------------
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
// RAM's review tab (labelled ram.hunk), last in its space: the hunk level.
spaces[0].tabs.push({ id: "tabNEW", name: "hunk diff", named: true, index: 3, active: false, settled: false, status: null });
panes.push({ pane: "pNEW", terminal: "tNEW", tab: "tabNEW", title: "hunk", status: null, focused: true, cwd: "/repo/api", program: { name: "hunk" } });
raw.push({ address: "tNEW", state: "live", created_ms: 9000, pid: 4242, labels: { "ram.hunk": "diff" } });
// hunk reports itself like an agent: it isn't one (not in any heap).
agentList.push({ address: "tNEW", pane: "pNEW", space: "s0", space_name: "api", tab: "tabNEW", tab_name: "hunk diff", tab_index: 3,
  status: "idle", title: "hunk", app: "hunk", program: { name: "Hunk" }, focused: false });
spaces[0].tabs.forEach(t => t.active = t.id === "tabNEW");
assert.equal(level(), "hunk");
host.calls = [];
R(map, {});
await settle();
assert.deepEqual(layoutCalls(), [{ name: "layout.resize", args: { id: "ram-map", px: 74 } },
  { name: "layout.resize", args: { id: "sidebar", px: 280 } }, { name: "layout.show", args: { id: "ram-peek" } },
  { name: "layout.hide", args: { id: "ram-rams" } }]);
assert.equal(host.shared.get("ram.from").s0, "tab0-0", "the review's tab isn't remembered as the work tab");
assert.deepEqual(host.shared.get("ram.hunk.last"), { s0: "tabNEW" }, "it's the space's last review");
const stripHunk = R(map, {});
assert(!withId(stripHunk, "tabchip-tabNEW"), "reviews stay out of the tab strip");
assert.deepEqual(textOf(withId(stripHunk, "ram-strip-space")), ["0x01", "api", "\u25c61"], "the space says it has one");
// The side column: HUNK, the open reviews, at the top (no session yet: RAM's label).
const hside = view({ role: "side" });
hside.size = { width: 280, height: 700 };
tree = R(hside, { role: "side" });
const sideIds = flatten(tree).map(idOf);
assert(sideIds.indexOf("ram-hunk") >= 0 && sideIds.indexOf("ram-hunk") < sideIds.indexOf("ram-stack"), "at the top, over the stack");
assert(textOf(withId(tree, "ram-hunk")).includes("HUNK  1"));
const words = n => textOf(n).filter(x => !x.endsWith(".svg"));  // without icons' file names
assert.deepEqual(words(withId(tree, "hunk-tNEW")), ["\u25c6", "diff", "api"]);
assert.deepEqual(textOf(withId(tree, "stack-s0")).slice(0, 3), ["0x01", "api", "\u25c61"], "the stack marks the space too");
assert(!sideIds.includes("heap-tNEW"), "hunk isn't in the heap");
// A short column fits in the hunk level too: HUNK on top, compact rows.
sweep("hunk");
// Its session registers: notes and its id show (the map copy polls hunk and shares it).
host.hunkSessions = [{ sessionId: "9ff4921d-337b-420c-bee1-f1ca7b1176ac", pid: 4242, cwd: "/repo/api", repoRoot: "/repo/api",
  title: "herdr working tree", fileCount: 3, snapshot: { state: { reviewNoteCount: 3, reviewNotes: [{ source: "user" }, { source: "user" }, { source: "agent" }] } } }];
host.execs = [];
host.timers.filter(tm => tm.ms === 1000).forEach(tm => tm.fn(cx));
await settle();
assert(host.execs.some(e => e.command === "hunk" && e.args.join(" ") === "session list --json"));
assert.deepEqual(host.shared.get("ram.hunk.sessions")?.map(x => [x.id.slice(0, 4), x.mine, x.agent]), [["9ff4", 2, 1]]);
tree = R(hside, { role: "side" });
const sessRow = withId(tree, "hunk-9ff4921d-337b-420c-bee1-f1ca7b1176ac");
assert.deepEqual(words(sessRow), ["\u25c6", "diff", "api", "\u270e2", "9ff4"], "your 2 notes, and the id /hunk takes");
assert.equal(op(sessRow, "tooltip")[0], "herdr working tree: 2 of your notes, 1 agent notes \u00b7 /hunk 9ff4 \u00b7 in api");
assert.deepEqual(op(sessRow, "bg"), ["#ffb54714"], "the one on screen is lit");
host.calls = [];
click(tree, "hunk-9ff4921d-337b-420c-bee1-f1ca7b1176ac");
assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s0" } }, { name: "tab.select", args: { id: "tabNEW" } }]);
// Its x (on hover) asks first: closing loses notes that weren't saved.
sessRow.handlers.on_hover(true, cx);
tree = R(hside, { role: "side" });
host.overlays = [];
click(tree, "hunkx-9ff4921d-337b-420c-bee1-f1ca7b1176ac");
assert.deepEqual(host.overlays.at(-1).props, { title: "Close hunk diff?", detail: "Its 3 notes go with it, unless saved first (/hunk save).",
  command: { name: "tab.close", args: { id: "tabNEW", confirmed: true } } });
// (hunk is asked again every 3 s while a review is open; here, at once.)
host.hunkSessions[0].snapshot.state = { reviewNoteCount: 0, reviewNotes: [] };
map.sessions.soon();
host.timers.filter(tm => tm.ms === 1000).forEach(tm => tm.fn(cx)); await settle();
assert.deepEqual(host.shared.get("ram.hunk.sessions").map(x => x.mine + x.agent), [0]);
tree = R(hside, { role: "side" }); host.calls = [];
click(tree, "hunkx-9ff4921d-337b-420c-bee1-f1ca7b1176ac");
assert.deepEqual(host.calls, [{ name: "tab.close", args: { id: "tabNEW" } }], "no notes: it just closes");
// In meta the main stick and the space's stick mark it as well (the review has no frame).
host.shared.set("ram.zoom", "meta");
assert(textOf(withId(AS(), "all-space-s0")).includes("\u25c61"));
const hr = RR();
assert(textOf(withId(hr, "head-s0")).includes("\u25c61") && !withId(hr, "frame-tabNEW"), "the stick: ◆1 by its name, no frame for the review");
host.shared.set("ram.zoom", "space");
// ^b r from the review goes back to your tab; from there, back to the review.
host.calls = [];
click(withId(R(map, {}), "ram-levels"), "ram-level-hunk");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-0" } }, "hunk again goes back (the review stays open)");
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-0");
host.calls = [];
await send("hunk");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tabNEW" } }, "^b r: the space's last review");
spaces[0].tabs.forEach(t => t.active = t.id === "tabNEW");
const peek = view({ role: "peek" });
assert.equal(host.timers.at(-1).ms, 1500);
host.timers.at(-1).fn(cx);
await settle();
tree = R(peek, { role: "peek" });
assert.deepEqual(host.hcs.at(-1), ["read", "t1"], "the peek strip reads the work tab's terminal");
assert(textOf(tree).includes("one") && textOf(tree).includes("two") && textOf(tree).includes("&1"), "its lines, without colors, under &1");
host.calls = [];
click(tree, "ram-peek");
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-0" } });
// hunk quits: its tab goes, and the window goes back to the work tab.
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
assert.equal(level(), "space", "lazygit isn't the hunk level");
R(map, {}); await settle();
tree = R(side, { role: "side" });
assert.deepEqual(textOf(withId(R(map, {}), "tabchip-tabLG")).filter(x => x === "lazygit"), ["lazygit"]);
assert.deepEqual(op(withId(tree, "ram-git"), "border_color"), ["#ffb547"], "GIT is lit while lazygit shows");
assert.equal(host.shared.get("ram.from").s0, "tab0-0", "lazygit's tab isn't remembered as the work tab");
spaces[0].tabs.splice(spaces[0].tabs.findIndex(t => t.id === "tabLG"), 1);
panes.splice(panes.findIndex(p => p.pane === "pLG"), 1);
spaces[0].tabs.forEach(t => t.active = t.id === "tab0-1");
host.calls = [];
R(map, {}); await settle();
assert(host.calls.some(c => c.name === "tab.select" && c.args.id === "tab0-0"), "back to the tab before lazygit");
console.log("PASS: hunk: menu, reviews in their own tabs (out of the strip, ◆n on the space), HUNK list with notes and ids, sessions matched to tabs; peek strip; quitting returns");

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
for (const role of [{}, { role: "side" }, { role: "peek" }, { role: "rams" }]) {
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
for (const file of ["mods/ram/main.js", "mods/ram/ui.js", "mods/ram/all.js", "mods/ram/hunk.js", "mods/ram/model.js", "mods/ram/git.js", "mods/ram/mod.json", "layouts/ram.json", "layouts/ram.svg", "themes/ram.json", `mods/${BAR}/main.js`]) {
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
assert(barText.includes("levels") && barText.includes("meta") && barText.includes("hunk") && barText.includes("r") && !barText.includes("rift"), barText);
assert(barText.includes("follow") && barText.includes("f") && barText.includes("diff") && barText.includes("d"), "f follow, d diff");
assert(!barText.includes("changes"), "the bar says diff, as the main stick does");
assert(barText.includes("^b") && !barText.some(x => /ctrl-b/.test(x)), `the bar writes the prefix as ^b: ${barText}`);
assert(barText.includes("send ^b"), "even the passthrough");
assert(barText.includes("git") && barText.includes("g") && barText.includes("lazygit"), "git: g lazygit");
assert(barText.indexOf("git") < barText.indexOf("levels"), "git before levels");
host.shared.set("layout", "traveler");
barText = textOf(bar.render(cx2));
assert(!barText.includes("levels") && !barText.includes("meta"), barText);
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
assert.deepEqual(host.calls.at(-1), { name: "tab.new", args: { space: "s0", name: "lazygit", folder: "/repo/api",
  argv: ["exec", "sh", "-c", 'hc label "$HC_TERMINAL_ID" ram.lazygit=1 >/dev/null 2>&1; exec lazygit'] } });
assert.deepEqual(host.closed, ["o9"], "then the bar closes");
host.focused = { space: "s0", tab: "tab0-0", pane: "p0", terminal: "t1", cwd: "/home/tester/notes" };
host.calls = [];
await prefixMod.lazygitHere();
assert.equal(host.calls.length, 0, "not a repo: nothing opens");
assert.deepEqual([host.notes.at(-1).title, host.notes.at(-1).body], ["Not a git repo", "~/notes isn't in a git repository, so lazygit has nothing to open."]);
raw.push({ address: "tLZ", state: "live", created_ms: 9900, labels: { "ram.lazygit": "1" } });
panes.push({ pane: "pLZ", terminal: "tLZ", tab: "tab0-1", title: "lazygit", status: null, focused: false, program: { name: "lazygit" } });
await prefixMod.lazygitHere();
assert.deepEqual(host.calls.at(-1), { name: "tab.select", args: { id: "tab0-1" } }, "one already open in the space: show it");
raw.pop(); panes.pop();
host.shared.set("layout", "ram"); host.calls = [];
const bar3 = new prefixMod.default(); bar3.init({}, cx2);
bar3.finish("lazygit", cx2);
assert.deepEqual(host.calls.at(-1), { name: "ram.git", args: {} }, "in RAM, RAM opens it (its own repo choice)");
host.focused = null;
console.log("PASS: the ^b bar (every layout) lists g lazygit (it works everywhere) and m, i, r under levels only while RAM shows");
// ^b w: navigate mode, as in the Herdr TUI. j/k through the spaces in the layout's own
// list (it marks the one you're on), Enter goes there; no picker.
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
  assert(textOf(withId(nt, "prefix-nav")).includes("move") && textOf(withId(nt, "prefix-nav")).includes("go"));
  assert(!textOf(nt).includes("then a key \u00b7 Esc cancels"), "one row: no hints");
  const path = [];
  for (const k of ["j", "down", "k", "up", "k", "j"]) { await press(nb, k); path.push(on()); }
  assert.deepEqual(path, ["s1", "s2", "s1", "s0", "s3", "s0"], "j/down next, k/up back, round the ends");
  assert.deepEqual([host.calls, host.closed], [[], []], "j and k only move the mark (no pane.go), and the bar stays");
  // Should a Herdr hand a bound key to on_key_down as well, it still moves once.
  keyDown(nb, "j"); await deliver(nb, "pane.go:down");
  assert.equal(on(), "s1", "one move, not two");
  await press(nb, "j");
  assert.deepEqual(textOf(withId(nb.render(cx2), "prefix-nav")).slice(0, 4), ["navigate", "ops", "@remote", "3 of 4"], "ops is on another machine: it says so");
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
  // Enter: that space.
  host.props = { overlay: "oN" }; host.calls = [];
  await press(nb, "enter");
  assert.deepEqual(host.calls, [{ name: "space.select", args: { id: "s2" } }]);
  assert.deepEqual(host.closed, ["oN"]);
  assert.equal(on(), null, "and nothing is marked any more");
  assert(!lastOp(must(R(side, { role: "side" }), "stack-s2"), "border_color"));
  // Esc (Herdr closes the popup; or on_key_down, should one get it) and any other key,
  // bound (x is pane.close, J pane.swap, w again) or not (q), leave things as they were.
  for (const k of ["escape", "escape-key", "x", "shift-j", "w", "q"]) {
    nb = bar(); await press(nb, "w"); await press(nb, "j");
    assert.equal(on(), "s1");
    if (k === "escape-key") keyDown(nb, "escape"); else await press(nb, k);
    assert.deepEqual([host.calls, on()], [[], null], `${k}: cancelled`);
    assert.deepEqual(host.closed, k === "escape" ? [] : ["oN"], `${k}: the bar goes`);
  }
  // Enter on the space you're in: nothing to do.
  nb = bar(); await press(nb, "w"); await press(nb, "enter");
  assert.deepEqual([host.calls, host.closed, on()], [[], ["oN"], null]);
  // A click outside the bar, or the bar going any other way, clears it too.
  nb = bar(); await press(nb, "w"); await press(nb, "j");
  withId(nb.render(cx2), "prefix-layer").handlers["on_mouse_down:left"]({}, cx2);
  assert.deepEqual([host.closed, on()], [["oN"], null]);
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
console.log("PASS: ^b w is navigate mode: j/k (they come as their keys.json actions) through the spaces, Enter goes, Esc or any other key cancels; RAM, Traveler and Night City mark the one it's on, the bar names it");
// Night City's footer writes its keys the same way.
if (await has("mods/night-city/main.js"))
  assert((await read("mods/night-city/main.js")).includes('shortcut(command).replace(/\\bctrl-/g, "^")'), "Night City shows ^b too");
delete globalThis.__ramFixture;
delete globalThis.localStorage;
