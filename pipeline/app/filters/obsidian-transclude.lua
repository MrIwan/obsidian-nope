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
--   latex-env: mermaid
--       caption: "…"   ← MANDATORY
--       Body enthält genau einen ```mermaid-Block. mmdc rendert das Diagramm
--       zu PNG in $MERMAID_WORK_DIR/mermaid/<sha1>.png, Filter ersetzt den
--       Block durch eine Pandoc-Figure mit Caption + \label{fig:X}.
--
-- Auto-Heading-Shift: shift = max(0, host_last_level + 1 − min_embed_level).
-- Details siehe Handover.
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

-- Heading-Shift-Helpers — siehe Handover für den Algorithmus.
-- shift_headings: in-place, no-op bei shift <= 0, clamp max 6.

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
-- Mermaid-Render (für `latex-env: mermaid`-Notes; ruft mmdc im Container auf)
--
-- PNG landet in $MERMAID_WORK_DIR/mermaid/<sha1>.png. WICHTIG: Der Image-src
-- im AST muss ein ABSOLUTER Pfad sein. Pandoc löst relative Image-Pfade über
-- `--resource-path` auf, und $MERMAID_WORK_DIR ist da nicht enthalten — bei
-- einem relativen Pfad droppt der LaTeX-Writer den Image-Inline komplett und
-- gibt nur leere `{}` in der Figure aus (verifizierter Stolperstein). Mit
-- absolutem Pfad umgehen wir die Pandoc-Pfad-Resolution gänzlich.
-- Sha1-Hash über den Diagramm-Source dient als Cache-Key: identische
-- Diagramme rendern nur einmal pro Build (auch über mehrere Notes).
-- ============================================================================

local mermaid_outdir = nil

-- Default-Scale für mmdc (--scale flag). 1 = native Basis-Auflösung
-- (800px Breite), 2 = doppelt (~1600px → grob 300dpi bei halber Seitenbreite,
-- für Print-PDFs scharf genug). Per Frontmatter `scale:` übersteuerbar
-- (Werte 1–5 typisch; mmdc weist Werte außerhalb ab).
local MERMAID_DEFAULT_SCALE = 2

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

-- Rendert Diagramm-Source zu PNG, gibt den ABSOLUTEN Pfad fürs .tex zurück.
-- Bei Render-Fehler: nil + Log-Eintrag in stderr (→ last_latex_run.log).
-- Scale geht in den Cache-Key ein — sonst würden Renders mit anderer
-- Auflösung kollidieren.
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

-- ============================================================================
-- LaTeX-Environment-Wraps für `latex-env: …`-Notes
--
-- Drei Handler nach Env-Family:
--   wrap_math   für equation, align, gather, multline, alignat (+ Stern-Varianten)
--   wrap_table  nur für `table` (Sonderfall wegen Caption-Pflicht + longtable-Konflikt)
--   wrap_block  Default-Handler — theorem, lemma, definition, proof + jeder
--               user-defined amsthm-Env (\newtheorem im Template)
--
-- Shared Pattern: `register_target` setzt Label + autoref-Flag + first_embed-Guard,
-- `find_block` lokalisiert den zu labelnden Block. Beide Handler-übergreifend,
-- damit ein neuer Env-Wert nur eine Zeile in `MATH_ENVS` bzw. einen zusätzlichen
-- Handler kostet statt ~40 Zeilen Boilerplate.
-- ============================================================================

local MATH_ENVS = {
  equation = true, ["equation*"] = true,
  align = true,    ["align*"] = true,
  gather = true,   ["gather*"] = true,
  multline = true, ["multline*"] = true,
  alignat = true,  ["alignat*"] = true,
}

-- Registriert die Note als verfügbares Wikilink-Target mit dem gegebenen
-- LaTeX-Label-Prefix (z.B. "eq", "tab", "note"). Setzt zusätzlich `autoref_targets`,
-- damit Default-Display-Wikilinks „Gleichung N" / „Tabelle N" / „Theorem N"
-- rendern statt den nackten Note-Namen.
-- Returns: full_label_string (z.B. "eq:Navier-Stokes"), is_first_embed (bool).
-- WICHTIG: muss VOR `annotate_with_labels` aufgerufen werden, sonst registriert
-- letzteres die Note intern mit "note:"-Prefix und der first_embed-Snapshot kippt.
local function register_target(notename, label_prefix)
  local label = label_prefix .. ":" .. sanitize_label_id(notename)
  local first_embed = (available_targets[notename] == nil)
  available_targets[notename] = label
  autoref_targets[notename] = true
  return label, first_embed
end

-- Findet den ersten Block in `blocks`, der `predicate(block)` zu true auswertet.
-- Returns: (index, block) oder (nil, nil) wenn nichts passt.
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

-- Mermaid-CodeBlock-Predicate. Greift sowohl bei der Standard-Fence
-- ```mermaid (Pandoc setzt class "mermaid") als auch bei expliziter
-- Attribut-Form `{.mermaid}`.
local function is_mermaid_code(b)
  if b.t ~= "CodeBlock" then return false end
  for _, cls in ipairs(b.classes or {}) do
    if cls == "mermaid" then return true end
  end
  return false
