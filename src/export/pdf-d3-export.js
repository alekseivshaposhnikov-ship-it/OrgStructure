/**
 * pdf-d3-export.js
 *
 * PDF-экспорт организационной структуры (CR-003).
 *
 * Единственный источник организационной геометрии — computeUnifiedLayout():
 * nodes / edges / x / y / width / height / row. PDF renderer НЕ строит
 * собственный layout и не пересчитывает hierarchy — он получает готовый
 * layout и только отрисовывает его на странице с единым масштабом.
 *
 * Пайплайн:
 *   prepare selected tree
 *     → computeUnifiedLayout(root, layoutOptions)
 *     → renderUnifiedLayoutToPdf(layout, pdfOptions)
 *     → renderSvgToPdf(...)
 */

import {
  computeUnifiedLayout,
  NODE_DEPARTMENT,
  NODE_EMPLOYEES,
  NODE_ASSISTANT,
  isAdministrativeAssistant,
} from "../rendering/unified-layout.js";
import { buildCompactA4LayoutResult } from "../rendering/compact-a4/compact-a4-layout.js";
import { renderCompactSvg } from "../rendering/compact-a4/compact-a4-svg-renderer.js";
import { normalizeProjects, formatDate, sanitizeFileName } from "../core/utils/string.js";
import { positionWeight } from "../core/utils/position.js";
import { renderSvgToPdf, withExportBusyState } from "./pdf-utils.js";
import { COLORS, getScenarioLabel, getScenarioColors } from "../rendering/tokens.js";
import { createSvgElement, appendText, truncateText } from "../rendering/svg-utils.js";

// Временно выводит row/effectiveLayoutLevel в PDF-карточки для отладки (CR-003 §27).
const SHOW_PDF_LAYOUT_DEBUG = false;

const HEADER_HEIGHT = 124;
const HEADER_PADDING = 40;
const PAGE_PADDING = 0; // layout уже содержит внутренние paddingX/paddingY

// Ролевой режим «PDF без фамилий» (CR-003-02): роли встроены в department-card.
// Размеры верхней области карточки и компактной строки должности.
const ROLE_DEPT_HEADER_HEIGHT = 66;
const ROLE_DEPT_SEPARATOR_HEIGHT = 14;
const ROLE_DEPT_ROW_HEIGHT = 18;
const ROLE_DEPT_PADDING = 10;

// Опции Unified Layout для ролевого режима (CR-003-02 §9, §19).
export const PDF_ROLES_LAYOUT_OPTIONS = {
  rolesPresentation: true,
  rolesDepartmentHeaderHeight: ROLE_DEPT_HEADER_HEIGHT,
  rolesDepartmentSeparatorHeight: ROLE_DEPT_SEPARATOR_HEIGHT,
  rolesDepartmentRowHeight: ROLE_DEPT_ROW_HEIGHT,
  rolesDepartmentPadding: ROLE_DEPT_PADDING,
};

// Конфигурация Unified Layout для PDF соответствует экранному unified-screen-renderer,
// чтобы геометрия совпадала (CR-003 §17). Переопределяется размером карточек из UI.
export const PDF_LAYOUT_OPTIONS = {
  departmentWidth: 350,
  departmentHeight: 130,
  employeeWidth: 350,
  employeeHeight: 96,
  assistantWidth: 350,
  assistantHeight: 96,
  employeesHeaderHeight: 26,
  colGap: 40,
  rowGap: 60,
  personGap: 8,
  contentGap: 30,
  paddingX: 40,
  paddingY: 40,
};

