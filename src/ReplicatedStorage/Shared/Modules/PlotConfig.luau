local PlotConfig = {}
local Studs = require(script.Parent.Studs)

PlotConfig.PlotCount = 6
PlotConfig.PlotSpacingStuds = Studs.scalar(82)
PlotConfig.PlotSizeStuds = Studs.vector(58, 1, 58)
PlotConfig.PlotOriginStuds = Studs.vector(0, 0, 0)

PlotConfig.SlotSizeStuds = Studs.vector(8, 0.5, 8)
PlotConfig.SlotSpacingStuds = Studs.vector(12, 0, 12)
PlotConfig.SlotHeightOffsetStuds = Studs.scalar(0.75)
PlotConfig.StairSizeStuds = Studs.vector(10, 1, 26)

PlotConfig.Floors = {
	{
		Index = 1,
		Name = "Ground Floor",
		Description = "Starter cotton field and first factory area.",
		HeightStuds = Studs.scalar(0),
		Slots = 6,
		SlotColumns = 3,
		UnlockCost = 0,
		Color = Color3.fromRGB(96, 142, 86),
		SlotColor = Color3.fromRGB(125, 92, 62),
	},
	{
		Index = 2,
		Name = "Fiber Floor",
		Description = "Adds more cotton slots for the cleaning and fiber stage.",
		HeightStuds = Studs.scalar(18),
		Slots = 6,
		SlotColumns = 3,
		UnlockCost = 250,
		Color = Color3.fromRGB(88, 130, 154),
		SlotColor = Color3.fromRGB(119, 102, 78),
	},
	{
		Index = 3,
		Name = "Weaving Floor",
		Description = "Expands production capacity for thread and fabric.",
		HeightStuds = Studs.scalar(36),
		Slots = 9,
		SlotColumns = 3,
		UnlockCost = 1500,
		Color = Color3.fromRGB(126, 105, 160),
		SlotColor = Color3.fromRGB(111, 91, 120),
	},
	{
		Index = 4,
		Name = "Dye Floor",
		Description = "Late-game expansion for rare cotton and dyed fabric.",
		HeightStuds = Studs.scalar(54),
		Slots = 12,
		SlotColumns = 4,
		UnlockCost = 7000,
		Color = Color3.fromRGB(160, 118, 88),
		SlotColor = Color3.fromRGB(128, 86, 69),
	},
}

PlotConfig.GrowthStageNames = {
	"Empty",
	"Planted",
	"Sprout",
	"Growing",
	"Ready",
}

function PlotConfig.GetPlotPosition(plotIndex: number)
	local row = math.floor((plotIndex - 1) / 3)
	local column = (plotIndex - 1) % 3
	local x = (column - 1) * PlotConfig.PlotSpacingStuds
	local z = row * PlotConfig.PlotSpacingStuds

	return PlotConfig.PlotOriginStuds + Studs.vector(x, 0, z)
end

function PlotConfig.GetFloorConfig(floorIndex: number)
	return PlotConfig.Floors[floorIndex]
end

function PlotConfig.GetFloorPosition(plotPosition: Vector3, floorIndex: number)
	local floorConfig = PlotConfig.GetFloorConfig(floorIndex)
	if not floorConfig then
		return plotPosition
	end

	return plotPosition + Studs.vector(0, floorConfig.HeightStuds, 0)
end

function PlotConfig.GetSlotOffset(slotIndexOnFloor: number, floorIndex: number)
	local floorConfig = PlotConfig.GetFloorConfig(floorIndex) or PlotConfig.Floors[1]
	local columns = floorConfig.SlotColumns
	local row = math.floor((slotIndexOnFloor - 1) / columns)
	local column = (slotIndexOnFloor - 1) % columns
	local totalRows = math.ceil(floorConfig.Slots / columns)
	local centeredColumn = column - ((columns - 1) / 2)
	local centeredRow = row - ((totalRows - 1) / 2)

	return Studs.vector(
		centeredColumn * PlotConfig.SlotSpacingStuds.X,
		PlotConfig.SlotHeightOffsetStuds,
		centeredRow * PlotConfig.SlotSpacingStuds.Z
	)
end

function PlotConfig.GetFloorSlotStart(floorIndex: number)
	local slotStart = 1

	for index = 1, floorIndex - 1 do
		local floorConfig = PlotConfig.GetFloorConfig(index)
		if floorConfig then
			slotStart += floorConfig.Slots
		end
	end

	return slotStart
end

function PlotConfig.GetFloorIndexForSlot(slotIndex: number)
	local cursor = 0

	for _, floorConfig in PlotConfig.Floors do
		cursor += floorConfig.Slots
		if slotIndex <= cursor then
			return floorConfig.Index
		end
	end

	return nil
end

function PlotConfig.GetTotalSlots()
	local totalSlots = 0

	for _, floorConfig in PlotConfig.Floors do
		totalSlots += floorConfig.Slots
	end

	return totalSlots
end

return PlotConfig
