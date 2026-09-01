/**
 * employee.js
 * Единые правила подготовки и presentation сотрудников (CR-016).
 *
 * Содержит единственные источники правил:
 *   - isEmployeeExcludedByState() — статусная фильтрация (бизнес-правило в одном месте);
 *   - formatEmployeeDisplayName() — сокращение ФИО для карточек оргструктуры.
 * Исходное полное ФИО (full_name) никогда не мутируется.
 */

/** Статусы сотрудников, полностью исключаемых из отображаемой оргструктуры. */
export const EXCLUDED_EMPLOYEE_STATES = new Set([
  "Отпуск по уходу за ребенком",
]);

/**
 * Top-3 (CR-016 §20): единственные сотрудники, для которых на организационной
 * диаграмме сохраняется полное ФИО «Фамилия Имя Отчество».
 * Правило задаётся здесь (единый источник) и дополнительно фиксируется в
 * leadership configuration (CR-016 §25). Renderer не знает конкретные ФИО —
 * он работает только по семантическому флагу `keepFullName`.
 */
export const TOP_THREE_FULL_NAMES = new Set([
  "Селиванов Василий Геннадиевич",
  "Лукьянов Алексей Александрович",
  "Клюев Алексей Васильевич",
]);

/**
 * Нужно ли сохранять полное ФИО сотрудника на организационной диаграмме
 * (CR-016 §20, §24): true только для top-3. Сравнение строгое по полному
 * имени (trim), без fuzzy/includes.
 *
 * @param {string|null|undefined} fullName
 * @returns {boolean}
 */
export function shouldKeepFullName(fullName) {
  return TOP_THREE_FULL_NAMES.has(String(fullName || "").trim());
}

/**
 * Является ли сотрудник исключённым из оргструктуры по статусу (CR-016 §3-4).
 * Сравнение строгое: String(value).trim(), без fuzzy/includes.
 *
 * @param {{state?: string}|null|undefined} employee
 * @returns {boolean}
 */
export function isEmployeeExcludedByState(employee) {
  const state = String(employee?.state || "").trim();
  return EXCLUDED_EMPLOYEE_STATES.has(state);
}

/**
 * Presentation-имя сотрудника для карточек организационной структуры (CR-016 §19-30):
 * «Фамилия Имя Отчество» → «Фамилия Имя» для всех, кроме top-3 (keepFullName).
 *
 * Правила:
 * - исходное полное имя не изменяется (работает только с копией/строкой);
 * - keepFullName=true сохраняет полное ФИО (Селиванов/Лукьянов/Клюев);
 * - имена из 1-2 слов возвращаются без изменений (без "undefined" второй части).
 *
 * @param {string|{full_name?:string, fullName?:string, name?:string}|null} value
 * @param {{keepFullName?: boolean}} [options]
 * @returns {string}
 */
export function formatEmployeeDisplayName(value, { keepFullName = false } = {}) {
  const fullName = String(
    typeof value === "object" && value !== null
      ? value.full_name || value.fullName || value.name || ""
      : value || "",
  ).trim();

  if (!fullName || keepFullName) {
    return fullName;
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) {
    return fullName;
  }

  return `${parts[0]} ${parts[1]}`;
}