export async function exportOrgChartToPdf({
  rootNodes = [],
  title = "Организационная структура",
  subtitle = "",
  hideNames = false,
  showVacancies = true,
  viewMode = "to-be",
  departmentWidth,
  departmentHeight,
  employeeWidth,
  employeeHeight,
  assistantWidth,
  assistantHeight,
} = {}) {
  if (!rootNodes.length) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  await withExportBusyState({
    busyLabel: "Экспорт...",
    task: async () => {
      const root = buildPdfRoot(rootNodes);

      // «PDF без фамилий» → ролевой режим: сотрудники агрегируются по должностям (CR-003-02).
      const employeeMode = hideNames ? "roles" : "detailed";
      const layoutRoot = employeeMode === "roles" ? prepareRolesTree(root, showVacancies) : root;

      // Фактическое состояние UI «Показывать вакансии» передаётся в Unified Layout
      // (CR-003-01): вакансии фильтруются на этапе computeUnifiedLayout, а не после.
      const layout = buildPdfLayout(layoutRoot, {
        showVacancies,
        ...(departmentWidth != null ? { departmentWidth } : {}),
        ...(departmentHeight != null ? { departmentHeight } : {}),
        ...(employeeWidth != null ? { employeeWidth } : {}),
        ...(employeeHeight != null ? { employeeHeight } : {}),
        ...(assistantWidth != null ? { assistantWidth } : {}),
        ...(assistantHeight != null ? { assistantHeight } : {}),
        // Ролевой режим (CR-003-02 §9, §19): высота department-card зависит
        // от числа уникальных должностей, а не числа сотрудников.
        ...(employeeMode === "roles" ? PDF_ROLES_LAYOUT_OPTIONS : {}),
      });

      const svg = renderUnifiedLayoutToPdf(layout, {
        title,
        subtitle,
        viewMode,
        hideNames,
        showVacancies,
        employeeMode,
      });

      await renderSvgToPdf({ svg, fileName: sanitizeFileName(title) });
    },
  });
}

/**
 * Агрегирует сотрудников подразделения по должностям (CR-003-02 §5).
 *
 * Руководитель и административный ассистент исключаются: они отображаются
 * отдельно (header department-card / assistant-узел), а не в списке ролей.
 *
 * @param {Array} users - сотрудники/вакансии подразделения
 * @param {object} [opts]
 * @param {string} [opts.headName] - ФИО руководителя подразделения
 * @param {boolean} [opts.showVacancies=true]
 * @returns {Array<{position:string, count:number, vacancies:number, weight:number}>}
 */
export function aggregateUsersToRoles(users, { headName = "", showVacancies = true } = {}) {
  const roles = new Map();

  (users || []).forEach((user) => {
    if (isHeadUser(user, headName)) return;
    if (isAdministrativeAssistant(user)) return;
    // Вакансии скрыты — не создаём для них роли (CR-003-02 §12).
    if (user.isVacancy && !showVacancies) return;

    const key = String(user.position || "")
      .trim()
      .toLowerCase();
    const display = String(user.position || "").trim() || "Без должности";

    if (!roles.has(key)) {
      roles.set(key, {
        position: display,
        count: 0,
        vacancies: 0,
        weight: positionWeight(user),
      });
    }
    const role = roles.get(key);
    role.weight = Math.min(role.weight, positionWeight(user));

    if (user.isVacancy) {
      role.vacancies += 1;
    } else {
      role.count += 1;
    }
  });

  return [...roles.values()].sort(
    (a, b) => a.weight - b.weight || a.position.localeCompare(b.position, "ru"),
  );
}

function isHeadUser(user, headName) {
  if (!headName) return false;
  return (
    String(user.full_name || user.name || "")
      .trim()
      .toLowerCase() === String(headName).trim().toLowerCase()
  );
}

/**
 * Готовит presentation-модель дерева для ролевого режима (CR-003-02 §19):
 * users подразделения агрегируются в pdfRoles, отдельный NODE_EMPLOYEES
 * не создаётся (users пуст). Организационная иерархия не меняется.
 */
export function prepareRolesTree(node, showVacancies) {
  const roles = aggregateUsersToRoles(node.users || [], {
    headName: node.department_manager || "",
    showVacancies,
  });

  return {
    ...node,
    users: [],
    pdfRoles: roles.map(({ position, count, vacancies }) => ({ position, count, vacancies })),
    children: (node.children || []).map((child) => prepareRolesTree(child, showVacancies)),
  };
}

