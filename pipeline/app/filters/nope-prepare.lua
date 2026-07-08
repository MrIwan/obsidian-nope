-- nope-prepare.lua — container-side export preprocessing.
--
-- Runs as a lightweight pandoc pass BEFORE the main conversion (see build.sh):
-- it materializes into $NOPE_WORK_DIR exactly the fixed-name files the main
-- pass probes for, replacing what the plugin's TS side used to do:
--   custom-template.tex     (frontmatter: nope-template, or via branding note)
--   branding-override.yml   (frontmatter: nope-branding → branding note fm)
--   references.bib          (frontmatter: bibliography)
--   citation-style.csl      (frontmatter: csl — preinstalled /app/csl name or vault file)
--   references-notes.bib    (notes with citekey frontmatter, walked via links/embeds)
--
-- Fatal resolution problems print ">>> NOPE-ERROR: …" and abort the export
-- (the plugin surfaces the line as the failure notice); non-fatal issues
-- print ">>> NOPE-WARN …".

local WORK = os.getenv("NOPE_WORK_DIR")
local BASE = os.getenv("NOPE_BASE")

-- Dependency manifest, same contract as obsidian-transclude.lua (append, dedupe).
local deps_file = os.getenv("NOPE_DEPS_FILE")
local deps_seen = {}
local function log_dep(path)
  if not deps_file or deps_seen[path] then return end
  deps_seen[path] = true
  local f = io.open(deps_file, "a")
  if f then f:write(path, "\n"); f:close() end
end

local function fail(msg)
  io.stdout:write(">>> NOPE-ERROR: " .. msg .. "\n")
  io.stdout:flush()
  os.exit(1)
end

local function warn(msg)
  io.stdout:write(">>> NOPE-WARN " .. msg .. "\n")
end

-- ============================================================================
-- File helpers
-- ============================================================================

