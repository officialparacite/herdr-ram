-- Herdr Night City palette (themes/night-city.json in ~/.config/herdr-app).
-- Used while Herdr shows the Night City layout (see config/herdr_theme.lua).

-- true: no editor background, so the pane's navy shows through like it does
-- behind the shell. false: solid navy.
local transparent = true

local c = {
  bg = "#10192b", -- background
  dark_bg = "#080e20", -- canvas
  darker_bg = "#080e20",
  lighter_bg = "#263653", -- raised (cursorline)
  selection = "#3b5079",
  muted = "#72829f", -- ansi8 (comments)
  dark_fg = "#899bbd", -- dim text
  fg = "#e2e8f6",
  light_fg = "#f0f4ff", -- ansi15
  bright_fg = "#f0f4ff",

  red = "#f5848d",
  yellow = "#e6c786",
  orange = "#f1cf83", -- warm window glow
  green = "#a1d8bf",
  cyan = "#91ccd4",
  blue = "#8eafe1",
  purple = "#c4ace5",
  brown = "#b1bfd9",

  bright_red = "#ff9ba5",
  bright_yellow = "#f8dda4",
  bright_green = "#c5efd9",
  bright_cyan = "#b9e9ed",
  bright_blue = "#b3cefa",
  bright_purple = "#dfc8fc",

  accent = "#d7c889", -- warm gold
  cursor = "#f1d790",
}
c.magenta = c.purple
c.bright_magenta = c.bright_purple
c.foreground = c.fg
c.background = c.bg
c.selection_background = c.selection
c.selection_foreground = c.light_fg

require("aether").load({
  name = "herdr-night-city",
  colors = c,
  transparent = transparent,
  styles = transparent and { sidebars = "transparent", floats = "transparent" } or nil,
  -- Plugin windows (snacks explorer/pickers, noice's `:` box, which-key,
  -- telescope, status/tab/win bars) paint their own background; clear it.
  -- Menus (Pmenu, blink) stay solid to read.
  on_highlights = function(hl)
    if not transparent then
      return
    end
    local extra = {
      WhichKeyFloat = true, WhichKeyBorder = true, MsgSeparator = true,
      TelescopePromptNormal = true, TelescopePromptBorder = true,
      StatusLine = true, StatusLineNC = true, StatusLineTerm = true, StatusLineTermNC = true,
      WinBar = true, WinBarNC = true, TabLine = true, TabLineFill = true,
      NeoTreeTabActive = true, NeoTreeTabSeparatorActive = true,
    }
    for name, spec in pairs(hl) do
      if type(spec) == "table" and spec.bg and (extra[name] or (
        name:match("^Snacks") or name:match("^Noice") or name:match("^Float")
        or name == "NormalFloat" or name == "NormalSB" or name == "MsgArea"
      ) and not name:match("Cursor") and not name:match("Match") and not name:match("Sel")) then
        spec.bg = "NONE"
      end
    end
  end,
})
