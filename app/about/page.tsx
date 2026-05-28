import { SiteHeader } from "@/components/site-header";
import { typography } from "@/lib/typography";
import { pageWidth } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { STT_ROUTING } from "@/lib/providers/config";
import { getProvider } from "@/lib/providers/registry";
import { UN_LANGUAGES, getLanguageDisplayName } from "@/lib/languages";
import { getCurrentUser, isAllowedDomain } from "@/lib/auth/service";

export const metadata = {
  title: "About — UN Web TV Transcripts",
  description:
    "What UN Web TV Transcripts is, who it serves, how it works, and its accuracy and limitations.",
};

// Reads the current user to decide whether to render the experimental-features
// section (UN-domain users only); must render dynamically per viewer.
export const dynamic = "force-dynamic";

/** Per-language transcription-model rows, derived from config. */
const STT_ROWS = UN_LANGUAGES.map(({ code }) => ({
  language: getLanguageDisplayName(code),
  provider: getProvider(STT_ROUTING[code] ?? STT_ROUTING.floor).label,
}));

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

export default async function AboutPage() {
  // Only show the experimental-features section to logged-in users on a
  // UN-system domain. Anonymous viewers and non-UN logged-in users don't see
  // it at all (deliberate: experimental access is currently UN-only).
  const user = await getCurrentUser();
  const showExperimental = user ? await isAllowedDomain(user.email) : false;

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className={cn("mx-auto px-6 pb-12 sm:px-8", pageWidth)}>
        <nav className="py-3">
          <a
            href="/"
            className={cn(
              typography.caption,
              "transition-colors hover:text-foreground",
            )}
          >
            ← Back to homepage
          </a>
        </nav>
        <div className="max-w-2xl">
          <div className="mb-10">
            <h1 className={cn(typography.pageTitle, "mb-3")}>About</h1>
            <p className={typography.lead}>
              Automatic transcripts for UN Web TV meetings.
            </p>
          </div>

          <div className={cn(typography.prose, "space-y-10")}>
            <section>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                What is this?
              </h2>
              <p className="text-muted-foreground">
                UN Web TV Transcripts is a public preview tool that
                automatically generates searchable text transcripts from United
                Nations meeting recordings published on{" "}
                <a
                  href="https://webtv.un.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-un-blue underline underline-offset-4 hover:opacity-75"
                >
                  UN Web TV
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                Who is it for?
              </h2>
              <p className="mb-3 text-muted-foreground">
                The tool is designed to help anyone who needs quick access to
                the spoken content of UN meetings, including:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                {[
                  "Diplomats and delegation staff following proceedings across multiple organs",
                  "Researchers and academics studying UN debates and voting records",
                  "Journalists covering United Nations affairs",
                  "Civil society organisations monitoring policy discussions",
                  "UN Secretariat staff reviewing meeting records",
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                What meetings are covered?
              </h2>
              <p className="mb-3 text-muted-foreground">
                The tool covers public meetings recorded and published on UN Web
                TV, including:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                {[
                  "Security Council (SC) — open meetings and briefings",
                  "General Assembly (GA) — plenary and main committee sessions",
                  "Human Rights Council (HRC)",
                  "Economic and Social Council (ECOSOC)",
                  "Other inter-governmental bodies as available on Web TV",
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 text-muted-foreground">
                Closed or confidential meetings are not recorded on Web TV and
                are therefore not covered.
              </p>
            </section>

            <section>
              <h2 className={cn(typography.sectionTitle, "mb-5")}>
                How it works
              </h2>
              <div className="space-y-6">
                <Step number="1" title="Meeting schedule collection">
                  The system monitors UN Web TV for newly published meeting
                  recordings. Meeting metadata — title, date, UN organ, and
                  document references — is extracted from the Web TV website and
                  stored.
                </Step>

                <Step number="2" title="Audio transcription">
                  Each language track is transcribed by a speech-to-text model
                  chosen for that language (see the table below) — no single
                  model is best across all of them. The model converts spoken
                  words into text with timestamps and tracks when the speaker
                  changes, but it does <em>not</em> try to name the speakers;
                  that is done in the next step. UN meetings provide separate
                  audio channels per language (plus the original
                  &ldquo;floor&rdquo; mix), and each is transcribed
                  independently. Machine translation is not applied — text
                  appears in the language it was spoken.
                </Step>

                <Step number="3" title="Speaker identification">
                  After transcription, a second AI model analyses the text and
                  audio to assign names and affiliations to each speaker where
                  possible. It uses contextual clues — such as the chair
                  introducing delegates, country name mentions, and speaking
                  patterns — together with the official list of participants
                  when available.
                </Step>

                <Step number="4" title="Topic analysis">
                  The transcript is automatically analysed to identify the main
                  policy topics discussed, using categories relevant to UN
                  proceedings (e.g. humanitarian affairs, international peace
                  and security, human rights).
                </Step>

                <Step number="5" title="Official record alignment">
                  Where official verbatim records (PV documents) exist, the
                  system attempts to align them with the AI transcript. This
                  links the audio timestamps to the formally approved text,
                  providing a higher-confidence reference.
                </Step>
              </div>
            </section>

            <section>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                Transcription model per language
              </h2>
              <p className="mb-4 text-muted-foreground">
                Different speech-to-text providers excel at different languages,
                so each track is routed to the model that performs best for it
                in our evaluation. Speaker names are always assigned afterwards
                by the speaker-identification step, not by these models.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-4 py-2 font-medium">Language track</th>
                      <th className="px-4 py-2 font-medium">
                        Transcription model
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {STT_ROWS.map((row) => (
                      <tr key={row.language} className="border-b last:border-0">
                        <td className="px-4 py-2">{row.language}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {row.provider}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                Accuracy and limitations
              </h2>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="mb-2 font-semibold">
                  These transcripts are created using automatic speech
                  recognition and are not official UN records.
                </p>
                <p>
                  They are a faster, unofficial reference that may be useful for
                  monitoring and research, but should not be cited as
                  authoritative. For the official record, please refer to the{" "}
                  <a
                    href="https://documents.un.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:opacity-75"
                  >
                    UN documentation system
                  </a>{" "}
                  (verbatim records, summary records, and resolutions).
                </p>
              </div>
              <p className="mb-3 text-muted-foreground">
                Automatic transcription is much faster than human transcription
                but introduces errors a human reviewer would catch. Common
                issues include:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                {[
                  "Proper nouns — country names, delegate names, place names, and UN document symbols may be misheard or misspelt",
                  "Technical terminology — legal or procedural phrases specific to UN practice may be transcribed incorrectly",
                  "Accented speech — accuracy varies by speaker accent and microphone quality",
                  "Overlapping speech — when multiple speakers talk simultaneously, attribution may be wrong",
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
                Data sources
              </h2>
              <ul className="space-y-3 text-muted-foreground">
                {[
                  {
                    label: "UN Web TV",
                    desc: "Meeting recordings and metadata, delivered via the Kaltura media platform (publicly accessible at webtv.un.org).",
                  },
                  {
                    label: "UN Document System",
                    desc: "Official verbatim records (PV documents) retrieved from documents.un.org where available.",
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
              <h2 className={cn(typography.sectionTitle, "mb-3")}>Status</h2>
              <p className="text-muted-foreground">
                This tool is in <strong>Public Preview</strong>. Features,
                coverage, and accuracy are actively being improved. Feedback is
                welcome.
              </p>
            </section>

            {showExperimental && (
              <section>
                <h2 className={cn(typography.sectionTitle, "mb-3")}>
                  Experimental features
                </h2>
                <p className="mb-3 text-muted-foreground">
                  There are additional experimental features still being
                  evaluated. If you&rsquo;d like to try them,{" "}
                  <a
                    href="mailto:david.pomerenke@un.org?subject=Experimental%20features%20access"
                    className="text-un-blue underline underline-offset-4 hover:opacity-75"
                  >
                    contact us
                  </a>{" "}
                  with the email address of your account.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
