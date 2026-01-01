import { FEATURES } from "@/lib/features";

const FEATURE_SET = new Set(FEATURES.map(f => f.key));

type ParsedFeature = {
  feature_key: string;
  feature_raw: string | null;
};

export function parseFeatureFromUrl(url: string): ParsedFeature | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const locIndex = parts.indexOf("location");
    if (locIndex === -1) return null;

    const feature = parts[locIndex + 2] ?? null;
    if (!feature) return null;

    if (FEATURE_SET.has(feature)) {
      return { feature_key: feature, feature_raw: null };
    }

    return { feature_key: "other", feature_raw: feature };
  } catch {
    return null;
  }
}

export function extractFeatureKey(url: string): string | null {
  return parseFeatureFromUrl(url)?.feature_key ?? null;
}
