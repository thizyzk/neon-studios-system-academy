import argparse
import hashlib
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from jetstreamcli.config import load_config
from PIL import Image, ImageOps
from rblxopencloud import AssetType, Group, User


def parse_args():
    parser = argparse.ArgumentParser(description="Fast Jetstream frame uploader using Open Cloud Image assets.")
    parser.add_argument("--name", required=True)
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--individual-frames", action="store_true")
    parser.add_argument("--sprite-width", type=int, default=256)
    parser.add_argument("--sprite-height", type=int, default=455)
    parser.add_argument("--sprite-columns", type=int, default=4)
    parser.add_argument("--sprite-rows", type=int, default=2)
    parser.add_argument("--jpeg-quality", type=int, default=82)
    return parser.parse_args()


def frame_number(path):
    match = re.search(r"(\d+)", path.stem)
    return int(match.group(1)) if match else 0


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cache(path):
    if not path.exists():
        return {"version": 1, "items": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path, cache):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def make_creator():
    config = load_config()
    key = config.get("robloxKey")
    uploader = config.get("uploader")
    is_group = config.get("groupKey")

    if not key or uploader is None:
        raise RuntimeError("Jetstream Roblox key/uploader is not configured.")

    return Group(uploader, key) if is_group else User(uploader, key)


def upload_image(name, path, attempt_count=6):
    for attempt in range(1, attempt_count + 1):
        try:
            creator = make_creator()
            with path.open("rb") as file:
                operation = creator.upload_asset(
                    file,
                    AssetType.Image,
                    name,
                    "Uploaded by Jetstream fast image pipeline",
                )
            asset = operation.wait()
            return str(asset.id)
        except Exception as exc:
            if attempt == attempt_count:
                raise
            delay = min(60, 2 ** attempt)
            print(f"Retrying {path.name} after error: {exc}. Waiting {delay}s.", flush=True)
            time.sleep(delay)


def write_luau(output, project_name, ids):
    lines = [
        "--[[",
        "Jetstream Video",
        f"Project: {project_name}",
        "Uploaded as direct Image assets by the fast pipeline",
        "]]--",
        "",
        "return {",
    ]

    for index, asset_id in enumerate(ids):
        lines.append(f'\t[{index}] = "rbxassetid://{asset_id}",')

    lines.append("}")
    lines.append("")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")


def write_sprite_luau(output, project_name, ids, frame_count, width, height, columns, rows):
    lines = [
        "--[[",
        "Jetstream Video",
        f"Project: {project_name}",
        "Uploaded as compact sprite sheet Image assets",
        "]]--",
        "",
        "return {",
        '\tFormat = "SpriteSheet",',
        f"\tFrameCount = {frame_count},",
        f"\tFrameWidth = {width},",
        f"\tFrameHeight = {height},",
        f"\tColumns = {columns},",
        f"\tRows = {rows},",
        "\tSheets = {",
    ]

    for asset_id in ids:
        lines.append(f'\t\t"rbxassetid://{asset_id}",')

    lines.extend(["\t},", "}", ""])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")


def create_sprite_sheets(frames, output_dir, width, height, columns, rows, quality):
    output_dir.mkdir(parents=True, exist_ok=True)
    frames_per_sheet = columns * rows
    sheets = []

    for sheet_index in range(0, len(frames), frames_per_sheet):
        chunk = frames[sheet_index : sheet_index + frames_per_sheet]
        sheet = Image.new("RGB", (width * columns, height * rows), (0, 0, 0))

        for cell_index, frame_path in enumerate(chunk):
            with Image.open(frame_path) as source:
                fitted = ImageOps.fit(
                    source.convert("RGB"),
                    (width, height),
                    method=Image.Resampling.LANCZOS,
                )
                x = (cell_index % columns) * width
                y = (cell_index // columns) * height
                sheet.paste(fitted, (x, y))

        sheet_path = output_dir / f"sheet{len(sheets) + 1:06d}.jpg"
        sheet.save(sheet_path, "JPEG", quality=max(45, min(95, quality)), optimize=True)
        sheets.append(sheet_path)

    return sheets


def main():
    args = parse_args()
    frames_dir = Path(args.frames_dir)
    output = Path(args.output)
    cache_path = Path(args.cache)
    workers = max(1, args.workers)

    frames = sorted(frames_dir.glob("frame*.png"), key=frame_number)
    if args.limit > 0:
        frames = frames[: args.limit]

    if not frames:
        raise SystemExit(f"No frames found in {frames_dir}")

    source_frame_count = len(frames)
    use_sprite_sheets = not args.individual_frames
    if use_sprite_sheets:
        frames = create_sprite_sheets(
            frames,
            frames_dir / "sprite_sheets",
            max(32, args.sprite_width),
            max(32, args.sprite_height),
            max(1, args.sprite_columns),
            max(1, args.sprite_rows),
            args.jpeg_quality,
        )
        print(
            f"Packed {source_frame_count} frames into {len(frames)} sprite sheets.",
            flush=True,
        )

    cache = load_cache(cache_path)
    items = cache.setdefault("items", {})
    lock = threading.Lock()

    print(f"Found {len(frames)} frames.", flush=True)
    frame_hashes = [sha256_file(path) for path in frames]
    unique_hashes = []
    unique_paths = {}

    for path, digest in zip(frames, frame_hashes):
        if digest not in unique_paths:
            unique_paths[digest] = path
            unique_hashes.append(digest)

    pending = [digest for digest in unique_hashes if digest not in items]
    print(f"Unique frames: {len(unique_hashes)}. Cached: {len(unique_hashes) - len(pending)}. Uploading: {len(pending)}.", flush=True)

    def upload_digest(digest):
        path = unique_paths[digest]
        asset_id = upload_image(f"{args.name}_{path.stem}", path)
        with lock:
            items[digest] = {
                "assetId": asset_id,
                "uploadedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": path.name,
            }
            save_cache(cache_path, cache)
        return path.name, asset_id

    if pending:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(upload_digest, digest) for digest in pending]
            completed = 0
            for future in as_completed(futures):
                name, asset_id = future.result()
                completed += 1
                print(f"[{completed}/{len(pending)}] {name} -> {asset_id}", flush=True)

    ids = [items[digest]["assetId"] for digest in frame_hashes]
    if use_sprite_sheets:
        write_sprite_luau(
            output,
            args.name,
            ids,
            source_frame_count,
            max(32, args.sprite_width),
            max(32, args.sprite_height),
            max(1, args.sprite_columns),
            max(1, args.sprite_rows),
        )
        print(f"Wrote {source_frame_count} frames across {len(ids)} sheets to {output}", flush=True)
    else:
        write_luau(output, args.name, ids)
        print(f"Wrote {len(ids)} frames to {output}", flush=True)


if __name__ == "__main__":
    main()
