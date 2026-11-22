# RAM

Work on many projects at once and see all of them on one screen. Each space is
one project (a repo with its agents and terminals), drawn as a stick of RAM. The
meta view lines every space up below your terminal, so one glance shows which
agents are working, which need you (in red), what's running and what changed in
each repo. Click a stick to jump to that space; the space view gives the one you
work in the room. Comes with lazygit, rg-fzf, hunk, a ctrl-b key bar and a
Neovim theme.

![RAM](preview.png)

**What you see:**

- **Theme `ram`:** background `#0a100d`, canvas `#060a08`, panels `#0b130f`
  and `#0e1712`, borders `#24402f`, text `#c8f7d3`, dim `#6f9a7e`. Amber
  `#ffb547` marks what is current (the space you're in, SP, a lit button),
  white `#ffffff` the bright BP, cyan `#6fe3d3` addresses and what finished
  while you weren't looking, green `#7dff9b` working, red `#ff5f6d` needs you,
  gold `#c9a24a` pins, purple `#b68cff` other machines. JetBrains Mono for
  terminals and panels. Every panel size is `N * U` with `U = 1.25`. No title
  bar; the macOS window buttons sit at 18, 18.
- **The strip, 74px, on top in both levels** (it drags the window): a line of
  small addresses (`0x0000`, `0x0400`, ...), then `0x05 name` for the space
  you're in (cyan address), its tabs as fixed 118x23 chips (`*1` the shown
  tab, `&2` the rest, `!n` when an agent there needs you; long names
  truncate), one square `+`, and on the right `^b`, two fixed 100x26 level
  buttons, `m meta SP▸` and `i space BP▸` (the key in amber, the name, the
  level's pointer: `SP▸` amber, `BP▸` white; the current level lit, meta's
  red and pulsing while SP is on an agent that needs you), and two 26x26
  squares, `b` (the side column) and `P` (the peek strip), lit while they
  show. The left 100 points stay clear of the macOS window buttons.
- **The side column** (block `sidebar`) is 390px in meta and 340px in the
  space level. Its edge drags (down to 240px) and each level keeps the width
  you leave it at.
- **meta:** the terminal on top (two thirds), under it every space as a stick
  (one third, block `ram-rams`). A stick: a header (address, name, `◆n` open
  reviews, `@machine`, `FAULT n`, a cyan boxed `+n` for agents and commands
  that finished unseen), `STACK ↓ n`, one frame per tab (its pointers' mark,
  `*n` where a pointer points or `&n`, an arrow, then a block per agent or
  running command with its light and name, sub-agents smaller), free space,
  the heap (one row per agent and running command: light, `&n`, name, what it
  does or a command's last output line, its state) over `HEAP ↑ n`, the git
  line (`branch ↑2 ↓1 ±3 ⌂`, or `✓`, and a `+` for a new tab), and gold pins.
  The pointers' marks have a column of their own: `SP▸` (amber, pulsing) on
  the one tab meta shows, across all the sticks; `BP▸` on each space's work
  tab, white in the space you work in and dim in the others; `RET▸` (dim
  amber) on follow's return address while it's away; two on one tab by their
  initials (`SB▸`, `BR▸`). Sticks share one width, 200x1.25, narrowing to
  128x1.25 before the row scrolls. Right of the last stick, three 30x1.25
  squares, one under the other: a dashed `+` (a new space), follow's `f` and
  `e`, each showing its `^b` key, amber while on; the space you're in has an
  amber outline, another machine's a dashed one. The side column is the
  **main stick** `0x00 @`: its STACK is every space with its changed files as
  a tree (letter, folder/name, `+added −removed`, an arrow folds a space, `+`
  makes a space), its HEAP every agent and command of every space (space name
  first), and its last line `@` with every repo's marks added up. `d diff`
  switches it to the diff view: the spaces with changes and their files, the
  picked file's diff, and a commit box for that file's repo. A small `w` box
  next to `d diff` wraps long diff lines to the stick (off: they scroll
  sideways). Under it `.rodata` (other machines, `Add a machine`, `+`) and
  Settings / Keys / Commands with their `^b` keys.
- **space:** the terminal fills the rest. The side column has STACK (every
  space from `0x01` down, a white `◂BP` on the one you work in, `@machine`,
  FAULT, `◆n`, `+n`, and on its label row `^b w`, a `/ rg-fzf` button drawn
  as meta's `d diff`, and `+` for a new space), HEAP (this space's agents and
  commands, the oldest at the bottom), `.rodata`, GIT (`repo · branch`,
  marks, changed files), HUNK, LANG and the keys row, which never gets cut
  off; lists that don't fit end in `+n more`.
- **The peek strip** (block `ram-peek`, space level only), under the
  terminal and as tall as the side column from the line over `.rodata` down,
  so its top is on that line: a box for SP's tab (`SP▸`, the space and tab,
  what runs there, its state, and as many of its last lines as fit; a red
  border while an agent there needs you), and under a review opened from the
  space level a box for where you came from (`↩`) on its left. No box repeats
  the tab you're on or another box; with nothing to show it hides.
