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
  // Список сотрудников преобразуем в объекты, понятные renderTree и экспортам
  const users = (apiNode.employees || []).map(emp => ({
    full_name: emp.full_name,
    email: emp.email,
    // Для совместимости с pptx.js, который ищет u.name или u.fullName
    name: emp.full_name,
    fullName: emp.full_name,
    // Дополнительные поля могут быть полезны в будущем
    id: emp.id,
    position: emp.position,
  }));

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
    // Руководитель – берём ФИО из объекта manager
    department_manager: apiNode.manager?.full_name || '',
    parent_guid: parentId, // не обязательно для рендера, но может пригодиться
    staffCount,
    users,
    children,
  };
}