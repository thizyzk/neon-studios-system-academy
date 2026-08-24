local ItemConfig = {}

ItemConfig.Items = {
	RawCotton = {
		Id = "RawCotton",
		DisplayName = "Raw Cotton",
		BaseValue = 5,
		StorageLimit = 120,
	},
	CleanCotton = {
		Id = "CleanCotton",
		DisplayName = "Clean Cotton",
		BaseValue = 10,
		StorageLimit = 120,
	},
	CottonThread = {
		Id = "CottonThread",
		DisplayName = "Cotton Thread",
		BaseValue = 20,
		StorageLimit = 100,
	},
	CottonFabric = {
		Id = "CottonFabric",
		DisplayName = "Cotton Fabric",
		BaseValue = 42,
		StorageLimit = 80,
	},
}

ItemConfig.DefaultStorageLimit = 99

function ItemConfig.GetItem(itemId: string)
	return ItemConfig.Items[itemId]
end

function ItemConfig.GetStorageLimit(itemId: string)
	local item = ItemConfig.GetItem(itemId)

	return if item then item.StorageLimit else ItemConfig.DefaultStorageLimit
end

return ItemConfig
