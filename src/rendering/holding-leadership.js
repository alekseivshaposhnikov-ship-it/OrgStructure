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

import { isEmployeeExcludedByState } from "../core/utils/employee.js";
import { isAssistantUser } from "./unified-layout.js";

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
    // CR-013_assistant §13: ассистент Селиванова — Давыдова Наталья Владимировна.
    assistantEmail: "n.davidova@legenda-dom.ru",
    // CR-016 §20, §24-25: top-3 (Селиванов/Лукьянов/Клюев) сохраняют полное ФИО.
    keepFullName: true,
  },
  executives: {
    lukyanov: {
      key: "lukyanov",
      email: "laa@legenda-dom.ru",
      title: "Операционный директор Холдинга",
      keepFullName: true,
      // CR-013_assistant §13: ассистент Лукьянова — Волкова Алина Викторовна.
      assistantEmail: "a.volkova@legenda-dom.ru",
      // Дирекции идентифицируются по стабильному department_guid (CR-013_fix §12);
      // name — для читаемости, диагностики и fallback при отсутствии id.
      directorates: [
        { id: "34b41ed4-caf7-11e9-81e9-000c294addcc", name: "Дирекция по инвестициям" },
        { id: "0d8b980a-217c-11ea-81f2-000c294addcc", name: "Дирекция по экономике" },
        { id: "1b566222-15c1-11ea-81f1-000c294addcc", name: "Дирекция по строительству" },
        { id: "0f44f48a-39df-11ea-81f5-000c294addcc", name: "Дирекция по финансам и отчетности" },
        { id: "7bcb2f43-3a78-4c79-8a61-70b087b30f33", name: "Дирекция по проектированию" },
      ],
    },
    vinnik: {
      key: "vinnik",
      email: "l.vinnik@legenda-dom.ru",
      title: "Директор по развитию градостроительной подготовки проектов",
      // CR-020 §4: Винник не создаёт отдельный промежуточный уровень — его
      // дирекция находится непосредственно под Селивановым, а сам Винник
      // отображается руководителем этой дирекции (department_manager из API).
      inline: true,
      // CR-022 §2-3: организационно дирекция остаётся непосредственно под
      // Селивановым, но визуально отображается на уровне остальных дирекций
      // (row / presentation level = 2), а не на уровне топ-руководителей
      // (Лукьянов/Клюев). Явный визуальный уровень дирекции.
      presentationRow: 2,
      directorates: [
        {
          id: "b805ce29-bfa4-11ec-b6d7-4c5262500118",
          name: "Дирекция по развитию и градостроительной подготовке проектов",
        },
      ],
    },
    klyuev: {
      key: "klyuev",
      email: "avk@legenda-dom.ru",
      title: "Исполнительный директор Холдинга LEGENDA",
      // CR-016 §20, §24-25: top-3 — полное ФИО на диаграмме.
      keepFullName: true,
      // CR-013_assistant §13: ассистент Клюева — Лихачева Екатерина Олеговна.
      assistantEmail: "e.lihacheva@legenda-dom.ru",
      directorates: [
        { id: "0e9d7eaa-c503-11ee-bbff-d85ed308d2c7", name: "Дирекция по маркетингу" },
        { id: "ca4add27-c590-11ee-bbff-d85ed308d2c7", name: "Дирекция брендинга и коммуникаций" },
        { id: "b5496644-000f-11ec-821d-000c294addcc", name: "Дирекция по безопасности" },
        { id: "a751ef1b-fc81-11e9-81ee-000c294addcc", name: "Дирекция по продажам" },
        { id: "4ec3380f-49aa-11ea-81f8-000c294addcc", name: "Административно-правовая дирекция" },
        { id: "7e36c78d-aee7-11e9-81e5-000c294addcc", name: "Дирекция по персоналу" },
        { id: "6a7a8792-efe7-11e9-81eb-000c294addcc", name: "Дирекция по информационным технологиям" },
        // CR-013_fix §6-7: LEGENDA Comfort — подразделение Клюева (ренейм «Дирекции по эксплуатации»).
        { id: "9b30e683-df6d-11e9-81eb-000c294addcc", name: "LEGENDA Comfort" },
      ],
      directReports: [
        { email: "a.soydan@legenda-dom.ru" },
        { email: "o.kirillov@legenda-dom.ru" },
      ],
    },
  },
  // CR-013_assistant §4: presentation overrides для дирекций.
  // Ключ — стабильный department_guid; ФИО/email руководителя и ассистента
  // берутся из данных (при наличии) или из конфигурации.
  departmentOverrides: {
    "9b30e683-df6d-11e9-81eb-000c294addcc": {
      // LEGENDA Comfort: руководитель — Мишуев Александр Адольфович.
      managerEmail: "a.mishuev@legenda-comfort.ru",
      manager: "Мишуев Александр Адольфович",
      managerPosition: "Генеральный директор №1",
      // CR-013_assistant §13: ассистент Мишуева — Николаева Татьяна Владимировна.
      assistantEmail: "t.nikolaeva@legenda-comfort.ru",
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
 *
 * Индексирует прежде всего `sourceUsers` (полный нормализованный набор ДО
 * визуальной фильтрации по count >= 1), чтобы руководители с дробной
 * занятостью не терялись для holding projection (CR-013_fix §7).
 * Fallback на `users` сохраняется для совместимости со старыми fixtures.
 *
 * Возвращает Map<email, Array<user>> (одно совместительство — отдельная запись).
 */
export function collectUsersByEmail(nodes) {
  const map = new Map();
  (function walk(items) {
    (items || []).forEach((node) => {
      const source = Array.isArray(node.sourceUsers) ? node.sourceUsers : node.users || [];
      source.forEach((user) => {
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
 * Выбирает основную запись человека из нескольких записей (CR-013 §9, §11;
 * CR-013_fix §9, §24):
 * 1. type_employment === "Основное место работы";
 * 2. заполненный sub_level;
 * 3. count — только secondary tie-breaker (не обязательный фильтр);
 * 4. первая по порядку обхода.
 *
 * Факт существования человека определяется наличием хотя бы одной source-записи
 * по email и НЕ зависит от count >= 1 (CR-013_fix §8).
 */
export function selectPrimaryRecord(records) {
  const scored = [...records].map((record, index) => {
    const sub = record.subLevel;
    const filledSubLevel = Number.isFinite(sub) && sub !== Number.MAX_SAFE_INTEGER;
    const score =
      (String(record.typeEmployment || "").trim() === "Основное место работы" ? 2 : 0) +
      (filledSubLevel ? 1 : 0);
    const countScore = Math.min(Math.max(Number(record.count) || 0, 0), 1);
    return { record, score, countScore, index };
  });

  scored.sort((a, b) => b.score - a.score || b.countScore - a.countScore || a.index - b.index);
  return scored[0].record;
}

/**
 * Сопоставляет фактическое подразделение с записью конфигурации дирекции.
 *
 * Приоритет: стабильный department_guid → name fallback (CR-013_fix §13, §15).
 */
export function matchesConfiguredDepartment(department, configured) {
  if (!department || !configured) return false;

  if (configured.id && department.department_guid && configured.id === department.department_guid) {
    return true;
  }

  return Boolean(configured.name && department.department_name === configured.name);
}

/**
 * Возвращает ключ executive, которому принадлежит top-level подразделение,
 * или null, если подразделение не сопоставлено ни с одним руководителем.
 */
export function resolveExecutiveKey(department) {
  return resolveDepartmentMatch(department)?.key || null;
}

/**
 * Возвращает детальную информацию о сопоставлении подразделения:
 * { key, matchType } где matchType: "guid" | "name" | null (fallback/unassigned).
 * Используется и для mapping, и для debug-диагностики (CR-013_fix §20, §26).
 */
export function resolveDepartmentMatch(department) {
  if (!department) return null;
  const entries = Object.values(HOLDING_LEADERSHIP_CONFIG.executives);

  for (const execCfg of entries) {
    for (const configured of execCfg.directorates) {
      if (configured.id && department.department_guid && configured.id === department.department_guid) {
        return { key: execCfg.key, matchType: "guid" };
      }
    }
  }
  for (const execCfg of entries) {
    for (const configured of execCfg.directorates) {
      if (configured.name && department.department_name === configured.name) {
        return { key: execCfg.key, matchType: "name" };
      }
    }
  }
  return null;
}

/**
 * Нормализует presentation-запись ассистента (CR-013_assistant §13): краткая
 * роль вместо длинной должности API.
 */
export function normalizeAssistantPerson(person) {
  const position = String(person.rawPosition || person.position || "").toLowerCase();
  const label = position.includes("персональный ассистент")
    ? "Персональный ассистент"
    : "Административный ассистент";
  return { ...person, name: person.full_name || person.name, position: label };
}

/**
 * Строит presentation-узел executive (верхний руководитель) в shape,
 * совместимом с buildLayoutTree: department-подобный узел с маркером
 * isHoldingExecutive и реальной записью человека в __person.
 *
 * Сотрудники не добавляются к staffCount (CR-013 §28): численность считается
 * только из реальных department nodes.
 */
function buildExecutiveNode({ execCfg, person, directorates, directReports, findPerson }) {
  const personName = person.full_name || person.name || execCfg.title;

  const assistantPerson = execCfg.assistantEmail ? findPerson(execCfg.assistantEmail) : null;

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
    // CR-016 §20, §24-25: семантический presentation-флаг top-3 (полное ФИО).
    // Renderer работает только по этому флагу, а не по текстовому ФИО.
    keepFullName: Boolean(execCfg.keepFullName),
    // CR-019 §13: top-3 (Селиванов/Лукьянов/Клюев) — assistant sidecar справа,
    // остальные executives (например Винник) — assistant под карточкой.
    assistantPlacement: execCfg.keepFullName ? "side" : "below",
    scenarioState: person.scenarioState || "",
    // CR-013_assistant §13: presentation-ассистент руководителя (sidecar).
    ...(assistantPerson ? { __assistant: normalizeAssistantPerson(assistantPerson) } : {}),
    // Реальная запись человека — для карточки и детального просмотра (CR-013 §27, §30).
    __person: { ...person, name: personName, position: execCfg.title },
  };
}

/**
 * CR-013_assistant §4, §16: presentation override дирекции по стабильному
 * department_guid (например, LEGENDA Comfort). Возвращает копию узла —
 * исходное API-дерево не мутируется.
 */
function applyDepartmentOverride(department, findPerson) {
  const override = HOLDING_LEADERSHIP_CONFIG.departmentOverrides?.[department.department_guid];
  if (!override) return department;

  const managerPerson = override.managerEmail ? findPerson(override.managerEmail) : null;
  const assistantPerson = override.assistantEmail ? findPerson(override.assistantEmail) : null;

  return {
    ...department,
    department_manager: managerPerson?.full_name || override.manager || department.department_manager,
    department_manager_position:
      override.managerPosition || department.department_manager_position,
    ...(assistantPerson ? { __assistant: normalizeAssistantPerson(assistantPerson) } : {}),
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
      keepFullName: Boolean(HOLDING_LEADERSHIP_CONFIG.ceo.keepFullName),
      assistantPlacement: "side",
    };
  }

  const administration = children.find((child) => child.department_name === ADMINISTRATION_NAME);
  const topDepartments = children.filter((child) => child.department_name !== ADMINISTRATION_NAME);

  // Источник людей верхнего управления: всё дерево текущего режима.
  // Руководители могут находиться не только в «Администрации» (например,
  // Винник является сотрудником своей дирекции), поэтому ищем по всему дереву,
  // а записи «Администрации» считаем приоритетными при дублировании email.
  const byEmail = collectUsersByEmail(children);
  if (administration) {
    const adminUsers = collectUsersByEmail([administration]);
    adminUsers.forEach((records, email) => byEmail.set(email, records));
  }

  // Fallback-дерево (Changes): «Администрация» берётся из working tree.
  if (fallbackTree) {
    const fallbackAdmin = findDepartmentByName(fallbackTree, ADMINISTRATION_NAME);
    const fallbackUsers = collectUsersByEmail(fallbackAdmin ? [fallbackAdmin] : []);
    fallbackUsers.forEach((records, email) => {
      if (!byEmail.has(email)) byEmail.set(email, records);
    });
  }

  const findPerson = (email) => {
    const records = byEmail.get(normalizeEmail(email));
    if (!records || records.length === 0) return null;

    const selected = selectPrimaryRecord(records);
    // CR-016 §13-15: status filtering имеет приоритет над leadership config.
    // Excluded сотрудник (например «Отпуск по уходу за ребенком») не может
    // быть возвращён в оргструктуру через конфиг — executive / direct report /
    // assistant node не создаётся, выводится диагностический warning.
    if (isEmployeeExcludedByState(selected)) {
      console.warn(
        `Holding projection: Configured leadership employee excluded by employee state — "${selected.full_name}" (${email}) узел пропущен.`,
      );
      return null;
    }

    return selected;
  };

  const assistant = findPerson(HOLDING_LEADERSHIP_CONFIG.ceo.assistantEmail);
  const presentationChildren = [];
  const mapping = [];

  Object.values(HOLDING_LEADERSHIP_CONFIG.executives).forEach((execCfg) => {
    // Mapping по стабильному department_guid с name fallback (CR-013_fix §13).
    // Presentation overrides (CR-013_assistant §4) применяются к отдельным
    // дирекциям (LEGENDA Comfort) и не мутируют исходное дерево.
    const directorates = topDepartments
      .filter((department) =>
        execCfg.directorates.some((configured) => matchesConfiguredDepartment(department, configured)),
      )
      .map((department) => applyDepartmentOverride(department, findPerson));
    const missingDirectorates = execCfg.directorates
      .filter(
        (configured) =>
          !topDepartments.some((department) => matchesConfiguredDepartment(department, configured)),
      )
      .map((configured) => configured.name);
    if (missingDirectorates.length) {
      console.warn(
        `Holding projection: дирекции "${execCfg.title}" не найдены в дереве режима: ${missingDirectorates.join(", ")}.`,
      );
    }

    // CR-020 §4: inline-руководитель (Винник) не создаёт отдельный
    // управленческий узел — его дирекции поднимаются непосредственно под
    // Селиванова, а сам руководитель отображается в карточке дирекции.
    if (execCfg.inline) {
      directorates.forEach((directorate) => {
        // CR-022 §3: inline-дирекция может задавать явный визуальный уровень
        // (organizational parent = Селиванов, visual/presentation level =
        // presentationRow). Создаём presentation-копию узла, чтобы не мутировать
        // исходное дерево режима (AS IS / TO BE / Changes).
        const presentedDirectorate = Number.isFinite(execCfg.presentationRow)
          ? { ...directorate, presentationRow: execCfg.presentationRow }
          : directorate;
        presentationChildren.push(presentedDirectorate);
        mapping.push({
          entity: presentedDirectorate.department_name,
          type: "department",
          source: "API tree",
          presentationParent: HOLDING_LEADERSHIP_CONFIG.ceo.name,
        });
      });
      return;
    }

    // CR-016 §13: единый lookup с status filtering (findPerson отбрасывает
    // excluded сотрудников и выводит диагностический warning).
    const person = findPerson(execCfg.email);
    if (!person) {
      console.warn(
        `Holding projection: руководитель "${execCfg.title}" (${execCfg.email}) не найден в источнике данных — узел пропущен.`,
      );
      return;
    }

    const directReports = (execCfg.directReports || [])
      .map((report) => findPerson(report.email))
      .filter(Boolean);

    presentationChildren.push(
      buildExecutiveNode({ execCfg, person, directorates, directReports, findPerson }),
    );

    if (PROJECTION_DEBUG) {
      // Диагностика executive resolution (CR-013_fix §20).
      console.table([
        {
          executive: execCfg.key,
          email: execCfg.email,
          sourceRecords: (byEmail.get(normalizeEmail(execCfg.email)) || []).length,
          selectedName: person.full_name,
          selectedPosition: person.rawPosition,
          selectedEmployment: person.typeEmployment,
        },
      ]);
    }

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
  // Подразделение считается распределённым, если совпал GUID или name (CR-013_fix §13).
  const configuredEntries = Object.values(HOLDING_LEADERSHIP_CONFIG.executives).flatMap(
    (cfg) => cfg.directorates,
  );
  const assignedGuids = new Set(configuredEntries.map((entry) => entry.id).filter(Boolean));
  const assignedNames = new Set(configuredEntries.map((entry) => entry.name).filter(Boolean));
  const unassigned = topDepartments.filter(
    (department) =>
      !assignedGuids.has(department.department_guid) &&
      !assignedNames.has(department.department_name),
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

  if (PROJECTION_DEBUG) {
    // Диагностика department mapping (CR-013_fix §20, §26).
    console.table(
      topDepartments.map((department) => {
        const match = resolveDepartmentMatch(department);
        return {
          department_guid: department.department_guid,
          department_name: department.department_name,
          executive: match?.key || null,
          matchType: match?.matchType || "fallback",
        };
      }),
    );
  }

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
    // CR-016 §20, §25: Селиванов — top-3, полное ФИО на карточке root.
    keepFullName: Boolean(HOLDING_LEADERSHIP_CONFIG.ceo.keepFullName),
    // CR-019 §14: Селиванов — top-management, assistant «под-справа» (sidecar).
    assistantPlacement: "side",
  };

  if (PROJECTION_DEBUG) {
    console.table(mapping);
  }

  // CR-020 §5: в верхнеуровневом представлении ассистенты остаются только у
  // Селиванова, Лукьянова и Клюева (top-3). Остальные assistant-данные
  // снимаются на уровне presentation-модели.
  return applyUpperLevelAssistantPolicy(presentationRoot);
}

/**
 * CR-020 §5: в верхнеуровневом (свёрнутом) представлении административные
 * ассистенты отображаются только у трёх top-руководителей (Селиванов, Лукьянов,
 * Клюев). У остальных узлов assistant-данные снимаются на уровне presentation-
 * модели, а не через скрытие уже отрисованных карточек.
 *
 * Top-3 определяется существующим семантическим флагом `keepFullName`.
 * Исходное дерево не мутируется.
 */
function applyUpperLevelAssistantPolicy(node) {
  if (!node) return node;

  const children = mapChildrenPreservingReference(
    node.children,
    applyUpperLevelAssistantPolicy,
  );

  // Top-3 (Селиванов/Лукьянов/Клюев) сохраняют ассистента.
  if (node.keepFullName) {
    return children === node.children ? node : { ...node, children };
  }

  const hasExplicitAssistant = Boolean(node.__assistant);
  const users = stripAssistantUsers(node.users);
  const sourceUsers = stripAssistantUsers(node.sourceUsers);
  const usersChanged = users !== node.users;
  const sourceUsersChanged = sourceUsers !== node.sourceUsers;
  const childrenChanged = children !== node.children;

  // Нет assistant-данных и нет изменений в детях — сохраняем ссылку на узел,
  // чтобы не ломать presentation-копии с внутренней структурой «по ссылке».
  if (!hasExplicitAssistant && !usersChanged && !sourceUsersChanged && !childrenChanged) {
    return node;
  }

  const result = { ...node, children };
  if (hasExplicitAssistant) delete result.__assistant;
  if (usersChanged) result.users = users;
  if (sourceUsersChanged) result.sourceUsers = sourceUsers;
  return result;
}

function mapChildrenPreservingReference(children, fn) {
  if (!Array.isArray(children)) return children;
  let changed = false;
  const next = children.map((child) => {
    const mapped = fn(child);
    if (mapped !== child) changed = true;
    return mapped;
  });
  return changed ? next : children;
}

function stripAssistantUsers(users) {
  if (!Array.isArray(users)) return users;
  const next = users.filter((user) => !isAssistantUser(user));
  return next.length === users.length ? users : next;
}

