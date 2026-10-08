/**
 * app-state.js
 * Единое состояние приложения (Фаза 2 рефакторинга).
 * Заменяет набор глобальных переменных в main.js.
 */

// CR-023 §3: в приложении остаются только два режима дизайна карточек —
// «Текущий» (classic) и «Группировка по должности» (grouped).
export const ALLOWED_CARD_DESIGNS = ["classic", "grouped"];

/**
 * Приводит сохранённое значение дизайна к допустимому набору.
 * Устаревшие значения (variant2/variant3/compact-a4) → «Текущий».
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function normalizeCardDesign(value) {
  return ALLOWED_CARD_DESIGNS.includes(value) ? value : "classic";
}

export function createAppState() {
  return {
    sourceTree: [],
    scenario: null,
    chart: null,
    selectedNode: null,
    showVacancies: true,
    cardDesign: normalizeCardDesign(localStorage.getItem("orgCardDesign")),
    cardWidth: Number(localStorage.getItem("orgCardWidth")) || 350,
    viewMode: "to-be",
    isOrgChartDelegationBound: false,
  };
}
