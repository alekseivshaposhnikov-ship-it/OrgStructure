import { describe, it, expect, beforeEach } from "vitest";

describe("unified-screen-renderer (CR-011)", () => {
  let renderUnifiedScreen;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="orgChart" style="width:800px;height:600px"></div>';
    const mod = await import("./unified-screen-renderer.js");
    renderUnifiedScreen = mod.renderUnifiedScreen;
  });

  function makeRoot() {
    return {
      department_guid: "root",
      department_name: "Холдинг",
      department_manager: "Директор",
      department_manager_position: "CEO",
      staffCount: 2,
      users: [
        {
          id: "u1",
          name: "Иван",
          position: "Разработчик",
          isVacancy: false,
          project: "",
        },
        {
          id: "u2",
          name: "Мария",
          position: "Менеджер",
          isVacancy: false,
          project: "",
        },
      ],
      children: [
        {
          department_guid: "child",
          department_name: "Отдел разработки",
          department_manager: "Пётр",
          department_manager_position: "Руководитель",
          staffCount: 5,
          users: [],
          children: [],
        },
      ],
    };
  }

  function getLayer() {
    return document.querySelector("svg.unified-orgchart .unified-orgchart__layer");
  }

  it("возвращает API управления {fit, setCentered, render, toggleCollapse}", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});

    expect(chart).toBeDefined();
    expect(typeof chart.fit).toBe("function");
    expect(typeof chart.setCentered).toBe("function");
    expect(typeof chart.render).toBe("function");
    expect(typeof chart.toggleCollapse).toBe("function");
    expect(Array.isArray(chart.flatData)).toBe(true);
    expect(chart.flatData.length).toBeGreaterThan(0);
  });

  it("рендерит SVG с zoom layer", () => {
    renderUnifiedScreen([makeRoot()], "#orgChart", {});

    const svg = document.querySelector("#orgChart svg");
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("class")).toContain("unified-orgchart");

    const layer = getLayer();
    expect(layer).toBeTruthy();
  });

  it("возвращает null, если контейнер не найден", () => {
    document.body.innerHTML = "";
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    expect(chart).toBeNull();
  });

  it("показывает empty state и возвращает null для пустого rootNodes", () => {
    const chart = renderUnifiedScreen([], "#orgChart", {});
    expect(chart).toBeNull();
    expect(document.querySelector("#orgChart .empty-chart")).toBeTruthy();
  });

  it("fit применяет transform к zoom layer", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});

    chart.fit();

    const transform = getLayer().getAttribute("transform");
    expect(transform).toContain("scale(");
    expect(transform).toContain("translate(");
  });

  it("setCentered центрирует узел", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    const result = chart.setCentered("root");
    expect(typeof result.render).toBe("function");
    expect(getLayer().getAttribute("transform")).toContain("scale(1)");
  });

  it("использует единый расширенный диапазон zoom (CR-011)", () => {
    renderUnifiedScreen([makeRoot()], "#orgChart", {});

    const svg = document.querySelector("#orgChart svg");
    const layer = getLayer();

    // Один сильный wheel up: k = 2^(6000*0.002) = 4096 → клампится к 100.
    // Если бы обычный renderer использовал старый диапазон [0.1, 3],
    // zoom остановился бы на 3.
    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -6000, bubbles: true, cancelable: true }));

    const transform = layer.getAttribute("transform");
    expect(transform).toContain("scale(100)");
  });
});
