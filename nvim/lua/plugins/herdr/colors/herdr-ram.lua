-- Herdr RAM palette (themes/ram.json in ~/.config/herdr-app): phosphor green
-- on near-black, amber for the current thing, cyan and red for state.
-- Used while Herdr shows the RAM layout (see config/herdr_theme.lua).

-- true: no editor background, so the pane's dark green shows through like it
-- does behind the shell. false: solid background.
local transparent = true

local c = {
  bg = "#0a100d", -- background
  dark_bg = "#060a08", -- canvas
  darker_bg = "#060a08",
  lighter_bg = "#18291f", -- raised (cursorline)
  selection = "#1f3d2c",
  muted = "#5f8a70", -- comments (ansi8 is too dark to read)
  dark_fg = "#6f9a7e", -- dim text
  fg = "#c8f7d3",
  light_fg = "#effff3", -- ansi15
  bright_fg = "#effff3",

  red = "#ff5f6d",
  yellow = "#ffcf7a",
  orange = "#ffb547", -- amber, the layout's accent
  green = "#7dff9b",
  cyan = "#6fe3d3",
  blue = "#6fb7ff",
  purple = "#d38cff",
  brown = "#9fc7aa",

  bright_red = "#ff8a94",
  bright_yellow = "#ffcf7a",
  bright_green = "#a8ffbd",
  bright_cyan = "#9ff1e5",
  bright_blue = "#9ccfff",
  bright_purple = "#e5b3ff",

  accent = "#ffb547",
  cursor = "#ffb547",
}
c.magenta = c.purple
c.bright_magenta = c.bright_purple
c.foreground = c.fg
c.background = c.bg
c.selection_background = c.selection
c.selection_foreground = c.light_fg

require("aether").load({
  name = "herdr-ram",
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
