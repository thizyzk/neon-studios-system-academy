local AssetService = game:GetService("AssetService")
local ContentProvider = game:GetService("ContentProvider")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local JetstreamFramePlayer = {}

export type PlaybackHandle = {
	Stop: (PlaybackHandle) -> (),
	SetPaused: (PlaybackHandle, boolean) -> (),
	Ready: boolean,
}

export type PlayOptions = {
	InitialPreloadSeconds: number?,
	PreloadAheadSeconds: number?,
	PreloadAllAssets: boolean?,
	StartupTimeoutSeconds: number?,
	OnProgress: ((number, number, number, number) -> ())?,
}

local function collectFrames(framesModule)
	local frames = {}

	if framesModule.Format == "SpriteSheet" then
		local frameCount = framesModule.FrameCount or 0
		local frameWidth = framesModule.FrameWidth or 256
		local frameHeight = framesModule.FrameHeight or 455
		local columns = framesModule.Columns or 4
		local rows = framesModule.Rows or 2
		local framesPerSheet = columns * rows

		for frameIndex = 0, frameCount - 1 do
			local sheetIndex = math.floor(frameIndex / framesPerSheet) + 1
			local cellIndex = frameIndex % framesPerSheet
			table.insert(frames, {
				Image = tostring(framesModule.Sheets[sheetIndex]),
				FrameIndex = frameIndex + 1,
				RectOffset = Vector2.new((cellIndex % columns) * frameWidth, math.floor(cellIndex / columns) * frameHeight),
				RectSize = Vector2.new(frameWidth, frameHeight),
				SheetIndex = sheetIndex,
			})
		end

		return frames
	end

	local index = 0

	while framesModule[index] ~= nil do
		table.insert(frames, {
			Image = tostring(framesModule[index]),
			FrameIndex = index + 1,
			RectOffset = Vector2.zero,
			RectSize = Vector2.zero,
		})
		index += 1
	end

	if #frames == 0 then
		for _, image in framesModule do
			if type(image) == "string" or type(image) == "number" then
				table.insert(frames, {
					Image = tostring(image),
					FrameIndex = #frames + 1,
					RectOffset = Vector2.zero,
					RectSize = Vector2.zero,
				})
			end
		end
	end

	return frames
end

local preloadAssets

local function preloadFrameRange(
	frames,
	loadedAssets: { [string]: boolean },
	warmProbes,
	surfaceHost: Instance,
	screenHost: Instance,
	firstIndex: number,
	lastIndex: number
)
	local requestedAssets = {}
	local assetIds = {}
	local frameCount = #frames
	local startIndex = math.max(1, firstIndex)
	local endIndex = math.min(frameCount, lastIndex)

	for index = startIndex, endIndex do
		local imageId = frames[index].Image
		if not loadedAssets[imageId] and not requestedAssets[imageId] then
			requestedAssets[imageId] = true
			table.insert(assetIds, imageId)
		end
	end

	if #assetIds == 0 then
		return true
	end

	return preloadAssets(assetIds, loadedAssets, warmProbes, surfaceHost, screenHost)
end

local function createWarmProbe(parent: Instance, imageId: string, zIndex: number)
	local probe = Instance.new("ImageLabel")
	probe.Name = "WarmImage"
	probe.Active = false
	probe.BackgroundTransparency = 1
	probe.BorderSizePixel = 0
	probe.Image = imageId
	probe.ImageTransparency = 0.99
	probe.Position = UDim2.fromOffset(0, 0)
	probe.Size = UDim2.fromOffset(1, 1)
	probe.Visible = true
	probe.ZIndex = zIndex
	probe.Parent = parent

	return probe
end

