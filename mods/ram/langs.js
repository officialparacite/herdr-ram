// LANG: a repo's languages, as GitHub's Languages section shows them, for the
// space level (under GIT, main.js langRegion). The files are git's: HEAD's tree,
// each path and its size (`git ls-tree -r -l`), so what's committed counts. A
// file's language comes from its extension (or its name: Makefile, Dockerfile),
// and a language's share is of the bytes counted. Programming and markup count,
// as on GitHub; data (JSON, YAML...), prose (Markdown, text) and extensions the
// table doesn't know count once you include them in the picker (LangView's ext
// mode), kept as shared "ram.lang.include" for every repo. Vendored and
// generated files (node_modules/, vendor/, lock files, *.min.js) never count.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, props, closeOverlay, theme, shared, setShared, run, settings } from "herdr";
import { AMBER, CYAN, U, stop } from "./ui.js";
import { READ } from "./git.js";

export const INCLUDE = "ram.lang.include";
// Kinds that count without being included, as on GitHub.
const COUNTED = new Set(["programming", "markup"]);
// GitHub's grey, for text and extensions the table doesn't know.
const GREY = "#8b949e";
const P = "programming", M = "markup", D = "data", T = "prose";
// [name, GitHub's color, kind, extensions, file names]
const TABLE = [
  ["JavaScript", "#f1e05a", P, ["js", "mjs", "cjs", "jsx"]],
  ["TypeScript", "#3178c6", P, ["ts", "mts", "cts"]],
  ["TSX", "#3178c6", P, ["tsx"]],
  ["Python", "#3572A5", P, ["py", "pyi", "pyw"]],
  ["Rust", "#dea584", P, ["rs"]],
  ["Go", "#00ADD8", P, ["go"]],
  ["Java", "#b07219", P, ["java"]],
  ["Kotlin", "#A97BFF", P, ["kt", "kts"]],
  ["Swift", "#F05138", P, ["swift"]],
  ["C", "#555555", P, ["c", "h"]],
  ["C++", "#f34b7d", P, ["cpp", "cc", "cxx", "c++", "hpp", "hh", "hxx", "h++"]],
  ["C#", "#178600", P, ["cs"]],
  ["Objective-C", "#438eff", P, ["m"]],
  ["Objective-C++", "#6866fb", P, ["mm"]],
  ["Ruby", "#701516", P, ["rb", "rake", "gemspec"], ["Rakefile", "Gemfile"]],
  ["PHP", "#4F5D95", P, ["php"]],
  ["Shell", "#89e051", P, ["sh", "bash", "zsh", "ksh"], [".bashrc", ".bash_profile", ".profile", ".zshrc", ".zprofile", ".zshenv"]],
  ["fish", "#4aae47", P, ["fish"]],
  ["PowerShell", "#012456", P, ["ps1", "psm1", "psd1"]],
  ["Batchfile", "#C1F12E", P, ["bat", "cmd"]],
  ["Lua", "#000080", P, ["lua"]],
  ["Vim Script", "#199f4b", P, ["vim"], [".vimrc"]],
  ["Emacs Lisp", "#c065db", P, ["el"]],
  ["Perl", "#0298c3", P, ["pl", "pm"]],
  ["R", "#198CE7", P, ["r"]],
  ["Julia", "#a270ba", P, ["jl"]],
  ["Dart", "#00B4AB", P, ["dart"]],
  ["Scala", "#c22d40", P, ["scala", "sc"]],
  ["Groovy", "#4298b8", P, ["groovy", "gradle"]],
  ["Haskell", "#5e5086", P, ["hs"]],
  ["Elixir", "#6e4a7e", P, ["ex", "exs"]],
  ["Erlang", "#B83998", P, ["erl", "hrl"]],
  ["Clojure", "#db5855", P, ["clj", "cljs", "cljc"]],
  ["OCaml", "#ef7a08", P, ["ml", "mli"]],
  ["F#", "#b845fc", P, ["fs", "fsi", "fsx"]],
  ["Elm", "#60B5CC", P, ["elm"]],
  ["Zig", "#ec915c", P, ["zig"]],
  ["Nix", "#7e7eff", P, ["nix"]],
  ["HCL", "#844FBA", P, ["tf", "tfvars", "hcl"]],
  ["Assembly", "#6E4C13", P, ["asm", "s"]],
  ["Common Lisp", "#3fb68b", P, ["lisp", "lsp"]],
  ["Scheme", "#1e4aec", P, ["scm"]],
  ["Racket", "#3c5caa", P, ["rkt"]],
  ["Makefile", "#427819", P, ["mk", "mak"], ["Makefile", "makefile", "GNUmakefile"]],
  ["Dockerfile", "#384d54", P, ["dockerfile"], ["Dockerfile", "Containerfile"]],
  ["CMake", "#DA3434", P, ["cmake"], ["CMakeLists.txt"]],
  ["HTML", "#e34c26", M, ["html", "htm", "xhtml"]],
  ["CSS", "#663399", M, ["css"]],
  ["SCSS", "#c6538c", M, ["scss"]],
  ["Sass", "#a53b70", M, ["sass"]],
  ["Less", "#1d365d", M, ["less"]],
  ["Vue", "#41b883", M, ["vue"]],
  ["Svelte", "#ff3e00", M, ["svelte"]],
  ["Astro", "#ff5a03", M, ["astro"]],
  ["TeX", "#3D6117", M, ["tex"]],
  ["Jupyter Notebook", "#DA5B0B", M, ["ipynb"]],
  ["JSON", "#292929", D, ["json", "jsonc", "json5"]],
  ["YAML", "#cb171e", D, ["yml", "yaml"]],
  ["TOML", "#9c4221", D, ["toml"]],
  ["XML", "#0060ac", D, ["xml", "plist"]],
  ["SQL", "#e38c00", D, ["sql"]],
  ["GraphQL", "#e10098", D, ["graphql", "gql"]],
  ["CSV", "#237346", D, ["csv", "tsv"]],
  ["INI", "#d1dbe0", D, ["ini", "cfg"]],
  ["SVG", "#ff9900", D, ["svg"]],
  ["Markdown", "#083fa1", T, ["md", "markdown"]],
  ["reStructuredText", "#141414", T, ["rst"]],
  ["AsciiDoc", "#73a0c5", T, ["adoc", "asciidoc"]],
  ["Text", GREY, T, ["txt"]],
];
const BY_EXT = new Map(), BY_NAME = new Map();
for (const [name, color, kind, exts, names = []] of TABLE) {
  const lang = { name, color, kind, exts };
  for (const e of exts) BY_EXT.set(e, lang);
  for (const n of names) BY_NAME.set(n, lang);
}
const VENDORED = new RegExp([
  "(^|/)(node_modules|vendor|third_party|bower_components)/",
  "\\.min\\.(js|css)$",
  "(^|/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb|Cargo\\.lock|go\\.sum|poetry\\.lock|Pipfile\\.lock|Gemfile\\.lock|composer\\.lock|flake\\.lock)$",
].join("|"));

