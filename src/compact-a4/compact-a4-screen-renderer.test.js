import { describe, it, expect, beforeEach } from "vitest";

describe("compact-a4-screen-renderer (CR-008_1)", () => {
  let renderCompactA4Screen;

  beforeEach(async () => {
    document.body.innerHTML =
      '<div id="orgChart" style="width:800px;height:600px"></div>';
    const mod = await import("./compact-a4-screen-renderer.js");
    renderCompactA4Screen = mod.renderCompactA4Screen;
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
    return document.querySelector(".compact-a4__viewport-layer");
  }

  it("возвращает API управления {fit, setCentered, render, toggleCollapse}", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {
      showVacancies: true,
      viewMode: "to-be",
    });

    expect(chart).toBeDefined();
    expect(typeof chart.fit).toBe("function");
    expect(typeof chart.setCentered).toBe("function");
    expect(typeof chart.render).toBe("function");
    expect(typeof chart.toggleCollapse).toBe("function");
    expect(Array.isArray(chart.flatData)).toBe(true);
    expect(chart.flatData.length).toBeGreaterThan(0);
  });

  it("рендерит SVG с viewport layer и фиксированным заголовком", () => {
    renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const svg = document.querySelector("#orgChart svg");
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("class")).toContain("compact-a4");

    const layer = getLayer();
    expect(layer).toBeTruthy();

    // Заголовок живёт вне viewport layer (не двигается при pan/zoom)
    const headerText = Array.from(svg.querySelectorAll("text")).some((t) =>
      (t.textContent || "").includes("Организационная структура"),
    );
    expect(headerText).toBe(true);

    const layerTexts = Array.from(layer.querySelectorAll("text")).map((t) =>
      t.textContent || "",
    );
    expect(layerTexts.some((t) => t.includes("Организационная структура"))).toBe(false);
    expect(layerTexts.some((t) => t.includes("Холдинг"))).toBe(true);
  });

  it("первоначальный fit применяет transform к viewport layer", () => {
    renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const transform = getLayer().getAttribute("transform");
    expect(transform).toContain("scale(");
    expect(transform).toContain("translate(");
  });

  it("setCentered центрирует узел и возвращает совместимый объект", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const result = chart.setCentered("root");
    expect(typeof result.render).toBe("function");

    const transform = getLayer().getAttribute("transform");
    expect(transform).toContain("scale(1)");
  });

  it("setCentered для неизвестного id не падает", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});
    const result = chart.setCentered("missing-id");
    expect(typeof result.render).toBe("function");
  });

  it("toggleCollapse пересоздаёт диаграмму через общий layout", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    expect(document.querySelectorAll("#orgChart svg").length).toBe(1);

    chart.toggleCollapse("root");

    expect(document.querySelectorAll("#orgChart svg").length).toBe(1);
    expect(getLayer()).toBeTruthy();
  });

  it("повторный render сохраняет интерактивный viewport", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    chart.render();

    expect(document.querySelectorAll("#orgChart svg").length).toBe(1);
    expect(getLayer()).toBeTruthy();
    expect(getLayer().getAttribute("transform")).toContain("scale(");
  });

  it("возвращает null, если контейнер не найден", () => {
    document.body.innerHTML = "";
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});
    expect(chart).toBeNull();
  });

  it("показывает empty state и возвращает null для пустого rootNodes", () => {
    const chart = renderCompactA4Screen([], "#orgChart", {});
    expect(chart).toBeNull();
    expect(document.querySelector("#orgChart .empty-chart")).toBeTruthy();
  });

  it("flatData содержит сотрудников и подразделения", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const ids = chart.flatData.map((n) => n.id);
    expect(ids).toContain("root");
    expect(ids).toContain("child");
    expect(chart.flatData.some((n) => n.type === "employees")).toBe(true);
  });
});
