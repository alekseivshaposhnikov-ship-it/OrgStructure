/**
 * app-state.js
 * Единое состояние приложения (Фаза 2 рефакторинга).
 * Заменяет набор глобальных переменных в main.js.
 */

import { createExpandState } from "../domain/expand-state.js";

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
    // CR-023-01 §4: вакансии скрыты по умолчанию (включаются переключателем).
    showVacancies: false,
    // CR-023-01 §3: диагностика уровней скрыта по умолчанию.
    showLevels: false,
    cardDesign: normalizeCardDesign(localStorage.getItem("orgCardDesign")),
    cardWidth: Number(localStorage.getItem("orgCardWidth")) || 350,
    viewMode: "to-be",
    isOrgChartDelegationBound: false,
    // CR-024 §2.5: состояние раскрытия подразделений/сотрудников хранится по
    // стабильному id и переживает перерисовки (поиск, фильтры, вакансии).
    expandState: createExpandState(),
  };
}
