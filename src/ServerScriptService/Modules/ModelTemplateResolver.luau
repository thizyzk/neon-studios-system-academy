local ServerStorage = game:GetService("ServerStorage")

local ModelTemplateResolver = {}

ModelTemplateResolver.RootNames = {
	"CottonFabricTycoonTemplates",
	"ModelTemplates",
}

local PART_PRIORITY = {
	"PromptPart",
	"Primary",
	"Root",
	"Base",
	"Body",
	"Handle",
}

local function findFirstBasePart(instance: Instance): BasePart?
	if instance:IsA("BasePart") then
		return instance
	end

	for _, descendant in instance:GetDescendants() do
		if descendant:IsA("BasePart") then
			return descendant
		end
	end

	return nil
end

function ModelTemplateResolver:GetRoot(): Instance?
	for _, rootName in self.RootNames do
		local root = ServerStorage:FindFirstChild(rootName)
		if root then
			return root
		end
	end

	return nil
end

function ModelTemplateResolver:FindTemplate(path: { string }): Instance?
	local current = self:GetRoot()
	if not current then
		return nil
	end

	for _, segment in path do
		current = current:FindFirstChild(segment)
		if not current then
			return nil
		end
	end

	return current
end

function ModelTemplateResolver:Clone(path: { string }, parent: Instance?): Instance?
	local template = self:FindTemplate(path)
	if not template then
		return nil
	end

	local clone = template:Clone()
	clone.Parent = parent

	return clone
end

function ModelTemplateResolver:GetMainPart(instance: Instance?): BasePart?
	if not instance then
		return nil
	end

	if instance:IsA("BasePart") then
		return instance
	end

	if instance:IsA("Model") and instance.PrimaryPart then
		return instance.PrimaryPart
	end

	for _, partName in PART_PRIORITY do
		local child = instance:FindFirstChild(partName, true)
		if child and child:IsA("BasePart") then
			if instance:IsA("Model") and not instance.PrimaryPart then
				instance.PrimaryPart = child
			end

			return child
		end
	end

	local firstPart = findFirstBasePart(instance)
	if firstPart and instance:IsA("Model") and not instance.PrimaryPart then
		instance.PrimaryPart = firstPart
	end

	return firstPart
end

function ModelTemplateResolver:PivotTo(instance: Instance, cframe: CFrame)
	if instance:IsA("Model") then
		if not instance.PrimaryPart then
			self:GetMainPart(instance)
		end

		instance:PivotTo(cframe)
	elseif instance:IsA("BasePart") then
		instance.CFrame = cframe
	else
		local mainPart = self:GetMainPart(instance)
		if mainPart then
			local delta = cframe * mainPart.CFrame:Inverse()
			for _, descendant in instance:GetDescendants() do
				if descendant:IsA("BasePart") then
					descendant.CFrame = delta * descendant.CFrame
				end
			end
		end
	end
end

function ModelTemplateResolver:SetAnchored(instance: Instance, anchored: boolean)
	if instance:IsA("BasePart") then
		instance.Anchored = anchored
	end

	for _, descendant in instance:GetDescendants() do
		if descendant:IsA("BasePart") then
			descendant.Anchored = anchored
		end
	end
end

function ModelTemplateResolver:SetAttributeRecursive(instance: Instance, attributeName: string, value: any)
	instance:SetAttribute(attributeName, value)

	for _, descendant in instance:GetDescendants() do
		descendant:SetAttribute(attributeName, value)
	end
end

function ModelTemplateResolver:FindPart(instance: Instance, names: { string }): BasePart?
	for _, name in names do
		local child = instance:FindFirstChild(name, true)
		if child and child:IsA("BasePart") then
			return child
		end
	end

	return self:GetMainPart(instance)
end

return ModelTemplateResolver
