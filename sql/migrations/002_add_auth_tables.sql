-- Migration 002: add passwordless magic-link auth tables.
--
-- Backs the login system that gates the proposition/stakeholder "analysis"
-- feature. Users sign in with a UN-entity email (allowed_domains) and a
-- short-lived magic token; sessions are HMAC-signed cookies (no row needed).
--
-- Apply once to an existing database:
--   psql "$DATABASE_URL" -f sql/migrations/002_add_auth_tables.sql
--
-- Idempotent — safe to re-run.
SET search_path = webtv, public;

-- Users (no `entity` column — entity selection was intentionally dropped).
CREATE TABLE IF NOT EXISTS webtv.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Magic tokens for passwordless login.
CREATE TABLE IF NOT EXISTS webtv.magic_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires ON webtv.magic_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_cleanup ON webtv.magic_tokens (expires_at) WHERE used_at IS NULL;

-- Allowed email domains. `entity` is a free-text label only (which org a domain
-- belongs to); '*' means globally allowed.
CREATE TABLE IF NOT EXISTS webtv.allowed_domains (
  entity TEXT NOT NULL,
  domain TEXT NOT NULL,
  PRIMARY KEY (entity, domain)
);

COMMENT ON TABLE webtv.allowed_domains IS 'Allowed email domains for login. Entity ''*'' means allowed globally.';

-- UN System email domains.
INSERT INTO webtv.allowed_domains (entity, domain) VALUES
  -- UN Secretariat
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
  ('UNU', 'unu.edu')
ON CONFLICT DO NOTHING;