export const base = path => path.split("/").pop();
// A file's language ({ name, color, kind, exts }), and the key the picker
// includes it by: the language's name, else its extension (".foo"), else
// "(no extension)".
export function langOf(path) {
  const name = base(path);
  if (BY_NAME.has(name)) return { lang: BY_NAME.get(name), key: BY_NAME.get(name).name };
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (ext && BY_EXT.has(ext)) return { lang: BY_EXT.get(ext), key: BY_EXT.get(ext).name };
  return { lang: null, key: ext ? `.${ext}` : "(no extension)" };
}

// `git ls-tree -r -l -z` (NUL after each "mode type object size<TAB>path"): the
// files (blobs, not symlinks or submodules) with their sizes, vendored ones out.
export function parseTree(text) {
  const out = [];
  for (const entry of String(text ?? "").split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const [mode, type, , size] = entry.slice(0, tab).trim().split(/\s+/);
    const path = entry.slice(tab + 1);
    if (type !== "blob" || mode === "120000" || VENDORED.test(path)) continue;
    out.push({ path, size: Number(size) || 0, ...langOf(path) });
  }
  return out;
}

// Whether a file counts: its language is programming or markup, or you included it.
const counts = (f, include) => f.lang ? COUNTED.has(f.lang.kind) || include.has(f.key) : include.has(f.key);

// The languages that count, biggest first: { name, color, bytes, count, share, files }.
export function summarize(files, include = []) {
  const inc = new Set(include), by = new Map();
  for (const f of files ?? []) {
    if (!counts(f, inc)) continue;
    const l = by.get(f.key) ?? { name: f.key, color: f.lang?.color ?? GREY, bytes: 0, count: 0, files: [] };
    l.bytes += f.size; l.count += 1; l.files.push(f);
    by.set(f.key, l);
  }
  const list = [...by.values()].sort((a, b) => b.bytes - a.bytes || b.count - a.count || a.name.localeCompare(b.name));
  const total = list.reduce((n, l) => n + l.bytes, 0);
  for (const l of list) {
    l.share = total ? l.bytes / total : 1 / list.length;
    l.files.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
  }
  return list;
}

// What the picker offers: the repo's data, prose and unknown file types, each
// with its files, its bytes and whether it's included. Biggest first.
export function others(files, include = []) {
  const inc = new Set(include), by = new Map();
  for (const f of files ?? []) {
    if (f.lang && COUNTED.has(f.lang.kind)) continue;
    const o = by.get(f.key) ?? { key: f.key, exts: f.lang ? f.lang.exts.map(e => "." + e) : [], color: f.lang?.color ?? GREY,
      bytes: 0, count: 0, on: inc.has(f.key) };
    o.bytes += f.size; o.count += 1;
    by.set(f.key, o);
  }
  return [...by.values()].sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));
}

