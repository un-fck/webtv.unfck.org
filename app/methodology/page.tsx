import { SiteHeader } from "@/components/site-header";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = {
  title: "Methodology — UN Web TV Transcripts",
  description:
    "How UN Web TV Transcripts works: data sources, AI transcription, speaker identification, and accuracy.",
};

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-un-blue/10 text-sm font-bold text-un-blue">
        {number}
      </div>
      <div className="pt-0.5">
        <h3 className={cn(typography.subTitle, "mb-1.5")}>{title}</h3>
        <div className="text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-12 sm:px-8">
        <div className="mb-10">
          <h1 className={cn(typography.pageTitle, "mb-3")}>Methodology</h1>
          <p className={typography.lead}>
            How meeting recordings become searchable transcripts.
          </p>
        </div>

        <div className={cn(typography.prose, "space-y-10")}>
          <section>
            <h2 className={cn(typography.sectionTitle, "mb-3")}>Overview</h2>
            <p className="text-muted-foreground">
              The system automatically collects recordings published on UN Web
              TV, transcribes the audio using AI, identifies speakers, and makes
              the resulting text searchable.
            </p>
          </section>

          <section>
            <h2 className={cn(typography.sectionTitle, "mb-5")}>
              How it works, step by step
            </h2>
            <div className="space-y-6">
              <Step number="1" title="Meeting schedule collection">
                The system monitors UN Web TV for newly published meeting
                recordings. Meeting metadata — title, date, UN organ, and
                document references — is extracted from the Web TV website and
                stored.
              </Step>

              <Step number="2" title="Audio transcription">
                The audio track of each meeting recording is processed by a
                large AI language model (Google Gemini) trained for speech
                recognition across multiple languages. The model converts spoken
                words into text, handles overlapping speech, and attempts to
                separate different speakers within the same audio.
              </Step>

              <Step number="3" title="Speaker identification">
                After transcription, a second AI model analyses the text and
                audio to assign names and affiliations to each speaker where
                possible. It uses contextual clues — such as the chair
                introducing delegates, country name mentions, and speaking
                patterns — together with the official list of participants when
                available.
              </Step>

              <Step number="4" title="Topic analysis">
                The transcript is automatically analysed to identify the main
                policy topics discussed, using categories relevant to UN
                proceedings (e.g. humanitarian affairs, international peace and
                security, human rights).
              </Step>

              <Step number="5" title="Official record alignment">
                Where official verbatim records (PV documents) exist, the system
                attempts to align them with the AI transcript. This links the
                audio timestamps to the formally approved text, providing a
                higher-confidence reference.
              </Step>
            </div>
          </section>

          <section>
            <h2 className={cn(typography.sectionTitle, "mb-3")}>
              Data sources
            </h2>
            <ul className="space-y-3 text-muted-foreground">
              {[
                {
                  label: "UN Web TV",
                  desc: "Meeting recordings and metadata (publicly accessible at webtv.un.org).",
                },
                {
                  label: "UN Document System",
                  desc: "Official verbatim records (PV documents) retrieved from documents.un.org where available.",
                },
                {
                  label: "Kaltura media platform",
                  desc: "The UN Web TV video and audio delivery infrastructure.",
                },
              ].map(({ label, desc }) => (
                <li key={label} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-un-blue" />
                  <span>
                    <strong>{label}</strong> — {desc}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className={cn(typography.sectionTitle, "mb-3")}>
              Accuracy and limitations
            </h2>
            <p className="mb-4 text-muted-foreground">
              AI transcription is significantly faster than human transcription
              but introduces errors that a human reviewer would catch. Common
              issues include:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              {[
                "Proper nouns — country names, delegate names, place names, and UN document symbols may be misheard or misspelt",
                "Technical terminology — legal or procedural phrases specific to UN practice may be transcribed incorrectly",
                "Accented speech — accuracy varies by speaker accent and microphone quality",
                "Overlapping speech — when multiple speakers talk simultaneously, attribution may be wrong",
                "Non-English passages — if no official translation track is available, passages in other UN languages are transcribed in the original language only",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-un-blue/50" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className={cn(typography.sectionTitle, "mb-3")}>
              Relationship to official UN records
            </h2>
            <div className="rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
              <p className="mb-3">
                Official UN verbatim records (PV documents) are produced by the
                UN Secretariat, reviewed and corrected by delegates, and
                formally approved. They are the authoritative record of what was
                said in a meeting.
              </p>
              <p>
                Automatically generated transcripts on this site are{" "}
                <strong className="text-foreground">
                  not a substitute for official records
                </strong>
                . They are a faster, unofficial reference that may be useful for
                monitoring and research — but they should not be cited as an
                authoritative source. Always verify important passages against
                official documentation at{" "}
                <a
                  href="https://documents.un.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-un-blue underline underline-offset-2 hover:opacity-75"
                >
                  documents.un.org
                </a>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className={cn(typography.sectionTitle, "mb-3")}>
              Independence and affiliation
            </h2>
            <p className="text-muted-foreground">
              This project is independent and not affiliated with, endorsed by,
              or operated by the United Nations. UN Web TV recordings are
              publicly accessible material. This tool indexes and processes them
              to improve accessibility, but does not alter the underlying
              content.
            </p>
          </section>

          <div className="border-t border-border pt-8">
            <Link
              href="/about"
              className="inline-flex items-center gap-2 text-sm font-medium text-un-blue hover:opacity-75"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M13 8H3M7 4L3 8l4 4" />
              </svg>
              Back to About
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
