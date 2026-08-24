local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Fusion = require(ReplicatedStorage.Packages.Fusion)
local ItemConfig = require(ReplicatedStorage.Shared.Modules.ItemConfig)
local MachineConfig = require(ReplicatedStorage.Shared.Modules.MachineConfig)
local SkillTreeConfig = require(ReplicatedStorage.Shared.Modules.SkillTreeConfig)
local UIAssets = require(ReplicatedStorage.Shared.Modules.UIAssets)

local New = Fusion.New
local Children = Fusion.Children
local OnEvent = Fusion.OnEvent
local Value = Fusion.Value
local Computed = Fusion.Computed
local Tween = Fusion.Tween
local Spring = Fusion.Spring

local FactoryUIController = {}

FactoryUIController.Gui = nil
FactoryUIController.Remotes = nil
FactoryUIController.States = nil
FactoryUIController.ViewportConnection = nil
FactoryUIController.RgbConnection = nil

local ITEM_ORDER = {
	"RawCotton",
	"CleanCotton",
	"CottonThread",
	"CottonFabric",
}

local TAB_ORDER = {
	{ Id = "Machines", Label = "Machines", Icon = "Machine" },
	{ Id = "Skills", Label = "Skills", Icon = "Upgrade" },
	{ Id = "Storage", Label = "Storage", Icon = "Storage" },
	{ Id = "Market", Label = "Market", Icon = "Market" },
}

local COLORS = {
	Ink = Color3.fromRGB(255, 255, 255),
	MutedInk = Color3.fromRGB(255, 246, 170),
	Cream = Color3.fromRGB(255, 238, 164),
	Panel = Color3.fromRGB(221, 235, 249),
	PanelDeep = Color3.fromRGB(185, 207, 229),
	Card = Color3.fromRGB(228, 34, 34),
	Mint = Color3.fromRGB(25, 255, 21),
	MintDark = Color3.fromRGB(8, 205, 9),
	Rose = Color3.fromRGB(255, 18, 18),
	Peach = Color3.fromRGB(255, 178, 0),
	Sky = Color3.fromRGB(0, 136, 255),
	Lavender = Color3.fromRGB(145, 0, 222),
	Gold = Color3.fromRGB(255, 229, 0),
	Stroke = Color3.fromRGB(0, 0, 0),
	Shadow = Color3.fromRGB(0, 0, 0),
	White = Color3.fromRGB(255, 255, 255),
	Header = Color3.fromRGB(255, 25, 230),
	HeaderDark = Color3.fromRGB(159, 0, 255),
	Purple = Color3.fromRGB(122, 0, 204),
	Black = Color3.fromRGB(0, 0, 0),
	PriceGreen = Color3.fromRGB(34, 255, 18),
	PricePurple = Color3.fromRGB(214, 0, 255),
	LightText = Color3.fromRGB(255, 255, 255),
	DarkText = Color3.fromRGB(36, 31, 38),
}

local ITEM_ACCENTS = {
	RawCotton = COLORS.Peach,
	CleanCotton = COLORS.Rose,
	CottonThread = COLORS.Lavender,
	CottonFabric = COLORS.Gold,
}

local ITEM_ICONS = {
	RawCotton = "Cotton",
	CleanCotton = "Storage",
	CottonThread = "Upgrade",
	CottonFabric = "Fabric",
}

local DEFAULT_INVENTORY = {
	Items = {},
	Limits = {},
}

local DEFAULT_FACTORY = {
	Machines = {},
}

local DEFAULT_UPGRADES = {
	NextCosts = {},
}

local DEFAULT_SKILLS = {
	Unlocked = {},
	UnlockedCount = 0,
	TotalCount = #SkillTreeConfig.Order,
}

local SKILL_NODE_SIZE = Vector2.new(142, 78)
local SKILL_TREE_SIZE = Vector2.new(508, 238)
local SKILL_COLUMN_GAP = 166
local SKILL_ROW_GAP = 112
local SKILL_ORIGIN = Vector2.new(72, 58)

