local UIAssets = {}

UIAssets.IconSheetImage = "rbxassetid://115745035028284"
UIAssets.PanelTextureImage = "rbxassetid://112024654033615"
UIAssets.DiamondPlateImage = ""
UIAssets.LightPlateImage = ""
UIAssets.PinkPlateImage = ""
UIAssets.GoldPlateImage = ""
UIAssets.GreenPlateImage = ""

local generatedModule = script.Parent:FindFirstChild("GeneratedAssets")
if generatedModule and generatedModule:IsA("ModuleScript") then
	local ok, generatedAssets = pcall(require, generatedModule)
	if ok and type(generatedAssets) == "table" then
		local ui = generatedAssets.ui or generatedAssets.UI or generatedAssets

		UIAssets.IconSheetImage = ui["cotton-ui-icons"] or ui.CottonUiIcons or UIAssets.IconSheetImage
		UIAssets.PanelTextureImage = ui["cotton-fabric-panel-texture"] or ui.CottonFabricPanelTexture or UIAssets.PanelTextureImage
		UIAssets.DiamondPlateImage = ui["simulator-diamond-plate"] or ui.SimulatorDiamondPlate or UIAssets.DiamondPlateImage
		UIAssets.LightPlateImage = ui["simulator-light-plate"] or ui.SimulatorLightPlate or UIAssets.LightPlateImage
		UIAssets.PinkPlateImage = ui["simulator-pink-plate"] or ui.SimulatorPinkPlate or UIAssets.PinkPlateImage
		UIAssets.GoldPlateImage = ui["simulator-gold-plate"] or ui.SimulatorGoldPlate or UIAssets.GoldPlateImage
		UIAssets.GreenPlateImage = ui["simulator-green-plate"] or ui.SimulatorGreenPlate or UIAssets.GreenPlateImage
	end
end

UIAssets.IconSheetCellSize = Vector2.new(418, 627)
UIAssets.IconSheetRects = {
	CottonYield = Vector2.new(0, 0),
	CleanerFlow = Vector2.new(418, 0),
	Threadcraft = Vector2.new(836, 0),
	LoomMastery = Vector2.new(0, 627),
	StorageLogistics = Vector2.new(418, 627),
	MarketSense = Vector2.new(836, 627),
	Cotton = Vector2.new(0, 0),
	Machine = Vector2.new(418, 0),
	Upgrade = Vector2.new(836, 0),
	Fabric = Vector2.new(0, 627),
	Storage = Vector2.new(418, 627),
	Market = Vector2.new(836, 627),
}

function UIAssets.HasIconSheet()
	return UIAssets.IconSheetImage ~= ""
end

function UIAssets.HasPanelTexture()
	return UIAssets.PanelTextureImage ~= ""
end

function UIAssets.HasDiamondPlate()
	return UIAssets.DiamondPlateImage ~= ""
end

function UIAssets.HasLightPlate()
	return UIAssets.LightPlateImage ~= ""
end

function UIAssets.HasPinkPlate()
	return UIAssets.PinkPlateImage ~= ""
end

function UIAssets.HasGoldPlate()
	return UIAssets.GoldPlateImage ~= ""
end

function UIAssets.HasGreenPlate()
	return UIAssets.GreenPlateImage ~= ""
end

function UIAssets.GetIconRect(iconId: string)
	return UIAssets.IconSheetRects[iconId] or UIAssets.IconSheetRects.CottonYield
end

return UIAssets
