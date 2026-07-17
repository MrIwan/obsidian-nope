--- Convert Obsidian callouts to \begin{nopecallout}{<type>} blocks.
-- The type to awesomebox mapping lives in the injected LaTeX defaults below.
-- A custom template can predefine nopecallout to restyle callouts without
-- touching this filter. Runs after the transclude filter.
-- @module callouts

local has_callout = false

-- Guarded defaults for header-includes; skipped entirely if a template defines nopecallout.
local CALLOUT_DEFS = [[
\makeatletter
\ifcsname nopecallout\endcsname\else
\newcommand{\nope@co@def}[2]{\expandafter\def\csname nope@co@#1\endcsname{#2}}
\nope@co@def{note}{noteblock}
\nope@co@def{info}{noteblock}
\nope@co@def{tldr}{noteblock}
\nope@co@def{summary}{noteblock}
\nope@co@def{abstract}{noteblock}
\nope@co@def{question}{noteblock}
\nope@co@def{help}{noteblock}
\nope@co@def{faq}{noteblock}
\nope@co@def{quote}{noteblock}
\nope@co@def{cite}{noteblock}
\nope@co@def{tip}{tipblock}
\nope@co@def{hint}{tipblock}
\nope@co@def{example}{tipblock}
\nope@co@def{todo}{tipblock}
\nope@co@def{success}{tipblock}
\nope@co@def{done}{tipblock}
\nope@co@def{check}{tipblock}
\nope@co@def{warning}{warningblock}
\nope@co@def{caution}{warningblock}
\nope@co@def{attention}{warningblock}
\nope@co@def{failure}{warningblock}
\nope@co@def{fail}{warningblock}
\nope@co@def{missing}{warningblock}
\nope@co@def{danger}{cautionblock}
\nope@co@def{important}{cautionblock}
\nope@co@def{error}{cautionblock}
\nope@co@def{bug}{cautionblock}
\newenvironment{nopecallout}[1]{%
  \edef\nope@co@env{\ifcsname nope@co@#1\endcsname\csname nope@co@#1\endcsname\else noteblock\fi}%
  \csname\nope@co@env\endcsname}%
 {\csname end\nope@co@env\endcsname}
\fi
\makeatother]]

-- Detect a callout marker: expects a leading "[!type]" string.
--- Read the [!type] marker from a blockquote's first line.
-- @treturn string|nil lowercased type, or nil if not a callout
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

-- Split inlines at the first SoftBreak/LineBreak.
-- Everything before is the title; everything after is body content
-- that belonged to the same Pandoc paragraph (Obsidian single-block callout).
local function split_at_first_break(inlines)
  local title = {}
  local rest = {}
  local found = false
  for _, inl in ipairs(inlines) do
    if not found and (inl.t == "SoftBreak" or inl.t == "LineBreak") then
      found = true
    elseif found then
      rest[#rest + 1] = inl
    else
      title[#title + 1] = inl
    end
  end
  -- trim leading whitespace of rest
  while #rest > 0 and (rest[1].t == "Space" or rest[1].t == "SoftBreak" or rest[1].t == "LineBreak") do
    table.remove(rest, 1)
  end
  return title, rest
end

--- Turn a callout blockquote into a nopecallout environment.
-- A plain blockquote without a marker is left untouched.
function BlockQuote(el)
  if #el.content == 0 then return nil end

  -- First line must be Para or Plain and start with [!type]
  local first = el.content[1]
  if first.t ~= "Para" and first.t ~= "Plain" then return nil end

  local typ = parse_callout_marker(first.content)
  if not typ then return nil end
  has_callout = true

  -- Title: rest of first line after marker, only up to the first line break.
  -- Anything after the line break belongs to the body, even if Obsidian put it
  -- into the same paragraph (single-block callout written with one ">" per line).
  local after_marker = strip_marker(first.content)
  local title_inlines, rest_inlines = split_at_first_break(after_marker)

  -- Body: leftover inlines from the first paragraph + all blocks after the first
  local body_blocks = {}
  if #rest_inlines > 0 then
    body_blocks[#body_blocks + 1] = pandoc.Para(rest_inlines)
  end
  for i = 2, #el.content do
    body_blocks[#body_blocks + 1] = el.content[i]
  end

  -- If the first line had title text, insert it as a bold paragraph.
  local result = {}
  result[#result + 1] = pandoc.RawBlock("latex", "\\begin{nopecallout}{" .. typ .. "}")

  if #title_inlines > 0 then
    local title_para = pandoc.Para({
      pandoc.Strong(title_inlines)
    })
    result[#result + 1] = title_para
  end

  for _, b in ipairs(body_blocks) do
    result[#result + 1] = b
  end

  result[#result + 1] = pandoc.RawBlock("latex", "\\end{nopecallout}")
  return result
end

-- Inject the guarded nopecallout defaults to header-includes (glossary pattern).
function Pandoc(doc)
  if not has_callout then return doc end
  local hi = doc.meta["header-includes"] or pandoc.MetaList({})
  if hi.t ~= "MetaList" then hi = pandoc.MetaList({hi}) end
  table.insert(hi, pandoc.MetaBlocks({ pandoc.RawBlock("latex", CALLOUT_DEFS) }))
  doc.meta["header-includes"] = hi
  return doc
end