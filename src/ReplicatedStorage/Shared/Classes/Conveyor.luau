local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)

local Conveyor = {}
Conveyor.__index = Conveyor

function Conveyor.new(config)
	local self = setmetatable({
		Id = config.Id,
		CFrame = config.CFrame,
		SizeStuds = config.SizeStuds or Studs.vector(36, 0.8, 5),
		SpeedStudsPerSecond = config.SpeedStudsPerSecond or Studs.perSecond(8),
		Direction = (config.Direction or Vector3.xAxis).Unit,
		Model = nil,
		CottonsFolder = nil,
		Upgraders = {},
		ActiveCottons = {},
		Delivered = config.Delivered,
		TemplateModel = config.Model,
		HeartbeatConnection = nil,
	}, Conveyor)
	self.Model, self.CottonsFolder = self:_createModel(config.Parent)

	return self
end

function Conveyor:_createModel(parent: Instance?)
	if self.TemplateModel then
		local model = self.TemplateModel
		model.Name = `Conveyor_{self.Id}`
		model.Parent = parent

		local cottonsFolder = model:FindFirstChild("Cottons")
		if not cottonsFolder then
			cottonsFolder = Instance.new("Folder")
			cottonsFolder.Name = "Cottons"
			cottonsFolder.Parent = model
		end

		model:SetAttribute("ConveyorId", self.Id)
		model:SetAttribute("SpeedStudsPerSecond", self.SpeedStudsPerSecond)

		return model, cottonsFolder
	end

	local model = Instance.new("Model")
	model.Name = `Conveyor_{self.Id}`
	model.Parent = parent

	local belt = Instance.new("Part")
	belt.Name = "Belt"
	belt.Anchored = true
	belt.Size = self.SizeStuds
	belt.CFrame = self.CFrame
	belt.Color = Color3.fromRGB(35, 37, 41)
	WorldVisualStyle.Apply(belt, "ConveyorBelt")
	belt.Parent = model

	local leftRoller = Instance.new("Part")
	leftRoller.Name = "StartRoller"
	leftRoller.Anchored = true
	leftRoller.Shape = Enum.PartType.Cylinder
	leftRoller.Size = Studs.vector(self.SizeStuds.Z, 1, 1)
	leftRoller.CFrame = CFrame.lookAt(self:GetStartPosition(), self:GetStartPosition() + self.Direction) * CFrame.Angles(0, 0, math.rad(90))
	leftRoller.Color = Color3.fromRGB(120, 125, 132)
	WorldVisualStyle.Apply(leftRoller, "Metal")
	leftRoller.Parent = model

	local rightRoller = leftRoller:Clone()
	rightRoller.Name = "EndRoller"
	rightRoller.CFrame = CFrame.lookAt(self:GetEndPosition(), self:GetEndPosition() + self.Direction) * CFrame.Angles(0, 0, math.rad(90))
	rightRoller.Parent = model

	local cottonsFolder = Instance.new("Folder")
	cottonsFolder.Name = "Cottons"
	cottonsFolder.Parent = model

	model:SetAttribute("ConveyorId", self.Id)
	model:SetAttribute("SpeedStudsPerSecond", self.SpeedStudsPerSecond)

	return model, cottonsFolder
end

function Conveyor:GetLength()
	return self.SizeStuds.X
end

function Conveyor:GetStartPosition()
	return self.CFrame.Position - (self.Direction * (self:GetLength() / 2))
end

function Conveyor:GetEndPosition()
	return self.CFrame.Position + (self.Direction * (self:GetLength() / 2))
end

function Conveyor:GetCottonPosition(distanceStuds: number)
	local topOffset = Studs.vector(0, (self.SizeStuds.Y / 2) + Studs.scalar(1.2), 0)
	return self:GetStartPosition() + (self.Direction * distanceStuds) + topOffset
end

function Conveyor:AddUpgrader(upgrader)
	table.insert(self.Upgraders, upgrader)
end

function Conveyor:AddCotton(cotton)
	cotton:SetParent(self.CottonsFolder)
	cotton:MoveTo(self:GetCottonPosition(0))

	table.insert(self.ActiveCottons, {
		Cotton = cotton,
		DistanceStuds = Studs.scalar(0),
	})

	return true
end

function Conveyor:_deliverCotton(index: number)
	local entry = self.ActiveCottons[index]
	table.remove(self.ActiveCottons, index)

	if type(self.Delivered) == "function" then
		self.Delivered(entry.Cotton)
	else
		entry.Cotton:Destroy()
	end
end

function Conveyor:_step(deltaTime: number)
	for index = #self.ActiveCottons, 1, -1 do
		local entry = self.ActiveCottons[index]
		entry.DistanceStuds += self.SpeedStudsPerSecond * deltaTime
		entry.Cotton:MoveTo(self:GetCottonPosition(entry.DistanceStuds))

		for _, upgrader in self.Upgraders do
			upgrader:Process(entry.Cotton)
		end

		if entry.DistanceStuds >= self:GetLength() then
			self:_deliverCotton(index)
		end
	end
end

function Conveyor:Start()
	if self.HeartbeatConnection then
		return
	end

	self.HeartbeatConnection = RunService.Heartbeat:Connect(function(deltaTime)
		self:_step(deltaTime)
	end)
end

function Conveyor:Stop()
	if self.HeartbeatConnection then
		self.HeartbeatConnection:Disconnect()
		self.HeartbeatConnection = nil
	end
end

function Conveyor:Destroy()
	self:Stop()

	for _, entry in self.ActiveCottons do
		entry.Cotton:Destroy()
	end

	table.clear(self.ActiveCottons)

	if self.Model then
		self.Model:Destroy()
		self.Model = nil
	end
end

return Conveyor