local BUTTON_TWEEN = TweenInfo.new(0.16, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local FILL_TWEEN = TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

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

local function getStoredValue(inventory)
	local total = 0
	for _, itemId in ITEM_ORDER do
		local item = ItemConfig.GetItem(itemId)
		local amount = inventory.Items[itemId] or 0
		total += amount * (if item then item.BaseValue else 0)
	end

	return total
end

local function getSkillPosition(skill)
	return Vector2.new(
		SKILL_ORIGIN.X + ((skill.Column - 1) * SKILL_COLUMN_GAP),
		SKILL_ORIGIN.Y + ((skill.Row - 1) * SKILL_ROW_GAP)
	)
end

local function getSkillStatus(unlockedSkills, skillId: string)
	if unlockedSkills and unlockedSkills[skillId] then
		return "Unlocked"
	end

	return if SkillTreeConfig.ArePrerequisitesUnlocked(unlockedSkills, skillId) then "Available" else "Locked"
end

local function isMobileViewport(viewport: Vector2)
	return viewport.X < 760
end

local function getOpenPosition(viewport: Vector2)
	return UDim2.new(0.5, 0, 0.5, if isMobileViewport(viewport) then 12 else 0)
end

local function getClosedPosition(viewport: Vector2)
	if isMobileViewport(viewport) then
		return UDim2.new(0.5, 0, 1, 390)
	end

	return UDim2.new(0.5, 0, 1, 430)
end

local function corner(radius: number?)
	return New("UICorner")({
		CornerRadius = UDim.new(0, radius or 4),
	})
end

local function stroke(color: Color3?, transparency: number?, thickness: number?)
	return New("UIStroke")({
		Color = color or COLORS.Stroke,
		Transparency = transparency or 0.35,
		Thickness = thickness or 1,
	})
end

local function padding(top: number, right: number, bottom: number, left: number)
	return New("UIPadding")({
		PaddingTop = UDim.new(0, top),
		PaddingRight = UDim.new(0, right),
		PaddingBottom = UDim.new(0, bottom),
		PaddingLeft = UDim.new(0, left),
	})
end

local function textSizeConstraint(minSize: number, maxSize: number)
	return New("UITextSizeConstraint")({
		MinTextSize = minSize,
		MaxTextSize = maxSize,
	})
end

local function label(props)
	local textStrokeColor = if props.TextStrokeColor == nil then COLORS.Black else props.TextStrokeColor
	local textStrokeTransparency = if props.TextStrokeTransparency == nil then 0 else props.TextStrokeTransparency
	local textStrokeThickness = if props.TextStrokeThickness == nil then 1.5 else props.TextStrokeThickness

	return New("TextLabel")({
		Name = props.Name,
		AnchorPoint = props.AnchorPoint,
		BackgroundTransparency = 1,
		Font = props.Font or Enum.Font.Gotham,
		Position = props.Position,
		Size = props.Size,
		Text = props.Text,
		TextColor3 = props.TextColor3 or COLORS.Ink,
		TextScaled = props.TextScaled or false,
		TextSize = props.TextSize or 14,
		TextWrapped = if props.TextWrapped == nil then true else props.TextWrapped,
		TextXAlignment = props.TextXAlignment or Enum.TextXAlignment.Left,
		TextYAlignment = props.TextYAlignment or Enum.TextYAlignment.Center,
		Visible = props.Visible,
		[Children] = {
			if textStrokeThickness > 0
				then New("UIStroke")({
					Color = textStrokeColor,
					Transparency = textStrokeTransparency,
					Thickness = textStrokeThickness,
				})
				else nil,
			props.Children,
		},
	})
end

local function card(props)
	local textureImage = props.TextureImage or UIAssets.GoldPlateImage
	local textureVisible = textureImage ~= ""

	return New("Frame")({
		Name = props.Name,
		BackgroundColor3 = props.BackgroundColor3 or COLORS.Card,
		BorderSizePixel = 0,
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size,
		Visible = props.Visible,
		[Children] = {
			corner(3),
			stroke(COLORS.Black, 0, props.StrokeThickness or 4),
			New("ImageLabel")({
				Name = "PlateTexture",
				BackgroundTransparency = 1,
				Image = textureImage,
				ImageColor3 = props.TextureColor or Color3.fromRGB(255, 255, 255),
				ImageTransparency = props.TextureTransparency or 0.14,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(92, 92),
				Visible = textureVisible,
			}),
			props.Padding,
			props.Children,
		},
	})
end

local function iconBadge(props)
	local iconId = props.Icon or "Cotton"
	local rectOffset = UIAssets.GetIconRect(iconId)
	local hasIcon = UIAssets.HasIconSheet()

	return New("Frame")({
		Name = props.Name or `{iconId}Icon`,
		AnchorPoint = props.AnchorPoint,
		BackgroundColor3 = props.BackgroundColor3 or COLORS.PanelDeep,
		BorderSizePixel = 0,
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size or UDim2.fromOffset(36, 36),
		Visible = props.Visible,
		[Children] = {
			corner(3),
			stroke(COLORS.Black, 0, 3),
			New("ImageLabel")({
				Name = "Image",
				BackgroundTransparency = 1,
				Image = UIAssets.IconSheetImage,
				ImageRectOffset = rectOffset,
				ImageRectSize = UIAssets.IconSheetCellSize,
				Position = UDim2.fromOffset(4, 4),
				ScaleType = Enum.ScaleType.Fit,
				Size = UDim2.new(1, -8, 1, -8),
				Visible = hasIcon,
			}),
			New("Frame")({
				Name = "FallbackDot",
				AnchorPoint = Vector2.new(0.5, 0.5),
				BackgroundColor3 = props.AccentColor or COLORS.Mint,
				BorderSizePixel = 0,
				Position = UDim2.fromScale(0.5, 0.5),
				Size = UDim2.fromScale(0.42, 0.42),
				Visible = not hasIcon,
				[Children] = corner(8),
			}),
		},
	})
end

local function button(props)
	local hovered = Value(false)
	local pressed = Value(false)
	local baseColor = props.BackgroundColor3 or COLORS.MintDark
	local background = Computed(function()
		if hovered:get() then
			return baseColor:Lerp(COLORS.White, 0.12)
		end

		return baseColor
	end)
	local scale = Spring(Computed(function()
		if pressed:get() then
			return 0.96
		end

		return if hovered:get() then 1.02 else 1
	end), 28, 0.74)

	return New("TextButton")({
		Name = props.Name,
		AnchorPoint = props.AnchorPoint,
		AutoButtonColor = false,
		BackgroundColor3 = Tween(background, BUTTON_TWEEN),
		BackgroundTransparency = props.BackgroundTransparency,
		BorderSizePixel = 0,
		Font = props.Font or Enum.Font.GothamBlack,
		LayoutOrder = props.LayoutOrder,
		Position = props.Position,
		Size = props.Size,
		Text = props.Text,
		TextColor3 = props.TextColor3 or COLORS.White,
		TextScaled = true,
		TextWrapped = true,
		Visible = props.Visible,
		[OnEvent("Activated")] = props.Activated,
		[OnEvent("MouseEnter")] = function()
			hovered:set(true)
		end,
		[OnEvent("MouseLeave")] = function()
			hovered:set(false)
			pressed:set(false)
		end,
		[OnEvent("MouseButton1Down")] = function()
			pressed:set(true)
		end,
		[OnEvent("MouseButton1Up")] = function()
			pressed:set(false)
		end,
		[Children] = {
			corner(3),
			stroke(COLORS.Black, 0, 3),
			New("ImageLabel")({
				Name = "ButtonTexture",
				BackgroundTransparency = 1,
				Image = props.TextureImage or UIAssets.GreenPlateImage,
				ImageTransparency = 0.18,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(76, 76),
				Visible = (props.TextureImage or UIAssets.GreenPlateImage) ~= "",
			}),
			New("UIGradient")({
				Color = ColorSequence.new({
					ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 255, 255)),
					ColorSequenceKeypoint.new(0.48, Color3.fromRGB(255, 255, 255)),
					ColorSequenceKeypoint.new(0.5, baseColor),
					ColorSequenceKeypoint.new(1, baseColor:Lerp(COLORS.Black, 0.18)),
				}),
				Transparency = NumberSequence.new({
					NumberSequenceKeypoint.new(0, 0.78),
					NumberSequenceKeypoint.new(0.5, 0.94),
					NumberSequenceKeypoint.new(1, 0),
				}),
				Rotation = 90,
			}),
			New("UIStroke")({
				ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
				Color = COLORS.Black,
				Thickness = 2.4,
			}),
			props.RgbGradient,
			textSizeConstraint(10, props.MaxTextSize or 15),
			New("UIScale")({
				Scale = scale,
			}),
			props.Children,
		},
	})
end

