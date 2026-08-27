import { describe, it, expect, beforeEach } from "vitest";
import { PADDING_X, PADDING_Y, HEADER_HEIGHT } from "./compact-a4-layout.js";

describe("compact-a4-screen-renderer (CR-008_1)", () => {
  let renderCompactA4Screen;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="orgChart" style="width:800px;height:600px"></div>';
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

  // Схема с двумя большими ветками для сценария «несколько операций подряд».
  function makeRootWithBranches() {
    return {
      department_guid: "root",
      department_name: "Холдинг",
      department_manager: "Директор",
      department_manager_position: "CEO",
      staffCount: 0,
      users: [],
      children: [
        {
          department_guid: "childA",
          department_name: "Дирекция A",
          department_manager: "А",
          department_manager_position: "Руководитель",
          staffCount: 0,
          users: [],
          children: [
            {
              department_guid: "childA1",
              department_name: "Отдел A1",
              department_manager: "А1",
              department_manager_position: "Руководитель",
              staffCount: 0,
              users: [],
              children: [],
            },
          ],
        },
        {
          department_guid: "childB",
          department_name: "Дирекция B",
          department_manager: "Б",
          department_manager_position: "Руководитель",
          staffCount: 0,
          users: [],
          children: [
            {
              department_guid: "childB1",
              department_name: "Отдел B1",
              department_manager: "Б1",
              department_manager_position: "Руководитель",
              staffCount: 0,
              users: [],
              children: [],
            },
          ],
        },
      ],
    };
  }

  function parseTransform(str) {
    if (!str) return { x: 0, y: 0, k: 1 };
    const translate = str.match(/translate\(([-\d.e]+),([-\d.e]+)\)/);
    const scale = str.match(/scale\(([-\d.e]+)\)/);
    return {
      x: translate ? parseFloat(translate[1]) : 0,
      y: translate ? parseFloat(translate[2]) : 0,
      k: scale ? parseFloat(scale[1]) : 1,
    };
  }

  // Внутренний scale Compact A4 (translate(0,0) scale(N) на диаграмме внутри viewport layer).
  function getDiagScale() {
    const diag = document.querySelector(".compact-a4__viewport-layer > g");
    return parseTransform(diag ? diag.getAttribute("transform") : "").k;
  }

  // Центр карточки в пользовательских координатах SVG (с учётом A4-заголовка и padding).
  function getCompactUserCenter(chart, id) {
    const node = chart.flatData.find((n) => n.id === id);
    expect(node).toBeTruthy();
    const scale = getDiagScale();
    return {
      x: PADDING_X + (node.x + node.cardWidth / 2) * scale,
      y: PADDING_Y + HEADER_HEIGHT + (node.y + node.cardHeight / 2) * scale,
    };
  }

  // Экранная (viewport) позиция центра карточки с учётом layer transform.
  function getCompactScreenCenter(chart, id) {
    const user = getCompactUserCenter(chart, id);
    const t = parseTransform(getLayer().getAttribute("transform"));
    return { x: user.x * t.k + t.x, y: user.y * t.k + t.y, k: t.k };
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

    const layerTexts = Array.from(layer.querySelectorAll("text")).map((t) => t.textContent || "");
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

  it("использует единый расширенный диапазон zoom (CR-011)", () => {
    renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const svg = document.querySelector("#orgChart svg");
    const layer = getLayer();

    // Один сильный wheel up: k = k0 * 2^(6000*0.002) → клампится к 100.
    // Если бы Compact A4 использовал старый диапазон [0.1, 3], zoom остановился бы на 3.
    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -6000, bubbles: true, cancelable: true }));

    const transform = layer.getAttribute("transform");
    expect(transform).toContain("scale(100)");
  });

  it("toggleCollapse сохраняет zoom и позицию якоря вместо auto-fit (CR-011)", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const before = getCompactScreenCenter(chart, "root");
    // Первичный рендер применил fit — дефолтный масштаб меньше 1.
    expect(before.k).toBeLessThan(1);

    chart.toggleCollapse("root");

    const after = getCompactScreenCenter(chart, "root");
    // zoom сохранён, а не сброшен на новый fit (CR-011 §12)
    expect(after.k).toBeCloseTo(before.k, 5);
    // карточка-якорь осталась в прежней экранной позиции (CR-011 §14)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it("collapse → expand сохраняет zoom/pan в Compact A4 (CR-011 Test 3)", () => {
    const chart = renderCompactA4Screen([makeRoot()], "#orgChart", {});

    const before = getCompactScreenCenter(chart, "root");

    chart.toggleCollapse("root");
    chart.toggleCollapse("root");

    const after = getCompactScreenCenter(chart, "root");
    expect(after.k).toBeCloseTo(before.k, 5);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it("несколько collapse/expand подряд сохраняют рабочий участок в Compact A4 (CR-011 Test 4)", () => {
    const chart = renderCompactA4Screen([makeRootWithBranches()], "#orgChart", {});

    const screenA0 = getCompactScreenCenter(chart, "childA");
    chart.toggleCollapse("childA");
    const screenA1 = getCompactScreenCenter(chart, "childA");
    expect(Math.abs(screenA1.x - screenA0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenA1.y - screenA0.y)).toBeLessThan(1e-6);

    const screenB0 = getCompactScreenCenter(chart, "childB");
    chart.toggleCollapse("childB");
    const screenB1 = getCompactScreenCenter(chart, "childB");
    expect(Math.abs(screenB1.x - screenB0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenB1.y - screenB0.y)).toBeLessThan(1e-6);

    chart.toggleCollapse("childA");
    const screenA2 = getCompactScreenCenter(chart, "childA");
    expect(Math.abs(screenA2.x - screenA0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenA2.y - screenA0.y)).toBeLessThan(1e-6);
  });

  it("новый root (новый renderer) по-прежнему применяет initial fit (CR-011 §16)", () => {
    const chartA = renderCompactA4Screen([makeRoot()], "#orgChart", {});
    chartA.toggleCollapse("root");

    // Выбор нового root → новый экземпляр renderer с пустым сохранённым
    // viewport: снова применяется initial fit, а не чужой transform.
    renderCompactA4Screen([makeRoot()], "#orgChart", {});
    const t = parseTransform(getLayer().getAttribute("transform"));
    expect(t.k).toBeCloseTo(0.95, 5);
  });
});
