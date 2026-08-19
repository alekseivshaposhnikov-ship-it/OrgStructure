/**
 * unified-layout.js
 *
 * Единый layout организационной диаграммы (CR007).
 *
 * Принцип:
 *   - Вертикальная координата (строка) — управленческий уровень руководителя
 *     подразделения (manager.subLevel), fallback: уровень родителя + 1.
 *   - Горизонтальная координата (колонка) — реальная parent-child иерархия.
 *   - Сотрудники/вакансии не являются организационным уровнем и выводятся
 *     отдельной колонкой внутри ветки своего подразделения.
 *   - Административный ассистент — специальный узел рядом с корнем.
 *
 * Модуль не зависит от DOM и легко тестируется.
 */

const MAX_SUBLEVEL = Number.MAX_SAFE_INTEGER;

/**
 * Нормализует управленческий уровень подразделения для layout (CR-008_3).
 * Дробная часть sub_level не создаёт отдельный визуальный ряд:
 * 4.0, 4.1, 4.9 → management level 4.
 * Не изменяет исходное значение sub_level.
 */
export function normalizeManagementLevel(subLevel) {
  if (!Number.isFinite(subLevel)) return null;
  return Math.floor(subLevel);
}

export const NODE_DEPARTMENT = "department";
export const NODE_EMPLOYEES = "employees";
export const NODE_ASSISTANT = "assistant";

const DEFAULT_OPTIONS = {
  showVacancies: true,
  departmentWidth: 350,
  departmentHeight: 130,
  employeeWidth: 350,
  employeeHeight: 96,
  assistantWidth: 350,
  assistantHeight: 96,
  employeesHeaderHeight: 28,
  colGap: 40,
  rowGap: 60,
  personGap: 8,
  contentGap: 30,
  paddingX: 40,
  paddingY: 40,
};

export function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return position.includes("административный ассистент");
}

export function findAdministrativeAssistant(users) {
  return (users || []).find((user) => isAdministrativeAssistant(user)) || null;
}

export function findAdministrativeAssistantInSubtree(node) {
  const ownAssistant = findAdministrativeAssistant(node.users || []);
  if (ownAssistant) return ownAssistant;

  for (const child of node.children || []) {
    const childAssistant = findAdministrativeAssistantInSubtree(child);
    if (childAssistant) return childAssistant;
  }

  return null;
}

/**
 * Строит внутреннее дерево layout-модели.
 * Узел: { type, data?, persons?, children?, rawLevel?, row?, x?, y?, width?, height?, subtreeWidth? }
 */
export function buildLayoutTree(
  rootNode,
  { showVacancies = true, collapsedIds = null } = {},
) {
  const assistantsToSkip = new Set();
  const rootAssistant = rootNode ? findAdministrativeAssistantInSubtree(rootNode) : null;
  if (rootAssistant?.id) assistantsToSkip.add(rootAssistant.id);

  function buildDepartment(node, isRoot) {
    const data = {
      id: node.department_guid || node.id,
      isDepartment: true,
      name: node.department_name || node.name || "Без названия",
      headName: node.department_manager || "",
      headPosition: node.department_manager_position || "",
      staffCount: node.staffCount || 0,
      vacancyCount: node.vacancyCount || 0,
      totalWithVacancies: node.totalWithVacancies ?? node.staffCount ?? 0,
      scenarioState: node.scenarioState || "",
      managerSubLevel: node.manager_sub_level,
    };

    const users = (node.users || [])
      .filter((user) => showVacancies || !user.isVacancy)
      .filter((user) => !isAdministrativeAssistant(user))
      .filter((user) => !assistantsToSkip.has(user.id));

    const children = [];

    if (isRoot && rootAssistant?.id) {
      children.push({
        type: NODE_ASSISTANT,
        data: {
          ...rootAssistant,
          id: rootAssistant.id,
          isDepartment: false,
          isVacancy: false,
          isAssistant: true,
        },
      });
    }

    if (users.length) {
      children.push({
        type: NODE_EMPLOYEES,
        persons: users.map((user) => ({
          type: "person",
          data: {
            ...user,
            id: user.id || `user_${Math.random().toString(16).slice(2)}`,
            name: user.full_name || user.name || "Сотрудник",
            position: user.position || "",
            isDepartment: false,
            isVacancy: !!user.isVacancy,
            isAssistant: false,
          },
        })),
      });
    }

    (node.children || []).forEach((child) => {
      children.push(buildDepartment(child, false));
    });

    const isCollapsed = collapsedIds ? collapsedIds.has(data.id) : false;

    if (isCollapsed) {
      return {
        type: NODE_DEPARTMENT,
        data,
        children: [],
        collapsed: true,
        hiddenChildrenCount: children.length,
      };
    }

    return { type: NODE_DEPARTMENT, data, children };
  }

  return buildDepartment(rootNode, true);
}

