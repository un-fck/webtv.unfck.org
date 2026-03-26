import { PDFParse } from "pdf-parse";
import { stripPDFArtifacts } from "./normalizer";

export interface ParsedSpeakerTurn {
  name: string;
  affiliation?: string;
  text: string;
}

export interface ParsedPVDocument {
  fullText: string;
  speakers: ParsedSpeakerTurn[];
}

// UN verbatim record speaker patterns across languages.
// Speaker lines may have optional parentheticals: "Le Président (parle en anglais) :"
const SPEAKER_PATTERNS = [
  // English: "The President:", "Mr. Smith (United Kingdom):"
  /^(The (?:President|Chairperson|Chairman|Chairwoman|Secretary-General))\s*(?:\([^)]+\)\s*)?:\s*/m,
  /^((?:Mr|Mrs|Ms|Dr|Sir|Dame|Lord|Lady|Ambassador|Minister|Judge)\.\s+[\p{L}\s'-]+?)(?:\s*\(([^)]+)\))?\s*(?:\([^)]+\)\s*)?:\s*/mu,
  // French: "Le Président (parle en anglais) :", "M. Dupont (France) :"
  /^(Le (?:Président|Secrétaire général)|La (?:Présidente|Secrétaire générale))\s*(?:\([^)]+\)\s*)?:\s*/mu,
  /^((?:M|Mme|Mlle)\.\s+[\p{L}\s'-]+?)(?:\s*\(([^)]+)\))?\s*(?:\([^)]+\)\s*)?:\s*/mu,
  // Spanish: "El Presidente:", "Sr. García (México):"
  /^(El (?:Presidente|Secretario General)|La (?:Presidenta|Secretaria General))\s*(?:\([^)]+\)\s*)?:\s*/mu,
  /^((?:Sr|Sra|Srta)\.\s+[\p{L}\s'-]+?)(?:\s*\(([^)]+)\))?\s*(?:\([^)]+\)\s*)?:\s*/mu,
  // Generic pattern for other languages — speaker with parenthesized affiliation
  /^([\p{L}\s'-]{2,40})\s*\(([^)]+)\)\s*(?:\([^)]+\)\s*)?:\s*/mu,
];

export async function parsePVDocument(
  pdfBuffer: Buffer,
): Promise<ParsedPVDocument> {
  const parser = new PDFParse({ data: pdfBuffer });
  const data = await parser.getText();
  const rawText = data.pages.map((p) => p.text).join("\n");

  const cleanedText = stripPDFArtifacts(rawText);
  const speakers: ParsedSpeakerTurn[] = [];

  // Try to split by speaker turns
  let remaining = cleanedText;
  let lastSpeaker: ParsedSpeakerTurn | null = null;

  while (remaining.length > 0) {
    let earliestMatch: {
      index: number;
      name: string;
      affiliation?: string;
      matchLength: number;
    } | null = null;

    for (const pattern of SPEAKER_PATTERNS) {
      const match = remaining.match(pattern);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            name: match[1].trim(),
            affiliation: match[2]?.trim(),
            matchLength: match[0].length,
          };
        }
      }
    }

    if (!earliestMatch) {
      // No more speakers found — append remaining to last speaker or as standalone
      if (lastSpeaker) {
        lastSpeaker.text += " " + remaining.trim();
      }
      break;
    }

    // Text before this speaker belongs to previous speaker
    if (earliestMatch.index > 0 && lastSpeaker) {
      lastSpeaker.text += " " + remaining.slice(0, earliestMatch.index).trim();
    }

    lastSpeaker = {
      name: earliestMatch.name,
      affiliation: earliestMatch.affiliation,
      text: "",
    };
    speakers.push(lastSpeaker);

    remaining = remaining.slice(
      earliestMatch.index + earliestMatch.matchLength,
    );
  }

  return {
    fullText: cleanedText,
    speakers,
  };
}
