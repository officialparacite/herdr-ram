-- lualine theme for `:colorscheme herdr-night-city`: no bar background, so the
-- pane's navy shows through; only the mode pill keeps its color.
local c = {
  fg = "#e2e8f6",
  muted = "#72829f",
  dark = "#10192b",
  gold = "#d7c889",
  green = "#a1d8bf",
  warm = "#f1cf83",
  purple = "#dfc8fc",
  red = "#ff9ba5",
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
  command = mode(c.warm),
  visual = mode(c.purple),
  replace = mode(c.red),
  terminal = mode(c.green),
  inactive = {
    a = { bg = none, fg = c.muted },
    b = { bg = none, fg = c.muted },
    c = { bg = none, fg = c.muted },
  },
}
