local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Fusion = require(ReplicatedStorage.Packages.Fusion)

local New = Fusion.New
local Children = Fusion.Children
local Value = Fusion.Value
local Computed = Fusion.Computed
local Tween = Fusion.Tween

local PlayerStatsController = {}

local LOCAL_PLAYER = Players.LocalPlayer
local STAT_ORDER = {
	"Dinheiro",
	"Algodao",
	"Nivel",
}

local STAT_LABELS = {
	Dinheiro = "Dinheiro",
	Algodao = "Algodao",
	Nivel = "Nivel",
}

local STAT_COLORS = {
	Dinheiro = Color3.fromRGB(34, 255, 18),
	Algodao = Color3.fromRGB(255, 255, 255),
	Nivel = Color3.fromRGB(255, 229, 0),
}

local STAT_TWEEN = TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

local statConnections = {}
local states = nil
local viewportConnection = nil

local function formatNumber(value: number)
	local sign = if value < 0 then "-" else ""
	local text = tostring(math.abs(math.floor(value)))
	local formatted = text:reverse():gsub("(%d%d%d)", "%1,"):reverse()

	if formatted:sub(1, 1) == "," then
		formatted = formatted:sub(2)
	end

	return sign .. formatted
end

local function getViewportSize()
	if Workspace.CurrentCamera then
		return Workspace.CurrentCamera.ViewportSize
	end

	return Vector2.new(1280, 720)
end

local function clearStatConnections()
	for _, connection in statConnections do
		connection:Disconnect()
	end

	table.clear(statConnections)
end

local function outlinedText(props)
	return New("TextLabel")({
		Name = props.Name,
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBlack,
		Position = props.Position,
		Size = props.Size,
		Text = props.Text,
		TextColor3 = props.TextColor3,
		TextScaled = props.TextScaled or false,
		TextSize = props.TextSize or 18,
		TextXAlignment = props.TextXAlignment or Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Center,
		[Children] = {
			New("UIStroke")({
				ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
				Color = Color3.fromRGB(0, 0, 0),
				Thickness = props.StrokeThickness or 2.5,
			}),
			props.Children,
		},
	})
end

local function createStatText(statName: string, index: number)
	local valueText = Computed(function()
		local value = states.Values[statName]:get()
		local label = STAT_LABELS[statName] or statName
		local formatted = if statName == "Dinheiro" then "$" .. formatNumber(value) else formatNumber(value)

		return `{label}: {formatted}`
	end)
	local color = Computed(function()
		if states.Pulses[statName]:get() then
			return Color3.fromRGB(255, 255, 255)
		end

		return STAT_COLORS[statName] or Color3.fromRGB(255, 255, 255)
	end)

	return outlinedText({
		Name = `{statName}Text`,
		Position = Computed(function()
			local scale = if states.Viewport:get().X < 760 then 0.86 else 1

			return UDim2.fromOffset(14, 30 + ((index - 1) * math.floor(31 * scale)))
		end),
		Size = Computed(function()
			local width = if states.Viewport:get().X < 760 then 210 else 250

			return UDim2.fromOffset(width, 30)
		end),
		Text = valueText,
		TextColor3 = Tween(color, STAT_TWEEN),
		TextScaled = true,
		StrokeThickness = 2.7,
		Children = New("UITextSizeConstraint")({
			MinTextSize = 14,
			MaxTextSize = 23,
		}),
	})
end

local function createHud()
	local playerGui = LOCAL_PLAYER:WaitForChild("PlayerGui")
	local existingGui = playerGui:FindFirstChild("PlayerStatsGui")
	if existingGui then
		existingGui:Destroy()
	end

	if viewportConnection then
		viewportConnection:Disconnect()
		viewportConnection = nil
	end

	states = {
		Pulses = {},
		Values = {},
		Viewport = Value(getViewportSize()),
	}

	for _, statName in STAT_ORDER do
		states.Values[statName] = Value(0)
		states.Pulses[statName] = Value(false)
	end

	if Workspace.CurrentCamera then
		viewportConnection = Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
			states.Viewport:set(getViewportSize())
		end)
	end

	local children = {
		outlinedText({
			Name = "AtelierTitle",
			Position = UDim2.fromOffset(14, 4),
			Size = UDim2.fromOffset(180, 28),
			Text = "ATELIER",
			TextColor3 = Color3.fromRGB(34, 255, 18),
			TextSize = 21,
			StrokeThickness = 2.6,
		}),
	}

	for index, statName in STAT_ORDER do
		table.insert(children, createStatText(statName, index))
	end

	New("ScreenGui")({
		Name = "PlayerStatsGui",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = playerGui,
		[Children] = children,
	})
end

local function updateStat(statName: string, value: number)
	if not states or not states.Values[statName] then
		return
	end

	states.Values[statName]:set(value)
	states.Pulses[statName]:set(true)

	task.delay(0.16, function()
		if states and states.Pulses[statName] then
			states.Pulses[statName]:set(false)
		end
	end)
end

local function bindLeaderstats(leaderstats: Instance)
	clearStatConnections()

	for _, statName in STAT_ORDER do
		local stat = leaderstats:WaitForChild(statName, 10)
		if stat and stat:IsA("IntValue") then
			updateStat(statName, stat.Value)

			table.insert(statConnections, stat.Changed:Connect(function(value)
				updateStat(statName, value)
			end))
		end
	end
end

function PlayerStatsController:Start()
	createHud()

	local leaderstats = LOCAL_PLAYER:WaitForChild("leaderstats", 10)
	if not leaderstats then
		warn("[PlayerStatsController] leaderstats not found for local player")
		return
	end

	bindLeaderstats(leaderstats)
end

return PlayerStatsController
