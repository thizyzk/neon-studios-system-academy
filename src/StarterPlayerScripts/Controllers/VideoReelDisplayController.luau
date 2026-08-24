local ContentProvider = game:GetService("ContentProvider")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SocialService = game:GetService("SocialService")
local Workspace = game:GetService("Workspace")

local Modules = ReplicatedStorage.Shared.Modules
local JetstreamFramePlayer = require(Modules.JetstreamFramePlayer)
local JetstreamReelsCatalog = require(Modules.JetstreamReelsCatalog)
local SimulatorUITheme = require(Modules.SimulatorUITheme)
local JetstreamVideos = Modules.JetstreamVideos

local VideoReelDisplayController = {}

local playbackHandle = nil
local audioSound = nil
local currentIndex = 1
local rootFrame = nil
local videoImage = nil
local videoReelPart = nil
local currentEntryId = nil
local isPaused = false
local scrollLocked = false
local localStats = {}

local LOCAL_PLAYER = Players.LocalPlayer
local END_MESSAGE = "voce esgotou a quantidade de videos, espere um pouco mais de tempo para scrollar novamente"

local function formatCompactNumber(value: number?)
	local rounded = math.max(0, math.floor(value or 0))

	if rounded >= 1000000 then
		return string.format("%.1fM", rounded / 1000000)
	end

	if rounded >= 1000 then
		return string.format("%.1fK", rounded / 1000)
	end

	return tostring(rounded)
end

local function formatDuration(value: number?)
	local totalSeconds = math.max(0, math.floor(value or 0))
	local minutes = math.floor(totalSeconds / 60)
	local seconds = totalSeconds % 60

	return string.format("%d:%02d", minutes, seconds)
end

local function findVideoReelPart()
	local found = Workspace:FindFirstChild("VideoReel", true) or Workspace:FindFirstChild("videoReel", true)

	if found and found:IsA("BasePart") then
		return found
	end

	return nil
end

local function findDisplayObjects(part: BasePart)
	local surfaceGui = part:FindFirstChild("JetstreamSurfaceGui")
	if not surfaceGui then
		return nil, nil
	end

	local root = surfaceGui:FindFirstChild("Root")
	if not root then
		return nil, nil
	end

	local image = root:FindFirstChild("VideoImage")
	if image and image:IsA("ImageLabel") then
		return root, image
	end

	return nil, nil
end

local function setText(instance: Instance?, text: string)
	if instance and instance:IsA("TextLabel") then
		instance.Text = text
	end
end

local function getStats(entry)
	if not entry then
		return {
			Likes = 0,
			Comments = 0,
			Shares = 0,
			Liked = false,
			CommentList = {},
		}
	end

	local entryId = entry.Id or entry.ModuleName
	local stats = localStats[entryId]
	if not stats then
		stats = {
			Likes = entry.LikeCount or 0,
			Comments = entry.CommentCount or 0,
			Shares = entry.ShareCount or 0,
			Liked = false,
			CommentList = {},
		}
		localStats[entryId] = stats
	end

	return stats
end

local function setMetric(metricName: string, value: number?)
	if not rootFrame then
		return
	end

	local metric = rootFrame:FindFirstChild(metricName)
	local valueLabel = metric and metric:FindFirstChild("Value")
	setText(valueLabel, formatCompactNumber(value))
end

local function setMetricIcon(metricName: string, text: string)
	if not rootFrame then
		return
	end

	local metric = rootFrame:FindFirstChild(metricName)
	local iconLabel = metric and metric:FindFirstChild("Icon")
	setText(iconLabel, text)
end

local function refreshMetrics(entry)
	local stats = getStats(entry)
	setMetric("LikeMetric", stats.Likes)
	setMetric("CommentMetric", stats.Comments)
	setMetric("ShareMetric", stats.Shares)
	setMetricIcon("LikeMetric", if stats.Liked then "♥" else "♡")
end

