#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyarrow", "huggingface_hub", "python-dotenv", "requests"]
# ///
"""
Push the GA General Debate corpus (split 1) to HuggingFace.

Streams audio directly from the UN Radio S3 CDN — no local audio download required.
Processes one session at a time: build Parquet → upload → delete → next session.
Peak disk usage: ~1 session Parquet at a time.

Usage:
  uv run eval/hf/push-gadebate.py
  uv run eval/hf/push-gadebate.py --dry-run
  uv run eval/hf/push-gadebate.py --sessions=80
"""
import json
import os
import sys
import subprocess
import tempfile
from pathlib import Path
from collections import defaultdict

import pyarrow as pa
import pyarrow.parquet as pq
import requests
from huggingface_hub import HfApi, create_repo
from dotenv import load_dotenv

load_dotenv()

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_REPO = "united-nations/transcription-corpus"
CORPUS_DIR = Path(__file__).parent.parent / "corpus-data" / "gadebate"
METADATA_PATH = CORPUS_DIR / "metadata.jsonl"
DRY_RUN = "--dry-run" in sys.argv

SESSIONS_ARG = next((a for a in sys.argv if a.startswith("--sessions=")), None)
TARGET_SESSIONS = set(int(s) for s in SESSIONS_ARG.replace("--sessions=", "").split(",")) if SESSIONS_ARG else None

S3_BASE = "https://s3.amazonaws.com/downloads.unmultimedia.org/radio/library/ltd/mp3/ga"

SCHEMA = pa.schema([
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

LANG_CODES = ["FL", "EN", "FR", "ES", "AR", "ZH", "RU"]
SESSION_YEAR = {70: 2015, 71: 2016, 72: 2017, 73: 2018, 76: 2021, 77: 2022, 78: 2023, 79: 2024, 80: 2025}


def fetch_and_upload_audio(session: int, year: int, iso: str, lang: str, api: HfApi | None) -> dict | None:
    """Fetch audio from S3, upload to HF as a separate file, return URL string."""
    url = f"{S3_BASE}/{year}/{session}_{iso}_{lang}.mp3"
    try:
        r = requests.get(url, timeout=60, stream=False)
        if r.status_code != 200:
            return None
        filename = f"{session}_{iso}_{lang}.mp3"
        hf_upload_path = f"data/gadebate/audio/{filename}"
        if api:
            local = CORPUS_DIR / filename
            local.write_bytes(r.content)
            api.upload_file(
                path_or_fileobj=str(local),
                path_in_repo=hf_upload_path,
                repo_id=HF_REPO,
                repo_type="dataset",
                commit_message=f"Audio: {filename}",
            )
            local.unlink()
        return f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/{hf_upload_path}"
    except Exception as e:
        print(f"    WARN: {url}: {e}")
        return None


def fetch_orig_pdf_text(row: dict) -> str | None:
    """Fetch original-language PDF from gadebate.un.org and extract text."""
    iso = row["country_iso"].lower()
    lang = row.get("original_lang")
    if not lang:
        return None
    session = row["session"]
    url = f"https://gadebate.un.org/sites/default/files/gastatements/{session}/{iso}_{lang}.pdf"
    try:
        r = requests.get(url, timeout=30)
        if r.status_code != 200:
            return None
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(r.content)
            fname = f.name
        result = subprocess.run(["pdftotext", fname, "-"], capture_output=True, text=True, timeout=30)
        os.unlink(fname)
        text = result.stdout.strip()
        return text if text else None
    except Exception:
        return None


def build_and_push_session(session: int, rows: list[dict], api: HfApi | None) -> None:
    year = SESSION_YEAR.get(session, session + 1945)
    print(f"\n=== Session {session} ({year}): {len(rows)} speeches ===")

    if DRY_RUN:
        for i, row in enumerate(rows):
            iso = row["country_iso"]
            print(f"  [{i+1}/{len(rows)}] {iso} ({row.get('country_name', '')})", end=" ", flush=True)
            for lang in LANG_CODES:
                print(".", end="", flush=True)
            print(" ✓")
        print("  Dry run — skipping Parquet write.")
        return

    parquet_path = CORPUS_DIR / f"gadebate-{session}.parquet"
    writer = pq.ParquetWriter(parquet_path, SCHEMA)

    try:
        for i, row in enumerate(rows):
            iso = row["country_iso"]
            print(f"  [{i+1}/{len(rows)}] {iso} ({row.get('country_name', '')})", end=" ", flush=True)

            row_cols: dict = {
                "session": [session],
                "year": [year],
                "country_iso": [iso],
                "country_name": [row["country_name"]],
                "original_lang": [row.get("original_lang")],
                "speech_date": [row.get("speech_date")],
            }

            # Fetch floor + 6 UN language tracks, upload each as separate file
            for lang in LANG_CODES:
                col = "audio_floor" if lang == "FL" else f"audio_{lang.lower()}"
                row_cols[col] = [fetch_and_upload_audio(session, year, iso, lang, api)]
                print(".", end="", flush=True)

            # Fetch original-language PDF text (only when non-UN-language speech)
            orig_text = None
            if row.get("original_lang") and row["original_lang"] not in {"en", "fr", "es", "ar", "zh", "ru"}:
                orig_text = fetch_orig_pdf_text(row)
            row_cols["orig_lang_text"] = [orig_text]

            writer.write_table(pa.table(row_cols, schema=SCHEMA))
            print(" ✓")
    finally:
        writer.close()

    # Upload the Parquet (now just metadata + paths, very small)
    size_mb = parquet_path.stat().st_size / 1024 / 1024
    print(f"\n  Parquet: {parquet_path.name} ({size_mb:.1f} MB)", end=" ", flush=True)
    if api:
        api.upload_file(
            path_or_fileobj=str(parquet_path),
            path_in_repo=f"data/gadebate/{parquet_path.name}",
            repo_id=HF_REPO,
            repo_type="dataset",
            commit_message=f"GA General Debate session {session}",
        )
        print("→ uploaded")
    else:
        print("(no HF_TOKEN)")
    parquet_path.unlink()


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
- config_name: gadebate
  data_files:
  - split: train
    path: data/gadebate/*.parquet
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


def main():
    if not METADATA_PATH.exists():
        print(f"ERROR: {METADATA_PATH} not found. Run: npm run hf:build-gadebate -- --dry-run")
        sys.exit(1)

    rows = [json.loads(l) for l in METADATA_PATH.open() if l.strip()]
    print(f"Loaded {len(rows)} speeches")

    by_session: dict[int, list] = defaultdict(list)
    for row in rows:
        by_session[row["session"]].append(row)

    sessions = sorted(by_session.keys())
    if TARGET_SESSIONS:
        sessions = [s for s in sessions if s in TARGET_SESSIONS]
    print(f"Sessions: {sessions}")

    api = None
    if not DRY_RUN:
        if not HF_TOKEN:
            print("ERROR: HF_TOKEN not set"); sys.exit(1)
        api = HfApi(token=HF_TOKEN)
        try:
            create_repo(HF_REPO, repo_type="dataset", token=HF_TOKEN, exist_ok=True)
        except Exception as e:
            if "already created" not in str(e): raise

        # Upload README
        api.upload_file(
            path_or_fileobj=README.encode(),
            path_in_repo="README.md",
            repo_id=HF_REPO,
            repo_type="dataset",
            commit_message="Add gadebate split README",
        )

    for session in sessions:
        build_and_push_session(session, by_session[session], api)

    print("\nDone!")
    if not DRY_RUN:
        print(f"https://huggingface.co/datasets/{HF_REPO}")


if __name__ == "__main__":
    main()