/**
 * Строит Unified Layout для PDF с фиксированной конфигурацией размеров карточек
 * (CR-003). Отдельная функция позволяет проверить в тестах, что в
 * computeUnifiedLayout() передаётся фактическое значение showVacancies (CR-003-01),
 * а не hardcoded true.
 *
 * @param {object} root - корневой узел дерева
 * @param {object} [layoutOptions] - опции computeUnifiedLayout (перекрывают PDF_LAYOUT_OPTIONS)
 * @returns {object} результат computeUnifiedLayout()
 */
export function buildPdfLayout(root, layoutOptions = {}) {
  return computeUnifiedLayout(root, { ...PDF_LAYOUT_OPTIONS, ...layoutOptions });
}

/**
 * Возвращает корневой узел для PDF: единственный узел дерева
 * или синтетический корень для нескольких корней.
 */
function buildPdfRoot(rootNodes) {
  if (rootNodes.length === 1) return rootNodes[0];

  return {
    department_guid: "pdf-export-root",
    department_name: "Организационная структура",
    department_manager: "",
    department_manager_position: "",
    staffCount: rootNodes.reduce((sum, node) => sum + (node.staffCount || 0), 0),
    vacancyCount: rootNodes.reduce((sum, node) => sum + (node.vacancyCount || 0), 0),
    totalWithVacancies: rootNodes.reduce(
      (sum, node) => sum + (node.totalWithVacancies ?? node.staffCount ?? 0),
      0,
    ),
    users: [],
    children: rootNodes,
  };
}

/**
 * Рассчитывает параметры размещения готового layout на странице PDF (CR-003 §19-21):
 * единый scale для X и Y (aspect ratio сохраняется), центрирование через offset.
 *
 * @param {{width:number, height:number}} layout - результат computeUnifiedLayout()
 * @param {object} [opts]
 * @param {number} [opts.pageWidth] - ширина страницы (по умолчанию = layout.width)
 * @param {number} [opts.pageHeight] - высота страницы (по умолчанию = header + layout.height)
 */
export function computePdfLayoutMetrics(layout, { pageWidth, pageHeight } = {}) {
  const layoutW = Math.max(layout.width, 1);
  const layoutH = Math.max(layout.height, 1);

  const targetW = pageWidth || layoutW + PAGE_PADDING * 2;
  const targetH = pageHeight || HEADER_HEIGHT + layoutH + PAGE_PADDING;

  const availableW = Math.max(targetW - PAGE_PADDING * 2, 1);
  const availableH = Math.max(targetH - HEADER_HEIGHT - PAGE_PADDING, 1);

  const scale = Math.min(availableW / layoutW, availableH / layoutH);

  const offsetX = PAGE_PADDING + (availableW - layoutW * scale) / 2;
  const offsetY = HEADER_HEIGHT + PAGE_PADDING + (availableH - layoutH * scale) / 2;

  return { pageWidth: targetW, pageHeight: targetH, scale, offsetX, offsetY };
}

/**
 * Рисует SVG-страницу PDF на основе готового Unified Layout.
 *
 * PDF renderer отвечает ТОЛЬКО за: страницу, header, единый scale/offset,
 * SVG-карточки, линии, текст. Организационная геометрия берётся из layout
 * без изменений (CR-003 §36).
 *
 * @param {{nodes: Array, edges: Array, width:number, height:number}} layout
 * @param {object} [opts]
 * @returns {SVGElement}
 */
