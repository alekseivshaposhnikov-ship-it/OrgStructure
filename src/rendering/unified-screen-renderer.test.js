import { describe, it, expect, beforeEach } from "vitest";
import { buildHoldingLeadershipTree } from "./holding-leadership.js";
import { buildConnectorPaths, assistantConnectorPath } from "./unified-screen-renderer.js";
import { NODE_ASSISTANT, NODE_DEPARTMENT } from "./unified-layout.js";

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

  // Корень Холдинга: дирекции верхнего уровня с вложенными отделами.
  function makeHoldingRoot() {
    return {
      department_guid: "synthetic-root",
      department_name: "Холдинг LEGENDA",
      department_manager: "Генеральный директор",
      department_manager_position: "CEO",
      staffCount: 0,
      users: [],
      children: [
        {
          department_guid: "dirA",
          department_name: "Дирекция A",
          department_manager: "А",
          department_manager_position: "Руководитель",
          staffCount: 0,
          users: [],
          children: [
            {
              department_guid: "deptA1",
              department_name: "Отдел A1",
              department_manager: "",
              department_manager_position: "",
              staffCount: 0,
              users: [],
              children: [],
            },
            {
              department_guid: "deptA2",
              department_name: "Отдел A2",
              department_manager: "",
              department_manager_position: "",
              staffCount: 0,
              users: [],
              children: [],
            },
          ],
        },
        {
          department_guid: "dirB",
          department_name: "Дирекция B",
          department_manager: "Б",
          department_manager_position: "Руководитель",
          staffCount: 0,
          users: [],
          children: [
            {
              department_guid: "deptB1",
              department_name: "Отдел B1",
              department_manager: "",
              department_manager_position: "",
              staffCount: 0,
              users: [],
              children: [],
            },
          ],
        },
        {
          department_guid: "dirC",
          department_name: "Дирекция C",
          department_manager: "В",
          department_manager_position: "Руководитель",
          staffCount: 0,
          users: [],
          children: [],
        },
      ],
    };
  }

  function nodeExists(nodeId) {
    return Boolean(document.querySelector(`g.unified-node[data-node-id="${nodeId}"]`));
  }

  // Минимальный корень Холдинга для проверки leadership-проекции (CR-013).
  function makeLeadershipHolding() {
    return {
      department_guid: "synthetic-root",
      department_name: "Холдинг LEGENDA",
      department_manager: "Селиванов Василий Геннадиевич",
      department_manager_position: "Генеральный директор",
      staffCount: 30,
      totalWithVacancies: 30,
      users: [],
      children: [
        {
          department_guid: "admin",
          department_name: "Администрация",
          staffCount: 4,
          totalWithVacancies: 4,
          users: [
            {
              id: "luk",
              full_name: "Лукьянов Алексей Александрович",
              email: "laa@legenda-dom.ru",
              position: "Операционный директор",
              rawPosition: "Операционный директор",
              subLevel: 1,
              typeEmployment: "Основное место работы",
              isVacancy: false,
            },
            {
              id: "vin",
              full_name: "Винник Лев Арнольдович",
              email: "l.vinnik@legenda-dom.ru",
              position: "Заместитель генерального директора по развитию",
              rawPosition: "Заместитель генерального директора по развитию",
              subLevel: 2,
              typeEmployment: "Основное место работы",
              isVacancy: false,
            },
            {
              id: "klu",
              full_name: "Клюев Алексей Васильевич",
              email: "avk@legenda-dom.ru",
              position: "Исполнительный директор",
              rawPosition: "Исполнительный директор",
              subLevel: 1,
              typeEmployment: "Основное место работы",
              isVacancy: false,
            },
            {
              id: "soydan",
              full_name: "Сойдан Айкут",
              email: "a.soydan@legenda-dom.ru",
              position: "Управляющий объектами коммерческой недвижимости",
              rawPosition: "Управляющий объектами коммерческой недвижимости",
              subLevel: 4,
              typeEmployment: "Основное место работы",
              isVacancy: false,
            },
            {
              id: "volkova",
              full_name: "Волкова Алина Викторовна",
              name: "Волкова Алина Викторовна",
              email: "a.volkova@legenda-dom.ru",
              position: "Персональный ассистент",
              rawPosition: "Персональный ассистент",
              subLevel: 6,
              typeEmployment: "Основное место работы",
              isVacancy: false,
            },
          ],
          children: [],
        },
        {
          department_guid: "dir-it",
          department_name: "Дирекция по информационным технологиям",
          staffCount: 10,
          totalWithVacancies: 10,
          users: [],
          children: [
            {
              department_guid: "dept-it1",
              department_name: "Отдел 1С",
              staffCount: 5,
              totalWithVacancies: 5,
              users: [],
              children: [],
            },
          ],
        },
        {
          department_guid: "dir-inv",
          department_name: "Дирекция по инвестициям",
          staffCount: 10,
          totalWithVacancies: 10,
          users: [],
          children: [],
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

  it("при выборе корня Холдинга видны только дирекции, их отделы свернуты (CR-012 Test 1)", () => {
    renderUnifiedScreen([makeHoldingRoot()], "#orgChart", { collapseTopLevel: true });

    // Корень и дирекции видны
    expect(nodeExists("synthetic-root")).toBe(true);
    expect(nodeExists("dirA")).toBe(true);
    expect(nodeExists("dirB")).toBe(true);
    expect(nodeExists("dirC")).toBe(true);

    // Дочерние уровни дирекций скрыты по умолчанию
    expect(nodeExists("deptA1")).toBe(false);
    expect(nodeExists("deptA2")).toBe(false);
    expect(nodeExists("deptB1")).toBe(false);
  });

  it("свернутые дирекции показывают standard toggle с состоянием collapsed (CR-012 §3)", () => {
    renderUnifiedScreen([makeHoldingRoot()], "#orgChart", { collapseTopLevel: true });

    const toggleText = document.querySelector(
      'g.unified-node[data-node-id="dirA"] .unified-node__toggle text',
    );
    expect(toggleText).toBeTruthy();
    expect(toggleText.textContent).toBe("+");
  });

  it("expand конкретной дирекции показывает только её ветку (CR-012 Test 2)", () => {
    const chart = renderUnifiedScreen([makeHoldingRoot()], "#orgChart", { collapseTopLevel: true });

    chart.toggleCollapse("dirA");

    expect(nodeExists("deptA1")).toBe(true);
    expect(nodeExists("deptA2")).toBe(true);
    // Остальные дирекции остаются свернутыми
    expect(nodeExists("deptB1")).toBe(false);
    expect(nodeExists("dirB")).toBe(true);
  });

  it("выбранная отдельно дирекция открывается по существующей логике (CR-012 Test 3)", () => {
    const directorate = makeHoldingRoot().children[0]; // Дирекция A
    renderUnifiedScreen([directorate], "#orgChart", {});

    expect(nodeExists("dirA")).toBe(true);
    expect(nodeExists("deptA1")).toBe(true);
    expect(nodeExists("deptA2")).toBe(true);
  });

  it("корень Холдинга без детей не падает (CR-012 Test 4)", () => {
    const chart = renderUnifiedScreen(
      [{ department_guid: "synthetic-root", department_name: "Холдинг", children: [] }],
      "#orgChart",
      { collapseTopLevel: true },
    );

    expect(chart).toBeTruthy();
    expect(nodeExists("synthetic-root")).toBe(true);
  });

  it("expand дирекции сохраняет zoom/pan и позицию якоря (CR-012 Test 5)", () => {
    const chart = renderUnifiedScreen([makeHoldingRoot()], "#orgChart", { collapseTopLevel: true });
    const svg = document.querySelector("#orgChart svg");

    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -6000, clientX: 500, clientY: 300, bubbles: true, cancelable: true }),
    );

    const before = getScreenCenter("dirA");

    chart.toggleCollapse("dirA");

    const after = getScreenCenter("dirA");
    expect(after.k).toBe(100);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  });

  it("leadership-проекция Холдинга рендерится: executives + дирекции (collapsed) (CR-013)", () => {
    const root = buildHoldingLeadershipTree(makeLeadershipHolding());
    const chart = renderUnifiedScreen([root], "#orgChart", {
      initialCollapsedIds: root.__initialCollapsedIds,
    });

    expect(chart).toBeTruthy();

    // Executive-карточки верхних руководителей.
    const executives = document.querySelectorAll('[data-node-type="executive"]');
    expect(executives.length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('[data-node-type="executive"]').textContent).toContain(
      "Лукьянов",
    );

    // Дирекции видимы (свёрнуты), их дети скрыты.
    expect(nodeExists("dir-it")).toBe(true);
    expect(nodeExists("dir-inv")).toBe(true);
    expect(nodeExists("dept-it1")).toBe(false);

    // Прямой подчинённый Клюева (Сойдан) отображается в колонке.
    expect(document.querySelector('[data-employee-id="soydan"]')).toBeTruthy();

    // Ассистент Селиванова — отдельная карточка с меткой ассистента.
    const assistantCard = document.querySelector('[data-employee-id="volkova"]');
    expect(assistantCard).toBeTruthy();
    expect(assistantCard.textContent).toContain("Волкова");
  });
});

