/**
 * holding-leadership.js
 *
 * CR-013: верхнеуровневая управленческая проекция Холдинга
 * (holding leadership projection).
 *
 * При выборе корня организации («Холдинг LEGENDA») диаграмма строится по
 * управленческой иерархии, а не по техническому списку корневых дирекций:
 *
 *   Селиванов (root)
 *     ├── Персональный ассистент
 *     ├── Лукьянов (executive) → дирекции
 *     ├── Винник   (executive) → дирекции
 *     └── Клюев    (executive) → дирекции + прямые подчинённые
 *
 * Модуль строит presentation-дерево, совместимое с computeUnifiedLayout().
 * Исходное дерево режима (AS IS / TO BE / Changes) не мутируется: реальные
 * department nodes переиспользуются по ссылке, а люди верхнего управления
 * находятся в «Администрации» и копируются в presentation-узлы.
 */

// Debug-лог итогового upper-level mapping (CR-013 §36).
const PROJECTION_DEBUG = false;

const ADMINISTRATION_NAME = "Администрация";
const HOLDING_ROOT_ID = "synthetic-root";
const ASSISTANT_POSITION = "Персональный ассистент";

/**
 * Единая конфигурация верхнего руководства Холдинга (CR-013 §9, §12).
 *
 * Здесь же задаётся ассистент Селиванова: он привязан к конкретному человеку,
 * а не выбирается как «первый найденный ассистент в огромной ветке» (CR-013 §18).
 */
export const HOLDING_LEADERSHIP_CONFIG = {
  ceo: {
    name: "Селиванов Василий Геннадиевич",
    title: "Генеральный директор",
    assistantEmail: "a.volkova@legenda-dom.ru",
  },
  executives: {
    lukyanov: {
      key: "lukyanov",
      email: "laa@legenda-dom.ru",
      title: "Операционный директор Холдинга",
      directorates: [
        "Дирекция по инвестициям",
        "Дирекция по экономике",
        "Дирекция по строительству",
        "Дирекция по финансам и отчетности",
        "Дирекция по проектированию",
      ],
    },
    vinnik: {
      key: "vinnik",
      email: "l.vinnik@legenda-dom.ru",
      title: "Заместитель генерального директора по развитию",
      directorates: ["Дирекция по развитию и градостроительной подготовке проектов"],
    },
    klyuev: {
      key: "klyuev",
      email: "avk@legenda-dom.ru",
      title: "Исполнительный директор Холдинга",
      directorates: [
        "Дирекция по маркетингу",
        "Дирекция брендинга и коммуникаций",
        "Дирекция по безопасности",
        "Дирекция по продажам",
        "Административно-правовая дирекция",
        "Дирекция по персоналу",
        "Дирекция по информационным технологиям",
      ],
      directReports: [
        { email: "a.soydan@legenda-dom.ru" },
        { email: "o.kirillov@legenda-dom.ru" },
      ],
    },
  },
};

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findDepartmentByName(nodes, name) {
  for (const node of nodes || []) {
    if (node.department_name === name) return node;
    const found = findDepartmentByName(node.children || [], name);
    if (found) return found;
  }
  return null;
}

/**
 * Собирает всех сотрудников дерева в индекс по email.
 * Возвращает Map<email, Array<user>> (одно совместительство — отдельная запись).
 */
export function collectUsersByEmail(nodes) {
  const map = new Map();
  (function walk(items) {
    (items || []).forEach((node) => {
      (node.users || []).forEach((user) => {
        if (user.isVacancy) return;
        const email = normalizeEmail(user.email);
        if (!email) return;
        if (!map.has(email)) map.set(email, []);
        map.get(email).push(user);
      });
      walk(node.children || []);
    });
  })(nodes);
  return map;
}

/**
 * Выбирает основную запись человека из нескольких записей (CR-013 §11):
 * 1. type_employment === "Основное место работы";
 * 2. заполненный sub_level;
 * 3. первая по порядку обхода.
 */
