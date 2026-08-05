"""Shared pytest setup — ensures the parent package is importable.

Run from the scrubber/ directory: `python3 -m pytest tests/ -v`.
The scrubber package lives in the parent of this tests/ folder.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG_ROOT = HERE.parent  # .../mempalace/scrubber
MEMPALACE_DIR = PKG_ROOT.parent  # .../mempalace

# Allow `from scrubber import ...` by inserting mempalace/ on sys.path.
if str(MEMPALACE_DIR) not in sys.path:
    sys.path.insert(0, str(MEMPALACE_DIR))
