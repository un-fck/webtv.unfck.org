-- Canonical default seed data. Apply once after sql/schema.sql when
-- provisioning a fresh database:
--   psql "$DATABASE_URL" -f sql/seed.sql
--
-- Idempotent (ON CONFLICT DO NOTHING) — safe to re-run. Local edits to these
-- tables are preserved; only missing rows are inserted.
--
-- For existing databases provisioned via the migration log there is nothing
-- to do — the seed rows were inserted by migrations 002, 005 and 007.
--
-- When a future migration seeds default data, also append it here so fresh
-- provisioning stays in sync (mirrors the schema.sql rule in CLAUDE.md).
SET search_path = webtv,
    public;
-- ── allowed_domains (originally seeded by migration 002) ─────────────────────
-- UN-system email domains. No longer enforced at login (registration is open),
-- but the About page uses this list to gate the "request experimental access"
-- section: it's shown only to logged-in users whose email matches one of these.
INSERT INTO webtv.allowed_domains (entity, domain)
VALUES -- UN Secretariat
    ('*', 'un.org'),
    -- UN Funds and Programmes
    ('UNDP', 'undp.org'),
    ('UNICEF', 'unicef.org'),
    ('UNFPA', 'unfpa.org'),
    ('WFP', 'wfp.org'),
    ('UNHCR', 'unhcr.org'),
    ('UNRWA', 'unrwa.org'),
    ('UN-Habitat', 'unhabitat.org'),
    ('UNEP', 'unep.org'),
    ('UNODC', 'unodc.org'),
    ('UN-Women', 'unwomen.org'),
    -- Specialized Agencies
    ('WHO', 'who.int'),
    ('UNESCO', 'unesco.org'),
    ('ILO', 'ilo.org'),
    ('FAO', 'fao.org'),
    ('IFAD', 'ifad.org'),
    ('IMO', 'imo.org'),
    ('ICAO', 'icao.int'),
    ('ITU', 'itu.int'),
    ('UPU', 'upu.int'),
    ('WIPO', 'wipo.int'),
    ('UNIDO', 'unido.org'),
    ('UNWTO', 'unwto.org'),
    ('WMO', 'wmo.int'),
    -- Related Organizations
    ('IAEA', 'iaea.org'),
    ('WTO', 'wto.org'),
    ('IOM', 'iom.int'),
    ('ICJ', 'icj-cij.org'),
    -- Other UN entities
    ('UNCTAD', 'unctad.org'),
    ('ITC', 'intracen.org'),
    ('UNAIDS', 'unaids.org'),
    ('UNSSC', 'unssc.org'),
    ('UNU', 'unu.edu') ON CONFLICT DO NOTHING;
-- ── feeds ────────────────────
INSERT INTO webtv.feeds (key, label, description, match_title_ilike)
VALUES (
        'un80',
        'UN80',
        'Meetings related to the UN80 initiative.',
        'un80'
    ),
    (
        'daily-press-briefing',
        'Daily Press Briefing',
        'The Spokesperson''s daily press briefing.',
        'daily press briefing'
    ),
    (
        'un-geneva-press-briefing',
        'UN Geneva Press Briefing',
        'The Geneva press briefing (UNHCR, UNICEF, WHO, IFRC, etc.).',
        'un geneva press briefing'
    ) ON CONFLICT (key) DO NOTHING;