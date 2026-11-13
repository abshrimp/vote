import { evaluateCondition, visitorFacts } from "./conditions.mjs";

function publicConfig(raw, eligible) {
  try {
    const config = JSON.parse(String(raw));
    if (!config || typeof config !== "object" || Array.isArray(config)) return {};
    if (!eligible) delete config.url;
    return config;
  } catch { return {}; }
}

/** Personalized action state. Published definitions may be cached; visitor facts never are. */
export function visitorActions(definitions, votes, claims) {
  if (!definitions.length) return [];
  const facts = visitorFacts(votes, claims);
  const claimed = new Map(claims.map(row => [String(row.action_id), String(row.redeemed_at)]));
  return definitions.filter(action => !action.hidden).map(action => {
    const redeemedAt = action.kind === "claim" ? claimed.get(String(action.id)) : undefined;
    const eligible = Boolean(redeemedAt) ||
      evaluateCondition(JSON.parse(String(action.condition_json)), facts);
    return {
      id: action.id,
      title: action.title,
      description: eligible || action.kind === "claim"
        ? action.description : "利用条件を満たすと内容を確認できます。",
      kind: action.kind,
      config: publicConfig(action.config_json, eligible),
      eligible,
      status: redeemedAt ? "used" : null,
      usedAt: redeemedAt ?? null,
    };
  });
}
