#!/bin/bash
# Fix textures to have white RGB with proper alpha
# This makes them work better with texture * color multiplication

cd /home/nikita/projects/nscalc/client/src/mouse/assets

# Backup originals
for img in dot.png footsteps.png footsteps1.png; do
    if [ -f "$img" ]; then
        cp "$img" "${img}.backup"
        # Set RGB to white (255,255,255), keep alpha channel
        magick "$img" -background white -alpha shape "$img"
        echo "Fixed: $img (RGB now white, alpha preserved)"
    fi
done

echo ""
echo "Textures fixed! Regenerate atlas:"
echo "./create_atlas.sh"