local function setPlaceholderVisible(visible: boolean, hintText: string?, titleText: string?)
	if not videoImage then
		return
	end

	local placeholder = videoImage:FindFirstChild("Placeholder")
	local hint = videoImage:FindFirstChild("Hint")

	if placeholder and placeholder:IsA("GuiObject") then
		placeholder.Visible = visible
		if titleText and placeholder:IsA("TextLabel") then
			placeholder.Text = titleText
		end
	end

	if hint and hint:IsA("TextLabel") then
		hint.Visible = visible
		if hintText then
			hint.Text = hintText
		end
	end
end

local function setPlaybackProgress(currentTime: number?, duration: number?)
	if not rootFrame then
		return
	end

	local safeDuration = math.max(0, duration or 0)
	local safeCurrent = math.clamp(currentTime or 0, 0, safeDuration)
	local progressBack = rootFrame:FindFirstChild("ProgressBack")
	local progressFill = progressBack and progressBack:FindFirstChild("ProgressFill")

	if progressFill and progressFill:IsA("GuiObject") then
		local alpha = if safeDuration > 0 then safeCurrent / safeDuration else 0
		progressFill.Size = UDim2.fromScale(math.clamp(alpha, 0, 1), 1)
	end

	local durationLabel = rootFrame:FindFirstChild("DurationLabel")
	if durationLabel and durationLabel:IsA("TextLabel") then
		durationLabel.Text = `{formatDuration(safeCurrent)} / {formatDuration(safeDuration)}`
	end
end

local function setPauseOverlayVisible(visible: boolean)
	if not rootFrame or not videoImage then
		return
	end

	local label = rootFrame:FindFirstChild("PauseOverlay")
	if not label then
		label = Instance.new("TextLabel")
		label.Name = "PauseOverlay"
		label.AnchorPoint = Vector2.new(0.5, 0.5)
		label.BackgroundColor3 = SimulatorUITheme.Colors.DarkPanel
		label.BackgroundTransparency = 0.18
		label.BorderSizePixel = 0
		label.Position = UDim2.fromScale(0.5, 0.5)
		label.Size = UDim2.fromOffset(190, 64)
		label.Text = "PAUSADO"
		label.TextSize = 22
		label.ZIndex = videoImage.ZIndex + 30
		label.Parent = rootFrame
		SimulatorUITheme.StyleText(label, 1)
		SimulatorUITheme.AddStroke(label, 3)
		SimulatorUITheme.AddCorner(label, 3)
	end

	if label:IsA("GuiObject") then
		label.Visible = visible
	end
end

local function setAudioLabel(text: string)
	if not rootFrame then
		return
	end

	local label = rootFrame:FindFirstChild("AudioName")
	if label and label:IsA("TextLabel") then
		label.Text = text
	end
end

local function ensureAudioSound()
	if audioSound then
		if videoReelPart and audioSound.Parent ~= videoReelPart then
			audioSound.Parent = videoReelPart
		end
		return audioSound
	end

	local sound = Instance.new("Sound")
	sound.Name = "VideoReelSound"
	sound.Looped = false
	sound.RollOffMode = Enum.RollOffMode.InverseTapered
	sound.RollOffMinDistance = 8
	sound.RollOffMaxDistance = 70
	sound.Volume = 0.55
	sound.Parent = videoReelPart or Workspace
	audioSound = sound

	return sound
end

local function playAudioForEntry(entry)
	local sound = ensureAudioSound()
	sound:Stop()
	sound.TimePosition = 0

	if entry and entry.AudioId and entry.AudioId ~= "" then
		sound.SoundId = entry.AudioId
		sound.Looped = entry.Looped ~= false
		sound:Play()
		setAudioLabel(`Playlist: {entry.AudioName or "Som original"}`)
	else
		sound.SoundId = ""
		setAudioLabel("Playlist: Som original indisponivel")
	end
end

local function setPaused(value: boolean)
	isPaused = value

	if playbackHandle then
		playbackHandle:SetPaused(value)
	end

	if audioSound and audioSound.SoundId ~= "" then
		if value then
			audioSound:Pause()
		else
			audioSound:Resume()
		end
	end

	if value then
		setPauseOverlayVisible(true)
	else
		setPauseOverlayVisible(false)
	end
end

local function stopPlayback()
	if playbackHandle then
		playbackHandle:Stop()
		playbackHandle = nil
	end
	if audioSound then
		audioSound:Stop()
	end
	isPaused = false