// A language's share, as GitHub writes it: one decimal, "<0.1%" for less.
export const shareText = s => s > 0 && s < 0.0005 ? "<0.1%" : `${(Math.round(s * 1000) / 10).toFixed(1)}%`;
export const filesText = n => `${n} ${n === 1 ? "file" : "files"}`;
export function sizeText(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
// GitHub's colors are picked for a white page: the darkest ones (JSON, Lua,
// PowerShell) are lifted toward white here so they show on RAM's black.
export function visible(hex) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255];
  const lum = c.map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  if (0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] >= 0.05) return hex;
  return "#" + c.map(x => Math.round(x + (255 - x) * 0.45).toString(16).padStart(2, "0")).join("");
}

// The bar: one segment per language, as wide as its share of WIDTH (at least
// 2 px so a small one still shows), 1 px apart, rounded ends.
export function langBar(id, list, width, height) {
  const gap = 1, room = Math.max(0, width - gap * Math.max(0, list.length - 1));
  return h_flex().id(id).w(width).h(height).flex_none().gap(gap).rounded(height / 2).overflow_hidden()
    .children(list.map((l, k) => div().id(`${id}-${k}`).h_full().flex_none().w(Math.max(2, l.share * room)).bg(visible(l.color))));
}

// A repo's files, read for the side column (main.js ticks it every 250 ms, it
// reads only when it must): a repo is read once, again when its branch changes,
// and every minute (a commit), on the space's machine.
export class LangData {
  constructor() { this.repos = new Map(); }
  key(machine, top) { return JSON.stringify([machine ?? null, top]); }
  // The files, or undefined until the first read is back.
  files(machine, top) { return this.repos.get(this.key(machine, top))?.files; }
  tick(machine, top, branch, cx) {
    if (!top) return;
    const k = this.key(machine, top), have = this.repos.get(k);
    if (have && (have.busy || (Date.now() - have.at < 60000 && have.branch === branch))) return;
    const entry = have ?? { files: undefined };
    entry.busy = true;
    this.repos.set(k, entry);
    cx.spawn(async cx => {
      entry.files = await readFiles(machine, top) ?? entry.files ?? [];
      Object.assign(entry, { at: Date.now(), branch, busy: false });
      cx.notify();
    });
  }
}
// HEAD's files at TOP (none before the first commit); null if git can't be asked.
export async function readFiles(machine, top) {
  try {
    const r = await exec("git", [...READ, "ls-tree", "-r", "-l", "-z", "--full-tree", "HEAD"], { cwd: top, on: machine ?? null });
    return r.code === 0 ? parseTree(r.stdout) : [];
  } catch (_) { return null; }
}

// A file in $EDITOR (vi without one), in a new tab at the repo's top, named
// after the file; quitting the editor closes the tab.
export function openFile(space, top, path) {
  run("tab.new", { space, folder: top, name: base(path), argv: ["exec", "sh", "-c", 'exec "${EDITOR:-vi}" "$1"', "sh", path] });
}

// The dialog (role "lang"; props: space, top, machine, repo, mode, lang). Modes:
// "list" every language that counts (a click shows its files), "files" one
// language's files (a click opens one in $EDITOR), "ext" the picker of what else
// counts. It reads the repo itself.
export class LangView {
  constructor(cx) {
    const p = props() ?? {};
    this.mode = p.mode ?? "list";
    this.lang = p.lang ?? null;
    this.files = undefined;
    this.width = 480;
    cx.spawn(async cx => {
      this.files = await readFiles(p.machine, p.top) ?? [];
      cx.notify();
    });
  }

