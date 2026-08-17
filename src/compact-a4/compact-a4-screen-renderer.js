/**
 * compact-a4-screen-renderer.js
 *
 * Рендерит компактную orgchart на экране, используя ЕДИНЫЙ layout
 * (computeUnifiedLayout). compact-a4 — только вариант размеров/оформления
 * карточек, не отдельный алгоритм организационной схемы.
 */

import {
  computeUnifiedLayout,
  NODE_DEPARTMENT,
  NODE_EMPLOYEES,
  NODE_ASSISTANT,
} from "../unified-layout.js";
import {
  A4_WIDTH,
  A4_HEIGHT,
  PADDING_X,
  PADDING_Y,
  HEADER_HEIGHT,
  DEPT_W,
  DEPT_H,
  PERSON_W,
  PERSON_H,
  MIN_SCALE,
} from "./compact-a4-layout.js";
import { renderCompactSvg } from "./compact-a4-svg-renderer.js";

export function renderCompactA4Screen(rootNodes, containerSelector = "#orgChart", options = {}) {
  const {
    hideNames = false,
    showVacancies = true,
    viewMode = "to-be",
  } = options;

  const container = document.querySelector(containerSelector);
  if (!container) return;

  if (!rootNodes || !rootNodes.length) {
    container.innerHTML = '<div class="empty-chart">Нет данных для отображения</div>';
    return;
  }

  const rootNode = rootNodes[0];

  const layout = computeUnifiedLayout(rootNode, {
    showVacancies,
    departmentWidth: DEPT_W,
    departmentHeight: DEPT_H,
    employeeWidth: PERSON_W,
    employeeHeight: PERSON_H,
    assistantWidth: PERSON_W,
    assistantHeight: PERSON_H,
    employeesHeaderHeight: 18,
    colGap: 20,
    rowGap: 16,
    personGap: 4,
    paddingX: PADDING_X,
    paddingY: PADDING_Y + HEADER_HEIGHT,
  });

  const availW = A4_WIDTH - 2 * PADDING_X;
  const availH = A4_HEIGHT - HEADER_HEIGHT - 2 * PADDING_Y;
  const scale = Math.min(
    availW / Math.max(layout.width, 1),
    availH / Math.max(layout.height, 1),
    1,
  );
  const canFit = scale >= MIN_SCALE;

  const flat = unifiedLayoutToCompactFlat(layout, { hideNames, showVacancies });

  const modeTitles = {
    "as-is": "Текущая структура",
    "to-be": "Целевая структура",
    changes: "Изменения",
  };

  const title = rootNode.department_name || rootNode.name || "Организационная структура";
  const subtitle = `${modeTitles[viewMode] || "Организационная структура"}${showVacancies ? "" : " · без вакансий"}`;

  const svg = renderCompactSvg(
    { flat, scale, a4Width: A4_WIDTH, a4Height: A4_HEIGHT, canFit },
    { title, subtitle },
  );

  container.innerHTML = "";
  container.appendChild(svg);

  fitSvgToContainer(svg, container);
}

function fitSvgToContainer(svg, container) {
  const containerWidth = container.clientWidth || 800;
  const containerHeight = container.clientHeight || 600;

  const scaleX = containerWidth / A4_WIDTH;
  const scaleY = containerHeight / A4_HEIGHT;
  const scale = Math.min(scaleX, scaleY, 1.5);

  svg.setAttribute("width", A4_WIDTH * scale);
  svg.setAttribute("height", A4_HEIGHT * scale);
  svg.style.maxWidth = "100%";
}

function unifiedLayoutToCompactFlat(layout, { hideNames, showVacancies }) {
  const flat = [];
  const parentMap = new Map();
  layout.edges.forEach((edge) => parentMap.set(edge.child, edge.parent));

  layout.nodes.forEach((node) => {
    const parent = parentMap.get(node);
    const parentId = parent && parent.data ? parent.data.id : null;

    if (node.type === NODE_DEPARTMENT) {
      const d = node.data;
      flat.push({
        id: d.id,
        type: "department",
        name: d.name,
        manager: hideNames ? "" : d.headName,
        position: d.headPosition,
        count: showVacancies
          ? d.totalWithVacancies ?? d.staffCount ?? 0
          : d.staffCount ?? 0,
        project: "",
        scenarioState: d.scenarioState,
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
      });
    } else if (node.type === NODE_ASSISTANT) {
      const d = node.data;
      flat.push({
        id: d.id,
        type: "assistant",
        name: hideNames ? "" : d.full_name || d.name || "Сотрудник",
        position: d.position || "",
        project: normalizeProjects(d.project),
        scenarioState: d.scenarioState || "",
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
      });
    } else if (node.type === NODE_EMPLOYEES) {
      flat.push({
        id: `employees_${parentId || "root"}`,
        type: "employees",
        header: "Сотрудники",
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
        persons: (node.persons || []).map((person) => ({
          id: person.data.id,
          type: person.data.isVacancy ? "vacancy" : "employee",
          name: person.data.isVacancy
            ? "Вакансия"
            : hideNames
              ? ""
              : person.data.name,
          position: String(person.data.position || ""),
          project: normalizeProjects(person.data.project),
          scenarioState: person.data.scenarioState || "",
          cardWidth: person.width,
          cardHeight: person.height,
        })),
      });
    }
  });

  return flat;
}

function normalizeProjects(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("; ");
}