end

local function getEntry(index: number)
	if index < 1 or index > #JetstreamReelsCatalog then
		return nil
	end

	currentIndex = index
	return JetstreamReelsCatalog[index]
end

local function playNativeVideo(entry)
	if not rootFrame or not videoImage or not entry.VideoId or entry.VideoId == "" then
		return nil
	end

	local frame = Instance.new("VideoFrame")
	frame.Name = "NativeVideoFrame"
	frame.AnchorPoint = videoImage.AnchorPoint
	frame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	frame.BackgroundTransparency = 0
	frame.BorderSizePixel = 0
	frame.Looped = entry.Looped ~= false
	frame.Position = videoImage.Position
	frame.Size = videoImage.Size
	frame.Video = entry.VideoId
	frame.Visible = false
	frame.ZIndex = videoImage.ZIndex + 1
	pcall(function()
		frame.Volume = 0
	end)
	frame.Parent = rootFrame

	videoImage.Image = ""
	videoImage.ImageTransparency = 1

	local stopped = false
	local paused = false
	local ready = false
	local duration = 0
	local connection = nil

	connection = RunService.RenderStepped:Connect(function()
		if stopped then
			return
		end

		duration = if frame.TimeLength > 0 then frame.TimeLength else duration
		setPlaybackProgress(frame.TimePosition, duration)
	end)

	task.spawn(function()
		pcall(function()
			ContentProvider:PreloadAsync({ frame })
		end)

		if stopped or currentEntryId ~= (entry.Id or entry.ModuleName) then
			return
		end

		ready = true
		frame.Visible = true
		setPlaceholderVisible(false)
		frame:Play()
		playAudioForEntry(entry)
	end)

	return {
		Ready = true,
		Stop = function()
			stopped = true
			if connection and connection.Connected then
				connection:Disconnect()
			end
			frame:Destroy()
		end,
		SetPaused = function(_, value)
			paused = value
			if value then
				frame:Pause()
			elseif ready then
				frame:Play()
			end
		end,
		IsPaused = function()
			return paused
		end,
	}
end

local function playCurrent()
	if not videoImage then
		return
	end

	stopPlayback()

	local entry = getEntry(currentIndex)
	if not entry then
		videoImage.Image = ""
		setPlaceholderVisible(true, "importe um video Jetstream para tocar aqui", "JETSTREAM\nREELS")
		setPlaybackProgress(0, 0)
		setMetric("LikeMetric", 0)
		setMetric("CommentMetric", 0)
		setMetric("ShareMetric", 0)
		return
	end

	currentEntryId = entry.Id or entry.ModuleName
	videoImage.ImageTransparency = 0
	videoImage.ImageColor3 = Color3.fromRGB(255, 255, 255)
	setPlaceholderVisible(true, "carregando video...", "CARREGANDO")
	setPauseOverlayVisible(false)
	setPlaybackProgress(0, 0)
	refreshMetrics(entry)

	if entry.VideoId and entry.VideoId ~= "" then
		playbackHandle = playNativeVideo(entry)
		if playbackHandle then
			return
		end
	end

	local moduleScript = JetstreamVideos:FindFirstChild(entry.ModuleName)
	if not moduleScript or not moduleScript:IsA("ModuleScript") then
		videoImage.Image = ""
		setPlaceholderVisible(true, `modulo nao encontrado: {entry.ModuleName}`, "SEM VIDEO")
		return
	end

	local ok, framesModule = pcall(require, moduleScript)
	if not ok then
		videoImage.Image = ""
		setPlaceholderVisible(true, "falha ao carregar frames", "ERRO")
		return
	end

	videoImage.ImageTransparency = 0
	videoImage.ImageColor3 = Color3.fromRGB(255, 255, 255)
	setPlaceholderVisible(true, "carregando frames...", "CARREGANDO")
	playbackHandle = JetstreamFramePlayer.Play(framesModule, videoImage, entry.Fps or 12, entry.Looped ~= false, {
		InitialPreloadSeconds = 1,
		PreloadAheadSeconds = 4,
		PreloadAllAssets = true,
		StartupTimeoutSeconds = 45,
		OnProgress = function(currentTime, duration)
			setPlaybackProgress(currentTime, duration)
			if audioSound and audioSound.SoundId ~= "" and audioSound.Playing and duration > 0 then
				local difference = math.abs(audioSound.TimePosition - currentTime)
				if difference > 0.18 then
					audioSound.TimePosition = currentTime
				end
			end
		end,
	})
	if playbackHandle.Ready then
		setPlaceholderVisible(false)
		playAudioForEntry(entry)
	else
		setPlaceholderVisible(true, "nao foi possivel carregar o primeiro frame", "TENTANDO NOVAMENTE")
		task.delay(2, function()
			if currentEntryId == (entry.Id or entry.ModuleName) then
				playCurrent()
			end
		end)
	end