- **HUNK** (space level, with a repo, between GIT and LANG): `HUNK` and how
  many (its `^b r` key where it fits) with a `+`, then one line per review
  RAM opened in this space: `◆` (amber for the one shown), what it shows,
  `✎n` notes, how long ago it opened (`now`, `5m`, `2h`, `3d`) and a hover
  `✕`. Other spaces' reviews aren't listed.
- **LANG** (space level, with a repo, under HUNK): a line `LANG`, `n
  languages` and an `ext` box; a 6x1.25 bar of segments as wide as each
  language's share of the bytes (at least 2 px, 1 px apart, GitHub's colors,
  the darkest lifted 45% toward white so they show on black); then the three
  biggest (a dot, the name, `90.9%`, `2 files`) and `+n more`. In a short
  column its rows give way first, then the whole section, while the stack and
  heap have room for three and two rows. A language opens a 500x420 dialog of
  its files (biggest first, their sizes; a click runs `tab.new` with `exec sh
  -c 'exec "${EDITOR:-vi}" "$1"' sh <path>` at the repo's top); `LANG` and `+n
  more` open the list of every language; `ext` the picker of the repo's data,
  prose and unknown types (a tick each, its extensions, files and size).
- **GIT's dialog** (520x340), for a folder that isn't a repo: `GIT` with the
  space and folder, "isn't in a git repository", a branch name field (its
  hint names git's default, from `git var GIT_DEFAULT_BRANCH`), `Create a repo
  here` and `Open a recent repo ▸` (lazygit's recent repos that still are
  repos, this folder left out), and git's own error when `git init` fails.
- **The terminal menu** (right-click on a terminal, mod `ram-menu`): Copy and
  Paste, then Herdr's own items (split right and down, zoom, where
  right-clicks go, back to the parent, close pane), each with its key.
- **The key bar:** `ctrl-b` opens a full-width bar on the bottom edge,
  `popover` background, 1px amber top border, a `^b` badge and "then a key ·
  Esc cancels", then the keys grouped as tabs, spaces, panes, agents, git,
  search, RAM (only while RAM shows) and app.

**How it behaves:**

- Agent states: working = green light (and a green dot runs along that tab's
  arrow); blocked = red light, a red heap row, `FAULT n` (or `!n`) on its
  stick and chip; done = cyan, a brighter block and heap row in meta and a
  cyan `+n` by its space; idle = dim. A running command is working until it
  ends, then done until you look at its tab. `SP▸` pulses and a faint scan
  line sweeps the sticks; every animation stops while the window isn't
  active.
- The two levels and their places: `^b m` shows meta at SP (again: the space
  level), `^b i` the space level at the bright BP. A level change shows that
  level's place, and nothing is taken for it until that has shown. SP is the
  tab meta shows: clicks in meta, `^b w` there and follow move it. A space's
  BP is the tab the space level shows in it: tab changes in the space level
  move it, and the space you're in there is the one you work in (its BP is
  the bright one). `^b I`, or a click on `SP▸`, moves the bright BP to SP's
  tab (from meta it shows there only with `e` on). A tool's tab (lazygit,
  rg-fzf, a review) is never a BP: when it closes, RAM goes back to where you
  were when it showed, in that level.
- Clicking a space, tab, frame, block or agent shows it: in meta that moves
  SP and you stay in meta; in the space level it moves the BP. A space alone
  (a stick's name, a STACK row) shows its BP tab. A running command's row or
  block peeks at its output (`terminal.peek`), over the tab you're on. A
  double-click renames a space or tab, a hover `✕` closes a tab, right-click
  opens Herdr's menu (RAM's own on a terminal), and spaces (same machine) and
  tabs drag to reorder, with a line where they land.
- follow (`^b f` or the `f` square, in both levels): when an agent newly
  needs you, SP goes to the one waiting longest; while SP's agent needs you
  the others wait; once it's answered, SP goes to the next; after the last,
  SP goes straight back to where it was before follow's first move (a dim
  `RET▸` marks it meanwhile), unless that tab closed or you moved SP
  yourself; an agent that asks again gets SP again at once. In meta the
  terminal shows SP; in the space level only SP moves (meta's button turns
  red, the peek strip shows it).
- `e` (`^b e` or its square, off by default): off, a tool opened from meta
  shows in meta's terminal (SP moves onto it and back when you quit it); on,
  the tools and `^b I` from meta go into the space level.
- More keys: `^b r` hunk (the space's last review for its repo, else the
  menu; on a review, back where you came from, and the review stays open),
  `^b d` the main stick's diff view (from the space level: meta with diff),
  `^b g` lazygit, `^b /` rg-fzf, `^b P` the peek strip off or on, `^b b` the
  side column, `^b C` the new-tab menu, `^b <` `>` move the tab, `^b {` `}`
  move the space.
- `^b w` navigate mode, each move shown at once: the bar shows one row
  (`navigate`, the space's name, `@machine`, `i of n`, `tab n` and its name,
  `i of n`); `j`/down and `k`/up the next and previous space, `h`/left and
  `l`/right that space's tabs (round the ends, settled tabs skipped), `H` `J`
  `K` `L` the pane that way (`pane.go`). Enter, any other key or a click
  outside the bar stays; Esc goes back to the space, tab and pane it started
  on (those still there). RAM outlines that space in cyan in every list of
  spaces, and shows each space at its BP.
- The commands in HEAP: a shell's terminal whose foreground program isn't the
  shell runs a command. It shows from the moment RAM sees it (Herdr's
  terminal list, read every second and on every change; quick ones flicker),
  as working with its last output line (`hc read`, every 2 s), and when it
  ends while its tab isn't on screen in an active window, as done with that
  line until you look at its tab or peek. Agents, sub-agents, RAM's tool tabs,
  programs that wait for you (editors, pagers, lazygit, top, ssh, tmux,
  database shells, fzf, hunk, watch) and a bare interpreter (a REPL) aren't
  commands. Commands never take part in follow, faults or `agent.next`.
- rg-fzf: the `/ rg-fzf` button or `^b /` opens it in a tab named
  `rg-fzf <folder>` at the space's repo (no repo: its folder), or shows the
  one open there. The tab runs `sh -c` with a short script: it labels its
  terminal `ram.rg=$PWD`, runs `out=$(rg-fzf)`, removes the label, closes the
  tab when nothing was printed and rg-fzf exited 0 (Esc), else prints the
  output and `exec`s the user's shell (`$SHELL -il`), so the tab carries on as
  a plain one. While labelled it's a tool's tab (the button lit, its chip
  cyan, never a BP), and when it closes RAM goes back to where you came from.
- lazygit: a GIT line, a stick's git line or `^b g` opens `lazygit <folder>`
  in a tab, one per repo, for the repo the space is named after (the repo top
  of its first terminal's folder; GIT, HUNK, LANG and the stick's git line use
  that one too); quitting it closes the tab and RAM goes back to where you
  came from. A folder that isn't a repo: GIT says "not a repo" and its dialog
  opens instead of lazygit's terminal questions; Create runs `git init` (with
  `--initial-branch=` when a name is typed) and then lazygit, and a recent
  repo opens lazygit there. In other layouts the key bar does the same at the
  focused terminal's repo.
- hunk: the menu offers `diff` and `diff --staged` (both `--watch`), `show`,
  `log`, `stash show` and `status`, with an optional ref. Each review is a tab
  labelled `ram.hunk=<what>`, moved to the end of the space's tabs and kept
  out of the strip and the sticks; a plain diff loads `<repo>/.hunk/notes.json`
  when there is one. HUNK's `✕` asks first when the review has notes.
- The keyboard: `^b h` from the terminal gives the side column the keyboard
  (Herdr's `pane.go` sends it `"focus"`): ↑↓ or `j` `k` move the outline,
  Enter does what a click does, `x` what a `✕` does, `r` renames, ← → fold
  the main stick's spaces, Esc goes back to the terminal (`pane.go right`).
  The strip, the sticks and the peek strip hand the keyboard straight back.
  In LANG's and GIT's dialogs ↑↓ choose, Enter opens, ← or Backspace go
  back, Esc closes.
- The terminal menu's Copy and Paste focus the right-clicked pane
  (`pane.focus`), run `terminal.copy` / `terminal.paste`, then close the menu.
- The diff view's commit box runs `git add -A` and `git commit -m` in the
  picked file's repo, and only when you press Commit.
- ⌘+ / ⌘− change the terminals' text size in settings.json (`font_size`, 1 a
  step, 8 to 32, as Settings does); RAM's panels keep their size.

**Built from:**

- `layouts/ram.json`: column `ram-root` (`titlebar: none`, theme `ram`,
  `terminal_menu: ram-menu`, background gradient `#08110c` to `#050806`, not
  resizable) with block `ram-map` (mod `ram`, 74px, `window_drag`) and row
  `ram-work` (resizable: its 10px gap is the drag handle) holding block
  `sidebar` (mod `ram`, role `side`, min 240) and column `ram-main`:
  `ram-terminals` (`tab: active`, weight 2, cards with a 1px `#24402f` border,
  amber on focus, `lone`), `ram-rams` (role `rams`, weight 1, min 168,
  hidden) and `ram-peek` (role `peek`, 180px until the side column sizes it,
  hidden). `ctrl-b b` toggles `sidebar`.
