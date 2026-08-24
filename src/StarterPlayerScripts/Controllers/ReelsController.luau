local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SocialService = game:GetService("SocialService")

local ReelsController = {}

local LOCAL_PLAYER = Players.LocalPlayer
local SimulatorUITheme = require(ReplicatedStorage.Shared.Modules.SimulatorUITheme)

local gui
local panel
local list
local statusLabel
local selectedUrlLabel
local getReelsRemote
local reelsUpdatedRemote

local function clearList()
	for _, child in list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
end

local function formatDuration(duration: number)
	local totalSeconds = math.max(0, math.floor(duration))
	local minutes = math.floor(totalSeconds / 60)
	local seconds = totalSeconds % 60

	return string.format("%d:%02d", minutes, seconds)
end

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

local function promptGameShare()
	local ok, canInvite = pcall(function()
		return SocialService:CanSendGameInviteAsync(LOCAL_PLAYER)
	end)

	if ok and canInvite then
		local promptOk = pcall(function()
			SocialService:PromptGameInvite(LOCAL_PLAYER)
		end)

		if not promptOk then
			selectedUrlLabel.Text = "Compartilhamento do jogo indisponivel agora."
		end
	else
		selectedUrlLabel.Text = "Compartilhamento do jogo indisponivel neste dispositivo."
	end
end

local function openExternalUrl(url: string)
	if url == "" then
		selectedUrlLabel.Text = "Link indisponivel"
		return
	end

	selectedUrlLabel.Text = url

	local ok = pcall(function()
		GuiService:OpenBrowserWindow(url)
	end)

	if not ok then
		statusLabel.Text = "Link selecionado"
	end
end

local function createReelRow(parent: Instance, reel, index: number)
	local row = Instance.new("Frame")
	row.Name = `Reel{index}`
	row.BackgroundColor3 = SimulatorUITheme.Colors.Header
	row.BorderSizePixel = 0
	row.Size = UDim2.new(1, 0, 0, 90)
	row.Parent = parent
	SimulatorUITheme.AddCorner(row, 3)
	SimulatorUITheme.AddStroke(row, 3)

	local thumbnail = Instance.new("Frame")
	thumbnail.Name = "Thumbnail"
	thumbnail.BackgroundColor3 = SimulatorUITheme.Colors.Yellow
	thumbnail.BorderSizePixel = 0
	thumbnail.Position = UDim2.fromOffset(8, 8)
	thumbnail.Size = UDim2.fromOffset(46, 58)
	thumbnail.Parent = row

	SimulatorUITheme.AddCorner(thumbnail, 3)
	SimulatorUITheme.AddStroke(thumbnail, 2)

	local play = Instance.new("TextLabel")
	play.Name = "Play"
	play.BackgroundTransparency = 1
	play.Font = Enum.Font.GothamBold
	play.Size = UDim2.fromScale(1, 1)
	play.Text = ">"
	play.TextColor3 = Color3.fromRGB(245, 252, 246)
	play.TextSize = 24
	play.Parent = thumbnail
	SimulatorUITheme.AddTextStroke(play, 2)

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamBlack
	title.Position = UDim2.fromOffset(64, 9)
	title.Size = UDim2.new(1, -132, 0, 22)
	title.Text = if reel.Title ~= "" then reel.Title else `Reel {index}`
	title.TextColor3 = Color3.fromRGB(245, 248, 246)
	title.TextSize = 14
	title.TextTruncate = Enum.TextTruncate.AtEnd
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = row
	SimulatorUITheme.AddTextStroke(title, 2)

	local description = Instance.new("TextLabel")
	description.Name = "Description"
	description.BackgroundTransparency = 1
	description.Font = Enum.Font.Gotham
	description.Position = UDim2.fromOffset(64, 32)
	description.Size = UDim2.new(1, -132, 0, 18)
	description.Text = if reel.Description ~= "" then reel.Description else "TikTok"
	description.TextColor3 = Color3.fromRGB(185, 202, 198)
	description.TextSize = 12
	description.TextTruncate = Enum.TextTruncate.AtEnd
	description.TextXAlignment = Enum.TextXAlignment.Left
	description.Parent = row
	SimulatorUITheme.AddTextStroke(description, 1)

	local duration = Instance.new("TextLabel")
	duration.Name = "Duration"
	duration.BackgroundTransparency = 1
	duration.Font = Enum.Font.GothamMedium
	duration.Position = UDim2.fromOffset(64, 52)
	duration.Size = UDim2.new(1, -132, 0, 14)
	duration.Text = formatDuration(reel.Duration)
	duration.TextColor3 = Color3.fromRGB(145, 170, 165)
	duration.TextSize = 11
	duration.TextXAlignment = Enum.TextXAlignment.Left
	duration.Parent = row
	SimulatorUITheme.AddTextStroke(duration, 1)

	local metrics = Instance.new("TextLabel")
	metrics.Name = "Metrics"
	metrics.BackgroundTransparency = 1
	metrics.Font = Enum.Font.GothamMedium
	metrics.Position = UDim2.fromOffset(64, 66)
	metrics.Size = UDim2.new(1, -132, 0, 16)
	metrics.Text = string.format(
		"Likes %s  Coment. %s  Shares %s",
		formatCompactNumber(reel.LikeCount or 0),
		formatCompactNumber(reel.CommentCount or 0),
		formatCompactNumber(reel.ShareCount or 0)
	)
	metrics.TextColor3 = Color3.fromRGB(198, 218, 213)
	metrics.TextSize = 11
	metrics.TextTruncate = Enum.TextTruncate.AtEnd
	metrics.TextXAlignment = Enum.TextXAlignment.Left
	metrics.Parent = row
	SimulatorUITheme.AddTextStroke(metrics, 1)

	local openButton = Instance.new("TextButton")
	openButton.Name = "OpenButton"
	openButton.AnchorPoint = Vector2.new(1, 0.5)
	openButton.Position = UDim2.new(1, -8, 0.5, 0)
	openButton.Size = UDim2.fromOffset(54, 30)
	openButton.Text = "Abrir"
	openButton.TextSize = 12
	openButton.Parent = row
	SimulatorUITheme.StyleButton(openButton, SimulatorUITheme.Colors.Green)

	openButton.Activated:Connect(function()
		openExternalUrl(reel.ShareUrl)
	end)
