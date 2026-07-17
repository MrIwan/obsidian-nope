--- Code fence dispatch. Runs after obsidian-transclude (embeds expanded) and
-- strip-unsupported (emoji removed before a fence turns raw). A ```latex fence
-- passes through unchanged, an identifier declared in nope-blocks becomes a
-- generic environment with \nope<key> macros, everything else stays a fence.
-- @module obsidian-codeblocks

local declared = {}

-- Escape LaTeX specials so a forwarded value can be typeset safely (mirrors obsidian-transclude).
local function meta_escape(s)
  return (s:gsub("([&%%$#_{}])", "\\%1"))
end

-- Collect declared identifiers from merged metadata (_base.yml < branding < doc); exact match, no case folding.
--- Read nope-blocks from the merged doc meta into a set of declared identifiers.
-- @treturn table set of identifier strings
local function collect_declared(meta)
  local v = meta["nope-blocks"]
  if not v then return end
  local items = (v.t == "MetaList") and v or { v }
  for _, item in ipairs(items) do
    local id = pandoc.utils.stringify(item)
    if id ~= "" then declared[id] = true end
  end
end

-- Body grammar (YAML-lite, compatible with Fantasy-Statblock-style blocks):
--   key: value          → \nope<key>; brackets of inline lists [a, b] are stripped
--   key:                → opens a list, items follow
--   - subkey: value     → item N of that list → \nope<key><N>-<subkey>
--   - value             → bare item N → \nope<key><N>
--   <indented> subkey: value (inside an item) → \nope<key><N>-<subkey>
--   <indented> text     → continuation, appended to the previous value
-- Macros are scoped around \begin{<id>}, same access pattern as frontmatter forwarding.
--- Render a declared fence body (YAML-lite) into a RawBlock: \nope<key> macros
-- wrapped in \begin{id}...\end{id}. An unparsable line is a hard export error.
-- @tparam string id @tparam string text @treturn table RawBlock
local function render_command_block(id, text)
  local order, values = {}, {}
  local function fail(lineno, line)
    error("[obsidian-codeblocks] Block '" .. id .. "': Zeile " .. lineno
      .. " ist weder 'key: value' noch Listen-Item noch Fortsetzung: \"" .. line .. "\"")
  end
  local function set_macro(name, value)
    value = value:gsub("%s+$", ""):gsub("^([\"'])(.-)%1$", "%2")
    if values[name] == nil then order[#order + 1] = name end
    values[name] = value
  end

  local last          -- last defined macro, target for continuation lines
  local list_key      -- active list key (key: with empty value)
  local item_n = 0
  local lineno = 0
  for line in (text .. "\n"):gmatch("(.-)\r?\n") do
    lineno = lineno + 1
    if line:match("%S") then
      local k, v = line:match("^([%w][%w%-_]*)%s*:%s*(.*)$")
      if k then
        list_key, item_n = nil, 0
        if v == "" then
          list_key = k
        else
          set_macro(k, v:match("^%[(.*)%]$") or v)
          last = k
        end
      else
        local item = line:match("^%s*%-%s+(.*)$")
        if item then
          if not list_key then fail(lineno, line) end
          item_n = item_n + 1
          local sk, sv = item:match("^([%w][%w%-_]*)%s*:%s*(.*)$")
          if sk then
            last = list_key .. item_n .. "-" .. sk
            set_macro(last, sv)
          else
            last = list_key .. item_n
            set_macro(last, item)
          end
        else
          local sk, sv = line:match("^%s+([%w][%w%-_]*)%s*:%s*(.*)$")
          if sk and list_key and item_n > 0 then
            last = list_key .. item_n .. "-" .. sk
            set_macro(last, sv)
          elseif last then
            values[last] = values[last] .. " " .. line:gsub("^%s+", ""):gsub("%s+$", "")
          else
            fail(lineno, line)
          end
        end
      end
    end
  end

  local parts = { "\\begingroup" }
  for _, name in ipairs(order) do
    parts[#parts + 1] = "\\expandafter\\def\\csname nope" .. name
      .. "\\endcsname{" .. meta_escape(values[name]) .. "}"
  end
  parts[#parts + 1] = "\\begin{" .. id .. "}"
  parts[#parts + 1] = "\\end{" .. id .. "}"
  parts[#parts + 1] = "\\endgroup"
  return pandoc.RawBlock("latex", table.concat(parts, "\n"))
end

--- Dispatch a code block: latex passthrough, declared environment or untouched fence.
-- @treturn table|nil replacement block, or nil to leave the fence as is
local function dispatch(el)
  local id = el.classes[1]
  if not id then return nil end
  if id == "latex" then
    return pandoc.RawBlock("latex", el.text)
  end
  if declared[id] then
    return render_command_block(id, el.text)
  end
  return nil
end

-- Meta must be read before blocks are visited, hence two traversals.
return {
  { Meta = collect_declared },
  { CodeBlock = dispatch },
}
