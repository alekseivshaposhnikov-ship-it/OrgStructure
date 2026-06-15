const LOCAL_ID_PREFIX = "local";

export function createScenario(baseTree) {
  return {
    id: createLocalId("scenario"),
    name: "Новый сценарий моделирования",
    baseDate: new Date().toISOString().slice(0, 10),
    baseTree: cloneTree(baseTree),
    workingTree: cloneTree(baseTree),
    operations: [],
  };
}

export function cloneTree(value) {
  return JSON.parse(JSON.stringify(value || []));
}

export function resetScenario(scenario) {
  return createScenario(scenario.baseTree);
}

export function renameScenario(scenario, name) {
  return {
    ...scenario,
    name: name?.trim() || "Новый сценарий моделирования",
  };
}

export function addDepartment(scenario, parentDepartmentId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const parent = findDepartmentById(workingTree, parentDepartmentId);
  if (!parent) return scenario;

  const department = {
    department_guid: createLocalId("department"),
    department_name: payload.department_name || "Новое подразделение",
    department_manager: payload.department_manager || "",
    department_manager_position: shortPosition(payload.department_manager_position || ""),
    parent_guid: parent.department_guid,
    staffCount: 0,
    vacancyCount: 0,
    totalWithVacancies: 0,
    users: [],
    children: [],
    scenarioState: "added",
  };

  parent.children = parent.children || [];
  parent.children.push(department);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "addDepartment",
      entityId: department.department_guid,
      parentId: parentDepartmentId,
      title: department.department_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function editDepartment(scenario, departmentId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const department = findDepartmentById(workingTree, departmentId);
  if (!department) return scenario;

  department.department_name = payload.department_name || department.department_name;
  department.department_manager = payload.department_manager || "";
  department.department_manager_position = shortPosition(payload.department_manager_position || "");

  if (department.scenarioState !== "added") {
    department.scenarioState = "changed";
  }

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "editDepartment",
      entityId: departmentId,
      title: department.department_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function addEmployee(scenario, departmentId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const department = findDepartmentById(workingTree, departmentId);
  if (!department) return scenario;

  const employee = {
    id: createLocalId("employee"),
    full_name: payload.full_name || "Сотрудник",
    name: payload.full_name || "Сотрудник",
    fullName: payload.full_name || "Сотрудник",
    position: shortPosition(payload.position || ""),
    rawPosition: payload.position || "",
    email: payload.email || "",
    phone: payload.phone || "",
    photo: "",
    project: payload.project || "",
    typeEmployment: payload.typeEmployment || "",
    state: payload.state || "",
    subLevel: parseSubLevel(payload.subLevel),
    isVacancy: false,
    scenarioState: "added",
  };

  department.users = department.users || [];
  department.users.push(employee);
  department.users = sortUsers(department.users);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "addEmployee",
      entityId: employee.id,
      departmentId,
      title: employee.full_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function editEmployee(scenario, employeeId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const found = findUserById(workingTree, employeeId);
  if (!found) return scenario;

  found.user.full_name = payload.full_name || found.user.full_name;
  found.user.name = payload.full_name || found.user.name;
  found.user.fullName = payload.full_name || found.user.fullName;
  found.user.position = shortPosition(payload.position || found.user.position || "");
  found.user.rawPosition = payload.position || found.user.rawPosition || "";
  found.user.email = payload.email || "";
  found.user.phone = payload.phone || "";
  found.user.project = payload.project || "";
  found.user.typeEmployment = payload.typeEmployment || "";
  found.user.state = payload.state || "";
  found.user.subLevel = parseSubLevel(payload.subLevel);

  if (found.user.scenarioState !== "added") {
    found.user.scenarioState = "changed";
  }

  found.department.users = sortUsers(found.department.users);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "editEmployee",
      entityId: employeeId,
      departmentId: found.department.department_guid,
      title: found.user.full_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function addVacancy(scenario, departmentId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const department = findDepartmentById(workingTree, departmentId);
  if (!department) return scenario;

  const vacancy = {
    id: createLocalId("vacancy"),
    full_name: "Вакансия",
    name: "Вакансия",
    fullName: "Вакансия",
    position: shortPosition(payload.position || "Новая вакансия"),
    rawPosition: payload.position || "Новая вакансия",
    email: "",
    phone: "",
    photo: "",
    project: payload.project || "",
    subLevel: parseSubLevel(payload.subLevel),
    isVacancy: true,
    scenarioState: "added",
  };

  department.users = department.users || [];
  department.users.push(vacancy);
  department.users = sortUsers(department.users);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "addVacancy",
      entityId: vacancy.id,
      departmentId,
      title: vacancy.position,
      createdAt: new Date().toISOString(),
    },
  });
}

export function editVacancy(scenario, vacancyId, payload) {
  const workingTree = cloneTree(scenario.workingTree);

  const found = findUserById(workingTree, vacancyId);
  if (!found || !found.user.isVacancy) return scenario;

  found.user.position = shortPosition(payload.position || found.user.position || "");
  found.user.rawPosition = payload.position || found.user.rawPosition || "";
  found.user.project = payload.project || "";
  found.user.subLevel = parseSubLevel(payload.subLevel);

  if (found.user.scenarioState !== "added") {
    found.user.scenarioState = "changed";
  }

  found.department.users = sortUsers(found.department.users);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "editVacancy",
      entityId: vacancyId,
      departmentId: found.department.department_guid,
      title: found.user.position,
      createdAt: new Date().toISOString(),
    },
  });
}