end

-- ----------------------------------------------------------------------------
-- wrap_math: Atomic-Math-Note (equation, align, gather, multline, alignat)
--
-- Erwartet einen `$$…$$`-Block (= Para mit einem DisplayMath-Inline) im Body.
-- Ersetzt diesen Block durch `\begin{<env>}\label{eq:X}…\end{<env>}` als RawBlock.
-- Permissiv: Prosa um den Math-Block bleibt erhalten und wird mit-embedded.
-- Bei mehreren Math-Blöcken wird nur der erste gewrapped/gelabelt; weitere
-- bleiben Plain-Display-Math (kein Counter, kein Label).
--
-- Caption-Frontmatter wird absichtlich NICHT gerendert (Equations haben in
-- LaTeX keine native Caption). `caption:` ist optional und reine Obsidian-Doku.
-- ----------------------------------------------------------------------------
local function wrap_math(notename, env_name, sliced, doc_meta)
  local label, first_embed = register_target(notename, "eq")
  local annotated = annotate_with_labels(sliced, notename, true)

  local idx = find_block(annotated, is_display_math)
  if not idx then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: " .. env_name
      .. ", aber kein $$…$$-Block im Inhalt gefunden.")
  end

  -- Whitespace um den Math-Text trimmen, sonst entstehen Leerzeilen innerhalb
  -- der Math-Umgebung — Leerzeile = Paragraph-Break = Math-Mode-Termination.
  -- Symptom: "amsmath Error: \begin{aligned} allowed only in math mode" +
  -- "Bad math environment delimiter".
  local content = annotated[idx].content[1].text:gsub("^%s+", ""):gsub("%s+$", "")
  local label_part = first_embed and ("\\label{" .. label .. "}") or ""
  annotated[idx] = pandoc.RawBlock("latex",
    "\\begin{" .. env_name .. "}" .. label_part .. "\n"
    .. content .. "\n\\end{" .. env_name .. "}")

  return annotated
end

