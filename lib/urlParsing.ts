import { FEATURES } from "@/lib/features";

const FEATURE_SET = new Set(FEATURES.map(f => f.key));

export function extractFeatureKey(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const locIndex = parts.indexOf("location");
    if (locIndex === -1) return null;

    const feature = parts[locIndex + 2] ?? null;
    if (!feature) return null;

    return FEATURE_SET.has(feature) ? feature : null;
  } catch {
    return null;
  }
}
