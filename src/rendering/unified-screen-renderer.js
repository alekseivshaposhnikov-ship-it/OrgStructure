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
  NODE_ASSISTANT,
} from "./unified-layout.js";
import { renderNodeContent } from "./chart-cards.js";
import { createChartViewport } from "./screen-viewport.js";
import {
  createExpandState,
  departmentIdOf,
  hiddenEmployeeIds,
  expandBranch,
  collapseBranch,
  expandAll as expandAllState,
  collapseAll as collapseAllState,
} from "../domain/expand-state.js";

// CR-015 §22-26: toggle привязан к layout-геометрии (baseline visual row +
// TOGGLE_GAP), а не к переменной content height. Основной источник —
// node.toggleY из computeUnifiedLayout (opts.toggleGap); TOGGLE_GAP — только
// fallback для layout-узлов без toggleY.
const TOGGLE_GAP = 14;

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

/**
 * CR-015 §8-9 + CR-019 §21-22: отдельная короткая связь manager → assistant.
 *
 * Два паттерна размещения assistant (CR-019 §3-7):
 * - side (top-management): assistant справа от manager — connector от правого
 *   центра manager-карточки к левому центру assistant (короткий L-shaped);
 * - below (обычные руководители): assistant под manager — connector от нижнего
 *   центра manager к верхнему центру assistant (короткая вертикальная прямая).
 */
export function assistantConnectorPath(manager, assistant) {
  if (manager.assistantPlacement === "side") {
    const fromX = manager.x + manager.width;
    const fromY = manager.y + manager.height / 2;
    const toX = assistant.x;
    const toY = assistant.y + assistant.height / 2;

    if (Math.abs(toY - fromY) < 1) {
      return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }

    const midX = fromX + (toX - fromX) / 2;
    return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
  }

  // below: assistant центрирован относительно manager → единая вертикальная ось.
  const fromX = manager.x + manager.width / 2;
  const fromY = manager.y + manager.height;
  const toX = assistant.x + assistant.width / 2;
  const toY = assistant.y;
  return `M ${fromX} ${fromY} L ${toX} ${toY}`;
}

/**
 * Строит connector paths по edges (CR-014 §32-38, CR-015 §10-16, CR-019 §21-23):
 * - assistant: отдельная короткая связь manager → assistant (side: L-shaped
 *   right-center → left-center; below: вертикальная bottom-center → top-center);
 * - organizational children: одна main vertical stem от parent bottom-center
 *   до junctionY в свободной зоне, горизонтальная junction и drop-линии.
 *
 * junctionY (CR-015 §15): середина свободной зоны между фактическим нижним
 * краем parent visual block (max нижней границы manager и его assistant) и
 * верхом детей. Дополнительно junction опускается ниже toggle baseline, чтобы
 * toggle находился на main stem между card и junction (§26-27).
 */
