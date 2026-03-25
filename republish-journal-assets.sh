#!/bin/bash

set -euo pipefail

ROOT_DIR=$(dirname "$(readlink -e "${BASH_SOURCE[0]}")")
MEDIA_ROOT="$ROOT_DIR/sample_data/grow_journal_media"
PUBLIC_ROOT="${1:-$ROOT_DIR/new_client/dist}"
ASSET_ROOT="$PUBLIC_ROOT/mock/journal/assets"

copy_asset() {
    local source_path="$1"
    local destination_path="$2"

    rm -f "$destination_path"
    cp "$source_path" "$destination_path"
}

is_image_extension() {
    local path="$1"
    local extension="${path##*.}"
    extension=$(printf '%s' "$extension" | tr '[:upper:]' '[:lower:]')
    case "$extension" in
        jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

if [ ! -d "$MEDIA_ROOT" ]; then
    echo "Missing media root: $MEDIA_ROOT" >&2
    exit 1
fi

rm -rf "$ASSET_ROOT"
mkdir -p "$ASSET_ROOT"

if [ -d "$MEDIA_ROOT/original" ]; then
    while IFS= read -r -d '' asset_dir; do
        asset_id=$(basename "$asset_dir")
        source_file=$(find "$asset_dir" -maxdepth 1 -type f -name 'source.*' | sort | head -n 1)
        if [ -z "$source_file" ]; then
            continue
        fi
        if ! is_image_extension "$source_file"; then
            continue
        fi

        target_dir="$ASSET_ROOT/$asset_id"
        mkdir -p "$target_dir"
        copy_asset "$source_file" "$target_dir/image"
    done < <(find "$MEDIA_ROOT/original" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
fi

if [ -d "$MEDIA_ROOT/processed" ]; then
    while IFS= read -r -d '' asset_dir; do
        asset_id=$(basename "$asset_dir")
        target_dir="$ASSET_ROOT/$asset_id"
        mkdir -p "$target_dir"

        if [ -f "$asset_dir/poster.jpg" ]; then
            copy_asset "$asset_dir/poster.jpg" "$target_dir/poster.jpg"
        fi

        if [ -f "$asset_dir/adaptive.mpd" ]; then
            copy_asset "$asset_dir/adaptive.mpd" "$target_dir/manifest.mpd"
        elif [ -f "$asset_dir/manifest.mpd" ]; then
            copy_asset "$asset_dir/manifest.mpd" "$target_dir/manifest.mpd"
        fi
    done < <(find "$MEDIA_ROOT/processed" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)
fi

echo "Republished journal assets into $ASSET_ROOT"