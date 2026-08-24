local Players = game:GetService("Players")

local LeaderstatsService = {}

LeaderstatsService.Stats = {
	{
		Id = "Cash",
		Name = "Dinheiro",
		DefaultValue = 0,
	},
	{
		Id = "Cotton",
		Name = "Algodao",
		DefaultValue = 0,
	},
	{
		Id = "Level",
		Name = "Nivel",
		DefaultValue = 1,
	},
}

LeaderstatsService.StatNames = {
	Cash = "Dinheiro",
	Cotton = "Algodao",
	Level = "Nivel",
}

local function getOrCreateIntValue(parent: Instance, statId: string, name: string, defaultValue: number)
	local value = parent:FindFirstChild(name)
	local oldValue = parent:FindFirstChild(statId)

	if not value and oldValue and oldValue:IsA("IntValue") then
		oldValue.Name = name
		value = oldValue
	elseif oldValue and oldValue ~= value then
		oldValue:Destroy()
	end

	if value and not value:IsA("IntValue") then
		value:Destroy()
		value = nil
	end

	if not value then
		value = Instance.new("IntValue")
		value.Name = name
		value.Value = defaultValue
		value.Parent = parent
	end

	return value
end

function LeaderstatsService:GetLeaderstats(player: Player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		leaderstats.Parent = player
	end

	for _, statConfig in self.Stats do
		getOrCreateIntValue(leaderstats, statConfig.Id, statConfig.Name, statConfig.DefaultValue)
	end

	return leaderstats
end

function LeaderstatsService:GetStatName(statId: string)
	return self.StatNames[statId] or statId
end

function LeaderstatsService:GetStat(player: Player, statName: string)
	local leaderstats = self:GetLeaderstats(player)
	local stat = leaderstats:FindFirstChild(self:GetStatName(statName))

	if stat and stat:IsA("IntValue") then
		return stat
	end

	return nil
end

function LeaderstatsService:SetStat(player: Player, statName: string, value: number)
	local stat = self:GetStat(player, statName)
	if not stat then
		return nil
	end

	stat.Value = math.max(0, math.floor(value))
	return stat.Value
end

function LeaderstatsService:AddStat(player: Player, statName: string, amount: number)
	local stat = self:GetStat(player, statName)
	if not stat then
		return nil
	end

	stat.Value = math.max(0, stat.Value + math.floor(amount))
	return stat.Value
end

function LeaderstatsService:AddCash(player: Player, amount: number)
	return self:AddStat(player, "Cash", amount)
end

function LeaderstatsService:AddCotton(player: Player, amount: number)
	return self:AddStat(player, "Cotton", amount)
end

function LeaderstatsService:SetCotton(player: Player, amount: number)
	return self:SetStat(player, "Cotton", amount)
end

function LeaderstatsService:CreatePlayerStats(player: Player)
	self:GetLeaderstats(player)
end

function LeaderstatsService:Start()
	for _, player in Players:GetPlayers() do
		self:CreatePlayerStats(player)
	end

	Players.PlayerAdded:Connect(function(player)
		self:CreatePlayerStats(player)
	end)
end

return LeaderstatsService
