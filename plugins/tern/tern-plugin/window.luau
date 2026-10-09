-- omp-bridge: runs Lua sent by omp's tern_lua tool in the Tern window that holds
-- the caller's pane, with `cx` (the window API Carly's lua tool has).
--
-- Files under tern.plugin.data (the omp side lives in ../src/bridge.ts):
--   req/<id>.json         {"code": "<lua>", "window": <token>?}, renamed into place by omp; <id> is
--                         <expires>-<pane>-<unique>: expiry (unix seconds) and the caller's pane
--   res/<id>.taken        the request, moved here by the window that takes it
--   res/<id>.claimed      that window's token, written right after it takes the request
--   res/<id>.json         {"ok": bool, "result": any, "printed": string?}
--   res/<id>.done         written after res/<id>.json: the answer is complete
--   wake-<token>.fifo     this window's wake pipe
--
-- Window timers stall while a window is in the background, so nothing here polls: a `cat` blocks
-- on this window's wake pipe, omp opens and closes the pipe to wake it, and the
-- process callback reads requests and starts the next `cat`. A pipe with no reader
-- tells omp the window is gone (or its bridge was disabled).
--
-- Only a window that holds the pane takes a request, and only the window named by `window`
-- when omp pinned one: a session can show in several windows, and omp keeps each caller on
-- one of them. Taking is rename(2) of req/<id>.json, and omp withdraws a request the same way,
-- so exactly one of them gets it and a request runs at most once. (Not unlink: on macOS two
-- concurrent unlinks of one file can both succeed.) A request past its `expires` is never
-- run: its omp withdrew it long before, or died without withdrawing it.
--
-- Tern's 50 ms window budget covers a whole callback, so each callback runs at most one
-- request: the rename's callback runs it and then looks for the next one.
--
-- Wake pipes need a POSIX shell and named pipes, so the bridge runs on macOS and Linux only.
if tern.runtime.os ~= "macos" and tern.runtime.os ~= "linux" then
	tern.log.info("omp-bridge: not supported on " .. tern.runtime.os)
	return
end

local REQ = tern.plugin.data .. "/req"
local RES = tern.plugin.data .. "/res"
local MAX_REQUEST_BYTES = 1024 * 1024
local MAX_WATCH_FAILURES = 3

tern.fs.mkdir(REQ)
tern.fs.mkdir(RES)

local wall_ok, wall = pcall(os.time)
local TOKEN = string.format("%x-%s", wall_ok and wall or 0, tostring({}):match("(%x+)$") or "0")
local FIFO = tern.plugin.data .. "/wake-" .. TOKEN .. ".fifo"

local state = {} -- shared by requests run in this window until the next plugin reload
local watch_failures = 0

local function answer(id, ok, value, printed)
	local body = { ok = ok, result = value, printed = printed }
	local encoded, text = pcall(tern.json.encode, body)
	if not encoded then
		body.result = tostring(value)
		body.result_note = "the result was not JSON-encodable, so it is shown as tostring(): " .. tostring(text)
		text = tern.json.encode(body)
	end
	tern.fs.write(RES .. "/" .. id .. ".json", text)
	tern.fs.write(RES .. "/" .. id .. ".done", "")
end

local function is_awaitable(value)
	if type(value) ~= "userdata" and type(value) ~= "table" then
		return false
	end
	local ok, kind, next_fn = pcall(function()
		return value.kind, value.next
	end)
	return ok and type(kind) == "string" and type(next_fn) == "function"
end