end

local function showEndMessage()
	if scrollLocked or not videoImage then
		return
	end

	scrollLocked = true
	stopPlayback()
	videoImage.Image = ""
	setPlaybackProgress(0, 0)
	setPlaceholderVisible(true, END_MESSAGE, "FIM DOS VIDEOS")

	task.delay(3, function()
		scrollLocked = false
		playCurrent()
	end)
end

local function changeVideo(direction: number)
	if scrollLocked then
		return
	end

	local targetIndex = currentIndex + direction
	if targetIndex < 1 then
		targetIndex = 1
	end

	if targetIndex > #JetstreamReelsCatalog then
		showEndMessage()
		return
	end

	currentIndex = targetIndex
	playCurrent()
end

local function getCurrentEntry()
	if currentEntryId == nil then
		return nil
	end

	for _, entry in JetstreamReelsCatalog do
		if (entry.Id or entry.ModuleName) == currentEntryId then
			return entry
		end
	end

	return nil
end

local function createTransparentButton(parent: GuiObject, name: string)
	local existing = parent:FindFirstChild(name)
	if existing and existing:IsA("TextButton") then
		return existing
	end

	local button = Instance.new("TextButton")
	button.Name = name
	button.Active = true
	button.AutoButtonColor = false
	button.BackgroundTransparency = 1
	button.BorderSizePixel = 0
	button.Size = UDim2.fromScale(1, 1)
	button.Text = ""
	button.ZIndex = parent.ZIndex + 10
	button.Parent = parent

	return button
end

local function ensureAudioLabel()
	if not rootFrame then
		return
	end

	local existing = rootFrame:FindFirstChild("AudioName")
	if existing then
		return
	end

	local label = Instance.new("TextLabel")
	label.Name = "AudioName"
	label.AnchorPoint = Vector2.new(0, 1)
	label.BackgroundColor3 = SimulatorUITheme.Colors.DarkPanel
	label.BackgroundTransparency = 0.08
	label.BorderSizePixel = 0
	label.Position = UDim2.new(0, 34, 1, -56)
	label.Size = UDim2.new(1, -180, 0, 34)
	label.Text = "Playlist: Som original indisponivel"
	label.TextSize = 16
	label.TextTruncate = Enum.TextTruncate.AtEnd
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.ZIndex = videoImage.ZIndex + 25
	label.Parent = rootFrame
	SimulatorUITheme.StyleText(label, 2)
	SimulatorUITheme.AddStroke(label, 3)

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 10)
	padding.PaddingRight = UDim.new(0, 10)
	padding.Parent = label

	SimulatorUITheme.AddCorner(label, 3)
end

local function ensureDurationLabel()
	if not rootFrame or not videoImage then
		return
	end

	local existing = rootFrame:FindFirstChild("DurationLabel")
	if existing then
		return
	end

	local label = Instance.new("TextLabel")
	label.Name = "DurationLabel"
	label.AnchorPoint = Vector2.new(1, 1)
	label.BackgroundColor3 = SimulatorUITheme.Colors.DarkPanel
	label.BackgroundTransparency = 0.08
	label.BorderSizePixel = 0
	label.Position = UDim2.new(1, -34, 1, -14)
	label.Size = UDim2.fromOffset(132, 28)
	label.Text = "0:00 / 0:00"
	label.TextSize = 14
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.ZIndex = videoImage.ZIndex + 25
	label.Parent = rootFrame
	SimulatorUITheme.StyleText(label, 2)
	SimulatorUITheme.AddStroke(label, 3)
	SimulatorUITheme.AddCorner(label, 3)