describe("unified-screen-renderer · connector geometry (CR-014)", () => {
  // Минимальные layout-узлы для проверки connector paths.
  function makeLayoutNode(overrides = {}) {
    return {
      type: overrides.type || NODE_DEPARTMENT,
      x: overrides.x ?? 0,
      y: overrides.y ?? 0,
      width: overrides.width ?? 350,
      height: overrides.height ?? 130,
      ...overrides,
    };
  }

  it("main vertical stem существует для manager с children (CR-014 Test 73)", () => {
    const manager = makeLayoutNode({ x: 100, y: 100 });
    const childA = makeLayoutNode({ x: 40, y: 400, width: 200 });
    const childB = makeLayoutNode({ x: 280, y: 400, width: 200 });

    const paths = buildConnectorPaths([
      { parent: manager, child: childA },
      { parent: manager, child: childB },
    ]);

    const stemX = manager.x + manager.width / 2; // 275
    const parentBottom = manager.y + manager.height; // 230
    const childrenTop = 400;
    const junctionY = parentBottom + (childrenTop - parentBottom) / 2; // 315

    // Вертикальный stem от нижнего центра manager к junction.
    expect(paths.some((p) => p === `M ${stemX} ${parentBottom} L ${stemX} ${junctionY}`)).toBe(true);
    // Горизонтальная junction.
    expect(
      paths.some((p) => p.startsWith(`M ${40 + 100} ${junctionY} L ${280 + 100} ${junctionY}`)),
    ).toBe(true);
    // Drop-линии к детям.
    expect(paths.some((p) => p === `M ${40 + 100} ${junctionY} L ${40 + 100} ${400}`)).toBe(true);
  });

  it("junctionY находится в свободной зоне между parent и children (CR-014 Test 74)", () => {
    const manager = makeLayoutNode({ x: 100, y: 100 });
    const children = [0, 1, 2].map((i) => makeLayoutNode({ x: 40 + i * 240, y: 500, width: 200 }));

    const paths = buildConnectorPaths(children.map((child) => ({ parent: manager, child })));

    const parentBottom = manager.y + manager.height;
    const childrenTop = 500;
    // Вертикальный stem: его нижняя точка — junctionY, лежит между parentBottom и childrenTop.
    const stem = paths.find((p) => p.startsWith(`M ${manager.x + manager.width / 2} ${parentBottom} L`));
    expect(stem).toBeTruthy();
    const junctionY = Number(stem.split(" L ")[1].split(" ")[1]);
    expect(junctionY).toBeGreaterThan(parentBottom);
    expect(junctionY).toBeLessThan(childrenTop);
  });

  it("assistant connector отделён от organizational connector (CR-014 Test 75)", () => {
    const manager = makeLayoutNode({ x: 100, y: 100 });
    const assistant = makeLayoutNode({
      type: NODE_ASSISTANT,
      x: manager.x + manager.width + 16,
      y: manager.y + manager.height + 12,
      width: 240,
      height: 44,
    });
    const childA = makeLayoutNode({ x: 40, y: 400, width: 200 });

    const paths = buildConnectorPaths([
      { parent: manager, child: assistant },
      { parent: manager, child: childA },
    ]);

    // Отдельная assistant-связь от нижней границы manager справа.
    const expectedAssistant = assistantConnectorPath(manager, assistant);
    expect(paths).toContain(expectedAssistant);
    expect(expectedAssistant.startsWith(`M ${manager.x + manager.width - 16} ${manager.y + manager.height}`)).toBe(true);
    expect(expectedAssistant.endsWith(`L ${assistant.x + assistant.width / 2} ${assistant.y}`)).toBe(true);

    // Organizational children имеют main stem от центра manager.
    const stemX = manager.x + manager.width / 2;
    const parentBottom = manager.y + manager.height;
    const junctionY = parentBottom + (400 - parentBottom) / 2;
    expect(paths.some((p) => p === `M ${stemX} ${parentBottom} L ${stemX} ${junctionY}`)).toBe(true);
  });

  it("toggle controls имеют стабильный baseline для siblings (CR-014 Test 77)", async () => {
    const mod = await import("./unified-screen-renderer.js");
    const renderFn = mod.renderUnifiedScreen;
    const root = {
      department_guid: "root",
      department_name: "ROOT",
      department_manager: "Manager",
      users: [],
      children: [
        {
          department_guid: "a",
          department_name: "A",
          staffCount: 1,
          users: [],
          children: [{ department_guid: "a1", department_name: "A1", staffCount: 1, users: [], children: [] }],
        },
        {
          department_guid: "b",
          department_name: "B",
          staffCount: 1,
          users: [],
          children: [{ department_guid: "b1", department_name: "B1", staffCount: 1, users: [], children: [] }],
        },
      ],
    };
    renderFn([root], "#orgChart", {});

    // Toggle-кнопки у A и B (row 1) — общий baseline по Y.
    const toggles = document.querySelectorAll("g.unified-node__toggle");
    const ys = Array.from(toggles)
      .filter((t) => {
        const nodeId = t.parentElement.getAttribute("data-node-id");
        return nodeId === "a" || nodeId === "b";
      })
      .map((t) => {
        const group = t.parentElement;
        const nodeTranslate = group.getAttribute("transform").match(/translate\(([-\d.e]+),([-\d.e]+)\)/);
        const toggleTranslate = t.getAttribute("transform").match(/translate\(([-\d.e]+),([-\d.e]+)\)/);
        return parseFloat(nodeTranslate[2]) + parseFloat(toggleTranslate[2]);
      });

    expect(ys.length).toBeGreaterThanOrEqual(2);
    ys.forEach((y) => {
      expect(Math.abs(y - ys[0])).toBeLessThanOrEqual(1e-6);
    });
  });
});

