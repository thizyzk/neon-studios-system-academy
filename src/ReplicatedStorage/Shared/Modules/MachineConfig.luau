local MachineConfig = {}
local Studs = require(script.Parent.Studs)

MachineConfig.Machines = {
	Cleaner = {
		Id = "Cleaner",
		DisplayName = "Cotton Cleaner",
		InputItemId = "RawCotton",
		OutputItemId = "CleanCotton",
		InputAmount = 1,
		OutputAmount = 1,
		CycleTime = 8,
		UpgradeCost = 45,
		UpgradeCostMultiplier = 1.8,
		SpeedMultiplierPerLevel = 0.18,
		MaxLevel = 8,
		FactoryOffsetStuds = Studs.vector(-18, 3, 17),
		Color = Color3.fromRGB(88, 112, 126),
		RunningColor = Color3.fromRGB(98, 181, 147),
	},
	Spinner = {
		Id = "Spinner",
		DisplayName = "Thread Spinner",
		InputItemId = "CleanCotton",
		OutputItemId = "CottonThread",
		InputAmount = 2,
		OutputAmount = 1,
		CycleTime = 12,
		UpgradeCost = 120,
		UpgradeCostMultiplier = 1.85,
		SpeedMultiplierPerLevel = 0.16,
		MaxLevel = 8,
		FactoryOffsetStuds = Studs.vector(-6, 3, 17),
		Color = Color3.fromRGB(118, 101, 151),
		RunningColor = Color3.fromRGB(161, 133, 222),
	},
	Loom = {
		Id = "Loom",
		DisplayName = "Fabric Loom",
		InputItemId = "CottonThread",
		OutputItemId = "CottonFabric",
		InputAmount = 2,
		OutputAmount = 1,
		CycleTime = 16,
		UpgradeCost = 300,
		UpgradeCostMultiplier = 1.9,
		SpeedMultiplierPerLevel = 0.14,
		MaxLevel = 8,
		FactoryOffsetStuds = Studs.vector(6, 3, 17),
		Color = Color3.fromRGB(133, 112, 82),
		RunningColor = Color3.fromRGB(218, 171, 83),
	},
}

MachineConfig.Order = {
	"Cleaner",
	"Spinner",
	"Loom",
}

function MachineConfig.GetMachine(machineId: string)
	return MachineConfig.Machines[machineId]
end

function MachineConfig.GetUpgradeCost(machineId: string, currentLevel: number)
	local machine = MachineConfig.GetMachine(machineId)
	if not machine then
		return 0
	end

	local level = math.max(1, currentLevel)
	return math.floor(machine.UpgradeCost * (machine.UpgradeCostMultiplier ^ (level - 1)))
end

function MachineConfig.GetCycleTime(machineId: string, level: number)
	local machine = MachineConfig.GetMachine(machineId)
	if not machine then
		return 1
	end

	local speedMultiplier = 1 + ((math.max(1, level) - 1) * machine.SpeedMultiplierPerLevel)
	return math.max(1, math.floor(machine.CycleTime / speedMultiplier))
end

return MachineConfig
