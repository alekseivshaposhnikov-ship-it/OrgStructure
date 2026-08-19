/**
 * tree.js
 * Общие утилиты работы с деревом оргструктуры и нормализацией данных
 * (Фаза 1 рефакторинга). Ранее дублировались в api.js, scenario-manager.js,
 * layout.js.
 */

/** Глубокая копия дерева/массива. Для null/undefined возвращает []. */
export function cloneTree(value) {
  return JSON.parse(JSON.stringify(value || []));
}

/** Проставляет level каждому узлу дерева (рекурсивно). */
export function addLevels(nodes, level = 0) {
  (nodes || []).forEach((n) => {
    n.level = level;
    if (n.children) {
      addLevels(n.children, level + 1);
    }
  });
}

/** Обрезает должность по "/" (краткая форма). */
export function shortPosition(pos) {
  if (!pos) return "";
  const idx = pos.indexOf("/");
  return idx !== -1 ? pos.substring(0, idx).trim() : pos.trim();
}

/**
 * Нормализует sub_level: запятая → точка, пустые значения → MAX_SAFE_INTEGER.
 */
export function parseSubLevel(value) {
  if (value === undefined || value === null || value === "") {
    return Number.MAX_SAFE_INTEGER;
  }

  return parseFloat(String(value).replace(",", ".")) || Number.MAX_SAFE_INTEGER;
}

/** Рекурсивный поиск подразделения по department_guid. */
export function findDepartmentById(nodes, departmentId) {
  for (const node of nodes || []) {
    if (node.department_guid === departmentId) return node;

    const found = findDepartmentById(node.children || [], departmentId);
    if (found) return found;
  }

  return null;
}