export function renderUnifiedLayoutToPdf(
  layout,
  {
    title = "Организационная структура",
    subtitle = "",
    hideNames = false,
    showVacancies = true,
    employeeMode = hideNames ? "roles" : "detailed",
  } = {},
) {
  const metrics = computePdfLayoutMetrics(layout);

  const svg = createSvgElement("svg", {
    width: metrics.pageWidth,
    height: metrics.pageHeight,
    viewBox: `0 0 ${metrics.pageWidth} ${metrics.pageHeight}`,
    xmlns: "http://www.w3.org/2000/svg",
  });

  svg.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: metrics.pageWidth,
      height: metrics.pageHeight,
      fill: "#ffffff",
    }),
  );

  drawHeader(svg, { width: metrics.pageWidth, title, subtitle });

  // Вся диаграмма масштабируется и центрируется одним transform.
  const diagram = createSvgElement("g", {
    class: "pdf-orgchart",
    transform: `translate(${metrics.offsetX}, ${metrics.offsetY}) scale(${metrics.scale})`,
  });

  drawConnectorsFromEdges(diagram, layout.edges);

  layout.nodes.forEach((node) => {
    drawPdfNode(diagram, node, { hideNames, showVacancies, employeeMode });
  });

  if (SHOW_PDF_LAYOUT_DEBUG) {
    drawLayoutDebug(diagram, layout.nodes);
  }

  svg.appendChild(diagram);
  return svg;
}

// === Header ===

function drawHeader(svg, { width, title, subtitle }) {
  appendText(svg, "Организационная структура", {
    x: HEADER_PADDING,
    y: 38,
    size: 15,
    weight: 700,
    fill: COLORS.blue,
  });

  appendText(svg, title, {
    x: HEADER_PADDING,
    y: 66,
    size: 26,
    weight: 700,
    fill: COLORS.text,
  });

  if (subtitle) {
    appendText(svg, subtitle, {
      x: HEADER_PADDING,
      y: 92,
      size: 15,
      fill: COLORS.muted,
    });
  }

  appendText(svg, formatDate(new Date()), {
    x: width - HEADER_PADDING,
    y: 66,
    size: 15,
    fill: COLORS.muted,
    anchor: "end",
  });

  svg.appendChild(
    createSvgElement("line", {
      x1: HEADER_PADDING,
      y1: 112,
      x2: width - HEADER_PADDING,
      y2: 112,
      stroke: "#e4e7ec",
      "stroke-width": 1,
    }),
  );
}

// === Connectors (только на основе layout.edges, CR-003 §25) ===

function drawConnectorsFromEdges(diagram, edges) {
  const byParent = new Map();

  edges.forEach(({ parent, child }) => {
    if (parent.type === NODE_EMPLOYEES) return;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(child);
  });

  byParent.forEach((children, parent) => {
    drawChildrenGroupConnector(diagram, parent, children);
  });
}

function drawChildrenGroupConnector(diagram, parent, children) {
  const parentX = parent.x + parent.width / 2;
  const parentY = parent.y + parent.height;

  if (children.length === 1) {
    const child = children[0];
    drawOrthogonalLine(diagram, parentX, parentY, child.x + child.width / 2, child.y);
    return;
  }

  const sorted = [...children].sort((a, b) => a.y - b.y);
  const first = sorted[0];
  const trunkY = parentY + (first.y - parentY) / 2;

  drawStraightLine(diagram, parentX, parentY, parentX, trunkY);

  let minX = Infinity;
  let maxX = -Infinity;
  children.forEach((child) => {
    const childX = child.x + child.width / 2;
    if (childX < minX) minX = childX;
    if (childX > maxX) maxX = childX;
  });

  drawStraightLine(diagram, minX, trunkY, maxX, trunkY);

  children.forEach((child) => {
    drawStraightLine(
      diagram,
      child.x + child.width / 2,
      trunkY,
      child.x + child.width / 2,
      child.y,
    );
  });
}

function drawOrthogonalLine(svg, x1, y1, x2, y2) {
  const midY = y1 + (y2 - y1) / 2;
  svg.appendChild(
    createSvgElement("path", {
      d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
      fill: "none",
      stroke: COLORS.line,
      "stroke-width": 2,
    }),
  );
}

