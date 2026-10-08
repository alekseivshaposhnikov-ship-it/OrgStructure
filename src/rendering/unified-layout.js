/**
 * unified-layout.js
 *
 * Единый layout организационной диаграммы (CR007).
 *
 * Принцип:
 *   - Вертикальная координата (строка) — управленческий уровень руководителя
 *     подразделения (manager.subLevel), fallback: уровень родителя + 1.
 *   - Горизонтальная координата (колонка) — реальная parent-child иерархия.
 *   - Сотрудники/вакансии не являются организационным уровнем и выводятся
 *     отдельной колонкой внутри ветки своего подразделения.
 *   - Административный ассистент — специальный узел рядом с корнем.
 *
 * Модуль не зависит от DOM и легко тестируется.
 */

import { formatEmployeeDisplayName } from "../core/utils/employee.js";
import { normalizeProjects } from "../core/utils/string.js";
import { buildEmployeePresentations } from "../core/utils/grouping.js";

const MAX_SUBLEVEL = Number.MAX_SAFE_INTEGER;

/**
 * Нормализует управленческий уровень подразделения для layout (CR-008_3).
 * Дробная часть sub_level не создаёт отдельный визуальный ряд:
 * 4.0, 4.1, 4.9 → management level 4.
 * Не изменяет исходное значение sub_level.
 */
export function normalizeManagementLevel(subLevel) {
  if (!Number.isFinite(subLevel)) return null;
  return Math.floor(subLevel);
}

export const NODE_DEPARTMENT = "department";
export const NODE_EMPLOYEES = "employees";
export const NODE_ASSISTANT = "assistant";

const DEFAULT_OPTIONS = {
  showVacancies: true,
  departmentWidth: 350,
  departmentHeight: 130,
  employeeWidth: 350,
  employeeHeight: 96,
  assistantWidth: 350,
  assistantHeight: 96,
  employeesHeaderHeight: 28,
  colGap: 40,
  rowGap: 60,
  personGap: 8,
  contentGap: 30,
  // CR-015 §3-6: assistant — локальный sidecar СПРАВА от manager. Позиция
  // рассчитывается только от карточки manager, а не от subtree/row:
  //   assistant.x = manager.x + manager.width + assistantHorizontalGap;
  //   assistant.y = manager.y + assistantVerticalOffset.
  // Верх assistant остаётся приблизительно на уровне manager (небольшой
  // vertical offset), поэтому assistant не выглядит отдельным organizational level.
  assistantHorizontalGap: 16,
  assistantVerticalOffset: 28,
  // CR-019 §7: обычный assistant (assistantPlacement="below") располагается
  // непосредственно под карточкой manager с небольшим вертикальным gap.
  assistantVerticalGap: 8,
  assistantSidecarWidth: 240,
  assistantSidecarHeight: 44,
  // CR-020 §6: высота одной дополнительной строки ФИО в сгруппированной
  // карточке административных ассистентов (одна визуальная группа).
  assistantMemberHeight: 30,
  // CR-015 §22-26: collapse/expand control — часть layout-геометрии. Baseline
  // toggle привязан к visual row (rowVisualBottom + toggleGap), а не к content height.
  toggleGap: 14,
  paddingX: 40,
  paddingY: 40,
  // CR-023: presentation-группировка сотрудников с одинаковой должностью
  // внутри одного подразделения (визуальное объединение, модель не меняется).
  groupByPosition: false,
  // CR-023: расчёт высоты карточек по фактическому содержимому (включая
  // перенос длинных должностей). По умолчанию выключено — сохраняет прежнюю
  // геометрию для существующих сценариев/тестов; приложение включает его.
  measureContent: false,
  // CR-023-01 §3: диагностические показатели (sub_level / layout / row / level)
  // включаются отдельным переключателем «Показывать уровни». По умолчанию
  // выключено — диагностика не резервирует место и не влияет на геометрию.
  showLevels: false,
  // Ролевая presentation для PDF (CR-003-02): department-card получает
  // динамическую высоту по числу должностей. По умолчанию выключено —
  // не влияет на экран и detailed-режим.
  rolesPresentation: false,
  rolesDepartmentHeaderHeight: 0,
  rolesDepartmentSeparatorHeight: 0,
  rolesDepartmentRowHeight: 0,
  rolesDepartmentPadding: 0,
};

/**
 * CR-023 §5-6: метрики компактной карточки сотрудника/группы. Единый источник
 * для экранного/PDF-рендера и расчёта высоты в layout. Значения согласованы со
 * стилями `.chart-card--employee` / `.chart-card--group` (style.css) и с
 * SVG-рендером PDF (pdf-d3-export.js).
 */
export const CARD_METRICS = {
  paddingX: 8,
  paddingY: 6,
  // CR-023-01 §5.3: рамка карточки (2px сверху и снизу, border-box) входит в
  // фактическую высоту, поэтому измерение обязано её учитывать, иначе контент
  // обрезается `.chart-card { overflow: hidden }`.
  borderY: 2,
  nameFont: 13,
  nameLine: 16,
  positionFont: 11,
  positionLine: 14,
  projectFont: 10,
  projectLine: 13,
  groupHeaderFont: 12,
  groupHeaderLine: 15,
  // `.chart-card__group-members { margin-top: 3px }` — отступ от заголовка к ФИО.
  groupHeaderGap: 3,
  // `.chart-card__group-member { padding: 1px ... }` — внутренний отступ строки ФИО.
  memberPaddingY: 1,
  // margin/gap между отдельными элементами карточки сотрудника и между ФИО.
  memberGap: 3,
  minHeight: 44,
  // Диагностическая строка (CR-023-01 §3.1): компактный шрифт 9px / line 12px.
  debugFont: 9,
  debugLine: 12,
  debugMarginTop: 3,
  // Резерв по бокам диагностической строки (внутренние отступы карточки +
  // место под счётчик сотрудников справа). Совпадает с CSS .chart-card__layout-debug.
  debugSideGap: 31,
};

