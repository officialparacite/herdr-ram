-- Herdr graphite palette (read from the running Herdr app's theme()).
-- orange and brown have no graphite equivalent; they are picked to sit
-- between graphite's yellow and red.
local c = {
  bg = "#17191d", -- background
  dark_bg = "#131518", -- canvas (sidebars, floats)
  darker_bg = "#101114", -- chrome
  lighter_bg = "#25272b", -- popover (cursorline)
  selection = "#394454",
  muted = "#818793", -- ansi8 (comments)
  dark_fg = "#98999b", -- muted text
  fg = "#d2d4d9", -- terminal foreground
  light_fg = "#eeeeef", -- foreground
  bright_fg = "#f0f0f2", -- ansi15

  red = "#dc8c95",
  yellow = "#d8be87",
  orange = "#e2a67e",
  green = "#a6bd91",
  cyan = "#8cbdc3",
  blue = "#96b2d7",
  purple = "#b5a2ce",
  brown = "#b39b74",

  bright_red = "#f0a5ad",
  bright_yellow = "#ead2a1",
  bright_green = "#bad5a2",
  bright_cyan = "#a4d5db",
  bright_blue = "#b0cbef",
  bright_purple = "#cbb7e6",

  accent = "#96b2d7",
  cursor = "#d2d4d9",
}
c.magenta = c.purple
c.bright_magenta = c.bright_purple
c.foreground = c.fg
c.background = c.bg
c.selection_background = c.selection
c.selection_foreground = c.light_fg

require("aether").load({ name = "herdr", colors = c })
