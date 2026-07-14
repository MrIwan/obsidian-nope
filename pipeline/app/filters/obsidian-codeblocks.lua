-- Code fence dispatch, runs after obsidian-transclude (embeds expanded) and
-- strip-unsupported (emoji already removed from fence text before it turns raw):
-- ```latex passes through unchanged, identifiers declared via nope-blocks become
-- generic environments with key:value macros, everything else stays a code fence.

local declared = {}

-- Escape LaTeX specials so a forwarded value can be typeset safely (mirrors obsidian-transclude).
local function meta_escape(s)
  return (s:gsub("([&%%$#_{}])", "\\%1"))
end

-- Collect declared identifiers from merged metadata (_base.yml < branding < doc); exact match, no case folding.
local function collect_declared(meta)
  local v = meta["nope-blocks"]
  if not v then return end
  local items = (v.t == "MetaList") and v or { v }
  for _, item in ipairs(items) do
    local id = pandoc.utils.stringify(item)
    if id ~= "" then declared[id] = true end
  end
end

-- key: value body → \nope<key> macros scoped around \begin{<id>}, same access pattern as frontmatter forwarding.
local function render_command_block(id, text)
  local defs = {}
  local lineno = 0
  for line in (text .. "\n"):gmatch("(.-)\r?\n") do
    lineno = lineno + 1
    if line:match("%S") then
      local k, v = line:match("^([%w][%w%-_]*)%s*:%s*(.*)$")
      if not k then
        error("[obsidian-codeblocks] Block '" .. id .. "': Zeile " .. lineno
          .. " ist kein 'key: value'-Paar: \"" .. line .. "\"")
      end
      v = v:gsub("%s+$", ""):gsub("^([\"'])(.-)%1$", "%2")
      defs[#defs + 1] = "\\expandafter\\def\\csname nope" .. k
        .. "\\endcsname{" .. meta_escape(v) .. "}"
    end
  end
  local parts = { "\\begingroup" }
  for _, d in ipairs(defs) do parts[#parts + 1] = d end
  parts[#parts + 1] = "\\begin{" .. id .. "}"
  parts[#parts + 1] = "\\end{" .. id .. "}"
  parts[#parts + 1] = "\\endgroup"
  return pandoc.RawBlock("latex", table.concat(parts, "\n"))
end

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