- `mods/ram/` is one mod in roles: none = the strip, which sizes the blocks
  for the level (`layout.resize`, `layout.show`/`hide`, the peek strip's
  height too), keeps the running commands (`ram.procs`) and follow's return
  address (`ram.ret`), and is the only copy with the command loop
  (`ram.meta|space|hunk|git|rg|follow|enter|bp|peek|changes|zoom|back` from
  `nextCommand()`); `side`; `rams`; `peek`; and the dialogs `hunk-menu`,
  `lang` and `git-init`. Its mod.json is `{"place": "none", "focusable":
  true}`, so `pane.go` can give a copy the keyboard (it gets `"focus"` from
  `nextCommand()`; the side column keeps it, the others hand it back).
  `main.js` draws the levels; `pointers.js` keeps SP, BP and the other places
  (shared state, since Herdr shows one tab per space); `procs.js` the running
  commands (`terminals()`: a shell whose foreground program isn't the shell;
  their last lines from `hc read`); `gitinit.js` GIT's dialog; `all.js` the
  main stick; `hunk.js` the reviews (it runs `hunk session list --json` every
  3 s while a review is open, else every 15 s); `git.js` branch and counts per
  space (`git status`, `git rev-parse`, `git diff --numstat`, again on
  `watchFolder` changes and every minute); `model.js` the agents and exit
  history; `ui.js` the colors and small parts; `langs.js` LANG: the language
  table (name, GitHub's color, kind, extensions, file names),
  `git ls-tree -r -l -z --full-tree HEAD` at the repo's top on its machine
  (again when the branch changes and every minute), the summary and the dialog
  (role `lang`, modes `list`, `files`, `ext`); `arrow.svg` the frames'
  arrow head.
- Shared state: `ram.zoom` (meta or not), `ram.sp` (SP: space, tab, pane),
  `ram.bp` (each space's BP tab), `ram.frame` (the space you work in),
  `ram.came` (where you were when a tool's tab showed), `ram.goto` (what the
  next level change shows), `ram.ret` (follow's return address),
  `ram.enter` (`e`), `ram.peek` (`P`), `ram.peek.h` (the peek strip's
  height), `ram.procs` (the running commands), `ram.side` (dragged widths),
  `ram.all.mode`, `ram.all.wrap`, `ram.follow`, `ram.opening`,
  `ram.tool.open` (what GIT's dialog picked), `ram.git.again` (a folder git
  init made a repo), `ram.hunk.*`, `ram.lang.include` (what else LANG counts:
  language names and `.ext`s), and `navigate.space` (`{id, at}`, set by the
  key bar).
- Commands: `tab.select`, `space.select`, `pane.focus`, `pane.go`,
  `tab.move`, `space.move`, `tab.close`, `tab.rename`, `space.rename`,
  `space.new`, `tab.new` (a language's file; GIT's dialog outside RAM),
  `agent.focus`, `terminal.peek`, `terminal.copy`, `terminal.paste`,
  `layout.resize`, `layout.show`, `layout.hide`, `layout.toggle`, `mod.open`
  (machine-add), `app.settings`, `app.help` and `app.palette` (Settings, Keys
  and Commands); `setAgentOrder()` on every render. lazygit, rg-fzf and hunk
  tabs are made with `herdr-app do tab.new --space --name --folder --argv
  '["exec", ...]'` (so quitting the program closes its tab), then labelled
  with `hc label` (rg-fzf's script labels its own). It also runs `hc machine
  ls --json` every 15 s, `hc ls --all --json`, `hc read` (the peek strip, and
  the running commands' last lines every 2 s), and for GIT's dialog `git var
  GIT_DEFAULT_BRANCH`, `lazygit --print-config-dir` (then it reads lazygit's
  `state.yml`) and, when you press Create, `git init`. No mod opens a network
  connection.
- `mods/ram-menu`: the terminals' right-click menu, named by the layout
  root's `terminal_menu`. Herdr opens it as a popup with `{tab: "pane",
  target: {pane, terminal}}` (its mod.json makes it 250x300). Copy and Paste
  run `pane.focus` on that pane (or terminal), then `terminal.copy` /
  `terminal.paste`, then close the menu, since those act on the focused
  terminal; the rest are Herdr's own menu items, each with its key.
- `mods/ram-prefix` + `keys.json` (the bar's name is `NAME` in its main.js and
  `BAR` in `mods/ram/ui.js`): `keys.json` holds only RAM's keys, merged into
  the person's. `global` binds `ctrl-b` → `mod.open:ram-prefix` and ⌘+/⌘− →
  `mod.open:ram-text-bigger` / `ram-text-smaller`. The keys after `ctrl-b`
  are the `mod:ram-prefix` section, each `ram-prefix.<command>[:<first
  argument>]`; they apply only while the bar is open. Herdr runs a bound key
  as that binding, so it reaches the bar's `nextCommand()` as its action and
  never its `on_key_down`. The bar runs it once and closes
  (`run(command, {<first arg name from commands()>: value})`, digits become
  numbers). Extras: `ram-prefix.passthrough` (`hc keys <terminal> ctrl+b`),
  `ram-prefix.worktree` (the shipped `worktree` dialog), `ram-prefix.lazygit`
  (`ram.git` in RAM, else a lazygit tab at the focused terminal's repo),
  `ram-prefix.rg` (`ram.rg` in RAM, else an rg-fzf tab at that repo or folder,
  with the same script as RAM's, `RG_TAB`), `ram-prefix.newmenu` (the new-tab
  menu), `ram-prefix.tab.left` / `tab.right` and
  `space.earlier` / `space.later` (`tab.move` / `space.move` one place) and
  `ram-prefix.navigate`, which maps each later action back to its key (`j` is
  `pane.go:down`). A folder that isn't a repo gets RAM's GIT dialog (mod
  `ram`, role `git-init`) from `ram-prefix.lazygit` too. In RAM,
  `space.next` / `space.prev` and navigate show a space at its BP (shared
  `ram.bp`). The bar's overlay is a frameless popup whose root is
  `w_full().h(4000).justify_end()`, so Herdr clips it to the window and the
  bar lands on the bottom edge.
- `mods/ram-text-bigger`, `mods/ram-text-smaller`: empty frameless windows
  that, on open, step `font_size` in settings.json (read, edit,
  `writeTextFile` with the old text, up to 3 tries; a file that doesn't parse
  is left alone) and close.
- `nvim/` (optional): described in README.md.

**Watch out:**

- Adding it: RAM runs `git` (status, diff) in the person's repos and, only
  when they press Commit or Create, `git add -A` and `git commit`, or
  `git init`; it also runs `hunk session list`, `hc` (`read` too, for the peek
  strip and the running commands) and `herdr-app do tab.new`, and reads
  lazygit's `state.yml`. Nothing reaches the network. lazygit and hunk need to
  be installed for `^b g` and the reviews, and rg-fzf (with rg, fzf, bat, jq)
  for `^b /`.
- The layout uses its own theme: copy `themes/ram.json` too.
- And its own terminal menu: copy `mods/ram-menu` (the layout's
  `terminal_menu`). Without it Herdr falls back to its own menu, with no Copy
  and Paste.
- Copy each mod folder next to `mods/` and move it in whole: Herdr docks a mod
  folder it sees without its `mod.json` into the layout on screen and rewrites
  that layout.
- Put the mods in before merging `keys.json`: Herdr drops a `<mod>.<command>`
  key whose mod folder isn't there when it loads the keys.
- The keys: `ctrl-b` stops reaching programs directly (a shell's back one
  character, less and vim's page up); `ctrl-b` `ctrl-b` sends it. ⌘+/⌘−
  replace Herdr's zoom keys with the terminals' text size (`ctrl-b +`/`_`
  still zoom); on Linux ⌘ is Super, which desktops often use. Ask before
  replacing either. If the person keeps their `ctrl-b`, bind another key to
  `mod.open:ram-prefix`; RAM shows whichever key opens the bar.
- The mod names are prefixed `ram-` so they don't meet another layout's. A
  rename has to change `NAME` in the bar's main.js, `BAR` in
  `mods/ram/ui.js` and every key name in `keys.json`, or the bar loses its
  keys.
- RAM draws in its own colors (`mods/ram/ui.js`), not the person's theme.
- `nvim/` is optional and only for LazyVim: ask first and never overwrite the
  person's files. An existing `herdr_theme.lua` gets `ram = "herdr-ram",` in its
  `BY_LAYOUT`; on Omarchy leave out `colorscheme.lua` and `aether.lua`.
- Never test by driving a window someone is using: `^b` keys act on the
  focused pane, tab and space, and RAM's own resizes move their columns.
  `tests/verify.mjs` checks the mods with a stand-in for Herdr instead.
- A key keys.json binds never reaches the focused mod's `on_key_down`; it
  arrives at `nextCommand()` as its action. Esc in a popup is Herdr's
  `overlay.close`, so the bar only gets `close()`.
- `on_size_change` reports screen points; `w()`/`h()` and layout px are
  design px, which the zoom setting scales. Divide by `settings().zoom`.
- Nothing may run past a stick's edge: every row is sized in JS to the
  stick's inner width (monospace text is 0.6 em a character). A frame's arrow
  shortens first (26 down to 12, x1.25), then its blocks narrow to three
  letters, then `+n` counts the rest; FAULT n turns into `!n`, then `@machine`
  goes; heap rows drop the state's word before the name truncates.
- Draw symbols that must line up (the arrow head is `arrow.svg`, centered with
  its line by flex): a glyph placed with absolute offsets sits off the line.
- Rows of a `v_virtual_list` can't take clicks; the main stick's tree is a
  plain scrolling list for that reason. Tooltips must be one line.
- A review's notes live only in the open hunk window, which is why `^b r`
  leaves it open; `exec` in a tab's argv makes quitting the program close the
  tab.
- `image()`/`svg()` paths are relative to the Herdr home: keep `mods/ram/...`.
  `herdr-app check` writes `gpui-kit.d.ts` and `jsconfig.json` into each mod;
  they are ignored here.
- Herdr shows one tab per space, so RAM keeps its pointers itself (`ram.sp`,
  `ram.bp`, shared) and shows a level's own place again when the level
  changes; until that place shows, nothing is taken for it.
- A command shows once Herdr's terminal list says a shell's foreground
  program isn't the shell, so one that starts and ends between two lists
  never shows. Herdr keeps "done, unseen" only for agents; RAM keeps the
  commands' own (`ram.procs`).
- `terminal.copy` and `terminal.paste` act on the focused terminal, and a
  right-click doesn't focus it: the menu focuses the right-clicked pane first.
- Tested on Herdr 0.1.15 on macOS. Re-check after app updates.

**Done when:**

- Every mod passes `herdr-app check`, `node tests/verify.mjs` passes, and
  `herdr-app status` shows no errors with `ram` shown.
- `^b m` shows every space as a stick under the terminal with the main stick
  beside it, `SP▸` on the tab meta shows and a `BP▸` on each stick; `^b i`
  gives the terminal the room at the bright BP, with STACK, HEAP, `.rodata`,
  GIT, HUNK and LANG beside it; switching back and forth, each level comes
  back to its own tab.
- In the space level the peek strip shows SP's tab, its top on the line over
  `.rodata`, with as many of its last lines as fit; `P` hides it.
- With follow on, an agent that asks takes SP there and `RET▸` marks where it
  was; answering takes SP back.
- `^b r` in a repo opens the review menu, then a review in a tab of its own,
  listed under HUNK; `^b r` again goes back.
- `^b g` opens lazygit at the space's repo and quitting it closes its tab; in
  a folder that isn't a repo it opens GIT's dialog, and Create makes it a repo
  and opens lazygit there.
- A command run in a shell tab shows in HEAP while it runs; one that ends in
  another tab stays Done, with a cyan `+1` on its space, until you look at
  that tab.
- In the space level, LANG (under GIT and HUNK) shows the repo's languages
  with the same shares GitHub would give its committed code; `ext` and a tick
  on YAML makes YAML count; a language's file opens in `$EDITOR`.
- `^b /` opens rg-fzf at the space's repo; Enter leaves the picked files
  printed in a shell tab, and Esc closes the tab.
- `^b w`, `j` shows the next space at once, with a cyan outline on it while
  navigating; `l` shows its next tab, `L` the pane to the right, and Esc goes
  back to where you started.
- `^b h` gives the side column the keyboard: Enter on a row does what its
  click does, and Esc goes back to the terminal.
- Right-clicking a terminal offers Copy and Paste.
- ⌘+ makes the terminals' text bigger and leaves RAM's panels as they were.
- With the nvim files installed, nvim in a RAM pane loads `herdr-ram` with no
  `Normal` background, and the usual colorscheme in any other layout.
