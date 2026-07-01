-- Migration 023: add a "UN Geneva Press Briefing" auto-transcribe feed.
SET search_path = webtv, public;


INSERT INTO webtv.feeds (key, label, description, match_title_ilike) VALUES
  ('un-geneva-press-briefing', 'UN Geneva Press Briefing',
   'The Geneva press briefing (UNHCR, UNICEF, WHO, IFRC, etc.).', 'un geneva press briefing')
ON CONFLICT (key) DO NOTHING;
