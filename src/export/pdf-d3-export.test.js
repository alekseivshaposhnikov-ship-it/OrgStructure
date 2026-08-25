import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installSvgToPdfMocks, restoreSvgToPdfMocks } from "../test-utils.js";
import * as unifiedLayout from "../rendering/unified-layout.js";

const {
  exportOrgChartToPdf,
  exportCompactA4ToPdf,
  renderUnifiedLayoutToPdf,
  computePdfLayoutMetrics,
  buildPdfLayout,
  aggregateUsersToRoles,
  prepareRolesTree,
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
  return unifiedLayout.computeUnifiedLayout(root, PDF_LAYOUT_OPTIONS);
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

      const layout = unifiedLayout.computeUnifiedLayout(root, {
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

  describe("PDF export: showVacancies (CR-003-01)", () => {
    function rootWithVacancy() {
      return dept("root", "Root", {
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
    }

    function hasVacancyPersons(layout) {
      return layout.nodes.some(
        (node) => node.type === "employees" && node.persons.some((person) => person.data.isVacancy),
      );
    }

    it("Test 1: showVacancies=true — вакансии присутствуют в PDF layout и SVG", () => {
      const layout = buildPdfLayout(rootWithVacancy(), { showVacancies: true });

      expect(hasVacancyPersons(layout)).toBe(true);

      const svg = renderUnifiedLayoutToPdf(layout, { showVacancies: true });
      expect(svg.querySelector('g[data-node-id="vac1"]')).toBeTruthy();
    });

    it("Test 2: showVacancies=false — вакансии отсутствуют в PDF layout и SVG", () => {
      const layout = buildPdfLayout(rootWithVacancy(), { showVacancies: false });

      expect(hasVacancyPersons(layout)).toBe(false);

      const svg = renderUnifiedLayoutToPdf(layout, { showVacancies: false });
      expect(svg.querySelector('g[data-node-id="vac1"]')).toBeNull();
    });

    it("exportOrgChartToPdf передаёт фактическое showVacancies в computeUnifiedLayout, а не hardcoded true", async () => {
      installSvgToPdfMocks();
      const spy = vi.spyOn(unifiedLayout, "computeUnifiedLayout");

      try {
        await exportOrgChartToPdf({
          rootNodes: [rootWithVacancy()],
          showVacancies: false,
        });

        expect(spy).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ showVacancies: false }),
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("PDF export: role aggregation «без фамилий» (CR-003-02)", () => {
    function makeUsers(positions) {
      return positions.map((position, index) => ({
        id: `u${index}`,
        full_name: `Сотрудник ${index}`,
        name: `Сотрудник ${index}`,
        position,
        rawPosition: position,
        subLevel: undefined,
        isVacancy: false,
        project: "",
        scenarioState: "",
      }));
    }

    it("Test 1: 3 «Специалист» → одна role row «Специалист ×3»", () => {
      const roles = aggregateUsersToRoles(
        makeUsers(["Специалист", "Специалист", "Специалист"]),
        {},
      );

      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ position: "Специалист", count: 3, vacancyCount: 0 });

      // В SVG-рендере — одна роль с количеством ×3.
      const root = dept("root", "Root", {
        children: [
          dept("A", "Department A", {
            users: makeUsers(["Специалист", "Специалист", "Специалист"]),
          }),
        ],
      });
      const layout = buildPdfLayout(prepareRolesTree(root, true), {
        employeeHeight: 20,
        personGap: 2,
      });
      const svg = renderUnifiedLayoutToPdf(layout, {
        hideNames: true,
        employeeMode: "roles",
      });

      const roleRows = svg.querySelectorAll("g[data-role='Специалист']");
      expect(roleRows.length).toBe(1);
      const texts = Array.from(svg.querySelectorAll("text")).map((t) => t.textContent || "");
      expect(texts).toContain("×3");
    });

    it("Test 2: Специалист ×3 и Ведущий специалист ×2 → 2 unique role rows", () => {
      const roles = aggregateUsersToRoles(
        makeUsers([
          "Специалист",
          "Специалист",
          "Специалист",
          "Ведущий специалист",
          "Ведущий специалист",
        ]),
        {},
      );

      expect(roles).toHaveLength(2);
      const byPosition = Object.fromEntries(roles.map((r) => [r.position, r.count]));
      expect(byPosition["Специалист"]).toBe(3);
      expect(byPosition["Ведущий специалист"]).toBe(2);
    });

    it("Test 3: руководитель не дублируется в role summary", () => {
      const users = [
        user("head", "Иванова Ирина Петровна", { position: "Руководитель отдела" }),
        ...makeUsers(["Специалист", "Специалист"]),
      ];

      const roles = aggregateUsersToRoles(users, {
        headName: "Иванова Ирина Петровна",
      });

      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ position: "Специалист", count: 2 });
    });

    it("Test 4: сотрудники дочернего подразделения не попадают в role summary родителя", () => {
      const root = dept("root", "Root", {
        users: makeUsers(["Специалист"]),
        children: [
          dept("A", "Department A", {
            users: makeUsers(["Ведущий специалист", "Главный специалист"]),
          }),
        ],
      });

      const layout = buildPdfLayout(prepareRolesTree(root, true), {
        employeeHeight: 20,
        personGap: 2,
      });

      const departmentA = layout.nodes.find((n) => n.data && n.data.id === "A");
      const rootEmployees = layout.nodes.find((n) => n.type === "employees" && n.y < departmentA.y);
      const roles = rootEmployees.persons.map((p) => p.data.position);
      expect(roles).toContain("Специалист");
      expect(roles).not.toContain("Ведущий специалист");
      expect(roles).not.toContain("Главный специалист");
    });

    it("Test 5: showVacancies=false → вакансии отсутствуют в role summary", () => {
      const users = [
        ...makeUsers(["Специалист"]),
        {
          id: "vac1",
          full_name: "Вакансия",
          name: "Вакансия",
          position: "Аналитик",
          rawPosition: "Аналитик",
          isVacancy: true,
          project: "",
          scenarioState: "",
        },
      ];

      const roles = aggregateUsersToRoles(users, { showVacancies: false });

      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ position: "Специалист", count: 1, vacancyCount: 0 });
    });

    it("Test 6: showVacancies=true → вакансии учитываются в role summary", () => {
      const users = [
        ...makeUsers(["Специалист", "Специалист"]),
        {
          id: "vac1",
          full_name: "Вакансия",
          name: "Вакансия",
          position: "Специалист",
          rawPosition: "Специалист",
          isVacancy: true,
          project: "",
          scenarioState: "",
        },
      ];

      const roles = aggregateUsersToRoles(users, { showVacancies: true });

      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ position: "Специалист", count: 2, vacancyCount: 1 });
    });

    it("Test 7: hideNames=false не включает role aggregation", () => {
      const root = dept("root", "Root", {
        users: makeUsers(["Специалист", "Специалист", "Ведущий специалист"]),
      });

      const layout = buildPdfLayout(root, PDF_LAYOUT_OPTIONS);
      const employees = layout.nodes.find((n) => n.type === "employees");

      expect(employees.persons).toHaveLength(3);
      employees.persons.forEach((person) => {
        expect(person.data.roleCount).toBeUndefined();
      });
    });

    it("Test 8: hideNames=true включает role aggregation", () => {
      const root = dept("root", "Root", {
        users: makeUsers(["Специалист", "Специалист", "Ведущий специалист"]),
      });

      const layout = buildPdfLayout(prepareRolesTree(root, true), {
        employeeHeight: 20,
        personGap: 2,
      });
      const employees = layout.nodes.find((n) => n.type === "employees");

      expect(employees.persons).toHaveLength(2);
      const roles = employees.persons.map((p) => ({
        position: p.data.position,
        count: p.data.roleCount,
      }));
      expect(roles).toContainEqual({ position: "Ведущий специалист", count: 1 });
      expect(roles).toContainEqual({ position: "Специалист", count: 2 });
    });

    it("Test 9: высота employee content для 20 сотрудников / 4 ролей существенно меньше detailed", () => {
      const positions = [
        ...Array(5).fill("Главный специалист"),
        ...Array(3).fill("Ведущий специалист"),
        ...Array(8).fill("Специалист"),
        ...Array(4).fill("Аналитик"),
      ];
      const root = dept("root", "Root", { users: makeUsers(positions) });

      const detailedLayout = buildPdfLayout(root, PDF_LAYOUT_OPTIONS);
      const rolesLayout = buildPdfLayout(prepareRolesTree(root, true), {
        employeeHeight: 20,
        personGap: 2,
      });

      const detailedHeight = detailedLayout.nodes.find((n) => n.type === "employees").height;
      const rolesHeight = rolesLayout.nodes.find((n) => n.type === "employees").height;

      expect(rolesHeight).toBeLessThan(detailedHeight / 3);
    });
  });
});
