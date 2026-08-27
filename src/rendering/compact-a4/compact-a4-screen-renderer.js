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
  A4_WIDTH,
  A4_HEIGHT,
  PADDING_X,
  PADDING_Y,
  HEADER_HEIGHT,
  buildCompactA4LayoutResult,
} from "./compact-a4-layout.js";
import { renderCompactSvg } from "./compact-a4-svg-renderer.js";
import { createChartViewport } from "../screen-viewport.js";
import { VIEW_MODE_TITLES } from "../../core/constants.js";

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
    layoutResult: null,
    layout: null,
    flat: null,
    scale: 1,
    canFit: true,
    svg: null,
    viewport: null,
    // CR-011: сохранённый viewport живёт выше lifecycle конкретного SVG,
    // чтобы collapse/expand не сбрасывал zoom/pan и визуальный фокус.
    viewportTransform: null,
    viewportAnchor: null,
  };

  function buildLayout() {
    state.layoutResult = buildCompactA4LayoutResult(state.rootNode, {
      hideNames,
      showVacancies,
      collapsedIds: state.collapsedIds,
    });

    state.layout = state.layoutResult.layout;
    state.scale = state.layoutResult.scale;
    state.canFit = state.layoutResult.canFit;
    state.flat = state.layoutResult.flat;
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
   * пользователь выполнил collapse/expand. Карточки Compact A4 лежат
   * в SVG-координатах: PADDING + layout-координата * scale.
   */
  function captureAnchor(id) {
    state.viewportAnchor = null;
    if (!id || !state.viewportTransform || !state.flat) return;

    const node = state.flat.find((n) => n.id === id);
    if (!node) return;

    const cx = PADDING_X + (node.x + node.cardWidth / 2) * state.scale;
    const cy = PADDING_Y + HEADER_HEIGHT + (node.y + node.cardHeight / 2) * state.scale;
    const screen = state.viewport.projectPoint({ x: cx, y: cy }, state.viewportTransform);
    state.viewportAnchor = { id, screenX: screen.x, screenY: screen.y };
  }

  /**
   * CR-011 §5, §10: восстанавливает сохранённый viewport после rerender
   * (без автоматического fit). При наличии якоря translate корректируется
   * так, чтобы карточка-якорь осталась в прежней экранной позиции.
   */
  function restoreViewport() {
    const saved = state.viewportTransform;
    if (!saved || !state.viewport) return;

    const anchor = state.viewportAnchor;
    let anchorOffset = null;
    if (anchor) {
      const node = state.flat.find((n) => n.id === anchor.id);
      if (node) {
        const cx = PADDING_X + (node.x + node.cardWidth / 2) * state.scale;
        const cy = PADDING_Y + HEADER_HEIGHT + (node.y + node.cardHeight / 2) * state.scale;
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

    const title = state.rootNode.department_name || state.rootNode.name || "Организационная структура";
    const subtitle = `${VIEW_MODE_TITLES[viewMode] || "Организационная структура"}${showVacancies ? "" : " · без вакансий"}`;

    const svg = renderCompactSvg(state.layoutResult, { title, subtitle, screen: true });

    state.svg = svg;
    container.appendChild(svg);

    const zoomLayer = svg.querySelector(".compact-a4__viewport-layer");
    if (zoomLayer) {
      // Диапазон zoom задаётся в общем viewport-хелпере (CR-011),
      // здесь не дублируем scaleExtent.
      state.viewport = createChartViewport({ svg, zoomLayer });

      // CR-011 §3, §5: структурный rerender (collapse/expand) — восстановить
      // сохранённый viewport, а не сбрасывать его на fit. fit() допустим
      // только для первичного рендера.
      if (state.viewportTransform) {
        restoreViewport();
      } else {
        fit();
      }
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
      return state.flat || [];
    },
    fit,
    setCentered,
    render,
    toggleCollapse,
  };
}

