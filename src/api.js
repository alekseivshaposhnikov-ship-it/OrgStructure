// src/api.js
// ----------------------------------------------------------------
// Загрузка организационной структуры с корпоративного API
// и преобразование ответа во внутренний формат дерева.
// ----------------------------------------------------------------

/**
 * Основная точка входа: возвращает массив корневых узлов.
 * @returns {Promise<Array>} Промис с массивом корневых департаментов,
 *          каждый узел имеет поля:
 *          department_guid, department_name, department_manager,
 *          staffCount, users, children.
 */
export async function fetchOrganizationStructure() {
  const url = '/api/getDepartmentVacancy';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
    }
    const apiData = await response.json();
    return transformApiResponse(apiData);
  } catch (error) {
    console.error('Не удалось загрузить данные структуры:', error);
    alert('Не удалось загрузить организационную структуру. Проверьте доступность сервера.');
    return []; // чтобы приложение не упало, возвращаем пустой массив
  }
}

/**
 * Рекурсивно преобразует ответ API (дерево) в формат,
 * используемый в renderTree, drawio, pptx и пр.
 *
 * @param {Array} apiNodes - массив узлов верхнего уровня от API
 * @returns {Array} Массив корневых узлов во внутреннем формате
 */
function transformApiResponse(apiNodes) {
  return apiNodes.map(node => transformNode(node));
}

/**
 * Обработка одного узла (департамента) из ответа API.
 * @param {Object} apiNode - узел API: id, name, manager, employees, children и т.д.
 * @param {string|null} parentId - идентификатор родительского департамента (для корней null)
 * @returns {Object} Узел во внутреннем представлении
 */
function transformNode(apiNode, parentId = null) {
  // --- Фильтрация сотрудников ---
  const allEmployees = apiNode.employees || [];
  const validEmployees = allEmployees.filter(emp => {
    // count может быть строкой с запятой или точкой, например "0,01" или "1"
    const countStr = emp.count ? String(emp.count).replace(',', '.') : '0';
    const countNum = parseFloat(countStr);
    return countNum >= 1;   // исключаем < 1
  });

  // Преобразуем оставшихся сотрудников
  const users = validEmployees.map(emp => {
    // Обрезаем должность до первого '/'
    let position = '';
    if (emp.position) {
      const idx = emp.position.indexOf('/');
      position = idx !== -1 ? emp.position.substring(0, idx).trim() : emp.position.trim();
    }

    return {
      full_name: emp.full_name,
      email: emp.email,
      name: emp.full_name,
      fullName: emp.full_name,
      id: emp.id,
      position: position,
    };
  });

  // Рекурсивно обрабатываем дочерние департаменты
  const children = (apiNode.children || []).map(child =>
    transformNode(child, apiNode.id)
  );

  // Численность = сотрудники самого департамента + сумма численностей всех потомков
  const staffCount =
    users.length + children.reduce((sum, child) => sum + child.staffCount, 0);

  return {
    department_guid: apiNode.id,
    department_name: apiNode.name,
    department_manager: apiNode.manager?.full_name || '',
    parent_guid: parentId,
    staffCount,
    users,
    children,
  };
}