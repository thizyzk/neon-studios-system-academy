local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local NpcConfig = require(ReplicatedStorage.Shared.Modules.NpcConfig)
local SimulatorUITheme = require(ReplicatedStorage.Shared.Modules.SimulatorUITheme)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)
local ModelTemplateResolver = require(ServerScriptService.Modules.ModelTemplateResolver)
local PlotService = require(ServerScriptService.Services.PlotService)

local NpcService = {}

NpcService.Npcs = {}

local GENERATED_ATTRIBUTE = "GeneratedByCottonFabricNpcService"

local function createFromTemplate(templatePaths: { { string } }, name: string, cframe: CFrame, parent: Instance)
	for _, templatePath in templatePaths do
		local clone = ModelTemplateResolver:Clone(templatePath, parent)
		if clone then
			clone.Name = name
			ModelTemplateResolver:SetAnchored(clone, true)
			ModelTemplateResolver:PivotTo(clone, cframe)
			clone:SetAttribute("UsesCottonFabricTemplate", true)

			return clone
		end
	end

	return nil
end

local function createPart(name: string, sizeStuds: Vector3, cframe: CFrame, color: Color3, parent: Instance)
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = sizeStuds
	part.CFrame = cframe
	part.Color = color
	part.Parent = parent
	WorldVisualStyle.Apply(part, "Npc")

	return part
end

local function getGridOffset(index: number, count: number, spanStuds: number, insetStuds: number)
	if count <= 1 then
		return 0
	end

	local usableSpanStuds = math.max(0, spanStuds - (insetStuds * 2))
	local stepStuds = usableSpanStuds / (count - 1)

	return (-usableSpanStuds / 2) + ((index - 1) * stepStuds)
end

local function createLegoStud(name: string, cframe: CFrame, color: Color3, parent: Instance)
	local stud = Instance.new("Part")
	stud.Name = name
	stud.Anchored = true
	stud.CanCollide = false
	stud.Shape = Enum.PartType.Cylinder
	stud.Size = Studs.vector(
		NpcConfig.LegoStudDiameterStuds,
		NpcConfig.LegoStudHeightStuds,
		NpcConfig.LegoStudDiameterStuds
	)
	stud.CFrame = cframe
	stud.Color = color
	stud.Parent = parent
	WorldVisualStyle.Apply(stud, "NpcStud")
	stud:SetAttribute("StudTexture", "lego")
	stud:SetAttribute("SizeUnit", Studs.UnitName)

	return stud
end

local function createLegoStudGrid(
	parentPart: BasePart,
	parentCFrame: CFrame,
	sizeStuds: Vector3,
	columns: number,
	rows: number,
	color: Color3,
	parent: Instance
)
	local topYStuds = (sizeStuds.Y / 2) + (NpcConfig.LegoStudHeightStuds / 2)
	local insetStuds = NpcConfig.LegoStudInsetStuds

	for column = 1, columns do
		for row = 1, rows do
			local xStuds = getGridOffset(column, columns, sizeStuds.X, insetStuds)
			local zStuds = getGridOffset(row, rows, sizeStuds.Z, insetStuds)
			local studName = `{parentPart.Name}Stud_{column}_{row}`
			local studCFrame = parentCFrame * Studs.offset(xStuds, topYStuds, zStuds)

			createLegoStud(studName, studCFrame, color, parent)
		end
	end
end

local function attachLabel(npcModel: Model, head: BasePart, npc)
	local label = Instance.new("BillboardGui")
	label.Name = "NpcLabel"
	label.AlwaysOnTop = true
	label.Size = UDim2.fromOffset(180, 54)
	label.StudsOffset = npc.LabelOffsetStuds or NpcConfig.DefaultLabelOffsetStuds
	label.Parent = head

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "Name"
	nameLabel.BackgroundTransparency = 1
	nameLabel.Size = UDim2.fromScale(1, 0.55)
	nameLabel.Font = Enum.Font.GothamBold
	nameLabel.Text = npc.DisplayName
	nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	nameLabel.TextScaled = true
	nameLabel.Parent = label
	SimulatorUITheme.AddTextStroke(nameLabel, 3)

	local roleLabel = Instance.new("TextLabel")
	roleLabel.Name = "Role"
	roleLabel.BackgroundTransparency = 1
	roleLabel.Position = UDim2.fromScale(0, 0.52)
	roleLabel.Size = UDim2.fromScale(1, 0.42)
	roleLabel.Font = Enum.Font.GothamBlack
	roleLabel.Text = npc.Role
	roleLabel.TextColor3 = Color3.fromRGB(220, 230, 225)
	roleLabel.TextScaled = true
	roleLabel.Parent = label
	SimulatorUITheme.AddTextStroke(roleLabel, 2)

	npcModel:SetAttribute("LabelOffsetUnit", Studs.UnitName)
