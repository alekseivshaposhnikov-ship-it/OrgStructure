/**
 * app-state.js
 * Единое состояние приложения (Фаза 2 рефакторинга).
 * Заменяет набор глобальных переменных в main.js.
 */

export function createAppState() {
  return {
    sourceTree: [],
    scenario: null,
    chart: null,
    selectedNode: null,
    showVacancies: true,
    cardDesign: localStorage.getItem("orgCardDesign") || "classic",
    cardWidth: Number(localStorage.getItem("orgCardWidth")) || 350,
    viewMode: "to-be",
    isOrgChartDelegationBound: false,
  };
}
