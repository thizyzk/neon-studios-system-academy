local Studs = require(script.Parent.Studs)

local NpcConfig = {}

NpcConfig.DefaultPromptDistanceStuds = Studs.scalar(12)
NpcConfig.DefaultLabelOffsetStuds = Studs.vector(0, 3.4, 0)
NpcConfig.LegoStudDiameterStuds = Studs.scalar(0.42)
NpcConfig.LegoStudHeightStuds = Studs.scalar(0.14)
NpcConfig.LegoStudInsetStuds = Studs.scalar(0.38)

NpcConfig.Npcs = {
	FarmHelper = {
		Id = "FarmHelper",
		DisplayName = "Farm Helper",
		Role = "Cotton planting guide",
		PlotOffsetStuds = Studs.vector(-19, 1.7, -18),
		BodySizeStuds = Studs.vector(1.6, 2.4, 1),
		HeadSizeStuds = Studs.vector(1.5, 1.5, 1.5),
		HeadOffsetStuds = Studs.vector(0, 1.95, 0),
		BodyStudColumns = 2,
		BodyStudRows = 1,
		HeadStudColumns = 1,
		HeadStudRows = 1,
		PromptDistanceStuds = Studs.scalar(12),
		LabelOffsetStuds = Studs.vector(0, 3.5, 0),
		FacingDegrees = 25,
		Color = Color3.fromRGB(78, 139, 86),
		AccentColor = Color3.fromRGB(236, 226, 179),
	},
	FactoryMentor = {
		Id = "FactoryMentor",
		DisplayName = "Factory Mentor",
		Role = "Machine and fabric guide",
		PlotOffsetStuds = Studs.vector(19, 1.7, 4),
		BodySizeStuds = Studs.vector(1.6, 2.4, 1),
		HeadSizeStuds = Studs.vector(1.5, 1.5, 1.5),
		HeadOffsetStuds = Studs.vector(0, 1.95, 0),
		BodyStudColumns = 2,
		BodyStudRows = 1,
		HeadStudColumns = 1,
		HeadStudRows = 1,
		PromptDistanceStuds = Studs.scalar(12),
		LabelOffsetStuds = Studs.vector(0, 3.5, 0),
		FacingDegrees = -35,
		Color = Color3.fromRGB(82, 111, 138),
		AccentColor = Color3.fromRGB(242, 236, 220),
	},
}

NpcConfig.Order = {
	"FarmHelper",
	"FactoryMentor",
}

function NpcConfig.GetNpc(npcId: string)
	return NpcConfig.Npcs[npcId]
end

function NpcConfig.GetWorldCFrame(plotPosition: Vector3, npc)
	local positionStuds = plotPosition + npc.PlotOffsetStuds
	local facingRadians = math.rad(npc.FacingDegrees or 0)

	return Studs.cframe(positionStuds) * CFrame.Angles(0, facingRadians, 0)
end

return NpcConfig