end

local function createCommentGui()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existing = playerGui:FindFirstChild("VideoReelCommentGui")
	if existing then
		return existing
	end

	local gui = Instance.new("ScreenGui")
	gui.Name = "VideoReelCommentGui"
	gui.ResetOnSpawn = false
	gui.Enabled = false
	gui.Parent = playerGui

	local panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromOffset(500, 560)
	panel.Parent = gui
	SimulatorUITheme.StylePanel(panel)

	local header = Instance.new("Frame")
	header.Name = "Header"
	header.BackgroundColor3 = SimulatorUITheme.Colors.Header
	header.BorderSizePixel = 0
	header.Size = UDim2.new(1, 0, 0, 64)
	header.Parent = panel
	SimulatorUITheme.AddCorner(header, 3)
	SimulatorUITheme.AddStroke(header, 4)

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.BackgroundTransparency = 1
	title.Position = UDim2.fromOffset(18, 8)
	title.Size = UDim2.new(1, -72, 0, 28)
	title.Text = "COMENTARIOS"
	title.TextSize = 28
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = header
	SimulatorUITheme.StyleText(title, 3)

	local close = Instance.new("TextButton")
	close.Name = "Close"
	close.AnchorPoint = Vector2.new(1, 0)
	close.Position = UDim2.new(1, -12, 0, 8)
	close.Size = UDim2.fromOffset(48, 48)
	close.Text = "X"
	close.TextSize = 30
	close.Parent = header
	SimulatorUITheme.StyleButton(close, SimulatorUITheme.Colors.Red)

	local list = Instance.new("ScrollingFrame")
	list.Name = "CommentList"
	list.BackgroundColor3 = SimulatorUITheme.Colors.DarkPanelDeep
	list.BorderSizePixel = 0
	list.CanvasSize = UDim2.fromOffset(0, 0)
	list.Position = UDim2.fromOffset(14, 78)
	list.ScrollBarThickness = 4
	list.Size = UDim2.new(1, -28, 1, -156)
	list.Parent = panel
	SimulatorUITheme.AddCorner(list, 3)
	SimulatorUITheme.AddStroke(list, 3)

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 8)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list

	layout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
		list.CanvasSize = UDim2.fromOffset(0, layout.AbsoluteContentSize.Y + 12)
	end)

	local empty = Instance.new("TextLabel")
	empty.Name = "Empty"
	empty.BackgroundTransparency = 1
	empty.Font = Enum.Font.GothamBlack
	empty.Position = UDim2.fromOffset(18, 80)
	empty.Size = UDim2.new(1, -36, 0, 40)
	empty.Text = "Nenhum comentario ainda."
	empty.TextColor3 = SimulatorUITheme.Colors.White
	empty.TextSize = 14
	empty.Parent = list
	SimulatorUITheme.AddTextStroke(empty, 2)

	local input = Instance.new("TextBox")
	input.Name = "Input"
	input.BackgroundColor3 = SimulatorUITheme.Colors.DarkPanelDeep
	input.BorderSizePixel = 0
	input.ClearTextOnFocus = false
	input.Font = Enum.Font.Gotham
	input.PlaceholderText = "Digite seu comentario..."
	input.Position = UDim2.new(0, 14, 1, -62)
	input.Size = UDim2.new(1, -126, 0, 44)
	input.Text = ""
	input.TextColor3 = SimulatorUITheme.Colors.White
	input.TextSize = 14
	input.Parent = panel
	SimulatorUITheme.AddCorner(input, 3)
	SimulatorUITheme.AddStroke(input, 3)

	local send = Instance.new("TextButton")
	send.Name = "Send"
	send.Position = UDim2.new(1, -100, 1, -62)
	send.Size = UDim2.fromOffset(86, 44)
	send.Text = "Enviar"
	send.TextSize = 14
	send.Parent = panel
	SimulatorUITheme.StyleButton(send, SimulatorUITheme.Colors.Green)

	local function clearRows()
		for _, child in list:GetChildren() do
			if child:IsA("GuiObject") and child.Name ~= "Empty" then
				child:Destroy()
			end
		end
	end

	local function createCommentRow(comment, index: number)
		local row = Instance.new("Frame")
		row.Name = `Comment{index}`
		row.BackgroundColor3 = SimulatorUITheme.Colors.Header
		row.BorderSizePixel = 0
		row.LayoutOrder = index
		row.Size = UDim2.new(1, -10, 0, 96)
		row.Parent = list

		SimulatorUITheme.AddCorner(row, 3)
		SimulatorUITheme.AddStroke(row, 3)

		local avatar = Instance.new("TextLabel")
		avatar.Name = "Avatar"
		avatar.BackgroundColor3 = SimulatorUITheme.Colors.Yellow
		avatar.BorderSizePixel = 0
		avatar.Font = Enum.Font.GothamBlack
		avatar.Position = UDim2.fromOffset(10, 12)
		avatar.Size = UDim2.fromOffset(38, 38)
		avatar.Text = string.sub(comment.PlayerName, 1, 1)
		avatar.TextColor3 = SimulatorUITheme.Colors.White
		avatar.TextSize = 18
		avatar.Parent = row

		SimulatorUITheme.AddCorner(avatar, 3)
		SimulatorUITheme.AddStroke(avatar, 2)
		SimulatorUITheme.AddTextStroke(avatar, 2)

		local name = Instance.new("TextLabel")
		name.Name = "PlayerName"
		name.BackgroundTransparency = 1
		name.Font = Enum.Font.GothamBlack
		name.Position = UDim2.fromOffset(58, 10)
		name.Size = UDim2.new(1, -150, 0, 22)
		name.Text = comment.PlayerName
		name.TextColor3 = Color3.fromRGB(255, 255, 255)
		name.TextSize = 14
		name.TextTruncate = Enum.TextTruncate.AtEnd
		name.TextXAlignment = Enum.TextXAlignment.Left
		name.Parent = row
		SimulatorUITheme.AddTextStroke(name, 2)

		local text = Instance.new("TextLabel")
		text.Name = "Text"
		text.BackgroundTransparency = 1
		text.Font = Enum.Font.Gotham
		text.Position = UDim2.fromOffset(58, 34)
		text.Size = UDim2.new(1, -72, 0, 38)
		text.Text = comment.Text
		text.TextColor3 = SimulatorUITheme.Colors.White
		text.TextSize = 13
		text.TextWrapped = true
		text.TextXAlignment = Enum.TextXAlignment.Left
		text.TextYAlignment = Enum.TextYAlignment.Top
		text.Parent = row
		SimulatorUITheme.AddTextStroke(text, 1)

		local likeButton = Instance.new("TextButton")
		likeButton.Name = "LikeComment"
		likeButton.AnchorPoint = Vector2.new(1, 0)
		likeButton.BackgroundTransparency = 1
		likeButton.Font = Enum.Font.GothamBlack
		likeButton.Position = UDim2.new(1, -10, 0, 10)
		likeButton.Size = UDim2.fromOffset(62, 56)
		likeButton.Text = `{if comment.Liked then "♥" else "♡"}\n{formatCompactNumber(comment.Likes)}`
		likeButton.TextColor3 = SimulatorUITheme.Colors.White
		likeButton.TextSize = 16
		likeButton.Parent = row
		SimulatorUITheme.AddTextStroke(likeButton, 2)

		likeButton.Activated:Connect(function()
			comment.Liked = not comment.Liked
			comment.Likes += if comment.Liked then 1 else -1
			comment.Likes = math.max(0, comment.Likes)
			likeButton.Text = `{if comment.Liked then "♥" else "♡"}\n{formatCompactNumber(comment.Likes)}`
		end)
	end

	local function renderComments()
		local entry = getCurrentEntry()
		if not entry then
			return
		end

		local stats = getStats(entry)
		clearRows()
		empty.Visible = #stats.CommentList == 0

		for index, comment in stats.CommentList do
			createCommentRow(comment, index)
		end
	end

	local function submitComment()
		local entry = getCurrentEntry()
		local text = string.gsub(input.Text, "^%s*(.-)%s*$", "%1")
		if not entry or text == "" then
			return
		end

		local stats = getStats(entry)
		table.insert(stats.CommentList, {
			PlayerName = LOCAL_PLAYER.DisplayName or LOCAL_PLAYER.Name,
			Text = text,
			Likes = 0,
			Liked = false,
		})
		stats.Comments += 1
		refreshMetrics(entry)
		input.Text = ""
		renderComments()
	end

	send.Activated:Connect(submitComment)

	input.FocusLost:Connect(function(enterPressed)
		if enterPressed then
			submitComment()
		end
	end)

	close.Activated:Connect(function()
		gui.Enabled = false
	end)

	gui:GetPropertyChangedSignal("Enabled"):Connect(function()
		if gui.Enabled then
			renderComments()
		end
	end)

	return gui
