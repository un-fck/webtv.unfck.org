#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyarrow", "huggingface_hub", "python-dotenv", "requests"]
# ///
"""
Migrate gadebate Parquet files from embedded audio bytes to external MP3 files + URL strings.

Reads each old Parquet shard from HF, extracts audio bytes to MP3 files,
uploads them, then writes a new slim Parquet with URL strings.

Usage:
  uv run eval/hf/migrate-gadebate.py
  uv run eval/hf/migrate-gadebate.py --dry-run
"""
import io
import os
import sys
import time
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import requests
from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi
from dotenv import load_dotenv

load_dotenv()

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_REPO = "united-nations/transcription-corpus"
DRY_RUN = "--dry-run" in sys.argv
AUDIO_COLS = ["audio_floor", "audio_en", "audio_fr", "audio_es", "audio_ar", "audio_zh", "audio_ru"]

NEW_SCHEMA = pa.schema([
    pa.field("session", pa.int32()),
    pa.field("year", pa.int32()),
    pa.field("country_iso", pa.string()),
    pa.field("country_name", pa.string()),
    pa.field("original_lang", pa.string()),
    pa.field("speech_date", pa.string()),
    pa.field("audio_floor", pa.string()),
    pa.field("audio_en", pa.string()),
    pa.field("audio_fr", pa.string()),
    pa.field("audio_es", pa.string()),
    pa.field("audio_ar", pa.string()),
    pa.field("audio_zh", pa.string()),
    pa.field("audio_ru", pa.string()),
    pa.field("orig_lang_text", pa.string()),
])

TMP_DIR = Path("/tmp/gadebate-migrate")
TMP_DIR.mkdir(exist_ok=True)


def commit_with_retry(api: HfApi, operations: list, commit_message: str, retries: int = 5) -> None:
    for attempt in range(retries):
        try:
            api.create_commit(
                repo_id=HF_REPO,
                repo_type="dataset",
                operations=operations,
                commit_message=commit_message,
            )
            return
        except Exception as e:
            if attempt < retries - 1 and any(code in str(e) for code in ("503", "502", "429")):
                wait = 2 ** (attempt + 1)
                print(f"\n    Retry {attempt+1}/{retries} after {wait}s: {e}")
                time.sleep(wait)
            else:
                raise


def migrate_shard(shard_name: str, api: HfApi | None) -> None:
    """Download one old Parquet shard, extract audio, upload new format."""
    print(f"\n=== {shard_name} ===")
    shard_url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/data/gadebate/{shard_name}"

    # Download old Parquet
    print(f"  Downloading {shard_name}...", end=" ", flush=True)
    resp = requests.get(shard_url, timeout=300)
    resp.raise_for_status()
    print(f"{len(resp.content) / 1024 / 1024:.0f} MB")

    old_table = pq.read_table(io.BytesIO(resp.content))
    print(f"  {old_table.num_rows} rows")

    if DRY_RUN:
        for i in range(old_table.num_rows):
            iso = old_table.column("country_iso")[i].as_py()
            session = old_table.column("session")[i].as_py()
            print(f"    [{i+1}] session={session} iso={iso}")
        return

    operations: list[CommitOperationAdd] = []
    new_cols: dict[str, list] = {name: [] for name in NEW_SCHEMA.names}

    for i in range(old_table.num_rows):
        row_data = {col: old_table.column(col)[i].as_py() for col in old_table.column_names}
        session = row_data["session"]
        iso = row_data["country_iso"]
        print(f"  [{i+1}/{old_table.num_rows}] {session}_{iso}", end=" ", flush=True)

        # Copy non-audio columns
        for col in ["session", "year", "country_iso", "country_name", "original_lang", "speech_date", "orig_lang_text"]:
            new_cols[col].append(row_data[col])

        # Extract audio bytes, save as MP3, build URL
        for audio_col in AUDIO_COLS:
            val = row_data.get(audio_col)
            if val and isinstance(val, dict) and val.get("bytes"):
                audio_bytes = val["bytes"]
                # Derive lang code from column name
                if audio_col == "audio_floor":
                    lang_code = "FL"
                else:
                    lang_code = audio_col.replace("audio_", "").upper()
                filename = f"{session}_{iso}_{lang_code}.mp3"
                hf_path = f"data/gadebate/audio/{filename}"

                # Save locally
                local_path = TMP_DIR / filename
                local_path.write_bytes(audio_bytes)
                operations.append(CommitOperationAdd(path_in_repo=hf_path, path_or_fileobj=str(local_path)))

                url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/{hf_path}"
                new_cols[audio_col].append(url)
                print(".", end="", flush=True)
            else:
                new_cols[audio_col].append(None)
                print("x", end="", flush=True)
        print()

    # Build new slim Parquet
    new_table = pa.table(new_cols, schema=NEW_SCHEMA)
    # Use same shard name
    new_parquet_path = TMP_DIR / shard_name
    pq.write_table(new_table, new_parquet_path)
    operations.append(CommitOperationAdd(
        path_in_repo=f"data/gadebate/{shard_name}",
        path_or_fileobj=str(new_parquet_path),
    ))

    size_mb = sum(Path(op.path_or_fileobj).stat().st_size for op in operations) / 1024 / 1024
    print(f"  {len(operations)} files, {size_mb:.0f} MB → uploading...", end=" ", flush=True)

    if api:
        commit_with_retry(api, operations, f"Migrate {shard_name}: extract audio to separate files")
        print("done!")
    else:
        print("(no token)")

    # Cleanup temp files
    for f in TMP_DIR.iterdir():
        f.unlink()


def main():
    if not HF_TOKEN:
        print("ERROR: HF_TOKEN not set"); sys.exit(1)

    api = HfApi(token=HF_TOKEN)

    # List existing Parquet shards with their sizes
    files = list(api.list_repo_tree(HF_REPO, repo_type="dataset", path_in_repo="data/gadebate"))
    shard_sizes = {}
    for f in files:
        if hasattr(f, "size") and f.path.endswith(".parquet"):
            name = f.path.split("/")[-1]
            shard_sizes[name] = f.size
    shards = sorted(shard_sizes.keys())
    print(f"Found {len(shards)} shards")

    # Skip already-migrated shards (small Parquet = URLs only, large = embedded bytes)
    to_migrate = []
    for name in shards:
        size_mb = shard_sizes[name] / 1024 / 1024
        if size_mb > 1:  # Embedded-bytes shards are 300+ MB; migrated ones are < 1 MB
            to_migrate.append(name)
        else:
            print(f"  {name}: {size_mb:.1f} MB — already migrated, skipping")
    print(f"{len(to_migrate)} shards to migrate, {len(shards) - len(to_migrate)} already done")

    for shard in to_migrate:
        migrate_shard(shard, api)

    print(f"\nDone! Migrated {len(shards)} shards.")
    print(f"https://huggingface.co/datasets/{HF_REPO}")


if __name__ == "__main__":
    main()
