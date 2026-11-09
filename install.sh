#!/usr/bin/env bash
# Installs this branch (private: the owner's exact setup) into a Herdr home.
#
#   ./install.sh               the layout, theme, mods and keys
#   ./install.sh --nvim        and the Neovim theme files (LazyVim)
#   ./install.sh --no-switch   don't switch the window to RAM afterwards
#
# keys.json REPLACES the home's keymap: no keybind of the old one is kept.
# Everything it replaces is moved to <home>/.backup-ram-<time>/ first (Neovim
# files to <file>.bak-<time>). HERDR_APP_HOME picks another home.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
nvim_dir=${XDG_CONFIG_HOME:-$HOME/.config}/nvim
stamp=$(date +%Y%m%d%H%M%S)
backup="$home/.backup-ram-$stamp"
mods=(ram prefix text-bigger text-smaller)
want_nvim=0 switch=1
for arg in "$@"; do
  case $arg in
    --nvim) want_nvim=1 ;;
    --no-switch) switch=0 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install.sh: unknown option $arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
keep() {  # put an existing file or folder in the backup (folders move out of the way)
  [ -e "$home/$1" ] || return 0
  mkdir -p "$backup/$(dirname "$1")"
  if [ -d "$home/$1" ]; then mv "$home/$1" "$backup/$1"; else cp -p "$home/$1" "$backup/$1"; fi
}

command -v herdr-app >/dev/null || { echo "install.sh: herdr-app isn't on PATH" >&2; exit 1; }
mkdir -p "$home/layouts" "$home/themes" "$home/mods"

for f in layouts/ram.json layouts/ram.svg themes/ram.json; do
  keep "$f"
  cp "$here/$f" "$home/$f"
done

# Each mod is copied next to mods/ first and then moved in whole: Herdr docks a
# mod folder it sees without its mod.json into the layout on screen.
incoming="$home/.incoming-ram-$stamp"
mkdir -p "$incoming"
for m in "${mods[@]}"; do
  cp -R "$here/mods/$m" "$incoming/$m"
  rm -f "$incoming/$m/gpui-kit.d.ts" "$incoming/$m/herdr.d.ts" "$incoming/$m/jsconfig.json"
  keep "mods/$m"
  mv "$incoming/$m" "$home/mods/$m"
done
rmdir "$incoming"

# The keys last: Herdr drops a <mod>.<command> key whose mod folder isn't there
# yet when it loads keys.json.
keep keys.json
cp "$here/keys.json" "$home/keys.json"
# Only macOS needs ctrl-[ sent as Escape (zsh's vi mode); leave it out elsewhere.
if [ "$(uname -s)" != Darwin ] && command -v python3 >/dev/null; then
  python3 - "$home/keys.json" <<'EOF'
import json, sys
path = sys.argv[1]
keys = json.load(open(path))
keys.get("terminal", {}).pop("ctrl-[", None)
open(path, "w").write(json.dumps(keys, indent=2, ensure_ascii=True) + "\n")
EOF
fi

failed=0
for m in "${mods[@]}"; do
  if out=$(herdr-app check "$home/mods/$m" 2>&1); then
    say "check passed: mods/$m"
  else
    failed=1
    say "check FAILED: mods/$m"
    printf '%s\n' "$out" | grep -v 'Bootstrap failed\|Try re-running' | tail -5
  fi
done

if [ "$want_nvim" = 1 ]; then
  if [ ! -f "$nvim_dir/lua/config/lazy.lua" ]; then
    say "Neovim: $nvim_dir isn't a LazyVim config; its files weren't copied."
  else
    omarchy=0; [ -d "$HOME/.local/share/omarchy" ] && omarchy=1
    (cd "$here/nvim" && find . -type f -name '*.lua') | while read -r f; do
      f=${f#./}
      # Omarchy's own theme brings aether and the usual colorscheme.
      if [ "$omarchy" = 1 ] && { [ "$f" = lua/plugins/colorscheme.lua ] || [ "$f" = lua/plugins/aether.lua ]; }; then continue; fi
      dst="$nvim_dir/$f"
      if [ -f "$dst" ] && ! cmp -s "$here/nvim/$f" "$dst"; then mv "$dst" "$dst.bak-$stamp"; fi
      mkdir -p "$(dirname "$dst")"
      cp "$here/nvim/$f" "$dst"
    done
    say "Neovim: theme files copied to $nvim_dir (changed ones kept as *.bak-$stamp)."
  fi
fi

if [ -d "$backup" ]; then say "Replaced files are in $backup"; fi
if [ "$failed" = 1 ]; then say "A mod failed its check: not switching."; exit 1; fi
if [ "$switch" = 1 ] && herdr-app status >/dev/null 2>&1; then
  herdr-app do layout.switch '{"name":"ram"}' >/dev/null && say "Switched the window to RAM."
else
  say "Switch to it with: herdr-app do layout.switch '{\"name\":\"ram\"}'  (or ctrl-b then space)"
fi
