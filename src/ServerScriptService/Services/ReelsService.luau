local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local Config = require(ServerScriptService.Config.TikTokReelsConfig)

local ReelsService = {}

ReelsService.Remotes = nil
ReelsService.LastSnapshot = {
	Ok = false,
	Error = "NotLoaded",
	Reels = {},
	Profile = nil,
	FetchedAt = nil,
}
ReelsService.LastFetchAt = 0
ReelsService.Fetching = false

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local reelsFolder = remotesFolder:FindFirstChild("Reels")
	if not reelsFolder then
		reelsFolder = Instance.new("Folder")
		reelsFolder.Name = "Reels"
		reelsFolder.Parent = remotesFolder
	end

	local getReels = reelsFolder:FindFirstChild("GetReels")
	if not getReels then
		getReels = Instance.new("RemoteFunction")
		getReels.Name = "GetReels"
		getReels.Parent = reelsFolder
	end

	local reelsUpdated = reelsFolder:FindFirstChild("ReelsUpdated")
	if not reelsUpdated then
		reelsUpdated = Instance.new("RemoteEvent")
		reelsUpdated.Name = "ReelsUpdated"
		reelsUpdated.Parent = reelsFolder
	end

	return {
		GetReels = getReels,
		ReelsUpdated = reelsUpdated,
	}
end

local function trimTrailingSlash(value: string)
	return value:gsub("/+$", "")
end

local function sanitizeReel(reel)
	if type(reel) ~= "table" then
		return nil
	end

	return {
		Id = tostring(reel.id or ""),
		Title = tostring(reel.title or ""),
		Description = tostring(reel.description or ""),
		Duration = tonumber(reel.duration) or 0,
		CoverImageUrl = tostring(reel.coverImageUrl or ""),
		ShareUrl = tostring(reel.shareUrl or ""),
		EmbedLink = tostring(reel.embedLink or ""),
		LikeCount = tonumber(reel.likeCount) or 0,
		CommentCount = tonumber(reel.commentCount) or 0,
		ShareCount = tonumber(reel.shareCount) or 0,
		ViewCount = tonumber(reel.viewCount) or 0,
	}
end

local function sanitizeSnapshot(payload)
	if type(payload) ~= "table" or payload.ok ~= true then
		return {
			Ok = false,
			Error = tostring(if type(payload) == "table" then payload.error or "InvalidResponse" else "InvalidResponse"),
			Message = if type(payload) == "table" then payload.message else nil,
			Reels = {},
		}
	end

	local reels = {}
	if type(payload.reels) == "table" then
		for _, reel in payload.reels do
			local sanitized = sanitizeReel(reel)
			if sanitized and sanitized.Id ~= "" then
				table.insert(reels, sanitized)
			end
		end
	end

	return {
		Ok = true,
		Source = tostring(payload.source or "tiktok"),
		Cached = payload.cached == true,
		FetchedAt = tostring(payload.fetchedAt or ""),
		ExpiresAt = tostring(payload.expiresAt or ""),
		Profile = payload.profile,
		Reels = reels,
	}
end

function ReelsService:_requestSnapshot()
	local serverUrl = trimTrailingSlash(Config.ServerUrl)
	local url = `{serverUrl}/api/reels?limit={Config.MaxReels}`
	local headers = {}

	if Config.GameSecret and Config.GameSecret ~= "" then
		headers["x-game-secret"] = Config.GameSecret
	end

	local response = HttpService:RequestAsync({
		Url = url,
		Method = "GET",
		Headers = headers,
	})

	local decoded = HttpService:JSONDecode(response.Body)
	if not response.Success then
		return sanitizeSnapshot(decoded)
	end

	return sanitizeSnapshot(decoded)
end

function ReelsService:Refresh(force: boolean?)
	if self.Fetching then
		return self.LastSnapshot
	end

	local now = os.clock()
	if not force and now - self.LastFetchAt < Config.RefreshSeconds then
		return self.LastSnapshot
	end

	self.Fetching = true
	local ok, result = pcall(function()
		return self:_requestSnapshot()
	end)
	self.Fetching = false
	self.LastFetchAt = now

	if ok then
		self.LastSnapshot = result
	else
		self.LastSnapshot = {
			Ok = false,
			Error = "RequestFailed",
			Message = tostring(result),
			Reels = self.LastSnapshot.Reels or {},
			Profile = self.LastSnapshot.Profile,
			FetchedAt = self.LastSnapshot.FetchedAt,
		}
	end

	if self.Remotes then
		self.Remotes.ReelsUpdated:FireAllClients(self.LastSnapshot)
	end

	return self.LastSnapshot
end

function ReelsService:GetSnapshot()
	return self:Refresh(false)
end

function ReelsService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.GetReels.OnServerInvoke = function()
		return self:GetSnapshot()
	end
end

function ReelsService:Start()
	task.spawn(function()
		self:Refresh(true)

		while true do
			task.wait(Config.RefreshSeconds)
			self:Refresh(true)
		end
	end)
end

return ReelsService