  render() {
    const t = theme(), p = props() ?? {}, include = shared(INCLUDE) ?? [];
    const close = () => { if (p.overlay) closeOverlay(p.overlay); };
    const box = v_flex().id("lang-view").size_full().p(10 * U).gap(6 * U).bg(t.popover)
      .on_size_change((size, cx) => {
        const w = size.width / (settings()?.zoom || 1);
        if (Math.abs(w - this.width) >= 1) { this.width = w; cx.notify(); }
      });
    const head = (title, extra) => h_flex().h(20 * U).flex_none().gap(6 * U).items_center()
      .child(div().flex_none().text_size(12.5 * U).font_semibold().text_color(CYAN).child(title))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).text_color(t.muted).child(extra));
    const hint = text => div().flex_none().text_size(10.5 * U).text_color(t.dim).child(text);
    const scroll = rows => v_flex().id("lang-rows").flex_1().min_h(0).overflow_y_scrollbar().children(rows);
    if (this.files === undefined) return box.child(head("LANG", p.repo ?? "")).child(hint("Reading the repo\u2026"));
    if (this.mode === "ext") return this.picker(box, head, hint, scroll, include);
    const list = summarize(this.files, include);
    const one = this.mode === "files" ? list.find(l => l.name === this.lang) : null;
    if (one) {
      const rows = one.files.map((f, k) => h_flex().id(`lang-file-${k}`).h(20 * U).flex_none().px(6 * U).gap(8 * U).items_center()
        .rounded(2).cursor_pointer().hover(st => st.bg(t.hover))
        .tooltip(`${f.path}: open in $EDITOR`)
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); openFile(p.space, p.top, f.path); close(); })
        .child(div().flex_1().min_w(0).truncate().text_size(11.5 * U).text_color(t.foreground).child(f.path))
        .child(div().flex_none().text_size(10.5 * U).text_color(t.dim).child(sizeText(f.size))));
      return box
        .child(head(one.name, `${shareText(one.share)} \u00b7 ${filesText(one.count)} \u00b7 ${p.repo ?? ""}`)
          .child(div().id("lang-back").flex_none().px(6 * U).h(16 * U).flex().items_center().rounded(2).border(1).border_color(t.input)
            .text_size(10.5 * U).text_color(t.muted).cursor_pointer().hover(st => st.bg(t.hover).text_color(AMBER))
            .tooltip("Every language").on_mouse_down("left", stop)
            .on_click((_e, cx) => { cx.stop_propagation(); this.mode = "list"; cx.notify(); }).child("\u2190 all")))
        .child(scroll(rows))
        .child(hint("Click a file: it opens in $EDITOR in a new tab \u00b7 Esc close"));
    }
    const rows = list.map((l, k) => h_flex().id(`lang-row-${k}`).h(22 * U).flex_none().px(6 * U).gap(8 * U).items_center()
      .rounded(2).cursor_pointer().hover(st => st.bg(t.hover))
      .tooltip(`${l.name}: its ${filesText(l.count)}`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.mode = "files"; this.lang = l.name; cx.notify(); })
      .child(div().size(8 * U).flex_none().rounded_full().bg(visible(l.color)))
      .child(div().flex_1().min_w(0).truncate().text_size(12 * U).font_semibold().text_color(t.foreground).child(l.name))
      .child(div().w(52 * U).flex_none().text_size(11 * U).text_color(t.muted).child(shareText(l.share)))
      .child(div().w(64 * U).flex_none().text_size(10.5 * U).text_color(t.dim).child(filesText(l.count))));
    return box
      .child(head("LANG", `${p.repo ?? ""} \u00b7 by size`))
      .when(list.length > 0, el => el.child(langBar("lang-view-bar", list, Math.max(40, this.width - 20 * U), 8 * U)))
      .child(list.length ? scroll(rows) : hint("No code here yet: include more file types with ext"))
      .child(hint("Click a language for its files \u00b7 Esc close"));
  }

  // ext: the repo's data, prose and unknown file types; a click includes one in
  // every repo's LANG, or leaves it out again.
  picker(box, head, hint, scroll, include) {
    const t = theme(), list = others(this.files, include);
    const toggle = key => {
      const now = new Set(shared(INCLUDE) ?? []);
      if (now.has(key)) now.delete(key); else now.add(key);
      setShared(INCLUDE, [...now].sort());
    };
    const rows = list.map((o, k) => h_flex().id(`lang-ext-${k}`).h(22 * U).flex_none().px(6 * U).gap(8 * U).items_center()
      .rounded(2).cursor_pointer().hover(st => st.bg(t.hover))
      .tooltip(o.on ? `${o.key} counts: click to leave it out` : `Count ${o.key} too`)
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); toggle(o.key); cx.notify(); })
      .child(div().size(12 * U).flex_none().flex().items_center().justify_center().rounded(2).border(1)
        .border_color(o.on ? AMBER : t.input).when(o.on, el => el.bg(AMBER + "1f"))
        .text_size(10 * U).text_color(AMBER).child(o.on ? "\u2713" : ""))
      .child(div().size(8 * U).flex_none().rounded_full().bg(visible(o.color)))
      .child(div().flex_none().text_size(12 * U).font_semibold().text_color(o.on ? AMBER : t.foreground).child(o.key))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5 * U).text_color(t.dim).child(o.exts.join(" ")))
      .child(div().w(64 * U).flex_none().text_size(10.5 * U).text_color(t.dim).child(filesText(o.count)))
      .child(div().w(56 * U).flex_none().text_size(10.5 * U).text_color(t.dim).child(sizeText(o.bytes))));
    return box
      .child(head("LANG", "what else counts, in every repo"))
      .child(list.length ? scroll(rows) : hint("Everything in this repo counts already"))
      .child(hint("Programming and markup always count, as on GitHub \u00b7 Esc close"));
  }
}
