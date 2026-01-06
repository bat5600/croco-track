import { FEATURES } from "@/lib/features";

const FEATURE_SET = new Set(FEATURES.map((f) => f.key));
const FEATURE_ALIASES: Record<string, string> = {
  "page-builder": "funnels-websites",
  "quiz-builder-v2": "survey-builder",
  "form-builder-v2": "form-builder",
};

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

    const nextSegment = parts[locIndex + 3] ?? null;
    if (feature === "marketing" && nextSegment === "emails") {
      return { feature_key: "email", feature_raw: null };
    }
    if (feature === "emails") {
      return { feature_key: "email", feature_raw: null };
    }

    if (FEATURE_SET.has(feature)) {
      return { feature_key: feature, feature_raw: null };
    }

    const aliasTarget = FEATURE_ALIASES[feature];
    if (aliasTarget) {
      return { feature_key: aliasTarget, feature_raw: null };
    }

    return { feature_key: "other", feature_raw: feature };
  } catch {
    return null;
  }
}

export function extractFeatureKey(url: string): string | null {
  return parseFeatureFromUrl(url)?.feature_key ?? null;
}

export function extractLocationIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const locIndex = parts.indexOf("location");
    if (locIndex === -1) return null;
    return parts[locIndex + 1] ?? null;
  } catch {
    return null;
  }
}
