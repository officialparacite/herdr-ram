-- lualine theme for `:colorscheme herdr-ram`: no bar background, so the
-- pane's dark green shows through; only the mode pill keeps its color.
local c = {
  fg = "#c8f7d3",
  muted = "#5f8a70",
  dark = "#0a100d",
  amber = "#ffb547",
  green = "#7dff9b",
  cyan = "#6fe3d3",
  purple = "#e5b3ff",
  red = "#ff8a94",
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
  normal = mode(c.amber),
  insert = mode(c.green),
  command = mode(c.cyan),
  visual = mode(c.purple),
  replace = mode(c.red),
  terminal = mode(c.green),
  inactive = {
    a = { bg = none, fg = c.muted },
    b = { bg = none, fg = c.muted },
    c = { bg = none, fg = c.muted },
  },
}
