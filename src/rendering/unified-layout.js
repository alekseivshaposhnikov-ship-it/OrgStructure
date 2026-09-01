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

import { formatEmployeeDisplayName } from "../core/utils/employee.js";

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
  // CR-015 §3-6: assistant — локальный sidecar СПРАВА от manager. Позиция
  // рассчитывается только от карточки manager, а не от subtree/row:
  //   assistant.x = manager.x + manager.width + assistantHorizontalGap;
  //   assistant.y = manager.y + assistantVerticalOffset.
  // Верх assistant остаётся приблизительно на уровне manager (небольшой
  // vertical offset), поэтому assistant не выглядит отдельным organizational level.
  assistantHorizontalGap: 16,
  assistantVerticalOffset: 28,
  assistantSidecarWidth: 240,
  assistantSidecarHeight: 44,
  // CR-015 §22-26: collapse/expand control — часть layout-геометрии. Baseline
  // toggle привязан к visual row (rowVisualBottom + toggleGap), а не к content height.
  toggleGap: 14,
  paddingX: 40,
  paddingY: 40,
  // Ролевая presentation для PDF (CR-003-02): department-card получает
  // динамическую высоту по числу должностей. По умолчанию выключено —
  // не влияет на экран и detailed-режим.
  rolesPresentation: false,
  rolesDepartmentHeaderHeight: 0,
  rolesDepartmentSeparatorHeight: 0,
  rolesDepartmentRowHeight: 0,
  rolesDepartmentPadding: 0,
};

export function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return position.includes("административный ассистент");
}

/**
 * Ассистент руководителя — персональный или административный (CR-013_fix §9).
 * Используется в layout для привязки assistant к его непосредственному manager.
 * Не заменяет isAdministrativeAssistant() (используется PDF role aggregation).
 */
export function isAssistantUser(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return (
    position.includes("административный ассистент") ||
    position.includes("персональный ассистент")
  );
}

/**
 * Нормализует метку assistant-карточки (CR-013_assistant §13): вместо длинной
 * должности API показывается краткая роль.
 */
