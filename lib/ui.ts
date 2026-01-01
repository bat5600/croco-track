export function fmtSec(sec: number) {
  const n = Math.max(0, Math.floor(Number(sec || 0)));
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const r = n % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export function healthColor(color?: string) {
  switch (color) {
    case "dark_green": return { bg: "#064e3b", fg: "#ecfdf5" };
    case "light_green": return { bg: "#166534", fg: "#f0fdf4" };
    case "yellow": return { bg: "#a16207", fg: "#fffbeb" };
    case "red": return { bg: "#b91c1c", fg: "#fef2f2" };
    default: return { bg: "#374151", fg: "#f9fafb" };
  }
}

export function trendIcon(indicator?: string) {
  if (indicator === "UP") return "↑";
  if (indicator === "DOWN") return "↓";
  return "→";
}

export function riskTags(risk: any): string[] {
  const tags: string[] = [];
  if (!risk) return tags;
  if (risk.activity_drop) tags.push("Activity drop");
  if (risk.adoption_stagnation) tags.push("Low adoption");
  if (risk.engagement_weak) tags.push("Low engagement");
  if (Array.isArray(risk.abandoned_features) && risk.abandoned_features.length) tags.push("Feature abandon");
  return tags;
}

export function cardStyle() {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    background: "white",
  } as const;
}

export function pageShell() {
  return {
    padding: 24,
    fontFamily: "system-ui",
    maxWidth: 1060,
    margin: "0 auto",
    background: "#fafafa",
    minHeight: "100vh",
  } as const;
}