end

local function attachPrompt(promptPart: BasePart, npc)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "NpcPrompt"
	prompt.ActionText = "Talk"
	prompt.ObjectText = npc.DisplayName
	prompt.HoldDuration = 0.2
	prompt.MaxActivationDistance = npc.PromptDistanceStuds or NpcConfig.DefaultPromptDistanceStuds
	prompt.RequiresLineOfSight = false
	prompt.Parent = promptPart

	return prompt
end

local function createPlaceholderNpc(npc, cframe: CFrame, parent: Instance)
	local model = Instance.new("Model")
	model.Name = npc.Id
	model.Parent = parent

	local body = createPart("Body", npc.BodySizeStuds, cframe, npc.Color, model)
	local headCFrame = cframe * Studs.offset(npc.HeadOffsetStuds.X, npc.HeadOffsetStuds.Y, npc.HeadOffsetStuds.Z)
	local head = createPart("Head", npc.HeadSizeStuds, headCFrame, npc.AccentColor, model)

	createLegoStudGrid(body, cframe, npc.BodySizeStuds, npc.BodyStudColumns or 2, npc.BodyStudRows or 1, npc.Color, model)
	createLegoStudGrid(head, headCFrame, npc.HeadSizeStuds, npc.HeadStudColumns or 1, npc.HeadStudRows or 1, npc.AccentColor, model)

	local badge = createPart(
		"Badge",
		Studs.vector(npc.BodySizeStuds.X * 0.45, 0.18, 0.08),
		cframe * Studs.offset(0, 0.35, -(npc.BodySizeStuds.Z / 2) - 0.05),
		npc.AccentColor,
		model
	)
	badge.CanCollide = false

	model.PrimaryPart = body
	attachLabel(model, head, npc)
	attachPrompt(body, npc)

	return model
end

local function getOrCreateNpcsFolder()
	local folder = Workspace:FindFirstChild("NPCs")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "NPCs"
		folder.Parent = Workspace
	end

	return folder
end

function NpcService:_createNpc(plot, npc)
	local plotNpcs = self.Npcs[plot.Index]
	if plotNpcs and plotNpcs[npc.Id] then
		return plotNpcs[npc.Id]
	end

	local npcsFolder = getOrCreateNpcsFolder()
	local plotFolder = npcsFolder:FindFirstChild(`Plot_{plot.Index}`)
	if not plotFolder then
		plotFolder = Instance.new("Folder")
		plotFolder.Name = `Plot_{plot.Index}`
		plotFolder.Parent = npcsFolder
	end

	local npcName = `{npc.Id}_Plot_{plot.Index}`
	local oldNpc = plotFolder:FindFirstChild(npcName)
	if oldNpc and oldNpc:GetAttribute(GENERATED_ATTRIBUTE) then
		oldNpc:Destroy()
	end

	local npcCFrame = NpcConfig.GetWorldCFrame(plot.Position, npc)
	local npcModel = createFromTemplate({
		{ "NPCs", npc.Id },
		{ "Npcs", npc.Id },
		{ "NPCs", "Npc" },
		{ "Npcs", "Npc" },
	}, npcName, npcCFrame, plotFolder)
		or createPlaceholderNpc(npc, npcCFrame, plotFolder)

	local promptPart = ModelTemplateResolver:FindPart(npcModel, { "PromptPart", "Body", "Root", "Base" })
	if promptPart and not promptPart:FindFirstChild("NpcPrompt") then
		attachPrompt(promptPart, npc)
	end

	npcModel.Name = npcName
	npcModel:SetAttribute(GENERATED_ATTRIBUTE, true)
	npcModel:SetAttribute("NpcId", npc.Id)
	npcModel:SetAttribute("PlotIndex", plot.Index)
	npcModel:SetAttribute("PositionUnit", Studs.UnitName)
	npcModel:SetAttribute("PromptDistanceUnit", Studs.UnitName)

	self.Npcs[plot.Index] = self.Npcs[plot.Index] or {}
	self.Npcs[plot.Index][npc.Id] = npcModel

	return npcModel
end

function NpcService:_createNpcsForPlot(plot)
	for _, npcId in NpcConfig.Order do
		local npc = NpcConfig.GetNpc(npcId)
		if npc then
			self:_createNpc(plot, npc)
		end
	end
end

function NpcService:Start()
	PlotService:EnsurePlots()

	for _, plot in PlotService.Plots do
		self:_createNpcsForPlot(plot)
	end
end

return NpcService
