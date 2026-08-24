local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Loader = require(ReplicatedStorage.Shared.Framework.Loader)
local Knit = require(ReplicatedStorage.Packages.Knit)

local knitServices = ServerScriptService:FindFirstChild("KnitServices")
if knitServices then
	Knit.AddServicesDeep(knitServices)
end

Loader.LoadDescendants(ServerScriptService.Services)
Loader.Start()

Knit.Start():catch(warn)