/**
 * Приблизительная оценка числа строк текста при заданной ширине и кегле.
 * Не требует DOM (layout не зависит от браузера). Оценка консервативна
 * (склонна к завышению) — карточка никогда не окажется ниже содержимого.
 *
 * @param {string} text
 * @param {number} maxWidth - доступная ширина контента, px
 * @param {number} fontSize - кегль, px
 * @param {number} [charWidthFactor=0.56] - средняя ширина символа к кеглю
 * @returns {number}
 */
export function measureTextLines(text, maxWidth, fontSize, charWidthFactor = 0.56) {
  const value = String(text || "").trim();
  if (!value) return 0;

  const charWidth = Math.max(1, fontSize * charWidthFactor);
  const perLine = Math.max(1, Math.floor(maxWidth / charWidth));
  return Math.max(1, Math.ceil([...value].length / perLine));
}

/** Высота одиночной карточки сотрудника/вакансии по содержимому (CR-023 §6.2). */
export function measureEmployeeCardHeight(data, cardWidth, metrics = CARD_METRICS) {
  const contentWidth = Math.max(40, cardWidth - metrics.paddingX * 2 - metrics.borderY * 2);
  // border-box: рамка и внутренние отступы входят в фактическую высоту карточки.
  let height = (metrics.paddingY + metrics.borderY) * 2;

  height +=
    measureTextLines(data.displayName || data.name, contentWidth, metrics.nameFont) *
    metrics.nameLine;

  if (data.position) {
    height +=
      metrics.memberGap +
      measureTextLines(data.position, contentWidth, metrics.positionFont) *
        metrics.positionLine;
  }

  const project = normalizeProjects(data.project);
  if (project) {
    height +=
      metrics.memberGap +
      measureTextLines(project, contentWidth, metrics.projectFont) * metrics.projectLine;
  }

  return Math.max(height, metrics.minHeight);
}

/** Высота групповой карточки: заголовок должности + строки ФИО (CR-023 §5, §6.2). */
export function measureGroupCardHeight(data, cardWidth, metrics = CARD_METRICS) {
  const contentWidth = Math.max(40, cardWidth - metrics.paddingX * 2 - metrics.borderY * 2);
  // Правая часть заголовка занята счётчиком сотрудников — текст должности
  // переносится в пределах оставшейся ширины.
  const headerWidth = Math.max(40, contentWidth * 0.72);

  // CR-023-01 §5.3: border-box — рамка + внутренние отступы.
  let height = (metrics.paddingY + metrics.borderY) * 2;
  height +=
    measureTextLines(data.position, headerWidth, metrics.groupHeaderFont) *
    metrics.groupHeaderLine;

  const members = Array.isArray(data.members) ? data.members : [];
  if (members.length) {
    // `.chart-card__group-members { margin-top: 3px }` + строки ФИО (padding + line).
    height += metrics.groupHeaderGap;
    members.forEach((member, index) => {
      if (index > 0) height += metrics.memberGap;
      const nameLines = Math.max(
        1,
        measureTextLines(member.displayName || member.name, contentWidth, metrics.nameFont),
      );
      // `.chart-card__group-member { padding: 1px ... }` + name line-height 16px.
      height += metrics.memberPaddingY * 2 + nameLines * metrics.nameLine;
    });
  }

  return Math.max(height, metrics.minHeight);
}

/**
 * Текст диагностической строки (CR-010, CR-023-01 §2). Единый источник формата
 * для экранного рендера (chart-cards.js) и для измерения высоты в layout.
 * - sub — реальный sub_level сущности (руководителя/сотрудника);
 * - layout — вычисленный effectiveLayoutLevel;
 * - row — фактическая визуальная строка;
 * - level — фактическая глубина подразделения (только для подразделений).
 * Отсутствующее значение обозначается «—». compact — короткий формат Compact A4.
 */
export function formatLayoutDebugText(nd, { compact = false } = {}) {
  if (!nd) return "";

  const actual = nd.actualManagerSubLevel ?? nd.managerSubLevel ?? nd.subLevel;
  const sub =
    Number.isFinite(actual) && actual !== MAX_SUBLEVEL ? String(actual) : "—";
  const eff = nd.effectiveLayoutLevel ?? "—";
  const row = nd.row ?? "—";
  const level = Number.isFinite(nd.level) ? nd.level : null;

  if (level !== null) {
    return compact
      ? `lvl:${level} s:${sub} l:${eff} r:${row}`
      : `level: ${level} · sub: ${sub} · layout: ${eff} · row: ${row}`;
  }

  return compact
    ? `s:${sub} l:${eff} r:${row}`
    : `sub: ${sub} · layout: ${eff} · row: ${row}`;
}

/**
 * Высота диагностической строки по её фактическому содержимому (CR-023-01 §5.5):
 * шрифт 9px, line 12px, перенос допускается с пересчётом высоты. Возвращает 0,
 * если диагностика выключена — блок не занимает место.
 */
export function measureLayoutDebugHeight(data, cardWidth, metrics = CARD_METRICS) {
  const text = formatLayoutDebugText(data);
  if (!text) return 0;

  const available = Math.max(40, cardWidth - metrics.debugSideGap * 2);
  const lines = measureTextLines(text, available, metrics.debugFont);
  return metrics.debugMarginTop + lines * metrics.debugLine;
}


export function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return position.includes("административный ассистент");
}

