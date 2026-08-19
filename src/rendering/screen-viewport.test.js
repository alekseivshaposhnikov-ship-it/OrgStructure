import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import { createChartViewport } from "./screen-viewport.js";

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
    const viewport = createChartViewport({ svg, zoomLayer: layer, minScale: 0.1, maxScale: 3 });

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

  it("уважает ограничения масштаба scaleExtent", () => {
    const { svg, layer } = createSvgDom();
    const viewport = createChartViewport({ svg, zoomLayer: layer, minScale: 0.1, maxScale: 3 });

    expect(viewport.zoomBehavior.scaleExtent()).toEqual([0.1, 3]);
  });
});
