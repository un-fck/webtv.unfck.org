#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["huggingface_hub", "python-dotenv"]
# ///
"""
Push eval/dashboard to HuggingFace Spaces.

Usage:
  uv run eval/hf/push-dashboard.py
  uv run eval/hf/push-dashboard.py --dry-run
"""
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi, create_repo
from dotenv import load_dotenv

load_dotenv()

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_REPO = "united-nations/transcription-benchmark"
DASHBOARD_DIR = Path(__file__).parent.parent / "dashboard"
DRY_RUN = "--dry-run" in sys.argv

IGNORE = {".git", "node_modules", "dist", ".vite"}


def main():
    if not DRY_RUN and not HF_TOKEN:
        print("ERROR: HF_TOKEN not set")
        sys.exit(1)

    # Collect files to upload
    files = []
    for path in sorted(DASHBOARD_DIR.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(DASHBOARD_DIR)
        if any(part in IGNORE for part in rel.parts):
            continue
        files.append((path, str(rel)))

    print(f"Found {len(files)} files to upload")
    for _, rel in files:
        print(f"  {rel}")

    if DRY_RUN:
        print("\nDry run, not uploading.")
        return

    api = HfApi(token=HF_TOKEN)
    create_repo(HF_REPO, repo_type="space", space_sdk="docker", token=HF_TOKEN, exist_ok=True)

    api.upload_folder(
        folder_path=str(DASHBOARD_DIR),
        repo_id=HF_REPO,
        repo_type="space",
        ignore_patterns=list(IGNORE),
        commit_message="Update dashboard",
    )

    print(f"\nDone! https://huggingface.co/spaces/{HF_REPO}")


if __name__ == "__main__":
    main()
