local Studs = require(script.Parent.Studs)

local WorldVisualStyle = {}

local STUD_TEXTURE_ATTRIBUTE = "TextureUnit"
local TILE_U_ATTRIBUTE = "TextureStudsPerTileU"
local TILE_V_ATTRIBUTE = "TextureStudsPerTileV"

local Styles = {
	Floor = {
		Material = Enum.Material.Grass,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(4),
		StudsPerTileV = Studs.scalar(4),
	},
	Soil = {
		Material = Enum.Material.Ground,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(2),
		StudsPerTileV = Studs.scalar(2),
	},
	Ramp = {
		Material = Enum.Material.WoodPlanks,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(4),
		StudsPerTileV = Studs.scalar(4),
	},
	SellPad = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(2),
		StudsPerTileV = Studs.scalar(2),
	},
	UpgradePad = {
		Material = Enum.Material.Neon,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(2),
		StudsPerTileV = Studs.scalar(2),
	},
	Machine = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(3),
		StudsPerTileV = Studs.scalar(3),
	},
	ConveyorBelt = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(2),
		StudsPerTileV = Studs.scalar(2),
	},
	Metal = {
		Material = Enum.Material.Metal,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(2),
		StudsPerTileV = Studs.scalar(2),
	},
	Cotton = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Smooth,
		StudsPerTileU = Studs.scalar(1),
		StudsPerTileV = Studs.scalar(1),
	},
	Npc = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Studs,
		StudsPerTileU = Studs.scalar(1),
		StudsPerTileV = Studs.scalar(1),
	},
	NpcStud = {
		Material = Enum.Material.SmoothPlastic,
		TopSurface = Enum.SurfaceType.Smooth,
		StudsPerTileU = Studs.scalar(0.5),
		StudsPerTileV = Studs.scalar(0.5),
	},
}

local function applyStyle(part: BasePart, style)
	part.Material = style.Material or part.Material
	part.TopSurface = style.TopSurface or Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.LeftSurface = Enum.SurfaceType.Smooth
	part.RightSurface = Enum.SurfaceType.Smooth
	part.FrontSurface = Enum.SurfaceType.Smooth
	part.BackSurface = Enum.SurfaceType.Smooth
	part:SetAttribute(STUD_TEXTURE_ATTRIBUTE, Studs.UnitName)
	part:SetAttribute(TILE_U_ATTRIBUTE, style.StudsPerTileU)
	part:SetAttribute(TILE_V_ATTRIBUTE, style.StudsPerTileV)
end

function WorldVisualStyle.Apply(part: BasePart, styleName: string)
	local style = Styles[styleName]
	if not style then
		return part
	end

	applyStyle(part, style)

	return part
end

return WorldVisualStyle
