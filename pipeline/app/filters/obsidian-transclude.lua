-- Recursively include ![[Note]] transclusions. Pandoc 3.x compatible.
-- Supports:
--   ![[Note]]                  full note
--   ![[Note#Heading]]          slice from Heading to next heading of same/higher level
--   ![[Note#^block-id]]        single block ending in "^block-id"
--   ![[Bild.png|Caption]]      labeled figure with caption
--   ![[Bild.png]]              labeled figure, filename as caption
--
-- Frontmatter-gesteuerte Wraps (Single-Source: Konfiguration immer im
-- Frontmatter der embedded Note, nie über den Embed-Tag):
--   latex-env: theorem (oder lemma, definition, …)
--       → \begin{env}[latex-short]\label{note:X}…\end{env}
--   latex-env: table
--       caption: "…"   ← MANDATORY, sonst Filter-Fehler
--       → Pandoc-Table mit Caption aus Frontmatter, injiziertes \label{tab:X}.
--
-- After embedding, the filter also resolves wikilinks ([[Note]], [[Note#H]],
-- [[Note#^id]], [[Bild.png]]) against the targets that ended up in the PDF.
-- Image-Wikilinks und Tabellen-Wikilinks auf eingebettete Targets werden zu
-- \autoref ("Abbildung N" / "Tabelle N"), Custom-Display bleibt \hyperref.
-- Wikilinks to non-embedded targets fall back to plain text — content is preserved.

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

-- Parse a transclusion source into (notename, anchor_type, anchor_value).
-- anchor_type is "none", "heading", or "block_id".
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

-- ============================================================================
-- Phase 1 helpers — slicing
-- ============================================================================

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

local function block_has_id(block, target_id)
  if block.t ~= "Para" and block.t ~= "Plain" then return false end
  local content = block.content
  if #content == 0 then return false end
  local last = content[#content]
  if last.t ~= "Str" then return false end
  return last.text == "^" .. target_id
end

local function slice_by_block_id(blocks, target_id)
  for _, block in ipairs(blocks) do
    if block_has_id(block, target_id) then
      -- Keep the trailing ^id here; annotate_with_labels strips & labels it.
      return { block }, true
    end
  end
  return {}, false
end

-- ============================================================================
-- Phase 1 — annotate embedded blocks with hyperref targets,
-- populate the available_targets map for the resolver.
-- ============================================================================

local available_targets = {}

-- Notes whose embed is wrapped in a labeled LaTeX environment (e.g. theorem, lemma) via `latex-env` frontmatter. The wikilink resolver switches to \autoref for default-display links on these targets so the rendered text becomes "Theorem N" instead of the note name.
local autoref_targets = {}

-- Strip a trailing ^id Str (with preceding whitespace) from a block's inlines.
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
        -- Already labeled in a previous embed
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
        -- Either way the ^id suffix is gone from visible text.
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

-- ============================================================================
-- Embedding (recursive)
-- ============================================================================

local visiting = {}
local process_blocks

-- Extrahiert Frontmatter-Inlines (z.B. caption: "Text") als flache
-- Inline-Liste. Unterstützt MetaInlines, MetaString und MetaBlocks (1. Block).
local function meta_to_inlines(meta_value)
  if not meta_value then return nil end
  local t = type(meta_value)
  if t == "string" then
    return { pandoc.Str(meta_value) }
  end
  -- MetaInlines: iterierbare Liste von Inlines
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

local function load_note(src)
  local notename, anchor_type, anchor_value = parse_anchor(src)
  -- Canonical-Form ohne .md, damit Map-Keys konsistent zum Resolver bleiben
  -- (der Resolver strippt .md vom Wikilink-Target — Embedder muss das gleiche tun).
  -- Andere Extensions (z.B. .png für Images) bleiben unverändert.
  notename = notename:gsub("%.md$", "")
  local path = find_note_path(notename)
  if not path then
    return {pandoc.Para({pandoc.Str("[Nicht gefunden: " .. notename .. "]")})}
  end
  if visiting[path] then
    return {pandoc.Para({pandoc.Str("[Zirkulärer Embed: " .. notename .. "]")})}
  end
  visiting[path] = true
  local f = io.open(path, "rb")
  local content = f:read("*all"); f:close()
  local doc = pandoc.read(content, "markdown+wikilinks_title_after_pipe")
  local blocks = process_blocks(doc.blocks)
  visiting[path] = nil

  local sliced
  if anchor_type == "heading" then
    local s, found = slice_by_heading(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Section nicht gefunden: " .. notename .. "#" .. anchor_value .. "]")})}
    end
    sliced = s
  elseif anchor_type == "block_id" then
    local s, found = slice_by_block_id(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Block-ID nicht gefunden: " .. notename .. "#^" .. anchor_value .. "]")})}
    end
    sliced = s
  else
    sliced = blocks
  end

  -- LaTeX-environment wrap on full embeds
  if anchor_type == "none" then
    local meta_env = doc.meta["latex-env"]
    if meta_env then
      local env_name = pandoc.utils.stringify(meta_env)

      -- ----------------------------------------------------------------
      -- Sondersyntax: latex-env: table
      -- Pandoc rendert Markdown-Tabellen als (long)table — die dürfen
      -- NICHT in einem `\begin{table}` floaten. Stattdessen labeln wir
      -- die Pandoc-Table direkt an ihrer Caption.
      --
      -- Single-Source-Konfiguration: Caption MUSS im Frontmatter der Note
      -- als `caption: "…"` stehen. Keine Pipe-Caption, kein Pandoc-Native-
      -- `: …`-Fallback. Wenn die Caption fehlt → harter Filter-Error.
      -- \autoref auf das tab:-Label rendert "Tabelle N" (siehe
      -- \tableautorefname-Override im eisvogel.tex).
      -- ----------------------------------------------------------------
      if env_name == "table" then
        local caption_inlines = meta_to_inlines(doc.meta.caption)
        if not caption_inlines or #caption_inlines == 0 then
          error("[obsidian-transclude] Note '" .. notename
            .. "' hat latex-env: table, aber kein 'caption:' im Frontmatter.")
        end

        local note_label = "tab:" .. sanitize_label_id(notename)
        local first_embed = (available_targets[notename] == nil)
        available_targets[notename] = note_label
        autoref_targets[notename] = true

        local annotated = annotate_with_labels(sliced, notename, true)

        local table_found = false
        for _, b in ipairs(annotated) do
          if b.t == "Table" then
            -- Caption immer aus Frontmatter setzen (überschreibt evtl.
            -- existierende Pandoc-Caption — Single-Source-Garantie).
            b.caption = pandoc.Caption({ pandoc.Plain(caption_inlines) })

            -- \label nur beim ersten Embed setzen (Mehrfach-Embed der
            -- gleichen Note würde sonst zu "multiply defined"-Warnungen führen).
            if first_embed then
              local last = b.caption.long[#b.caption.long]
              table.insert(last.content,
                pandoc.RawInline("latex", "\\label{" .. note_label .. "}"))
            end
            table_found = true
            break
          end
        end

        if not table_found then
          error("[obsidian-transclude] Note '" .. notename
            .. "' hat latex-env: table, aber keine Tabelle im Inhalt gefunden.")
        end

        return annotated
      end

      -- ----------------------------------------------------------------
      -- Default-Env-Wrap (theorem, lemma, definition, …)
      -- ----------------------------------------------------------------
      local env_short = doc.meta["latex-short"] and pandoc.utils.stringify(doc.meta["latex-short"]) or nil
      local note_label = "note:" .. sanitize_label_id(notename)

      -- Annotate inner headings/block-IDs
      local annotated_inner = annotate_with_labels(sliced, notename, true)

      local opener = "\\begin{" .. env_name .. "}"
      if env_short and env_short ~= "" then
        opener = opener .. "[" .. env_short .. "]"
      end
      opener = opener .. "\\label{" .. note_label .. "}"

      local wrapped = { pandoc.RawBlock("latex", opener) }
      for _, b in ipairs(annotated_inner) do table.insert(wrapped, b) end
      table.insert(wrapped, pandoc.RawBlock("latex", "\\end{" .. env_name .. "}"))

      autoref_targets[notename] = true
      return wrapped
    end
  end

  return annotate_with_labels(sliced, notename)
end

-- Liefert die src eines Figure-Blocks, der einen Note-Embed enthält
-- (Image mit nicht-image-Extension wie .md). nil sonst.
local function figure_transclusion_src(block)
  if block.t ~= "Figure" or #block.content ~= 1 then return nil end
  local inner = block.content[1]
  if (inner.t ~= "Plain" and inner.t ~= "Para") or #inner.content ~= 1 then return nil end
  local img = inner.content[1]
  if img.t ~= "Image" or is_image_file(img.src) then return nil end
  return img.src
end

-- ============================================================================
-- Image-Figure-Feature
-- Pandoc baut aus einem alleinstehenden Image-Inline automatisch ein
-- `Figure` mit Caption (alt-text). Wir hängen hier nur einen \label{fig:...}
-- ans Ende der Caption und tragen den Image-Source in die Wikilink-Map ein,
-- damit [[bild.png]] zu \autoref{fig:...} aufgelöst wird → "Abbildung N".
-- Pandoc 3.9.x emit kein \label aus Figure.attr.identifier — RawInline in
-- der Caption ist der portable Weg, der unabhängig von Pandoc-Version
-- funktioniert (\label im \caption ist Standard-LaTeX und greift auf den
-- bereits erhöhten figure-Counter zu).
-- ============================================================================
local function register_image_figure(figure_block)
  if figure_block.t ~= "Figure" or #figure_block.content ~= 1 then return nil end
  local inner = figure_block.content[1]
  if (inner.t ~= "Plain" and inner.t ~= "Para") or #inner.content ~= 1 then return nil end
  local img = inner.content[1]
  if img.t ~= "Image" or not is_image_file(img.src) then return nil end

  local src = img.src
  -- Mehrfach-Embed des gleichen Bildes: nur erstes registrieren/labeln.
  if available_targets[src] then return figure_block end

  local label = "fig:" .. sanitize_label_id(src)
  available_targets[src] = label
  autoref_targets[src] = true

  -- Pandoc legt für ![file.png|Caption] die Caption in figure.caption.long ab.
  -- Falls leer (sollte nicht vorkommen, aber sicher ist sicher), fallback auf
  -- den Dateinamen.
  local caption = figure_block.caption
  if not caption or not caption.long or #caption.long == 0 then
    caption = pandoc.Caption({ pandoc.Plain({ pandoc.Str(src) }) })
    figure_block.caption = caption
  end

  -- \label ans Ende der letzten Caption-Block-Inlines hängen.
  local last_block = caption.long[#caption.long]
  if last_block.content then
    table.insert(last_block.content, pandoc.RawInline("latex", "\\label{" .. label .. "}"))
  end

  return figure_block
end

local function process_para(el)
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
      for _, b in ipairs(load_note(inline.src)) do table.insert(result, b) end
    else
      table.insert(buffer, inline)
    end
  end
  flush()
  return result
end

process_blocks = function(blocks)
  local result = {}
  for _, block in ipairs(blocks) do
    local src = figure_transclusion_src(block)
    if src then
      for _, b in ipairs(load_note(src)) do table.insert(result, b) end
    elseif block.t == "Figure" then
      -- Image-Embed: caption + \label{fig:...} setzen, in Wikilink-Map eintragen.
      local labeled = register_image_figure(block)
      table.insert(result, labeled or block)
    elseif block.t == "Para" or block.t == "Plain" then
      local replaced = process_para(block)
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

-- ============================================================================
-- Phase 2 — wikilink resolution against available_targets
-- ============================================================================

local function is_wikilink_like(target)
  if target == nil or target == "" then return false end
  if target:match("^[a-zA-Z]+://") then return false end
  if target:match("^mailto:") then return false end
  if target:match("^#") then return false end
  return true
end

local function resolve_wikilink(link)
  if not is_wikilink_like(link.target) then return nil end

  -- Pandoc may keep ".md" in target; map keys are without extension.
  -- Also strip a leading "./" if Pandoc prefixes relative-file targets.
  local target = link.target
  target = target:gsub("^%./", "")
  target = target:gsub("%.md$", "")


  local label = available_targets[target]
  if label then
    -- If the target is wrapped in a labeled environment AND the user used the default display (no |Custom), switch to \autoref so the rendered text becomes "Theorem N" instead of the bare note name. Custom-display links
    -- always stay on \hyperref to preserve the user's chosen text.
    local content_str = pandoc.utils.stringify(link.content)
    local is_default_display = (content_str == link.target or content_str == target)
    if autoref_targets[target] and is_default_display then
      return pandoc.RawInline("latex", "\\autoref{" .. label .. "}")
    end
    -- Wrap link.content in \hyperref[label]{...}, keeping Markdown inlines intact.
    local result = { pandoc.RawInline("latex", "\\hyperref[" .. label .. "]{") }
    for _, inline in ipairs(link.content) do table.insert(result, inline) end
    table.insert(result, pandoc.RawInline("latex", "}"))
    return result
  end

  -- Fallback: target not embedded → render link content as plain inlines.
  return link.content
end

function Pandoc(doc)
  -- Phase 1: expand embeds and annotate targets
  doc.blocks = process_blocks(doc.blocks)
  -- Phase 2: resolve wikilinks against the targets that actually made it in pandoc.walk_block works on a single block tree; wrap in a Div to walk all top-level blocks at once. Compatible with older Pandoc 3.x that doesn't
  -- expose the :walk method on Blocks lists.
  local walked = pandoc.walk_block(pandoc.Div(doc.blocks), { Link = resolve_wikilink })
  doc.blocks = walked.content
  return doc
end