/**
 * Ассистент руководителя — персональный или административный (CR-013_fix §9).
 * Используется в layout для привязки assistant к его непосредственному manager.
 * Не заменяет isAdministrativeAssistant() (используется PDF role aggregation).
 */
export function isAssistantUser(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return (
    position.includes("административный ассистент") ||
    position.includes("персональный ассистент")
  );
}

/**
 * Нормализует метку assistant-карточки (CR-013_assistant §13): вместо длинной
 * должности API показывается краткая роль.
 */
export function normalizeAssistantLabel(position) {
  const p = String(position || "").toLowerCase();
  return p.includes("персональный ассистент")
    ? "Персональный ассистент"
    : "Административный ассистент";
}

export function findAdministrativeAssistant(users) {
  return (users || []).find((user) => isAdministrativeAssistant(user)) || null;
}

export function findAdministrativeAssistantInSubtree(node) {
  const ownAssistant = findAdministrativeAssistant(node.users || []);
  if (ownAssistant) return ownAssistant;

  for (const child of node.children || []) {
    const childAssistant = findAdministrativeAssistantInSubtree(child);
    if (childAssistant) return childAssistant;
  }

  return null;
}

/**
 * CR-023 §5: presentation-данные сотрудника для карточки (экран/PDF).
 * Единый источник полей; исходный объект не мутируется.
 */
function makeEmployeePresentationData(user) {
  return {
    ...user,
    id: user.id || `user_${Math.random().toString(16).slice(2)}`,
    name: user.full_name || user.name || "Сотрудник",
    // CR-016 §34: presentation ФИО (Фамилия Имя), топ-3 — полное.
    displayName: formatEmployeeDisplayName(user.full_name || user.name || "", {
      keepFullName: Boolean(user.keepFullName),
    }),
    position: user.position || "",
    isDepartment: false,
    isVacancy: !!user.isVacancy,
    isAssistant: false,
  };
}

/**
 * Строит person-элемент колонки сотрудников (CR-023 §10): одиночная карточка
 * либо групповая карточка нескольких сотрудников с одинаковой должностью.
 * Участники группы остаются самостоятельными интерактивными элементами и
 * несут собственный id исходной записи (для детального просмотра и меню).
 */
function makePersonEntry(presentation, departmentNode, index) {
  if (presentation.type === "group") {
    const members = presentation.members.map((member) => ({
      ...makeEmployeePresentationData(member),
      isGroupMember: true,
    }));

    return {
      type: "group",
      members,
      data: {
        id: `employee-group-${departmentNode.department_guid || index}-${index}`,
        isGroup: true,
        isDepartment: false,
        isVacancy: false,
        isAssistant: false,
        name: presentation.position,
        position: presentation.position,
        memberCount: members.length,
        // CR-023-01 §2.3: диагностика группы выводится один раз — sub_level
        // берётся у представителя группы (первого участника).
        subLevel: members[0]?.subLevel,
        members,
      },
    };
  }

  return { type: "person", data: makeEmployeePresentationData(presentation.data) };
}

/**
 * Строит внутреннее дерево layout-модели.
 * Узел: { type, data?, persons?, children?, rawLevel?, row?, x?, y?, width?, height?, subtreeWidth? }
 */
