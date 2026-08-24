--[[
	SubscriptionService

	Proposito:
	Mantem direitos temporarios por plano, renovacao, cancelamento e expiracao.
	Ele nao processa Robux nem chama APIs de compra; um adaptador confiavel ativa
	o plano depois que a plataforma confirma a aquisicao.

	Exemplo de uso:
	local Subscriptions = require(ServerScriptService.Services.Economy.SubscriptionService)
	Subscriptions:Activate(player, "CottonClub", { Source = "VerifiedPurchase" })
]]

local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)

local SubscriptionService = {}
SubscriptionService.__index = SubscriptionService

local function snapshot(subscription)
	return {
		Id = subscription.Id,
		PlanId = subscription.PlanId,
		StartedAt = subscription.StartedAt,
		EndsAt = subscription.EndsAt,
		AutoRenew = subscription.AutoRenew,
		State = subscription.State,
		Source = subscription.Source,
		ExternalReference = subscription.ExternalReference,
	}
end

function SubscriptionService.new(config, eventBus)
	local self = setmetatable({}, SubscriptionService)
	self.Config = config or EconomyConfig.Subscription
	self.Events = eventBus or EventBus
	self._subscriptions = {}
	self._running = false
	return self
end

function SubscriptionService:_getPlayerSubscriptions(player)
	local subscriptions = self._subscriptions[player.UserId]
	if not subscriptions then
		subscriptions = {}
		self._subscriptions[player.UserId] = subscriptions
	end
	return subscriptions
end

function SubscriptionService:_refresh(subscription)
	if subscription.State == "Active" and os.time() >= subscription.EndsAt + self.Config.RenewalGraceSeconds then
		subscription.State = "Expired"
		self.Events:Publish("Subscription.Expired", snapshot(subscription))
	end
end

function SubscriptionService:Activate(player, planId, options)
	local plan = self.Config.Plans[planId]
	if not plan then
		return { Ok = false, Error = "PlanNotFound" }
	end

	local settings = options or {}
	local subscriptions = self:_getPlayerSubscriptions(player)
	local current = subscriptions[planId]
	local now = os.time()
	local startsFrom = if current and current.State == "Active" and current.EndsAt > now then current.EndsAt else now
	local subscription = current or {
		Id = HttpService:GenerateGUID(false),
		PlanId = planId,
		StartedAt = now,
	}

	subscription.EndsAt = startsFrom + plan.DurationSeconds
	subscription.AutoRenew = settings.AutoRenew == true
	subscription.State = "Active"
	subscription.Source = tostring(settings.Source or "ServerGrant")
	subscription.ExternalReference = settings.ExternalReference
	subscriptions[planId] = subscription
	self.Events:Publish("Subscription.Activated", player.UserId, snapshot(subscription))
	return { Ok = true, Subscription = snapshot(subscription) }
end

function SubscriptionService:Get(player, planId)
	local subscription = self:_getPlayerSubscriptions(player)[planId]
	if subscription then
		self:_refresh(subscription)
		return snapshot(subscription)
	end
	return nil
end

function SubscriptionService:IsActive(player, planId)
	local subscription = self:Get(player, planId)
	return subscription ~= nil and subscription.State == "Active" and os.time() < subscription.EndsAt
end

function SubscriptionService:Cancel(player, planId)
	local subscription = self:_getPlayerSubscriptions(player)[planId]
	if not subscription or subscription.State ~= "Active" then
		return { Ok = false, Error = "SubscriptionNotActive" }
	end

	subscription.AutoRenew = false
	subscription.CancelledAt = os.time()
	self.Events:Publish("Subscription.Cancelled", player.UserId, snapshot(subscription))
	return { Ok = true, Subscription = snapshot(subscription) }
end

function SubscriptionService:Revoke(player, planId, reason)
	local subscription = self:_getPlayerSubscriptions(player)[planId]
	if not subscription then
		return { Ok = false, Error = "SubscriptionNotFound" }
	end

	subscription.State = "Revoked"
	subscription.EndsAt = os.time()
	subscription.RevokeReason = tostring(reason or "ServerRevoked")
	self.Events:Publish("Subscription.Revoked", player.UserId, snapshot(subscription))
	return { Ok = true, Subscription = snapshot(subscription) }
end

function SubscriptionService:GetActiveBenefits(player)
	local benefits = {}
	for planId, plan in self.Config.Plans do
		if self:IsActive(player, planId) then
			for benefitId, value in plan.Benefits or {} do
				benefits[benefitId] = value
			end
		end
	end
	return benefits
end

function SubscriptionService:ExportPlayer(player)
	local result = {}
	for planId, subscription in self:_getPlayerSubscriptions(player) do
		self:_refresh(subscription)
		result[planId] = table.clone(subscription)
	end
	return result
end

function SubscriptionService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end

	local imported = {}
	for planId, subscription in state do
		if self.Config.Plans[planId] and type(subscription) == "table" then
			imported[planId] = table.clone(subscription)
		end
	end
	self._subscriptions[player.UserId] = imported
	return true
end

function SubscriptionService:Start()
	self._running = true
	task.spawn(function()
		while self._running do
			task.wait(60)
			for _, subscriptions in self._subscriptions do
				for _, subscription in subscriptions do
					self:_refresh(subscription)
				end
			end
		end
	end)
end

function SubscriptionService:Destroy()
	self._running = false
end

--[[
	Resumo em blocos:
	- Fronteira de compra: ativacao recebe uma confirmacao de outro sistema e nao
	  tenta processar pagamento dentro do dominio de assinatura.
	- Ciclo de vida: renovacao estende o fim atual, cancelamento desliga renovacao
	  e revogacao encerra imediatamente.
	- Persistencia: contratos sao serializaveis e expiracao e recalculada no
	  servidor depois da importacao.
]]

return SubscriptionService.new()
