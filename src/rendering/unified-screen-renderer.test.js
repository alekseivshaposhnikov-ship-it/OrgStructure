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

  // Схема с двумя большими ветками для сценариев «несколько операций подряд»
  // и проверки сохранения рабочего участка при collapse/expand разных веток.
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

  // Центр карточки в пользовательских координатах SVG (viewBox = layout).
  function getNodeUserCenter(nodeId) {
    const group = document.querySelector(`g.unified-node[data-node-id="${nodeId}"]`);
    expect(group).toBeTruthy();
    const t = parseTransform(group.getAttribute("transform"));
    const fo = group.querySelector("foreignObject");
    const width = parseFloat(fo.getAttribute("width"));
    const height = parseFloat(fo.getAttribute("height"));
    return { x: t.x + width / 2, y: t.y + height / 2 };
  }

  // Экранная (viewport) позиция центра карточки с учётом layer transform.
  function getScreenCenter(nodeId) {
    const user = getNodeUserCenter(nodeId);
    const t = parseTransform(getLayer().getAttribute("transform"));
    return { x: user.x * t.k + t.x, y: user.y * t.k + t.y, k: t.k };
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

  it("toggleCollapse сохраняет zoom и не выполняет auto-fit (CR-011)", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    const svg = document.querySelector("#orgChart svg");

    // Приближаем далеко за прежний лимит 3x (k → 100) с ненулевым translate.
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );

    const before = parseTransform(getLayer().getAttribute("transform"));
    expect(before.k).toBe(100);
    expect(before.x).not.toBe(0);
    expect(before.y).not.toBe(0);

    chart.toggleCollapse("root");

    const after = parseTransform(getLayer().getAttribute("transform"));
    expect(after.k).toBe(100);
    // Не вернулись к дефолтному fit / identity.
    expect(after.x).not.toBe(0);
    expect(after.y).not.toBe(0);
  });

  it("toggleCollapse сохраняет pan и позицию якорной карточки (CR-011 §14)", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    const svg = document.querySelector("#orgChart svg");

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );

    const before = getScreenCenter("root");

    chart.toggleCollapse("root");

    const after = getScreenCenter("root");
    expect(after.k).toBe(100);
    // Центр карточки, по которой нажали collapse, остался на прежней
    // экранной позиции (CR-011 Test 5: tolerance ≤ 5–10px).
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it("collapse → expand сохраняет zoom/pan и позицию якоря (CR-011 Test 3)", () => {
    const chart = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    const svg = document.querySelector("#orgChart svg");

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );

    const before = getScreenCenter("root");

    chart.toggleCollapse("root"); // collapse
    chart.toggleCollapse("root"); // expand

    const after = getScreenCenter("root");
    expect(after.k).toBe(100);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it("несколько collapse/expand подряд сохраняют рабочий участок (CR-011 Test 4)", () => {
    const chart = renderUnifiedScreen([makeRootWithBranches()], "#orgChart", {});
    const svg = document.querySelector("#orgChart svg");

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );

    // collapse A: карточка A остаётся на месте
    const screenA0 = getScreenCenter("childA");
    chart.toggleCollapse("childA");
    const screenA1 = getScreenCenter("childA");
    expect(Math.abs(screenA1.x - screenA0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenA1.y - screenA0.y)).toBeLessThan(1e-6);

    // collapse B: карточка B остаётся на месте
    const screenB0 = getScreenCenter("childB");
    chart.toggleCollapse("childB");
    const screenB1 = getScreenCenter("childB");
    expect(Math.abs(screenB1.x - screenB0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenB1.y - screenB0.y)).toBeLessThan(1e-6);

    // expand A: пользователь остаётся в том же рабочем участке
    chart.toggleCollapse("childA");
    const screenA2 = getScreenCenter("childA");
    expect(Math.abs(screenA2.x - screenA0.x)).toBeLessThan(1e-6);
    expect(Math.abs(screenA2.y - screenA0.y)).toBeLessThan(1e-6);

    expect(parseTransform(getLayer().getAttribute("transform")).k).toBe(100);
  });

  it("новый root (новый renderer) по-прежнему использует initial fit (CR-011 §16)", () => {
    renderUnifiedScreen([makeRoot()], "#orgChart", {});
    const svgA = document.querySelector("#orgChart svg");
    svgA.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );
    expect(parseTransform(getLayer().getAttribute("transform")).k).toBe(100);

    // Выбор нового root → новый экземпляр renderer с пустым сохранённым
    // viewport: восстановление не применяется, сохраняется прежний initial fit.
    const chartB = renderUnifiedScreen([makeRoot()], "#orgChart", {});
    expect(parseTransform(getLayer().getAttribute("transform")).k).toBe(1);

    chartB.fit();
    expect(parseTransform(getLayer().getAttribute("transform")).k).toBeCloseTo(0.95, 5);
  });
});
