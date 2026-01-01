export function healthColor(color: string) {
  switch (color) {
    case "dark_green": return "#065f46";
    case "light_green": return "#15803d";
    case "yellow": return "#a16207";
    case "red": return "#b91c1c";
    default: return "#374151";
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
  return tags.slice(0, 2);
}