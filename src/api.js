// src/api.js
// ----------------------------------------------------------------
// Загрузка организационной структуры с корпоративного API
// и преобразование ответа во внутренний формат дерева.
// ----------------------------------------------------------------

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
    return [];
  }
}

function transformApiResponse(apiNodes) {
  return apiNodes.map(node => transformNode(node));
}

function transformNode(apiNode, parentId = null) {
  // Сотрудники с count >= 1
  const allEmployees = apiNode.employees || [];
  const validEmployees = allEmployees.filter(emp => {
    const countStr = emp.count ? String(emp.count).replace(',', '.') : '0';
    const countNum = parseFloat(countStr);
    return countNum >= 1;
  });

  const shortPosition = pos => {
    if (!pos) return '';
    const idx = pos.indexOf('/');
    return idx !== -1 ? pos.substring(0, idx).trim() : pos.trim();
  };

  const users = validEmployees.map(emp => ({
    full_name: emp.full_name,
    email: emp.email,
    name: emp.full_name,
    fullName: emp.full_name,
    id: emp.id,
    position: shortPosition(emp.position),
    isVacancy: false,
  }));

  // Вакансии
  const vacancies = (apiNode.vacancy_list || []).map(vac => ({
    id: vac.id,
    full_name: "Вакансия",
    email: "",
    name: "Вакансия",
    fullName: "Вакансия",
    position: shortPosition(vac.position),
    isVacancy: true,
  }));

  // Количество вакансий именно этого узла (без учёта детей)
  const vacancyCount = vacancies.length;

  // Добавляем вакансии в общий список
  users.push(...vacancies);

  // Дочерние департаменты
  const children = (apiNode.children || []).map(child =>
    transformNode(child, apiNode.id)
  );

  // Фактическая численность (только сотрудники)
  const staffCount =
    validEmployees.length + children.reduce((sum, child) => sum + child.staffCount, 0);

  // Общая численность с учётом вакансий (рекурсивно)
  const totalWithVacancies =
    staffCount +
    vacancyCount +
    children.reduce((sum, child) => sum + (child.vacancyCount || 0), 0);

  return {
    department_guid: apiNode.id,
    department_name: apiNode.name,
    department_manager: apiNode.manager?.full_name || '',
    parent_guid: parentId,
    staffCount,               // фактическая численность
    vacancyCount,             // число вакансий в этом узле и его потомках (для отображения)
    totalWithVacancies,       // сумма фактической + вакансий
    users,
    children,
  };
}