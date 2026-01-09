export const NO_DATA_LABEL = "Collecting Data...";

export const HEALTH_SCORE_MAX = 100;
export const LOGIN_DAYS_WINDOW = 7;
export const LOGIN_SCORE_MAX = 20;
export const LOGIN_SCORE_MAX_DAYS = 5;
export const FEATURES_SCORE_MAX = 20;
export const TREND_SCORE_MAX = 10;

export function normalizeScore(score: unknown): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.round(score);
}

export function scoreToStatus(score: number | null): string {
  if (score === null) return NO_DATA_LABEL;
  if (score >= 80) return "Thriving";
  if (score >= 60) return "Healthy";
  if (score >= 45) return "Steady";
  return "At-risk";
}

export function scoreToColor(score: number | null): string | undefined {
  if (score === null) return undefined;
  if (score >= 80) return "dark_green";
  if (score >= 60) return "light_green";
  if (score >= 45) return "yellow";
  return "red";
}

export function pctFromScore(score: number | null, max: number): number {
  if (!max) return 0;
  if (score === null) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

export function displayScore(score: number | null, suffix = ""): string {
  return score === null ? NO_DATA_LABEL : `${score}${suffix}`;
}

export function loginDaysFromScore(score: number | null): number | null {
  if (score === null) return null;
  const days = Math.round((score / LOGIN_SCORE_MAX) * LOGIN_SCORE_MAX_DAYS);
  return Math.max(0, Math.min(LOGIN_DAYS_WINDOW, days));
}
