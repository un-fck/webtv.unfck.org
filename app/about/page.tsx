import { SiteHeader } from "@/components/SiteHeader";

export const metadata = {
  title: "About — UN Web TV Transcripts",
  description:
    "Learn what UN Web TV Transcripts is, who it serves, and what meetings are covered.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-12 sm:px-8">
        <div className="max-w-2xl">
          <div className="mb-10">
            <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
              About
            </h1>
            <p className="text-lg text-muted-foreground">
              Automatic transcripts for UN Web TV meetings.
            </p>
          </div>

          <div className="space-y-10 text-base leading-relaxed text-foreground">
            <section>
              <h2 className="mb-3 text-xl font-semibold">What is this?</h2>
              <p className="text-muted-foreground">
                UN Web TV Transcripts is a public preview tool that automatically
                generates searchable text transcripts from United Nations meeting
                recordings published on{" "}
                <a
                  href="https://webtv.un.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-un-blue underline underline-offset-4 hover:opacity-75"
                >
                  UN Web TV
                </a>.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Who is it for?</h2>
              <p className="mb-3 text-muted-foreground">
                The tool is designed to help anyone who needs quick access to the
                spoken content of UN meetings, including:
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
              <h2 className="mb-3 text-xl font-semibold">What meetings are covered?</h2>
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
                Closed or confidential meetings are not recorded on Web TV and are
                therefore not covered.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Languages</h2>
              <p className="text-muted-foreground">
                Transcripts are generated primarily in English. Speeches delivered
                in other official UN languages (Arabic, Chinese, French, Russian,
                Spanish) are transcribed in the original language of the speaker.
                Machine translation is not applied — you will see the text in the
                language it was spoken.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Important limitations
              </h2>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="mb-2 font-semibold">These are AI-generated transcripts.</p>
                <p>
                  They are not official UN records. They may contain errors,
                  especially in names, country references, document symbols, and
                  technical terminology. For authoritative records, please refer
                  to the official{" "}
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
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Status</h2>
              <p className="text-muted-foreground">
                This tool is in <strong>Public Preview</strong>. Features,
                coverage, and accuracy are actively being improved. Feedback is
                welcome.
              </p>
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}
