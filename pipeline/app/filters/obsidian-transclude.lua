-- Recursively expand ![[Note]] and ![[Image]] embeds; resolve wikilinks to embedded targets.
-- Supports heading slices (#Heading), block IDs (#^block-id), and image figures with captions.
-- Frontmatter-driven wraps: latex-env (theorem/table/mermaid), auto-heading-shift, glossary terms.
-- After expansion, wikilinks resolve to \autoref (default display) or \hyperref (custom text).

local image_exts = {
  png=true, jpg=true, jpeg=true, gif=true, svg=true,
  webp=true, bmp=true, pdf=true, mp4=true, webm=true,
  mp3=true, wav=true, ogg=true, m4a=true,
}

local function is_image_file(src)
  local ext = src:match("%.([%w]+)$")
  return ext and image_exts[ext:lower()]
end

local function find_note_path(notename)
  if not notename:match("%.%w+$") then notename = notename .. ".md" end
  for _, path in ipairs(PANDOC_STATE.resource_path or {"."}) do
    local full = path .. "/" .. notename
    local f = io.open(full, "rb")
    if f then f:close(); return full end
  end
  return nil
end

-- Parse embed source into notename and anchor; returns (notename, anchor_type, anchor_value).
local function parse_anchor(src)
  local hash = src:find("#", 1, true)
  if not hash then return src, "none", nil end
  local notename = src:sub(1, hash - 1)
  local rest = src:sub(hash + 1)
  if notename == "" then notename = src end
  if rest == "" then return notename, "none", nil end
  if rest:sub(1, 1) == "^" then return notename, "block_id", rest:sub(2) end
  return notename, "heading", rest
end

local function inlines_text(inlines)
  return pandoc.utils.stringify(inlines)
end

-- Reduce a string to a LaTeX-label-safe form: alphanum, dash, underscore, colon.
local function sanitize_label_id(s)
  return (s:gsub("[^%w%-_:]", "_"))
end

-- Shift heading levels in-place; no-op if shift <= 0, clamp max 6.

local function find_min_header_level(blocks)
  local min_level = nil
  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      if not min_level or block.level < min_level then
        min_level = block.level
      end
    end
  end
  return min_level
end

local function shift_headings(blocks, shift)
  if not shift or shift <= 0 then return end
  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      local new_level = block.level + shift
      if new_level > 6 then new_level = 6 end
      block.level = new_level
    end
  end
end

-- ============================================================================
-- Phase 1 helpers — slicing
-- ============================================================================

-- Slice blocks from heading match to next heading of same/higher level.
local function slice_by_heading(blocks, heading_text)
  local result, started, start_level = {}, false, nil
  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      if not started then
        if inlines_text(block.content) == heading_text then
          started = true
          start_level = block.level
          table.insert(result, block)
        end
      else
        if block.level <= start_level then break end
        table.insert(result, block)
      end
    elseif started then
      table.insert(result, block)
    end
  end
  return result, started
end

-- Check if a block ends with ^block_id marker.
local function block_has_id(block, target_id)
  if block.t ~= "Para" and block.t ~= "Plain" then return false end
  local content = block.content
  if #content == 0 then return false end
  local last = content[#content]
  if last.t ~= "Str" then return false end
  return last.text == "^" .. target_id
end

-- Extract single block marked with ^target_id.
local function slice_by_block_id(blocks, target_id)
  for _, block in ipairs(blocks) do
    if block_has_id(block, target_id) then
      -- Keep the trailing ^id here; annotate_with_labels strips & labels it.
      return { block }, true
    end
  end
  return {}, false
end

-- Map of embedded targets and auto-reference targets for wikilink resolution.
local available_targets = {}
local autoref_targets = {}

-- Remove trailing ^block_id from inlines and strip trailing whitespace.
-- Strip trailing ^id and trailing whitespace inlines.
local function inlines_without_block_id(content)
  local out = {}
  for i = 1, #content - 1 do table.insert(out, content[i]) end
  while #out > 0 do
    local tail = out[#out]
    if tail.t == "Space" or tail.t == "SoftBreak" or tail.t == "LineBreak" then
      table.remove(out)
    else break end
  end
  return out
end

-- Annotate blocks with LaTeX labels for hyperref targets; register in available_targets.
local function annotate_with_labels(blocks, notename, skip_outer_anchor)
  local note_label = "note:" .. sanitize_label_id(notename)
  local result = {}

  if not available_targets[notename] then
    available_targets[notename] = note_label
    if not skip_outer_anchor then
      table.insert(result, pandoc.RawBlock("latex", "\\phantomsection\\label{" .. note_label .. "}"))
    end
  end

  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      local heading_text = inlines_text(block.content)
      local key = notename .. "#" .. heading_text
      if not available_targets[key] then
        local heading_label = note_label .. ":sec-" .. sanitize_label_id(heading_text)
        local new_content = {}
        for _, inline in ipairs(block.content) do table.insert(new_content, inline) end
        table.insert(new_content, pandoc.RawInline("latex", "\\label{" .. heading_label .. "}"))
        table.insert(result, pandoc.Header(block.level, new_content, block.attr))
        available_targets[key] = heading_label
      else
        -- Already labeled in previous embed.
        table.insert(result, block)
      end

    elseif block.t == "Para" or block.t == "Plain" then
      local content = block.content
      local block_id = nil
      if #content > 0 then
        local last = content[#content]
        if last.t == "Str" then
          block_id = last.text:match("^%^([%w%-_]+)$")
        end
      end

      if block_id then
        local stripped_inlines = inlines_without_block_id(content)
        local key = notename .. "#^" .. block_id
        if not available_targets[key] then
          local block_label = note_label .. ":blk-" .. sanitize_label_id(block_id)
          table.insert(stripped_inlines, pandoc.RawInline("latex", "\\label{" .. block_label .. "}"))
          available_targets[key] = block_label
        end
        -- ^id suffix stripped from visible output.
        local new_block = (block.t == "Para") and pandoc.Para(stripped_inlines) or pandoc.Plain(stripped_inlines)
        table.insert(result, new_block)
      else
        table.insert(result, block)
      end

    else
      table.insert(result, block)
    end
  end

  return result
end

-- Render Mermaid diagrams; PNG cached by source hash, absolute paths for Pandoc.

local mermaid_outdir = nil

-- Default mmdc scale: 1 (native 800px), 2 (1600px ~300dpi, default for print).
local MERMAID_DEFAULT_SCALE = 2

-- Create and return mermaid output directory.
local function ensure_mermaid_outdir()
  if mermaid_outdir then return mermaid_outdir end
  local work = os.getenv("MERMAID_WORK_DIR") or "."
  mermaid_outdir = work .. "/mermaid"
  pandoc.system.make_directory(mermaid_outdir, true)
  return mermaid_outdir
end

local function mermaid_file_exists(path)
  local f = io.open(path, "rb")
  if f then f:close(); return true end
  return false
end

local function mermaid_shell_escape(s)
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

-- Render diagram source to PNG; return absolute path or nil on error. Scale included in cache key.
local function render_mermaid_to_png(source_text, scale)
  local outdir = ensure_mermaid_outdir()
  local hash = pandoc.utils.sha1(source_text .. ":scale:" .. tostring(scale))
  local mmd_path = outdir .. "/" .. hash .. ".mmd"
  local png_abs = outdir .. "/" .. hash .. ".png"

  if mermaid_file_exists(png_abs) then return png_abs end

  local fh, err = io.open(mmd_path, "w")
  if not fh then
    io.stderr:write("mermaid: cannot write source " .. mmd_path
      .. ": " .. tostring(err) .. "\n")
    return nil
  end
  fh:write(source_text)
  fh:close()

  local cmd = table.concat({
    "mmdc",
    "-i", mermaid_shell_escape(mmd_path),
    "-o", mermaid_shell_escape(png_abs),
    "-b", "transparent",
    "-s", tostring(scale),
    "-p", "/etc/mmdc/puppeteer-config.json",
    "2>&1",
  }, " ")
  local ok, _, code = os.execute(cmd)
  if not ok or not mermaid_file_exists(png_abs) then
    io.stderr:write("mermaid: mmdc failed for " .. mmd_path
      .. " (exit " .. tostring(code) .. ", cmd: " .. cmd .. ")\n")
    return nil
  end
  return png_abs
end

-- Recursive embedding and LaTeX environment handling.
local visiting = {}
local process_blocks

-- Extract frontmatter value (caption, width, etc.) as flat inline list.
local function meta_to_inlines(meta_value)
  if not meta_value then return nil end
  local t = type(meta_value)
  if t == "string" then
    return { pandoc.Str(meta_value) }
  end
  -- Extract inlines from MetaInlines or MetaBlocks.
  local out = {}
  for _, x in ipairs(meta_value) do
    if x.t == "Plain" or x.t == "Para" then
      for _, inner in ipairs(x.content) do table.insert(out, inner) end
    else
      table.insert(out, x)
    end
  end
  return out
end

-- Read a boolean frontmatter flag; falls back to default if absent or empty.
local function meta_bool(doc_meta, key, default)
  local v = doc_meta[key]
  if v == nil then return default end
  local s = pandoc.utils.stringify(v):lower()
  if s == "false" or s == "no" or s == "0" or s == "" then return false end
  if s == "true" or s == "yes" or s == "1" then return true end
  return default
end

-- LaTeX environment wrappers for math (equation/align/etc.), tables, mermaid, and block envs.

local MATH_ENVS = {
  equation = true, ["equation*"] = true,
  align = true,    ["align*"] = true,
  gather = true,   ["gather*"] = true,
  multline = true, ["multline*"] = true,
  alignat = true,  ["alignat*"] = true,
}

-- Register embed target with label prefix; set autoref for default-display links ("Equation N" etc.).
local function register_target(notename, label_prefix)
  local label = label_prefix .. ":" .. sanitize_label_id(notename)
  local first_embed = (available_targets[notename] == nil)
  available_targets[notename] = label
  autoref_targets[notename] = true
  return label, first_embed
end

-- Find first block matching predicate; return (index, block) or (nil, nil).
local function find_block(blocks, predicate)
  for i, b in ipairs(blocks) do
    if predicate(b) then return i, b end
  end
  return nil, nil
end

local function is_table(b) return b.t == "Table" end

local function is_display_math(b)
  return b.t == "Para"
    and #b.content == 1
    and b.content[1].t == "Math"
    and b.content[1].mathtype == "DisplayMath"
end

-- Check for mermaid code block (class "mermaid").
local function is_mermaid_code(b)
  if b.t ~= "CodeBlock" then return false end
  for _, cls in ipairs(b.classes or {}) do
    if cls == "mermaid" then return true end
  end
  return false
end

-- Wrap first DisplayMath block in LaTeX equation environment with label.
local function wrap_math(notename, env_name, sliced, doc_meta)
  local label, first_embed = register_target(notename, "eq")
  local annotated = annotate_with_labels(sliced, notename, true)

  local idx = find_block(annotated, is_display_math)
  if not idx then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: " .. env_name
      .. ", aber kein $$…$$-Block im Inhalt gefunden.")
  end

  -- Trim whitespace from math text to prevent paragraph breaks in math mode.
  local content = annotated[idx].content[1].text:gsub("^%s+", ""):gsub("%s+$", "")
  local label_part = first_embed and ("\\label{" .. label .. "}") or ""
  annotated[idx] = pandoc.RawBlock("latex",
    "\\begin{" .. env_name .. "}" .. label_part .. "\n"
    .. content .. "\n\\end{" .. env_name .. "}")

  return annotated
end

-- Attach frontmatter caption and label to table; caption required in frontmatter.
local function wrap_table(notename, env_name, sliced, doc_meta)
  local caption_inlines = meta_to_inlines(doc_meta.caption)
  if not caption_inlines or #caption_inlines == 0 then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: table, aber kein 'caption:' im Frontmatter.")
  end

  local label, first_embed = register_target(notename, "tab")
  local annotated = annotate_with_labels(sliced, notename, true)

  local idx, table_block = find_block(annotated, is_table)
  if not table_block then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: table, aber keine Tabelle im Inhalt gefunden.")
  end

  -- Always set caption from frontmatter to ensure single-source truth.
  table_block.caption = pandoc.Caption({ pandoc.Plain(caption_inlines) })

  -- Label only on first embed to avoid multiply-defined warnings.
  if first_embed then
    local last = table_block.caption.long[#table_block.caption.long]
    table.insert(last.content,
      pandoc.RawInline("latex", "\\label{" .. label .. "}"))
  end

  -- Default: longtable (Seitenumbruch erlaubt). page-break: false hält die
  -- Tabelle zusammen: \needspace reserviert genug Platz; passt sie nicht mehr
  -- auf die Rest-Seite, beginnt LaTeX vor der Tabelle eine neue Seite. Ist die
  -- Tabelle länger als eine Seite, bricht longtable normal um (gewolltes Fallback).
  if not meta_bool(doc_meta, "page-break", true) then
    local rows = #table_block.head.rows
    for _, b in ipairs(table_block.bodies) do rows = rows + #b.body end
    -- +4 für Caption/Regeln, *1.6 für booktabs-Padding (Schätzung der Höhe).
    local h = string.format("%.1f\\baselineskip", (rows + 4) * 1.6)
    table.insert(annotated, idx, pandoc.RawBlock("latex", "\\needspace{" .. h .. "}"))
  end

  return annotated
end

-- Render mermaid diagram to PNG figure with frontmatter caption, scale, and width hints.
local function wrap_mermaid(notename, env_name, sliced, doc_meta)
  local caption_inlines = meta_to_inlines(doc_meta.caption)
  if not caption_inlines or #caption_inlines == 0 then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: mermaid, aber kein 'caption:' im Frontmatter.")
  end

  local _, code_block = find_block(sliced, is_mermaid_code)
  if not code_block then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: mermaid, aber keinen ```mermaid-Block im Inhalt gefunden.")
  end

  -- Scale factor for mermaid rendering: higher scale yields sharper PNG but larger file.
  local scale = MERMAID_DEFAULT_SCALE
  if doc_meta.scale then
    local n = tonumber(pandoc.utils.stringify(doc_meta.scale))
    if n then scale = n end
  end

  local png_abs = render_mermaid_to_png(code_block.text, scale)
  if not png_abs then
    error("[obsidian-transclude] Note '" .. notename
      .. "': mermaid-Rendering fehlgeschlagen (Details in last_latex_run.log).")
  end

  local label, first_embed = register_target(notename, "fig")

  -- Width hint: frontmatter keys w: or width: set image display size in PDF.
  local img_attrs = {}
  local width_meta = doc_meta.w or doc_meta.width
  if width_meta then
    img_attrs["width"] = pandoc.utils.stringify(width_meta)
  end

  -- Alt-text from note name; flows into \includegraphics accessibility metadata.
  local img = pandoc.Image(
    { pandoc.Str(notename) },
    png_abs,
    "",
    pandoc.Attr("", {}, img_attrs)
  )

  local caption_blocks = { pandoc.Plain(caption_inlines) }
  if first_embed then
    table.insert(caption_blocks[1].content,
      pandoc.RawInline("latex", "\\label{" .. label .. "}"))
  end

  local figure = pandoc.Figure(
    { pandoc.Plain({ img }) },
    pandoc.Caption(caption_blocks),
    pandoc.Attr("", {}, {})
  )

  return { figure }
end

-- Wrap content in generic LaTeX environment with optional short title and label.
local function wrap_block(notename, env_name, sliced, doc_meta)
  local env_short = doc_meta["latex-short"]
    and pandoc.utils.stringify(doc_meta["latex-short"]) or nil
  local label, first_embed = register_target(notename, "note")

  local annotated_inner = annotate_with_labels(sliced, notename, true)

  local opener = "\\begin{" .. env_name .. "}"
  if env_short and env_short ~= "" then
    opener = opener .. "[" .. env_short .. "]"
  end
  if first_embed then
    opener = opener .. "\\label{" .. label .. "}"
  end

  local wrapped = { pandoc.RawBlock("latex", opener) }
  for _, b in ipairs(annotated_inner) do table.insert(wrapped, b) end
  table.insert(wrapped, pandoc.RawBlock("latex", "\\end{" .. env_name .. "}"))

  return wrapped
end

-- ============================================================================
-- Glossary term resolution: wikilinks [[KI]] → \gls{ki}; entries injected to header-includes.
local glossary_entries = {}
local frontmatter_cache = {}

-- Read YAML frontmatter via regex (lightweight, no Pandoc roundtrip); cache results.
local function read_frontmatter(path)
  local f = io.open(path, "rb")
  if not f then return nil end
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

-- Escape LaTeX special characters for safe use in glossary commands.
local function tex_escape(s)
  return s:gsub("([&%%$#_{}])", "\\%1")
end

-- Try to resolve wikilink target as glossary term; return \gls{id} or nil.
local function try_resolve_glossary(target)
  local cached = frontmatter_cache[target]
  local fm
  if cached == false then
    return nil  -- Already checked, no gls-id.
  elseif cached then
    fm = cached
  else
    local path = find_note_path(target)
    if not path then
      frontmatter_cache[target] = false
      return nil
    end
    fm = read_frontmatter(path)
    if not fm or not fm["gls-id"] then
      frontmatter_cache[target] = false
      return nil
    end
    frontmatter_cache[target] = fm
  end

  local id = fm["gls-id"]
  if not glossary_entries[id] then
    glossary_entries[id] = {
      short = fm["gls-short"] or id,
      long = fm["gls-long"] or id,
      description = fm["gls-description"] or "",
      type = fm["gls-type"] or "term",
    }
  end
  return pandoc.RawInline("latex", "\\gls{" .. id .. "}")
end

-- Flush collected glossary entries to header-includes; set has-glossary meta flag.
local function flush_glossary_entries(doc)
  if next(glossary_entries) == nil then return end

  local lines = {}
  for id, e in pairs(glossary_entries) do
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

  local hi = doc.meta["header-includes"] or pandoc.MetaList({})
  if hi.t ~= "MetaList" then hi = pandoc.MetaList({hi}) end
  table.insert(hi, pandoc.MetaBlocks({
    pandoc.RawBlock("latex", table.concat(lines, "\n"))
  }))
  doc.meta["header-includes"] = hi
  doc.meta["has-glossary"] = pandoc.MetaBool(true)
end

-- Load and process a note embed; handle slicing, shifting, and env wraps.
local function load_note(src, host_level)
  host_level = host_level or 0
  local notename, anchor_type, anchor_value = parse_anchor(src)
  -- Canonical form without .md extension for consistent map keys.
  notename = notename:gsub("%.md$", "")
  local path = find_note_path(notename)
  if not path then
    return {pandoc.Para({pandoc.Str("[Not found: " .. notename .. "]")})}
  end
  if visiting[path] then
    return {pandoc.Para({pandoc.Str("[Circular embed: " .. notename .. "]")})}
  end
  visiting[path] = true
  local f = io.open(path, "rb")
  local content = f:read("*all"); f:close()
  -- Rewrite passive embeds +[[…]] → ![[…]]; mirrors build.sh sed rule.
  content = content:gsub("%+%[%[", "![[")
  local doc = pandoc.read(content, "markdown+wikilinks_title_after_pipe")
  local blocks = process_blocks(doc.blocks)
  visiting[path] = nil

  local sliced
  if anchor_type == "heading" then
    local s, found = slice_by_heading(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Heading not found: " .. notename .. "#" .. anchor_value .. "]")})}
    end
    sliced = s
  elseif anchor_type == "block_id" then
    local s, found = slice_by_block_id(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Block ID not found: " .. notename .. "#^" .. anchor_value .. "]")})}
    end
    sliced = s
  else
    sliced = blocks
  end

  -- Auto-shift headings after slicing; use original levels for slice-break detection.
  local min_level = find_min_header_level(sliced)
  if min_level then
    local shift = host_level + 1 - min_level
    if shift > 0 then shift_headings(sliced, shift) end
  end

  -- Wrap full embeds in LaTeX environments (math, table, mermaid, or generic block).
  if anchor_type == "none" then
    local meta_env = doc.meta["latex-env"]
    if meta_env then
      local env_name = pandoc.utils.stringify(meta_env)
      if MATH_ENVS[env_name] then
        return wrap_math(notename, env_name, sliced, doc.meta)
      elseif env_name == "table" then
        return wrap_table(notename, env_name, sliced, doc.meta)
      elseif env_name == "mermaid" then
        return wrap_mermaid(notename, env_name, sliced, doc.meta)
      else
        return wrap_block(notename, env_name, sliced, doc.meta)
      end
    end
  end

  return annotate_with_labels(sliced, notename)
end

-- Extract embed src from figure block if image has non-image extension (e.g., .md).
local function figure_transclusion_src(block)
  if block.t ~= "Figure" or #block.content ~= 1 then return nil end
  local inner = block.content[1]
  if (inner.t ~= "Plain" and inner.t ~= "Para") or #inner.content ~= 1 then return nil end
  local img = inner.content[1]
  if img.t ~= "Image" or is_image_file(img.src) then return nil end
  return img.src
end

-- Register standalone images with labels for autoref; extract and apply width hints.

-- Extract width hint suffix |w=<value> from end of caption inlines.
local function extract_width_hint(inlines)
  if not inlines or #inlines == 0 then return inlines, nil end

  -- Scan backwards for |w= width suffix; must be at end with only whitespace after.
  for i = #inlines, 1, -1 do
    local inline = inlines[i]
    if inline.t == "Str" then
      local prefix, width = inline.text:match("^(.-)|w%s*=%s*(.+)$")
      if width and width ~= "" then
        for j = i + 1, #inlines do
          local later = inlines[j]
          if later.t ~= "Space" and later.t ~= "SoftBreak" and later.t ~= "LineBreak" then
            return inlines, nil
          end
        end
        width = width:gsub("^%s+", ""):gsub("%s+$", "")
        prefix = prefix:gsub("%s+$", "")
        local cleaned = {}
        for j = 1, i - 1 do table.insert(cleaned, inlines[j]) end
        if prefix ~= "" then table.insert(cleaned, pandoc.Str(prefix)) end
        while #cleaned > 0 do
          local last = cleaned[#cleaned]
          if last.t == "Space" or last.t == "SoftBreak" or last.t == "LineBreak" then
            table.remove(cleaned)
          else
            break
          end
        end
        return cleaned, width
      end
    end
  end
  return inlines, nil
end

local function register_image_figure(figure_block)
  if figure_block.t ~= "Figure" or #figure_block.content ~= 1 then return nil end
  local inner = figure_block.content[1]
  if (inner.t ~= "Plain" and inner.t ~= "Para") or #inner.content ~= 1 then return nil end
  local img = inner.content[1]
  if img.t ~= "Image" or not is_image_file(img.src) then return nil end

  local src = img.src

  -- Fallback to filename if no caption provided.
  local caption = figure_block.caption
  if not caption or not caption.long or #caption.long == 0 then
    caption = pandoc.Caption({ pandoc.Plain({ pandoc.Str(src) }) })
    figure_block.caption = caption
  end

  -- Extract width hint from caption; each embed can have its own width.
  local last_block = caption.long[#caption.long]
  if last_block.content then
    local cleaned, width = extract_width_hint(last_block.content)
    if width then
      last_block.content = cleaned
      img.attributes = img.attributes or {}
      img.attributes["width"] = width
      -- Fallback to filename if caption is now empty.
      if #last_block.content == 0 then
        last_block.content = { pandoc.Str(src) }
      end
    end
  end

  -- Only first embed gets the \label; width hints are per-embed.
  if available_targets[src] then return figure_block end

  local label = "fig:" .. sanitize_label_id(src)
  available_targets[src] = label
  autoref_targets[src] = true

  -- Append \label to caption inlines.
  if last_block.content then
    table.insert(last_block.content, pandoc.RawInline("latex", "\\label{" .. label .. "}"))
  end

  return figure_block
end

local function process_para(el, host_level)
  host_level = host_level or 0
  local has = false
  for _, inline in ipairs(el.content) do
    if inline.t == "Image" and not is_image_file(inline.src) then has = true; break end
  end
  if not has then return nil end

  local result, buffer = {}, {}
  local function flush()
    while #buffer > 0 and (buffer[1].t == "SoftBreak" or buffer[1].t == "Space" or buffer[1].t == "LineBreak") do
      table.remove(buffer, 1)
    end
    while #buffer > 0 and (buffer[#buffer].t == "SoftBreak" or buffer[#buffer].t == "Space" or buffer[#buffer].t == "LineBreak") do
      table.remove(buffer)
    end
    if #buffer > 0 then
      table.insert(result, el.t == "Plain" and pandoc.Plain(buffer) or pandoc.Para(buffer))
      buffer = {}
    end
  end

  for _, inline in ipairs(el.content) do
    if inline.t == "Image" and not is_image_file(inline.src) then
      flush()
      for _, b in ipairs(load_note(inline.src, host_level)) do table.insert(result, b) end
    else
      table.insert(buffer, inline)
    end
  end
  flush()
  return result
end

-- Process blocks; expand embeds and register image figures; track heading level for shift.
process_blocks = function(blocks)
  local result = {}
  local current_level = 0
  for _, block in ipairs(blocks) do
    local src = figure_transclusion_src(block)
    if src then
      for _, b in ipairs(load_note(src, current_level)) do table.insert(result, b) end
    elseif block.t == "Figure" then
      local labeled = register_image_figure(block)
      table.insert(result, labeled or block)
    elseif block.t == "Header" then
      current_level = block.level
      table.insert(result, block)
    elseif block.t == "Para" or block.t == "Plain" then
      local replaced = process_para(block, current_level)
      if replaced then
        for _, b in ipairs(replaced) do table.insert(result, b) end
      else
        table.insert(result, block)
      end
    else
      table.insert(result, block)
    end
  end
  return result
end

-- Phase 2: Resolve wikilinks against expanded targets; handle glossary and autoref.

-- Check if target resembles a wikilink (not URL/mail/anchor).
local function is_wikilink_like(target)
  if target == nil or target == "" then return false end
  if target:match("^[a-zA-Z]+://") then return false end
  if target:match("^mailto:") then return false end
  if target:match("^#") then return false end
  return true
end

-- Resolve wikilinks: glossary → \gls{}, embed targets → \autoref/\hyperref, else plain text.
local function resolve_wikilink(link)
  if not is_wikilink_like(link.target) then return nil end

  -- Strip .md extension and leading ./ if present; map keys have no extension.
  local target = link.target
  target = target:gsub("^%./", "")
  target = target:gsub("%.md$", "")

  -- Try glossary first.
  local gls = try_resolve_glossary(target)
  if gls then return gls end

  -- Try embed target; use \autoref for default display, \hyperref for custom text.
  local label = available_targets[target]
  if label then
    local content_str = pandoc.utils.stringify(link.content)
    local is_default_display = (content_str == link.target or content_str == target)
    if autoref_targets[target] and is_default_display then
      return pandoc.RawInline("latex", "\\autoref{" .. label .. "}")
    end
    local result = { pandoc.RawInline("latex", "\\hyperref[" .. label .. "]{") }
    for _, inline in ipairs(link.content) do table.insert(result, inline) end
    table.insert(result, pandoc.RawInline("latex", "}"))
    return result
  end

  -- Fall back to plain-text content if unresolved.
  return link.content
end

-- ============================================================================
-- Abstract resolution: meta.abstract may be plain text or a solo wikilink.
-- Solo wikilink ([[Note]] or [[Note#Heading]]) → note body is transcluded via
-- load_note (frontmatter stripped, embeds expanded, slices supported).
-- ============================================================================

-- Return wikilink target if meta value consists of exactly one wikilink.
local function meta_solo_wikilink(meta_value)
  local mt = pandoc.utils.type(meta_value)
  local inlines
  if mt == "Inlines" then
    inlines = meta_value
  elseif mt == "Blocks" and #meta_value == 1
      and (meta_value[1].t == "Para" or meta_value[1].t == "Plain") then
    inlines = meta_value[1].content
  else
    return nil
  end
  local link = nil
  for _, il in ipairs(inlines) do
    if il.t == "Link" then
      if link then return nil end -- more than one link → treat as text
      link = il
    elseif il.t ~= "Space" and il.t ~= "SoftBreak" and il.t ~= "LineBreak" then
      return nil -- non-whitespace content besides the link → treat as text
    end
  end
  if link and link.title == "wikilink" and is_wikilink_like(link.target) then
    return link.target
  end
  return nil
end

-- Expand a solo-wikilink abstract into the target note's blocks.
local function expand_abstract(meta)
  if not meta.abstract then return end
  local target = meta_solo_wikilink(meta.abstract)
  if target then
    meta.abstract = pandoc.MetaBlocks(load_note(target, 0))
  end
end

-- Resolve wikilinks inside the abstract content (transcluded or inline text).
local function resolve_abstract_links(meta)
  if not meta.abstract then return end
  local mt = pandoc.utils.type(meta.abstract)
  if mt == "Blocks" then
    meta.abstract = pandoc.walk_block(pandoc.Div(meta.abstract), { Link = resolve_wikilink }).content
  elseif mt == "Inlines" then
    meta.abstract = pandoc.walk_inline(pandoc.Span(meta.abstract), { Link = resolve_wikilink }).content
  end
end

-- Main entry: expand embeds, resolve wikilinks, flush glossary entries.
function Pandoc(doc)
  -- Phase 1: Expand embeds and register targets.
  doc.blocks = process_blocks(doc.blocks)
  -- Phase 1b: Expand abstract transclusion (after body, so body labels win first-embed).
  expand_abstract(doc.meta)
  -- Phase 2: Resolve wikilinks on expanded AST.
  local walked = pandoc.walk_block(pandoc.Div(doc.blocks), { Link = resolve_wikilink })
  doc.blocks = walked.content
  -- Phase 2b: Resolve wikilinks in abstract (glossary refs, autoref, plain-text fallback).
  resolve_abstract_links(doc.meta)
  -- Phase 3: Inject glossary entries to header-includes.
  flush_glossary_entries(doc)
  return doc
end
