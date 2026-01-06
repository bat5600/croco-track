import { FEATURES } from "@/lib/features";

type Feature = { key: string; label: string };

const FEATURE_GROUPS: Array<{ key: string; label: string; members: string[] }> = [
  {
    key: "forms-survey-quiz-builder",
    label: "Forms, Survey, Quiz Builder",
    members: ["form-builder", "survey-builder"],
  },
];

const FEATURE_ALIASES: Record<string, string> = {
  "page-builder": "funnels-websites",
  "quiz-builder-v2": "survey-builder",
  "quiz-builder": "survey-builder",
  "form-builder-v2": "form-builder",
  workflow: "automation",
  emails: "email",
  analytics: "dashboard",
};

const MEMBER_TO_GROUP = new Map<string, string>();
const GROUP_BY_KEY = new Map<string, { key: string; label: string; members: string[] }>();

for (const group of FEATURE_GROUPS) {
  GROUP_BY_KEY.set(group.key, group);
  for (const member of group.members) {
    MEMBER_TO_GROUP.set(member, group.key);
  }
}

export function getAggregatedFeatureKey(featureKey: string): string {
  const normalizedKey = FEATURE_ALIASES[featureKey] ?? featureKey;
  return MEMBER_TO_GROUP.get(normalizedKey) ?? normalizedKey;
}

export function getFeatureLabel(key: string, features: Feature[] = FEATURES): string {
  const group = GROUP_BY_KEY.get(key);
  if (group) return group.label;
  return features.find((f) => f.key === key)?.label ?? key;
}

export function getDisplayFeatures(features: Feature[] = FEATURES): Feature[] {
  const result: Feature[] = [];
  const addedGroups = new Set<string>();

  for (const feature of features) {
    const groupKey = MEMBER_TO_GROUP.get(feature.key);
    if (groupKey) {
      if (!addedGroups.has(groupKey)) {
        const group = GROUP_BY_KEY.get(groupKey);
        if (group) {
          result.push({ key: group.key, label: group.label });
          addedGroups.add(groupKey);
        }
      }
      continue;
    }
    result.push(feature);
  }

  return result;
}