export function normalizeAssistantLabel(position) {
  const p = String(position || "").toLowerCase();
  return p.includes("персональный ассистент")
    ? "Персональный ассистент"
    : "Административный ассистент";
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
  // Универсальная привязка ассистентов (CR-013_fix §9, §12; CR-013_assistant §12):
  // каждый assistant является sidecar-node своего непосредственного руководителя —
  // department, в чьих sourceUsers/users он находится. Явные presentation-ассистенты
  // (__assistant, задаются конфигурацией верхнего руководства) имеют приоритет.
  const assistantOwners = new Map();
  (function collectOwners(node) {
    if (node.__assistant?.id) assistantOwners.set(node.__assistant.id, node);
    (node.children || []).forEach(collectOwners);
  })(rootNode);

  function findOwnAssistants(node) {
    const explicit = node.__assistant ? [node.__assistant] : [];
    // Ролевой PDF (CR-003-02) агрегирует сотрудников в roles — отдельные
    // assistant-узлы создаются только для явных presentation-ассистентов.
    if (Array.isArray(node.pdfRoles)) return explicit;

    const source = Array.isArray(node.sourceUsers) ? node.sourceUsers : node.users || [];
    const fromUsers = source
      .filter((user) => !user.isVacancy)
      .filter((user) => isAssistantUser(user))
      // Не привязываем повторно ассистентов, явно закреплённых за другим department.
      .filter((user) => !(assistantOwners.has(user.id) && assistantOwners.get(user.id) !== node));

    return [...explicit, ...fromUsers];
  }

  function makeAssistantNode(assistant) {
    return {
      type: NODE_ASSISTANT,
      data: {
        ...assistant,
        id: assistant.id,
        position: normalizeAssistantLabel(assistant.position),
        isDepartment: false,
        isVacancy: false,
        isAssistant: true,
        // CR-016 §32: presentation ФИО (Фамилия Имя), полное имя не трогаем.
        displayName: formatEmployeeDisplayName(assistant.full_name || assistant.name || ""),
      },
    };
  }

  function buildDepartment(node, _isRoot) {
    const data = {
      id: node.department_guid || node.id,
      isDepartment: true,
      name: node.department_name || node.name || "Без названия",
      headName: node.department_manager || "",
      headPosition: node.department_manager_position || "",
      // CR-016 §30: presentation ФИО руководителя (Фамилия Имя) для карточек.
      // Полный headName сохраняется для detail modal / поиска / идентификации.
      headDisplayName: node.department_manager
        ? formatEmployeeDisplayName(node.department_manager, {
            keepFullName: Boolean(node.keepFullName),
          })
        : "",
      // CR-016 §20, §24: семантический presentation-флаг топ-3 (полное ФИО).
      keepFullName: Boolean(node.keepFullName),
      staffCount: node.staffCount || 0,
      vacancyCount: node.vacancyCount || 0,
      totalWithVacancies: node.totalWithVacancies ?? node.staffCount ?? 0,
      scenarioState: node.scenarioState || "",
      managerSubLevel: node.manager_sub_level,
    };

    // Ролевая presentation (CR-003-02 §19): агрегированные должности переезжают
    // в data подразделения и используются только ролевым PDF-режимом.
    if (Array.isArray(node.pdfRoles)) {
      data.pdfRoles = node.pdfRoles;
    }

    // CR-013 §27: presentation-узел верхнего руководителя (executive) рендерится
    // отдельной карточкой и несёт реальную запись человека для детального просмотра.
    if (node.isHoldingExecutive) {
      data.isHoldingExecutive = true;
    }
    if (node.__person) {
      Object.assign(data, node.__person, {
        id: data.id,
        name: node.department_name || node.__person.full_name || data.name,
        position: data.headPosition || node.__person.position || "",
        isDepartment: true,
        // CR-016 §20, §22, §49: presentation ФИО карточки — топ-3 (keepFullName)
        // сохраняют полное ФИО, остальные (например Винник) — «Фамилия Имя».
        displayName: formatEmployeeDisplayName(
          node.department_name || node.__person.full_name || data.name,
          { keepFullName: data.keepFullName },
        ),
      });
    }

    // Согласованная вертикальная геометрия ролевой карточки (CR-003-03-fix-height):
    // высота карточки зависит от фактического количества строк названия,
    // layout и renderer используют один и тот же pdfCardLayout.
    if (node.pdfCardLayout) {
      data.pdfCardLayout = node.pdfCardLayout;
    }

    const ownAssistants = findOwnAssistants(node);

    const users = (node.users || [])
      .filter((user) => showVacancies || !user.isVacancy)
      .filter((user) => !isAssistantUser(user))
      // Не показываем в колонке ассистентов, явно привязанных к другому department
      // (CR-013_assistant §12) — они выводятся как sidecar.
      .filter((user) => !(assistantOwners.has(user.id) && assistantOwners.get(user.id) !== node));

    const children = [];

    // Собственные ассистенты подразделения — sidecar рядом с карточкой
    // руководителя (CR-013_assistant §6-8): не создают организационный уровень.
    ownAssistants.forEach((assistant) => {
      children.push(makeAssistantNode(assistant));
    });

    if (users.length) {
      children.push({
        type: NODE_EMPLOYEES,
        persons: users.map((user) => ({
          type: "person",
          data: {
            ...user,
            id: user.id || `user_${Math.random().toString(16).slice(2)}`,
            name: user.full_name || user.name || "Сотрудник",
            // CR-016 §34: presentation ФИО (Фамилия Имя), топ-3 — полное.
            displayName: formatEmployeeDisplayName(user.full_name || user.name || "", {
              keepFullName: Boolean(user.keepFullName),
            }),
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
      // CR-015 §28, §53: при collapse скрываются только organizational children.
      // Sidecar-ассистенты остаются видимыми рядом с manager — assistant не
      // является organizational child и не должен исчезать вместе с веткой.
      const sidecarAssistants = children.filter((child) => child.type === NODE_ASSISTANT);
      return {
        type: NODE_DEPARTMENT,
        data,
        children: sidecarAssistants,
        collapsed: true,
        // Скрыты все children, кроме оставшихся видимыми sidecar-ассистентов.
        hiddenChildrenCount: children.length - sidecarAssistants.length,
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
    } else if (node.type === NODE_ASSISTANT) {
      // Sidecar (CR-013_assistant §8): assistant не создаёт organizational row —
      // row совпадает с row своего руководителя.
      node.row = parentRow;
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

    if (opts.rolesPresentation && Array.isArray(node.data.pdfRoles)) {
      // Ролевая presentation (CR-003-02 §9, CR-003-03-fix-height):
      // высота карточки рассчитывается по фактическому содержимому
      // (включая перенос названия) и согласована с renderer через pdfCardLayout.
      if (node.data.pdfCardLayout && Number.isFinite(node.data.pdfCardLayout.cardHeight)) {
        node.height = node.data.pdfCardLayout.cardHeight;
      } else {
        const rolesCount = node.data.pdfRoles.length;
        node.height =
          opts.rolesDepartmentHeaderHeight +
          (rolesCount
            ? opts.rolesDepartmentSeparatorHeight + rolesCount * opts.rolesDepartmentRowHeight
            : 0) +
          opts.rolesDepartmentPadding;
      }
    } else {
      node.height = opts.departmentHeight;
    }
  } else if (node.type === NODE_ASSISTANT) {
    // Sidecar-карточка ассистента (CR-013_assistant §6, §9): компактный размер.
    node.width = opts.assistantSidecarWidth ?? opts.assistantWidth;
    node.height = opts.assistantSidecarHeight ?? opts.assistantHeight;
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

  // Sidecar-ассистенты (CR-013_assistant §7, §10) не участвуют в организационной
  // ширине ветки и НЕ увеличивают subtreeWidth (CR-018 §4.1): их асимметричный
  // visual footprint обрабатывается отдельным packing-проходом
  // compactSiblingBranches() по фактическим visual bounds (CR-018 §7).
  const children = node.children.filter((child) => child.type !== NODE_ASSISTANT);
  if (!children.length) {
    node.subtreeWidth = node.width;
    return node.subtreeWidth;
  }

  const childrenWidth =
    children.reduce((sum, child) => sum + computeSubtreeWidths(child, colGap), 0) +
    (children.length - 1) * colGap;

  node.subtreeWidth = Math.max(node.width, childrenWidth);
  return node.subtreeWidth;
}

/**
 * CR-018 §9: фактические визуальные границы ветви по реально отображаемым
 * узлам layout tree (department cards, assistant sidecars, employee columns,
 * дочерние department-узлы). Collapsed children в layout tree отсутствуют,
 * поэтому скрытые ветви не резервируют место (CR-018 §16).
 */
function computeVisualBounds(branch) {
  let minX = branch.x;
  let maxX = branch.x + branch.width;

  (function walk(node) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    (node.children || []).forEach(walk);
  })(branch);

  return { minX, maxX, width: maxX - minX };
}

/**
 * CR-018 §8: сдвигает всю branch (department card, assistant sidecar,
 * employee column, дочерние department-узлы) на dx вправо, сохраняя
 * внутреннюю геометрию ветви.
 */
function shiftBranch(node, dx) {
  if (!dx) return;
  node.x += dx;
  (node.children || []).forEach((child) => shiftBranch(child, dx));
}

/**
 * CR-018 §7, §13, §25: компактный collision-aware horizontal packing.
 *
 * Для каждой sibling-группы (children одного parent, кроме assistant) слева
 * направо проверяются фактические visual bounds соседних ветвей. Если правая
 * ветвь пересекает visual footprint левой (с учётом colGap), она сдвигается
 * ровно на величину пересечения. No collision → no additional shift.
 * Сложность O(n) на sibling-группу.
 */
function compactSiblingBranches(tree, opts) {
  (function process(node) {
    const branches = (node.children || []).filter((child) => child.type !== NODE_ASSISTANT);

    let prev = null;
    branches.forEach((branch) => {
      if (prev) {
        const leftBounds = computeVisualBounds(prev);
        const rightBounds = computeVisualBounds(branch);
        const overlap = leftBounds.maxX + opts.colGap - rightBounds.minX;
        if (overlap > 0) shiftBranch(branch, overlap);
      }
      prev = branch;
    });

    (node.children || []).forEach((child) => process(child));
  })(tree);
}

function assignX(node, left, colGap) {
  const center = left + node.subtreeWidth / 2;
  node.x = center - node.width / 2;

  if (node.children && node.children.length) {
    // Sidecar-ассистенты позиционируются отдельно от потока children (CR-013_assistant §7).
    const visibleChildren = node.children.filter((child) => child.type !== NODE_ASSISTANT);
    if (!visibleChildren.length) return;

    const childrenWidth =
      visibleChildren.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      (visibleChildren.length - 1) * colGap;

    let childLeft = center - childrenWidth / 2;
    visibleChildren.forEach((child) => {
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

/**
 * CR-015 §15, §21: высота row учитывает фактический bounding box карточек row.
 * Sidecar-ассистенты находятся на одной визуальной строке с manager (справа,
 * с небольшим vertical offset), поэтому НЕ резервируют отдельную вертикальную
 * зону под manager — учитывается только их реальная вертикальная протяжённость
 * в пределах row. Для manager без ассистентов row height не меняется.
 */
function collectRowHeights(node, rowHeights, rowIndexMap, opts) {
  if (node.type === NODE_DEPARTMENT) {
    const index = rowIndexMap.get(node.row);
    let rowHeight = node.height;

    const assistants = (node.children || []).filter((child) => child.type === NODE_ASSISTANT);
    if (assistants.length) {
      // Ассистенты лежат на одном y = node.y + assistantVerticalOffset;
      // нижний край группы относительно node.y:
      const groupBottom = Math.max(...assistants.map((assistant) => assistant.height));
      rowHeight = Math.max(rowHeight, opts.assistantVerticalOffset + groupBottom);
    }

    rowHeights[index] = Math.max(rowHeights[index] || 0, rowHeight);
  }
  (node.children || []).forEach((child) => collectRowHeights(child, rowHeights, rowIndexMap, opts));
}

function computeRowTops(tree, opts) {
  const rowIndexMap = buildRowIndexMap(tree);
  const rowCount = rowIndexMap.size;
  const rowHeights = new Array(rowCount).fill(0);
  collectRowHeights(tree, rowHeights, rowIndexMap, opts);

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
  } else if (node.type !== NODE_ASSISTANT) {
    // Sidecar-ассистенты позиционируются отдельно (placeAssistantSidecars).
    node.y = parent.y + parent.height + opts.contentGap;
  }
  (node.children || []).forEach((child) => assignY(child, rowTops, rowIndexMap, node, opts));
}

/**
 * CR-015 §3-6, §9: позиционирует sidecar-ассистентов СПРАВА от карточки их
 * руководителя, на уровне manager (небольшой vertical offset). Позиция
 * рассчитывается только относительно карточки manager и не зависит от ширины
 * subtree / organizational row / junction.
 *
 * - x = manager.x + manager.width + assistantHorizontalGap (несколько
 *   ассистентов укладываются компактной группой с тем же gap);
 * - y = manager.y + assistantVerticalOffset — верх assistant остаётся
 *   приблизительно на уровне manager.
 */
function placeAssistantSidecars(tree, opts) {
  (function walk(node) {
    const assistants = (node.children || []).filter((child) => child.type === NODE_ASSISTANT);
    let cursorX = node.x + node.width + opts.assistantHorizontalGap;
    assistants.forEach((assistant) => {
      assistant.y = node.y + opts.assistantVerticalOffset;
      assistant.x = cursorX;
      cursorX += assistant.width + opts.assistantHorizontalGap;
    });
    (node.children || []).forEach(walk);
  })(tree);
}

/**
 * CR-015 §22-26: toggle collapse/expand — часть layout-геометрии, а не
 * внутреннего content карточки.
 *
 * Для каждого visual row считается фактический нижний край карточек
 * (rowVisualBottom = max по department/assistant card), затем для всех
 * collapseable department-узлов row устанавливается общий baseline:
 *
 *   toggleY = rowVisualBottom + opts.toggleGap;
 *
 * X toggle привязан к main organizational stem карточки
 * (node.x + node.width / 2) — см. renderer. Наличие assistant не меняет toggleX.
 */
function attachTogglePositions(tree, opts) {
  const byRow = new Map();

  function collect(node) {
    if (node.row != null) {
      if (!byRow.has(node.row)) byRow.set(node.row, []);
      byRow.get(node.row).push(node);
    }
    (node.children || []).forEach(collect);
  }
  collect(tree);

  const rowVisualBottom = new Map();
  byRow.forEach((rowNodes, row) => {
    // NODE_EMPLOYEES — content-колонка в connector-зоне, в визуальный row
    // карточек не входит и на baseline toggle не влияет.
    const cards = rowNodes.filter((node) => node.type !== NODE_EMPLOYEES);
    rowVisualBottom.set(row, Math.max(...cards.map((node) => node.y + node.height)));
  });

  function walk(node) {
    if (node.type === NODE_DEPARTMENT) {
      const orgChildren = (node.children || []).filter((child) => child.type !== NODE_ASSISTANT);
      if (node.collapsed || orgChildren.length) {
        node.toggleY = rowVisualBottom.get(node.row) + opts.toggleGap;
      }
    }
    (node.children || []).forEach(walk);
  }
  walk(tree);
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

  // Sidecar-ассистенты — позиция от карточки руководителя (CR-015 §3-6).
  placeAssistantSidecars(tree, opts);

  // CR-018 §7: компактный collision-aware horizontal packing по фактическим
  // visual bounds (организационная геометрия не меняется).
  compactSiblingBranches(tree, opts);

  // Toggle collapse/expand — часть layout-геометрии (CR-015 §22-26).
  attachTogglePositions(tree, opts);

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

  // CR-018 §20-21: финальные границы схемы считаются по фактическим координатам
  // после packing. Если packing вывел ветви левее paddingX — выровнять всё вправо.
  if (minX < opts.paddingX) {
    const dx = opts.paddingX - minX;
    nodes.forEach((node) => {
      node.x += dx;
    });
    minX += dx;
    maxX += dx;
  }

  const width = maxX - minX + opts.paddingX * 2;
  const height = maxY - minY + opts.paddingY * 2;

  return { tree, nodes, edges, flatData, width, height };
}


