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
  } = options;

  const cardOptions = { cardDesign, showVacancies, viewMode };

  const state = {
    container,
    rootNodes,
    collapsedIds: new Set(),
    layout: null,
    svg: null,
    zoomLayer: null,
    zoomBehavior: null,
  };

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

  function render() {
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

    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", () => {
        state.zoomLayer.attr("transform", d3.event.transform);
      });

    svg.call(zoomBehavior);

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
    state.zoomBehavior = zoomBehavior;
  }

  function fit() {
    if (!state.layout || !state.svg) return;
    const { width, height } = state.layout;
    const k = 0.95;
    const tx = (width * (1 - k)) / 2;
    const ty = (height * (1 - k)) / 2;
    state.svg.call(state.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }

  function setCentered(id) {
    const node = state.layout
      ? state.layout.nodes.find((n) => n.data && n.data.id === id)
      : null;
    if (!node) return { render() {} };

    const k = 1;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const tx = state.layout.width / 2 - cx * k;
    const ty = state.layout.height / 2 - cy * k;
    state.svg.call(state.zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(k));

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
      return state.layout ? state.layout.flatData : [];
    },
    fit,
    setCentered,
    render,
    toggleCollapse,
  };
}