export function buildLayoutTree(
  rootNode,
  { showVacancies = true, collapsedIds = null, groupByPosition = false } = {},
) {
  // Универсальная привязка ассистентов (CR-013_fix §9, §12; CR-013_assistant §12):
  // каждый assistant является sidecar-node своего непосредственного руководителя —
  // department, в чьих sourceUsers/users он находится. Явные presentation-ассистенты
  // (__assistant, задаются конфигурацией верхнего руководства) имеют приоритет.
  const assistantOwners = new Map();
  (function collectOwners(node) {
    if (node.__assistant?.id) assistantOwners.set(node.__assistant.id, node);
    (node.children || []).forEach(collectOwners);
  })(rootNode);

  function findOwnAssistants(node) {
    const explicit = node.__assistant ? [node.__assistant] : [];
    // Ролевой PDF (CR-003-02) агрегирует сотрудников в roles — отдельные
    // assistant-узлы создаются только для явных presentation-ассистентов.
    if (Array.isArray(node.pdfRoles)) return explicit;

    const source = Array.isArray(node.sourceUsers) ? node.sourceUsers : node.users || [];
    const fromUsers = source
      .filter((user) => !user.isVacancy)
      .filter((user) => isAssistantUser(user))
      // Не привязываем повторно ассистентов, явно закреплённых за другим department.
      .filter((user) => !(assistantOwners.has(user.id) && assistantOwners.get(user.id) !== node));

    return [...explicit, ...fromUsers];
  }

  function makeAssistantNode(assistant) {
    return {
      type: NODE_ASSISTANT,
      data: {
        ...assistant,
        id: assistant.id,
        position: normalizeAssistantLabel(assistant.position),
        isDepartment: false,
        isVacancy: false,
        isAssistant: true,
        // CR-016 §32: presentation ФИО (Фамилия Имя), полное имя не трогаем.
        displayName: formatEmployeeDisplayName(assistant.full_name || assistant.name || ""),
      },
    };
  }

  function makeAssistantGroupNode(assistants) {
    const members = assistants.map((assistant) => ({
      ...assistant,
      position: normalizeAssistantLabel(assistant.position),
      isDepartment: false,
      isVacancy: false,
      isAssistant: true,
      displayName: formatEmployeeDisplayName(assistant.full_name || assistant.name || ""),
    }));

    return {
      type: NODE_ASSISTANT,
      data: {
        id: `assistant-group-${assistants
          .map((assistant) => assistant.id)
          .sort()
          .join("+")}`,
        position: "Административный ассистент",
        isDepartment: false,
        isVacancy: false,
        isAssistant: true,
        isAssistantGroup: true,
        members,
      },
    };
  }

  function buildAssistantNodes(assistants) {
    // CR-020 §6: два и более административных ассистента одного руководителя
    // отображаются одной визуальной группой (не создаются отдельные ветки).
    if (
      assistants.length >= 2 &&
      assistants.every((assistant) => isAdministrativeAssistant(assistant))
    ) {
      return [makeAssistantGroupNode(assistants)];
    }

    return assistants.map((assistant) => makeAssistantNode(assistant));
  }

  function buildDepartment(node, depth = 0) {
    const data = {
      id: node.department_guid || node.id,
      isDepartment: true,
      // CR-023-01 §2.2: фактическая глубина подразделения в дереве (не sub_level
      // сотрудника). Выводится в диагностической строке карточки подразделения.
      level: Number.isFinite(depth) ? depth : 0,
      name: node.department_name || node.name || "Без названия",
      headName: node.department_manager || "",
      headPosition: node.department_manager_position || "",
      // CR-016 §30: presentation ФИО руководителя (Фамилия Имя) для карточек.
      // Полный headName сохраняется для detail modal / поиска / идентификации.
      headDisplayName: node.department_manager
        ? formatEmployeeDisplayName(node.department_manager, {
            keepFullName: Boolean(node.keepFullName),
          })
        : "",
      // CR-016 §20, §24: семантический presentation-флаг топ-3 (полное ФИО).
      keepFullName: Boolean(node.keepFullName),
      staffCount: node.staffCount || 0,
      vacancyCount: node.vacancyCount || 0,
      totalWithVacancies: node.totalWithVacancies ?? node.staffCount ?? 0,
      scenarioState: node.scenarioState || "",
      managerSubLevel: node.manager_sub_level,
    };

    // CR-022 §3: явный визуальный уровень для presentation-узлов, у которых
    // организационный родитель отличается от визуального уровня (например,
    // inline-дирекция Винника: parent = Селиванов, visual row = 2).
    if (Number.isFinite(node.presentationRow)) {
      data.presentationRow = node.presentationRow;
    }

    // Ролевая presentation (CR-003-02 §19): агрегированные должности переезжают
    // в data подразделения и используются только ролевым PDF-режимом.
    if (Array.isArray(node.pdfRoles)) {
      data.pdfRoles = node.pdfRoles;
    }

    // CR-013 §27: presentation-узел верхнего руководителя (executive) рендерится
    // отдельной карточкой и несёт реальную запись человека для детального просмотра.
    if (node.isHoldingExecutive) {
      data.isHoldingExecutive = true;
    }
    if (node.__person) {
      Object.assign(data, node.__person, {
        id: data.id,
        name: node.department_name || node.__person.full_name || data.name,
        position: data.headPosition || node.__person.position || "",
        isDepartment: true,
        // CR-016 §20, §22, §49: presentation ФИО карточки — топ-3 (keepFullName)
        // сохраняют полное ФИО, остальные (например Винник) — «Фамилия Имя».
        displayName: formatEmployeeDisplayName(
          node.department_name || node.__person.full_name || data.name,
          { keepFullName: data.keepFullName },
        ),
      });
    }

    // Согласованная вертикальная геометрия ролевой карточки (CR-003-03-fix-height):
    // высота карточки зависит от фактического количества строк названия,
    // layout и renderer используют один и тот же pdfCardLayout.
    if (node.pdfCardLayout) {
      data.pdfCardLayout = node.pdfCardLayout;
    }

    const ownAssistants = findOwnAssistants(node);

    const users = (node.users || [])
      .filter((user) => showVacancies || !user.isVacancy)
      .filter((user) => !isAssistantUser(user))
      // Не показываем в колонке ассистентов, явно привязанных к другому department
      // (CR-013_assistant §12) — они выводятся как sidecar.
      .filter((user) => !(assistantOwners.has(user.id) && assistantOwners.get(user.id) !== node));

    const children = [];

    // Собственные ассистенты подразделения — sidecar рядом с карточкой
    // руководителя (CR-013_assistant §6-8): не создают организационный уровень.
    buildAssistantNodes(ownAssistants).forEach((assistantNode) => {
      children.push(assistantNode);
    });

    const presentations = buildEmployeePresentations(users, { groupByPosition });

    if (presentations.length) {
      children.push({
        type: NODE_EMPLOYEES,
        // CR-023 §10: набор визуальных элементов — отдельные сотрудники либо
        // группы сотрудников с одинаковой должностью (presentation-этап).
        persons: presentations.map((presentation, index) =>
          makePersonEntry(presentation, node, index),
        ),
      });
    }

    (node.children || []).forEach((child) => {
      children.push(buildDepartment(child, depth + 1));
    });

    const isCollapsed = collapsedIds ? collapsedIds.has(data.id) : false;

    // CR-019 §13: семантический флаг размещения assistant. Top-management
    // (keepFullName / isHoldingExecutive + assistantPlacement="side") — sidecar
    // справа; остальные руководители — "below" (непосредственно под manager).
    const assistantPlacement = node.assistantPlacement || "below";

    if (isCollapsed) {
      // CR-015 §28, §53: при collapse скрываются только organizational children.
      // Sidecar-ассистенты остаются видимыми рядом с manager — assistant не
      // является organizational child и не должен исчезать вместе с веткой.
      const sidecarAssistants = children.filter((child) => child.type === NODE_ASSISTANT);
      return {
        type: NODE_DEPARTMENT,
        data,
        children: sidecarAssistants,
        collapsed: true,
        assistantPlacement,
        // Скрыты все children, кроме оставшихся видимыми sidecar-ассистентов.
        hiddenChildrenCount: children.length - sidecarAssistants.length,
      };
    }

    return { type: NODE_DEPARTMENT, data, children, assistantPlacement };
  }

  return buildDepartment(rootNode, 0);
}

