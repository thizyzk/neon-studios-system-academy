-- LocalizationService (Intermediario)
-- API de dominio configurada em IntegrationSystemsConfig.

local ServerScriptService = game:GetService("ServerScriptService")

local IntegrationSystemsConfig = require(ServerScriptService.Config.IntegrationSystemsConfig)
local IntegrationServiceFactory = require(ServerScriptService.Services.Integration.IntegrationServiceFactory)

return IntegrationServiceFactory.new(IntegrationSystemsConfig.Services.LocalizationService)