end

local function toggleLike()
	local entry = getCurrentEntry()
	if not entry then
		return
	end

	local stats = getStats(entry)
	stats.Liked = not stats.Liked
	stats.Likes += if stats.Liked then 1 else -1
	stats.Likes = math.max(0, stats.Likes)
	refreshMetrics(entry)
end

local function openCommentBox()
	local gui = createCommentGui()
	gui.Enabled = true

	local input = gui:FindFirstChild("Input", true)
	if input and input:IsA("TextBox") then
		input:CaptureFocus()
	end
end

local function shareGame()
	local entry = getCurrentEntry()
	if entry then
		local stats = getStats(entry)
		stats.Shares += 1
		refreshMetrics(entry)
	end

	local ok, canInvite = pcall(function()
		return SocialService:CanSendGameInviteAsync(LOCAL_PLAYER)
	end)

	if ok and canInvite then
		pcall(function()
			SocialService:PromptGameInvite(LOCAL_PLAYER)
		end)
	end
end

local function connectVideoTap()
	if not videoImage then
		return
	end

	local button = createTransparentButton(videoImage, "PlayPauseButton")
	button.Activated:Connect(function()
		if not playbackHandle then
			playCurrent()
			return
		end

		setPaused(not isPaused)
	end)
end

local function connectMetricButton(metricName: string, callback)
	if not rootFrame then
		return
	end

	local metric = rootFrame:FindFirstChild(metricName)
	if metric and metric:IsA("GuiObject") then
		metric.ZIndex = videoImage.ZIndex + 20
		for _, child in metric:GetDescendants() do
			if child:IsA("GuiObject") then
				child.ZIndex = metric.ZIndex
			end
		end

		local button = createTransparentButton(metric, "ActionButton")
		button.Activated:Connect(callback)
	end