local function createPreloadHosts(imageLabel: ImageLabel)
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

	local screenHost = Instance.new("ScreenGui")
	screenHost.Name = "JetstreamPreloadHost"
	screenHost.DisplayOrder = -100
	screenHost.IgnoreGuiInset = true
	screenHost.ResetOnSpawn = false
	screenHost.Parent = playerGui

	local parent = imageLabel.Parent
	local surfaceHost = Instance.new("Frame")
	surfaceHost.Name = "JetstreamSurfacePreloadCache"
	surfaceHost.Active = false
	surfaceHost.BackgroundTransparency = 1
	surfaceHost.BorderSizePixel = 0
	surfaceHost.ClipsDescendants = false
	surfaceHost.Position = UDim2.fromOffset(0, 0)
	surfaceHost.Size = UDim2.fromOffset(1, 1)
	surfaceHost.Visible = true
	surfaceHost.ZIndex = math.max(1, imageLabel.ZIndex - 1)
	surfaceHost.Parent = parent

	return surfaceHost, screenHost
end

local function createSpriteDisplay(framesModule, imageLabel: ImageLabel, frames)
	if framesModule.Format ~= "SpriteSheet" then
		return nil
	end

	local parent = imageLabel.Parent
	local container = Instance.new("Frame")
	container.Name = "JetstreamSpritePlaybackLayers"
	container.Active = false
	container.AnchorPoint = imageLabel.AnchorPoint
	container.BackgroundTransparency = 1
	container.BorderSizePixel = 0
	container.ClipsDescendants = true
	container.Position = imageLabel.Position
	container.Size = imageLabel.Size
	container.Visible = true
	container.ZIndex = imageLabel.ZIndex + 1
	container.Parent = parent

	local frameLayers = {}
	for frameIndex, frame in frames do
		local layer = Instance.new("ImageLabel")
		layer.Name = `Frame{frameIndex}`
		layer.Active = false
		layer.BackgroundTransparency = 1
		layer.BorderSizePixel = 0
		layer.Image = frame.Image
		layer.ImageColor3 = imageLabel.ImageColor3
		layer.ImageRectOffset = frame.RectOffset
		layer.ImageRectSize = frame.RectSize
		layer.ImageTransparency = 0
		layer.Position = UDim2.fromScale(0, 0)
		layer.ScaleType = imageLabel.ScaleType
		layer.Size = UDim2.fromScale(1, 1)
		layer.Visible = false
		layer.ZIndex = container.ZIndex
		layer.Parent = container
		frameLayers[frameIndex] = layer
	end

	imageLabel.Image = ""
	imageLabel.ImageTransparency = 1
	imageLabel:SetAttribute("JetstreamBackend", "SpriteLayers")

	local activeLayer: ImageLabel? = nil

	local function showFrame(frame)
		local layer = frameLayers[frame.FrameIndex]
		if not layer then
			return
		end

		if activeLayer ~= layer then
			if activeLayer then
				activeLayer.Visible = false
			end
			layer.Visible = true
			activeLayer = layer
		end
	end

	local function warmup(batchSize: number)
		local safeBatchSize = math.max(1, batchSize)
		local index = 1

		while index <= #frameLayers do
			local batchEnd = math.min(#frameLayers, index + safeBatchSize - 1)
			local batch = {}

			for layerIndex = index, batchEnd do
				local layer = frameLayers[layerIndex]
				layer.ImageTransparency = 0.99
				layer.Visible = true
				table.insert(batch, layer)
			end

			pcall(function()
				ContentProvider:PreloadAsync(batch)
			end)

			RunService.RenderStepped:Wait()
			RunService.RenderStepped:Wait()

			for layerIndex = index, batchEnd do
				local layer = frameLayers[layerIndex]
				layer.Visible = false
				layer.ImageTransparency = 0
			end

			index = batchEnd + 1
		end

		activeLayer = nil
	end

	return {
		Container = container,
		ShowFrame = showFrame,
		Warmup = warmup,
		Destroy = function()
			container:Destroy()
		end,
	}
end

local function createEditableDisplay(framesModule, imageLabel: ImageLabel, frames)
	if framesModule.Format ~= "SpriteSheet" then
		return nil
	end

	local ok, display = pcall(function()
		local frameWidth = framesModule.FrameWidth or 256
		local frameHeight = framesModule.FrameHeight or 455
		local output = AssetService:CreateEditableImage({
			Size = Vector2.new(frameWidth, frameHeight),
		})

		if not output then
			error("CreateEditableImage returned nil")
		end

		local sheets = {}
		local loadingSheets = {}
		local sheetUseOrder = {}
		local sheetCount = 0
		local maxCachedSheets = math.min(4, #framesModule.Sheets)
		local useCounter = 0
		local frameBuffers = {}
		local frameUseOrder = {}
		local frameBufferCount = 0
		local maxCachedFrames = #frames
		local queuedSheets = {}
		local queuedSheetSet = {}
		local workerRunning = false
		local framesPerSheet = (framesModule.Columns or 4) * (framesModule.Rows or 2)

		imageLabel.Image = ""
		imageLabel.ImageContent = Content.fromObject(output)
		imageLabel.ImageRectOffset = Vector2.zero
		imageLabel.ImageRectSize = Vector2.zero
		imageLabel.ImageTransparency = 0
		imageLabel:SetAttribute("JetstreamBackend", "EditableImageBuffered")
		imageLabel:SetAttribute("JetstreamBufferedFrames", 0)
		imageLabel:SetAttribute("JetstreamBufferMisses", 0)
		imageLabel:SetAttribute("JetstreamLastFrameIndex", 0)
		imageLabel:SetAttribute("JetstreamQueuedSheets", 0)
		imageLabel:SetAttribute("JetstreamSheetCount", 0)
		imageLabel:SetAttribute("JetstreamWriteErrors", 0)

		local function touchSheet(sheetIndex: number)
			useCounter += 1
			sheetUseOrder[sheetIndex] = useCounter
		end

		local function trimSheets()
			while sheetCount > maxCachedSheets do
				local oldestIndex = nil
				local oldestUse = math.huge

				for sheetIndex in sheets do
					local use = sheetUseOrder[sheetIndex] or 0
					if use < oldestUse then
						oldestUse = use
						oldestIndex = sheetIndex
					end
				end

				if not oldestIndex then
					return
				end

				sheets[oldestIndex]:Destroy()
				sheets[oldestIndex] = nil
				sheetUseOrder[oldestIndex] = nil
				sheetCount -= 1
				imageLabel:SetAttribute("JetstreamSheetCount", sheetCount)
			end
		end

		local function touchFrame(frameIndex: number)
			useCounter += 1
			frameUseOrder[frameIndex] = useCounter
		end

		local function trimFrames()
			while frameBufferCount > maxCachedFrames do
				local oldestIndex = nil
				local oldestUse = math.huge

				for frameIndex in frameBuffers do
					local use = frameUseOrder[frameIndex] or 0
					if use < oldestUse then
						oldestUse = use
						oldestIndex = frameIndex
					end
				end

				if not oldestIndex then
					return
				end

				frameBuffers[oldestIndex] = nil
				frameUseOrder[oldestIndex] = nil
				frameBufferCount -= 1
				imageLabel:SetAttribute("JetstreamBufferedFrames", frameBufferCount)
			end
		end

		local function loadSheet(sheetIndex: number)
			if sheets[sheetIndex] then
				touchSheet(sheetIndex)
				return sheets[sheetIndex]
			end

			local imageId = framesModule.Sheets[sheetIndex]
			if not imageId then
				return nil
			end

			local okSource, source = pcall(function()
				return AssetService:CreateEditableImageAsync(Content.fromUri(tostring(imageId)))
			end)
			if not okSource then
				imageLabel:SetAttribute("JetstreamEditableError", tostring(source))
				return nil
			end
			if not source then
				return nil
			end

			sheets[sheetIndex] = source
			sheetCount += 1
			imageLabel:SetAttribute("JetstreamSheetCount", sheetCount)
			touchSheet(sheetIndex)
			trimSheets()

			return source
		end

		local function releaseSheet(sheetIndex: number)
			local source = sheets[sheetIndex]
			if not source then
				return
			end

			source:Destroy()
			sheets[sheetIndex] = nil
			sheetUseOrder[sheetIndex] = nil
			sheetCount -= 1
			imageLabel:SetAttribute("JetstreamSheetCount", sheetCount)
		end

		local function requestSheet(sheetIndex: number)
			if sheets[sheetIndex] or loadingSheets[sheetIndex] or not framesModule.Sheets[sheetIndex] then
				return
			end

			loadingSheets[sheetIndex] = true
			task.spawn(function()
				pcall(function()
					loadSheet(sheetIndex)
				end)
				loadingSheets[sheetIndex] = nil
			end)
		end

		local function loadSheetFrameBuffers(sheetIndex: number)
			local firstFrameIndex = (sheetIndex - 1) * framesPerSheet + 1
			local lastFrameIndex = math.min(#frames, firstFrameIndex + framesPerSheet - 1)
			if frameBuffers[firstFrameIndex] and frameBuffers[lastFrameIndex] then
				for frameIndex = firstFrameIndex, lastFrameIndex do
					touchFrame(frameIndex)
				end
				return true
			end

			local source = loadSheet(sheetIndex)
			if not source then
				requestSheet(sheetIndex)
				return false
			end

			for frameIndex = firstFrameIndex, lastFrameIndex do
				local frame = frames[frameIndex]
				if frame and not frameBuffers[frameIndex] then
					local pixels = source:ReadPixelsBuffer(frame.RectOffset, frame.RectSize)
					frameBuffers[frameIndex] = pixels
					frameBufferCount += 1
					imageLabel:SetAttribute("JetstreamBufferedFrames", frameBufferCount)
					touchFrame(frameIndex)
				elseif frame then
					touchFrame(frameIndex)
				end
			end

			trimFrames()
			releaseSheet(sheetIndex)

			return true
		end

		local function runFrameWorker()
			if workerRunning then
				return
			end

			workerRunning = true
			task.spawn(function()
				while #queuedSheets > 0 do
					local sheetIndex = table.remove(queuedSheets, 1)
					queuedSheetSet[sheetIndex] = nil
					imageLabel:SetAttribute("JetstreamQueuedSheets", #queuedSheets)

					if framesModule.Sheets[sheetIndex] then
						pcall(function()
							loadSheetFrameBuffers(sheetIndex)
						end)
					end

					RunService.Heartbeat:Wait()
				end

				workerRunning = false
			end)
		end

		local function requestSheetBuffers(sheetIndex: number)
			if queuedSheetSet[sheetIndex] or not framesModule.Sheets[sheetIndex] then
				return
			end

			local firstFrameIndex = (sheetIndex - 1) * framesPerSheet + 1
			if frameBuffers[firstFrameIndex] then
				return
			end

			queuedSheetSet[sheetIndex] = true
			table.insert(queuedSheets, sheetIndex)
			imageLabel:SetAttribute("JetstreamQueuedSheets", #queuedSheets)
			runFrameWorker()
		end

		local function requestFrameRange(firstIndex: number, lastIndex: number)
			local firstSheetIndex = math.floor((math.max(1, firstIndex) - 1) / framesPerSheet) + 1
			local lastSheetIndex = math.floor((math.max(1, lastIndex) - 1) / framesPerSheet) + 1

			for sheetIndex = firstSheetIndex, lastSheetIndex do
				requestSheetBuffers(sheetIndex)
			end
		end

		local function showFrame(frame)
			local pixels = frameBuffers[frame.FrameIndex]
			if not pixels then
				imageLabel:SetAttribute("JetstreamBufferMisses", (imageLabel:GetAttribute("JetstreamBufferMisses") or 0) + 1)
				requestSheetBuffers(frame.SheetIndex)
				return false
			end

			touchFrame(frame.FrameIndex)
			local writeOk = pcall(function()
				output:WritePixelsBuffer(Vector2.zero, frame.RectSize, pixels)
			end)
			if not writeOk then
				imageLabel:SetAttribute("JetstreamWriteErrors", (imageLabel:GetAttribute("JetstreamWriteErrors") or 0) + 1)
				return false
			end
			imageLabel:SetAttribute("JetstreamLastFrameIndex", frame.FrameIndex)

			return true
		end

		if not loadSheetFrameBuffers(1) then
			output:Destroy()
			error("EditableImage could not load the first sprite sheet")
		end

		return {
			HandlesAssetLoading = true,
			EnsureFrame = function(frame)
				return loadSheetFrameBuffers(frame.SheetIndex) and frameBuffers[frame.FrameIndex] ~= nil
			end,
			PreloadFrameRange = requestFrameRange,
			ShowFrame = showFrame,
			Warmup = function()
				local warmupFrameCount = math.min(#frames, math.ceil(2 * 29.99))
				local warmupSheetCount = math.ceil(warmupFrameCount / framesPerSheet)

				for sheetIndex = 1, warmupSheetCount do
					loadSheetFrameBuffers(sheetIndex)
					RunService.Heartbeat:Wait()
				end
			end,
			Destroy = function()
				output:Destroy()
				for _, source in sheets do
					source:Destroy()
				end
			end,
		}
	end)

	if ok then
		return display
	end

	warn(`[JetstreamFramePlayer] EditableImage playback unavailable: {display}`)
	return nil
end

preloadAssets = function(
	assetIds,
	loadedAssets: { [string]: boolean },
	warmProbes,
	surfaceHost: Instance,
	screenHost: Instance
)
	local preloadInstances = {}

	for _, imageId in assetIds do
		if not loadedAssets[imageId] then
			local probes = warmProbes[imageId]
			if not probes then
				probes = {
					createWarmProbe(surfaceHost, imageId, surfaceHost.ZIndex),
					createWarmProbe(screenHost, imageId, 1),
				}
				warmProbes[imageId] = probes
			end

			for _, probe in probes do
				table.insert(preloadInstances, probe)
			end
		end
	end

	if #preloadInstances == 0 then
		return true
	end

	local ok = pcall(function()
		ContentProvider:PreloadAsync(preloadInstances)
	end)
	local allLoaded = ok

	for _, imageId in assetIds do
		local probes = warmProbes[imageId]
		local loaded = ok

		for _, probe in probes do
			if probe.IsLoaded then
				loaded = true
				break
			end
		end

		if loaded then
			loadedAssets[imageId] = true
		else
			allLoaded = false
		end
	end

	return allLoaded
end

function JetstreamFramePlayer.Play(
	framesModule,
	imageLabel: ImageLabel,
	fps: number,
	looped: boolean?,
	options: PlayOptions?
): PlaybackHandle
	local frames = collectFrames(framesModule)
	local frameCount = #frames
	local playbackFps = math.max(1, fps or 1)
	local shouldLoop = looped ~= false
	local duration = frameCount / playbackFps
	local loadedAssets = {}
	local elapsed = 0
	local stopped = false
	local paused = false
	local currentFrame = -1
	local highestPreloadRequest = 0
	local preloadingAhead = false
	local warmProbes = {}
	local surfaceHost, screenHost = createPreloadHosts(imageLabel)
	local display = nil

	if frameCount == 0 then
		imageLabel.Image = ""
		if options and options.OnProgress then
			options.OnProgress(0, 0, 0, 0)
		end
		return {
			Ready = false,
			Stop = function()
				stopped = true
				surfaceHost:Destroy()
				screenHost:Destroy()
			end,
			SetPaused = function(_, value)
				paused = value
			end,
		}
	end

	display = createEditableDisplay(framesModule, imageLabel, frames) or createSpriteDisplay(framesModule, imageLabel, frames)
	if display and display.HandlesAssetLoading then
		for _, frame in frames do
			loadedAssets[frame.Image] = true
		end
	end

	local function showFrame(frame)
		if display then
			return display.ShowFrame(frame) ~= false
		else
			imageLabel.Image = frame.Image
			imageLabel.ImageRectOffset = frame.RectOffset
			imageLabel.ImageRectSize = frame.RectSize
			return true
		end
	end

	local initialPreloadFrames = math.clamp(math.ceil((options and options.InitialPreloadSeconds or 1.25) * playbackFps), 1, frameCount)
	local preloadAheadFrames = math.clamp(math.ceil((options and options.PreloadAheadSeconds or 4) * playbackFps), 1, frameCount)
	local preloadAllAssets = options and options.PreloadAllAssets == true
	local preloadDeadline = os.clock() + (options and options.StartupTimeoutSeconds or 12)
	local startupPreloadLastFrame = if preloadAllAssets then frameCount else initialPreloadFrames
	local firstAsset = frames[1].Image

	while os.clock() < preloadDeadline do
		local loadedRequested = preloadFrameRange(
			frames,
			loadedAssets,
			warmProbes,
			surfaceHost,
			screenHost,
			1,
			startupPreloadLastFrame
		)
		if loadedAssets[firstAsset] and (loadedRequested or not preloadAllAssets) then
			break
		end
		if not loadedRequested then
			task.wait(0.15)
		end
	end

	local ready = loadedAssets[firstAsset] == true
	if ready then
		if display and display.EnsureFrame then
			ready = display.EnsureFrame(frames[1])
		end
	end
	if ready then
		if display then
			display.Warmup(8)
		end
		if display and display.PreloadFrameRange then
			display.PreloadFrameRange(1, math.min(frameCount, preloadAheadFrames))
		end
		showFrame(frames[1])
	end
	if options and options.OnProgress then
		options.OnProgress(0, duration, 0, frameCount)
	end

	local function requestPreloadAround(frameIndex: number)
		local firstIndex = math.clamp(frameIndex, 1, frameCount)
		local lastIndex = math.min(frameCount, firstIndex + preloadAheadFrames - 1)
		if lastIndex <= highestPreloadRequest or preloadingAhead then
			return
		end

		highestPreloadRequest = lastIndex
		preloadingAhead = true

		task.spawn(function()
			local ok = preloadFrameRange(frames, loadedAssets, warmProbes, surfaceHost, screenHost, firstIndex, lastIndex)
			if display and display.PreloadFrameRange then
				display.PreloadFrameRange(firstIndex, lastIndex)
			end
			if not ok then
				highestPreloadRequest = math.min(highestPreloadRequest, firstIndex - 1)
			end
			preloadingAhead = false
		end)
	end

	requestPreloadAround(1)
	currentFrame = 0

	local connection
	connection = RunService.RenderStepped:Connect(function(deltaTime)
		if stopped then
			connection:Disconnect()
			surfaceHost:Destroy()
			screenHost:Destroy()
			if display then
				display.Destroy()
			end
			return
		end

		if paused then
			return
		end

		local nextElapsed = elapsed + deltaTime
		local frameIndex = math.floor(nextElapsed * playbackFps)

		if shouldLoop then
			if nextElapsed >= duration then
				nextElapsed %= duration
				frameIndex = math.floor(nextElapsed * playbackFps)
			end
		elseif frameIndex >= frameCount then
			frameIndex = frameCount - 1
			nextElapsed = duration
			stopped = true
		end

		if frameIndex ~= currentFrame then
			local imageIndex = frameIndex + 1
			requestPreloadAround(imageIndex)

			local frame = frames[imageIndex]
			if loadedAssets[frame.Image] then
				if showFrame(frame) then
					elapsed = nextElapsed
					currentFrame = frameIndex
				end
			end
		else
			elapsed = nextElapsed
		end

		if options and options.OnProgress then
			options.OnProgress(elapsed, duration, currentFrame, frameCount)
		end
	end)

	return {
		Ready = ready,
		Stop = function()
			stopped = true
			if not connection or not connection.Connected then
				surfaceHost:Destroy()
				screenHost:Destroy()
				if display then
					display.Destroy()
				end
			end
		end,
		SetPaused = function(_, value)
			paused = value
		end,
	}
end

return JetstreamFramePlayer
