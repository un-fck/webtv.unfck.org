import { NextRequest, NextResponse } from 'next/server';
import { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { setSpeakerMapping } from '@/lib/speakers';
import '@/lib/load-env';

const ParagraphSpeakerMapping = z.object({
  paragraphs: z.array(z.object({
    index: z.number().describe('The paragraph index (0-based)'),
    name: z.string().nullable(),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable()
  }))
});

export async function POST(request: NextRequest) {
  try {
    const { paragraphs, transcriptId } = await request.json();
    
    if (!paragraphs || paragraphs.length === 0) {
      return NextResponse.json({ error: 'No paragraphs provided' }, { status: 400 });
    }

    // Build numbered transcript with each paragraph indexed and AssemblyAI speaker labels
    const transcriptParts: string[] = [];
    
    paragraphs.forEach((para: { words: Array<{ speaker?: string; text: string }> }, index: number) => {
      const text = para.words.map(w => w.text).join(' ');
      const assemblyAISpeaker = para.words?.[0]?.speaker || 'Unknown';
      transcriptParts.push(`[${index}] (AssemblyAI: Speaker ${assemblyAISpeaker}) ${text}`);
    });

    const fullTranscript = transcriptParts.join('\n\n');

    const API_VERSION = '2025-01-01-preview'

    // Initialize Azure OpenAI client
    // console.log('Azure OpenAI config:', {
    //   hasApiKey: !!process.env.AZURE_OPENAI_API_KEY,
    //   endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    //   apiVersion: API_VERSION,
    // });
    
    const client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: API_VERSION,
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-5',
      messages: [
      {
        role: 'system',
        content: `You are an expert at identifying speakers in UN proceedings. For each paragraph in the transcript, extract the speaker's name, function/title, affiliation, and country-group information strictly from the context.

CRITICAL: Identify WHO IS ACTUALLY SPEAKING each paragraph, NOT who is being introduced or mentioned.

TASK:
- Each paragraph is numbered [0], [1], [2], etc.
- Each paragraph has an AssemblyAI speaker label (A, B, C, etc.) - these are HINTS from automatic diarization
- WARNING: AssemblyAI labels may be incorrect or inconsistent - use them as hints, not facts
- For each paragraph, identify the ACTUAL SPEAKER (person saying those words) based on the text content
- IMPORTANT: If a paragraph contains "I invite X" or "X has the floor", the speaker is the person doing the inviting/giving the floor (usually the Chair), NOT X
- X will speak in SUBSEQUENT paragraphs
- When a speaker continues across multiple paragraphs, repeat their information
- Process EVERY paragraph from [0] to [last]. Never stop early.

IDENTIFICATION RULES:
- Look for "Thank you [name]" to identify when a new speaker starts (thanking the previous one)
- Use AssemblyAI labels as HINTS for speaker changes (label change often = new speaker), but verify with text
- AssemblyAI may incorrectly group different speakers under same label, or split one speaker across labels
- Extract both personal names AND official functions when available
- For country representatives, provide ISO 3166-1 alpha-3 country codes (e.g., PRY, USA, CHN)
- For UN bodies/agencies, use standard abbreviations (e.g., ACABQ, UNICEF, UNDP, OHCHR, 5th Committee)
- If a representative is speaking on behalf of a group (e.g., G77, EU), capture that group code
- If identity cannot be determined, return all null values
- Only use information literally in the text (no world knowledge)
- Fix transcription errors: "UN80 Initiative" (not "UNAT", "UNA", "UNAT Initiative", etc.)

COMMON ABBREVIATIONS
- Informal Ad hoc Working Group (on UN80 initiative / mandate implementation review / ...) -> IAHWG (just "IAHWG", NOT "IAHWG on ...")

SCHEMA DEFINITIONS:

name: Person name as best as can be identified from the text. Do NOT use world knowledge. Only use what is literally stated. Fix transcription errors. May be given name, surname, or full name. Add "Mr."/"Ms." only if surname-only AND gender explicitly known. E.g., "Yacine Hamzaoui", "Mr. Hamasu", "Dave". Use null if unknown.

function: Function/title. Be concise, use canonical abbreviations. E.g. "SG", "PGA", "Chair", "Representative", "Vice-Chair", "Officer", "Spokesperson", "USG Policy". Use null if unknown.

affiliation: For country representatives, use ISO 3166-1 alpha-3 country codes of their country, e.g. "PRY", "KEN". For organizations use the canonical abbreviation of the organization, e.g. "OECD", "OHCHR", "UN Secretariat", "GA", "5th Committee", "UN80 Initiative". Use null if unknown/not applicable.

group: If applicable, group of countries that a country representative is speaking on behalf of. Use the canonical abbreviation, e.g. "G77", "EU", "AU". Use null if not applicable.

EXAMPLES:

✓ "[0] (AssemblyAI: Speaker A) I call to order the 8th meeting. I invite Mr. Yacine Hamzaoui to introduce the report."
  → index: 0, name: null, function: "Chair", affiliation: "5th Committee", group: null
  REASON: The CHAIR is speaking (saying "I invite"), even though Hamazoui is mentioned

✓ "[1] (AssemblyAI: Speaker B) Thank you, Madam Chair. I have the pleasure to introduce the Secretary-General's report..."
  → index: 1, name: "Yacine Hamzaoui", function: "Officer", affiliation: "OPPFB", group: null
  REASON: Hamazoui is NOW speaking (indicated by "Thank you, Madam Chair"). AssemblyAI correctly detected speaker change.

✓ "[2] (AssemblyAI: Speaker B) The legal expenses will be funded from the regular budget."
  → index: 2, name: "Yacine Hamzaoui", function: "Officer", affiliation: "OPPFB", group: null
  REASON: Same speaker continues (no handoff signal). AssemblyAI label B matches previous paragraph.

✓ "[3] (AssemblyAI: Speaker A) I thank Mr. Hamazoui. I now invite the Vice Chair of ACABQ, Mr. Carlo Iacobucci."
  → index: 3, name: null, function: "Chair", affiliation: "5th Committee", group: null
  REASON: The CHAIR is speaking (saying "I thank" and "I invite"), NOT Iacobucci. Back to speaker A.

✓ "[4] (AssemblyAI: Speaker C) Madam Chair, I am pleased to introduce the Advisory Committee's report..."
  → index: 4, name: "Carlo Iacobucci", function: "Vice-Chair", affiliation: "ACABQ", group: null
  REASON: Iacobucci is NOW speaking (addressing "Madam Chair"). New speaker detected.

✓ "[5] (AssemblyAI: Speaker A) The permanent representative of Germany has the floor."
  → index: 5, name: null, function: "Chair", affiliation: "5th Committee", group: null
  REASON: The CHAIR is speaking (giving the floor), NOT Germany yet. Back to speaker A.

✓ "[6] (AssemblyAI: Speaker D) Thank you. Germany supports this proposal. I speak on behalf of the European Union."
  → index: 6, name: null, function: "Representative", affiliation: "DEU", group: "EU"
  REASON: German representative is NOW speaking. AssemblyAI detected new speaker.

`
      },
      {
        role: 'user',
        content: `Analyze the following UN transcript and identify the speaker for each numbered paragraph.

Transcript:
${fullTranscript}`
      }
      ],
      response_format: zodResponseFormat(ParagraphSpeakerMapping, 'paragraph_speaker_mapping')
    });

    const result = completion.choices[0]?.message?.content;
    
    if (!result) {
      return NextResponse.json({ error: 'Failed to parse speaker mappings' }, { status: 500 });
    }

    // Parse the JSON response
    const parsed = JSON.parse(result) as z.infer<typeof ParagraphSpeakerMapping>;
    
    // Create structured mapping array indexed by paragraph
    const mapping: Record<string, { name: string | null; function: string | null; affiliation: string | null; group: string | null }> = {};
    parsed.paragraphs.forEach((para) => {
      mapping[para.index.toString()] = {
        name: para.name,
        function: para.function,
        affiliation: para.affiliation,
        group: para.group,
      };
    });

    console.log(`Speaker identification complete: Processed ${parsed.paragraphs.length}/${paragraphs.length} paragraphs`);
    
    if (parsed.paragraphs.length < paragraphs.length) {
      console.warn(`WARNING: OpenAI only processed ${parsed.paragraphs.length} out of ${paragraphs.length} paragraphs!`);
    }

    // Store mapping if transcriptId provided
    if (transcriptId) {
      await setSpeakerMapping(transcriptId, mapping);
    }

    return NextResponse.json({ mapping });
    
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

