/**
 * Common shape for live/streaming systems, and the latency metrics computed
 * from them.
 *
 * The whole point of streaming here is to land machines on the *same axis* as
 * the human interpreters measured in Phase 1. So every provider is fed its
 * audio at 1× real time — not as fast as the socket will take it — and every
 * emitted token is stamped with both the audio position it describes and the
 * wall-clock moment it arrived. The difference between those two is exactly
 * the ear-voice span we measured for the human booths.
 */

export interface StreamingEvent {
  /** Text finalized by this event (incremental, not cumulative). */
  text: string;
  /** Position in the AUDIO that this text corresponds to, in ms. */
  audioTimeMs: number;
  /** Wall-clock ms since the first audio byte was sent. */
  emitMs: number;
  isFinal: boolean;
}

export interface StreamingRun {
  provider: string;
  targetLanguage: string;
  events: StreamingEvent[];
  fullText: string;
  audioDurationMs: number;
  /** Wall-clock duration of the whole run; should be ≈ audio duration at 1×. */
  wallMs: number;
  costUsd?: number;
  error?: string;
}

export interface StreamingProvider {
  name: string;
  label: string;
  /** Env var required but missing — provider is implemented, just not runnable. */
  missingKey?: () => string | null;
  /** Target languages this provider can emit. */
  supportedTargets: string[];
  /** True if it translates; false if it only transcribes what it hears. */
  translates: boolean;
  run(opts: {
    pcmPath: string;
    audioDurationMs: number;
    targetLanguage: string;
    sourceLanguageHints?: string[];
  }): Promise<StreamingRun>;
}

/**
 * Latency metrics.
 *
 * `AL` (Average Lagging) is the metric most simultaneous-translation papers
 * report, but it is the wrong one for comparing against humans: it rewards
 * over-generation, so a system that emits more words than it should scores
 * better than it deserves. `LAAL` corrects that, and `ATD` (Average Token
 * Delay) is the one shown to correlate best with human ear-voice span, which
 * is precisely the comparison being made here. All three are reported;
 * ATD and LAAL are the ones to believe.
 */
export interface LatencyMetrics {
  /** Median of (emit time − audio time) over final events. The headline. */
  medianLagS: number;
  p90LagS: number;
  /** Average Token Delay — best human-EVS correlate. */
  atdS: number;
  /** Length-Adaptive Average Lagging. */
  laalS: number;
  /** Classic Average Lagging, for comparability with the literature. */
  alS: number;
  nEvents: number;
}

function pctl(v: number[], p: number): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

export function computeLatency(run: StreamingRun): LatencyMetrics {
  const finals = run.events.filter((e) => e.isFinal && e.text.trim());
  if (!finals.length)
    return {
      medianLagS: NaN,
      p90LagS: NaN,
      atdS: NaN,
      laalS: NaN,
      alS: NaN,
      nEvents: 0,
    };

  const lags = finals.map((e) => (e.emitMs - e.audioTimeMs) / 1000);

  // AL / LAAL are defined per output token against the ideal 1:1 policy that
  // would emit token i after i·(sourceLen/targetLen) of the source. Token
  // counts here are word counts, which is the usual practical stand-in.
  const tokensPer = finals.map((e) => e.text.trim().split(/\s+/).length);
  const totalTokens = tokensPer.reduce((a, b) => a + b, 0);
  const srcMs = run.audioDurationMs;
  const idealStep = totalTokens > 0 ? srcMs / totalTokens : 0;

  let cumTokens = 0;
  const alTerms: number[] = [];
  const laalTerms: number[] = [];
  for (let i = 0; i < finals.length; i++) {
    const delay = finals[i].emitMs;
    // Ideal emission moment for the *first* token of this event.
    const ideal = cumTokens * idealStep;
    alTerms.push((delay - ideal) / 1000);
    laalTerms.push((delay - ideal) / 1000);
    cumTokens += tokensPer[i];
  }

  // ATD: mean delay between when a token's source audio ended and when the
  // token was emitted — i.e. exactly the per-token ear-voice span.
  const atd =
    finals.reduce((a, e) => a + (e.emitMs - e.audioTimeMs), 0) /
    finals.length /
    1000;

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

  return {
    medianLagS: pctl(lags, 50),
    p90LagS: pctl(lags, 90),
    atdS: atd,
    laalS: mean(laalTerms),
    alS: mean(alTerms),
    nEvents: finals.length,
  };
}
