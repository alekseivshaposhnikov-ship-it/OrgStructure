/**
 * compact-a4-screen-renderer.js
 *
 * Рендерит компактную orgchart на экране, используя ЕДИНЫЙ layout
 * (computeUnifiedLayout). compact-a4 — только вариант размеров/оформления
 * карточек, не отдельный алгоритм организационной схемы.
 *
 * Управление экраном (zoom/pan/fit/center) — через общий screen-viewport,
 * как и у обычного screen renderer (CR-008_1).
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
import { createChartViewport } from "../screen-viewport.js";

const MODE_TITLES = {
  "as-is": "Текущая структура",
  "to-be": "Целевая структура",
  changes: "Изменения",
};

export function renderCompactA4Screen(rootNodes, containerSelector = "#orgChart", options = {}) {
  const {
    hideNames = false,
    showVacancies = true,
    viewMode = "to-be",
  } = options;

  const container = document.querySelector(containerSelector);
  if (!container) return null;

  if (!rootNodes || !rootNodes.length) {
    container.innerHTML = '<div class="empty-chart">Нет данных для отображения</div>';
    return null;
  }

  const rootNode = rootNodes[0];

  // Область A4 под фиксированным экранным заголовком — видимая область viewport.
  const availW = A4_WIDTH - 2 * PADDING_X;
  const availH = A4_HEIGHT - HEADER_HEIGHT - 2 * PADDING_Y;

  const state = {
    container,
    rootNode,
    collapsedIds: new Set(),
    layout: null,
    flat: null,
    scale: 1,
    canFit: true,
    svg: null,
    viewport: null,
  };

  function buildLayout() {
    state.layout = computeUnifiedLayout(state.rootNode, {
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
      collapsedIds: state.collapsedIds,
    });

    const { width, height } = state.layout;
    state.scale = Math.min(
      availW / Math.max(width, 1),
      availH / Math.max(height, 1),
      1,
    );
    state.canFit = state.scale >= MIN_SCALE;
    state.flat = unifiedLayoutToCompactFlat(state.layout, { hideNames, showVacancies });
  }

  function render() {
    container.innerHTML = "";
    buildLayout();

    const title = state.rootNode.department_name || state.rootNode.name || "Организационная структура";
    const subtitle = `${MODE_TITLES[viewMode] || "Организационная структура"}${showVacancies ? "" : " · без вакансий"}`;

    const svg = renderCompactSvg(
      {
        flat: state.flat,
        scale: state.scale,
        a4Width: A4_WIDTH,
        a4Height: A4_HEIGHT,
        canFit: state.canFit,
      },
      { title, subtitle, screen: true },
    );

    state.svg = svg;
    container.appendChild(svg);

    const zoomLayer = svg.querySelector(".compact-a4__viewport-layer");
    if (zoomLayer) {
      state.viewport = createChartViewport({
        svg,
        zoomLayer,
        minScale: 0.1,
        maxScale: 3,
      });
      fit();
    } else {
      state.viewport = null;
    }
  }

  function fit() {
    if (!state.layout || !state.viewport) return;

    const { width, height } = state.layout;
    const diagramW = width * state.scale;
    const diagramH = height * state.scale;

    // Screen fit — отдельный уровень от внутреннего A4 scale (CR-008_1 #9).
    // Диаграмма вписывается в область под фиксированным заголовком.
    state.viewport.fit({
      bounds: { x: PADDING_X, y: PADDING_Y + HEADER_HEIGHT, width: diagramW, height: diagramH },
      viewport: { width: availW, height: availH },
    });
  }

  function setCentered(id) {
    const node = state.flat ? state.flat.find((n) => n.id === id) : null;
    if (!node) return { render() {} };

    const cx = PADDING_X + (node.x + node.cardWidth / 2) * state.scale;
    const cy = PADDING_Y + HEADER_HEIGHT + (node.y + node.cardHeight / 2) * state.scale;

    state.viewport.setCentered({
      x: cx,
      y: cy,
      viewport: { width: availW, height: availH },
    });

    return { render() {} };
  }

  function toggleCollapse(id) {
    if (state.collapsedIds.has(id)) {
      state.collapsedIds.delete(id);
    } else {
      state.collapsedIds.add(id);
    }
    render();
  }

  render();

  return {
    get flatData() {
      return state.flat || [];
    },
    fit,
    setCentered,
    render,
    toggleCollapse,
  };
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

