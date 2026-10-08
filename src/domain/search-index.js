/**
 * search-index.js
 * CR-024 §4: глобальный поиск сотрудников по загруженной организационной
 * структуре. Индекс строится локально по данным (без запросов к серверу) и не
 * изменяет модель: поиск — только чтение (CR-024 §4.7).
 *
 * Правила поиска (CR-024 §4.2):
 *   - по фамилии/имени/отчеству и части любого компонента ФИО;
 *   - по сочетанию фамилии и имени;
 *   - без учёта регистра; «е» и «ё» эквивалентны;
 *   - поиск начинается с 2 символов.
 */

import { formatEmployeeDisplayName } from "../core/utils/employee.js";

/** Нормализация строки для поиска: нижний регистр, ё→е, схлопывание пробелов. */
export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export const MIN_SEARCH_LENGTH = 2;

function departmentId(node) {
  return node?.department_guid || node?.id || "";
}

function departmentName(node) {
  return node?.department_name || node?.name || "";
}

function nameOf(person) {
  return person?.full_name || person?.name || "";
}

/**
 * Строит локальный поисковый индекс по дереву организационной структуры.
 *
 * @param {Array} roots - массив корневых узлов (например, sourceTree)
 * @returns {Array<object>} записи: ФИО, должность, путь, id подразделения
 */
export function buildSearchIndex(roots) {
  const entries = [];
  const seen = new Set();

  function push(person, { path, pathIds, isManager = false }) {
    const fullName = nameOf(person);
    if (!fullName) return;

    const id = isManager ? `manager:${pathIds[pathIds.length - 1]}` : person.id;
    const departmentIdValue = pathIds[pathIds.length - 1] || "";
    const key = `${id}|${departmentIdValue}|${normalizeSearchText(person.position)}`;
    if (seen.has(key)) return;
    seen.add(key);

    entries.push({
      id,
      fullName,
      displayName: formatEmployeeDisplayName(fullName, {
        keepFullName: Boolean(person.keepFullName),
      }),
      position: person.position || "",
      departmentId: departmentIdValue,
      departmentName: path[path.length - 1] || "",
      path: path.slice(),
      pathIds: pathIds.slice(),
      isManager,
      isVacancy: false,
      // Куда фокусироваться: у руководителя карточки-сотрудника нет — только
      // карточка подразделения; у обычного сотрудника — его собственная карточка.
      focusId: isManager ? departmentIdValue : person.id,
      searchName: normalizeSearchText(fullName),
    });
  }

  function walk(node, path, pathIds) {
    if (!node) return;
    const id = departmentId(node);
    const nextPath = [...path, departmentName(node)];
    const nextIds = [...pathIds, id];

    // Руководитель подразделения — тоже сотрудник (CR-024 §4.2).
    if (node.department_manager) {
      push(
        {
          full_name: node.department_manager,
          position: node.department_manager_position || "",
          keepFullName: Boolean(node.keepFullName),
        },
        { path: nextPath, pathIds: nextIds, isManager: true },
      );
    }

    const employees = (node.users || []).filter((user) => !user.isVacancy);
    employees.forEach((employee) =>
      push(employee, { path: nextPath, pathIds: nextIds }),
    );

    (node.children || []).forEach((child) =>
      walk(child, nextPath, nextIds),
    );
  }

  (roots || []).forEach((root) => walk(root, [], []));

  return entries;
}

function scoreEntry(entry, query) {
  if (entry.searchName === query) return 0;
  if (entry.searchName.startsWith(`${query} `)) return 1;
  if (entry.searchName.startsWith(query)) return 2;
  const parts = entry.searchName.split(" ");
  if (parts.some((part) => part.startsWith(query))) return 3;
  return 4;
}

function matchesEntry(entry, query) {
  if (entry.searchName.includes(query)) return true;
  return entry.searchName.split(" ").some((part) => part.startsWith(query));
}

/**
 * Ищет сотрудников по подстроке ФИО.
 *
 * @param {Array<object>} index - результат buildSearchIndex
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {Array<object>} отсортированные совпадения
 */
export function searchEmployees(index, query, { limit = 50 } = {}) {
  const normalized = normalizeSearchText(query);
  if (normalized.length < MIN_SEARCH_LENGTH) return [];

  return (index || [])
    .filter((entry) => matchesEntry(entry, normalized))
    .map((entry) => ({ entry, score: scoreEntry(entry, normalized) }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.entry.searchName.localeCompare(b.entry.searchName);
    })
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** Человекочитаемое расположение «Дирекция → Отдел → Группа» (CR-024 §4.3). */
export function formatSearchPath(entry) {
  return (entry?.path || []).filter(Boolean).join(" → ");
}
