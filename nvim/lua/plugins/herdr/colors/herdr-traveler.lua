-- Herdr Traveler palette (themes/traveler-dusk.json in ~/.config/herdr-app).
-- Use with the Traveler layout: `:colorscheme herdr-traveler`.
-- `:colorscheme herdr` goes back to the graphite one for the main layout.

-- true: no editor background, so Traveler's map shows through like it does
-- behind the shell. false: solid indigo, easier to read.
local transparent = true

local c = {
  bg = "#0e1426", -- background
  dark_bg = "#0a0f1e", -- canvas (sidebars, floats)
  darker_bg = "#0a0f1e",
  lighter_bg = "#232c4c", -- raised (cursorline)
  selection = "#2c3658",
  muted = "#6f7691", -- ansi8 (comments)
  dark_fg = "#a89f8a", -- dim text
  fg = "#e8dcc0", -- parchment
  light_fg = "#f6eeda", -- ansi15
  bright_fg = "#f6eeda",

  red = "#e0705a",
  yellow = "#e3c67e",
  orange = "#d9772f", -- ember
  green = "#9bbf7a",
  cyan = "#6fb8ad",
  blue = "#7fa6d9",
  purple = "#b58ad0",
  brown = "#b8ad93",

  bright_red = "#ef8a73",
  bright_yellow = "#e3c67e",
  bright_green = "#b1d191",
  bright_cyan = "#8ccfc4",
  bright_blue = "#9cbdea",
  bright_purple = "#c9a3e0",

  accent = "#c9a961", -- antique gold
  cursor = "#d9772f",
}
c.magenta = c.purple
c.bright_magenta = c.bright_purple
c.foreground = c.fg
c.background = c.bg
c.selection_background = c.selection
c.selection_foreground = c.light_fg

require("aether").load({
  name = "herdr-traveler",
  colors = c,
  transparent = transparent,
  styles = transparent and { sidebars = "transparent", floats = "transparent" } or nil,
  -- Plugin windows (snacks explorer/pickers, noice's `:` box) paint their own
  -- background; clear it so the map shows through those too.
  on_highlights = function(hl)
    if not transparent then
      return
    end
    -- Window backgrounds other plugins paint (which-key, telescope, render-markdown
    -- code blocks, status/tab/win bars). Menus (Pmenu, blink) stay solid to read.
    local extra = {
      WhichKeyFloat = true, WhichKeyBorder = true, MsgSeparator = true,
      TelescopePromptNormal = true, TelescopePromptBorder = true,
      StatusLine = true, StatusLineNC = true, StatusLineTerm = true, StatusLineTermNC = true,
      WinBar = true, WinBarNC = true, TabLine = true, TabLineFill = true,
      RenderMarkdownCode = true, RenderMarkdownCodeBorder = true, RenderMarkdownCodeInline = true,
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