-- ----------------------------------------------------------------------------
-- wrap_table: Atomic-Tabellen-Note (nur env_name == "table")
--
-- Caption MUSS im Frontmatter als `caption: "…"` stehen (Single-Source-Garantie,
-- keine Pipe-Caption, kein Pandoc-Native-Caption-Fallback). Caption + \label{tab:X}
-- werden direkt an die Pandoc-Table gehängt — kein `\begin{table}`-Wrap, weil
-- das mit longtable konfligieren würde.
-- ----------------------------------------------------------------------------
local function wrap_table(notename, env_name, sliced, doc_meta)
  local caption_inlines = meta_to_inlines(doc_meta.caption)
  if not caption_inlines or #caption_inlines == 0 then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: table, aber kein 'caption:' im Frontmatter.")
  end

  local label, first_embed = register_target(notename, "tab")
  local annotated = annotate_with_labels(sliced, notename, true)

  local _, table_block = find_block(annotated, is_table)
  if not table_block then
    error("[obsidian-transclude] Note '" .. notename
      .. "' hat latex-env: table, aber keine Tabelle im Inhalt gefunden.")
  end

  -- Caption immer aus Frontmatter setzen (überschreibt evtl. existierende
  -- Pandoc-Caption — Single-Source).
  table_block.caption = pandoc.Caption({ pandoc.Plain(caption_inlines) })

  -- \label nur beim ersten Embed setzen (sonst "multiply defined"-Warnung).
  if first_embed then
    local last = table_block.caption.long[#table_block.caption.long]
    table.insert(last.content,
      pandoc.RawInline("latex", "\\label{" .. label .. "}"))
  end

  return annotated
end

-- ----------------------------------------------------------------------------
-- wrap_mermaid: Atomic-Mermaid-Note (nur env_name == "mermaid")
--
-- Body MUSS einen ```mermaid-Block enthalten (Pandoc parst die Standard-Fence
-- als CodeBlock mit class "mermaid"). Caption MUSS im Frontmatter stehen —
-- Single-Source, kein Inline-Caption-Fallback, kein Default auf Dateinamen.
--
-- Reihenfolge im Wrap (verifizierte Stolpersteine):
--   1. Render mmdc → ABSOLUTER PNG-Pfad. Relativer Pfad scheitert weiter unten
--      im Pandoc-LaTeX-Writer, weil $MERMAID_WORK_DIR nicht im resource-path
--      ist — der Image-Inline würde dann auf `{}` reduziert.
--   2. Image-Inline mit NON-EMPTY Alt-Text (notename als Accessibility-
--      Metadata analog zu Pandoc's eigenen Image-Figures, die per
--      --extract-media generiert werden). Leerer Alt führt im LaTeX-Writer
--      ebenfalls zu fehlendem \includegraphics.
--   3. Pandoc.Figure mit Caption aus Frontmatter, \label{fig:X} als
--      RawInline am Caption-Ende. Beim ersten Embed wird Label gesetzt und
--      die Note in `available_targets`/`autoref_targets` registriert —
--      Wikilinks auf die Note resolven dann zu „Abbildung N".
--
-- Zwei orthogonale Frontmatter-Keys steuern Bild-Größe vs. Schärfe:
--   `w:` (oder `width:`) — Darstellungsgröße im PDF, gesetzt als
--      img.attributes.width (Prozent, px, cm, mm, LaTeX-Längen wie
--      0.6\textwidth). `w:` gewinnt bei Konflikt mit `width:`. Analog zu
--      `|w=…` bei Image-Embeds.
--   `scale:` — mmdc-Render-Auflösung (1–5), Default 2 (~1600px-Breite,
--      ~300dpi bei halber Seitenbreite). Höher → schärfer bei großen
--      Diagrammen, aber größere PNG-Datei. Geht in den Cache-Key ein,
--      damit Renders mit unterschiedlicher Auflösung nicht kollidieren.
-- ----------------------------------------------------------------------------
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

  -- Render-Scale: Frontmatter `scale:` (1–5, mmdc `--scale`-Flag) übersteuert
  -- den Default. Höherer Scale = schärferes PNG = größere Datei.
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

  -- Width-Hint (Darstellungsgröße im PDF, unabhängig von `scale`): kurz `w:`
  -- (konsistent zu `|w=…` bei Image-Embeds) oder ausgeschrieben `width:`.
  -- `w:` gewinnt bei Konflikt. Akzeptiert Pandoc's übliche Längenangaben —
  -- Prozent (`60%`), LaTeX-Längen (`0.6\textwidth`, `5cm`, `60mm`), Pixel.
  local img_attrs = {}
  local width_meta = doc_meta.w or doc_meta.width
  if width_meta then
    img_attrs["width"] = pandoc.utils.stringify(width_meta)
  end

  -- Alt-Text aus dem Notenamen — fließt nur in `alt={…}` von \includegraphics
  -- als PDF-Accessibility-Metadata, ist im sichtbaren PDF NICHT enthalten.
  -- Sichtbarer Text kommt allein aus der Figure-Caption (caption_blocks).
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

-- ----------------------------------------------------------------------------
-- wrap_block: Default-Env-Wrap (theorem, lemma, definition, proof, …)
--
-- Greift für jeden `latex-env`-Wert, der nicht in MATH_ENVS oder "table" ist.
-- Wrappt die ganze Note in `\begin{<env>}[latex-short]\label{note:X}…\end{<env>}`.
-- `latex-short` aus Frontmatter wird als optionales amsthm-Argument verwendet
-- (z.B. [Pythagoras] → „Theorem 1 (Pythagoras)").
--
-- Counter inkrementiert bei jedem Embed (jeder Wrap ist eine eigene Env-Instanz),
-- `\label` aber nur beim ersten — sonst "multiply defined".
-- ----------------------------------------------------------------------------
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
-- Glossary-Resolution
--
-- Atomic Glossary-Notes haben `gls-id` (plus optional `gls-short`, `gls-long`,
-- `gls-description`, `gls-type`) im Frontmatter. Wikilinks `[[KI]]` werden im
-- Resolver (Phase 2 von Pandoc(doc)) zu `\gls{<id>}` ersetzt, der Entry für
-- `\newacronym`/`\newglossaryentry` wird gesammelt und am Ende in
-- `header-includes` injiziert (Phase 3 von Pandoc(doc)).
--
-- Funktioniert für Top-Level-Wikilinks UND für Wikilinks in expandierten
-- Embeds, weil der Walker in Phase 2 auf dem schon-expandierten AST läuft.
--
-- Frontmatter-Cache (`frontmatter_cache`) verhindert wiederholtes Datei-IO bei
-- mehrfachen Wikilinks auf dasselbe Target. Sentinel `false` markiert „schon
-- geprüft, kein gls-id" (vs. `nil` = „noch nicht geprüft").
-- ============================================================================

local glossary_entries = {}
local frontmatter_cache = {}

-- Liest YAML-Frontmatter via Regex (leichtgewichtig — kein Pandoc-Roundtrip
-- für reine Key-Value-Lookups). Akzeptiert `key: value` mit optionalen
-- Quotes. Reicht für die gls-*-Konvention.
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

-- Escapt LaTeX-Sonderzeichen für sicheren Einsatz in \newacronym{}/\newglossaryentry{}.
local function tex_escape(s)
  return s:gsub("([&%%$#_{}])", "\\%1")
end

-- Versucht, einen Wikilink-Target als Glossary-Ref aufzulösen.
-- Returns: RawInline `\gls{<id>}` bei Treffer, sonst nil.
-- Seiteneffekt: registriert den Entry in `glossary_entries` beim ersten Treffer.
local function try_resolve_glossary(target)
  local cached = frontmatter_cache[target]
  local fm
  if cached == false then
    return nil  -- bereits geprüft, kein gls-id
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

-- Schreibt die gesammelten `\newacronym`/`\newglossaryentry`-Lines in
-- `header-includes` und setzt `has-glossary` für die Template-Logik.
-- No-Op wenn nichts gesammelt wurde.
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

local function load_note(src, host_level)
  host_level = host_level or 0
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

  -- Auto-Shift NACH dem Slice (Slice-Break-Bedingung braucht Original-Levels).
  local min_level = find_min_header_level(sliced)
  if min_level then
    local shift = host_level + 1 - min_level
    if shift > 0 then shift_headings(sliced, shift) end
  end

  -- LaTeX-environment wrap on full embeds — Dispatch nach Env-Family.
  -- Drei Handler-Funktionen (oben definiert): wrap_math, wrap_table, wrap_block.
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
--
-- Width-Hint: ein optionaler Suffix `|w=<value>` in der Caption setzt die
-- Image-Width. `wikilinks_title_after_pipe` faltet alles hinter dem ersten
-- Pipe in den Title, also kommt `![[bild.png|Caption|w=60%]]` als Caption
-- `Caption|w=60%` rein. Wir scannen den letzten Caption-Block auf das
-- Marker-Muster, strippen ihn aus der Caption und übergeben den Wert als
-- Image-Attribut an Pandoc — Pandoc übersetzt z. B. `60%` zu
-- `width=0.6\textwidth` im LaTeX-Output. Akzeptierte Formate: `60%`, `400px`,
-- `8cm`, `0.5\textwidth` etc. — alles was Pandoc als Längenangabe versteht.
-- ============================================================================

-- Sucht das Width-Hint-Suffix `|w=<value>` am Ende der Caption-Inlines.
-- Returns (cleaned_inlines, width_string | nil). Bei nil bleibt die Caption
-- unverändert. Markierung muss am Ende stehen (nur Whitespace dahinter).
local function extract_width_hint(inlines)
  if not inlines or #inlines == 0 then return inlines, nil end

  -- Rückwärts den letzten Str finden, der `|w=` enthält. Alles dahinter darf
  -- nur Whitespace sein, sonst ist der Marker nicht am Caption-Ende und wir
  -- behandeln ihn als Caption-Text.
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

  -- Pandoc legt für ![file.png|Caption] die Caption in figure.caption.long ab.
  -- Falls leer (z. B. `![[bild.png]]` ohne Pipe), fallback auf den Dateinamen.
  local caption = figure_block.caption
  if not caption or not caption.long or #caption.long == 0 then
    caption = pandoc.Caption({ pandoc.Plain({ pandoc.Str(src) }) })
    figure_block.caption = caption
  end

  -- Width-Hint aus Caption herauslösen (pro Embed, vor dem Label-Anhang —
  -- Mehrfach-Embeds desselben Bildes dürfen jeweils eigene Widths haben).
  local last_block = caption.long[#caption.long]
  if last_block.content then
    local cleaned, width = extract_width_hint(last_block.content)
    if width then
      last_block.content = cleaned
      img.attributes = img.attributes or {}
      img.attributes["width"] = width
      -- Caption ist jetzt evtl. leer (z. B. `![[bild.png|w=60%]]`). Dann
      -- ebenfalls auf Dateiname als Caption zurückfallen, damit LoF + Label
      -- sinnvoll arbeiten.
      if #last_block.content == 0 then
        last_block.content = { pandoc.Str(src) }
      end
    end
  end

  -- Mehrfach-Embed: nur das erste Vorkommen kriegt das \label. Width-Hint
  -- wurde oben bereits gesetzt — sie pro Embed individuell zu erlauben ist
  -- intentional, label-Eindeutigkeit ist es auch.
  if available_targets[src] then return figure_block end

  local label = "fig:" .. sanitize_label_id(src)
  available_targets[src] = label
  autoref_targets[src] = true

  -- \label ans Ende der letzten Caption-Block-Inlines hängen.
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

process_blocks = function(blocks)
  -- current_level trackt nur Header DIESES Scopes; Embed-Header propagieren
  -- nicht (sonst shiften zwei Embeds in Folge gegen unterschiedliche Levels).
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

-- Resolver-Präzedenz für Wikilinks (drei sich gegenseitig ausschließende Fälle):
--   1. Glossary-Entry (`gls-id` im Frontmatter)       → \gls{<id>}
--   2. Embed-Target (in available_targets)            → \autoref oder \hyperref
--   3. Sonst                                          → Plain-Text (Denk-Verweis)
-- Glossary gewinnt bei Konflikt (Note mit gls-id UND latex-env: theorem) —
-- glossary-Refs sind intentional, theorem-Embeds sind seltener im selben Kontext.
local function resolve_wikilink(link)
  if not is_wikilink_like(link.target) then return nil end

  -- Pandoc behält ggf. ".md" im Target; Map-Keys sind ohne Extension.
  -- Auch führendes "./" strippen, falls Pandoc relative Pfade so präfixt.
  local target = link.target
  target = target:gsub("^%./", "")
  target = target:gsub("%.md$", "")

  -- Case 1: Glossary-Entry
  local gls = try_resolve_glossary(target)
  if gls then return gls end

  -- Case 2: Embed-Target
  local label = available_targets[target]
  if label then
    -- Default-Display (kein |Custom) auf autoref_target → \autoref ("Theorem N").
    -- Custom-Display bleibt \hyperref mit User-Text.
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

  -- Case 3: Plain-Text-Fallback
  return link.content
end

function Pandoc(doc)
  -- Phase 1: Embeds expandieren und Targets in available_targets registrieren.
  doc.blocks = process_blocks(doc.blocks)
  -- Phase 2: Wikilinks auflösen (glossary + embed-targets) auf dem nun-expandierten
  -- AST. walk_block braucht einen einzelnen Block-Baum — daher der Div-Wrap.
  local walked = pandoc.walk_block(pandoc.Div(doc.blocks), { Link = resolve_wikilink })
  doc.blocks = walked.content
  -- Phase 3: Gesammelte Glossary-Entries als \newacronym/\newglossaryentry in
  -- header-includes injizieren (Template kümmert sich um \makeglossaries + \printglossary).
  flush_glossary_entries(doc)
  return doc
end