local function tabButton(tab, states)
	local selected = Computed(function()
		return states.ActiveTab:get() == tab.Id
	end)

	return New("TextButton")({
		Name = `{tab.Id}Tab`,
		AutoButtonColor = false,
		BackgroundColor3 = Tween(Computed(function()
			return if selected:get() then COLORS.Header else COLORS.PanelDeep
		end), BUTTON_TWEEN),
		BorderSizePixel = 0,
		LayoutOrder = tab.LayoutOrder,
		Size = tab.Size or UDim2.new(1, 0, 0, 40),
		Font = Enum.Font.GothamBold,
		Text = tab.Label,
		TextColor3 = Computed(function()
			return if selected:get() then COLORS.White else COLORS.White
		end),
		TextScaled = true,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Right,
		[OnEvent("Activated")] = function()
			states.ActiveTab:set(tab.Id)
		end,
		[Children] = {
			corner(3),
			stroke(COLORS.Black, 0, 3),
			New("ImageLabel")({
				Name = "TabTexture",
				BackgroundTransparency = 1,
				Image = Computed(function()
					return if selected:get() then UIAssets.PinkPlateImage else UIAssets.GoldPlateImage
				end),
				ImageTransparency = 0.16,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(78, 78),
				Visible = Computed(function()
					return if selected:get() then UIAssets.HasPinkPlate() else UIAssets.HasGoldPlate()
				end),
			}),
			iconBadge({
				Name = "Icon",
				Icon = tab.Icon,
				AccentColor = COLORS.Mint,
				BackgroundColor3 = Computed(function()
					return if selected:get() then COLORS.Gold else COLORS.PriceGreen
				end),
				Position = UDim2.fromOffset(5, 5),
				Size = UDim2.fromOffset(30, 30),
			}),
			New("UIPadding")({
				PaddingLeft = UDim.new(0, 38),
				PaddingRight = UDim.new(0, 8),
			}),
			New("UIStroke")({
				ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
				Color = COLORS.Black,
				Thickness = 2.5,
			}),
			textSizeConstraint(12, 18),
		},
	})
end

local function rgbGradient(rotationState)
	return New("UIGradient")({
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 0, 85)),
			ColorSequenceKeypoint.new(0.2, Color3.fromRGB(255, 229, 0)),
			ColorSequenceKeypoint.new(0.42, Color3.fromRGB(34, 255, 18)),
			ColorSequenceKeypoint.new(0.62, Color3.fromRGB(0, 195, 255)),
			ColorSequenceKeypoint.new(0.82, Color3.fromRGB(145, 0, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 0, 190)),
		}),
		Rotation = rotationState,
	})
end

function FactoryUIController:_setMessage(message: string)
	self.States.Message:set(message)
	self.States.MessagePulse:set(true)

	task.delay(0.18, function()
		if self.States then
			self.States.MessagePulse:set(false)
		end
	end)
end

function FactoryUIController:_runMachine(machineId: string)
	local result = self.Remotes.FeedMachine:InvokeServer(machineId)
	local machine = MachineConfig.GetMachine(machineId)
	local machineName = if machine then machine.DisplayName else machineId

	if result.Ok then
		self:_setMessage(`{machineName} running for {result.CycleTime}s.`)
	else
		self:_setMessage(`{machineName}: {result.Error}`)
	end
end

function FactoryUIController:_upgradeMachine(machineId: string)
	local result = self.Remotes.BuyUpgrade:InvokeServer("Machine", machineId)
	local machine = MachineConfig.GetMachine(machineId)
	local machineName = if machine then machine.DisplayName else machineId

	if result.Ok then
		self.States.Upgrades:set(result.Upgrade or DEFAULT_UPGRADES)
		self:_setMessage(`{machineName} upgraded.`)
		self:_refreshSnapshots()
	else
		self:_setMessage(`Upgrade {machineName}: {result.Error}`)
	end
end

function FactoryUIController:_sellProducts()
	local result = self.Remotes.SellProducts:InvokeServer()
	if result.Ok then
		self:_setMessage(`Sold {result.Amount} products for ${formatNumber(result.Payout)}.`)
		self:_refreshSnapshots()
	else
		self:_setMessage(`Sell: {result.Error}`)
	end
end

function FactoryUIController:_buySkill(skillId: string)
	local skill = SkillTreeConfig.GetSkill(skillId)
	local skillName = if skill then skill.DisplayName else skillId
	local result = self.Remotes.BuySkill:InvokeServer(skillId)

	if result.SkillTree then
		self.States.Skills:set(result.SkillTree)
	end

	if result.Ok then
		self:_setMessage(`{skillName} unlocked.`)
		self:_refreshSnapshots()
	elseif result.Error == "AlreadyUnlocked" then
		self:_setMessage(`{skillName} is already unlocked.`)
	elseif result.Error == "MissingPrerequisite" then
		self:_setMessage(`Unlock the previous skill first.`)
	elseif result.Error == "NotEnoughCash" then
		self:_setMessage(`Need ${formatNumber(result.Cost or 0)} for {skillName}.`)
	else
		self:_setMessage(`Skill {skillName}: {result.Error}`)
	end
end

function FactoryUIController:_createStorageCard(itemId: string, layoutOrder: number)
	local item = ItemConfig.GetItem(itemId)
	local accent = ITEM_ACCENTS[itemId] or COLORS.Mint
	local amountText = Computed(function()
		local inventory = self.States.Inventory:get()
		local amount = inventory.Items[itemId] or 0
		local limit = inventory.Limits[itemId] or 0

		return `{formatNumber(amount)}/{formatNumber(limit)}`
	end)
	local fillSize = Computed(function()
		local inventory = self.States.Inventory:get()
		local amount = inventory.Items[itemId] or 0
		local limit = inventory.Limits[itemId] or 0
		local ratio = if limit > 0 then math.clamp(amount / limit, 0, 1) else 0

		return UDim2.fromScale(ratio, 1)
	end)

	return card({
		Name = `{itemId}Card`,
		BackgroundColor3 = accent,
		TextureImage = UIAssets.GoldPlateImage,
		TextureTransparency = 0.18,
		LayoutOrder = layoutOrder,
		Padding = padding(10, 12, 10, 12),
		Children = {
			iconBadge({
				Name = "ItemIcon",
				Icon = ITEM_ICONS[itemId],
				AccentColor = accent,
				AnchorPoint = Vector2.new(1, 0),
				BackgroundColor3 = accent:Lerp(COLORS.White, 0.72),
				Position = UDim2.fromScale(1, 0),
				Size = UDim2.fromOffset(34, 34),
			}),
			label({
				Name = "Name",
				Text = if item then item.DisplayName else itemId,
				Font = Enum.Font.GothamBold,
				Size = UDim2.new(1, -40, 0, 20),
				TextSize = 13,
			}),
			label({
				Name = "Amount",
				Text = amountText,
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(0, 22),
				Size = UDim2.new(1, -40, 0, 25),
				TextColor3 = accent,
				TextSize = 18,
			}),
			New("Frame")({
				Name = "Progress",
				BackgroundColor3 = COLORS.PanelDeep,
				BorderSizePixel = 0,
				Position = UDim2.fromOffset(0, 56),
				Size = UDim2.new(1, 0, 0, 8),
				[Children] = {
					corner(8),
					New("Frame")({
						Name = "Fill",
						BackgroundColor3 = accent,
						BorderSizePixel = 0,
						Size = Tween(fillSize, FILL_TWEEN),
						[Children] = corner(8),
					}),
				},
			}),
		},
	})
