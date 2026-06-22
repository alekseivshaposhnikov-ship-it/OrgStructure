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
  return (apiNodes || []).map(node => transformNode(node));
}

function shortPosition(pos) {
  if (!pos) return '';
  const idx = pos.indexOf('/');
  return idx !== -1 ? pos.substring(0, idx).trim() : pos.trim();
}

function parseCount(value) {
  const countStr = value ? String(value).replace(',', '.') : '0';
  return parseFloat(countStr) || 0;
}

function parseSubLevel(value) {
  if (value === undefined || value === null || value === '') {
    return Number.MAX_SAFE_INTEGER;
  }

  return parseFloat(String(value).replace(',', '.')) || Number.MAX_SAFE_INTEGER;
}

function getProject(emp) {
  return (
    emp.projects ||
    emp.project ||
    emp.project_name ||
    emp.projectName ||
    emp.project_title ||
    ''
  );
}

function getPhone(emp) {
  return emp.phone || emp.phone_number || emp.mobile || emp.work_phone || '';
}

function getPhoto(emp) {
  return emp.photo || emp.photo_url || emp.avatar || emp.avatar_url || '';
}

function isSamePerson(emp, manager) {
  if (!manager) return false;

  if (manager.id && emp.id && manager.id === emp.id) return true;

  const empName = String(emp.full_name || '').trim().toLowerCase();
  const managerName = String(manager.full_name || '').trim().toLowerCase();

  return empName && managerName && empName === managerName;
}

function positionWeight(user) {
  if (Number.isFinite(user.subLevel)) return user.subLevel;

  const position = String(user.position || '').toLowerCase();

  if (position.includes('директор')) return 1;
  if (position.includes('руководитель')) return 2;
  if (position.includes('начальник')) return 3;
  if (position.includes('лидер') || position.includes('lead')) return 4;
  if (position.includes('ведущий')) return 5;
  if (position.includes('старший')) return 6;
  if (position.includes('главный')) return 6;

  return 100;
}

function sortUsersByPositionLevel(a, b) {
  if (a.isVacancy !== b.isVacancy) {
    return a.isVacancy ? 1 : -1;
  }

  const levelDiff = positionWeight(a) - positionWeight(b);
  if (levelDiff !== 0) return levelDiff;

  return String(a.full_name || a.position || '').localeCompare(
    String(b.full_name || b.position || ''),
    'ru'
  );
}

function transformNode(apiNode, parentId = null) {
  const allEmployees = apiNode.employees || [];

  const validEmployees = allEmployees.filter(emp => parseCount(emp.count) >= 1);
  const visibleEmployees = validEmployees.filter(emp => !isSamePerson(emp, apiNode.manager));

  const users = visibleEmployees.map(emp => ({
    full_name: emp.full_name,
    email: emp.email || '',
    phone: getPhone(emp),
    photo: getPhoto(emp),
    project: getProject(emp),
    name: emp.full_name,
    fullName: emp.full_name,
    id: emp.id,
    position: shortPosition(emp.position),
    rawPosition: emp.position || '',
    subLevel: parseSubLevel(emp.sub_level),
    typeEmployment: emp.type_employment || '',
    state: emp.state || '',
    isVacancy: false,
  }));

  const vacancies = (apiNode.vacancy_list || []).map(vac => ({
    id: vac.id,
    full_name: 'Вакансия',
    email: '',
    phone: '',
    photo: '',
    project: getProject(vac),
    name: 'Вакансия',
    fullName: 'Вакансия',
    position: shortPosition(vac.position),
    rawPosition: vac.position || '',
    subLevel: parseSubLevel(vac.sub_level),
    isVacancy: true,
  }));

  const children = (apiNode.children || []).map(child => transformNode(child, apiNode.id));

  const ownVacancyCount = vacancies.length;
  const childrenStaffCount = children.reduce((sum, child) => sum + (child.staffCount || 0), 0);
  const childrenVacancyCount = children.reduce((sum, child) => sum + (child.vacancyCount || 0), 0);

  const staffCount = validEmployees.length + childrenStaffCount;
  const vacancyCount = ownVacancyCount + childrenVacancyCount;
  const totalWithVacancies = staffCount + vacancyCount;

  return {
    department_guid: apiNode.id,
    department_name: apiNode.name,
    department_manager: apiNode.manager?.full_name || '',
    department_manager_position: shortPosition(apiNode.manager?.position || ''),
    parent_guid: parentId,
    staffCount,
    vacancyCount,
    totalWithVacancies,
    users: [...users, ...vacancies].sort(sortUsersByPositionLevel),
    children,
  };
}