/**
 * Проход 1 (CR-008_2_2, CR-008_3): фиксирует реальный managerSubLevel,
 * нормализует его в normalizedManagementLevel (целая часть) и устанавливает
 * effectiveLayoutLevel из нормализованного уровня.
 * Для узлов без уровня effectiveLayoutLevel остаётся null —
 * он заполняется на проходе 2 (sibling-группа).
 */
function assignActualLevels(node) {
  if (node.type === NODE_DEPARTMENT) {
    const sl = node.data.managerSubLevel;
    const finite = Number.isFinite(sl) && sl !== MAX_SUBLEVEL;
    node.actualManagerSubLevel = finite ? sl : null;
    node.normalizedManagementLevel = finite ? normalizeManagementLevel(sl) : null;
    node.effectiveLayoutLevel = node.normalizedManagementLevel;
  }

  (node.children || []).forEach(assignActualLevels);
}

/**
 * Возвращает mode списка валидных уровней.
 * При неоднозначности (одинаковая частота) — минимальный уровень.
 */
function siblingMode(levels) {
  const frequency = new Map();
  levels.forEach((level) => frequency.set(level, (frequency.get(level) || 0) + 1));

  const maxFrequency = Math.max(...frequency.values());
  const candidates = [...frequency.entries()]
    .filter(([, count]) => count === maxFrequency)
    .map(([level]) => level);

  return Math.min(...candidates);
}

/**
 * Проход 2 (CR-008_2_2 §1, §5): нормализация уровня sibling-групп.
 * - department children одного parent: отсутствующий уровень получает
 *   mode валидных уровней группы (при неоднозначности — минимальный);
 * - если валидных нет — parent.effectiveLayoutLevel + 1;
 * - root без уровня — 0 (row root всегда 0).
 * Employees/assistant в расчёте не участвуют.
 */
function applySiblingFallback(node, isRoot = false) {
  if (node.type === NODE_DEPARTMENT && node.effectiveLayoutLevel == null) {
    node.effectiveLayoutLevel = isRoot ? 0 : null;
  }

  const departmentChildren = (node.children || []).filter(
    (child) => child.type === NODE_DEPARTMENT,
  );

  if (departmentChildren.length) {
    const validLevels = departmentChildren
      .map((child) => child.effectiveLayoutLevel)
      .filter((level) => level != null);

    const siblingLevel = validLevels.length
      ? siblingMode(validLevels)
      : (node.effectiveLayoutLevel ?? 0) + 1;

    departmentChildren.forEach((child) => {
      if (child.effectiveLayoutLevel == null) {
        child.effectiveLayoutLevel = siblingLevel;
      }
    });
  }

  (node.children || []).forEach((child) => applySiblingFallback(child, false));
}

/**
 * Назначает визуальную строку row на основе effectiveLayoutLevel
 * (CR-008_2_2 §7, §8):
 * - root всегда row 0;
 * - встречающиеся levels сжимаются в строки 1..N без пустых строк
 *   (например 4 и 6 → строки 1 и 2);
 * - parent-child hierarchy сохраняется: child.row > parent.row.
 * - явный визуальный уровень (`data.presentationRow`, CR-022 §3) имеет
 *   приоритет: узел отображается на заданном row, сохраняя организационного
 *   родителя (например inline-дирекция Винника: parent = Селиванов, row = 2).
 * Employees/assistant — строка родителя + 1.
 */
function computeRows(tree) {
  const levels = new Set();
  (function walk(node) {
    if (
      node.type === NODE_DEPARTMENT &&
      node !== tree &&
      node.effectiveLayoutLevel != null
    ) {
      levels.add(node.effectiveLayoutLevel);
    }
    (node.children || []).forEach(walk);
  })(tree);

  const sortedLevels = [...levels].sort((a, b) => a - b);
  const levelToRow = new Map();
  sortedLevels.forEach((level, index) => levelToRow.set(level, index + 1));

  function assign(node, parentRow) {
    if (node.type === NODE_DEPARTMENT) {
      if (node === tree) {
        node.row = 0;
      } else if (node.data && Number.isFinite(node.data.presentationRow)) {
        // CR-022 §3: явный визуальный уровень (organizational parent может
        // отличаться от визуального уровня). Parent-child hierarchy сохраняется.
        node.row = Math.max(node.data.presentationRow, parentRow + 1);
      } else {
        const mappedRow = levelToRow.get(node.effectiveLayoutLevel) ?? parentRow + 1;
        node.row = Math.max(mappedRow, parentRow + 1);
      }
    } else if (node.type === NODE_ASSISTANT) {
      // Sidecar (CR-013_assistant §8): assistant не создаёт organizational row —
      // row совпадает с row своего руководителя.
      node.row = parentRow;
    } else {
      node.row = parentRow + 1;
    }

    (node.children || []).forEach((child) => assign(child, node.row));
  }

  assign(tree, -1);
}

/**
 * Кладёт layout-метаданные в data карточки для диагностики
 * (CR-008_2_2 §6): layout_level / row не подменяют реальный sub_level.
 */
function attachLayoutMeta(node) {
  if (node.type === NODE_DEPARTMENT) {
    node.data.actualManagerSubLevel = node.actualManagerSubLevel;
    node.data.normalizedManagementLevel = node.normalizedManagementLevel;
    node.data.effectiveLayoutLevel = node.effectiveLayoutLevel;
    node.data.row = node.row;
  }

  (node.children || []).forEach(attachLayoutMeta);
}