end

local function renderSnapshot(snapshot)
	clearList()

	if type(snapshot) ~= "table" or snapshot.Ok ~= true then
		statusLabel.Text = "Reels indisponiveis"
		selectedUrlLabel.Text = if type(snapshot) == "table" and snapshot.Message then snapshot.Message else "Conecte o TikTok no servidor Node."
		return
	end

	local profile = snapshot.Profile
	if type(profile) == "table" and profile.display_name then
		statusLabel.Text = `TikTok: {profile.display_name}`
	else
		statusLabel.Text = "TikTok Reels"
	end

	if #snapshot.Reels == 0 then
		selectedUrlLabel.Text = "Nenhum reel encontrado."
		return
	end

	selectedUrlLabel.Text = "Selecione um reel para abrir o link."

	for index, reel in snapshot.Reels do
		createReelRow(list, reel, index)
	end
end

local function createGui()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existingGui = playerGui:FindFirstChild("ReelsGui")
	if existingGui then
		existingGui:Destroy()
	end

	gui = Instance.new("ScreenGui")
	gui.Name = "ReelsGui"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.Parent = playerGui

	local toggle = Instance.new("TextButton")
	toggle.Name = "Toggle"
	toggle.AnchorPoint = Vector2.new(1, 0)
	toggle.Position = UDim2.new(1, -16, 0, 16)
	toggle.Size = UDim2.fromOffset(112, 34)
	toggle.Text = "Reels"
	toggle.TextSize = 14
	toggle.Parent = gui
	SimulatorUITheme.StyleButton(toggle, SimulatorUITheme.Colors.Header)

	panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.AnchorPoint = Vector2.new(1, 0)
	panel.Position = UDim2.new(1, -16, 0, 58)
	panel.Size = UDim2.fromOffset(380, 430)
	panel.Visible = false
	panel.Parent = gui
	SimulatorUITheme.StylePanel(panel)

	local padding = Instance.new("UIPadding")
	padding.PaddingBottom = UDim.new(0, 12)
	padding.PaddingLeft = UDim.new(0, 12)
	padding.PaddingRight = UDim.new(0, 12)
	padding.PaddingTop = UDim.new(0, 12)
	padding.Parent = panel

	statusLabel = Instance.new("TextLabel")
	statusLabel.Name = "Status"
	statusLabel.BackgroundTransparency = 1
	statusLabel.Font = Enum.Font.GothamBlack
	statusLabel.Size = UDim2.new(1, 0, 0, 24)
	statusLabel.Text = "Carregando reels..."
	statusLabel.TextColor3 = Color3.fromRGB(245, 248, 246)
	statusLabel.TextSize = 16
	statusLabel.TextXAlignment = Enum.TextXAlignment.Left
	statusLabel.Parent = panel
	SimulatorUITheme.AddTextStroke(statusLabel, 2)

	list = Instance.new("ScrollingFrame")
	list.Name = "List"
	list.BackgroundTransparency = 1
	list.BorderSizePixel = 0
	list.CanvasSize = UDim2.fromOffset(0, 0)
	list.Position = UDim2.fromOffset(0, 34)
	list.ScrollBarThickness = 4
	list.Size = UDim2.new(1, 0, 1, -92)
	list.Parent = panel

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.Padding = UDim.new(0, 8)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list

	layout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
		list.CanvasSize = UDim2.fromOffset(0, layout.AbsoluteContentSize.Y)
	end)

	selectedUrlLabel = Instance.new("TextLabel")
	selectedUrlLabel.Name = "SelectedUrl"
	selectedUrlLabel.BackgroundTransparency = 1
	selectedUrlLabel.Font = Enum.Font.Gotham
	selectedUrlLabel.Position = UDim2.new(0, 0, 1, -46)
	selectedUrlLabel.Size = UDim2.new(1, 0, 0, 46)
	selectedUrlLabel.Text = ""
	selectedUrlLabel.TextColor3 = Color3.fromRGB(168, 190, 186)
	selectedUrlLabel.TextSize = 11
	selectedUrlLabel.TextWrapped = true
	selectedUrlLabel.TextXAlignment = Enum.TextXAlignment.Left
	selectedUrlLabel.TextYAlignment = Enum.TextYAlignment.Top
	selectedUrlLabel.Parent = panel
	SimulatorUITheme.AddTextStroke(selectedUrlLabel, 1)

	toggle.Activated:Connect(function()
		panel.Visible = not panel.Visible
	end)

	local shareGameButton = Instance.new("TextButton")
	shareGameButton.Name = "ShareGame"
	shareGameButton.AnchorPoint = Vector2.new(1, 0)
	shareGameButton.Position = UDim2.new(1, -136, 0, 16)
	shareGameButton.Size = UDim2.fromOffset(116, 34)
	shareGameButton.Text = "Convidar"
	shareGameButton.TextSize = 14
	shareGameButton.Parent = gui
	SimulatorUITheme.StyleButton(shareGameButton, SimulatorUITheme.Colors.Green)

	shareGameButton.Activated:Connect(promptGameShare)
end

function ReelsController:Start()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existingGui = playerGui:FindFirstChild("ReelsGui")
	if existingGui then
		existingGui:Destroy()
	end

	if true then
		return
	end

	createGui()

	local remotes = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Reels")
	getReelsRemote = remotes:WaitForChild("GetReels")
	reelsUpdatedRemote = remotes:WaitForChild("ReelsUpdated")

	reelsUpdatedRemote.OnClientEvent:Connect(renderSnapshot)

	local ok, snapshot = pcall(function()
		return getReelsRemote:InvokeServer()
	end)

	if ok then
		renderSnapshot(snapshot)
	else
		renderSnapshot({
			Ok = false,
			Message = tostring(snapshot),
		})
	end
end

return ReelsController