-- Find a file by vault-relative path or bare basename via the resource path
-- (build.sh passes every vault directory, mirroring Obsidian's basename index).
local function find_file(relname)
  for _, dir in ipairs(PANDOC_STATE.resource_path or { "." }) do
    local full = dir .. "/" .. relname
    local f = io.open(full, "rb")
    if f then f:close(); return full end
  end
  return nil
end

local function read_file(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local content = f:read("*all")
  f:close()
  return content
end

local function copy_file(src, dst)
  local data = read_file(src)
  if not data then return false end
  local f = io.open(dst, "wb")
  if not f then return false end
  f:write(data)
  f:close()
  return true
end

-- ============================================================================
-- Link + meta helpers
-- ============================================================================

-- Strip alias and heading/block-id suffix from a wikilink target.
local function strip_link_extras(inner)
  local target = inner
  local pipe = target:find("|", 1, true)
  if pipe then target = target:sub(1, pipe - 1) end
  local hash = target:find("#", 1, true)
  if hash then target = target:sub(1, hash - 1) end
  return (target:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Accept a plain linkpath or a [[wikilink]] string; return the trimmed linkpath.
local function strip_wikilink(s)
  local inner = s:match("^%s*%[%[(.-)%]%]%s*$")
  if inner then return strip_link_extras(inner) end
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Meta value → linkpath string. The export doc is parsed WITH the wikilinks
-- extension, so "[[X]]" arrives as a Link inline whose stringification would
-- lose the brackets — extract the Link target directly in that case.
local function meta_linkpath(v)
  if v == nil then return nil end
  local t = pandoc.utils.type(v)
  if t == "string" then return strip_wikilink(v) end
  if t == "boolean" then return nil end
  if t == "Inlines" then
    local link = nil
    for _, il in ipairs(v) do
      if il.t == "Link" then
        if link then link = nil; break end
        link = il
      elseif il.t ~= "Space" and il.t ~= "SoftBreak" and il.t ~= "LineBreak" then
        link = nil; break
      end
    end
    if link then return strip_link_extras(link.target) end
  end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return strip_wikilink(s)
end

-- Full YAML frontmatter of an arbitrary note, parsed by pandoc's real YAML
-- parser. Read WITHOUT the wikilinks extension so raw values like
-- "[[logo.png|h=1cm]]" survive stringification verbatim.
local fm_cache = {}
local function note_meta(path)
  local cached = fm_cache[path]
  if cached == false then return nil end
  if cached then return cached end
  local content = read_file(path)
  local fmtext = content and content:match("^%-%-%-\r?\n(.-)\r?\n%-%-%-")
  local meta = nil
  if fmtext then
    local ok, doc = pcall(pandoc.read, "---\n" .. fmtext .. "\n---\n\n", "markdown")
    if ok then meta = doc.meta end
  end
  fm_cache[path] = meta or false
  return meta
end

-- ============================================================================
-- Custom template (nope-template)
-- ============================================================================

local function prepare_template(doc_meta, branding_meta)
  local linkpath = meta_linkpath(doc_meta["nope-template"])
  if not linkpath and branding_meta then
    linkpath = meta_linkpath(branding_meta["nope-template"])
  end
  if not linkpath or linkpath == "" then return end

  local path = find_file(linkpath)
  if not path and not linkpath:lower():match("%.tex$") then
    path = find_file(linkpath .. ".tex")
  end
  if not path then
    fail('Custom template not found: "' .. linkpath .. '" (referenced via "nope-template"). '
      .. 'Make sure the .tex file exists in the vault.')
  end

  if not copy_file(path, WORK .. "/custom-template.tex") then
    fail('Could not copy custom template: ' .. path)
  end
  log_dep(path)

  local name = path:match("([^/]+)%.%w+$") or linkpath
  print(">>> Custom template resolved: " .. name)
  local content = read_file(path) or ""
  if not content:find("NOPE-IMPORTS", 1, true) then
    warn('Template "' .. name .. '" is missing the NOPE-IMPORTS block — '
      .. 'tables, callouts, theorems and the glossary may break. '
      .. 'Copy nope_minimal.tex as a starting point.')
  end
end

-- ============================================================================
-- Bibliography (bibliography / csl)
-- ============================================================================

local function prepare_bibliography(doc_meta)
  local raw = doc_meta["bibliography"]
  if raw == nil then return end
  local linkpath = meta_linkpath(raw)
  if not linkpath or linkpath == "" then return end

  local bib = find_file(linkpath)
  if not bib then
    fail('Bibliography file not found: "' .. linkpath .. '" (referenced via "bibliography"). '
      .. 'Make sure the file exists in the vault.')
  end
  if not copy_file(bib, WORK .. "/references.bib") then
    fail('Could not copy bibliography: ' .. bib)
  end
  log_dep(bib)

  -- CSL is optional: preinstalled name (/app/csl/<name>.csl) wins, else vault file.
  local csl_linkpath = meta_linkpath(doc_meta["csl"])
  if csl_linkpath and csl_linkpath ~= "" then
    local csl = nil
    local preinstalled = "/app/csl/" .. csl_linkpath .. ".csl"
    local f = io.open(preinstalled, "rb")
    if f then f:close(); csl = preinstalled else csl = find_file(csl_linkpath) end
    if not csl then
      fail('CSL style not found: "' .. csl_linkpath .. '" (referenced via "csl"). '
        .. 'Expected either a preinstalled name (/app/csl/<name>.csl) or a .csl file in the vault.')
    end
    if not copy_file(csl, WORK .. "/citation-style.csl") then
      fail('Could not copy CSL style: ' .. csl)
    end
    if csl ~= preinstalled then log_dep(csl) end
  end
end

-- ============================================================================
-- Branding override (nope-branding)
-- ============================================================================

-- Header/footer keys auto-expand solo image wikilinks to \raisebox{\includegraphics} snippets.
local header_footer_keys = {
  ["header-left"] = true, ["header-center"] = true, ["header-right"] = true,
  ["footer-left"] = true, ["footer-center"] = true, ["footer-right"] = true,
}

local logo_image_exts = {
  png = true, jpg = true, jpeg = true, gif = true, svg = true,
  webp = true, bmp = true, pdf = true,
}

local DEFAULT_LOGO_HEIGHT = "0.7cm"

local function is_logo_image(linkpath)
  local ext = linkpath:match("%.(%w+)$")
  return ext ~= nil and logo_image_exts[ext:lower()] == true
end

-- Parse wikilink inner: canonical linkpath plus optional |h=<value> height hint.
local function parse_logo_inner(inner)
  local rest, h = inner:match("^(.*)|%s*h%s*=%s*(.-)%s*$")
  if rest and h and h ~= "" and not h:find("|", 1, true) then
    return strip_link_extras(rest), h
  end
  return strip_link_extras(inner), nil
end

local function prepare_branding(doc_meta)
  local raw = doc_meta["nope-branding"]
  if raw == nil then return nil end
  local linkpath = meta_linkpath(raw)
  if not linkpath or linkpath == "" then
    fail('Frontmatter key "nope-branding" must be a quoted wikilink like "[[Branding-File]]".')
  end

  local branding_path = find_file(linkpath)
  if not branding_path and not linkpath:lower():match("%.md$") then
    branding_path = find_file(linkpath .. ".md")
  end
  if not branding_path then
    fail('Branding file not found: "' .. linkpath .. '" (referenced via "nope-branding").')
  end
  log_dep(branding_path)

  local fm = note_meta(branding_path)
  if not fm or next(fm) == nil then
    fail('Branding file has no frontmatter: ' .. branding_path)
  end

  -- Copy an asset into $WORK/branding/ and return its container path.
  local branding_dir = WORK .. "/branding"
  pandoc.system.make_directory(branding_dir, true)
  local container_dir = "/build/" .. BASE .. "/branding"

  local function copy_asset(asset_linkpath)
    local asset = find_file(asset_linkpath)
    if not asset then
      fail('Branding asset not found: "' .. asset_linkpath .. '" (referenced in ' .. branding_path .. ').')
    end
    local name = asset:match("([^/]+)$")
    if not copy_file(asset, branding_dir .. "/" .. name) then
      fail('Could not copy branding asset: ' .. asset)
    end
    log_dep(asset)
    return container_dir .. "/" .. name
  end

  -- Solo image wikilink in a header/footer key → LaTeX logo snippet.
  local function expand_logo(inner)
    local lp, height = parse_logo_inner(inner)
    local container_path = copy_asset(lp)
    local h = height or DEFAULT_LOGO_HEIGHT
    return "\\raisebox{-0.3\\height}{\\includegraphics[height=" .. h .. "]{" .. container_path .. "}}"
  end

  -- Replace every [[…]] inside a plain string with the copied asset's container path.
  local function substitute_wikilinks(s)
    return (s:gsub("%[%[(.-)%]%]", function(inner)
      return copy_asset(strip_link_extras(inner))
    end))
  end

  -- YAML emission (ported from the TS serializer): strings double-quoted with
  -- escapes so LaTeX snippets survive, booleans/numbers plain, lists/maps nested.
  local function quote_yaml(s)
    local e = s:gsub("\\", "\\\\"):gsub('"', '\\"')
      :gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
    return '"' .. e .. '"'
  end

  local function serialize_value(v, depth, lines, key)
    local indent = string.rep("  ", depth)
    local t = pandoc.utils.type(v)
    if t == "boolean" then
      table.insert(lines, indent .. key .. ": " .. tostring(v))
    elseif t == "List" then
      if #v == 0 then
        table.insert(lines, indent .. key .. ": []")
      else
        table.insert(lines, indent .. key .. ":")
        for _, item in ipairs(v) do
          local it = pandoc.utils.type(item)
          local sv
          if it == "boolean" then
            sv = tostring(item)
          else
            local s = substitute_wikilinks(pandoc.utils.stringify(item))
            sv = s:match("^%-?%d+%.?%d*$") and s or quote_yaml(s)
          end
          table.insert(lines, indent .. "- " .. sv)
        end
      end
    elseif t == "Map" or t == "table" then
      table.insert(lines, indent .. key .. ":")
      local keys = {}
      for k in pairs(v) do table.insert(keys, k) end
      table.sort(keys)
      for _, k in ipairs(keys) do
        serialize_value(v[k], depth + 1, lines, k)
      end
    else
      local s = substitute_wikilinks(pandoc.utils.stringify(v))
      if s:match("^%-?%d+%.?%d*$") then
        table.insert(lines, indent .. key .. ": " .. s)
      else
        table.insert(lines, indent .. key .. ": " .. quote_yaml(s))
      end
    end
  end

  local lines = {
    "# Auto-generated by nope (container prepare pass). Do not edit by hand.",
    "# Source: " .. branding_path,
    "",
  }
  local keys = {}
  for k in pairs(fm) do
    -- No recursion (nope-branding inside the branding file) and no Obsidian caches.
    if k ~= "nope-branding" and k ~= "position" then table.insert(keys, k) end
  end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local v = fm[k]
    local handled = false
    -- Header/footer + solo image wikilink → logo snippet. Mixed strings and
    -- non-image targets fall through to plain path substitution.
    if header_footer_keys[k] then
      local t = pandoc.utils.type(v)
      if t ~= "boolean" and t ~= "List" and t ~= "Map" and t ~= "table" then
        local s = pandoc.utils.stringify(v)
        local inner = s:match("^%s*%[%[(.-)%]%]%s*$")
        if inner then
          local lp = parse_logo_inner(inner)
          if is_logo_image(lp) then
            table.insert(lines, k .. ": " .. quote_yaml(expand_logo(inner)))
            handled = true
          end
        end
      end
    end
    if not handled then
      serialize_value(v, 0, lines, k)
    end
  end

  local f = io.open(WORK .. "/branding-override.yml", "w")
  if not f then fail("Could not write branding-override.yml") end
  f:write(table.concat(lines, "\n"), "\n")
  f:close()

  return fm
end

-- ============================================================================
-- Citation notes (citekey frontmatter) → references-notes.bib
-- ============================================================================

-- Frontmatter key → BibTeX field, in stable output order.
local bib_fields = {
  { "author", "author" }, { "editor", "editor" }, { "title", "title" },
  { "year", "year" }, { "month", "month" }, { "journal", "journal" },
  { "booktitle", "booktitle" }, { "publisher", "publisher" },
  { "institution", "institution" }, { "school", "school" },
  { "organization", "organization" }, { "volume", "volume" },
  { "number", "number" }, { "pages", "pages" }, { "series", "series" },
  { "chapter", "chapter" }, { "edition", "edition" }, { "address", "address" },
  { "doi", "doi" }, { "url", "url" }, { "isbn", "isbn" }, { "issn", "issn" },
  { "howpublished", "howpublished" }, { "note", "note" },
  { "keywords", "keywords" }, { "abstract", "abstract" },
}

-- Render a meta value as a BibTeX field body ({}-stripped), or nil to skip.
local function bib_value(field, v)
  if v == nil then return nil end
  local sep = (field == "author" or field == "editor") and " and " or ", "
  local raw
  if pandoc.utils.type(v) == "List" then
    local parts = {}
    for _, item in ipairs(v) do
      local s = pandoc.utils.stringify(item)
      if s ~= "" then table.insert(parts, s) end
    end
    raw = table.concat(parts, sep)
  elseif pandoc.utils.type(v) == "boolean" then
    raw = tostring(v)
  else
    raw = pandoc.utils.stringify(v)
  end
  local cleaned = raw:gsub("[{}]", ""):gsub("^%s+", ""):gsub("%s+$", "")
  if cleaned == "" then return nil end
  return cleaned
end

local function bibtex_entry(key, fm)
  local entry_type = "misc"
  for _, tk in ipairs({ "bibtype", "entry-type" }) do
    local v = fm[tk]
    if v ~= nil then
      local s = pandoc.utils.stringify(v)
      if s ~= "" then entry_type = s; break end
    end
  end
  local fields = {}
  for _, pair in ipairs(bib_fields) do
    local formatted = bib_value(pair[2], fm[pair[1]])
    if formatted then table.insert(fields, "  " .. pair[2] .. " = {" .. formatted .. "}") end
  end
  return "@" .. entry_type .. "{" .. key .. ",\n" .. table.concat(fields, ",\n") .. "\n}"
end

-- Walk the link + embed graph from the export doc; collect every note with a
-- citekey. Recurses into embedded md notes (mirrors the plugin's old BFS).
local function prepare_citations(doc_blocks)
  local entries = {}       -- citekey → bibtex string
  local entry_keys = {}    -- stable output order
  local visited = {}       -- resolved note path → true

  local function normalize_target(target)
    local t = target:gsub("^%./", "")
    if t == "" or t:match("^[a-zA-Z]+://") or t:match("^mailto:") or t:match("^#") then return nil end
    t = strip_link_extras(t)
    if t == "" then return nil end
    return t
  end

  local function note_path_for(target)
    local name = target
    if not name:match("%.%w+$") then name = name .. ".md" end
    if not name:lower():match("%.md$") then return nil end
    return find_file(name)
  end

  local function collect_citation(target)
    local t = normalize_target(target)
    if not t then return end
    local path = note_path_for(t)
    if not path then return end
    local fm = note_meta(path)
    if not fm or fm["citekey"] == nil then return end
    local key = pandoc.utils.stringify(fm["citekey"])
    key = key:gsub("^%s+", ""):gsub("%s+$", "")
    if key == "" or entries[key] then return end
    entries[key] = bibtex_entry(key, fm)
    table.insert(entry_keys, key)
    log_dep(path)
  end

  local scan_blocks
  local function scan_embed(target)
    local t = normalize_target(target)
    if not t then return end
    local path = note_path_for(t)
    if not path or visited[path] then return end
    visited[path] = true
    local content = read_file(path)
    if not content then return end
    local ok, doc = pcall(pandoc.read, content, "markdown+wikilinks_title_after_pipe")
    if ok then scan_blocks(doc.blocks) end
  end

  scan_blocks = function(blocks)
    blocks:walk({
      Link = function(el) collect_citation(el.target) end,
      Image = function(el)
        collect_citation(el.src)
        scan_embed(el.src)
      end,
    })
  end

  scan_blocks(doc_blocks)

  if #entry_keys == 0 then return end
  local parts = {}
  for _, key in ipairs(entry_keys) do table.insert(parts, entries[key]) end
  local f = io.open(WORK .. "/references-notes.bib", "w")
  if not f then fail("Could not write references-notes.bib") end
  f:write(table.concat(parts, "\n\n"), "\n")
  f:close()
end

-- ============================================================================
-- Entry point
-- ============================================================================

function Pandoc(doc)
  if not WORK or WORK == "" then
    fail("NOPE_WORK_DIR is not set — nope-prepare.lua must run via build.sh")
  end

  local branding_meta = prepare_branding(doc.meta)
  prepare_template(doc.meta, branding_meta)
  prepare_bibliography(doc.meta)
  prepare_citations(doc.blocks)

  return doc
end