export function buildConnectorPaths(edges) {
  const paths = [];
  const byParent = new Map();

  edges.forEach((edge) => {
    if (!byParent.has(edge.parent)) byParent.set(edge.parent, []);
    byParent.get(edge.parent).push(edge.child);
  });

  byParent.forEach((children, parent) => {
    const assistants = children.filter((child) => child.type === NODE_ASSISTANT);
    const orgChildren = children.filter((child) => child.type !== NODE_ASSISTANT);

    assistants.forEach((assistant) => {
      paths.push(assistantConnectorPath(parent, assistant));
    });

    if (!orgChildren.length) return;

    const fromX = parent.x + parent.width / 2;
    const fromY = parent.y + parent.height;
    const managerBottom = fromY;
    const assistantBottom = assistants.length
      ? Math.max(...assistants.map((assistant) => assistant.y + assistant.height))
      : managerBottom;
    const visualBottom = Math.max(managerBottom, assistantBottom);
    const childrenTop = Math.min(...orgChildren.map((child) => child.y));

    let junctionY = visualBottom + (childrenTop - visualBottom) / 2;
    // Toggle живёт на main stem между card и junction (CR-015 §26-27):
    // при variable-height cards baseline row может быть ниже visualBottom manager.
    if (Number.isFinite(parent.toggleY)) {
      junctionY = Math.max(junctionY, parent.toggleY + TOGGLE_GAP);
    }
    junctionY = Math.min(junctionY, childrenTop - 1);

    // Main vertical stem от parent bottom-center к junction (CR-014 §32-33, §73).
    paths.push(`M ${fromX} ${fromY} L ${fromX} ${junctionY}`);

    // Horizontal junction в свободной зоне (§35), гарантированно соединяющая
    // stem с drop-линиями (даже для единственного смещённого child).
    const centers = orgChildren.map((child) => child.x + child.width / 2);
    const junctionStart = Math.min(fromX, ...centers);
    const junctionEnd = Math.max(fromX, ...centers);
    if (junctionEnd - junctionStart > 0.5) {
      paths.push(`M ${junctionStart} ${junctionY} L ${junctionEnd} ${junctionY}`);
    }

    // Drop-линии к каждому child (§34).
    orgChildren.forEach((child) => {
      const cx = child.x + child.width / 2;
      paths.push(`M ${cx} ${junctionY} L ${cx} ${child.y}`);
    });
  });

  return paths;
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
    // CR-023 §6-7: компактная геометрия и presentation-группировка.
    employeesHeaderHeight = 26,
    colGap = 40,
    rowGap = 60,
    personGap = 8,
    contentGap = 30,
    paddingX = 40,
    paddingY = 40,
    measureContent = false,
    groupByPosition = false,
    // CR-012: при выборе корня Холдинга дирекции верхнего уровня
    // сворачиваются по умолчанию. Применяется только к первичному рендеру.
    collapseTopLevel = false,
    // CR-013 §22: явный список дирекций для initial collapse (leadership-проекция
    // Холдинга: дирекции под executive-узлами). Имеет приоритет над collapseTopLevel.
    initialCollapsedIds = null,
    // CR-024 §2.5: внешнее состояние раскрытия (переживает пересоздание renderer).
    expandState = null,
    // CR-024 §2.2: сотрудники управляются отдельно и скрыты по умолчанию.
    collapseEmployees = false,
    // CR-024 §2.2: дополнительная высота карточки подразделения под кнопку.
    employeesToggleHeight = 22,
  } = options;

  const cardOptions = { cardDesign, showVacancies, viewMode };

  const state = {
    container,
    rootNodes,
    // CR-024 §2.5: состояние раскрытия подразделений/сотрудников. Внешнее
    // состояние переиспользуется между рендерами, иначе создаётся локальное.
    expandState: expandState || createExpandState(),
    collapseEmployees,
    employeesToggleHeight,
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
   * department children (дирекции) получают initial collapsed state.
   * CR-024 §2.5: seeding выполняется один раз на корень — повторный рендер
   * того же корня (поиск, фильтры, вакансии) сохраняет состояние раскрытия.
   */
  function initCollapsedIds() {
    const rootId = rootNodes[0] ? departmentIdOf(rootNodes[0]) : "";
    if (state.expandState.__seededRoot === rootId) return;

    // CR-013 §22: явный список дирекций (leadership-проекция Холдинга) —
    // имеет приоритет над «свернуть всех прямых детей root».
    if (Array.isArray(initialCollapsedIds) && initialCollapsedIds.length) {
      initialCollapsedIds.forEach((id) => {
        if (id) state.expandState.childrenCollapsed.add(id);
      });
      state.expandState.__seededRoot = rootId;
      return;
    }

    if (collapseTopLevel && rootNodes && rootNodes.length) {
      const root = rootNodes[0];
      (root.children || []).forEach((child) => {
        const id = departmentIdOf(child);
        if (id) state.expandState.childrenCollapsed.add(id);
      });
    }

    state.expandState.__seededRoot = rootId;
  }

  initCollapsedIds();

  /** CR-024 §2.2: скрытые сотрудники — все подразделения без «Сотрудники» открыто. */
  function computeHiddenEmployeeIds() {
    if (!state.collapseEmployees) return null;
    return hiddenEmployeeIds(state.expandState, rootNodes);
  }

  function buildLayout() {
    state.layout = computeUnifiedLayout(rootNodes[0], {
      showVacancies,
      departmentWidth,
      departmentHeight,
      employeeWidth: departmentWidth,
      employeeHeight,
      assistantWidth: departmentWidth,
      assistantHeight: employeeHeight,
      employeesHeaderHeight,
      colGap,
      rowGap,
      personGap,
      contentGap,
      paddingX,
      paddingY,
      measureContent,
      groupByPosition,
      collapsedIds: state.expandState.childrenCollapsed,
      hiddenEmployeeIds: computeHiddenEmployeeIds(),
      employeesToggleHeight: state.employeesToggleHeight,
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

    // Connector paths: main organizational stems/junctions + отдельные
    // assistant-connectors (CR-014 §31-38). Lines рисуются ДО карточек
    // (edges layer раньше nodes layer → карточки поверх линий).
    const connectorPaths = buildConnectorPaths(edges);

    zoomLayer
      .append("g")
      .attr("class", "unified-orgchart__edges")
      .selectAll("path")
      .data(connectorPaths)
      .enter()
      .append("path")
      .attr("d", (path) => path)
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

    // CR-015 §19, §22-29: toggle controls — отдельный слой ПОВЕРХ карточек
    // (recommended SVG drawing order) и часть layout-геометрии. Позиция берётся
    // из layout (node.toggleY — единый baseline для siblings одного row);
    // X всегда на main organizational stem карточки (node.x + node.width / 2),
    // наличие assistant не меняет toggleX (§29).
    const toggles = zoomLayer
      .append("g")
      .attr("class", "unified-orgchart__toggles")
      .selectAll("g.unified-node__toggle")
      .data(
        nodes.filter(
          (node) =>
            node.type === NODE_DEPARTMENT &&
            (node.collapsed ||
              (node.children || []).some((child) => child.type !== NODE_ASSISTANT)),
        ),
      )
      .enter()
      .append("g")
      .attr("class", "unified-node__toggle")
      .attr("data-node-id", (node) => (node.data ? node.data.id : ""))
      .attr("transform", (node) => {
        const toggleX = node.x + node.width / 2;
        const toggleY = Number.isFinite(node.toggleY) ? node.toggleY : node.y + node.height + TOGGLE_GAP;
        return `translate(${toggleX},${toggleY})`;
      })
      .style("cursor", "pointer")
      .on("click", (node) => {
        d3.event.stopPropagation();
        toggleCollapse(node.data.id);
      });

    toggles.append("circle").attr("r", 11).attr("fill", "#ffffff").attr("stroke", "#d0d5dd").attr("stroke-width", 1.5);

    toggles
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 14)
      .attr("fill", "#344054")
      .text((node) => (node.collapsed ? "+" : "−"));

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

  /**
   * Основное действие toggle (CR-024 §2.1): раскрытие следующего уровня —
   * показ только непосредственных дочерних подразделений.
   */
  function toggleCollapse(id) {
    // CR-011 §10: до rerender зафиксировать viewport и якорь
    // (карточка, по которой нажали collapse/expand).
    captureViewport();
    captureAnchor(id);

    if (state.expandState.childrenCollapsed.has(id)) {
      state.expandState.childrenCollapsed.delete(id);
    } else {
      state.expandState.childrenCollapsed.add(id);
    }
    render();
  }

  /**
   * CR-024 §2.2: независимое переключение видимости сотрудников подразделения.
   * Сотрудники при этом не влияют на раскрытие дочерних подразделений.
   */
  function toggleEmployees(id) {
    captureViewport();
    captureAnchor(id);

    if (state.expandState.employeesExpanded.has(id)) {
      state.expandState.employeesExpanded.delete(id);
    } else {
      state.expandState.employeesExpanded.add(id);
    }
    render();
  }

  /** CR-024 §2.1: раскрыть только непосредственные дочерние подразделения. */
  function expandNextLevel(id) {
    captureViewport();
    captureAnchor(id);
    state.expandState.childrenCollapsed.delete(id);
    render();
  }

  /** CR-024 §2.1: раскрыть / свернуть всю ветку подразделения. */
  function expandBranchById(id) {
    captureViewport();
    captureAnchor(id);
    expandBranch(state.expandState, rootNodes[0], id);
    render();
  }

  function collapseBranchById(id) {
    captureViewport();
    captureAnchor(id);
    collapseBranch(state.expandState, rootNodes[0], id);
    render();
  }

  /** CR-024 §2.4: развернуть / свернуть всю организационную структуру. */
  function expandAll() {
    captureViewport();
    expandAllState(state.expandState, rootNodes);
    render();
  }

  function collapseAll() {
    captureViewport();
    collapseAllState(state.expandState, rootNodes);
    render();
  }

  /**
   * CR-024 §4: раскрыть путь до сотрудника и сфокусировать его карточку.
   * @param {string[]} departmentPathIds - id подразделений от корня до листа
   * @param {string} focusId - id карточки для центрирования (сотрудник/департамент)
   * @param {string} [employeesDeptId] - подразделение, чьи сотрудники раскрываются
   */
  function revealPath(departmentPathIds = [], focusId, employeesDeptId) {
    const pathIds = Array.isArray(departmentPathIds)
      ? departmentPathIds.filter(Boolean)
      : [];
    pathIds.forEach((id) => state.expandState.childrenCollapsed.delete(id));

    // employeesDeptId === null — сотрудники не раскрываются (например, руководитель
    // подразделения фокусируется на карточке подразделения).
    const employeeDept =
      employeesDeptId === undefined
        ? pathIds.length
          ? pathIds[pathIds.length - 1]
          : null
        : employeesDeptId;
    if (employeeDept) state.expandState.employeesExpanded.add(employeeDept);

    render();
    if (focusId) setCentered(focusId);
  }

  render();

  return {
    get flatData() {
      return state.layout ? state.layout.flatData : [];
    },
    get expandState() {
      return state.expandState;
    },
    fit,
    setCentered,
    render,
    toggleCollapse,
    toggleEmployees,
    expandNextLevel,
    expandBranch: expandBranchById,
    collapseBranch: collapseBranchById,
    expandAll,
    collapseAll,
    revealPath,
  };
}

