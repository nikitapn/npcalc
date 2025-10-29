#!/bin/bash
# Generic texture atlas creator using ImageMagick
# Automatically packs all PNG files in the current directory

set -e

# Configuration
ATLAS="atlas.png"
JSON="atlas.json"
MODE="${1:-auto}"  # auto, horizontal, grid, resize

# Check if ImageMagick is installed
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
    IDENTIFY_CMD="magick identify"
elif command -v convert &> /dev/null; then
    CONVERT_CMD="convert"
    IDENTIFY_CMD="identify"
else
    echo "ImageMagick not found. Install with:"
    echo "  Ubuntu/Debian: sudo apt install imagemagick"
    echo "  Arch: sudo pacman -S imagemagick"
    echo "  macOS: brew install imagemagick"
    exit 1
fi

# Find all PNG files except the atlas itself, sorted alphabetically
mapfile -t IMAGES < <(find . -maxdepth 1 -name "*.png" ! -name "$ATLAS" -type f | sort | sed 's|^\./||')

# Check if we have any images
if [ ${#IMAGES[@]} -eq 0 ]; then
    echo "Error: No PNG files found in current directory"
    exit 1
fi

echo "Found ${#IMAGES[@]} images to pack:"

# Analyze dimensions
max_width=0
max_height=0
total_area=0
all_same_size=true
first_size=""

for img in "${IMAGES[@]}"; do
    dimensions=$($IDENTIFY_CMD -format "%w %h" "$img")
    read width height <<< "$dimensions"
    
    echo "  - $img: ${width}x${height}"
    
    if [ -z "$first_size" ]; then
        first_size="${width}x${height}"
    elif [ "$first_size" != "${width}x${height}" ]; then
        all_same_size=false
    fi
    
    if [ $width -gt $max_width ]; then max_width=$width; fi
    if [ $height -gt $max_height ]; then max_height=$height; fi
    total_area=$((total_area + width * height))
done

echo ""
echo "Analysis:"
echo "  Max dimensions: ${max_width}x${max_height}"
echo "  All same size: $all_same_size"
echo "  Total pixel area: $total_area"

# Auto mode: decide layout based on dimensions
if [ "$MODE" = "auto" ]; then
    if [ "$all_same_size" = true ]; then
        MODE="horizontal"
        echo "  → Using horizontal layout (all images same size)"
    else
        echo ""
        echo "Warning: Images have different dimensions!"
        echo "Options:"
        echo "  1) horizontal - Pack as-is (creates tall atlas with wasted space)"
        echo "  2) resize     - Resize all to ${max_height}x${max_height} (recommended)"
        echo "  3) grid       - Pack in grid (experimental)"
        echo ""
        read -p "Choose mode [1/2/3] (default: 2): " choice
        case $choice in
            1) MODE="horizontal" ;;
            3) MODE="grid" ;;
            *) MODE="resize" ;;
        esac
    fi
fi

echo ""