export function removeEmployee(scenario, employeeId) {
  return removeUser({
    scenario,
    userId: employeeId,
    operationType: "removeEmployee",
  });
}

export function removeVacancy(scenario, vacancyId) {
  return removeUser({
    scenario,
    userId: vacancyId,
    operationType: "removeVacancy",
  });
}

export function moveEmployee(scenario, employeeId, targetDepartmentId) {
  return moveUser({
    scenario,
    userId: employeeId,
    targetDepartmentId,
    operationType: "moveEmployee",
  });
}

export function moveVacancy(scenario, vacancyId, targetDepartmentId) {
  return moveUser({
    scenario,
    userId: vacancyId,
    targetDepartmentId,
    operationType: "moveVacancy",
  });
}

export function moveDepartment(scenario, departmentId, targetParentId) {
  if (departmentId === targetParentId) return scenario;

  const workingTree = cloneTree(scenario.workingTree);

  const moving = detachDepartment(workingTree, departmentId);
  const targetParent = findDepartmentById(workingTree, targetParentId);

  if (!moving || !targetParent) return scenario;

  if (containsDepartment(moving, targetParentId)) {
    return scenario;
  }

  moving.parent_guid = targetParent.department_guid;

  if (moving.scenarioState !== "added") {
    moving.scenarioState = "moved";
  }

  targetParent.children = targetParent.children || [];
  targetParent.children.push(moving);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "moveDepartment",
      entityId: departmentId,
      targetDepartmentId: targetParentId,
      title: moving.department_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function removeDepartment(scenario, departmentId) {
  const workingTree = cloneTree(scenario.workingTree);

  const removed = detachDepartment(workingTree, departmentId);
  if (!removed) return scenario;

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: "removeDepartment",
      entityId: departmentId,
      title: removed.department_name,
      createdAt: new Date().toISOString(),
    },
  });
}

export function getTreeByViewMode(scenario, viewMode) {
  if (viewMode === "as-is") {
    return scenario.baseTree;
  }

  if (viewMode === "changes") {
    return buildChangesTree(scenario.workingTree);
  }

  return scenario.workingTree;
}

export function getScenarioStats(scenario) {
  const asIs = aggregateStats(scenario.baseTree);
  const toBe = aggregateStats(scenario.workingTree);

  return {
    asIs,
    toBe,
    diff: {
      departments: toBe.departments - asIs.departments,
      staff: toBe.staff - asIs.staff,
      vacancies: toBe.vacancies - asIs.vacancies,
      total: toBe.total - asIs.total,
    },
  };
}

export function getDepartmentOptions(tree) {
  const result = [];

  function walk(nodes, level = 0) {
    nodes.forEach(node => {
      result.push({
        id: node.department_guid,
        name: `${"— ".repeat(level)}${node.department_name || "Без названия"}`,
      });

      walk(node.children || [], level + 1);
    });
  }

  walk(tree);

  return result;
}

export function findDepartmentById(nodes, departmentId) {
  for (const node of nodes || []) {
    if (node.department_guid === departmentId) return node;

    const found = findDepartmentById(node.children || [], departmentId);
    if (found) return found;
  }

  return null;
}

export function findUserById(nodes, userId) {
  for (const node of nodes || []) {
    const user = (node.users || []).find(item => item.id === userId);
    if (user) return { user, department: node };

    const found = findUserById(node.children || [], userId);
    if (found) return found;
  }

  return null;
}

function removeUser({ scenario, userId, operationType }) {
  const workingTree = cloneTree(scenario.workingTree);

  const found = findUserById(workingTree, userId);
  if (!found) return scenario;

  found.department.users = (found.department.users || []).filter(user => user.id !== userId);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: operationType,
      entityId: userId,
      departmentId: found.department.department_guid,
      title: found.user.full_name || found.user.position || "Объект",
      createdAt: new Date().toISOString(),
    },
  });
}