function computeSizes(node, opts) {
  if (node.type === NODE_DEPARTMENT) {
    node.width = opts.departmentWidth;

    if (opts.rolesPresentation && Array.isArray(node.data.pdfRoles)) {
      // Ролевая presentation (CR-003-02 §9, CR-003-03-fix-height):
      // высота карточки рассчитывается по фактическому содержимому
      // (включая перенос названия) и согласована с renderer через pdfCardLayout.
      if (node.data.pdfCardLayout && Number.isFinite(node.data.pdfCardLayout.cardHeight)) {
        node.height = node.data.pdfCardLayout.cardHeight;
      } else {
        const rolesCount = node.data.pdfRoles.length;
        node.height =
          opts.rolesDepartmentHeaderHeight +
          (rolesCount
            ? opts.rolesDepartmentSeparatorHeight + rolesCount * opts.rolesDepartmentRowHeight
            : 0) +
          opts.rolesDepartmentPadding;
      }
    } else {
      // CR-023-01 §5.5: при включённой диагностике высота карточки подразделения
      // увеличивается на фактическую высоту диагностической строки, чтобы она
      // размещалась под содержимым без обрезания.
      node.height =
        opts.departmentHeight +
        (opts.showLevels ? measureLayoutDebugHeight(node.data, node.width, opts.cardMetrics || CARD_METRICS) : 0);
    }
  } else if (node.type === NODE_ASSISTANT) {
    // Sidecar-карточка ассистента (CR-013_assistant §6, §9): компактный размер.
    node.width = opts.assistantSidecarWidth ?? opts.assistantWidth;
    const baseHeight = opts.assistantSidecarHeight ?? opts.assistantHeight;
    // CR-020 §6: сгруппированная карточка ассистентов получает высоту,
    // достаточную для всех ФИО без наложения.
    const memberCount = Array.isArray(node.data?.members) ? node.data.members.length : 0;
    node.height =
      memberCount > 1
        ? baseHeight + (memberCount - 1) * (opts.assistantMemberHeight ?? 30)
        : baseHeight;
  } else if (node.type === NODE_EMPLOYEES) {
    node.width = opts.employeeWidth;
    const metrics = opts.cardMetrics || CARD_METRICS;

    node.persons.forEach((person) => {
      person.width = opts.employeeWidth;

      // CR-023-01 §5.5: диагностика включена — карточка получает дополнительную
      // высоту по фактическому содержимому диагностической строки.
      const debugHeight = opts.showLevels
        ? measureLayoutDebugHeight(person.data, opts.employeeWidth, metrics)
        : 0;

      if (person.type === "group") {
        // CR-023 §5, §7: высота групповой карточки — по фактическому
        // содержимому (заголовок должности + строки ФИО).
        person.height =
          measureGroupCardHeight(person.data, opts.employeeWidth, metrics) + debugHeight;
      } else if (opts.measureContent) {
        // CR-023 §6.2: высота одиночной карточки — по содержимому.
        person.height =
          measureEmployeeCardHeight(person.data, opts.employeeWidth, metrics) + debugHeight;
      } else {
        person.height = opts.employeeHeight + debugHeight;
      }
    });

    const n = node.persons.length;
    const personsHeight = node.persons.reduce((sum, person) => sum + person.height, 0);
    node.height =
      opts.employeesHeaderHeight +
      personsHeight +
      (n > 1 ? (n - 1) * opts.personGap : 0);
  }

  (node.children || []).forEach((child) => computeSizes(child, opts));
}

function computeSubtreeWidths(node, colGap) {
  // CR-019 §26: для обычного manager (assistantPlacement="below") assistant
  // находится в вертикальном стеке под карточкой — ширина ветви определяется
  // самой широкой карточкой (manager или assistant), без бокового резерва.
  let ownWidth = node.width;
  if (node.assistantPlacement !== "side") {
    const assistants = (node.children || []).filter((child) => child.type === NODE_ASSISTANT);
    const maxAssistantWidth = assistants.length
      ? Math.max(...assistants.map((ast) => ast.width))
      : 0;
    ownWidth = Math.max(node.width, maxAssistantWidth);
  }

  // Sidecar-ассистенты (CR-013_assistant §7, §10) не участвуют в организационной
  // ширине ветки и НЕ увеличивают subtreeWidth (CR-018 §4.1): их асимметричный
  // visual footprint обрабатывается отдельным packing-проходом
  // compactSiblingBranches() по фактическим visual bounds (CR-018 §7).
  if (node.type !== NODE_DEPARTMENT || !node.children.length) {
    node.subtreeWidth = ownWidth;
    return node.subtreeWidth;
  }

  const children = node.children.filter((child) => child.type !== NODE_ASSISTANT);
  if (!children.length) {
    node.subtreeWidth = ownWidth;
    return node.subtreeWidth;
  }

  const childrenWidth =
    children.reduce((sum, child) => sum + computeSubtreeWidths(child, colGap), 0) +
    (children.length - 1) * colGap;

  node.subtreeWidth = Math.max(ownWidth, childrenWidth);
  return node.subtreeWidth;
}

/**
 * CR-018 §9: фактические визуальные границы ветви по реально отображаемым
 * узлам layout tree (department cards, assistant sidecars, employee columns,
 * дочерние department-узлы). Collapsed children в layout tree отсутствуют,
 * поэтому скрытые ветви не резервируют место (CR-018 §16).
 */
function computeVisualBounds(branch) {
  let minX = branch.x;
  let maxX = branch.x + branch.width;

  (function walk(node) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    (node.children || []).forEach(walk);
  })(branch);

  return { minX, maxX, width: maxX - minX };
}

/**
 * CR-018 §8: сдвигает всю branch (department card, assistant sidecar,
 * employee column, дочерние department-узлы) на dx вправо, сохраняя
 * внутреннюю геометрию ветви.
 */
