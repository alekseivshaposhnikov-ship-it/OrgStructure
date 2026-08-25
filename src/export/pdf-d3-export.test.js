import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installSvgToPdfMocks, restoreSvgToPdfMocks } from "../test-utils.js";
import { computeUnifiedLayout } from "../rendering/unified-layout.js";

const {
  exportOrgChartToPdf,
  exportCompactA4ToPdf,
  renderUnifiedLayoutToPdf,
  computePdfLayoutMetrics,
  PDF_LAYOUT_OPTIONS,
} = await import("./pdf-d3-export.js");

function dept(id, name, overrides = {}) {
  return {
    department_guid: id,
    department_name: name,
    department_manager: overrides.manager || "",
    department_manager_position: overrides.managerPosition || "",
    manager_sub_level: overrides.managerSubLevel,
    staffCount: overrides.staffCount ?? 0,
    vacancyCount: overrides.vacancyCount ?? 0,
    totalWithVacancies: overrides.totalWithVacancies ?? 0,
    users: overrides.users || [],
    children: overrides.children || [],
    scenarioState: overrides.scenarioState || "",
  };
}

function user(id, name, overrides = {}) {
  return {
    id,
    full_name: name,
    name,
    position: overrides.position || "Сотрудник",
    rawPosition: overrides.position || "Сотрудник",
    subLevel: overrides.subLevel,
    isVacancy: false,
    project: overrides.project || "",
    scenarioState: "",
  };
}

