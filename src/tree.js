/**
 * Build a hierarchical tree from a flat array of department objects.
 *
 * Each department record is expected to contain at least the following fields:
 *   - `department_guid` – unique identifier of the department
 *   - `parent_guid` – GUID of the parent department (or the root GUID)
 *   - other department properties (name, manager, etc.)
 *
 * The function recursively groups children under a `children` array on each
 * node. The resulting structure matches the expectations of `renderTree`
 * (which expects a `children` property and optionally a `level`/`department_name`
 * etc.).
 */
export function buildTree(data, parentGuid = "00000000-0000-0000-0000-000000000000") {
  // Find all nodes whose parent matches the supplied GUID
  const nodes = data
    .filter(d => d.parent_guid === parentGuid)
    .map(d => {
      // Recursively attach children for this node
      const children = buildTree(data, d.department_guid);
      return { ...d, children };
    });
  return nodes;
}

// Собираем все подчинённые департаменты рекурсивно
export function collectSubDepartments(node) {
    let result = [node];
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            result = result.concat(collectSubDepartments(child));
        });
    }
    return result;
}

// Получаем верхние уровни (без родителей)
export function getTopLevelDepartments(tree) {
    return tree;
}

// Присваиваем пользователям к департаментам
// Добавлен fallback: если в объекте нет ФИО, пытаемся построить его из email
export function attachUsersToDepartments(tree, users) {
  const usersByDept = {};
  users.forEach(u => {
    // Формируем ФИО
    let fullName = u.user_fio || '';
                if (!fullName) {
      // Пытаемся собрать из отдельных полей имени (если они есть)
                    const parts = [];
                    if (u.user_last_name) parts.push(u.user_last_name);
                    if (u.user_first_name) parts.push(u.user_first_name);
                    if (u.user_middle_name) parts.push(u.user_middle_name);
      if (parts.length) fullName = parts.join(' ');
                }
    if (!fullName) {
      // Если и так не удалось — делаем простую реконструкцию из email (часть до @)
      const emailLocal = (u.user_email || '').split('@')[0];
      if (emailLocal) {
        // заменяем точки и подчеркивания на пробелы, потом делаем каждое слово с заглавной буквы
        fullName = emailLocal
          .replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }

    const userObj = {
                    email: u.user_email,
                    full_name: fullName,
      hiring_date: u.user_hiring_date,
                };
    const deptGuid = u.user_dept_guid;
    if (!usersByDept[deptGuid]) usersByDept[deptGuid] = [];
    usersByDept[deptGuid].push(userObj);
            });

  // Прикрепляем к каждому департаменту список пользователей
  function attach(node) {
    const deptGuid = node.department_guid;
    node.users = usersByDept[deptGuid] || [];
    if (node.children) node.children.forEach(attach);
        }
    tree.forEach(attach);

  // После привязки пользователей пересчитываем численность персонала
  computeStaffCounts(tree);
}

// Рекурсивный подсчёт численности (включая дочерние подразделения)
export function computeStaffCounts(nodes) {
    // nodes может быть массивом корневых узлов или одиночным узлом
    if (Array.isArray(nodes)) {
        nodes.forEach(n => computeStaffCounts(n));
        return;
    }
    const node = nodes;
    let count = (node.users ? node.users.length : 0);
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            count += computeStaffCounts(child);
        });
    }
    node.staffCount = count;
    return count;
}
