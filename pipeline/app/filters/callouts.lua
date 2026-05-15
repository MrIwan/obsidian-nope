-- Unterstützte Typen werden auf awesomebox-Stile gemappt:
--   note, info, tip, hint, warning, caution, danger, important, tldr, summary, example, todo
-- Convert Obsidian callouts ([!type] Title \n> Content) to LaTeX environments.
-- Supported types map to awesomebox styles.

local has_callout = false

-- Mapping: Obsidian-Typ → awesomebox-Umgebung
local type_map = {
  note      = "noteblock",
  info      = "noteblock",
  tldr      = "noteblock",
  summary   = "noteblock",
  abstract  = "noteblock",
  tip       = "tipblock",
  hint      = "tipblock",
  example   = "tipblock",
  todo      = "tipblock",
  warning   = "warningblock",
  caution   = "warningblock",
  attention = "warningblock",
  danger    = "cautionblock",
  important = "cautionblock",
  error     = "cautionblock",
  bug       = "cautionblock",
  question  = "noteblock",
  help      = "noteblock",
  faq       = "noteblock",
  success   = "tipblock",
  done      = "tipblock",
  check     = "tipblock",
  failure   = "warningblock",
  fail      = "warningblock",
  missing   = "warningblock",
  quote     = "noteblock",
  cite      = "noteblock",
}

-- Detect a callout marker: expects a leading "[!type]" string.
local function parse_callout_marker(inlines)
  if #inlines == 0 then return nil end
  local first = inlines[1]
  if first.t ~= "Str" then return nil end
  local typ = first.text:match("^%[!([%w]+)%]$")
  if not typ then return nil end
  return typ:lower()
end

-- Remove the marker and leading whitespace. Remainder is the title.
local function strip_marker(inlines)
  local rest = {}
  for i = 2, #inlines do
    rest[#rest + 1] = inlines[i]
  end
  -- führende Whitespace-Inlines wegtrimmen
  while #rest > 0 and (rest[1].t == "Space" or rest[1].t == "SoftBreak" or rest[1].t == "LineBreak") do
    table.remove(rest, 1)
  end
  return rest
end

function BlockQuote(el)
  if #el.content == 0 then return nil end

  -- First line must be Para or Plain and start with [!type]
  local first = el.content[1]
  if first.t ~= "Para" and first.t ~= "Plain" then return nil end

  local typ = parse_callout_marker(first.content)
  if not typ then return nil end

  local env = type_map[typ] or "noteblock"
  has_callout = true

  -- Title: rest of first line after marker
  local title_inlines = strip_marker(first.content)

  -- Body: all blocks after the first
  local body_blocks = {}
  for i = 2, #el.content do
    body_blocks[#body_blocks + 1] = el.content[i]
  end

  -- If the first line had title text, insert it as a bold paragraph.
  local result = {}
  result[#result + 1] = pandoc.RawBlock("latex", "\\begin{" .. env .. "}")

  if #title_inlines > 0 then
    local title_para = pandoc.Para({
      pandoc.Strong(title_inlines)
    })
    result[#result + 1] = title_para
  end

  for _, b in ipairs(body_blocks) do
    result[#result + 1] = b
  end

  result[#result + 1] = pandoc.RawBlock("latex", "\\end{" .. env .. "}")
  return result
end

-- Set meta flag when callouts were present (template can react to it).
function Pandoc(doc)
  if has_callout then
    doc.meta["has-callouts"] = pandoc.MetaBool(true)
  end
  return doc
end