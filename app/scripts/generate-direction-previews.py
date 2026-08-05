#!/usr/bin/env python3
"""
Generate directional preview images for office agents.

Sprite sheet structure (Limezu Modern Office, 896x656):
- Frame size: 16x32 pixels
- Row 0 (y=0):   BACK  — walk UP, spиною до камери
- Row 1 (y=32):  LEFT  — walk LEFT
- Row 2 (y=64):  RIGHT — walk RIGHT
- Row 6 (y=192): FRONT — walk DOWN, обличчям до камери (confirmed via pixel match)

Output: preview_XX_front.png, preview_XX_back.png, preview_XX_left.png, preview_XX_right.png
Size: 64x128 (4x scale from 16x32)
"""

import sys
from pathlib import Path
from PIL import Image

CHARS_DIR = Path(__file__).parent.parent / "public/assets/office/characters"
PREVIEWS_DIR = CHARS_DIR / "previews"
PREVIEWS_DIR.mkdir(exist_ok=True)

# Row index -> direction name, y offset in sprite sheet
DIRECTIONS = {
    "back":  0,   # row 0, y=0
    "left":  1,   # row 1, y=32
    "right": 2,   # row 2, y=64
    "front": 6,   # row 6, y=192 (confirmed match with existing preview_XX.png)
}

FRAME_W = 16
FRAME_H = 32
SCALE = 4  # output = 64x128

def extract_idle_frame(sheet: Image.Image, row: int) -> Image.Image:
    """Extract the first (idle) frame from the given row."""
    y = row * FRAME_H
    frame = sheet.crop((0, y, FRAME_W, y + FRAME_H))
    return frame.resize((FRAME_W * SCALE, FRAME_H * SCALE), Image.NEAREST)

def process_character(char_path: Path, char_num: str):
    try:
        sheet = Image.open(char_path)
    except Exception as e:
        print(f"  ERROR loading {char_path.name}: {e}")
        return

    w, h = sheet.size
    if w < FRAME_W or h < FRAME_H * 7:
        print(f"  SKIP {char_path.name}: sheet too small ({w}x{h})")
        return

    for direction, row in DIRECTIONS.items():
        frame = extract_idle_frame(sheet, row)
        out_path = PREVIEWS_DIR / f"preview_{char_num}_{direction}.png"
        frame.save(out_path)

    print(f"  OK: {char_path.name} -> preview_{char_num}_{{front,back,left,right}}.png")

def main():
    char_files = sorted(CHARS_DIR.glob("Premade_Character_*.png"))
    if not char_files:
        print(f"No Premade_Character_*.png found in {CHARS_DIR}")
        sys.exit(1)

    print(f"Processing {len(char_files)} characters...")
    for char_path in char_files:
        # Extract two-digit number: "Premade_Character_01.png" -> "01"
        stem = char_path.stem  # "Premade_Character_01"
        num = stem.split("_")[-1]  # "01"
        process_character(char_path, num)

    print(f"\nDone. Output: {PREVIEWS_DIR}")

if __name__ == "__main__":
    main()
