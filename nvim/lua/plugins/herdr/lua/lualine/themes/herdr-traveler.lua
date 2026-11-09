-- lualine theme for `:colorscheme herdr-traveler` (lualine's theme = "auto"
-- picks the file named after the colorscheme). The bar has no background so
-- Traveler's map shows through; only the mode pill keeps its color.
local c = {
  fg = "#e8dcc0",
  muted = "#6f7691",
  dark = "#0e1426",
  gold = "#c9a961",
  green = "#9bbf7a",
  ember = "#d9772f",
  purple = "#c9a3e0",
  red = "#ef8a73",
}
local none = "NONE"

local function mode(color)
  return {
    a = { bg = color, fg = c.dark, gui = "bold" },
    b = { bg = none, fg = color },
    c = { bg = none, fg = c.fg },
    x = { bg = none, fg = c.fg },
    y = { bg = none, fg = color },
    z = { bg = color, fg = c.dark, gui = "bold" },
  }
end

return {
  normal = mode(c.gold),
  insert = mode(c.green),
  command = mode(c.ember),
  visual = mode(c.purple),
  replace = mode(c.red),
  terminal = mode(c.green),
  inactive = {
    a = { bg = none, fg = c.muted },
    b = { bg = none, fg = c.muted },
    c = { bg = none, fg = c.muted },
  },
}
