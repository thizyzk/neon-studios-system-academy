local UIAssets = require(script.Parent.UIAssets)

local SimulatorUITheme = {}

SimulatorUITheme.Colors = {
	Black = Color3.fromRGB(0, 0, 0),
	White = Color3.fromRGB(255, 255, 255),
	DarkPanel = Color3.fromRGB(23, 27, 39),
	DarkPanelDeep = Color3.fromRGB(12, 15, 25),
	LightPanel = Color3.fromRGB(225, 235, 247),
	LightPanelDeep = Color3.fromRGB(188, 207, 225),
	Header = Color3.fromRGB(255, 25, 230),
	HeaderDark = Color3.fromRGB(159, 0, 255),
	Red = Color3.fromRGB(255, 18, 18),
	Green = Color3.fromRGB(34, 255, 18),
	Yellow = Color3.fromRGB(255, 229, 0),
	Purple = Color3.fromRGB(214, 0, 255),
	GrayText = Color3.fromRGB(225, 225, 225),
}

function SimulatorUITheme.AddCorner(instance: Instance, radius: number?)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius or 3)
	corner.Parent = instance

	return corner
end

function SimulatorUITheme.AddStroke(instance: Instance, thickness: number?, color: Color3?)
	local stroke = Instance.new("UIStroke")
	stroke.Color = color or SimulatorUITheme.Colors.Black
	stroke.Thickness = thickness or 4
	stroke.Transparency = 0
	stroke.Parent = instance

	return stroke
end

function SimulatorUITheme.AddTextStroke(textObject: TextLabel | TextButton | TextBox, thickness: number?, color: Color3?)
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	stroke.Color = color or SimulatorUITheme.Colors.Black
	stroke.Thickness = thickness or 2
	stroke.Transparency = 0
	stroke.Parent = textObject

	return stroke
end

function SimulatorUITheme.AddPlate(parent: GuiObject, image: string, transparency: number?)
	if image == "" then
		return nil
	end

	local texture = Instance.new("ImageLabel")
	texture.Name = "PlateTexture"
	texture.BackgroundTransparency = 1
	texture.Image = image
	texture.ImageTransparency = transparency or 0.68
	texture.ScaleType = Enum.ScaleType.Tile
	texture.Size = UDim2.fromScale(1, 1)
	texture.TileSize = UDim2.fromOffset(96, 96)
	texture.ZIndex = parent.ZIndex
	texture.Parent = parent

	return texture
end

function SimulatorUITheme.AddDiamondPlate(parent: GuiObject, transparency: number?)
	return SimulatorUITheme.AddPlate(parent, UIAssets.DiamondPlateImage, transparency)
end

function SimulatorUITheme.AddLightPlate(parent: GuiObject, transparency: number?)
	return SimulatorUITheme.AddPlate(parent, UIAssets.LightPlateImage, transparency)
end

function SimulatorUITheme.AddPinkPlate(parent: GuiObject, transparency: number?)
	return SimulatorUITheme.AddPlate(parent, UIAssets.PinkPlateImage, transparency)
end

function SimulatorUITheme.AddGoldPlate(parent: GuiObject, transparency: number?)
	return SimulatorUITheme.AddPlate(parent, UIAssets.GoldPlateImage, transparency)
end

function SimulatorUITheme.AddGreenPlate(parent: GuiObject, transparency: number?)
	return SimulatorUITheme.AddPlate(parent, UIAssets.GreenPlateImage, transparency)
end

function SimulatorUITheme.StylePanel(frame: Frame)
	frame.BackgroundColor3 = SimulatorUITheme.Colors.LightPanel
	frame.BorderSizePixel = 0
	SimulatorUITheme.AddCorner(frame, 3)
	SimulatorUITheme.AddStroke(frame, 5)
	SimulatorUITheme.AddLightPlate(frame, 0.18)
end

function SimulatorUITheme.StyleButton(button: TextButton, color: Color3?)
	button.AutoButtonColor = true
	button.BackgroundColor3 = color or SimulatorUITheme.Colors.Green
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBlack
	button.TextColor3 = SimulatorUITheme.Colors.White
	SimulatorUITheme.AddCorner(button, 3)
	SimulatorUITheme.AddStroke(button, 3)
	SimulatorUITheme.AddTextStroke(button, 2)
end

function SimulatorUITheme.AddRobuxRgbEffect(instance: GuiObject)
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 0, 85)),
		ColorSequenceKeypoint.new(0.2, Color3.fromRGB(255, 229, 0)),
		ColorSequenceKeypoint.new(0.4, Color3.fromRGB(34, 255, 18)),
		ColorSequenceKeypoint.new(0.6, Color3.fromRGB(0, 195, 255)),
		ColorSequenceKeypoint.new(0.8, Color3.fromRGB(145, 0, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 0, 190)),
	})
	gradient.Rotation = 0
	gradient.Parent = instance

	task.spawn(function()
		while gradient.Parent do
			for rotation = 0, 360, 4 do
				if not gradient.Parent then
					return
				end
				gradient.Rotation = rotation
				task.wait(0.03)
			end
		end
	end)

	return gradient
end

function SimulatorUITheme.StyleText(textObject: TextLabel | TextButton | TextBox, thickness: number?)
	textObject.Font = Enum.Font.GothamBlack
	textObject.TextColor3 = SimulatorUITheme.Colors.White
	SimulatorUITheme.AddTextStroke(textObject, thickness or 2)
end

return SimulatorUITheme