/**
 * Проход 1 (CR-008_2_2, CR-008_3): фиксирует реальный managerSubLevel,
 * нормализует его в normalizedManagementLevel (целая часть) и устанавливает
 * effectiveLayoutLevel из нормализованного уровня.
 * Для узлов без уровня effectiveLayoutLevel остаётся null —
 * он заполняется на проходе 2 (sibling-группа).
 */
function assignActualLevels(node) {
  if (node.type === NODE_DEPARTMENT) {
    const sl = node.data.managerSubLevel;
    const finite = Number.isFinite(sl) && sl !== MAX_SUBLEVEL;
    node.actualManagerSubLevel = finite ? sl : null;
    node.normalizedManagementLevel = finite ? normalizeManagementLevel(sl) : null;
    node.effectiveLayoutLevel = node.normalizedManagementLevel;
  }

  (node.children || []).forEach(assignActualLevels);
}

/**
 * Возвращает mode списка валидных уровней.
 * При неоднозначности (одинаковая частота) — минимальный уровень.
 */
function siblingMode(levels) {
  const frequency = new Map();
  levels.forEach((level) => frequency.set(level, (frequency.get(level) || 0) + 1));

  const maxFrequency = Math.max(...frequency.values());
  const candidates = [...frequency.entries()]
    .filter(([, count]) => count === maxFrequency)
    .map(([level]) => level);

  return Math.min(...candidates);
}

/**
 * Проход 2 (CR-008_2_2 §1, §5): нормализация уровня sibling-групп.
 * - department children одного parent: отсутствующий уровень получает
 *   mode валидных уровней группы (при неоднозначности — минимальный);
 * - если валидных нет — parent.effectiveLayoutLevel + 1;
 * - root без уровня — 0 (row root всегда 0).
 * Employees/assistant в расчёте не участвуют.
 */
function applySiblingFallback(node, isRoot = false) {
  if (node.type === NODE_DEPARTMENT && node.effectiveLayoutLevel == null) {
    node.effectiveLayoutLevel = isRoot ? 0 : null;
  }

  const departmentChildren = (node.children || []).filter(
    (child) => child.type === NODE_DEPARTMENT,
  );

  if (departmentChildren.length) {
    const validLevels = departmentChildren
      .map((child) => child.effectiveLayoutLevel)
      .filter((level) => level != null);

    const siblingLevel = validLevels.length
      ? siblingMode(validLevels)
      : (node.effectiveLayoutLevel ?? 0) + 1;

    departmentChildren.forEach((child) => {
      if (child.effectiveLayoutLevel == null) {
        child.effectiveLayoutLevel = siblingLevel;
      }
    });
  }

  (node.children || []).forEach((child) => applySiblingFallback(child, false));
}

/**
 * Назначает визуальную строку row на основе effectiveLayoutLevel
 * (CR-008_2_2 §7, §8):
 * - root всегда row 0;
 * - встречающиеся levels сжимаются в строки 1..N без пустых строк
 *   (например 4 и 6 → строки 1 и 2);
 * - parent-child hierarchy сохраняется: child.row > parent.row.
 * Employees/assistant — строка родителя + 1.
 */
function computeRows(tree) {
  const levels = new Set();
  (function walk(node) {
    if (
      node.type === NODE_DEPARTMENT &&
      node !== tree &&
      node.effectiveLayoutLevel != null
    ) {
      levels.add(node.effectiveLayoutLevel);
    }
    (node.children || []).forEach(walk);
  })(tree);

  const sortedLevels = [...levels].sort((a, b) => a - b);
  const levelToRow = new Map();
  sortedLevels.forEach((level, index) => levelToRow.set(level, index + 1));

  function assign(node, parentRow) {
    if (node.type === NODE_DEPARTMENT) {
      if (node === tree) {
        node.row = 0;
      } else {
        const mappedRow = levelToRow.get(node.effectiveLayoutLevel) ?? parentRow + 1;
        node.row = Math.max(mappedRow, parentRow + 1);
      }
    } else {
      node.row = parentRow + 1;
    }

    (node.children || []).forEach((child) => assign(child, node.row));
  }

  assign(tree, -1);
}

/**
 * Кладёт layout-метаданные в data карточки для диагностики
 * (CR-008_2_2 §6): layout_level / row не подменяют реальный sub_level.
 */
function attachLayoutMeta(node) {
  if (node.type === NODE_DEPARTMENT) {
    node.data.actualManagerSubLevel = node.actualManagerSubLevel;
    node.data.normalizedManagementLevel = node.normalizedManagementLevel;
    node.data.effectiveLayoutLevel = node.effectiveLayoutLevel;
    node.data.row = node.row;
  }

  (node.children || []).forEach(attachLayoutMeta);
}

