--   %%text%%   --> removed
--   ==text==   --> wrapped in \nopehl{...} (default: soul \hl, injected below).

local doc_state = { hidden = false }
local has_highlight = false

local process_inlines  -- forward declaration

-- Process nested inline containers consistently within bold/italic/links.
local function recurse_inline(inline)
	if inline.content and (
		   inline.t == "Strong" or inline.t == "Emph"
		or inline.t == "Span" or inline.t == "Underline"
		or inline.t == "Strikeout" or inline.t == "Subscript"
		or inline.t == "Superscript" or inline.t == "SmallCaps"
		or inline.t == "Quoted" or inline.t == "Link"
		or inline.t == "Cite") then
		inline.content = process_inlines(inline.content)
	end
	return inline
end

process_inlines = function(inlines)
	local out = {}
	local marked = nil  -- nil = not buffering a highlight, table = buffering

	local function emit(inline)
		if doc_state.hidden then return end
		if marked then
			table.insert(marked, inline)
		else
			table.insert(out, inline)
		end
	end

	local function end_marked()
		-- Wrap buffered content in \nopehl{} and flush.
		has_highlight = true
		table.insert(out, pandoc.RawInline("latex", "\\nopehl{"))
		for _, x in ipairs(marked) do table.insert(out, x) end
		table.insert(out, pandoc.RawInline("latex", "}"))
		marked = nil
	end

	local function revert_marked()
		-- Flush unbalanced == as literal text.
		if marked then
			table.insert(out, pandoc.Str("=="))
			for _, x in ipairs(marked) do table.insert(out, x) end
			marked = nil
		end
	end

	-- Parse Str tokens for %% and == markers; handle multiple transitions per token.
	local function handle_str(text)
		while #text > 0 do
			if doc_state.hidden then
				local s, e = text:find("%%%%")
				if not s then return end
				text = text:sub(e + 1)
				doc_state.hidden = false
			elseif marked then
				local s, e = text:find("==")
				if not s then
					if #text > 0 then table.insert(marked, pandoc.Str(text)) end
					return
				end
				if s > 1 then
					table.insert(marked, pandoc.Str(text:sub(1, s - 1)))
				end
				text = text:sub(e + 1)
				end_marked()
			else
				local cs, ce = text:find("%%%%")
				local ms, me = text:find("==")
				if cs and (not ms or cs < ms) then
					if cs > 1 then
						table.insert(out, pandoc.Str(text:sub(1, cs - 1)))
					end
					text = text:sub(ce + 1)
					doc_state.hidden = true
				elseif ms then
					if ms > 1 then
						table.insert(out, pandoc.Str(text:sub(1, ms - 1)))
					end
					text = text:sub(me + 1)
					marked = {}
				else
					if #text > 0 then
						table.insert(out, pandoc.Str(text))
					end
					return
				end
			end
		end
	end

	for _, inline in ipairs(inlines) do
		if inline.t == "Str" then
			handle_str(inline.text)
		else
			emit(recurse_inline(inline))
		end
	end

	revert_marked()
	return out
end

local process_block  -- forward declaration
local walk_blocks

walk_blocks = function(blocks)
	local out = {}
	for _, block in ipairs(blocks) do
		local nb = process_block(block)
		if nb then table.insert(out, nb) end
	end
	return out
end

process_block = function(block)
	if block.t == "Para" then
		local nc = process_inlines(block.content)
		if #nc == 0 then return nil end
		return pandoc.Para(nc)
	elseif block.t == "Plain" then
		local nc = process_inlines(block.content)
		if #nc == 0 then return nil end
		return pandoc.Plain(nc)
	elseif block.t == "Header" then
		return pandoc.Header(block.level, process_inlines(block.content), block.attr)
	elseif block.t == "BlockQuote" then
		return pandoc.BlockQuote(walk_blocks(block.content))
	elseif block.t == "Div" then
		return pandoc.Div(walk_blocks(block.content), block.attr)
	elseif block.t == "BulletList" then
		local items = {}
		for _, item in ipairs(block.content) do
			local ni = walk_blocks(item)
			if #ni > 0 then table.insert(items, ni) end
		end
		if #items == 0 then return nil end
		return pandoc.BulletList(items)
	elseif block.t == "OrderedList" then
		local items = {}
		for _, item in ipairs(block.content) do
			local ni = walk_blocks(item)
			if #ni > 0 then table.insert(items, ni) end
		end
		if #items == 0 then return nil end
		return pandoc.OrderedList(items, block.listAttributes)
	else
		-- CodeBlock, RawBlock, HorizontalRule, etc.:
		-- drop while inside a hidden region, otherwise pass through unchanged.
		if doc_state.hidden then return nil end
		return block
	end
end

function Pandoc(doc)
	doc.blocks = walk_blocks(doc.blocks)
	-- Inject the guarded \nopehl default (soul \hl); a template can predefine it to restyle.
	if has_highlight then
		local hi = doc.meta["header-includes"] or pandoc.MetaList({})
		if hi.t ~= "MetaList" then hi = pandoc.MetaList({hi}) end
		table.insert(hi, pandoc.MetaBlocks({
			pandoc.RawBlock("latex", "\\providecommand{\\nopehl}[1]{\\hl{#1}}")
		}))
		doc.meta["header-includes"] = hi
	end
	return doc
end
