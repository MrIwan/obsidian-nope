-- Collect glossary entries from linked .md files and replace links with \gls{}.
-- Template must load `glossaries` and call \makeglossaries.
-- Template can check `has-glossary` to conditionally print glossaries.

local entries = {}

local function find_md(notename)
  if not notename:match("%.%w+$") then notename = notename .. ".md" end
  for _, path in ipairs(PANDOC_STATE.resource_path or {"."}) do
    local full = path .. "/" .. notename
    local f = io.open(full, "rb")
    if f then f:close(); return full end
  end
end

local function read_frontmatter(path)
  local f = io.open(path, "rb"); if not f then return nil end
  local content = f:read("*all"); f:close()
  local fm = content:match("^%-%-%-\r?\n(.-)\r?\n%-%-%-")
  if not fm then return nil end
  local result = {}
  for line in fm:gmatch("[^\r\n]+") do
    local k, v = line:match("^([%w%-_]+)%s*:%s*(.+)$")
    if k and v then
      result[k] = v:gsub("^%s*[\"']?(.-)[\"']?%s*$", "%1")
    end
  end
  return result
end

local function tex_escape(s)
  return s:gsub("([&%%$#_{}])", "\\%1")
end

function Link(el)
  local target = (el.target or ""):gsub("%.md$", "")
  if target == "" then return nil end
  local path = find_md(target); if not path then return nil end
  local fm = read_frontmatter(path)
  if not fm or not fm["gls-id"] then return nil end

  entries[fm["gls-id"]] = {
    short = fm["gls-short"] or fm["gls-id"],
    long = fm["gls-long"] or fm["gls-id"],
    description = fm["gls-description"] or "",
    type = fm["gls-type"] or "term",
  }
  return pandoc.RawInline("latex", "\\gls{" .. fm["gls-id"] .. "}")
end

function Pandoc(doc)
  if next(entries) == nil then return doc end

  -- Build \newacronym / \newglossaryentry lines; template handles package and \makeglossaries.
  local lines = {}
  for id, e in pairs(entries) do
    if e.type == "acronym" then
      table.insert(lines, string.format(
        "\\newacronym{%s}{%s}{%s}",
        id, tex_escape(e.short), tex_escape(e.long)))
    else
      table.insert(lines, string.format(
        "\\newglossaryentry{%s}{name={%s},description={%s}}",
        id, tex_escape(e.short), tex_escape(e.description)))
    end
  end

  -- Inject entries into header-includes (after template's \makeglossaries).
  local hi = doc.meta["header-includes"] or pandoc.MetaList({})
  if hi.t ~= "MetaList" then hi = pandoc.MetaList({hi}) end
  table.insert(hi, pandoc.MetaBlocks({
    pandoc.RawBlock("latex", table.concat(lines, "\n"))
  }))
  doc.meta["header-includes"] = hi

  -- Set meta flag so template prints glossaries only when entries exist.
  doc.meta["has-glossary"] = pandoc.MetaBool(true)

  return doc
end