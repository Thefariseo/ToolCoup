// Names of the ensemble components. The description follows the data, so the text stays true for editions produced before a
// component was added: summary.json carries no ensemble_weights up to the 2026-11 issue, and those editions used three components.
const NAMES = { logit: "logistic regression", gbm: "gradient boosting", rf: "random forest", lgbm: "LightGBM", storia_contagio: "a coup-history model" };
const FIRST_THREE = ["logit", "gbm", "rf"];

export function ensembleComponents(meta) {
  const keys = meta?.ensemble_weights ? Object.keys(meta.ensemble_weights) : FIRST_THREE;
  return keys.map((k) => NAMES[k] || k);
}

/** "logistic regression, gradient boosting, random forest and LightGBM" */
export function ensembleDescription(meta) {
  const names = ensembleComponents(meta);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] || "";
}
