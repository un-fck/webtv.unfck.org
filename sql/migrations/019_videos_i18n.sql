-- 019: Per-locale metadata for videos.
--
-- UN Multilingualism Web Standards (un.org/en/multilingualism-web-standards)
-- require equitable treatment of the six official languages. The English
-- schedule scrape leaves meeting titles, clean_titles and category strings in
-- English on the ar/zh/fr/ru/es schedule pages, jumbling languages on a
-- non-English page (violates requirement #4). This column stores the matching
-- ar/zh/fr/ru/es variants harvested from each locale's WebTV schedule, keyed
-- on asset_id (the URL slug is identical across locales).
--
-- The canonical English values stay in `title`/`clean_title`/`category` so the
-- FTS index, search heuristics, and the public /json API contract are
-- unchanged. The i18n map is additive: missing keys fall back to English at
-- render time.
--
-- Shape: { [locale]: { title, clean_title, category } }
-- Locale set tracks the next-intl routing config (ar, zh, fr, ru, es; en is
-- redundant — it lives in the canonical columns).

ALTER TABLE webtv.videos
    ADD COLUMN IF NOT EXISTS i18n JSONB NOT NULL DEFAULT '{}'::jsonb;
