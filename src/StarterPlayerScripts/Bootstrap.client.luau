local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Loader = require(ReplicatedStorage.Shared.Framework.Loader)
local Knit = require(ReplicatedStorage.Packages.Knit)
local Controllers = Players.LocalPlayer:WaitForChild("PlayerScripts"):WaitForChild("Controllers")
local KnitControllers = Players.LocalPlayer:WaitForChild("PlayerScripts"):FindFirstChild("KnitControllers")

if KnitControllers then
	Knit.AddControllersDeep(KnitControllers)
end

Loader.LoadDescendants(Controllers)
Loader.Start()

Knit.Start({
	ServicePromises = false,
}):catch(warn)
