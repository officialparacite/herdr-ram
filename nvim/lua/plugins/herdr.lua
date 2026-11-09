-- Herdr colorschemes, drawn by aether.nvim (already installed):
--   herdr             Herdr's graphite theme, for the main layout
--   herdr-ram         the RAM layout's phosphor green and amber, transparent
-- The palettes live in lua/plugins/herdr/colors/. config/herdr_theme.lua
-- switches to a layout's own scheme while Herdr shows it, and back after.
return {
  {
    dir = vim.fn.stdpath("config") .. "/lua/plugins/herdr",
    name = "herdr-theme",
    lazy = true, -- lazy.nvim loads it on `:colorscheme herdr` (or any herdr-* scheme)
    dependencies = { "aether" },
    init = function()
      require("config.herdr_theme").setup()
    end,
  },
}