end

function FactoryUIController:_createStorageView()
	local children = {
		New("UIGridLayout")({
			CellPadding = UDim2.fromOffset(10, 10),
			CellSize = UDim2.new(0.5, -5, 0, 86),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	}

	for index, itemId in ITEM_ORDER do
		table.insert(children, self:_createStorageCard(itemId, index))
	end

	return New("Frame")({
		Name = "StorageView",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = Computed(function()
			return self.States.ActiveTab:get() == "Storage"
		end),
		[Children] = children,
	})
end

function FactoryUIController:_createMachineCard(machineId: string, layoutOrder: number)
	local machine = MachineConfig.GetMachine(machineId)
	local accentGoal = Computed(function()
		local factory = self.States.Factory:get()
		local snapshot = factory.Machines[machineId] or {}

		if machine and snapshot.IsRunning then
			return machine.RunningColor
		end

		return if machine then machine.Color else COLORS.Mint
	end)
	local detailText = Computed(function()
		local factory = self.States.Factory:get()
		local snapshot = factory.Machines[machineId] or {}
		local level = snapshot.Level or 1
		local cycleTime = snapshot.CycleTime or MachineConfig.GetCycleTime(machineId, level)
		local statusText = if snapshot.IsRunning then "Working" else "Ready"

		return `Lv. {level} | {statusText} | {cycleTime}s cycle`
	end)
	local costText = Computed(function()
		local factory = self.States.Factory:get()
		local upgrades = self.States.Upgrades:get()
		local snapshot = factory.Machines[machineId] or {}
		local level = snapshot.Level or 1
		local upgradeCost = upgrades.NextCosts[machineId] or snapshot.UpgradeCost or MachineConfig.GetUpgradeCost(machineId, level)

		return `Upgrade ${formatNumber(upgradeCost)}`
	end)
	local runText = Computed(function()
		local factory = self.States.Factory:get()
		local snapshot = factory.Machines[machineId] or {}

		return if snapshot.IsRunning then "Busy" else "Run"
	end)
	local runTransparency = Computed(function()
		local factory = self.States.Factory:get()
		local snapshot = factory.Machines[machineId] or {}

		return if snapshot.IsRunning then 0.28 else 0
	end)

	return card({
		Name = `{machineId}Card`,
		BackgroundColor3 = Tween(accentGoal, FILL_TWEEN),
		TextureImage = UIAssets.GoldPlateImage,
		TextureTransparency = 0.24,
		LayoutOrder = layoutOrder,
		Size = UDim2.new(1, 0, 0, 76),
		Padding = padding(10, 12, 10, 12),
		Children = {
			New("Frame")({
				Name = "Accent",
				BackgroundColor3 = Tween(accentGoal, FILL_TWEEN),
				BorderSizePixel = 0,
				Size = UDim2.new(0, 6, 1, -20),
				[Children] = corner(8),
			}),
			iconBadge({
				Name = "MachineIcon",
				Icon = "Machine",
				AccentColor = if machine then machine.Color else COLORS.Mint,
				BackgroundColor3 = COLORS.PanelDeep,
				Position = UDim2.fromOffset(16, 8),
				Size = UDim2.fromOffset(44, 44),
			}),
			label({
				Name = "Name",
				Text = if machine then machine.DisplayName else machineId,
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(70, 0),
				Size = UDim2.new(1, -252, 0, 22),
				TextSize = 15,
			}),
			label({
				Name = "Detail",
				Text = detailText,
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(70, 24),
				Size = UDim2.new(1, -252, 0, 18),
				TextColor3 = COLORS.White,
				TextSize = 12,
				TextStrokeThickness = 1.2,
			}),
			label({
				Name = "Cost",
				Text = costText,
				Font = Enum.Font.GothamBold,
				Position = UDim2.fromOffset(70, 44),
				Size = UDim2.new(1, -252, 0, 18),
				TextColor3 = COLORS.Peach,
				TextSize = 12,
				TextStrokeThickness = 1.2,
			}),
			button({
				Name = "RunButton",
				AnchorPoint = Vector2.new(1, 0),
				BackgroundColor3 = COLORS.MintDark,
				BackgroundTransparency = runTransparency,
				Position = UDim2.new(1, -94, 0, 8),
				Size = UDim2.fromOffset(78, 46),
				Text = runText,
				TextureImage = UIAssets.GreenPlateImage,
				Activated = function()
					self:_runMachine(machineId)
				end,
			}),
			button({
				Name = "UpgradeButton",
				AnchorPoint = Vector2.new(1, 0),
				BackgroundColor3 = COLORS.Peach,
				Position = UDim2.new(1, 0, 0, 8),
				Size = UDim2.fromOffset(82, 46),
				Text = "Upgrade",
				TextureImage = UIAssets.GoldPlateImage,
				Activated = function()
					self:_upgradeMachine(machineId)
				end,
			}),
		},
	})
end

function FactoryUIController:_createMachinesView()
	local children = {
		New("UIListLayout")({
			FillDirection = Enum.FillDirection.Vertical,
			Padding = UDim.new(0, 10),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	}

	for index, machineId in MachineConfig.Order do
		table.insert(children, self:_createMachineCard(machineId, index))
	end

	return New("Frame")({
		Name = "MachinesView",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = Computed(function()
			return self.States.ActiveTab:get() == "Machines"
		end),
		[Children] = children,
	})
end

function FactoryUIController:_createSkillConnector(connection)
	local fromSkill = SkillTreeConfig.GetSkill(connection.From)
	local toSkill = SkillTreeConfig.GetSkill(connection.To)
	local fromPosition = getSkillPosition(fromSkill)
	local toPosition = getSkillPosition(toSkill)
	local delta = toPosition - fromPosition
	local unlocked = Computed(function()
		local skills = self.States.Skills:get()
		local unlockedSkills = skills.Unlocked or {}

		return unlockedSkills[connection.From] and unlockedSkills[connection.To]
	end)
	local ready = Computed(function()
		local skills = self.States.Skills:get()
		local unlockedSkills = skills.Unlocked or {}

		return unlockedSkills[connection.From] == true
	end)
	local connectorColor = Computed(function()
		if unlocked:get() then
			return COLORS.MintDark
		end

		return if ready:get() then COLORS.Gold else COLORS.Stroke
	end)
	local isHorizontal = math.abs(delta.X) >= math.abs(delta.Y)
	local size = if isHorizontal
		then UDim2.fromOffset(math.max(18, math.abs(delta.X) - SKILL_NODE_SIZE.X + 16), 6)
		else UDim2.fromOffset(6, math.max(18, math.abs(delta.Y) - SKILL_NODE_SIZE.Y + 16))

	return New("Frame")({
		Name = `{connection.From}To{connection.To}`,
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = Tween(connectorColor, FILL_TWEEN),
		BackgroundTransparency = Computed(function()
			return if ready:get() then 0.05 else 0.38
		end),
		BorderSizePixel = 0,
		Position = UDim2.fromOffset((fromPosition.X + toPosition.X) / 2, (fromPosition.Y + toPosition.Y) / 2),
		Size = size,
		ZIndex = 1,
		[Children] = corner(8),
	})
end

function FactoryUIController:_createSkillNode(skillId: string, layoutOrder: number)
	local skill = SkillTreeConfig.GetSkill(skillId)
	local position = getSkillPosition(skill)
	local status = Computed(function()
		local skills = self.States.Skills:get()

		return getSkillStatus(skills.Unlocked, skillId)
	end)
	local nodeColor = Computed(function()
		local currentStatus = status:get()

		if currentStatus == "Unlocked" then
			return skill.Accent:Lerp(COLORS.White, 0.28)
		elseif currentStatus == "Available" then
			return skill.Accent:Lerp(COLORS.White, 0.62)
		end

		return COLORS.PanelDeep
	end)
	local strokeColor = Computed(function()
		return if status:get() == "Unlocked" then skill.Accent else COLORS.Stroke
	end)
	local statusText = Computed(function()
		local currentStatus = status:get()
		if currentStatus == "Unlocked" then
			return "Unlocked"
		elseif currentStatus == "Available" then
			return `$${formatNumber(skill.Cost)}`
		end

		return "Locked"
	end)

	return New("TextButton")({
		Name = `{skillId}Node`,
		AnchorPoint = Vector2.new(0.5, 0.5),
		AutoButtonColor = false,
		BackgroundColor3 = Tween(nodeColor, FILL_TWEEN),
		BorderSizePixel = 0,
		LayoutOrder = layoutOrder,
		Position = UDim2.fromOffset(position.X, position.Y),
		Size = UDim2.fromOffset(SKILL_NODE_SIZE.X, SKILL_NODE_SIZE.Y),
		Text = "",
		ZIndex = 3,
		[OnEvent("Activated")] = function()
			self:_buySkill(skillId)
		end,
		[Children] = {
			corner(8),
			New("UIStroke")({
				Color = Tween(strokeColor, FILL_TWEEN),
				Transparency = 0.18,
				Thickness = 1.5,
			}),
			iconBadge({
				Name = "SkillIcon",
				Icon = skill.IconId,
				AccentColor = skill.Accent,
				BackgroundColor3 = COLORS.White,
				Position = UDim2.fromOffset(8, 8),
				Size = UDim2.fromOffset(42, 42),
			}),
			label({
				Name = "Name",
				Text = skill.DisplayName,
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(58, 7),
				Size = UDim2.new(1, -66, 0, 21),
				TextSize = 12,
			}),
			label({
				Name = "Description",
				Text = skill.Description,
				Font = Enum.Font.GothamMedium,
				Position = UDim2.fromOffset(58, 28),
				Size = UDim2.new(1, -66, 0, 27),
				TextColor3 = COLORS.MutedInk,
				TextSize = 10,
			}),
			New("Frame")({
				Name = "StatusPill",
				BackgroundColor3 = Computed(function()
					return if status:get() == "Unlocked" then COLORS.MintDark else COLORS.White
				end),
				BorderSizePixel = 0,
				Position = UDim2.fromOffset(8, 56),
				Size = UDim2.new(1, -16, 0, 15),
				[Children] = {
					corner(8),
					label({
						Name = "Status",
						Text = statusText,
						Font = Enum.Font.GothamBold,
						Size = UDim2.fromScale(1, 1),
						TextColor3 = Computed(function()
							return if status:get() == "Unlocked" then COLORS.White else COLORS.Ink
						end),
						TextSize = 10,
						TextXAlignment = Enum.TextXAlignment.Center,
					}),
				},
			}),
		},
	})
end

function FactoryUIController:_createSkillsView()
	local progressText = Computed(function()
		local skills = self.States.Skills:get()

		return `{skills.UnlockedCount or 0}/{skills.TotalCount or #SkillTreeConfig.Order} skills unlocked`
	end)
	local fillSize = Computed(function()
		local skills = self.States.Skills:get()
		local total = math.max(1, skills.TotalCount or #SkillTreeConfig.Order)

		return UDim2.fromScale(math.clamp((skills.UnlockedCount or 0) / total, 0, 1), 1)
	end)
	local treeChildren = {
		New("ImageLabel")({
			Name = "FabricTexture",
			BackgroundTransparency = 1,
			Image = UIAssets.PanelTextureImage,
			ImageTransparency = 0.72,
			ScaleType = Enum.ScaleType.Tile,
			Size = UDim2.fromOffset(SKILL_TREE_SIZE.X, SKILL_TREE_SIZE.Y),
			TileSize = UDim2.fromOffset(180, 180),
			Visible = UIAssets.HasPanelTexture(),
			ZIndex = 0,
		}),
	}

	for _, connection in SkillTreeConfig.Connections do
		table.insert(treeChildren, self:_createSkillConnector(connection))
	end

	for index, skillId in SkillTreeConfig.Order do
		table.insert(treeChildren, self:_createSkillNode(skillId, index))
	end

	return New("Frame")({
		Name = "SkillsView",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = Computed(function()
			return self.States.ActiveTab:get() == "Skills"
		end),
		[Children] = {
			card({
				Name = "ProgressCard",
				BackgroundColor3 = COLORS.Purple,
				TextureImage = UIAssets.PinkPlateImage,
				TextureTransparency = 0.18,
				Size = UDim2.new(1, 0, 0, 48),
				Padding = padding(9, 12, 9, 12),
				Children = {
					label({
						Name = "Title",
						Text = "Skill Tree",
						Font = Enum.Font.GothamBlack,
						Size = UDim2.new(0.48, 0, 0, 18),
						TextSize = 14,
					}),
					label({
						Name = "ProgressText",
						Text = progressText,
						Font = Enum.Font.GothamBlack,
						Position = UDim2.fromScale(0.5, 0),
						Size = UDim2.new(0.5, 0, 0, 18),
						TextColor3 = COLORS.White,
						TextSize = 11,
						TextStrokeThickness = 1.1,
						TextXAlignment = Enum.TextXAlignment.Right,
					}),
					New("Frame")({
						Name = "ProgressTrack",
						BackgroundColor3 = COLORS.PanelDeep,
						BorderSizePixel = 0,
						Position = UDim2.fromOffset(0, 26),
						Size = UDim2.new(1, 0, 0, 8),
						[Children] = {
							corner(8),
							New("Frame")({
								Name = "Fill",
								BackgroundColor3 = COLORS.MintDark,
								BorderSizePixel = 0,
								Size = Tween(fillSize, FILL_TWEEN),
								[Children] = corner(8),
							}),
						},
					}),
				},
			}),
			New("ScrollingFrame")({
				Name = "TreeScroll",
				Active = true,
				AutomaticCanvasSize = Enum.AutomaticSize.None,
				BackgroundColor3 = COLORS.Panel,
				BorderSizePixel = 0,
				CanvasSize = UDim2.fromOffset(SKILL_TREE_SIZE.X, SKILL_TREE_SIZE.Y),
				Position = UDim2.fromOffset(0, 58),
				ScrollBarImageColor3 = COLORS.MintDark,
				ScrollBarThickness = 4,
				ScrollingDirection = Enum.ScrollingDirection.XY,
				Size = UDim2.new(1, 0, 1, -58),
				[Children] = {
					corner(3),
					stroke(COLORS.Black, 0, 3),
					New("ImageLabel")({
						Name = "LightPlate",
						BackgroundTransparency = 1,
						Image = UIAssets.LightPlateImage,
						ImageTransparency = 0.08,
						ScaleType = Enum.ScaleType.Tile,
						Size = UDim2.fromScale(1, 1),
						TileSize = UDim2.fromOffset(110, 110),
						Visible = UIAssets.HasLightPlate(),
						ZIndex = 0,
					}),
					treeChildren,
				},
			}),
		},
	})
end

function FactoryUIController:_createMarketView()
	local storedValueText = Computed(function()
		local inventory = self.States.Inventory:get()

		return `$${formatNumber(getStoredValue(inventory))}`
	end)
	local detailText = Computed(function()
		local inventory = self.States.Inventory:get()
		local fabric = inventory.Items.CottonFabric or 0

		return `{formatNumber(fabric)} fabric ready for premium sales`
	end)

	return New("Frame")({
		Name = "MarketView",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = Computed(function()
			return self.States.ActiveTab:get() == "Market"
		end),
		[Children] = {
			card({
				Name = "SummaryCard",
				BackgroundColor3 = COLORS.Gold,
				TextureImage = UIAssets.GoldPlateImage,
				TextureTransparency = 0.08,
				Size = UDim2.new(1, 0, 0, 130),
				Padding = padding(16, 16, 16, 16),
				Children = {
					iconBadge({
						Name = "MarketIcon",
						Icon = "Market",
						AccentColor = COLORS.Gold,
						BackgroundColor3 = Color3.fromRGB(255, 241, 194),
						AnchorPoint = Vector2.new(1, 0),
						Position = UDim2.fromScale(1, 0),
						Size = UDim2.fromOffset(48, 48),
					}),
					label({
						Name = "Title",
						Text = "Market Basket",
						Font = Enum.Font.GothamBlack,
						Size = UDim2.new(1, -58, 0, 24),
						TextSize = 16,
					}),
					label({
						Name = "Value",
						Text = storedValueText,
						Font = Enum.Font.GothamBlack,
						Position = UDim2.fromOffset(0, 32),
						Size = UDim2.new(1, -146, 0, 44),
						TextColor3 = COLORS.MintDark,
						TextScaled = true,
						Children = textSizeConstraint(18, 34),
					}),
					label({
						Name = "Detail",
						Text = detailText,
						Font = Enum.Font.GothamMedium,
						Position = UDim2.fromOffset(0, 78),
						Size = UDim2.new(1, -146, 0, 20),
						TextColor3 = COLORS.MutedInk,
						TextSize = 12,
						TextStrokeThickness = 1,
					}),
					button({
						Name = "SellButton",
						AnchorPoint = Vector2.new(1, 0.5),
						BackgroundColor3 = COLORS.MintDark,
						Position = UDim2.new(1, 0, 0.5, 8),
						Size = UDim2.fromOffset(128, 58),
						Text = "Sell All",
						TextureImage = UIAssets.GreenPlateImage,
						Activated = function()
							self:_sellProducts()
						end,
					}),
				},
			}),
			card({
				Name = "TipCard",
				BackgroundColor3 = COLORS.Purple,
				TextureImage = UIAssets.PinkPlateImage,
				TextureTransparency = 0.18,
				Position = UDim2.fromOffset(0, 144),
				Size = UDim2.new(1, 0, 0, 78),
				Padding = padding(14, 16, 14, 16),
				Children = label({
					Name = "Text",
					Text = "Fabric earns the most. Keep the loom fed before selling.",
					Font = Enum.Font.GothamBold,
					Size = UDim2.fromScale(1, 1),
					TextColor3 = COLORS.Ink,
					TextSize = 14,
				}),
			}),
			card({
				Name = "RobuxBoostCard",
				BackgroundColor3 = COLORS.PricePurple,
				TextureImage = UIAssets.PinkPlateImage,
				TextureTransparency = 0.18,
				Position = UDim2.fromOffset(0, 236),
				Size = UDim2.new(1, 0, 0, 92),
				Padding = padding(14, 16, 14, 16),
				Children = {
					rgbGradient(self.States.RgbRotation),
					label({
						Name = "Title",
						Text = "PREMIUM BOOST",
						Font = Enum.Font.GothamBlack,
						Size = UDim2.new(1, -150, 0, 28),
						TextColor3 = COLORS.White,
						TextSize = 20,
						TextStrokeThickness = 2.5,
					}),
					label({
						Name = "Detail",
						Text = "Robux items use RGB shine",
						Font = Enum.Font.GothamBlack,
						Position = UDim2.fromOffset(0, 34),
						Size = UDim2.new(1, -150, 0, 22),
						TextColor3 = COLORS.Gold,
						TextSize = 13,
						TextStrokeThickness = 1.2,
					}),
					button({
						Name = "RobuxPreviewButton",
						AnchorPoint = Vector2.new(1, 0.5),
						BackgroundColor3 = COLORS.PricePurple,
						Position = UDim2.fromScale(1, 0.5),
						Size = UDim2.fromOffset(134, 54),
						Text = "R$ 99",
						TextureImage = UIAssets.PinkPlateImage,
						RgbGradient = rgbGradient(self.States.RgbRotation),
						Activated = function()
							self:_setMessage("Robux item visuals are ready. Add product ids to connect purchases.")
						end,
					}),
				},
			}),
		},
	})
end

function FactoryUIController:_createSidebar()
	local tabChildren = {
		New("UIListLayout")({
			FillDirection = Enum.FillDirection.Horizontal,
			Padding = UDim.new(0, 10),
			SortOrder = Enum.SortOrder.LayoutOrder,
			VerticalAlignment = Enum.VerticalAlignment.Center,
		}),
	}

	for index, tab in TAB_ORDER do
		table.insert(tabChildren, tabButton({
			Id = tab.Id,
			Icon = tab.Icon,
			Label = tab.Label,
			LayoutOrder = index,
			Size = UDim2.fromOffset(152, 42),
		}, self.States))
	end

	return New("Frame")({
		Name = "TabBar",
		BackgroundColor3 = COLORS.PanelDeep,
		BorderSizePixel = 0,
		Position = UDim2.fromOffset(12, 82),
		Size = UDim2.new(1, -24, 0, 58),
		[Children] = {
			corner(2),
			stroke(COLORS.Black, 0, 4),
			New("ImageLabel")({
				Name = "LightPlate",
				BackgroundTransparency = 1,
				Image = UIAssets.LightPlateImage,
				ImageTransparency = 0.08,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(96, 96),
				Visible = UIAssets.HasLightPlate(),
			}),
			padding(8, 10, 8, 10),
			tabChildren,
		},
	})
end

function FactoryUIController:_createHeader()
	return New("Frame")({
		Name = "Header",
		BackgroundColor3 = COLORS.Header,
		BorderSizePixel = 0,
		Position = UDim2.fromOffset(0, 0),
		Size = UDim2.new(1, 0, 0, 72),
		[Children] = {
			corner(2),
			stroke(COLORS.Black, 0, 4),
			New("UIGradient")({
				Color = ColorSequence.new({
					ColorSequenceKeypoint.new(0, COLORS.Header),
					ColorSequenceKeypoint.new(1, COLORS.HeaderDark),
				}),
				Rotation = 90,
			}),
			New("ImageLabel")({
				Name = "HeaderTexture",
				BackgroundTransparency = 1,
				Image = UIAssets.PinkPlateImage,
				ImageTransparency = 0.06,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(86, 86),
				Visible = UIAssets.HasPinkPlate(),
			}),
			label({
				Name = "Title",
				Text = "LOJA DA FABRICA",
				Font = Enum.Font.GothamBlack,
				Position = UDim2.fromOffset(14, 0),
				Size = UDim2.new(1, -92, 1, 0),
				TextColor3 = COLORS.White,
				TextScaled = true,
				TextStrokeThickness = 4,
				TextXAlignment = Enum.TextXAlignment.Left,
				Children = textSizeConstraint(24, 48),
			}),
			button({
				Name = "CloseButton",
				AnchorPoint = Vector2.new(1, 0),
				BackgroundColor3 = COLORS.Rose,
				Position = UDim2.new(1, -14, 0, 10),
				Size = UDim2.fromOffset(54, 52),
				Text = "X",
				MaxTextSize = 36,
				Activated = function()
					self.States.IsOpen:set(false)
				end,
			}),
		},
	})
end

function FactoryUIController:_createMessageBar()
	return New("Frame")({
		Name = "MessageBar",
		AnchorPoint = Vector2.new(0, 1),
		BackgroundColor3 = Spring(Computed(function()
			return if self.States.MessagePulse:get() then COLORS.Gold else COLORS.Panel
		end), 22, 0.9),
		BorderSizePixel = 0,
		Position = Computed(function()
			return if isMobileViewport(self.States.Viewport:get()) then UDim2.new(0, 12, 1, -12) else UDim2.new(0, 16, 1, -16)
		end),
		Size = Computed(function()
			return if isMobileViewport(self.States.Viewport:get()) then UDim2.new(1, -24, 0, 42) else UDim2.new(1, -32, 0, 44)
		end),
		[Children] = {
			corner(2),
			stroke(COLORS.Black, 0, 3),
			New("ImageLabel")({
				Name = "MessageTexture",
				BackgroundTransparency = 1,
				Image = UIAssets.LightPlateImage,
				ImageTransparency = 0.1,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(96, 96),
				Visible = UIAssets.HasLightPlate(),
			}),
			padding(0, 14, 0, 14),
			label({
				Name = "Text",
				Text = self.States.Message,
				Font = Enum.Font.GothamBold,
				Size = UDim2.fromScale(1, 1),
				TextColor3 = COLORS.White,
				TextSize = 14,
				TextStrokeThickness = 1.4,
			}),
		},
	})
end

function FactoryUIController:_createPanel()
	local panelSize = Computed(function()
		local viewport = self.States.Viewport:get()

		if isMobileViewport(viewport) then
			return UDim2.fromOffset(math.max(320, viewport.X - 18), math.min(520, viewport.Y - 18))
		end

		return UDim2.fromOffset(920, 590)
	end)
	local panelPosition = Computed(function()
		local viewport = self.States.Viewport:get()

		return if self.States.IsOpen:get() then getOpenPosition(viewport) else getClosedPosition(viewport)
	end)

	return New("CanvasGroup")({
		Name = "Panel",
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = COLORS.Panel,
		BorderSizePixel = 0,
		Position = Spring(panelPosition, 22, 0.82),
		Size = panelSize,
		[Children] = {
			corner(3),
			stroke(COLORS.Black, 0, 5),
			New("UIScale")({
				Name = "ResponsiveScale",
				Scale = Computed(function()
					local viewport = self.States.Viewport:get()
					if not isMobileViewport(viewport) then
						return 1
					end

					return if viewport.Y < 390 then 0.86 else 0.94
				end),
			}),
			New("UIGradient")({
				Color = ColorSequence.new({
					ColorSequenceKeypoint.new(0, Color3.fromRGB(244, 249, 255)),
					ColorSequenceKeypoint.new(1, Color3.fromRGB(190, 213, 235)),
				}),
				Rotation = 90,
			}),
			New("ImageLabel")({
				Name = "LightPlate",
				BackgroundTransparency = 1,
				Image = UIAssets.LightPlateImage,
				ImageTransparency = 0.08,
				ScaleType = Enum.ScaleType.Tile,
				Size = UDim2.fromScale(1, 1),
				TileSize = UDim2.fromOffset(110, 110),
				Visible = UIAssets.HasLightPlate(),
			}),
			self:_createSidebar(),
			self:_createHeader(),
			New("Frame")({
				Name = "Content",
				BackgroundTransparency = 1,
				Position = Computed(function()
					return if isMobileViewport(self.States.Viewport:get()) then UDim2.fromOffset(12, 150) else UDim2.fromOffset(16, 150)
				end),
				Size = Computed(function()
					return if isMobileViewport(self.States.Viewport:get()) then UDim2.new(1, -24, 1, -204) else UDim2.new(1, -32, 1, -214)
				end),
				[Children] = {
					self:_createMachinesView(),
					self:_createSkillsView(),
					self:_createStorageView(),
					self:_createMarketView(),
				},
			}),
			self:_createMessageBar(),
		},
	})
end

function FactoryUIController:_createGui()
	local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
	local existingGui = playerGui:FindFirstChild("FactoryHUD")
	if existingGui then
		existingGui:Destroy()
	end

	if self.ViewportConnection then
		self.ViewportConnection:Disconnect()
		self.ViewportConnection = nil
	end

	if self.RgbConnection then
		self.RgbConnection:Disconnect()
		self.RgbConnection = nil
	end

	self.States = {
		ActiveTab = Value("Machines"),
		Factory = Value(DEFAULT_FACTORY),
		Inventory = Value(DEFAULT_INVENTORY),
		IsOpen = Value(true),
		Message = Value("Plant cotton to start the factory."),
		MessagePulse = Value(false),
		RgbRotation = Value(0),
		Skills = Value(DEFAULT_SKILLS),
		Upgrades = Value(DEFAULT_UPGRADES),
		Viewport = Value(getViewportSize()),
	}

	if Workspace.CurrentCamera then
		self.ViewportConnection = Workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
			self.States.Viewport:set(getViewportSize())
		end)
	end

	self.RgbConnection = RunService.RenderStepped:Connect(function()
		if self.States then
			self.States.RgbRotation:set((self.States.RgbRotation:get(false) + 1.6) % 360)
		end
	end)

	local panelSize = Computed(function()
		local viewport = self.States.Viewport:get()

		if isMobileViewport(viewport) then
			return UDim2.fromOffset(math.max(320, viewport.X - 18), math.min(520, viewport.Y - 18))
		end

		return UDim2.fromOffset(920, 590)
	end)

	self.Gui = New("ScreenGui")({
		Name = "FactoryHUD",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = playerGui,
		[Children] = {
			New("Frame")({
				Name = "PanelShadow",
				AnchorPoint = Vector2.new(0.5, 0.5),
				BackgroundColor3 = COLORS.Shadow,
				BackgroundTransparency = 0.72,
				BorderSizePixel = 0,
				Position = Computed(function()
					local viewport = self.States.Viewport:get()
					local openPosition = getOpenPosition(viewport)

					return UDim2.new(openPosition.X.Scale, openPosition.X.Offset + 8, openPosition.Y.Scale, openPosition.Y.Offset + 8)
				end),
				Size = panelSize,
				Visible = self.States.IsOpen,
				[Children] = corner(8),
			}),
			self:_createPanel(),
			button({
				Name = "FactoryMiniDock",
				AnchorPoint = Vector2.new(0.5, 1),
				BackgroundColor3 = COLORS.MintDark,
				Position = Computed(function()
					return UDim2.new(0.5, 0, 1, if isMobileViewport(self.States.Viewport:get()) then -12 else -18)
				end),
				Size = UDim2.fromOffset(116, 48),
				Text = "Factory",
				Visible = Computed(function()
					return not self.States.IsOpen:get()
				end),
				Activated = function()
					self.States.IsOpen:set(true)
				end,
			}),
		},
	})
end

function FactoryUIController:_refreshSnapshots()
	self.States.Inventory:set(self.Remotes.GetInventory:InvokeServer() or DEFAULT_INVENTORY)
	self.States.Factory:set(self.Remotes.GetFactory:InvokeServer() or DEFAULT_FACTORY)
	self.States.Skills:set(self.Remotes.GetSkillTree:InvokeServer() or DEFAULT_SKILLS)
	self.States.Upgrades:set(self.Remotes.GetUpgrades:InvokeServer() or DEFAULT_UPGRADES)
end

function FactoryUIController:Init()
	local remotes = ReplicatedStorage:WaitForChild("Remotes")
	local inventoryRemotes = remotes:WaitForChild("Inventory")
	local factoryRemotes = remotes:WaitForChild("Factory")
	local economyRemotes = remotes:WaitForChild("Economy")
	local skillsRemotes = remotes:WaitForChild("Skills")
	local upgradeRemotes = remotes:WaitForChild("Upgrades")

	self.Remotes = {
		GetInventory = inventoryRemotes:WaitForChild("GetInventory"),
		InventoryUpdated = inventoryRemotes:WaitForChild("InventoryUpdated"),
		FeedMachine = factoryRemotes:WaitForChild("FeedMachine"),
		FactoryUpdated = factoryRemotes:WaitForChild("FactoryUpdated"),
		GetFactory = factoryRemotes:WaitForChild("GetFactory"),
		SellProducts = economyRemotes:WaitForChild("SellProducts"),
		BuySkill = skillsRemotes:WaitForChild("BuySkill"),
		GetSkillTree = skillsRemotes:WaitForChild("GetSkillTree"),
		SkillsUpdated = skillsRemotes:WaitForChild("SkillsUpdated"),
		BuyUpgrade = upgradeRemotes:WaitForChild("BuyUpgrade"),
		GetUpgrades = upgradeRemotes:WaitForChild("GetUpgrades"),
		UpgradesUpdated = upgradeRemotes:WaitForChild("UpgradesUpdated"),
	}

	self:_createGui()
end

function FactoryUIController:Start()
	self.Remotes.InventoryUpdated.OnClientEvent:Connect(function(snapshot)
		self.States.Inventory:set(snapshot or DEFAULT_INVENTORY)
	end)

	self.Remotes.FactoryUpdated.OnClientEvent:Connect(function(snapshot)
		self.States.Factory:set(snapshot or DEFAULT_FACTORY)
	end)

	self.Remotes.UpgradesUpdated.OnClientEvent:Connect(function(snapshot)
		self.States.Upgrades:set(snapshot or DEFAULT_UPGRADES)
	end)

	self.Remotes.SkillsUpdated.OnClientEvent:Connect(function(snapshot)
		self.States.Skills:set(snapshot or DEFAULT_SKILLS)
	end)

	self:_refreshSnapshots()
end

return FactoryUIController