function drawStraightLine(svg, x1, y1, x2, y2) {
  svg.appendChild(
    createSvgElement("line", {
      x1,
      y1,
      x2,
      y2,
      stroke: COLORS.line,
      "stroke-width": 2,
    }),
  );
}

// === Nodes ===

function drawPdfNode(diagram, node, opts) {
  if (node.type === NODE_EMPLOYEES) {
    drawPdfEmployeesColumn(diagram, node, opts);
    return;
  }

  const group = createSvgElement("g", {
    transform: `translate(${node.x}, ${node.y})`,
    "data-node-id": node.data ? node.data.id : "",
  });

  if (node.type === NODE_ASSISTANT) {
    drawPdfAssistantCard(group, node, opts);
  } else {
    drawPdfDepartmentCard(group, node, opts);
  }

  diagram.appendChild(group);
}

function drawPdfDepartmentCard(group, node, opts) {
  // Ролевой режим (CR-003-02): роли встроены в department-card, отдельный
  // NODE_EMPLOYEES отсутствует в геометрии.
  if (opts.employeeMode === "roles") {
    drawRoleDepartmentCard(group, node, opts);
    return;
  }

  const { data } = node;
  const isRoot = node.row === 0;

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
      rx: 14,
      ry: 14,
      fill: isRoot ? "#f8fbff" : "#ffffff",
      stroke: COLORS.blue,
      "stroke-width": 2,
    }),
  );

  if (data.scenarioState) {
    drawScenarioBadge(group, data.scenarioState);
  }

  appendWrappedText(group, data.name || "Без названия", {
    x: 18,
    y: data.scenarioState ? 46 : 30,
    maxWidth: node.width - 36,
    lineHeight: 16,
    maxLines: 2,
    size: 14,
    weight: 700,
    fill: COLORS.text,
  });

  if (!opts.hideNames && data.headName) {
    appendWrappedText(group, data.headName, {
      x: 18,
      y: 76,
      maxWidth: node.width - 80,
      lineHeight: 15,
      maxLines: 1,
      size: 12,
      fill: "#344054",
    });
  }

  if (data.headPosition) {
    appendWrappedText(group, data.headPosition, {
      x: 18,
      y: !opts.hideNames && data.headName ? 98 : 76,
      maxWidth: node.width - 80,
      lineHeight: 15,
      maxLines: 1,
      size: 12,
      fill: COLORS.muted,
    });
  }

  const count = opts.showVacancies ? (data.totalWithVacancies ?? 0) : (data.staffCount ?? 0);
  drawCount(group, count, node.width, node.height);
}

/**
 * Ролевая department-card (CR-003-02 §7-8): одна карточка = подразделение +
 * должность руководителя + агрегированный ролевой состав собственных сотрудников.
 * Отдельный NODE_EMPLOYEES в геометрии отсутствует.
 */