function moveUser({ scenario, userId, targetDepartmentId, operationType }) {
  const workingTree = cloneTree(scenario.workingTree);

  const found = findUserById(workingTree, userId);
  const targetDepartment = findDepartmentById(workingTree, targetDepartmentId);

  if (!found || !targetDepartment) return scenario;

  found.department.users = (found.department.users || []).filter(user => user.id !== userId);

  const movedUser = {
    ...found.user,
    scenarioState: found.user.scenarioState === "added" ? "added" : "moved",
  };

  targetDepartment.users = targetDepartment.users || [];
  targetDepartment.users.push(movedUser);
  targetDepartment.users = sortUsers(targetDepartment.users);

  recalculateTree(workingTree);

  return appendOperation({
    scenario,
    workingTree,
    operation: {
      id: createLocalId("operation"),
      type: operationType,
      entityId: userId,
      fromDepartmentId: found.department.department_guid,
      targetDepartmentId,
      title: movedUser.full_name || movedUser.position || "Объект",
      createdAt: new Date().toISOString(),
    },
  });
}

function detachDepartment(nodes, departmentId) {
  const index = nodes.findIndex(node => node.department_guid === departmentId);

  if (index !== -1) {
    return nodes.splice(index, 1)[0];
  }

  for (const node of nodes) {
    const found = detachDepartment(node.children || [], departmentId);
    if (found) return found;
  }

  return null;
}

function containsDepartment(node, departmentId) {
  if (node.department_guid === departmentId) return true;

  return (node.children || []).some(child => containsDepartment(child, departmentId));
}

function recalculateTree(nodes) {
  nodes.forEach(node => recalculateNode(node));
}

function recalculateNode(node) {
  const children = node.children || [];
  children.forEach(child => recalculateNode(child));

  const ownStaff = (node.users || []).filter(user => !user.isVacancy).length;
  const ownVacancies = (node.users || []).filter(user => user.isVacancy).length;

  const childrenStaff = children.reduce((sum, child) => sum + (child.staffCount || 0), 0);
  const childrenVacancies = children.reduce((sum, child) => sum + (child.vacancyCount || 0), 0);

  node.staffCount = ownStaff + childrenStaff;
  node.vacancyCount = ownVacancies + childrenVacancies;
  node.totalWithVacancies = node.staffCount + node.vacancyCount;

  node.users = sortUsers(node.users || []);
}

function buildChangesTree(nodes) {
  const result = [];

  nodes.forEach(node => {
    const changedChildren = buildChangesTree(node.children || []);
    const changedUsers = (node.users || []).filter(user => user.scenarioState);

    if (node.scenarioState || changedChildren.length || changedUsers.length) {
      result.push({
        ...cloneTree(node),
        users: changedUsers,
        children: changedChildren,
      });
    }
  });

  recalculateTree(result);

  return result;
}

function aggregateStats(nodes) {
  let departments = 0;
  let staff = 0;
  let vacancies = 0;

  function walk(items) {
    items.forEach(node => {
      departments += 1;

      (node.users || []).forEach(user => {
        if (user.isVacancy) {
          vacancies += 1;
        } else {
          staff += 1;
        }
      });

      walk(node.children || []);
    });
  }

  walk(nodes);

  return {
    departments,
    staff,
    vacancies,
    total: staff + vacancies,
  };
}

function appendOperation({ scenario, workingTree, operation }) {
  return {
    ...scenario,
    workingTree,
    operations: [...scenario.operations, operation],
  };
}

function sortUsers(users) {
  return [...(users || [])].sort(sortUsersByPositionLevel);
}

function sortUsersByPositionLevel(a, b) {
  if (a.isVacancy !== b.isVacancy) {
    return a.isVacancy ? 1 : -1;
  }

  const levelDiff = positionWeight(a) - positionWeight(b);
  if (levelDiff !== 0) return levelDiff;

  return String(a.full_name || a.position || "").localeCompare(
    String(b.full_name || b.position || ""),
    "ru"
  );
}

function positionWeight(user) {
  if (Number.isFinite(user.subLevel)) return user.subLevel;

  const position = String(user.position || "").toLowerCase();

  if (position.includes("директор")) return 1;
  if (position.includes("руководитель")) return 2;
  if (position.includes("начальник")) return 3;
  if (position.includes("лидер") || position.includes("lead")) return 4;
  if (position.includes("ведущий")) return 5;
  if (position.includes("старший")) return 6;
  if (position.includes("главный")) return 6;

  return 100;
}

function shortPosition(pos) {
  if (!pos) return "";
  const idx = pos.indexOf("/");
  return idx !== -1 ? pos.substring(0, idx).trim() : pos.trim();
}

function parseSubLevel(value) {
  if (value === undefined || value === null || value === "") {
    return Number.MAX_SAFE_INTEGER;
  }

  return parseFloat(String(value).replace(",", ".")) || Number.MAX_SAFE_INTEGER;
}

function createLocalId(type) {
  return `${LOCAL_ID_PREFIX}-${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}