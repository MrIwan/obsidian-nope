-- Recursively include ![[Note]] transclusions. Pandoc 3.x compatible.
-- Supports:
--   ![[Note]]                  full note
--   ![[Note#Heading]]          slice from Heading to next heading of same/higher level
--   ![[Note#^block-id]]        single block ending in "^block-id"

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
  if not hash then
    return src, "none", nil
  end
  local notename = src:sub(1, hash - 1)
  local rest = src:sub(hash + 1)
  if notename == "" then notename = src end
  if rest == "" then return notename, "none", nil end
  if rest:sub(1, 1) == "^" then
    return notename, "block_id", rest:sub(2)
  end
  return notename, "heading", rest
end

-- Stringify inlines for case-sensitive heading-text comparison.
local function inlines_text(inlines)
  return pandoc.utils.stringify(inlines)
end

-- Slice blocks from the first Header matching `heading_text` up to (but not
-- including) the next Header of equal or higher level. The matched Header
-- itself is included so the section keeps its title in the PDF.
local function slice_by_heading(blocks, heading_text)
  local result = {}
  local started = false
  local start_level = nil
  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      if not started then
        if inlines_text(block.content) == heading_text then
          started = true
          start_level = block.level
          table.insert(result, block)
        end
      else
        if block.level <= start_level then
          break
        else
          table.insert(result, block)
        end
      end
    elseif started then
      table.insert(result, block)
    end
  end
  return result, started
end

-- True if the block's content ends in a Str element of the form "^<target_id>".
local function block_has_id(block, target_id)
  if block.t ~= "Para" and block.t ~= "Plain" then return false end
  local content = block.content
  if #content == 0 then return false end
  local last = content[#content]
  if last.t ~= "Str" then return false end
  return last.text == "^" .. target_id
end

-- Return a copy of the block with the trailing "^id" Str (and any preceding
-- whitespace inlines) removed.
local function strip_block_id_suffix(block, target_id)
  if block.t ~= "Para" and block.t ~= "Plain" then return block end
  local content = {}
  for _, inline in ipairs(block.content) do
    table.insert(content, inline)
  end
  if #content > 0 then
    local last = content[#content]
    if last.t == "Str" and last.text == "^" .. target_id then
      table.remove(content)
      while #content > 0 do
        local tail = content[#content]
        if tail.t == "Space" or tail.t == "SoftBreak" or tail.t == "LineBreak" then
          table.remove(content)
        else
          break
        end
      end
    end
  end
  if block.t == "Para" then return pandoc.Para(content) end
  return pandoc.Plain(content)
end

local function slice_by_block_id(blocks, target_id)
  for _, block in ipairs(blocks) do
    if block_has_id(block, target_id) then
      return { strip_block_id_suffix(block, target_id) }, true
    end
  end
  return {}, false
end

local visiting = {}
local process_blocks

local function load_note(src)
  local notename, anchor_type, anchor_value = parse_anchor(src)
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

  if anchor_type == "heading" then
    local slice, found = slice_by_heading(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Section nicht gefunden: " .. notename .. "#" .. anchor_value .. "]")})}
    end
    return slice
  elseif anchor_type == "block_id" then
    local slice, found = slice_by_block_id(blocks, anchor_value)
    if not found then
      return {pandoc.Para({pandoc.Str("[Block-ID nicht gefunden: " .. notename .. "#^" .. anchor_value .. "]")})}
    end
    return slice
  end
  return blocks
end

-- Detect figure
local function figure_transclusion_src(block)
  if block.t ~= "Figure" or #block.content ~= 1 then return nil end
  local inner = block.content[1]
  if (inner.t ~= "Plain" and inner.t ~= "Para") or #inner.content ~= 1 then
    return nil
  end
  local img = inner.content[1]
  if img.t == "Image" and not is_image_file(img.src) then return img.src end
  return nil
end

local function process_para(el)
  local has = false
  for _, inline in ipairs(el.content) do
    if inline.t == "Image" and not is_image_file(inline.src) then
      has = true; break
    end
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

function Pandoc(doc)
  doc.blocks = process_blocks(doc.blocks)
  return doc
end