function drawRoleDepartmentCard(group, node, opts) {
  const { data } = node;
  const isRoot = node.row === 0;
  const roles = data.pdfRoles || [];
  const hasScenario = Boolean(data.scenarioState);

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
      rx: 14,
      ry: 14,
      fill: isRoot ? "#f8fbff" : "#ffffff",
      stroke: COLORS.blue,
      "stroke-width": 2,
    }),
  );

  if (hasScenario) {
    drawScenarioBadge(group, data.scenarioState);
  }

  // Название подразделения.
  const titleX = hasScenario ? 76 : 18;
  appendWrappedText(group, data.name || "Без названия", {
    x: titleX,
    y: 26,
    maxWidth: node.width - (hasScenario ? 150 : 90),
    lineHeight: 16,
    maxLines: 2,
    size: 14,
    weight: 700,
    fill: COLORS.text,
  });

  // Общая численность подразделения (CR-003-02 §13).
  const count = opts.showVacancies ? (data.totalWithVacancies ?? 0) : (data.staffCount ?? 0);
  if (count > 0) {
    appendText(group, String(count), {
      x: node.width - 16,
      y: 26,
      size: 14,
      weight: 700,
      fill: COLORS.blue,
      anchor: "end",
    });
  }

  // Должность руководителя без ФИО (CR-003-02 §17).
  if (data.headPosition) {
    appendWrappedText(group, data.headPosition, {
      x: 18,
      y: 56,
      maxWidth: node.width - 90,
      lineHeight: 14,
      maxLines: 1,
      size: 12,
      fill: COLORS.muted,
    });
  }

  // Если собственных сотрудников кроме руководителя нет — карточка остаётся
  // минимальной высоты, без separator и пустого ролевого блока (CR-003-02 §9).
  if (!roles.length) return;

  // Разделитель между «шапкой» подразделения и ролевым составом.
  const separatorY = ROLE_DEPT_HEADER_HEIGHT - 4;
  group.appendChild(
    createSvgElement("line", {
      x1: 14,
      y1: separatorY,
      x2: node.width - 14,
      y2: separatorY,
      stroke: "#e4e7ec",
      "stroke-width": 1,
    }),
  );

  // Роли: должность + количество, вакансии отдельно (+N вак.).
  const firstRowY = separatorY + 8;
  roles.forEach((role, index) => {
    const rowY = firstRowY + index * ROLE_DEPT_ROW_HEIGHT;
    const roleGroup = createSvgElement("g", {
      transform: `translate(0, ${rowY})`,
      "data-role": role.position,
    });

    // Должность: максимум 2 строки, счётчик не перекрывается (CR-003-02 §21).
    appendWrappedText(roleGroup, role.position || "Без должности", {
      x: 18,
      y: 0,
      maxWidth: node.width - 140,
      lineHeight: 12,
      maxLines: 2,
      size: 10,
      weight: 500,
      fill: COLORS.text,
    });

    if (role.count > 0) {
      appendText(roleGroup, String(role.count), {
        x: node.width - 16,
        y: 0,
        size: 10,
        weight: 700,
        fill: COLORS.text,
        anchor: "end",
      });
    }

    if (role.vacancies > 0) {
      appendText(roleGroup, `+${role.vacancies} вак.`, {
        x: node.width - 68,
        y: 0,
        size: 9,
        weight: 400,
        fill: COLORS.muted,
        anchor: "end",
      });
    }

    group.appendChild(roleGroup);
  });
}

function drawPdfAssistantCard(group, node, opts) {
  const { data } = node;

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
      rx: 14,
      ry: 14,
      fill: "#f8fafc",
      stroke: COLORS.purple,
      "stroke-width": 2,
    }),
  );

  const name = opts.hideNames ? "" : data.name || data.full_name || "Сотрудник";
  appendWrappedText(group, `Административный ассистент — ${name}`, {
    x: 18,
    y: 30,
    maxWidth: node.width - 36,
    lineHeight: 16,
    maxLines: 2,
    size: 13,
    weight: 700,
    fill: COLORS.text,
  });

  if (data.position) {
    appendWrappedText(group, data.position, {
      x: 18,
      y: 66,
      maxWidth: node.width - 36,
      lineHeight: 14,
      maxLines: 1,
      size: 11,
      fill: COLORS.muted,
    });
  }

  const project = normalizeProjects(data.project);
  if (project) {
    drawProject(group, project, node.width, node.height);
  }
}

function drawPdfEmployeesColumn(diagram, node, opts) {
  const group = createSvgElement("g", {
    transform: `translate(${node.x}, ${node.y})`,
    class: "pdf-employees-column",
    "data-node-id": "employees",
  });

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
      rx: 8,
      ry: 8,
      fill: "#f8fafc",
      stroke: "#cbd5e1",
      "stroke-width": 1,
      "stroke-dasharray": "4 3",
    }),
  );

  appendText(group, "Сотрудники подразделения", {
    x: node.width / 2,
    y: 18,
    size: 11,
    weight: 700,
    fill: "#475467",
    anchor: "middle",
  });

  // NODE_EMPLOYEES существует только в detailed-режиме; в ролевом режиме
  // (CR-003-02) роли встроены в department-card, отдельный блок отсутствует.
  drawDetailedPersonCards(group, node, opts);

  diagram.appendChild(group);
}

