-- Recursively include ![[Note]] transclusions. Pandoc 3.x compatible.

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

local visiting = {}
local process_blocks

local function load_note(src)
  local notename = src:match("^([^#]+)") or src
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