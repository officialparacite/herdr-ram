# RAM

A Herdr layout for working on many projects at once. Each space is one project
(a repo with its agents and terminals), drawn as a stick of RAM, and all of them
fit on one screen. You see which agents are working, which need you and what
changed in each repo without opening anything.

![RAM's meta level](preview.png)

## Three levels

Press `ctrl-b` and then the level's key, or click its button on the strip at
the top.

- **meta** (`^b m`), above: every space as a stick below your terminal. A stick
  shows the space's tabs, its agents (green working, red needs you) and its git
  branch. The `@` stick on the left lists every space with the files changed in
  each. Click a stick to jump to that space.
- **space** (`^b i`): the space you work in, with its stack of tabs, heap of
  agents, other machines and git.

  ![RAM's space level](screenshots/space.png)

- **hunk** (`^b r`): the space's diff, reviewed in [hunk](https://hunk.dev),
  with the tab you came from as a strip below.

  ![RAM's hunk level](screenshots/hunk.png)

lazygit and hunk open in tabs of their own, the `ctrl-b` key bar works in every
layout, and an optional Neovim theme follows the layout.

## What's in it

| Path | What it is |
|---|---|
| `layouts/ram.json`, `layouts/ram.svg` | the layout, and the picture Settings shows for it |
| `themes/ram.json` | phosphor green on near-black, amber for the current thing |
| `mods/ram/` | the layout's one mod: the strip, the side column, the sticks, hunk |
| `mods/ram-prefix/` | the `ctrl-b` key bar, in every layout (with `^b w` navigate mode and `^b g` lazygit) |
| `mods/ram-text-bigger/`, `mods/ram-text-smaller/` | ⌘+ and ⌘−: the terminals' text a size bigger or smaller |
| `keys.json` | only the keys RAM needs; they go next to yours |
| `nvim/` | optional: the `herdr-ram` colorscheme and the switch that follows the layout (LazyVim) |
| `tests/` | `verify.mjs`, checks that need no Herdr window, and `mutate.py` |
| `preview.png`, `screenshots/` | pictures of the meta, space and hunk levels (the gallery shows `preview.png`) |
| `RECIPE.md` | the brief to build RAM from scratch; your agent reads it when it adds RAM |

## Needs

- The [Herdr app](https://herdr.dev) 0.1.14 or later, with its herdr-core.
  Tested on 0.1.14 on macOS.
- git. [lazygit](https://github.com/jesseduffield/lazygit) for `^b g` and the GIT
  lines, [hunk](https://hunk.dev) for the hunk level: `brew install lazygit hunk`.
- Optional: Neovim with LazyVim for the theme.

## Install

In a Herdr terminal, ask your agent:

> Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/officialparacite/herdr-ram

It reads every file first, tells you what RAM runs (git, hunk, `hc`), adds the
layout and its mods next to yours, and merges RAM's keys into your
`keys.json`, asking before it replaces a key you already use. Your own layout
and keys stay as they are; `ctrl-shift-l`, or `ctrl-b` then `space`, switches
between layouts.

What the keys take over, so you can say no to any of them:

- `ctrl-b` opens the key bar. Programs no longer get it directly (it moves back
  a character in a shell, a page up in less and vim); `ctrl-b` `ctrl-b` sends it
  to them.
- ⌘+ (`cmd-=`, `cmd-+`) and ⌘− (`cmd--`) change the terminals' text size
  instead of zooming the whole window; `ctrl-b +` and `ctrl-b _` still zoom. On
  Linux ⌘ is the Super key, which many desktops use themselves.
- The keys after `ctrl-b` only apply while the bar is open, so they never
  clash with yours.

### By hand

From a clone of this repo. The mods go in before the keys: Herdr drops a key
whose mod isn't there yet when it loads `keys.json`. Each mod folder is copied
next to `mods/` and then moved in whole, because Herdr docks a mod folder it
sees without its `mod.json` into the layout on screen.

```sh
H=~/.config/herdr-app
cp layouts/ram.json layouts/ram.svg "$H/layouts/"
cp themes/ram.json "$H/themes/"
mkdir -p "$H/.incoming"
for m in ram ram-prefix ram-text-bigger ram-text-smaller; do
  cp -R "mods/$m" "$H/.incoming/" && mv "$H/.incoming/$m" "$H/mods/$m"
done
rmdir "$H/.incoming"
for m in ram ram-prefix ram-text-bigger ram-text-smaller; do herdr-app check "$H/mods/$m"; done
# Merge RAM's keys into yours; a key you already use keeps yours (it says which).
cp "$H/keys.json" "$H/keys.json.bak-$(date +%Y%m%d%H%M%S)"
python3 - "$H/keys.json" keys.json <<'EOF'
import json, sys
mine_path, ours_path = sys.argv[1], sys.argv[2]
mine = json.load(open(mine_path))
for section, keys in json.load(open(ours_path)).items():
    have = mine.setdefault(section, {})
    for key, action in keys.items():
        if key in have and have[key] != action:
            print(f"kept yours: {section} {key} = {have[key]} (RAM's: {action})")
        else:
            have[key] = action
open(mine_path, "w").write(json.dumps(mine, indent=2, ensure_ascii=True) + "\n")
EOF
herdr-app do layout.switch '{"name":"ram"}'
```

If it keeps your `ctrl-b`, open the bar with a key of your own:
`"<key>": "mod.open:ram-prefix"` in your `global` section. RAM shows whichever
key opens it.

## The levels

| Level | The terminal | The side column | Under the terminal |
|---|---|---|---|
| meta (`^b m`) | on top | the main stick `0x00 @`: every space's changed files and every agent, `d diff` for diffs and a commit box | every space as a stick: its tabs (frames), agents (heap), git line |
| space (`^b i`) | the most room | STACK (every space), HEAP (this space's agents), `.rodata` (other machines), GIT | nothing |
| hunk (`^b r`) | the review | the open reviews | the tab you came from |

The strip on top shows the space you're in, its tabs and the level buttons in
every level. In meta, clicks only select (the terminal shows it, you stay in
meta), `^b f` or the `f` under the sticks' `+` (follow) shows each agent that
needs you and then takes you back to your tab, and `^b d` switches the main
stick between memory and diff.

## Keys

Press `ctrl-b`, let go, then one key. A bar along the bottom of the window lists
them; Esc, any other key or a click closes it.

| Area | Keys after `ctrl-b` |
|---|---|
| Tabs | `c` new · `n` / `p` next / previous · `1`…`9` go to · `T` rename · `X` close |
| Spaces | `w` navigate (`j` / `k` or the arrows, Enter goes) · `N` new · `(` / `)` previous / next · `W` rename · `D` close (asks first) · `G` new worktree |
| Panes | `h` `j` `k` `l` focus · `H` `J` `K` `L` swap · `v` split right · `-` split down · `x` close · `z` zoom |
| Agents | `a` / `A` next / previous |
| Git | `g` lazygit at the repo you're in |
| Levels (RAM) | `m` meta · `i` space · `r` hunk · `f` follow (meta) · `d` diff (meta's main stick) |
| App | `:` palette · `?` all keys · `s` settings · `b` sidebar · `space` next layout · `+` / `_` / `0` zoom in / out / reset · `ctrl-b` sends `ctrl-b` to the program |

`^b w` marks the space you're in; `j` and `k` move the mark (round the ends),
Enter goes there, Esc leaves things as they were. RAM outlines the marked space
in cyan.

Every key is in `keys.json` (`mod:ram-prefix` holds the keys after `ctrl-b`)
and shows in Herdr's keybinds screen, where you can change them.

## lazygit and hunk

- `^b g`, or a click on a GIT line, opens lazygit in a tab of its own at the
  space's repo (the shown tab's folder, else another tab's). Quitting lazygit
  closes the tab and takes you back. In other layouts `^b g` opens it at the
  focused terminal's repo.
- `^b r`, or the `r hunk` button, opens the space's last review, else a menu:
  `hunk diff` and `diff --staged` (live, `--watch`), `show`, `log`,
  `stash show`, `status`, with an optional ref. Each review is a tab of its own
  (labelled `ram.hunk`, kept out of the strip) and a plain diff loads the repo's
  `.hunk/notes.json`. `^b r` again goes back and leaves the review open, so an
  agent can read your notes with `hunk session`.

## Neovim (optional, LazyVim + aether.nvim)

`nvim/` holds the files for `~/.config/nvim`:

| File | What it does |
|---|---|
| `lua/plugins/herdr.lua` | registers the local theme folder and starts the layout switch |
| `lua/plugins/herdr/colors/herdr.lua` | `herdr`: Herdr's graphite colors, for the `main` layout |
| `lua/plugins/herdr/colors/herdr-ram.lua` | `herdr-ram`: RAM's colors, transparent so the pane shows through (`local transparent = false` for solid) |
| `lua/plugins/herdr/lua/lualine/themes/herdr-ram.lua` | the status bar for `herdr-ram` |
| `lua/config/herdr_theme.lua` | asks `herdr-app status` which layout is shown: `herdr-ram` in RAM, the usual colorscheme otherwise; checks again when nvim gets focus |
| `lua/plugins/colorscheme.lua` | makes `herdr` the usual colorscheme (plain LazyVim only) |
| `lua/plugins/aether.lua` | aether.nvim (v3), which draws both schemes (plain LazyVim only) |

Copy them to the same paths under `~/.config/nvim`, keeping any file of yours
with the same name. On Omarchy, skip `colorscheme.lua` and `aether.lua`. If you
already have `herdr_theme.lua` from another Herdr layout, add
`ram = "herdr-ram",` to its `BY_LAYOUT` instead.

## Tests

```sh
node tests/verify.mjs       # Node 22+
```

They load this repo's mods with a stand-in for Herdr and check what they draw
and run; no window, terminal or network is touched. They read the keys from
this repo's `keys.json`, so a home with keys of its own shows other hints than
they expect. `tests/mutate.py` breaks the code in a copy, one change at a
time, to show the checks notice.

## Removing

```sh
H=~/.config/herdr-app
herdr-app do layout.switch '{"name":"main"}'
rm -rf "$H"/mods/ram "$H"/mods/ram-prefix "$H"/mods/ram-text-bigger "$H"/mods/ram-text-smaller
rm -rf "$H"/data/ram "$H"/data/ram-prefix "$H"/data/ram-text-bigger "$H"/data/ram-text-smaller
rm -f "$H"/layouts/ram.json "$H"/layouts/ram.svg "$H"/layouts/.state/ram.json "$H"/themes/ram.json
```

Then take RAM's keys out of your `keys.json`: the `mod:ram-prefix` section,
and in `global` the keys bound to `mod.open:ram-prefix`,
`mod.open:ram-text-bigger` and `mod.open:ram-text-smaller`.

## License

Apache 2.0, see [LICENSE](LICENSE). [NOTICE](NOTICE) lists the parts that come
from Night City (MIT) and Traveler (Apache 2.0).