function drawDetailedPersonCards(group, node, opts) {
  const gap = computePersonGap(node);
  let cursorY = PDF_LAYOUT_OPTIONS.employeesHeaderHeight;

  node.persons.forEach((person) => {
    const personGroup = createSvgElement("g", {
      transform: `translate(0, ${cursorY})`,
      "data-node-id": person.data.id,
    });

    drawPdfPersonCard(personGroup, person, opts.hideNames);
    group.appendChild(personGroup);
    cursorY += person.height + gap;
  });
}

function drawPdfPersonCard(group, person, hideNames) {
  const { data } = person;
  const isVacancy = data.isVacancy;
  const styles = isVacancy
    ? { fill: "#f5fbff", stroke: "#84caff", strokeWidth: 2 }
    : { fill: "#ffffff", stroke: COLORS.border, strokeWidth: 1.5 };

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: person.width,
      height: person.height,
      rx: 8,
      ry: 8,
      fill: styles.fill,
      stroke: styles.stroke,
      "stroke-width": styles.strokeWidth,
    }),
  );

  const title = isVacancy ? "Вакансия" : hideNames ? "" : data.name || "Сотрудник";

  appendWrappedText(group, title, {
    x: 10,
    y: 20,
    maxWidth: person.width - 20,
    lineHeight: 14,
    maxLines: 2,
    size: 12,
    weight: 700,
    fill: COLORS.text,
  });

  if (data.position) {
    appendWrappedText(group, data.position, {
      x: 10,
      y: 42,
      maxWidth: person.width - 20,
      lineHeight: 13,
      maxLines: 1,
      size: 10,
      fill: COLORS.muted,
    });
  }

  const project = normalizeProjects(data.project);
  if (project) {
    drawProject(group, project, person.width, person.height);
  }
}

/**
 * Вычисляет вертикальный зазор между карточками внутри employee-колонки
 * из готовой высоты колонки layout (не пересчитывая layout).
 */
function computePersonGap(node) {
  const n = node.persons.length;
  if (n <= 1) return 0;

  const headerHeight = PDF_LAYOUT_OPTIONS.employeesHeaderHeight;
  const totalCards = node.persons.reduce((sum, person) => sum + (person.height || 0), 0);
  const contentHeight = Math.max(node.height - headerHeight, totalCards);

  return Math.max(0, (contentHeight - totalCards) / (n - 1));
}

// === Оформление карточек ===

function drawScenarioBadge(group, state) {
  const label = getScenarioLabel(state);
  const colors = getScenarioColors(state);

  group.appendChild(
    createSvgElement("rect", {
      x: 14,
      y: 12,
      width: label.length * 7 + 18,
      height: 20,
      rx: 10,
      ry: 10,
      fill: colors.bg,
    }),
  );

  appendText(group, label, {
    x: 23,
    y: 27,
    size: 10,
    weight: 700,
    fill: colors.text,
  });
}

function drawProject(group, project, cardWidth, cardHeight) {
  group.appendChild(
    createSvgElement("rect", {
      x: 18,
      y: cardHeight - 30,
      width: Math.min(210, cardWidth - 36),
      height: 20,
      rx: 8,
      ry: 8,
      fill: "#f2f4f7",
    }),
  );

  appendWrappedText(group, `Проект: ${project}`, {
    x: 28,
    y: cardHeight - 16,
    maxWidth: Math.min(190, cardWidth - 56),
    lineHeight: 12,
    maxLines: 1,
    size: 10,
    fill: "#475467",
  });
}

function drawCount(group, count, cardWidth, cardHeight) {
  group.appendChild(
    createSvgElement("rect", {
      x: cardWidth - 62,
      y: cardHeight - 42,
      width: 44,
      height: 28,
      rx: 14,
      ry: 14,
      fill: COLORS.blueLight,
    }),
  );

  appendText(group, String(count), {
    x: cardWidth - 40,
    y: cardHeight - 23,
    size: 14,
    weight: 700,
    fill: COLORS.blue,
    anchor: "middle",
  });
}

