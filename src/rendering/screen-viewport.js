/**
 * screen-viewport.js
 *
 * Общий механизм управления экранным viewport диаграммы (CR-008_1):
 * zoom, pan, fit, center, transform.
 *
 * Используется и unified-screen-renderer.js, и compact-a4-screen-renderer.js,
 * чтобы у обоих дизайнов была одна реализация управления экраном.
 *
 * Диапазон масштабирования задаётся ТОЛЬКО здесь (CR-011): минимальный 2%,
 * максимальный 10 000% — фактически свободный zoom без использования Infinity.
 * Дублировать .scaleExtent(...) в renderer'ах нельзя — один источник настроек.
 *
 * Принципы:
 *   - D3 transform применяется к отдельному <g> (zoom layer), а не к root <svg>.
 *   - Существующий механизм проекта (d3 v5) переиспользуется как есть:
 *     `const zoomEvent = event || d3.event;`
 */

import * as d3 from "d3";

// Единый источник ограничений масштаба экранной диаграммы (CR-011).
// Пользователь не должен упираться в искусственно низкий предел увеличения.
export const MIN_ZOOM_SCALE = 0.02; // 2%  — позволяет отдалить очень большую схему
export const MAX_ZOOM_SCALE = 100; // 10 000% — фактически свободное увеличение

function asSelection(node) {
  if (node && typeof node.node === "function") return node; // уже d3 selection
  return d3.select(node);
}

/**
 * Создаёт viewport controller для экранной диаграммы.
 *
 * Диапазон zoom фиксирован (MIN_ZOOM_SCALE..MAX_ZOOM_SCALE) и не передаётся
 * извне, чтобы не было дублирования настроек по renderer'ам (CR-011).
 *
 * @param {object} params
 * @param {Element|d3.selection} params.svg - root SVG элемент
 * @param {Element|d3.selection} params.zoomLayer - <g>, к которому применяется transform
 */
export function createChartViewport({ svg, zoomLayer }) {
  const svgSelection = asSelection(svg);
  const layerSelection = asSelection(zoomLayer);

  const zoomBehavior = d3
    .zoom()
    .scaleExtent([MIN_ZOOM_SCALE, MAX_ZOOM_SCALE])
    .on("zoom", (zoomEvent) => {
      // Совместимость с текущей версией D3 (CR-008_1 #15): в d3 v5 событие
      // доступно через d3.event, в новых версиях — как первый аргумент.
      const currentEvent = zoomEvent || d3.event;
      if (currentEvent && currentEvent.transform) {
        layerSelection.attr("transform", currentEvent.transform);
      }
    });

  svgSelection.call(zoomBehavior);

  function applyTransform(transform) {
    svgSelection.call(zoomBehavior.transform, transform);
  }

  /**
   * Вписывает прямоугольник bounds в область viewport.
   *
   * @param {object} opts
   * @param {{x:number,y:number,width:number,height:number}} opts.bounds - габариты
   *   содержимого в координатах SVG (viewBox).
   * @param {{width:number,height:number}} [opts.viewport] - видимая область
   *   в тех же координатах. По умолчанию равна bounds (поведение unified-рендера).
   * @param {number} [opts.padding=0.05] - запас от краёв.
   */
  function fit({ bounds, viewport, padding = 0.05 } = {}) {
    if (!bounds) return;

    const contentW = Math.max(bounds.width, 1);
    const contentH = Math.max(bounds.height, 1);
    const viewW = viewport && viewport.width ? viewport.width : contentW;
    const viewH = viewport && viewport.height ? viewport.height : contentH;

    const k = Math.min(viewW / contentW, viewH / contentH, 1) * (1 - padding);
    const tx = viewW / 2 - (bounds.x + contentW / 2) * k;
    const ty = viewH / 2 - (bounds.y + contentH / 2) * k;

    applyTransform(d3.zoomIdentity.translate(tx, ty).scale(k));
  }

  /**
   * Центрирует точку (x, y) в области viewport.
   *
   * @param {object} opts
   * @param {number} opts.x - центр цели в координатах SVG
   * @param {number} opts.y
   * @param {{width:number,height:number}} [opts.viewport] - видимая область
   */
  function setCentered({ x, y, viewport } = {}) {
    if (x == null || y == null) return;

    const viewW = viewport && viewport.width ? viewport.width : 0;
    const viewH = viewport && viewport.height ? viewport.height : 0;

    applyTransform(d3.zoomIdentity.translate(viewW / 2 - x, viewH / 2 - y));
  }

  function reset() {
    applyTransform(d3.zoomIdentity);
  }

  function currentTransform() {
    return d3.zoomTransform(svgSelection.node());
  }

  return {
    zoomBehavior,
    applyTransform,
    fit,
    setCentered,
    reset,
    currentTransform,
  };
}
