# Jetstream Reels

Jetstream lets us show MP4/GIF-style content in Roblox without using Roblox `VideoFrame` uploads. It converts a video into image frames, uploads those frames through Roblox Open Cloud, and generates a Luau module that returns the frame asset IDs.

Official references:

- Jetstream: https://github.com/imacodr/Jetstream
- Roblox API keys: https://create.roblox.com/docs/cloud/auth/api-keys
- Roblox Assets API: https://create.roblox.com/docs/cloud/guides/usage-assets

## 1. Installed Tool

Jetstream is already installed on this PC with:

```powershell
pip install --user jetstreamcli
```

Because Windows did not add the Python scripts folder to PATH, use our wrapper scripts from the project root.

## 2. Create a Roblox Open Cloud API Key

Go to Roblox Creator Dashboard:

```text
https://create.roblox.com/dashboard/credentials
```

Create an API key with:

- Assets access permission.
- Read and Write operations.
- The creator that will own the uploaded frame images: your user or your group.
- Optional: restrict the key to your current IP for better security.

Copy the key once and keep it private. Do not paste it into source files or chat.

You also need the uploader ID:

- User upload: your Roblox user ID from `https://www.roblox.com/users/YOUR_ID/profile`.
- Group upload: your Roblox group ID from `https://www.roblox.com/groups/GROUP_ID/...`.

## 3. Configure Jetstream

Run this from the project root:

```powershell
.\scripts\jetstream-configure.ps1 -ApiKey "PASTE_ROBLOX_OPEN_CLOUD_KEY_HERE" -UploaderId "YOUR_USER_OR_GROUP_ID" -Test
```

Jetstream stores this locally in:

```text
C:\Users\Thiago-PC\.jetstream\config.json
```

That file is outside the repo.

## 4. Prepare the TikTok Videos

Put a video you are allowed to use in:

```text
assets\TikTokVideos\
```

Recommended first test:

- 5 to 10 seconds.
- Vertical 9:16.
- 10 to 12 FPS.
- 360p to 540p width.

Low FPS and small resolution matter because every frame becomes a Roblox image.

## 5. Import One Video

Example:

```powershell
.\scripts\jetstream-convert-and-import.ps1 -Name "TikTokReel01" -Input ".\assets\TikTokVideos\1-TikTok video #76720243834471908157672024383447190815.mp4" -Fps 12 -Big $true
```

Jetstream will:

1. Extract frames.
2. Upload frame images to Roblox.
3. Convert decal IDs to image IDs.
4. Generate a Luau file.
5. Copy the generated module into `src\ReplicatedStorage\Shared\Modules\JetstreamVideos\`.
6. Refresh `src\ReplicatedStorage\Shared\Modules\JetstreamReelsCatalog.luau`.

## 6. Import the TikTokVideos Folder in Batch

Use this dry run first to preview the file order and generated module names:

```powershell
.\scripts\jetstream-import-tiktok-videos.ps1 -WhatIfOnly
```

Import only the first video:

```powershell
.\scripts\jetstream-import-tiktok-videos.ps1 -Limit 1
```

Import every video from `assets\TikTokVideos\`:

```powershell
.\scripts\jetstream-import-tiktok-videos.ps1
```

Useful options:

```powershell
.\scripts\jetstream-import-tiktok-videos.ps1 -StartAt 10 -Limit 5 -SkipExisting
```

Current recommended command for this project:

```powershell
.\scripts\jetstream-import-tiktok-videos.ps1 -NamePrefix TikTokTest -Fps 6 -Big $false -SkipExisting
```

To add more videos later, drop new `.mp4` files into:

```text
assets\TikTokVideos\
```

Then run the recommended command again. Already imported modules are skipped,
and new modules are added to:

```text
src\ReplicatedStorage\Shared\Modules\JetstreamVideos\
```

The catalog is regenerated automatically:

```text
src\ReplicatedStorage\Shared\Modules\JetstreamReelsCatalog.luau
```

The batch script names the modules `TikTokReel01`, `TikTokReel02`,
`TikTokReel03`, and so on. After each import, it refreshes the catalog that the
HUD reels and `Workspace.VideoReel` display use.

Builds live in:

```text
C:\Users\Thiago-PC\.jetstream\projects\
```

List builds:

```powershell
.\scripts\jetstream-projects.ps1
```

If a build stops in the middle, resume with:

```powershell
$env:PYTHONUTF8="1"
& "$env:APPDATA\Python\Python314\Scripts\jetstream.exe" builds
```

## 7. Add the Generated Video to the Game

The import script copies the generated `.luau` file into:

```text
src\ReplicatedStorage\Shared\Modules\JetstreamVideos\
```

The generated module looks like:

```lua
return {
    [0] = "rbxassetid://...",
    [1] = "rbxassetid://...",
}
```

The catalog used by the game is:

```text
src\ReplicatedStorage\Shared\Modules\JetstreamReelsCatalog.luau
```

Our frame player module is:

```text
src\ReplicatedStorage\Shared\Modules\JetstreamFramePlayer.luau
```

The in-game UI controller is:

```text
src\StarterPlayerScripts\Controllers\JetstreamReelsController.luau
```

The 3D part display controller is:

```text
src\StarterPlayerScripts\Controllers\VideoReelDisplayController.luau
```

Basic usage in a LocalScript:

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Modules = ReplicatedStorage.Shared.Modules
local JetstreamFramePlayer = require(Modules.JetstreamFramePlayer)
local Frames = require(Modules.JetstreamVideos.NatureSeal01)

JetstreamFramePlayer.Play(Frames, imageLabel, 12, true)
```

`imageLabel` can be inside a `SurfaceGui` on a 3D screen/esteira, or inside a normal `ScreenGui`.

## Notes

- This is not streaming from TikTok. It is frame playback using Roblox image assets.
- Use videos you created, licensed, or have permission to use.
- For a TikTok-style UI, we can overlay like/comment/share icons and counters separately.
