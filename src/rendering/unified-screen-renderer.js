/**
 * unified-screen-renderer.js
 *
 * Рендерит единую организационную диаграмму на экране через SVG + foreignObject,
 * без d3-org-chart. Карточки переиспользуются из chart-cards.js.
 */

import * as d3 from "d3";
import {
  computeUnifiedLayout,
  NODE_EMPLOYEES,
  NODE_DEPARTMENT,
} from "./unified-layout.js";
import { renderNodeContent } from "./chart-cards.js";
import { createChartViewport } from "./screen-viewport.js";

function cardHtml(node, opts) {
  if (node.type === NODE_EMPLOYEES) {
    const persons = (node.persons || [])
      .map(
        (person) => `
        <div class="employees-column__item" style="height:${person.height}px">
          ${renderNodeContent(person.data, opts)}
        </div>`,
      )
      .join("");

    return `
      <div class="employees-column" style="width:100%;height:100%">
        <div class="employees-column__header">Сотрудники подразделения</div>
        <div class="employees-column__list">${persons}</div>
      </div>
    `;
  }

  return `<div class="unified-card" style="width:100%;height:100%">${renderNodeContent(node.data, opts)}</div>`;
}

function connectorPath(parent, child) {
  const fromX = parent.x + parent.width / 2;
  const fromY = parent.y + parent.height;
  const toX = child.x + child.width / 2;
  const toY = child.y;
  const midY = fromY + (toY - fromY) / 2;

  return `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`;
}