function parseTranslate(transform) {
  const match = /translate\((-?[\d.]+),\s*(-?[\d.]+)\)/.exec(transform || "");
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function buildLayout(root) {
  return computeUnifiedLayout(root, PDF_LAYOUT_OPTIONS);
}

function byId(nodes, id) {
  return nodes.find((n) => n.data && n.data.id === id);
}

// Fixture (CR-003 §31):
// Root
// ├── A ├── employees
// │    └── A1 └── employees
// ├── B └── employees
// └── C ├── employees
//      └── C1 └── employees
function makeStructureRoot() {
  return dept("root", "Root", {
    children: [
      dept("A", "Department A", {
        managerSubLevel: 1,
        users: [user("u-a", "Иван", { position: "Руководитель A" })],
        children: [
          dept("A1", "Department A1", {
            managerSubLevel: 2,
            users: [user("u-a1", "Пётр")],
          }),
        ],
      }),
      dept("B", "Department B", {
        managerSubLevel: 1,
        users: [user("u-b", "Мария")],
      }),
      dept("C", "Department C", {
        managerSubLevel: 1,
        users: [user("u-c", "Анна")],
        children: [
          dept("C1", "Department C1", {
            managerSubLevel: 2,
            users: [user("u-c1", "Ольга")],
          }),
        ],
      }),
    ],
  });
}

// IT-кейс (CR-003 §29, §32): шесть непосредственных подразделений
// с уровнями 4.0 / 4.1 / null должны находиться на одной строке.
function makeItRoot() {
  return dept("it", "Дирекция по информационным технологиям", {
    children: [
      dept("1c", "Отдел 1С программирования", { managerSubLevel: 4 }),
      dept("web", "Отдел веб-разработки", { managerSubLevel: 4.1 }),
      dept("moscow", "Отдел информационных технологий в г. Москве", { managerSubLevel: 4.0 }),
      dept("infra", "Отдел инфраструктурных решений", {}),
      dept("digital", "Отдел развития цифровых платформ", { managerSubLevel: 4 }),
      dept("po", "Проектный офис", {}),
    ],
  });
}

describe("pdf-d3-export.js", () => {
  beforeEach(() => {
    vi.stubGlobal("alert", vi.fn());
    document.body.innerHTML = "";
  });

  afterEach(() => {
    restoreSvgToPdfMocks();
  });

  function makeRoot() {
    return {
      department_guid: "root",
      department_name: "Холдинг",
      staffCount: 5,
      vacancyCount: 1,
      totalWithVacancies: 6,
      children: [],
      users: [],
    };
  }

  describe("exportOrgChartToPdf", () => {
    it("должен вызывать alert при пустом rootNodes", async () => {
      await exportOrgChartToPdf({ rootNodes: [] });

      expect(alert).toHaveBeenCalledWith("Нет диаграммы для экспорта");
    });

    it("должен корректно обрабатывать данные с одним корнем", async () => {
      installSvgToPdfMocks();

      await expect(
        exportOrgChartToPdf({
          rootNodes: [makeRoot()],
          title: "Тест",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("exportCompactA4ToPdf", () => {
    it("должен вызывать alert при пустом rootNodes", async () => {
      await exportCompactA4ToPdf({ rootNodes: [] });

      expect(alert).toHaveBeenCalledWith("Нет диаграммы для экспорта");
    });

    it("должен обрабатывать данные с одним корнем (компактный путь)", async () => {
      installSvgToPdfMocks();

      await expect(
        exportCompactA4ToPdf({
          rootNodes: [makeRoot()],
          title: "Тест",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("computePdfLayoutMetrics (CR-003 §19-21)", () => {
    it("по умолчанию страница = содержимое + header, масштаб 1", () => {
      const metrics = computePdfLayoutMetrics({ width: 1000, height: 500 });

      expect(metrics.pageWidth).toBe(1000);
      expect(metrics.pageHeight).toBe(124 + 500);
      expect(metrics.scale).toBe(1);
      expect(metrics.offsetX).toBe(0);
      expect(metrics.offsetY).toBe(124);
    });

    it("на фиксированной странице применяет единый scale и центрирует схему", () => {
      const metrics = computePdfLayoutMetrics(
        { width: 500, height: 300 },
        { pageWidth: 1122, pageHeight: 794 },
      );

      const expectedScale = Math.min(1122 / 500, (794 - 124) / 300);
      expect(metrics.scale).toBeCloseTo(expectedScale, 5);
      expect(metrics.offsetX).toBeCloseTo((1122 - 500 * expectedScale) / 2, 5);
      expect(metrics.offsetY).toBeCloseTo(124 + (794 - 124 - 300 * expectedScale) / 2, 5);
    });
  });

  describe("renderUnifiedLayoutToPdf — Screen Layout = PDF Layout (CR-003 §30)", () => {
    it("рисует карточки ровно по координатам computeUnifiedLayout, не пересчитывая layout", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, { title: "Структура" });

      const departmentNodes = layout.nodes.filter((n) => n.type === "department");

      departmentNodes.forEach((node) => {
        const group = svg.querySelector(`g[data-node-id="${node.data.id}"]`);
        expect(group, `карточка ${node.data.id} должна существовать в SVG`).toBeTruthy();

        const transform = parseTranslate(group.getAttribute("transform"));
        expect(transform.x, `x карточки ${node.data.id}`).toBe(node.x);
        expect(transform.y, `y карточки ${node.data.id}`).toBe(node.y);
      });
    });

    it("Test 1: A, B и C находятся на одной горизонтальной строке", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      expect(byId(layout.nodes, "A").row).toBe(byId(layout.nodes, "B").row);
      expect(byId(layout.nodes, "B").row).toBe(byId(layout.nodes, "C").row);

      const yA = parseTranslate(
        svg.querySelector('g[data-node-id="A"]').getAttribute("transform"),
      ).y;
      const yB = parseTranslate(
        svg.querySelector('g[data-node-id="B"]').getAttribute("transform"),
      ).y;
      const yC = parseTranslate(
        svg.querySelector('g[data-node-id="C"]').getAttribute("transform"),
      ).y;

      expect(yA).toBe(yB);
      expect(yB).toBe(yC);
    });

    it("Test 2: A1 и C1 находятся ниже своих реальных parent (A и C)", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const card = (id) =>
        parseTranslate(svg.querySelector(`g[data-node-id="${id}"]`).getAttribute("transform"));

      expect(card("A1").y).toBeGreaterThan(card("A").y);
      expect(card("C1").y).toBeGreaterThan(card("C").y);
    });

    it("Test 3: employee columns сохраняются как колонки, а не как organizational rows", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const columns = svg.querySelectorAll("g.pdf-employees-column");
      expect(columns.length).toBeGreaterThanOrEqual(3);

      // Внутри колонки — карточки сотрудников, а не department-уровни.
      columns.forEach((column) => {
        const persons = column.querySelectorAll("g[data-node-id]");
        expect(persons.length).toBeGreaterThan(0);
      });

      // Сотрудник не рисуется как отдельная department-карточка верхнего уровня.
      const topLevelPerson = svg.querySelector('g[data-node-id="u-a"]');
      expect(topLevelPerson).toBeTruthy();
      const column = topLevelPerson.closest("g.pdf-employees-column");
      expect(column).toBeTruthy();
    });

    it("Test 4: дочерние подразделения остаются под своими реальными parent (parentId не меняется)", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const card = (id) =>
        parseTranslate(svg.querySelector(`g[data-node-id="${id}"]`).getAttribute("transform"));

      // A1 ближе к A, чем к B (не переставлен к другому родителю)
      expect(Math.abs(card("A1").x - card("A").x)).toBeLessThan(
        Math.abs(card("A1").x - card("B").x),
      );
      expect(Math.abs(card("C1").x - card("C").x)).toBeLessThan(
        Math.abs(card("C1").x - card("B").x),
      );
    });

    it("Test 5: relative X (effectiveLayoutLevel) не пересчитывается PDF", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const card = (id) =>
        parseTranslate(svg.querySelector(`g[data-node-id="${id}"]`).getAttribute("transform"));

      // Порядок по X совпадает с порядком sibling-подразделений
      expect(card("A").x).toBeLessThan(card("B").x);
      expect(card("B").x).toBeLessThan(card("C").x);
    });

    it("Test 6: PDF не рассчитывает собственный row — координаты из layout", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const a1 = byId(layout.nodes, "A1");
      const group = svg.querySelector('g[data-node-id="A1"]');
      const transform = parseTranslate(group.getAttribute("transform"));

      expect(transform.y).toBe(a1.y);
      expect(a1.row).toBe(2);
    });

    it("hideNames скрывает имена сотрудников (режим «PDF без фамилий»)", () => {
      const layout = buildLayout(makeStructureRoot());
      const svg = renderUnifiedLayoutToPdf(layout, { hideNames: true });

      const texts = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent || "");
      expect(texts.some((t) => /Иван|Пётр|Мария|Анна|Ольга/.test(t))).toBe(false);
    });

    it("showVacancies=false скрывает вакансии из employee columns", () => {
      const root = dept("root", "Root", {
        children: [
          dept("A", "Department A", {
            users: [
              user("u1", "Иван"),
              {
                id: "vac1",
                full_name: "",
                name: "",
                position: "Аналитик",
                rawPosition: "Аналитик",
                isVacancy: true,
                project: "",
                scenarioState: "",
              },
            ],
          }),
        ],
      });

      const layout = computeUnifiedLayout(root, {
        ...PDF_LAYOUT_OPTIONS,
        showVacancies: false,
      });
      const svg = renderUnifiedLayoutToPdf(layout, { showVacancies: false });

      expect(svg.querySelector('g[data-node-id="vac1"]')).toBeNull();
      expect(svg.querySelector('g[data-node-id="u1"]')).toBeTruthy();
    });
  });

  describe("IT-кейс: Дирекция по информационным технологиям (CR-003 §32)", () => {
    it("шесть непосредственных подразделений с уровнями 4.0/4.1/null находятся на одной строке", () => {
      const layout = buildLayout(makeItRoot());
      const svg = renderUnifiedLayoutToPdf(layout, {});

      const ids = ["1c", "web", "moscow", "infra", "digital", "po"];
      const rows = ids.map((id) => byId(layout.nodes, id).row);
      expect(new Set(rows).size).toBe(1);

      const yValues = ids.map((id) => {
        const group = svg.querySelector(`g[data-node-id="${id}"]`);
        return parseTranslate(group.getAttribute("transform")).y;
      });
      expect(new Set(yValues).size).toBe(1);
    });
  });
});
