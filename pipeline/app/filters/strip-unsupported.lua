-- Strip characters the pdflatex engine can't typeset (emoji & pictographs)

local removed = 0

local function should_strip(cp)
  return (cp >= 0x1F000 and cp <= 0x1FFFF)   -- emoji & pictographs (SMP)
    or (cp >= 0x2600 and cp <= 0x27BF)        -- misc symbols + dingbats (incl. ✅, ❌)
    or (cp >= 0x2B00 and cp <= 0x2BFF)        -- misc symbols & arrows (incl. ⭐)
    or (cp >= 0x1F1E6 and cp <= 0x1F1FF)      -- regional indicators (flags)
    or (cp >= 0xFE00 and cp <= 0xFE0F)        -- variation selectors
    or cp == 0x200D                           -- zero-width joiner
    or cp == 0x20E3                           -- combining enclosing keycap
end

local function strip(s)
  -- Fast path: nothing multi-byte means pure ASCII, nothing to strip.
  if not s:find("[\194-\244]") then return s end
  local out = {}
  -- Count a run of consecutive stripped codepoints as ONE symbol — many emoji are
  -- multiple codepoints (base + variation selector, flags, ZWJ sequences).
  local in_run = false
  local ok = pcall(function()
    for _, cp in utf8.codes(s) do
      if should_strip(cp) then
        if not in_run then
          removed = removed + 1
          in_run = true
        end
      else
        in_run = false
        out[#out + 1] = utf8.char(cp)
      end
    end
  end)
  if not ok then return s end
  return table.concat(out)
end

function Str(el)
  el.text = strip(el.text)
  return el
end

function Code(el)
  el.text = strip(el.text)
  return el
end

function CodeBlock(el)
  el.text = strip(el.text)
  return el
end

function Pandoc(doc)
  if removed > 0 then
    io.stderr:write(">>> NOPE-STRIPPED " .. removed .. "\n")
  end
  return doc
end