function shiftBranch(node, dx) {
  if (!dx) return;
  node.x += dx;
  (node.children || []).forEach((child) => shiftBranch(child, dx));
}

/**
 * CR-018 §7, §13, §25: компактный collision-aware horizontal packing.
 *
 * Для каждой sibling-группы (children одного parent, кроме assistant) слева
 * направо проверяются фактические visual bounds соседних ветвей. Если правая
 * ветвь пересекает visual footprint левой (с учётом colGap), она сдвигается
 * ровно на величину пересечения. No collision → no additional shift.
 * Сложность O(n) на sibling-группу.
 */
function compactSiblingBranches(tree, opts) {
  (function process(node) {
    const branches = (node.children || []).filter((child) => child.type !== NODE_ASSISTANT);

    let prev = null;
    branches.forEach((branch) => {
      if (prev) {
        const leftBounds = computeVisualBounds(prev);
        const rightBounds = computeVisualBounds(branch);
        const overlap = leftBounds.maxX + opts.colGap - rightBounds.minX;
        if (overlap > 0) shiftBranch(branch, overlap);
      }
      prev = branch;
    });

    (node.children || []).forEach((child) => process(child));
  })(tree);
}

function assignX(node, left, colGap) {
  const center = left + node.subtreeWidth / 2;
  node.x = center - node.width / 2;

  if (node.children && node.children.length) {
    // Sidecar-ассистенты позиционируются отдельно от потока children (CR-013_assistant §7).
    const visibleChildren = node.children.filter((child) => child.type !== NODE_ASSISTANT);
    if (!visibleChildren.length) return;

    const childrenWidth =
      visibleChildren.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      (visibleChildren.length - 1) * colGap;

    let childLeft = center - childrenWidth / 2;
    visibleChildren.forEach((child) => {
      assignX(child, childLeft, colGap);
      childLeft += child.subtreeWidth + colGap;
    });
  }
}

function buildRowIndexMap(tree) {
  const rows = new Set();
  (function walk(node) {
    if (node.type === NODE_DEPARTMENT) {
      rows.add(node.row);
    }
    (node.children || []).forEach(walk);
  })(tree);
  const sorted = [...rows].sort((a, b) => a - b);
  const map = new Map();
  sorted.forEach((value, index) => map.set(value, index));
  return map;
}

/**
 * CR-015 §15, §21: высота row учитывает фактический bounding box карточек row.
 * Sidecar-ассистенты находятся на одной визуальной строке с manager (справа,
 * с небольшим vertical offset), поэтому НЕ резервируют отдельную вертикальную
 * зону под manager — учитывается только их реальная вертикальная протяжённость
 * в пределах row. Для manager без ассистентов row height не меняется.
 */
function collectRowHeights(node, rowHeights, rowIndexMap, opts) {
  if (node.type === NODE_DEPARTMENT) {
    const index = rowIndexMap.get(node.row);
    let rowHeight = node.height;

    const assistants = (node.children || []).filter((child) => child.type === NODE_ASSISTANT);
    if (assistants.length) {
      const maxAssistantHeight = Math.max(...assistants.map((assistant) => assistant.height));
      if (node.assistantPlacement === "side") {
        // Sidecar (CR-019 §3-4): ассистент на уровне manager с вертикальным
        // offset — учитывается только его реальная протяжённость сверху.
        rowHeight = Math.max(rowHeight, opts.assistantVerticalOffset + maxAssistantHeight);
      } else {
        // Below (CR-019 §7, §9): ассистент лежит ПОД manager — следующий
        // organizational row начинается ниже визуального низа assistant.
        rowHeight = Math.max(
          rowHeight,
          node.height + opts.assistantVerticalGap + maxAssistantHeight,
        );
      }
    }

    rowHeights[index] = Math.max(rowHeights[index] || 0, rowHeight);
  }
  (node.children || []).forEach((child) => collectRowHeights(child, rowHeights, rowIndexMap, opts));
}

function computeRowTops(tree, opts) {
  const rowIndexMap = buildRowIndexMap(tree);
  const rowCount = rowIndexMap.size;
  const rowHeights = new Array(rowCount).fill(0);
  collectRowHeights(tree, rowHeights, rowIndexMap, opts);

  const rowTops = new Array(rowCount);
  rowTops[0] = opts.paddingY;
  for (let index = 1; index < rowCount; index += 1) {
    rowTops[index] = rowTops[index - 1] + (rowHeights[index - 1] || 0) + opts.rowGap;
  }

  return { rowTops, rowIndexMap, rowCount };
}

function assignY(node, rowTops, rowIndexMap, parent, opts) {
  if (node.type === NODE_DEPARTMENT) {
    node.y = rowTops[rowIndexMap.get(node.row)];
  } else if (node.type !== NODE_ASSISTANT) {
    // Sidecar-ассистенты позиционируются отдельно (placeAssistantSidecars).
    node.y = parent.y + parent.height + opts.contentGap;
  }
  (node.children || []).forEach((child) => assignY(child, rowTops, rowIndexMap, node, opts));
}

/**
 * CR-019 §3-7: позиционирует assistants по уровню руководителя.
 *
 * Top-management (assistantPlacement="side", CR-019 §3-4): assistant — компактный
 * sidecar СПРАВА от карточки manager, слегка ниже (небольшой vertical offset).
 * Позиция не зависит от ширины subtree / row / junction.
 *
 * Остальные руководители (assistantPlacement="below", CR-019 §5-7): assistant
 * располагается НЕПОСРЕДСТВЕННО ПОД карточкой manager, центрирован по X:
 *   assistant.x = manager.x + (manager.width - assistant.width) / 2
 *   assistant.y = manager.y + manager.height + assistantVerticalGap
 * Несколько assistants укладываются вертикальной группой с тем же gap.
 */