# Create atlas based on mode
if [ "$MODE" = "resize" ]; then
    echo "Creating atlas with resized images (${max_height}x${max_height})..."
    
    # Create temporary resized images
    TEMP_DIR=$(mktemp -d)
    RESIZED_IMAGES=()
    
    for img in "${IMAGES[@]}"; do
        temp_img="$TEMP_DIR/$(basename "$img")"
        # Resize maintaining aspect ratio, pad with transparency
        $CONVERT_CMD "$img" -resize ${max_height}x${max_height} -background none -gravity center -extent ${max_height}x${max_height} "$temp_img"
        RESIZED_IMAGES+=("$temp_img")
    done
    
    # Create horizontal atlas from resized images
    $CONVERT_CMD "${RESIZED_IMAGES[@]}" +append "$ATLAS"
    
    # Clean up
    rm -rf "$TEMP_DIR"
    
    # Calculate atlas dimensions
    atlas_width=$((${#IMAGES[@]} * max_height))
    atlas_height=$max_height
    
    echo "Atlas created: $ATLAS (${atlas_width}x${atlas_height})"
    
    # Generate JSON
    echo "{" > "$JSON"
    echo "  \"atlas\": \"$ATLAS\"," >> "$JSON"
    echo "  \"width\": $atlas_width," >> "$JSON"
    echo "  \"height\": $atlas_height," >> "$JSON"
    echo "  \"textures\": {" >> "$JSON"
    
    current_x=0
    for i in "${!IMAGES[@]}"; do
        img="${IMAGES[$i]}"
        texture_name="${img%.png}"
        
        # Get original dimensions
        dimensions=$($IDENTIFY_CMD -format "%w %h" "$img")
        read orig_width orig_height <<< "$dimensions"
        
        # Calculate padding for centered image
        pad_x=$(( (max_height - orig_width) / 2 ))
        pad_y=$(( (max_height - orig_height) / 2 ))
        
        # UV coordinates for the cell
        u1=$(echo "scale=6; $current_x / $atlas_width" | bc)
        u2=$(echo "scale=6; ($current_x + $max_height) / $atlas_width" | bc)
        if [[ $u1 == .* ]]; then u1="0$u1"; fi
        if [[ $u2 == .* ]]; then u2="0$u2"; fi
        
        # UV coordinates for actual image within the cell (accounting for padding)
        cell_u1=$(echo "scale=6; ($current_x + $pad_x) / $atlas_width" | bc)
        cell_v1=$(echo "scale=6; $pad_y / $atlas_height" | bc)
        cell_u2=$(echo "scale=6; ($current_x + $pad_x + $orig_width) / $atlas_width" | bc)
        cell_v2=$(echo "scale=6; ($pad_y + $orig_height) / $atlas_height" | bc)
        if [[ $cell_u1 == .* ]]; then cell_u1="0$cell_u1"; fi
        if [[ $cell_v1 == .* ]]; then cell_v1="0$cell_v1"; fi
        if [[ $cell_u2 == .* ]]; then cell_u2="0$cell_u2"; fi
        if [[ $cell_v2 == .* ]]; then cell_v2="0$cell_v2"; fi
        
        if [ $i -gt 0 ]; then echo "," >> "$JSON"; fi
        
        echo "    \"$texture_name\": {" >> "$JSON"
        echo "      \"x\": $current_x," >> "$JSON"
        echo "      \"y\": 0," >> "$JSON"
        echo "      \"width\": $max_height," >> "$JSON"
        echo "      \"height\": $max_height," >> "$JSON"
        echo "      \"originalWidth\": $orig_width," >> "$JSON"
        echo "      \"originalHeight\": $orig_height," >> "$JSON"
        echo "      \"uv\": {" >> "$JSON"
        echo "        \"u1\": $cell_u1," >> "$JSON"
        echo "        \"v1\": $cell_v1," >> "$JSON"
        echo "        \"u2\": $cell_u2," >> "$JSON"
        echo "        \"v2\": $cell_v2" >> "$JSON"
        echo "      }" >> "$JSON"
        echo -n "    }" >> "$JSON"
        
        current_x=$((current_x + max_height))
    done
    
    echo "" >> "$JSON"
    echo "  }" >> "$JSON"
    echo "}" >> "$JSON"

elif [ "$MODE" = "horizontal" ]; then
    echo "Creating horizontal atlas (as-is)..."
    
    $CONVERT_CMD "${IMAGES[@]}" +append "$ATLAS"
    
    atlas_width=$($IDENTIFY_CMD -format "%w" "$ATLAS")
    atlas_height=$($IDENTIFY_CMD -format "%h" "$ATLAS")
    
    echo "Atlas created: $ATLAS (${atlas_width}x${atlas_height})"
    
    # Generate JSON
    echo "{" > "$JSON"
    echo "  \"atlas\": \"$ATLAS\"," >> "$JSON"
    echo "  \"width\": $atlas_width," >> "$JSON"
    echo "  \"height\": $atlas_height," >> "$JSON"
    echo "  \"textures\": {" >> "$JSON"
    
    current_x=0
    for i in "${!IMAGES[@]}"; do
        img="${IMAGES[$i]}"
        texture_name="${img%.png}"
        
        dimensions=$($IDENTIFY_CMD -format "%w %h" "$img")
        read width height <<< "$dimensions"
        
        u1=$(echo "scale=6; $current_x / $atlas_width" | bc)
        u2=$(echo "scale=6; ($current_x + $width) / $atlas_width" | bc)
        if [[ $u1 == .* ]]; then u1="0$u1"; fi
        if [[ $u2 == .* ]]; then u2="0$u2"; fi
        
        if [ $i -gt 0 ]; then echo "," >> "$JSON"; fi
        
        echo "    \"$texture_name\": {" >> "$JSON"
        echo "      \"x\": $current_x," >> "$JSON"
        echo "      \"y\": 0," >> "$JSON"
        echo "      \"width\": $width," >> "$JSON"
        echo "      \"height\": $height," >> "$JSON"
        echo "      \"uv\": {" >> "$JSON"
        echo "        \"u1\": $u1," >> "$JSON"
        echo "        \"v1\": 0.0," >> "$JSON"
        echo "        \"u2\": $u2," >> "$JSON"
        echo "        \"v2\": 1.0" >> "$JSON"
        echo "      }" >> "$JSON"
        echo -n "    }" >> "$JSON"
        
        current_x=$((current_x + width))
    done
    
    echo "" >> "$JSON"
    echo "  }" >> "$JSON"
    echo "}" >> "$JSON"

else
    echo "Error: Mode '$MODE' not implemented yet"
    exit 1
fi

# Display UV info
echo ""
echo "UV Coordinates:"
echo "================================"
cat "$JSON" | grep -A 1 "\"uv\":" | grep -E "(u1|u2|v1|v2)" | head -n 20

echo ""
echo "JSON mapping saved to: $JSON"
echo "Done!"
