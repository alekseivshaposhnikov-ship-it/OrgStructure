/**
 * Горизонтальная раскладка оргструктуры по уровням управления (sub_level).
 *
 * В отличие от вертикального режима (рекурсивное дерево), здесь:
 *   - Подразделения группируются по значению sub_level руководителя.
 *   - Каждый уровень выводится одной горизонтальной строкой.
 *   - Используются виртуальные узлы-уровни для d3-org-chart, чтобы
 *     карточки одного sub_level выстроились в ряд.
 *   - Реальные связи parent/child сохраняются через поле realParentId,
 *     которое используется для отрисовки соединительных линий
 *     в горизонтальном SVG-рендерере.
 */

const VIRTUAL_LEVEL_PREFIX = "__level__";

/**
 * Собрать все подразделения из отображаемой ветки.
 * @param {object} node - корень отображаемой ветки
 * @returns {object[]} плоский массив подразделений
 */
function collectDepartments(node) {
  const result = [];

  function walk(n) {
    if (n.department_guid) {
      result.push(n);
    }
    (n.children || []).forEach(child => walk(child));
  }

  walk(node);
  return result;
}

/**
 * Получить sub_level руководителя подразделения.
 * Ищем в users сотрудника, совпадающего с department_manager,
 * и берём его subLevel.
 *
 * @param {object} dept
 * @returns {number}
 */
function getManagerSubLevel(dept) {
  const managerName = (dept.department_manager || "").trim().toLowerCase();
  if (!managerName) return Number.MAX_SAFE_INTEGER;

  const users = dept.users || [];
  const manager = users.find(
    u => !u.isVacancy && String(u.full_name || "").trim().toLowerCase() === managerName,
  );

  if (manager && Number.isFinite(manager.subLevel) && manager.subLevel !== Number.MAX_SAFE_INTEGER) {
    return manager.subLevel;
  }

  return Number.MAX_SAFE_INTEGER;
}

/**
 * Построить плоский массив узлов для горизонтальной d3-org-chart диаграммы.
 *
 * @param {object} rootNode - корень выбранной ветки
 * @param {object} options
 * @param {boolean} options.showVacancies
 * @returns {object[]} flatData для OrgChart
 */
export function buildHorizontalFlatData(rootNode, { showVacancies = true } = {}) {
  const departments = collectDepartments(rootNode);
  if (departments.length === 0) return [];

  // Корень диаграммы — выбранное подразделение
  const rootId = rootNode.department_guid || rootNode.id;

  const result = [];

  // 1. Добавляем корень
  result.push({
    id: rootId,
    parentId: null,
    name: rootNode.department_name || rootNode.name || "Без названия",
    staffCount: rootNode.staffCount || 0,
    vacancyCount: rootNode.vacancyCount || 0,
    totalWithVacancies: rootNode.totalWithVacancies ?? rootNode.staffCount ?? 0,
    headName: rootNode.department_manager || "",
    headPosition: rootNode.department_manager_position || "",
    scenarioState: rootNode.scenarioState || "",
    isDepartment: true,
  });

  // 2. Сотрудники/вакансии корневого узла
  appendUsersToResult(result, rootNode, rootId, showVacancies);

  // 3. Группируем подчинённые подразделения по sub_level
  const childDepartments = departments.filter(
    d => d.department_guid !== rootId,
  );

  const levelMap = new Map();
  childDepartments.forEach(dept => {
    const level = getManagerSubLevel(dept);
    if (!levelMap.has(level)) {
      levelMap.set(level, []);
    }
    levelMap.get(level).push(dept);
  });

  // Сортируем уровни
  const sortedLevels = [...levelMap.keys()]
    .filter(l => l !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => a - b);

  // Добавляем уровень "без sub_level" в конец
  if (levelMap.has(Number.MAX_SAFE_INTEGER)) {
    sortedLevels.push(Number.MAX_SAFE_INTEGER);
  }

  // 4. Создаём виртуальные узлы-уровни
  const virtualLevelIds = [];

  sortedLevels.forEach(level => {
    const levelId = `${VIRTUAL_LEVEL_PREFIX}${level}`;
    virtualLevelIds.push(levelId);

    result.push({
      id: levelId,
      parentId: rootId,
      name: "",
      staffCount: 0,
      vacancyCount: 0,
      totalWithVacancies: 0,
      headName: "",
      headPosition: "",
      scenarioState: "",
      isDepartment: true,
      isVirtualLevel: true,
      _level: level,
    });

    // Добавляем подразделения этого уровня
    const depts = levelMap.get(level) || [];
    depts.forEach(dept => {
      const deptId = dept.department_guid || dept.id;

      result.push({
        id: deptId,
        parentId: levelId,
        name: dept.department_name || dept.name || "Без названия",
        staffCount: dept.staffCount || 0,
        vacancyCount: dept.vacancyCount || 0,
        totalWithVacancies: dept.totalWithVacancies ?? dept.staffCount ?? 0,
        headName: dept.department_manager || "",
        headPosition: dept.department_manager_position || "",
        scenarioState: dept.scenarioState || "",
        isDepartment: true,
        _realParentId: findRealParentId(dept, departments),
      });

      // Сотрудники/вакансии подразделения
      appendUsersToResult(result, dept, deptId, showVacancies);
    });
  });

  return result;
}

/**
 * Найти реальный parent_guid подразделения из собранного списка.
 * @param {object} dept
 * @param {object[]} allDepartments
 * @returns {string|null}
 */
function findRealParentId(dept, allDepartments) {
  const parentGuid = dept.parent_guid;
  if (!parentGuid) return null;

  const parent = allDepartments.find(d => d.department_guid === parentGuid);
  return parent ? parent.department_guid : null;
}

/**
 * Добавить сотрудников и вакансии подразделения в результат.
 */
function appendUsersToResult(result, dept, parentDeptId, showVacancies) {
  const users = dept.users || [];

  users
    .filter(u => showVacancies || !u.isVacancy)
    .filter(u => !isAdministrativeAssistant(u))
    .forEach(user => {
      result.push({
        ...user,
        id: user.id || `user_${result.length + 1}`,
        parentId: parentDeptId,
        name: user.full_name || user.name || "Сотрудник",
        position: user.position || "",
        scenarioState: user.scenarioState || "",
        isDepartment: false,
        isVacancy: !!user.isVacancy,
      });
    });
}

function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(
    user.rawPosition || user.position || "",
  ).toLowerCase();
  return position.includes("административный ассистент");
}

/**
 * Определить, является ли узел виртуальным уровнем.
 */
export function isVirtualLevelNode(node) {
  return node?.isVirtualLevel === true;
}