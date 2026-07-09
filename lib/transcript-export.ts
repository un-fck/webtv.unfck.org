/**
 * Shared metadata header for every transcript export surface.
 *
 * One builder, six renderings. The clipboard, the `.txt` / `.rtf` / `.xlsx` /
 * `.vtt` downloads and the public `/{locale}/{slug}.txt` endpoint all describe
 * the same meeting, so they all derive their header from `buildExportMetaFields`
 * and differ only in how they draw it (plain lines, RTF runs, spreadsheet rows,
 * a WebVTT `NOTE` block).
 *
 * Labels arrive pre-resolved rather than being looked up here: the client passes
 * `useTranslations()` output (so a French page exports French labels) while the
 * data API passes English constants (its chrome — disclaimer, speaker names,
 * llms pointer — is English-only by design). Keeping the module free of
 * next-intl is also what lets it stay pure and unit-testable.
 *
 * `.srt` deliberately has no header: it has no comment syntax, so metadata would
 * become on-screen subtitle text.
 */

export interface ExportMetaLabels {
  date: string;
  language: string;
  transcript: string;
  json: string;
  aiAgents: string;
}

export interface ExportMetaInput {
  /** Meeting title, e.g. "The situation in the Middle East". */
  title: string;
  /** Organ, e.g. "Security Council". Rendered as an unlabelled subtitle. */
  body?: string | null;
  /** Pre-formatted, timezone-resolved, e.g. "15 June 2026, 10:00". */
  date: string;
  /** Display name, not a code: "English", "Floor (Original)". */
  language: string;
  /** Absolute canonical URL of the transcript page. */
  transcriptUrl: string;
  /** Clipboard only — omitted from downloaded files. */
  jsonUrl?: string | null;
  /** Clipboard only — omitted from downloaded files. */
  llmsUrl?: string | null;
  labels: ExportMetaLabels;
}

/** A `Label: value` row. `href` marks values that renderers may linkify. */
export interface ExportMetaField {
  label: string;
  value: string;
  href?: string;
}

/** Separates the header from the transcript body in text-shaped exports. */
export const EXPORT_HEADER_SEPARATOR = "\n\n---\n\n";

/**
 * Fields with an empty value are dropped rather than rendered as a bare
 * `Label:` — the data API serves meetings that have no transcript yet (no
 * language) and, rarely, no date.
 */
export function buildExportMetaFields(
  input: ExportMetaInput,
): ExportMetaField[] {
  const { labels } = input;
  const fields: ExportMetaField[] = [
    { label: labels.date, value: input.date },
    { label: labels.language, value: input.language },
    {
      label: labels.transcript,
      value: input.transcriptUrl,
      href: input.transcriptUrl,
    },
  ];
  if (input.jsonUrl) {
    fields.push({
      label: labels.json,
      value: input.jsonUrl,
      href: input.jsonUrl,
    });
  }
  if (input.llmsUrl) {
    fields.push({
      label: labels.aiAgents,
      value: input.llmsUrl,
      href: input.llmsUrl,
    });
  }
  return fields.filter((f) => f.value !== "");
}

/** Title, optional organ, `Label: value` lines, disclaimer, then a `---` rule. */
export function buildExportHeaderText(
  input: ExportMetaInput,
  disclaimer: string,
): string {
  const lines = [input.title];
  if (input.body) lines.push(input.body);
  for (const f of buildExportMetaFields(input)) {
    lines.push(`${f.label}: ${f.value}`);
  }
  lines.push(disclaimer);
  return lines.join("\n") + EXPORT_HEADER_SEPARATOR;
}

/**
 * WebVTT allows multi-line `NOTE` blocks before the first cue, terminated by a
 * blank line. They never render on screen, so the header is free here.
 * Blank lines inside a note would end it, so each value is collapsed to one line.
 */
export function buildExportHeaderVtt(
  input: ExportMetaInput,
  disclaimer: string,
): string {
  const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
  const noteLines = [collapse(input.title)];
  if (input.body) noteLines.push(collapse(input.body));
  for (const f of buildExportMetaFields(input)) {
    noteLines.push(`${collapse(f.label)}: ${collapse(f.value)}`);
  }
  return (
    "WEBVTT\n\n" +
    `NOTE\n${noteLines.join("\n")}\n\n` +
    `NOTE\n${collapse(disclaimer)}\n\n`
  );
}

/**
 * RTF is a 7-bit format: literal braces and backslashes are control characters,
 * and anything above ASCII must be escaped as `\uN?` where N is a *signed*
 * 16-bit integer — code units above 0x7FFF wrap negative, which Word requires.
 * The trailing `?` is the substitution character for readers that can't decode
 * the escape. UTF-16 surrogate pairs are emitted as two escapes, which is what
 * Word expects.
 */
export function escapeRtf(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/[\u0080-\uffff]/g, (char) => {
      const code = char.charCodeAt(0);
      return `\\u${code > 32767 ? code - 65536 : code}?`;
    });
}

/** A clickable Word hyperlink. Falls back to the visible text in readers that ignore fields. */
function rtfHyperlink(url: string, text: string): string {
  return `{\\field{\\*\\fldinst HYPERLINK "${escapeRtf(url)}"}{\\fldrslt {\\cf3\\ul ${escapeRtf(text)}}}}`;
}

/**
 * RTF document prolog plus the header block. The caller appends the transcript
 * body and the closing `}`.
 *
 * Colour table: 1 = black, 2 = grey (subtitle, rule, disclaimer), 3 = link blue.
 * `\fs` is in half-points, so `\fs32` is 16pt. The `\brdrb` paragraph draws the
 * horizontal rule under an empty paragraph.
 */
export function buildExportHeaderRtf(
  input: ExportMetaInput,
  disclaimer: string,
): string {
  let rtf = "{\\rtf1\\ansi\\ansicpg1252\\deff0\n";
  rtf += "{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}\n";
  rtf +=
    "{\\colortbl;\\red0\\green0\\blue0;\\red89\\green89\\blue89;\\red0\\green102\\blue204;}\n";
  rtf += `\\pard\\sa120\\f0\\fs32\\b ${escapeRtf(input.title)}\\b0\\par\n`;
  if (input.body) {
    rtf += `\\pard\\sa120\\fs22\\i\\cf2 ${escapeRtf(input.body)}\\i0\\cf1\\par\n`;
  }
  for (const f of buildExportMetaFields(input)) {
    const value = f.href ? rtfHyperlink(f.href, f.value) : escapeRtf(f.value);
    rtf += `\\pard\\sa40\\fs20 {\\b ${escapeRtf(f.label)}: }${value}\\par\n`;
  }
  rtf += "\\pard\\brdrb\\brdrs\\brdrw10\\brdrcf2\\sa120\\par\n";
  rtf += `\\pard\\sa240\\fs16\\i\\cf2 ${escapeRtf(disclaimer)}\\i0\\cf1\\par\n`;
  rtf += "\\pard\\sa0\\fs22\n";
  return rtf;
}
