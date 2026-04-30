export function getAnalysisModel(): string {
  return process.env.STT_ANALYSIS_MODEL || "gpt-5.4";
}

export function getAnalysisModelMini(): string {
  return process.env.STT_ANALYSIS_MODEL_MINI || "gpt-5.4-mini";
}

export function getAnalysisModelNano(): string {
  return process.env.STT_ANALYSIS_MODEL_NANO || "gpt-5.4-nano";
}
