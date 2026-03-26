/** Strip PDF extraction artifacts from UN verbatim record text */
export function stripPDFArtifacts(text: string): string {
  let cleaned = text;

  // Remove common PDF artifacts like form feed
  cleaned = cleaned.replace(/\f/g, "\n");

  // Strip the entire PV preamble — everything before first speaker turn.
  // PV documents start with headers, member listings, attendance, etc.
  // The actual transcript begins with "The President:", "Le Président:", etc.
  // Patterns allow optional parenthetical between name and colon, e.g.:
  // "Le Président (parle en anglais) :", "The President:"
  const speakerStartPatterns = [
    /^(\s*The (?:President|Chairperson|Chairman|Chairwoman|Secretary-General)\s*(?:\([^)]+\)\s*)?:)/m,
    /^(\s*(?:Le Président|La Présidente)\s*(?:\([^)]+\)\s*)?:)/m,
    /^(\s*(?:El Presidente|La Presidenta)\s*(?:\([^)]+\)\s*)?:)/m,
    /^(\s*(?:Mr|Mrs|Ms)\.\s+[\p{L}\s'-]+?\s*(?:\([^)]+\)\s*)?:)/mu,
    /^(\s*(?:M|Mme|Mlle)\.\s+[\p{L}\s'-]+?\s*(?:\([^)]+\)\s*)?:)/mu,
    /^(\s*(?:Sr|Sra|Srta)\.\s+[\p{L}\s'-]+?\s*(?:\([^)]+\)\s*)?:)/mu,
  ];

  for (const pattern of speakerStartPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined && match.index > 100) {
      // Cut everything before the first speaker
      cleaned = cleaned.slice(match.index);
      break;
    }
  }

  // Remove page numbers (standalone digits on their own line)
  cleaned = cleaned.replace(/^\s*\d{1,3}\s*$/gm, "");

  // Remove repeated document symbol headers (e.g., "S/PV.9826", "A/79/PV.18")
  cleaned = cleaned.replace(/^\s*[SA]\/(?:\d+\/)?PV\.\d+\s*$/gm, "");

  // Remove document reference codes (e.g., "26-01225 (E)")
  cleaned = cleaned.replace(/^\s*\d{2}-\d{5}\s*\([A-Z]\)\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\*\d+\*\s*$/gm, "");

  // Remove "United Nations" header lines in all 6 UN languages
  cleaned = cleaned.replace(/^\s*United Nations\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*Nations Unies\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*Naciones Unidas\s*$/gm, "");

  // Remove "Security Council" / "General Assembly" standalone headers
  cleaned = cleaned.replace(/^\s*Security Council\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*General Assembly\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*Provisional\s*$/gm, "");

  // Remove "The meeting was called to order at..." / "The meeting rose at..." (EN/FR/ES)
  cleaned = cleaned.replace(
    /^\s*The meeting (?:was called to order|rose) at [\d.:]+\s*(?:a\.m\.|p\.m\.)?\s*\.?\s*$/gm,
    "",
  );
  cleaned = cleaned.replace(
    /^\s*La séance est (?:ouverte|levée) à [\d\s]+h(?:eures?)?\s*[\d]*\s*\.?\s*$/gm,
    "",
  );
  cleaned = cleaned.replace(
    /^\s*Se (?:abre|levanta) la sesión a las [\d.:]+\s*(?:horas)?\s*\.?\s*$/gm,
    "",
  );

  // Remove lines that are just dots (leader lines in member listings)
  cleaned = cleaned.replace(/^\s*\.{3,}\s*$/gm, "");

  // Remove lines that are just dashes or underscores (separators)
  cleaned = cleaned.replace(/^\s*[-_]{3,}\s*$/gm, "");

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  return cleaned.trim();
}