export function renderUnifiedScreen(rootNodes, containerSelector, options = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return null;

  if (!rootNodes || !rootNodes.length) {
    container.innerHTML = '<div class="empty-chart">Нет данных для отображения</div>';
    return null;
  }

  const {
    cardDesign = "classic",
    showVacancies = true,
    viewMode = "to-be",
    departmentWidth = 350,
    departmentHeight = 130,
    employeeHeight = 96,
    // CR-012: при выборе корня Холдинга дирекции верхнего уровня
    // сворачиваются по умолчанию. Применяется только к первичному рендеру.
    collapseTopLevel = false,
    // CR-013 §22: явный список дирекций для initial collapse (leadership-проекция
    // Холдинга: дирекции под executive-узлами). Имеет приоритет над collapseTopLevel.
    initialCollapsedIds = null,
  } = options;

  const cardOptions = { cardDesign, showVacancies, viewMode };

  const state = {
    container,
    rootNodes,
    collapsedIds: new Set(),
    layout: null,
    svg: null,
    zoomLayer: null,
    viewport: null,
    // CR-011: сохранённый viewport живёт выше lifecycle конкретного SVG,
    // чтобы collapse/expand не сбрасывал zoom/pan и визуальный фокус.
    viewportTransform: null,
    viewportAnchor: null,
  };

  /**
   * CR-012 §6, §7: при выборе корня Холдинга все его непосредственные
   * department children (дирекции) получают initial collapsed state —
   * через существующий механизм collapsedIds. Сам корень не сворачивается.
   * Выполняется один раз при создании renderer'а (повторный выбор Холдинга
   * создаёт новый инстанс → снова дефолтное состояние, §12).
   */
  function initCollapsedIds() {
    // CR-013 §22: явный список дирекций (leadership-проекция Холдинга) —
    // имеет приоритет над «свернуть всех прямых детей root».
    if (Array.isArray(initialCollapsedIds) && initialCollapsedIds.length) {
      initialCollapsedIds.forEach((id) => {
        if (id) state.collapsedIds.add(id);
      });
      return;
    }

    if (!collapseTopLevel || !rootNodes || !rootNodes.length) return;
    const root = rootNodes[0];
    (root.children || []).forEach((child) => {
      const id = child.department_guid || child.id;
      if (id) state.collapsedIds.add(id);
    });
  }

  initCollapsedIds();

  function buildLayout() {
    state.layout = computeUnifiedLayout(rootNodes[0], {
      showVacancies,
      departmentWidth,
      departmentHeight,
      employeeWidth: departmentWidth,
      employeeHeight,
      assistantWidth: departmentWidth,
      assistantHeight: employeeHeight,
      employeesHeaderHeight: 26,
      colGap: 40,
      rowGap: 60,
      personGap: 8,
      paddingX: 40,
      paddingY: 40,
      collapsedIds: state.collapsedIds,
    });
  }

  /**
   * CR-011 §4: сохраняет текущий D3 transform ДО уничтожения SVG.
   * Хранится в state, поэтому переживает пересоздание svg/zoom behavior.
   */
  function captureViewport() {
    if (!state.viewport) {
      state.viewportTransform = null;
      return;
    }
    state.viewportTransform = state.viewport.getTransform();
  }

  /**
   * CR-011 §6, §14: фиксирует экранную позицию центра карточки, по которой
   * пользователь выполнил collapse/expand. После rerender translate
   * корректируется так, чтобы эта карточка осталась на прежнем месте.
   */
  function captureAnchor(id) {
    state.viewportAnchor = null;
    if (!id || !state.viewportTransform || !state.layout) return;

    const node = state.layout.nodes.find((n) => n.data && n.data.id === id);
    if (!node) return;

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const screen = state.viewport.projectPoint({ x: cx, y: cy }, state.viewportTransform);
    state.viewportAnchor = { id, screenX: screen.x, screenY: screen.y };
  }

  /**
   * CR-011 §5, §10: восстанавливает сохранённый viewport после rerender
   * (без автоматического fit). Если был зафиксирован якорь, translate
   * корректируется так, чтобы карточка-якорь осталась в прежней
   * экранной позиции. Якорь одноразовый — действует только на текущий rerender.
   */
  function restoreViewport() {
    const saved = state.viewportTransform;
    if (!saved || !state.viewport) return;

    const anchor = state.viewportAnchor;
    let anchorOffset = null;
    if (anchor) {
      const node = state.layout.nodes.find((n) => n.data && n.data.id === anchor.id);
      if (node) {
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        anchorOffset = {
          screenX: anchor.screenX,
          screenY: anchor.screenY,
          targetX: cx,
          targetY: cy,
        };
      }
    }

    state.viewport.restoreTransform(saved, { anchor: anchorOffset });
    state.viewportAnchor = null;
  }

  function render() {
    // CR-011 §10: сохранить текущий viewport ДО уничтожения SVG.
    captureViewport();

    container.innerHTML = "";
    buildLayout();

    const { width, height, nodes, edges } = state.layout;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("class", "unified-orgchart")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);

    const zoomLayer = svg.append("g").attr("class", "unified-orgchart__layer");
    state.zoomLayer = zoomLayer;

    // Диапазон zoom задаётся в общем viewport-хелпере (CR-011),
    // здесь не дублируем scaleExtent.
    state.viewport = createChartViewport({ svg, zoomLayer });

    // CR-011 §3, §5: при структурном rerender (collapse/expand и т.п.)
    // восстанавливаем сохранённый viewport вместо автоматического fit.
    restoreViewport();

    zoomLayer
      .append("g")
      .attr("class", "unified-orgchart__edges")
      .selectAll("path")
      .data(edges)
      .enter()
      .append("path")
      .attr("d", (edge) => connectorPath(edge.parent, edge.child))
      .attr("fill", "none")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 2);

    const nodeGroups = zoomLayer
      .append("g")
      .attr("class", "unified-orgchart__nodes")
      .selectAll("g.unified-node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "unified-node")
      .attr("data-node-id", (node) => (node.data ? node.data.id : ""))
      .attr("transform", (node) => `translate(${node.x},${node.y})`);

    nodeGroups
      .append("foreignObject")
      .attr("width", (node) => node.width)
      .attr("height", (node) => node.height)
      .style("overflow", "visible")
      .append("xhtml:div")
      .attr("xmlns", "http://www.w3.org/1999/xhtml")
      .html((node) => cardHtml(node, cardOptions));

    nodeGroups
      .filter((node) => node.type === NODE_DEPARTMENT && (node.children.length || node.collapsed))
      .each(function renderToggle(node) {
        const group = d3.select(this);
        const cx = node.width / 2;
        const cy = node.height + 14;

        const button = group
          .append("g")
          .attr("class", "unified-node__toggle")
          .attr("transform", `translate(${cx},${cy})`)
          .style("cursor", "pointer")
          .on("click", () => {
            d3.event.stopPropagation();
            toggleCollapse(node.data.id);
          });

        button
          .append("circle")
          .attr("r", 11)
          .attr("fill", "#ffffff")
          .attr("stroke", "#d0d5dd")
          .attr("stroke-width", 1.5);

        button
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dy", 4)
          .attr("font-size", 14)
          .attr("fill", "#344054")
          .text(node.collapsed ? "+" : "−");
      });

    state.svg = svg;
    state.zoomLayer = zoomLayer;
  }

  function fit() {
    if (!state.layout || !state.viewport) return;
    const { width, height } = state.layout;
    state.viewport.fit({
      bounds: { x: 0, y: 0, width, height },
      viewport: { width, height },
    });
  }

  function setCentered(id) {
    const node = state.layout
      ? state.layout.nodes.find((n) => n.data && n.data.id === id)
      : null;
    if (!node) return { render() {} };

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    state.viewport.setCentered({
      x: cx,
      y: cy,
      viewport: { width: state.layout.width, height: state.layout.height },
    });

    return { render() {} };
  }

  function toggleCollapse(id) {
    // CR-011 §10: до rerender зафиксировать viewport и якорь
    // (карточка, по которой нажали collapse/expand).
    captureViewport();
    captureAnchor(id);

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
      return state.layout ? state.layout.flatData : [];
    },
    fit,
    setCentered,
    render,
    toggleCollapse,
  };
}