function computeSizes(node, opts) {
  if (node.type === NODE_DEPARTMENT) {
    node.width = opts.departmentWidth;
    node.height = opts.departmentHeight;
  } else if (node.type === NODE_ASSISTANT) {
    node.width = opts.assistantWidth;
    node.height = opts.assistantHeight;
  } else if (node.type === NODE_EMPLOYEES) {
    node.width = opts.employeeWidth;
    const n = node.persons.length;
    node.height =
      opts.employeesHeaderHeight +
      n * opts.employeeHeight +
      (n > 1 ? (n - 1) * opts.personGap : 0);
    node.persons.forEach((person) => {
      person.width = opts.employeeWidth;
      person.height = opts.employeeHeight;
    });
  }

  (node.children || []).forEach((child) => computeSizes(child, opts));
}

function computeSubtreeWidths(node, colGap) {
  if (node.type !== NODE_DEPARTMENT || !node.children.length) {
    node.subtreeWidth = node.width;
    return node.subtreeWidth;
  }

  const childrenWidth =
    node.children.reduce((sum, child) => sum + computeSubtreeWidths(child, colGap), 0) +
    (node.children.length - 1) * colGap;

  node.subtreeWidth = Math.max(node.width, childrenWidth);
  return node.subtreeWidth;
}

function assignX(node, left, colGap) {
  const center = left + node.subtreeWidth / 2;
  node.x = center - node.width / 2;

  if (node.children && node.children.length) {
    const childrenWidth =
      node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      (node.children.length - 1) * colGap;

    let childLeft = center - childrenWidth / 2;
    node.children.forEach((child) => {
      assignX(child, childLeft, colGap);
      childLeft += child.subtreeWidth + colGap;
    });
  }
}

function buildRowIndexMap(tree) {
  const rows = new Set();
  (function walk(node) {
    if (node.type === NODE_DEPARTMENT) {
      rows.add(node.row);
    }
    (node.children || []).forEach(walk);
  })(tree);
  const sorted = [...rows].sort((a, b) => a - b);
  const map = new Map();
  sorted.forEach((value, index) => map.set(value, index));
  return map;
}

function collectRowHeights(node, rowHeights, rowIndexMap) {
  if (node.type === NODE_DEPARTMENT) {
    const index = rowIndexMap.get(node.row);
    rowHeights[index] = Math.max(rowHeights[index] || 0, node.height);
  }
  (node.children || []).forEach((child) => collectRowHeights(child, rowHeights, rowIndexMap));
}

function computeRowTops(tree, opts) {
  const rowIndexMap = buildRowIndexMap(tree);
  const rowCount = rowIndexMap.size;
  const rowHeights = new Array(rowCount).fill(0);
  collectRowHeights(tree, rowHeights, rowIndexMap);

  const rowTops = new Array(rowCount);
  rowTops[0] = opts.paddingY;
  for (let index = 1; index < rowCount; index += 1) {
    rowTops[index] = rowTops[index - 1] + (rowHeights[index - 1] || 0) + opts.rowGap;
  }

  return { rowTops, rowIndexMap, rowCount };
}

function assignY(node, rowTops, rowIndexMap, parent, opts) {
  if (node.type === NODE_DEPARTMENT) {
    node.y = rowTops[rowIndexMap.get(node.row)];
  } else {
    node.y = parent.y + parent.height + opts.contentGap;
  }
  (node.children || []).forEach((child) => assignY(child, rowTops, rowIndexMap, node, opts));
}

function collect(tree, nodes, edges, flatData, parent) {
  if (parent) edges.push({ parent, child: tree });

  if (tree.type === NODE_EMPLOYEES) {
    nodes.push(tree);
    tree.persons.forEach((person) => flatData.push(person.data));
    return;
  }

  nodes.push(tree);
  flatData.push(tree.data);
  (tree.children || []).forEach((child) => collect(child, nodes, edges, flatData, tree));
}

/**
 * Главная функция layout.
 *
 * @param {object} rootNode - выбранное подразделение (узел дерева с users/children)
 * @param {object} options
 * @returns {{ tree, nodes, edges, flatData, width, height }}
 */
export function computeUnifiedLayout(rootNode, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const tree = buildLayoutTree(rootNode, {
    showVacancies: opts.showVacancies,
    collapsedIds: opts.collapsedIds,
  });

  assignActualLevels(tree);
  applySiblingFallback(tree, true);
  computeRows(tree);

  computeSizes(tree, opts);
  computeSubtreeWidths(tree, opts.colGap);
  assignX(tree, opts.paddingX, opts.colGap);

  const { rowTops, rowIndexMap } = computeRowTops(tree, opts);
  assignY(tree, rowTops, rowIndexMap, null, opts);

  attachLayoutMeta(tree);

  const nodes = [];
  const edges = [];
  const flatData = [];
  collect(tree, nodes, edges, flatData, null);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  });

  const width = maxX - minX + opts.paddingX * 2;
  const height = maxY - minY + opts.paddingY * 2;

  return { tree, nodes, edges, flatData, width, height };
}


