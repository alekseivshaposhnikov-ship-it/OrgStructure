/**
 * expand-state.js
 * CR-024 §2: независимое управление раскрытием подразделений и видимостью
 * сотрудников для пошаговой навигации по крупной оргструктуре.
 *
 * Модуль не зависит от DOM и не изменяет исходную модель данных — это только
 * presentation-состояние. Оно хранится отдельно по стабильному идентификатору
 * подразделения (department_guid), а не одним общим boolean для всей структуры
 * (CR-024 §2.5).
 *
 * Два независимых состояния подразделения:
 *   - childrenCollapsed — дочерние подразделения скрыты (раскрытие по уровням);
 *   - employeesExpanded — сотрудники подразделения показаны (по умолчанию скрыты).
 *
 * При сворачивании родителя состояние потомков СОХРАНЯЕТСЯ: повторное раскрытие
 * восстанавливает прежний вид (CR-024 §2.5, §2.6).
 */

/** Стабильный идентификатор подразделения (department_guid, fallback id). */
export function departmentIdOf(node) {
  if (!node) return "";
  return node.department_guid || node.id || "";
}

/**
 * Создаёт независимое состояние раскрытия.
 * @param {{ initialCollapsedChildren?: Iterable<string> }} [options]
 */
export function createExpandState({ initialCollapsedChildren = [] } = {}) {
  return {
    childrenCollapsed: new Set(
      Array.from(initialCollapsedChildren || []).filter(Boolean),
    ),
    employeesExpanded: new Set(),
    // Корень, для которого состояние уже инициализировано (используется
    // renderer'ом для одноразового seeding initial collapse на новый корень).
    __seededRoot: null,
  };
}

export function isChildrenCollapsed(state, id) {
  return Boolean(id) && state.childrenCollapsed.has(id);
}

export function setChildrenCollapsed(state, id, collapsed) {
  if (!id) return;
  if (collapsed) state.childrenCollapsed.add(id);
  else state.childrenCollapsed.delete(id);
}

/** Раскрыть/свернуть только непосредственные дочерние подразделения. */
export function toggleChildren(state, id) {
  setChildrenCollapsed(state, id, !isChildrenCollapsed(state, id));
}

/** CR-024 §2.1: показать только непосредственные дочерние подразделения. */
export function expandNextLevel(state, id) {
  setChildrenCollapsed(state, id, false);
}

export function isEmployeesExpanded(state, id) {
  return Boolean(id) && state.employeesExpanded.has(id);
}

export function setEmployeesExpanded(state, id, expanded) {
  if (!id) return;
  if (expanded) state.employeesExpanded.add(id);
  else state.employeesExpanded.delete(id);
}

/** CR-024 §2.2: переключить видимость сотрудников подразделения. */
export function toggleEmployees(state, id) {
  setEmployeesExpanded(state, id, !isEmployeesExpanded(state, id));
}

/** Все id подразделений поддерева, включая сам узел. */
export function collectSubtreeDepartmentIds(node) {
  const ids = [];
  (function walk(current) {
    if (!current) return;
    const id = departmentIdOf(current);
    if (id) ids.push(id);
    (current.children || []).forEach(walk);
  })(node);
  return ids;
}

/** Рекурсивный поиск узла подразделения по id в поддереве/массиве узлов. */
export function findDepartmentNode(nodeOrNodes, id) {
  if (!id) return null;
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];
  for (const node of nodes) {
    if (!node) continue;
    if (departmentIdOf(node) === id) return node;
    const found = findDepartmentNode(node.children || [], id);
    if (found) return found;
  }
  return null;
}

function resolveTarget(rootNode, id) {
  if (departmentIdOf(rootNode) === id) return rootNode;
  return findDepartmentNode(rootNode, id);
}

/**
 * CR-024 §2.1: развернуть всю ветку — показать все вложенные подразделения
 * и сотрудников выбранного подразделения.
 */
export function expandBranch(state, rootNode, id) {
  const target = resolveTarget(rootNode, id);
  if (!target) return;
  collectSubtreeDepartmentIds(target).forEach((subtreeId) => {
    setChildrenCollapsed(state, subtreeId, false);
    setEmployeesExpanded(state, subtreeId, true);
  });
}

/**
 * CR-024 §2.1: свернуть всю ветку — скрыть дочерние подразделения и
 * сотрудников. Состояние потомков сохраняется для последующего раскрытия.
 */
export function collapseBranch(state, rootNode, id) {
  const target = resolveTarget(rootNode, id);
  if (!target) return;
  collectSubtreeDepartmentIds(target).forEach((subtreeId) => {
    setChildrenCollapsed(state, subtreeId, true);
    setEmployeesExpanded(state, subtreeId, false);
  });
}

/**
 * CR-024 §2.4: развернуть всю организационную структуру, включая сотрудников.
 */
export function expandAll(state, rootNodes) {
  const nodes = Array.isArray(rootNodes) ? rootNodes : [rootNodes];
  nodes.forEach((root) => {
    collectSubtreeDepartmentIds(root).forEach((id) => {
      setChildrenCollapsed(state, id, false);
      setEmployeesExpanded(state, id, true);
    });
  });
}

/**
 * CR-024 §2.4: свернуть всю организационную структуру. Скрываются все
 * дочерние подразделения и сотрудники — видимым остаётся только корень.
 */
export function collapseAll(state, rootNodes) {
  const nodes = Array.isArray(rootNodes) ? rootNodes : [rootNodes];
  nodes.forEach((root) => {
    collectSubtreeDepartmentIds(root).forEach((id) => {
      setChildrenCollapsed(state, id, true);
      setEmployeesExpanded(state, id, false);
    });
  });
}

/**
 * Возвращает набор id подразделений, чьи сотрудники должны быть скрыты
 * (для передачи в layout). Зависит от исходного дерева (нужны все id).
 * @param {object} state
 * @param {object|object[]} rootNodes
 * @returns {Set<string>}
 */
export function hiddenEmployeeIds(state, rootNodes) {
  const hidden = new Set();
  const nodes = Array.isArray(rootNodes) ? rootNodes : [rootNodes];
  nodes.forEach((root) => {
    collectSubtreeDepartmentIds(root).forEach((id) => {
      if (!state.employeesExpanded.has(id)) hidden.add(id);
    });
  });
  return hidden;
}
