/**
 * tokens.js
 * Общие токены оформления диаграмм (Фаза 4 рефакторинга).
 * Единый источник цветов и сценарий-стайлов для экранных и PDF-рендеров.
 */

export const COLORS = {
  blue: "#155eef",
  blueLight: "#eef4ff",
  text: "#101828",
  muted: "#667085",
  border: "#d0d5dd",
  line: "#98a2b3",
  white: "#ffffff",
  purple: "#7a5af8",
  red: "#f04438",

  deptBg: "#f8fbff",
  vacancyBg: "#f0f9ff",
  vacancyStroke: "#7cc4f8",
  assistantBg: "#f8fafc",
  assistantStroke: "#9e77ed",

  addedBg: "#dcfae6",
  addedText: "#067647",
  changedBg: "#dbeafe",
  changedText: "#1d4ed8",
  movedBg: "#f4e8ff",
  movedText: "#7e22ce",
  removedBg: "#fee4e2",
  removedText: "#b42318",
};

export const SCENARIO_LABELS = {
  added: "NEW",
  changed: "Изменен",
  moved: "Перемещен",
  removed: "Удален",
};

/** Возвращает подпись сценария или "" для неизвестного состояния. */
export function getScenarioLabel(state) {
  return SCENARIO_LABELS[state] || "";
}

/** Возвращает { bg, text } для бейджа состояния сценария. */
export function getScenarioColors(state) {
  const styles = {
    added: { bg: COLORS.addedBg, text: COLORS.addedText },
    changed: { bg: COLORS.changedBg, text: COLORS.changedText },
    moved: { bg: COLORS.movedBg, text: COLORS.movedText },
    removed: { bg: COLORS.removedBg, text: COLORS.removedText },
  };

  return styles[state] || { bg: "#f2f4f7", text: "#344054" };
}