// === Debug (CR-003 §27): выводит row/effectiveLayoutLevel, по умолчанию выключено ===

function drawLayoutDebug(diagram, nodes) {
  nodes.forEach((node) => {
    if (node.type !== NODE_DEPARTMENT) return;
    const group = createSvgElement("g", {
      transform: `translate(${node.x}, ${node.y})`,
      "data-debug-node-id": node.data ? node.data.id : "",
    });
    const label = `row:${node.row} layout:${node.effectiveLayoutLevel ?? "—"}`;
    appendText(group, label, {
      x: 6,
      y: node.height - 8,
      size: 9,
      fill: "#f04438",
    });
    diagram.appendChild(group);
  });
}

function appendWrappedText(
  group,
  text,
  { x, y, maxWidth, lineHeight, maxLines, size = 12, weight = 400, fill = COLORS.text },
) {
  const lines = wrapText(String(text || ""), maxWidth, size, maxLines);

  lines.forEach((line, index) => {
    appendText(group, line, {
      x,
      y: y + index * lineHeight,
      size,
      weight,
      fill,
    });
  });
}

function wrapText(text, maxWidth, fontSize, maxLines) {
  const avgCharWidth = fontSize * 0.56;
  const maxChars = Math.max(4, Math.floor(maxWidth / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);

  const lines = [];
  let current = "";

  words.forEach((word) => {
    const safeWord = word.length > maxChars ? truncateText(word, maxChars) : word;
    const next = current ? `${current} ${safeWord}` : safeWord;

    if (next.length <= maxChars) {
      current = next;
      return;
    }

    if (current) lines.push(current);
    current = safeWord;
  });

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = truncateText(visible[maxLines - 1], maxChars);
    return visible;
  }

  return lines;
}

// === Компактный A4 PDF ===
// Уже использует computeUnifiedLayout() через buildCompactA4LayoutResult (CR-003 §18).

/**
 * Компактный A4 PDF — отдельный независимый экспорт на том же Unified Layout.
 */
export async function exportCompactA4ToPdf({
  rootNodes = [],
  title = "Организационная структура",
  subtitle = "",
  hideNames = false,
  showVacancies = true,
  _viewMode = "to-be",
} = {}) {
  if (!rootNodes.length) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  await withExportBusyState({
    busyLabel: "Экспорт компактного A4...",
    task: async () => {
      const layoutResult = buildCompactA4LayoutResult(buildCompactA4Root(rootNodes), {
        hideNames,
        showVacancies,
      });

      if (!layoutResult || !layoutResult.canFit) {
        alert("Структуру невозможно уместить на один лист A4 без потери читаемости");
        return;
      }

      const svg = renderCompactSvg(layoutResult, { title, subtitle });
      await renderSvgToPdf({
        svg,
        fileName: sanitizeFileName(title),
        orientation: "landscape",
        fileNameSuffix: "_compact_A4.pdf",
      });
    },
  });
}

/**
 * Возвращает корневой узел для компактного A4: единственный узел дерева
 * или синтетический корень для нескольких.
 */
function buildCompactA4Root(rootNodes) {
  if (rootNodes.length === 1) return rootNodes[0];

  return {
    department_guid: "compact-export-root",
    department_name: "Организационная структура",
    department_manager: "",
    department_manager_position: "",
    staffCount: rootNodes.reduce((sum, node) => sum + (node.staffCount || 0), 0),
    vacancyCount: rootNodes.reduce((sum, node) => sum + (node.vacancyCount || 0), 0),
    totalWithVacancies: rootNodes.reduce(
      (sum, node) => sum + (node.totalWithVacancies ?? node.staffCount ?? 0),
      0,
    ),
    users: [],
    children: rootNodes,
  };
}
