local Loader = {}
local _modules = {}
local _started = false

local function tryRequire(moduleScript: ModuleScript)
    local ok, result = pcall(require, moduleScript)
    if not ok then
        warn(`[Loader] Failed to require {moduleScript:GetFullName()}: {result}`)
        return nil
    end
    return result
end

function Loader.Register(module: any)
    assert(not _started, "Cannot register after Loader started")
    assert(type(module) == "table", "Module must be a table")
    table.insert(_modules, module)
end

function Loader.LoadDescendants(folder: Instance)
    assert(not _started, "Cannot load after Loader started")
    for _, child in folder:GetDescendants() do
        if child:IsA("ModuleScript") then
            local module = tryRequire(child)
            if type(module) == "table" then
                table.insert(_modules, module)
            end
        end
    end
end

function Loader.Start()
    assert(not _started, "Loader already started")
    _started = true
    for _, module in _modules do
        if type(module.Init) == "function" then
            local ok, err = pcall(module.Init, module)
            if not ok then
                warn(`[Loader] Init failed: {err}`)
            end
        end
    end
    for _, module in _modules do
        if type(module.Start) == "function" then
            task.spawn(function()
                local ok, err = pcall(module.Start, module)
                if not ok then
                    warn(`[Loader] Start failed: {err}`)
                end
            end)
        end
    end
end

return Loader
