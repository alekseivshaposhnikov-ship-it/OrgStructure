import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import { createChartViewport, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE } from "./screen-viewport.js";

function createSvgDom() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", "0 0 1000 800");
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(layer);
  document.body.appendChild(svg);
  return { svg, layer };
}

describe("screen-viewport (CR-008_1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("создаёт viewport controller с ожидаемым API", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    expect(viewport.zoomBehavior).toBeDefined();
    expect(typeof viewport.applyTransform).toBe("function");
    expect(typeof viewport.fit).toBe("function");
    expect(typeof viewport.setCentered).toBe("function");
    expect(typeof viewport.reset).toBe("function");
    expect(typeof viewport.currentTransform).toBe("function");
  });

  it("применяет transform к zoom layer, а не к root svg", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    viewport.fit({
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
      viewport: { width: 1000, height: 800 },
    });

    // transform уходит в <g>, root <svg> не трансформируется
    expect(layer.getAttribute("transform")).toContain("scale(0.95)");
    expect(layer.getAttribute("transform")).toContain("translate(25,20)");
    expect(svg.getAttribute("transform")).toBeNull();
  });

  it("fit с viewport-областью вписывает содержимое (компактный A4 случай)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    // Содержимое 500x300, видимая область 1000x800
    viewport.fit({
      bounds: { x: 24, y: 104, width: 500, height: 300 },
      viewport: { width: 1000, height: 800 },
    });

    // k = min(1000/500, 800/300, 1) * 0.95 = 1 * 0.95
    const transform = layer.getAttribute("transform");
    expect(transform).toContain("scale(0.95)");
  });

  it("setCentered центрирует точку в области", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    viewport.setCentered({ x: 500, y: 400, viewport: { width: 1000, height: 800 } });

    const transform = layer.getAttribute("transform");
    expect(transform).toContain("translate(0,0)");
    expect(transform).toContain("scale(1)");
  });

  it("reset возвращает identity transform", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    viewport.fit({
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
      viewport: { width: 1000, height: 800 },
    });
    expect(layer.getAttribute("transform")).toContain("scale(0.95)");

    viewport.reset();
    const transform = layer.getAttribute("transform");
    expect(transform).toContain("translate(0,0)");
    expect(transform).toContain("scale(1)");
  });

  it("использует единый расширенный диапазон масштаба (CR-011)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    expect(viewport.zoomBehavior.scaleExtent()).toEqual([MIN_ZOOM_SCALE, MAX_ZOOM_SCALE]);
    expect(MIN_ZOOM_SCALE).toBe(0.02);
    expect(MAX_ZOOM_SCALE).toBe(100);
  });
});

describe("screen-viewport zoom диапазон (CR-011)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each([20, 50, 100])(
    "допускает увеличение до масштаба %sx без ограничения прежним лимитом 3x",
    (scale) => {
      const { svg, layer } = createSvgDom();
      const viewport = createChartViewport({ svg, zoomLayer: layer });

      viewport.applyTransform(d3.zoomIdentity.scale(scale));

      expect(viewport.currentTransform().k).toBe(scale);
      expect(layer.getAttribute("transform")).toContain(`scale(${scale})`);
    },
  );

  it("ограничивает увеличение выше максимума значением MAX_ZOOM_SCALE (CR-011)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    // Пользовательский путь масштабирования (scaleBy/scaleTo) клампится scaleExtent:
    // 1 * 500 → 500 → ограничивается до 100.
    viewport.zoomBehavior.scaleBy(d3.select(svg), 500);

    expect(viewport.currentTransform().k).toBe(MAX_ZOOM_SCALE);
    expect(layer.getAttribute("transform")).toContain("scale(100)");
  });

  it("позволяет уменьшить до минимального масштаба MIN_ZOOM_SCALE (CR-011)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    viewport.applyTransform(d3.zoomIdentity.scale(MIN_ZOOM_SCALE));

    expect(viewport.currentTransform().k).toBe(0.02);
    expect(layer.getAttribute("transform")).toContain("scale(0.02)");

    // Дальнейшее уменьшение тоже клампится и не падает ниже минимума.
    viewport.zoomBehavior.scaleBy(d3.select(svg), 0.5);
    expect(viewport.currentTransform().k).toBe(0.02);
  });

  it("после fit() позволяет вручную увеличить диаграмму выше прежнего лимита 3x (CR-011)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    viewport.fit({
      bounds: { x: 0, y: 0, width: 1000, height: 800 },
      viewport: { width: 1000, height: 800 },
    });
    expect(viewport.currentTransform().k).toBeCloseTo(0.95, 5);

    // После fit пользователь может увеличить, например, до 20x — существенно
    // сильнее прежнего лимита 3x.
    viewport.applyTransform(d3.zoomIdentity.scale(20));
    expect(viewport.currentTransform().k).toBe(20);
  });

  it("wheel up увеличивает масштаб выше прежнего лимита 3x (CR-011)", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer });

    // Один сильный скролл вверх: k = 1 * 2^(6000*0.002) = 4096 → клампится к 100.
    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -6000, bubbles: true, cancelable: true }));

    const k = viewport.currentTransform().k;
    expect(k).toBeGreaterThan(3);
    expect(k).toBeLessThanOrEqual(MAX_ZOOM_SCALE);
    expect(layer.getAttribute("transform")).toContain("scale(100)");
  });
});
