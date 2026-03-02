#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyarrow", "huggingface_hub", "python-dotenv"]
# ///
"""
Push the UN transcription corpus (split 2: whole sessions) to HuggingFace.

Orchestrates per-session pipeline: download audio (TypeScript) → build Parquet → upload → delete audio.
Peak disk usage: ~1 session's audio + Parquet at a time.

Usage:
  uv run eval/hf/push-corpus.py           # all sessions in sessions.json
  uv run eval/hf/push-corpus.py --dry-run
  uv run eval/hf/push-corpus.py --symbol=S/PV.9826
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from huggingface_hub import HfApi, create_repo
from dotenv import load_dotenv

load_dotenv()

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_REPO = "united-nations/transcription-corpus"
CORPUS_DIR = Path(__file__).parent.parent / "corpus-data"
AUDIO_DIR = CORPUS_DIR / "audio"
METADATA_PATH = CORPUS_DIR / "metadata.jsonl"
DRY_RUN = "--dry-run" in sys.argv
SYMBOL_ARG = next((a.replace("--symbol=", "") for a in sys.argv if a.startswith("--symbol=")), None)

REPO_ROOT = Path(__file__).parent.parent.parent
SESSIONS_PATH = Path(__file__).parent.parent / "corpus" / "sessions.json"

LANGS = ["en", "fr", "es", "ar", "zh", "ru"]

AUDIO_TYPE = pa.struct([pa.field("path", pa.string()), pa.field("bytes", pa.large_binary())])

SCHEMA = pa.schema([
    pa.field("symbol", pa.string()),
    pa.field("webtv_url", pa.string()),
    pa.field("duration_ms", pa.int64()),
    pa.field("num_speakers", pa.int64()),
    pa.field("audio_floor", AUDIO_TYPE),
    *[pa.field(f"audio_{lang}", AUDIO_TYPE) for lang in LANGS],
    *[pa.field(f"pv_{lang}", pa.string()) for lang in LANGS],
])

README = """---
license: cc-by-4.0
task_categories:
- automatic-speech-recognition
- translation
language:
- en
- fr
- es
- ar
- zh
- ru
tags:
- multilingual
- speech
- united-nations
- verbatim-records
- security-council
- general-assembly
pretty_name: UN Transcription Corpus
size_categories:
- 1K<n<10K
configs:
- config_name: sessions
  data_files:
  - split: train
    path: data/sessions/*.parquet
  features:
  - name: symbol
    dtype: string
  - name: webtv_url
    dtype: string
  - name: duration_ms
    dtype: int64
  - name: num_speakers
    dtype: int64
  - name: audio_floor
    dtype: audio
  - name: audio_en
    dtype: audio
  - name: audio_fr
    dtype: audio
  - name: audio_es
    dtype: audio
  - name: audio_ar
    dtype: audio
  - name: audio_zh
    dtype: audio
  - name: audio_ru
    dtype: audio
  - name: pv_en
    dtype: string
  - name: pv_fr
    dtype: string
  - name: pv_es
    dtype: string
  - name: pv_ar
    dtype: string
  - name: pv_zh
    dtype: string
  - name: pv_ru
    dtype: string
- config_name: gadebate
  data_files:
  - split: train
    path: data/gadebate/*.parquet
  features:
  - name: session
    dtype: int32
  - name: year
    dtype: int32
  - name: country_iso
    dtype: string
  - name: country_name
    dtype: string
  - name: original_lang
    dtype: string
  - name: speech_date
    dtype: string
  - name: audio_floor
    dtype: audio
  - name: audio_en
    dtype: audio
  - name: audio_fr
    dtype: audio
  - name: audio_es
    dtype: audio
  - name: audio_ar
    dtype: audio
  - name: audio_zh
    dtype: audio
  - name: audio_ru
    dtype: audio
  - name: orig_lang_text
    dtype: string
---

# UN Transcription Corpus

Two splits of UN meeting audio paired with official verbatim records.

## Splits

### `sessions` — Whole meeting sessions (SC + GA plenary)

One row per meeting. Audio from [UN Web TV](https://webtv.un.org), verbatim records from [documents.un.org](https://documents.un.org).

| Column | Description |
|---|---|
| `symbol` | UN document symbol, e.g. `S/PV.9826` |
| `webtv_url` | URL on UN Web TV |
| `duration_ms` | Session duration in milliseconds |
| `num_speakers` | Number of speaker turns in the verbatim record |
| `audio_floor` | Floor audio (MP3) |
| `audio_{lang}` | Simultaneous interpretation per UN language (null if unavailable) |
| `pv_{lang}` | Official verbatim record text per language (null if unavailable) |

Bodies covered: Security Council (`S/PV.*`), General Assembly plenary (`A/{n}/PV.*`)

### `gadebate` — GA General Debate speeches

One row per country speech in the [General Debate](https://gadebate.un.org). Audio from [UN Radio](https://media.un.org).

| Column | Description |
|---|---|
| `session` | GA session number (70=2015 … 80=2025) |
| `year` | Calendar year |
| `country_iso` | ISO 3166-1 alpha-2 country code |
| `country_name` | Country name |
| `original_lang` | ISO 639-1 code of delivery language |
| `speech_date` | YYYY-MM-DD |
| `audio_floor` | Floor audio (null if original language is a UN language) |
| `audio_{lang}` | Simultaneous interpretation per UN language |
| `orig_lang_text` | As-delivered text from gadebate.un.org (null if unavailable or UN language) |

## Audio tracks

Each row has up to 7 audio tracks:
- `audio_floor` — floor/original-language audio
- `audio_en/fr/es/ar/zh/ru` — simultaneous interpretation into each UN official language

## Note on WER

Verbatim records are lightly edited. WER of 20–40% is expected even for high-quality ASR. For Chinese, use CER as the primary metric.

## Attribution

Audio: © United Nations. Reproduced under [UN Terms of Use](https://www.un.org/en/about-us/terms-of-use).
Transcripts: [United Nations Official Document System](https://documents.un.org). Public domain.
"""


def load_audio(filename: str | None) -> dict | None:
    if not filename:
        return None
    local = AUDIO_DIR / Path(filename).name
    if not local.exists():
        print(f"  WARNING: audio file not found: {local}")
        return None
    return {"path": Path(filename).name, "bytes": local.read_bytes()}


def build_and_push_session(row: dict, idx: int, total: int, api: HfApi | None) -> None:
    symbol = row["symbol"]
    symbol_safe = symbol.replace("/", "_")
    print(f"  [{idx+1}/{total}] {symbol}")

    cols: dict = {
        "symbol": [row["symbol"]],
        "webtv_url": [row["webtv_url"]],
        "duration_ms": [row["duration_ms"]],
        "num_speakers": [row["num_speakers"]],
        "audio_floor": [load_audio(row.get("floor_file_name"))],
        **{f"audio_{lang}": [load_audio(row.get(f"{lang}_file_name"))] for lang in LANGS},
        **{f"pv_{lang}": [row.get(f"pv_{lang}")] for lang in LANGS},
    }

    audio_summary = f"floor={'✓' if row.get('floor_file_name') else '✗'} " + \
        " ".join(f"{l}={'✓' if row.get(f'{l}_file_name') else '✗'}" for l in LANGS)
    print(f"    {audio_summary}")

    if DRY_RUN:
        return

    table = pa.table(cols, schema=SCHEMA)
    parquet_path = CORPUS_DIR / f"sessions-{symbol_safe}.parquet"
    pq.write_table(table, parquet_path)
    size_mb = parquet_path.stat().st_size / 1024 / 1024
    print(f"    Parquet: {size_mb:.1f} MB", end="")

    if api:
        api.upload_file(
            path_or_fileobj=str(parquet_path),
            path_in_repo=f"data/sessions/{parquet_path.name}",
            repo_id=HF_REPO,
            repo_type="dataset",
            commit_message=f"Add session {symbol}",
        )
        print(" → uploaded")
    else:
        print(" (no HF_TOKEN)")

    # Delete Parquet and audio files to free space
    parquet_path.unlink()
    for col in ["floor_file_name"] + [f"{l}_file_name" for l in LANGS]:
        fname = row.get(col)
        if fname:
            local = AUDIO_DIR / Path(fname).name
            if local.exists():
                local.unlink()


def get_uploaded_symbols(api: HfApi | None) -> set[str]:
    """Return set of symbol_safe strings already uploaded to HF (e.g. 'S_PV_9826')."""
    if api is None:
        return set()
    try:
        files = api.list_repo_tree(HF_REPO, repo_type="dataset", path_in_repo="data/sessions")
        uploaded = set()
        for f in files:
            name = Path(f.rfilename).stem  # e.g. sessions-S_PV_9826
            if name.startswith("sessions-"):
                uploaded.add(name[len("sessions-"):])  # e.g. 'S_PV_9826'
        return uploaded
    except Exception:
        return set()


def download_session(symbol: str) -> bool:
    """Run upload-corpus.ts --symbol=X to download audio + PV for one session."""
    print(f"  Downloading audio + PV...")
    result = subprocess.run(
        ["npm", "run", "hf:upload-corpus", "--", f"--symbol={symbol}"],
        cwd=str(REPO_ROOT),
        capture_output=False,
    )
    return result.returncode == 0


def get_session_row(symbol: str) -> dict | None:
    """Read the metadata entry for a symbol from metadata.jsonl."""
    if not METADATA_PATH.exists():
        return None
    for line in METADATA_PATH.open():
        row = json.loads(line)
        if row["symbol"] == symbol:
            return row
    return None


def main():
    sessions = json.loads(SESSIONS_PATH.read_text())
    if SYMBOL_ARG:
        sessions = [s for s in sessions if s["symbol"] == SYMBOL_ARG]
        if not sessions:
            print(f"ERROR: symbol not found in sessions.json: {SYMBOL_ARG}"); sys.exit(1)

    print(f"Processing {len(sessions)} sessions...")

    api = None
    if not DRY_RUN:
        if not HF_TOKEN:
            print("ERROR: HF_TOKEN not set"); sys.exit(1)
        api = HfApi(token=HF_TOKEN)
        try:
            create_repo(HF_REPO, repo_type="dataset", token=HF_TOKEN, exist_ok=True)
        except Exception as e:
            if "already created" not in str(e): raise

        api.upload_file(
            path_or_fileobj=README.encode(),
            path_in_repo="README.md",
            repo_id=HF_REPO,
            repo_type="dataset",
            commit_message="Update README for sessions split",
        )

    # Check which sessions are already in HF (to skip re-uploads)
    uploaded = get_uploaded_symbols(api)
    if uploaded:
        print(f"Already uploaded: {len(uploaded)} sessions")

    done = 0
    skipped = 0
    for i, session in enumerate(sessions):
        symbol = session["symbol"]
        symbol_safe = symbol.replace("/", "_")
        print(f"\n[{i+1}/{len(sessions)}] {symbol}")

        # Check if already uploaded (compare symbol_safe e.g. S_PV_9826)
        if symbol_safe in uploaded:
            print(f"  Already uploaded, skipping.")
            skipped += 1
            continue

        # Download audio + PV for this session
        if not DRY_RUN:
            ok = download_session(symbol)
            if not ok:
                print(f"  Download failed, skipping.")
                continue

        # Read metadata entry
        row = get_session_row(symbol)
        if not row:
            if DRY_RUN:
                print(f"  (dry-run: would download then push)")
                continue
            print(f"  No metadata entry found after download, skipping.")
            continue

        build_and_push_session(row, i, len(sessions), api)
        done += 1

    print(f"\nDone! {done} new sessions pushed, {skipped} already uploaded.")
    if not DRY_RUN:
        print(f"https://huggingface.co/datasets/{HF_REPO}")


if __name__ == "__main__":
    main()
