local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Modules = ReplicatedStorage.Shared.Modules
local JetstreamFramePlayer = require(Modules.JetstreamFramePlayer)
local JetstreamReelsCatalog = require(Modules.JetstreamReelsCatalog)
local SimulatorUITheme = require(Modules.SimulatorUITheme)
local JetstreamVideos = Modules.JetstreamVideos

local LOCAL_PLAYER = Players.LocalPlayer

local JetstreamReelsController = {}

local gui
local panel
local videoImage
local titleLabel
local statusLabel
local likeLabel
local commentLabel
local shareLabel
local previousButton
local nextButton
local playbackHandle
local currentIndex = 1

local function formatCompactNumber(value: number)
	local rounded = math.max(0, math.floor(value))

	if rounded >= 1000000 then
		return string.format("%.1fM", rounded / 1000000)
	end

	if rounded >= 1000 then
		return string.format("%.1fK", rounded / 1000)
	end

	return tostring(rounded)
end

local function stopPlayback()
	if playbackHandle then
		playbackHandle:Stop()
		playbackHandle = nil
	end
end

local function getEntry(index: number)
	if #JetstreamReelsCatalog == 0 then
		return nil
	end

	local wrappedIndex = ((index - 1) % #JetstreamReelsCatalog) + 1
	currentIndex = wrappedIndex
	return JetstreamReelsCatalog[wrappedIndex]
end

local function setStatus(message: string)
	statusLabel.Text = message
end

local function playCurrent()
	stopPlayback()

	local entry = getEntry(currentIndex)
	if not entry then
		videoImage.Image = ""
		titleLabel.Text = "Jetstream Reels"
		likeLabel.Text = "0"
		commentLabel.Text = "0"
		shareLabel.Text = "0"
		setStatus("Nenhum video Jetstream importado ainda.")
		return
	end

	local moduleScript = JetstreamVideos:FindFirstChild(entry.ModuleName)
	if not moduleScript or not moduleScript:IsA("ModuleScript") then
		videoImage.Image = ""
		titleLabel.Text = entry.DisplayName or entry.Id
		setStatus(`Modulo nao encontrado: {entry.ModuleName}`)
		return
	end

	local ok, framesModule = pcall(require, moduleScript)
	if not ok then
		videoImage.Image = ""
		titleLabel.Text = entry.DisplayName or entry.Id
		setStatus(`Falha ao carregar frames: {framesModule}`)
		return
	end

	titleLabel.Text = entry.DisplayName or entry.Id
	likeLabel.Text = formatCompactNumber(entry.LikeCount or 0)
	commentLabel.Text = formatCompactNumber(entry.CommentCount or 0)
	shareLabel.Text = formatCompactNumber(entry.ShareCount or 0)
	setStatus(`Video {currentIndex}/{#JetstreamReelsCatalog}`)
	playbackHandle = JetstreamFramePlayer.Play(framesModule, videoImage, entry.Fps or 12, entry.Looped ~= false)
end

local function createIconMetric(parent: Instance, labelText: string, y: number)
	local holder = Instance.new("Frame")
	holder.Name = `{labelText}Metric`
	holder.AnchorPoint = Vector2.new(1, 1)
	holder.BackgroundTransparency = 1
	holder.Position = UDim2.new(1, -16, 1, -y)
	holder.Size = UDim2.fromOffset(64, 70)
	holder.Parent = parent

	local icon = Instance.new("TextLabel")
	icon.Name = "Icon"
	icon.BackgroundTransparency = 1
	icon.Font = Enum.Font.GothamBlack
	icon.Size = UDim2.new(1, 0, 0, 42)
	icon.Text = labelText
	icon.TextColor3 = Color3.fromRGB(255, 255, 255)
	icon.TextScaled = true
	icon.TextStrokeColor3 = Color3.fromRGB(20, 20, 20)
	icon.TextStrokeTransparency = 0.2
	icon.Parent = holder

	local metric = Instance.new("TextLabel")
	metric.Name = "Value"
	metric.BackgroundTransparency = 1
	metric.Font = Enum.Font.GothamBlack
	metric.Position = UDim2.fromOffset(0, 42)
	metric.Size = UDim2.new(1, 0, 0, 22)
	metric.Text = "0"
	metric.TextColor3 = Color3.fromRGB(255, 255, 255)
	metric.TextSize = 16
	metric.TextStrokeColor3 = Color3.fromRGB(20, 20, 20)
	metric.TextStrokeTransparency = 0.25
	metric.Parent = holder

	return metric
end

local function makeButton(parent: Instance, name: string, text: string, position: UDim2, activated)
	local button = Instance.new("TextButton")
	button.Name = name
	button.AnchorPoint = Vector2.new(0.5, 0.5)
	button.BackgroundColor3 = Color3.fromRGB(255, 211, 37)
	button.Position = position
	button.Size = UDim2.fromOffset(58, 58)
	button.Text = text
	button.TextColor3 = SimulatorUITheme.Colors.White
	button.TextSize = 28
	button.Parent = parent
	SimulatorUITheme.StyleButton(button, SimulatorUITheme.Colors.Yellow)

	button.Activated:Connect(activated)

	return button
end

local function createGui()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existing = playerGui:FindFirstChild("JetstreamReelsGui")
	if existing then
		existing:Destroy()
	end

	gui = Instance.new("ScreenGui")
	gui.Name = "JetstreamReelsGui"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = playerGui

	local toggle = Instance.new("TextButton")
	toggle.Name = "Toggle"
	toggle.AnchorPoint = Vector2.new(1, 0)
	toggle.Position = UDim2.new(1, -16, 0, 58)
	toggle.Size = UDim2.fromOffset(146, 36)
	toggle.Text = "Video Reels"
	toggle.TextColor3 = SimulatorUITheme.Colors.White
	toggle.TextSize = 14
	toggle.Parent = gui
	SimulatorUITheme.StyleButton(toggle, SimulatorUITheme.Colors.Header)

	panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.53)
	panel.Size = UDim2.fromOffset(330, 560)
	panel.Visible = false
	panel.Parent = gui
	SimulatorUITheme.StylePanel(panel)

	local aspect = Instance.new("UIAspectRatioConstraint")
	aspect.AspectRatio = 9 / 16
	aspect.DominantAxis = Enum.DominantAxis.Height
	aspect.Parent = panel

	videoImage = Instance.new("ImageLabel")
	videoImage.Name = "VideoImage"
	videoImage.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	videoImage.BorderSizePixel = 0
	videoImage.Size = UDim2.fromScale(1, 1)
	videoImage.ScaleType = Enum.ScaleType.Crop
	videoImage.Parent = panel

	titleLabel = Instance.new("TextLabel")
	titleLabel.Name = "Title"
	titleLabel.BackgroundTransparency = 1
	titleLabel.Font = Enum.Font.GothamBlack
	titleLabel.Position = UDim2.fromOffset(14, 14)
	titleLabel.Size = UDim2.new(1, -92, 0, 48)
	titleLabel.Text = "Jetstream Reels"
	titleLabel.TextSize = 18
	titleLabel.TextWrapped = true
	titleLabel.TextXAlignment = Enum.TextXAlignment.Left
	titleLabel.Parent = panel
	SimulatorUITheme.StyleText(titleLabel, 2)

	statusLabel = Instance.new("TextLabel")
	statusLabel.Name = "Status"
	statusLabel.AnchorPoint = Vector2.new(0, 1)
	statusLabel.BackgroundTransparency = 1
	statusLabel.Font = Enum.Font.GothamBold
	statusLabel.Position = UDim2.new(0, 14, 1, -16)
	statusLabel.Size = UDim2.new(1, -104, 0, 24)
	statusLabel.Text = ""
	statusLabel.TextSize = 13
	statusLabel.TextXAlignment = Enum.TextXAlignment.Left
	statusLabel.Parent = panel
	SimulatorUITheme.StyleText(statusLabel, 2)

	likeLabel = createIconMetric(panel, "H", 220)
	commentLabel = createIconMetric(panel, "C", 142)
	shareLabel = createIconMetric(panel, "S", 64)

	previousButton = makeButton(gui, "Previous", "<", UDim2.new(0.5, -222, 0.53, 0), function()
		currentIndex -= 1
		playCurrent()
	end)

	nextButton = makeButton(gui, "Next", ">", UDim2.new(0.5, 222, 0.53, 0), function()
		currentIndex += 1
		playCurrent()
	end)
	previousButton.Visible = false
	nextButton.Visible = false

	toggle.Activated:Connect(function()
		panel.Visible = not panel.Visible
		previousButton.Visible = panel.Visible
		nextButton.Visible = panel.Visible
		if panel.Visible then
			playCurrent()
		else
			stopPlayback()
		end
	end)
end

function JetstreamReelsController:Start()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existing = playerGui:FindFirstChild("JetstreamReelsGui")
	if existing then
		existing:Destroy()
	end

	stopPlayback()
	if true then
		return
	end

	createGui()
	playCurrent()
end

return JetstreamReelsController