local function run(id, code, cx)
	local lines = {}
	local function capture(...)
		local parts = table.pack(...)
		for i = 1, parts.n do
			parts[i] = tostring(parts[i])
		end
		table.insert(lines, table.concat(parts, "\t", 1, parts.n))
	end
	local function printed()
		return #lines > 0 and table.concat(lines, "\n") or nil
	end

	-- Same line as the code, so error line numbers match what omp sent.
	local chunk, err = loadstring("local cx, state, print = ...; " .. code, "=tern_lua")
	if not chunk then
		return answer(id, false, err)
	end
	local ok, value = pcall(chunk, cx, state, capture)
	if not ok then
		return answer(id, false, value, printed())
	end
	if is_awaitable(value) then
		-- A claimed request must always get an answer, even when `next` itself raises.
		local chained, failure = pcall(value.next, value, function(result, await_err)
			-- Answer from a `process` callback, not this `await` one: if encoding a large result
			-- overruns the budget, Tern disables the hook that also runs the wake pipe, so omp sees
			-- this window stop and reloads, instead of later Awaitables silently never answering.
			local function settle()
				if await_err ~= nil then
					answer(id, false, await_err, printed())
				else
					answer(id, true, result, printed())
				end
			end
			if not pcall(tern.process.run, { "/bin/sh", "-c", ":" }, settle) then
				settle()
			end
		end)
		if not chained then
			answer(id, false, failure, printed())
		end
	else
		answer(id, true, value, printed())
	end
end

local drain

-- tern.fs has no rename, so `mv` takes the request; its callback runs the code with a fresh budget.
local function take(id, path, code)
	tern.process.run({ "/bin/sh", "-c", 'exec mv "$0" "$1"', path, RES .. "/" .. id .. ".taken" }, function(result, cx)
		if result.status == 0 then
			-- Only the window that took it writes a token, so racing windows never clobber it; omp
			-- treats a request gone without a token for long as a window stopped mid-claim.
			tern.fs.write(RES .. "/" .. id .. ".claimed", TOKEN)
			if cx then
				run(id, code, cx)
			else
				answer(id, false, "omp-bridge: Tern gave the callback no window context")
			end
		elseif tern.fs.exists(path) then
			-- Not lost to omp or another window: mv itself failed. Stop instead of retrying forever.
			tern.log.warn("omp-bridge: mv failed: " .. tostring(result.stderr))
			return
		end
		if cx then
			drain(cx)
		end
	end)
end

-- Starts taking the first request this window may run. Expiry and pane come from the name, so
-- expired requests and other windows' panes cost no read.
local function poll(cx)
	local now = os.time()
	for _, name in ipairs(tern.fs.list(REQ)) do
		local id, expires, pane = name:match("^((%d+)%-(%d+)%-[%w_-]+)%.json$")
		if id and tonumber(expires) > now and cx.session:pane(tonumber(pane)) ~= nil then
			local path = REQ .. "/" .. name
			local read, text = pcall(tern.fs.read, path, MAX_REQUEST_BYTES)
			local decoded, req = false, nil
			if read then
				decoded, req = pcall(tern.json.decode, text)
			end
			if
				decoded
				and type(req) == "table"
				and type(req.code) == "string"
				and (req.window == nil or req.window == TOKEN)
			then
				take(id, path, req.code)
				return
			end
		end
	end
end

drain = function(cx)
	local ok, err = pcall(poll, cx)
	if not ok then
		tern.log.warn("omp-bridge: " .. tostring(err))
	end
end

local function watch()
	-- omp deletes day-old pipes it finds without a reader; recreate ours if it went.
	if not tern.fs.exists(FIFO) then
		tern.process.run({ "/bin/sh", "-c", 'exec mkfifo -m 600 "$0"', FIFO }, function(result)
			if result.status == 0 then
				watch()
			else
				tern.log.warn("omp-bridge: mkfifo failed: " .. tostring(result.stderr))
			end
		end)
		return
	end
	tern.process.run({ "/bin/sh", "-c", 'exec cat "$0" >/dev/null', FIFO }, function(result, cx)
		if cx then
			drain(cx)
		end
		watch_failures = result.status == 0 and 0 or watch_failures + 1
		if watch_failures < MAX_WATCH_FAILURES then
			watch()
		else
			tern.log.warn("omp-bridge: the wake pipe keeps failing; run `tern plugin reload`")
		end
	end)
end

watch()