function placeAssistants(tree, opts) {
  (function walk(node) {
    const assistants = (node.children || []).filter((child) => child.type === NODE_ASSISTANT);

    if (assistants.length) {
      if (node.assistantPlacement === "side") {
        let cursorX = node.x + node.width + opts.assistantHorizontalGap;
        assistants.forEach((assistant) => {
          assistant.y = node.y + opts.assistantVerticalOffset;
          assistant.x = cursorX;
          cursorX += assistant.width + opts.assistantHorizontalGap;
        });
      } else {
        let cursorY = node.y + node.height + opts.assistantVerticalGap;
        assistants.forEach((assistant) => {
          assistant.x = node.x + (node.width - assistant.width) / 2;
          assistant.y = cursorY;
          cursorY += assistant.height + opts.assistantVerticalGap;
        });
      }
    }

    (node.children || []).forEach(walk);
  })(tree);
}

/**
 * CR-015 §22-26: toggle collapse/expand — часть layout-геометрии, а не
 * внутреннего content карточки.
 *
 * Для каждого visual row считается фактический нижний край карточек
 * (rowVisualBottom = max по department/assistant card), затем для всех
 * collapseable department-узлов row устанавливается общий baseline:
 *
 *   toggleY = rowVisualBottom + opts.toggleGap;
 *
 * X toggle привязан к main organizational stem карточки
 * (node.x + node.width / 2) — см. renderer. Наличие assistant не меняет toggleX.
 */
function attachTogglePositions(tree, opts) {
  const byRow = new Map();

  function collect(node) {
    if (node.row != null) {
      if (!byRow.has(node.row)) byRow.set(node.row, []);
      byRow.get(node.row).push(node);
    }
    (node.children || []).forEach(collect);
  }
  collect(tree);

  const rowVisualBottom = new Map();
  byRow.forEach((rowNodes, row) => {
    // NODE_EMPLOYEES — content-колонка в connector-зоне, в визуальный row
    // карточек не входит и на baseline toggle не влияет.
    const cards = rowNodes.filter((node) => node.type !== NODE_EMPLOYEES);
    rowVisualBottom.set(row, Math.max(...cards.map((node) => node.y + node.height)));
  });

  function walk(node) {
    if (node.type === NODE_DEPARTMENT) {
      const orgChildren = (node.children || []).filter((child) => child.type !== NODE_ASSISTANT);
      if (node.collapsed || orgChildren.length) {
        node.toggleY = rowVisualBottom.get(node.row) + opts.toggleGap;
      }
    }
    (node.children || []).forEach(walk);
  }
  walk(tree);
}

function collect(tree, nodes, edges, flatData, parent) {
  if (parent) edges.push({ parent, child: tree });

  if (tree.type === NODE_EMPLOYEES) {
    nodes.push(tree);
    tree.persons.forEach((person) => {
      flatData.push(person.data);
      // CR-023 §5: участники групповой карточки остаются доступными для
      // детального просмотра и контекстного меню по собственному id записи.
      (person.members || []).forEach((member) => flatData.push(member));
    });
    return;
  }

  if (tree.type === NODE_ASSISTANT && Array.isArray(tree.data?.members)) {
    nodes.push(tree);
    flatData.push(tree.data);
    // CR-020 §6: каждый участник группы остаётся доступен для детального
    // просмотра по data-employee-id (поиск/клик), но отдельной карточкой не
    // рендерится.
    tree.data.members.forEach((member) => flatData.push(member));
    return;
  }

  nodes.push(tree);
  flatData.push(tree.data);
  (tree.children || []).forEach((child) => collect(child, nodes, edges, flatData, tree));
}

/**
 * Главная функция layout.
 *
 * @param {object} rootNode - выбранное подразделение (узел дерева с users/children)
 * @param {object} options
 * @returns {{ tree, nodes, edges, flatData, width, height }}
 */
export function computeUnifiedLayout(rootNode, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const tree = buildLayoutTree(rootNode, {
    showVacancies: opts.showVacancies,
    collapsedIds: opts.collapsedIds,
    groupByPosition: opts.groupByPosition,
  });

  assignActualLevels(tree);
  applySiblingFallback(tree, true);
  computeRows(tree);

  computeSizes(tree, opts);
  computeSubtreeWidths(tree, opts.colGap);
  assignX(tree, opts.paddingX, opts.colGap);

  const { rowTops, rowIndexMap } = computeRowTops(tree, opts);
  assignY(tree, rowTops, rowIndexMap, null, opts);

  // Sidecar-ассистенты — позиция от карточки руководителя (CR-015 §3-6,
  // CR-019 §3-7: side для top-management, below для остальных).
  placeAssistants(tree, opts);

  // CR-018 §7: компактный collision-aware horizontal packing по фактическим
  // visual bounds (организационная геометрия не меняется).
  compactSiblingBranches(tree, opts);

  // Toggle collapse/expand — часть layout-геометрии (CR-015 §22-26).
  attachTogglePositions(tree, opts);

  attachLayoutMeta(tree);

  const nodes = [];
  const edges = [];
  const flatData = [];
  collect(tree, nodes, edges, flatData, null);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  });

  // CR-018 §20-21: финальные границы схемы считаются по фактическим координатам
  // после packing. Если packing вывел ветви левее paddingX — выровнять всё вправо.
  if (minX < opts.paddingX) {
    const dx = opts.paddingX - minX;
    nodes.forEach((node) => {
      node.x += dx;
    });
    minX += dx;
    maxX += dx;
  }

  const width = maxX - minX + opts.paddingX * 2;
  const height = maxY - minY + opts.paddingY * 2;

  return { tree, nodes, edges, flatData, width, height };
}


