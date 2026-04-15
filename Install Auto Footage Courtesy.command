#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_ROOT=""

if [ -f "$SCRIPT_DIR/CSXS/manifest.xml" ]; then
    SOURCE_ROOT="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/Auto Footage Courtesy Extension/CSXS/manifest.xml" ]; then
    SOURCE_ROOT="$SCRIPT_DIR/Auto Footage Courtesy Extension"
else
    echo "Could not find the Auto Footage Courtesy extension files."
    echo "Keep this installer next to the flat extension files or next to the Auto Footage Courtesy Extension folder."
    read -r -p "Press Return to close..."
    exit 1
fi

TARGET_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET_DIR="$TARGET_ROOT/Auto Footage Courtesy"

echo "Installing Auto Footage Courtesy for macOS..."
echo "Source: $SOURCE_ROOT"
echo "Target: $TARGET_DIR"
echo

mkdir -p "$TARGET_ROOT"

if [ -d "$TARGET_DIR" ]; then
    echo "Clearing current install: $TARGET_DIR"
    rm -rf "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR"

copy_required_item() {
    local item_name="$1"
    local source_path="$SOURCE_ROOT/$item_name"
    local target_path="$TARGET_DIR/$item_name"

    if [ ! -e "$source_path" ]; then
        echo "Missing required item: $source_path"
        exit 1
    fi

    cp -R "$source_path" "$target_path"
    echo "Copied: $item_name"
}

copy_required_item "CSXS"
copy_required_item "js"
copy_required_item "jsx"
copy_required_item "index.html"

echo
echo "Enabling CEP debug mode for this macOS user..."
for csxs_version in 11 12 13 14 15; do
    defaults write "com.adobe.CSXS.$csxs_version" PlayerDebugMode 1
    echo "Enabled: com.adobe.CSXS.$csxs_version PlayerDebugMode=1"
done

echo
echo "Install complete."
echo "Restart Premiere Pro, then open:"
echo "Window > Extensions > Auto Footage Courtesy"
echo
read -r -p "Press Return to close..."
