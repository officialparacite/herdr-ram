-- Neovim follows the Herdr layout on screen: each layout below has its own
-- colorscheme; any other layout uses the usual one (the colorscheme LazyVim
-- set: "herdr" on the Mac, Omarchy's theme on Omarchy).
-- Only inside a Herdr terminal (HC_TERMINAL_ID set) with herdr-app on PATH.
-- Set up from lua/plugins/herdr.lua.
local M = {}

local BY_LAYOUT = {
  traveler = "herdr-traveler",
  ["night-city"] = "herdr-night-city",
  ram = "herdr-ram",
}
local OWN = {}
for _, scheme in pairs(BY_LAYOUT) do
  OWN[scheme] = true
end

-- Omarchy makes its themes transparent with this file, so it has to run again
-- after going back to the Omarchy theme. It doesn't exist elsewhere.
local omarchy_transparency = vim.fn.stdpath("config") .. "/plugin/after/transparency.lua"

local function layout_of(out)
  return out and out:match('"layout"%s*:%s*"([^"]+)"')
end

local function apply(layout)
  local current = vim.g.colors_name
  local want = BY_LAYOUT[layout]
  if want then
    if current ~= want then
      if not OWN[current] then
        M.usual = current
      end
      vim.cmd.colorscheme(want)
    end
  elseif OWN[current] and M.usual then
    vim.cmd.colorscheme(M.usual)
    if vim.fn.filereadable(omarchy_transparency) == 1 then
      vim.cmd.source(omarchy_transparency)
    end
  end
end

function M.setup()
  if not vim.env.HC_TERMINAL_ID or vim.fn.executable("herdr-app") == 0 then
    return
  end
  local group = vim.api.nvim_create_augroup("herdr_theme", { clear = true })
  -- At startup, ask once and wait (about 20 ms) so the first screen is right.
  -- nested: so lazy.nvim can load the theme and plugins see the change.
  vim.api.nvim_create_autocmd("VimEnter", {
    group = group,
    once = true,
    nested = true,
    callback = function()
      local ok, res = pcall(function()
        return vim.system({ "herdr-app", "status" }, { text = true }):wait(500)
      end)
      apply(layout_of(ok and res and res.stdout))
    end,
  })
  -- After a layout switch, check again when Neovim gets focus back.
  vim.api.nvim_create_autocmd("FocusGained", {
    group = group,
    callback = function()
      vim.system({ "herdr-app", "status" }, { text = true }, function(res)
        local layout = layout_of(res.stdout)
        vim.schedule(function()
          apply(layout)
        end)
      end)
    end,
  })
end

return M