export function selectPrimaryRecord(records) {
  const scored = [...records].map((record, index) => {
    const sub = record.subLevel;
    const filledSubLevel = Number.isFinite(sub) && sub !== Number.MAX_SAFE_INTEGER;
    const score =
      (String(record.typeEmployment || "").trim() === "Основное место работы" ? 2 : 0) +
      (filledSubLevel ? 1 : 0);
    return { record, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].record;
}

/**
 * Строит presentation-узел executive (верхний руководитель) в shape,
 * совместимом с buildLayoutTree: department-подобный узел с маркером
 * isHoldingExecutive и реальной записью человека в __person.
 *
 * Сотрудники не добавляются к staffCount (CR-013 §28): численность считается
 * только из реальных department nodes.
 */
function buildExecutiveNode({ execCfg, person, directorates, directReports }) {
  const personName = person.full_name || person.name || execCfg.title;

  return {
    department_guid: person.id || `holding-executive-${execCfg.key}`,
    department_name: personName,
    department_manager: personName,
    department_manager_position: execCfg.title,
    manager_sub_level: null,
    parent_guid: HOLDING_ROOT_ID,
    staffCount: 0,
    vacancyCount: 0,
    totalWithVacancies: 0,
    users: directReports.map((report) => ({ ...report })),
    children: directorates,
    isHoldingExecutive: true,
    executiveKey: execCfg.key,
    scenarioState: person.scenarioState || "",
    // Реальная запись человека — для карточки и детального просмотра (CR-013 §27, §30).
    __person: { ...person, name: personName, position: execCfg.title },
  };
}


/**
 * Строит верхнеуровневую управленческую проекцию корня Холдинга.
 *
 * @param {object} root - синтетический корень «Холдинг LEGENDA» текущего режима
 * @param {object} [options]
 * @param {Array|null} [options.fallbackTree] - дополнительное дерево-источник людей
 *   верхнего управления для режима «Изменения» (Changes строится из working tree
 *   и может не содержать неизменённую «Администрацию»).
 * @returns {object} presentation-дерево, совместимое с computeUnifiedLayout()
 */
export function buildHoldingLeadershipTree(root, { fallbackTree = null } = {}) {
  if (!root) return root;

  const children = root.children || [];

  if (!children.length) {
    return {
      ...root,
      children: [],
      __holdingPresentation: true,
      __assistant: null,
      __initialCollapsedIds: [],
    };
  }

  const administration = children.find((child) => child.department_name === ADMINISTRATION_NAME);
  const topDepartments = children.filter((child) => child.department_name !== ADMINISTRATION_NAME);

  // Источник людей верхнего управления: «Администрация» из дерева режима.
  const byEmail = collectUsersByEmail(administration ? [administration] : []);

  // Fallback-дерево (Changes): «Администрация» берётся из working tree.
  if (fallbackTree) {
    const fallbackAdmin = findDepartmentByName(fallbackTree, ADMINISTRATION_NAME);
    const fallbackUsers = collectUsersByEmail(fallbackAdmin ? [fallbackAdmin] : []);
    fallbackUsers.forEach((records, email) => {
      if (!byEmail.has(email)) byEmail.set(email, records);
    });
  }

  // Если «Администрация» отсутствует в дереве режима — ищем людей во всём дереве.
  if (!administration) {
    const modeUsers = collectUsersByEmail(children);
    modeUsers.forEach((records, email) => {
      if (!byEmail.has(email)) byEmail.set(email, records);
    });
  }

  const findPerson = (email) => {
    const records = byEmail.get(normalizeEmail(email));
    return records && records.length ? selectPrimaryRecord(records) : null;
  };

  const assistant = findPerson(HOLDING_LEADERSHIP_CONFIG.ceo.assistantEmail);
  const presentationChildren = [];
  const mapping = [];

  Object.values(HOLDING_LEADERSHIP_CONFIG.executives).forEach((execCfg) => {
    const person = findPerson(execCfg.email);
    if (!person) {
      console.warn(
        `Holding projection: руководитель "${execCfg.title}" (${execCfg.email}) не найден в источнике данных — узел пропущен.`,
      );
      return;
    }

    const directorates = topDepartments.filter((department) =>
      execCfg.directorates.includes(department.department_name),
    );
    const missingDirectorates = execCfg.directorates.filter(
      (name) => !topDepartments.some((department) => department.department_name === name),
    );
    if (missingDirectorates.length) {
      console.warn(
        `Holding projection: дирекции "${execCfg.title}" не найдены в дереве режима: ${missingDirectorates.join(", ")}.`,
      );
    }

    const directReports = (execCfg.directReports || [])
      .map((report) => findPerson(report.email))
      .filter(Boolean);

    presentationChildren.push(buildExecutiveNode({ execCfg, person, directorates, directReports }));

    mapping.push({
      entity: person.full_name || person.name,
      type: "executive",
      source: ADMINISTRATION_NAME,
      presentationParent: HOLDING_LEADERSHIP_CONFIG.ceo.name,
    });
    directorates.forEach((department) => {
      mapping.push({
        entity: department.department_name,
        type: "department",
        source: "API tree",
        presentationParent: execCfg.title,
      });
    });
  });

  // Нераспределённые top-level подразделения — fallback-группа под root (CR-013 §15, §26).
  const assignedNames = new Set(
    Object.values(HOLDING_LEADERSHIP_CONFIG.executives).flatMap((cfg) => cfg.directorates),
  );
  const unassigned = topDepartments.filter(
    (department) => !assignedNames.has(department.department_name),
  );
  unassigned.forEach((department) => {
    console.warn(
      `Holding projection: подразделение "${department.department_name}" не описано в leadership config и выводится под root (fallback).`,
    );
    presentationChildren.push(department);
    mapping.push({
      entity: department.department_name,
      type: "department",
      source: "API tree",
      presentationParent: `${HOLDING_LEADERSHIP_CONFIG.ceo.name} (fallback)`,
    });
  });

  // Дирекции всех executives и fallback-дирекции изначально свернуты (CR-012, CR-013 §22).
  const initialCollapsedIds = [];
  presentationChildren.forEach((child) => {
    if (child.isHoldingExecutive) {
      (child.children || []).forEach((directorate) => {
        const id = directorate.department_guid || directorate.id;
        if (id) initialCollapsedIds.push(id);
      });
    } else {
      const id = child.department_guid || child.id;
      if (id) initialCollapsedIds.push(id);
    }
  });

  const presentationRoot = {
    ...root,
    children: presentationChildren,
    __holdingPresentation: true,
    __assistant: assistant ? { ...assistant, position: ASSISTANT_POSITION } : null,
    __initialCollapsedIds: initialCollapsedIds,
  };

  if (PROJECTION_DEBUG) {
    console.table(mapping);
  }

  return presentationRoot;
}