end

local function connectArrowButton(buttonName: string, direction: number)
	local decor = Workspace:FindFirstChild("VideoReelDecor")
	if not decor then
		return
	end

	local button = decor:FindFirstChild(buttonName, true)
	if button and button:IsA("GuiButton") then
		button.Activated:Connect(function()
			changeVideo(direction)
		end)
	end
end

function VideoReelDisplayController:Start()
	local part = nil

	for _ = 1, 120 do
		part = findVideoReelPart()
		if part then
			rootFrame, videoImage = findDisplayObjects(part)
			if rootFrame and videoImage then
				break
			end
		end
		task.wait(0.25)
	end

	if not part or not rootFrame or not videoImage then
		warn("[VideoReelDisplayController] Workspace.VideoReel with JetstreamSurfaceGui was not found.")
		return
	end

	videoReelPart = part
	videoImage.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	videoImage.BackgroundTransparency = 0
	videoImage.ImageTransparency = 0
	videoImage.ImageColor3 = Color3.fromRGB(255, 255, 255)

	for _, child in videoImage:GetChildren() do
		if child:IsA("UIGradient") then
			child.Enabled = false
		end
	end

	ensureAudioLabel()
	ensureDurationLabel()
	connectArrowButton("PreviousButton", -1)
	connectArrowButton("NextButton", 1)
	connectVideoTap()
	connectMetricButton("LikeMetric", toggleLike)
	connectMetricButton("CommentMetric", openCommentBox)
	connectMetricButton("ShareMetric", shareGame)
	playCurrent()
end

return VideoReelDisplayController
