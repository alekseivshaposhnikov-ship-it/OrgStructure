import { describe, it, expect } from "vitest";
import {
  computeUnifiedLayout,
  normalizeManagementLevel,
  NODE_DEPARTMENT,
  NODE_EMPLOYEES,
  NODE_ASSISTANT,
} from "./unified-layout.js";

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
    ...(overrides.pdfRoles ? { pdfRoles: overrides.pdfRoles } : {}),
    // Остальные presentation-поля (keepFullName, __person, __assistant и т.п.).
    ...overrides,
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
    scenarioState: "",
  };
}

function byId(nodes, id) {
  return nodes.find((n) => n.data && n.data.id === id);
}

describe("unified-layout", () => {
  it("должен располагать siblings в одной строке (X различается, row одинаковый)", () => {
    const root = dept("root", "ROOT", {
      children: [dept("A", "A"), dept("B", "B"), dept("C", "C")],
    });
    const { nodes } = computeUnifiedLayout(root);

    const a = byId(nodes, "A");
    const b = byId(nodes, "B");
    const c = byId(nodes, "C");

    expect(a.row).toBe(b.row);
    expect(b.row).toBe(c.row);
    expect(a.x).not.toBe(b.x);
    expect(b.x).not.toBe(c.x);
  });

  it("должен выравнивать подразделения с одинаковым sub_level по Y", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 2,
      children: [
        dept("A", "A", { managerSubLevel: 3, children: [dept("A1", "A1", { managerSubLevel: 4 })] }),
        dept("B", "B", { managerSubLevel: 3, children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    expect(byId(nodes, "A").y).toBe(byId(nodes, "B").y);
    expect(byId(nodes, "A1").y).toBe(byId(nodes, "B1").y);
  });

  it("должен сохранять parentId иерархию (A→A1, B→B1)", () => {
    const root = dept("root", "ROOT", {
      children: [
        dept("A", "A", { children: [dept("A1", "A1"), dept("A2", "A2")] }),
        dept("B", "B", { children: [dept("B1", "B1"), dept("B2", "B2")] }),
      ],
    });
    const { edges } = computeUnifiedLayout(root);

    const edgeKeys = edges
      .filter((e) => e.parent.type === NODE_DEPARTMENT && e.child.type === NODE_DEPARTMENT)
      .map((e) => `${e.parent.data.id}->${e.child.data.id}`);

    expect(edgeKeys).toContain("A->A1");
    expect(edgeKeys).toContain("A->A2");
    expect(edgeKeys).toContain("B->B1");
    expect(edgeKeys).toContain("B->B2");
    expect(edgeKeys).not.toContain("A->B1");
  });

  it("должен использовать fallback (уровень родителя + 1) при отсутствии sub_level", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 2,
      children: [
        dept("A", "A", { managerSubLevel: 3 }),
        dept("B", "B", {}), // нет sub_level
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    expect(byId(nodes, "B").row).toBe(byId(nodes, "A").row);
  });

  it("должен создавать колонку сотрудников отдельным узлом", () => {
    const root = dept("root", "ROOT", {
      users: [user("u1", "Иван Иванов"), user("u2", "Петр Петров")],
      children: [dept("A", "A")],
    });
    const { tree } = computeUnifiedLayout(root);

    const employeesNode = tree.children.find((c) => c.type === NODE_EMPLOYEES);
    expect(employeesNode).toBeTruthy();
    expect(employeesNode.persons).toHaveLength(2);
  });

  it("должен не создавать пустых уровней над выбранным вложенным подразделением", () => {
    const nested = dept("A1", "A1", {
      managerSubLevel: 4,
      users: [user("u1", "Иван Иванов")],
    });
    const { tree, nodes } = computeUnifiedLayout(nested);

    expect(tree.data.id).toBe("A1");
    expect(tree.row).toBe(0);
    expect(byId(nodes, "A1").y).toBe(byId(nodes, "A1").y);
  });

  it("должен не смешивать ветки при одинаковом sub_level (A1/A2 в диапазоне A, B1 в диапазоне B)", () => {
    const root = dept("root", "ROOT", {
      children: [
        dept("A", "A", {
          children: [
            dept("A1", "A1", { managerSubLevel: 4 }),
            dept("A2", "A2", { managerSubLevel: 4 }),
          ],
        }),
        dept("B", "B", { children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const a1 = byId(nodes, "A1");
    const a2 = byId(nodes, "A2");
    const b1 = byId(nodes, "B1");

    // Одинаковый Y (sub_level), но X-диапазоны веток не пересекаются
    expect(a1.y).toBe(a2.y);
    expect(a1.y).toBe(b1.y);

    const aRight = Math.max(a1.x + a1.width, a2.x + a2.width);
    const bLeft = b1.x;
    expect(aRight).toBeLessThanOrEqual(bLeft);
  });

  it("не должен падать при дробном sub_level и выравнивать одинаковые уровни по Y", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 2,
      children: [
        dept("A", "A", { managerSubLevel: 3.5 }),
        dept("B", "B", { managerSubLevel: 3.5 }),
        dept("C", "C", { managerSubLevel: 4 }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    expect(byId(nodes, "A").y).toBe(byId(nodes, "B").y);
    expect(byId(nodes, "A").y).not.toBe(byId(nodes, "C").y);
  });

  it("Y следующего уровня не зависит от числа сотрудников в другой ветке", () => {
    const make = (n) => dept("root", "ROOT", { managerSubLevel: 2, children: [
      dept("A", "A", { managerSubLevel: 3, users: Array.from({ length: n }, (_, i) => user("u" + i, "Emp " + i)) }),
      dept("B", "B", { managerSubLevel: 3, children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
    ] });
    const y1 = byId(computeUnifiedLayout(make(1)).nodes, "B1").y;
    const y20 = byId(computeUnifiedLayout(make(20)).nodes, "B1").y;
    expect(y20).toBe(y1);
  });

  it("employee-column не пересекается с дочерними подразделениями", () => {
    const root = dept("root", "ROOT", { managerSubLevel: 2,
      users: [user("u1", "Emp 1"), user("u2", "Emp 2"), user("u3", "Emp 3")],
      children: [dept("A1", "A1", { managerSubLevel: 3 })],
    });
    const { tree, nodes } = computeUnifiedLayout(root);
    const emp = tree.children.find((c) => c.type === NODE_EMPLOYEES);
    expect(emp).toBeTruthy();
    expect(emp.y).toBe(tree.y + tree.height + 30);
    const a1 = byId(nodes, "A1");
    expect(emp.x + emp.width).toBeLessThanOrEqual(a1.x);
  });

  it("ассистент не влияет на строки подразделений", () => {
    const withAst = dept("root", "ROOT", { managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: [
        dept("A", "A", { managerSubLevel: 3 }),
        dept("B", "B", { managerSubLevel: 3, children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
      ],
    });
    const noAst = dept("root", "ROOT", { managerSubLevel: 2,
      children: [
        dept("A", "A", { managerSubLevel: 3 }),
        dept("B", "B", { managerSubLevel: 3, children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
      ],
    });
    // CR-013_assistant_fix2: assistant не создаёт новый row/level (row не меняется),
    // но резервирует вертикальное место — Y следующего уровня может сместиться.
    const rowWith = byId(computeUnifiedLayout(withAst).nodes, "B1").row;
    const rowNo = byId(computeUnifiedLayout(noAst).nodes, "B1").row;
    expect(rowWith).toBe(rowNo);
  });

  it("collapsed department не влияет на соседние ветки", () => {
    const root = dept("root", "ROOT", { managerSubLevel: 2, children: [
      dept("A", "A", { managerSubLevel: 3, children: [dept("A1", "A1", { managerSubLevel: 4 })] }),
      dept("B", "B", { managerSubLevel: 3, children: [dept("B1", "B1", { managerSubLevel: 4 })] }),
    ] });
    const { nodes } = computeUnifiedLayout(root, { collapsedIds: new Set(["A"]) });
    expect(byId(nodes, "A1")).toBeUndefined();
    expect(byId(nodes, "B1")).toBeTruthy();
  });

  describe("CR-008_2_2: effectiveLayoutLevel и sibling-группы", () => {
    function makeItStructure() {
      // Реальная структура Дирекции IT: 4 siblings с sub_level=4, 2 без уровня
      return dept("root", "Дирекция IT", {
        children: [
          dept("oneC", "1С", { managerSubLevel: 4 }),
          dept("web", "Web", {}),
          dept("moscow", "Москва", { managerSubLevel: 4 }),
          dept("infra", "Инфраструктура", { managerSubLevel: 4 }),
          dept("digital", "Цифровые платформы", {}),
          dept("office", "Проектный офис", { managerSubLevel: 4 }),
        ],
      });
    }

    it("шесть непосредственных детей Дирекции IT получают одинаковые row и y", () => {
      const { nodes } = computeUnifiedLayout(makeItStructure());

      const ids = ["oneC", "web", "moscow", "infra", "digital", "office"];
      const rows = ids.map((id) => byId(nodes, id).row);
      const ys = ids.map((id) => byId(nodes, id).y);

      expect(new Set(rows).size).toBe(1);
      expect(new Set(ys).size).toBe(1);
    });

    it("null-уровни получают mode sibling-группы (4), actual остаётся null", () => {
      const { nodes } = computeUnifiedLayout(makeItStructure());

      const web = byId(nodes, "web");
      const digital = byId(nodes, "digital");

      expect(web.actualManagerSubLevel).toBeNull();
      expect(web.effectiveLayoutLevel).toBe(4);
      expect(digital.effectiveLayoutLevel).toBe(4);

      // Реальный managerSubLevel не перезаписывается
      expect(web.data.managerSubLevel).toBeUndefined();
      expect(web.data.effectiveLayoutLevel).toBe(4);
    });

    it("calculated fallback не меняет actual managerSubLevel у узла с уровнем", () => {
      const { nodes } = computeUnifiedLayout(makeItStructure());

      const oneC = byId(nodes, "oneC");
      expect(oneC.actualManagerSubLevel).toBe(4);
      expect(oneC.effectiveLayoutLevel).toBe(4);
      expect(oneC.data.managerSubLevel).toBe(4);
    });

    it("parent-child hierarchy не меняется", () => {
      const { edges } = computeUnifiedLayout(makeItStructure());

      const childIds = edges
        .filter((e) => e.parent.data.id === "root" && e.child.type === NODE_DEPARTMENT)
        .map((e) => e.child.data.id)
        .sort();

      expect(childIds).toEqual(["digital", "infra", "moscow", "office", "oneC", "web"].sort());
    });

    it("employee nodes не влияют на sibling level", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4, users: [user("u1", "Emp 1")] }),
          dept("B", "B", {}),
          dept("C", "C", { managerSubLevel: 4 }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "B").effectiveLayoutLevel).toBe(4);
      expect(byId(nodes, "A").row).toBe(byId(nodes, "B").row);
    });

    it("выбранный root всегда row 0 независимо от его sub_level", () => {
      const withLevel = dept("root", "ROOT", {
        managerSubLevel: 7,
        children: [dept("A", "A", { managerSubLevel: 4 })],
      });
      const withoutLevel = dept("root2", "ROOT", {
        children: [dept("A", "A", { managerSubLevel: 4 })],
      });

      const { tree: treeWith } = computeUnifiedLayout(withLevel);
      const { tree: treeWithout } = computeUnifiedLayout(withoutLevel);

      expect(treeWith.row).toBe(0);
      expect(treeWithout.row).toBe(0);
    });

    it("null получает mode (4) при уровнях [4,4,5,null]", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4 }),
          dept("B", "B", { managerSubLevel: 4 }),
          dept("C", "C", { managerSubLevel: 5 }),
          dept("D", "D", {}),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "D").effectiveLayoutLevel).toBe(4);
    });

    it("при неоднозначном mode (4,4,5,5,null) null получает минимальный уровень 4", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4 }),
          dept("B", "B", { managerSubLevel: 4 }),
          dept("C", "C", { managerSubLevel: 5 }),
          dept("D", "D", { managerSubLevel: 5 }),
          dept("E", "E", {}),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "E").effectiveLayoutLevel).toBe(4);
    });

    it("если ни у одного sibling нет уровня — parent.effectiveLayoutLevel + 1", () => {
      const root = dept("root", "ROOT", {
        managerSubLevel: 3,
        children: [dept("A", "A", {}), dept("B", "B", {})],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "A").effectiveLayoutLevel).toBe(4);
      expect(byId(nodes, "B").effectiveLayoutLevel).toBe(4);
    });

    it("глубокие children остаются на следующей организационной строке", () => {
      const root = dept("root", "Дирекция IT", {
        children: [
          dept("oneC", "1С", {
            managerSubLevel: 4,
            children: [dept("support1c", "Группа техподдержки 1С", { managerSubLevel: 5 })],
          }),
          dept("web", "Web", {}),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      const web = byId(nodes, "web");
      const support = byId(nodes, "support1c");

      expect(web.row).toBe(1);
      expect(support.row).toBeGreaterThan(web.row);
      expect(support.effectiveLayoutLevel).toBe(5);
    });
  });

  describe("CR-008_3: normalizeManagementLevel (дробный sub_level)", () => {
    it("4.0 и 4.1 — один management level, одна визуальная строка", () => {
      const root = dept("root", "Дирекция по маркетингу", {
        children: [
          dept("lab", "Маркетинговая лаборатория", { managerSubLevel: 4.0 }),
          dept("analytics", "Отдел аналитики", { managerSubLevel: 4.1 }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      const lab = byId(nodes, "lab");
      const analytics = byId(nodes, "analytics");

      expect(lab.normalizedManagementLevel).toBe(4);
      expect(analytics.normalizedManagementLevel).toBe(4);
      expect(lab.effectiveLayoutLevel).toBe(4);
      expect(analytics.effectiveLayoutLevel).toBe(4);
      expect(lab.row).toBe(analytics.row);
      expect(lab.y).toBe(analytics.y);
    });

    it("4.1, 4.2, 4.9 — management level 4, одна строка", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4.1 }),
          dept("B", "B", { managerSubLevel: 4.2 }),
          dept("C", "C", { managerSubLevel: 4.9 }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      const rows = ["A", "B", "C"].map((id) => byId(nodes, id).row);
      const ys = ["A", "B", "C"].map((id) => byId(nodes, id).y);

      expect(new Set(rows).size).toBe(1);
      expect(new Set(ys).size).toBe(1);
    });

    it("4.9 и 5.0 — разные management levels", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4.9 }),
          dept("B", "B", { managerSubLevel: 5.0 }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "A").normalizedManagementLevel).toBe(4);
      expect(byId(nodes, "B").normalizedManagementLevel).toBe(5);
      expect(byId(nodes, "A").row).not.toBe(byId(nodes, "B").row);
    });

    it("actualManagerSubLevel сохраняется (4.1), effective нормализуется в 4", () => {
      const root = dept("root", "ROOT", {
        children: [dept("A", "A", { managerSubLevel: 4.1 })],
      });
      const { nodes } = computeUnifiedLayout(root);

      const a = byId(nodes, "A");
      expect(a.actualManagerSubLevel).toBe(4.1);
      expect(a.normalizedManagementLevel).toBe(4);
      expect(a.effectiveLayoutLevel).toBe(4);
      // исходные данные не изменены
      expect(a.data.managerSubLevel).toBe(4.1);
      expect(a.data.actualManagerSubLevel).toBe(4.1);
    });

    it("sibling fallback работает с нормализованными уровнями [4.0, 4.1, null, 4.2]", () => {
      const root = dept("root", "ROOT", {
        children: [
          dept("A", "A", { managerSubLevel: 4.0 }),
          dept("B", "B", { managerSubLevel: 4.1 }),
          dept("C", "C", {}),
          dept("D", "D", { managerSubLevel: 4.2 }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root);

      expect(byId(nodes, "A").normalizedManagementLevel).toBe(4);
      expect(byId(nodes, "B").normalizedManagementLevel).toBe(4);
      expect(byId(nodes, "C").normalizedManagementLevel).toBeNull();
      expect(byId(nodes, "D").normalizedManagementLevel).toBe(4);
      expect(byId(nodes, "C").effectiveLayoutLevel).toBe(4);

      const rows = ["A", "B", "C", "D"].map((id) => byId(nodes, id).row);
      expect(new Set(rows).size).toBe(1);
    });

    it("employee sub_level (6.4) не нормализуется и остаётся в данных", () => {
      const root = dept("root", "ROOT", {
        managerSubLevel: 6,
        users: [user("u1", "Emp 1", { subLevel: 6.4 })],
      });
      const { flatData } = computeUnifiedLayout(root);

      const employee = flatData.find((d) => d.id === "u1");
      expect(employee.subLevel).toBe(6.4);
    });

    it("normalizeManagementLevel: 4.0→4, 4.1→4, 4.9→4, null→null", () => {
      expect(normalizeManagementLevel(4.0)).toBe(4);
      expect(normalizeManagementLevel(4.1)).toBe(4);
      expect(normalizeManagementLevel(4.9)).toBe(4);
      expect(normalizeManagementLevel(null)).toBeNull();
      expect(normalizeManagementLevel(undefined)).toBeNull();
    });
  });
});

describe("unified-layout · assistant sidecar (CR-013_assistant)", () => {
  function makeManagerTree({ withAssistant = true, branchCount = 1, usersPerBranch = 0 } = {}) {
    return dept("manager", "Manager", {
      managerSubLevel: 2,
      users: withAssistant
        ? [user("ast-1", "Anna", { position: "Административный ассистент" })]
        : [],
      children: Array.from({ length: branchCount }, (_, i) =>
        dept(`branch-${i}`, `Branch ${i}`, {
          managerSubLevel: 3,
          users: Array.from({ length: usersPerBranch }, (_, j) => user(`u${i}-${j}`, `Emp ${i}-${j}`)),
        }),
      ),
    });
  }

  it("обычный manager: assistant расположен непосредственно ПОД карточкой (CR-019 §5-7)", () => {
    const { nodes } = computeUnifiedLayout(makeManagerTree());
    const manager = byId(nodes, "manager");
    const ast = byId(nodes, "ast-1");

    expect(ast).toBeTruthy();
    // assistant центрирован относительно manager (не расширяет ветвь вправо).
    expect(ast.x).toBeCloseTo(manager.x + (manager.width - ast.width) / 2, 5);
    expect(ast.x + ast.width / 2).toBeCloseTo(manager.x + manager.width / 2, 5);
    // assistant под нижней границей manager с вертикальным gap (8).
    expect(ast.y).toBeCloseTo(manager.y + manager.height + 8, 5);
    expect(ast.y).toBeGreaterThan(manager.y + manager.height);
  });

  it("assistant не влияет на hierarchy, но сдвигает следующий row вниз (CR-019 §9)", () => {
    const withAst = computeUnifiedLayout(makeManagerTree({ branchCount: 1 }));
    const noAst = computeUnifiedLayout(makeManagerTree({ withAssistant: false, branchCount: 1 }));

    const aWith = byId(withAst.nodes, "branch-0");
    const aNo = byId(noAst.nodes, "branch-0");

    // Структура (row, level) не меняется.
    expect(aWith.row).toBe(aNo.row);
    expect(aWith.effectiveLayoutLevel).toBe(aNo.effectiveLayoutLevel);
    // Следующий row начинается ниже visual bottom assistant (под manager).
    expect(aWith.y).toBeGreaterThan(aNo.y);
  });

  it("assistant не уезжает вправо при росте ширины subtree (CR-013_assistant Test 8)", () => {
    const small = computeUnifiedLayout(makeManagerTree({ branchCount: 2, usersPerBranch: 2 }));
    const large = computeUnifiedLayout(makeManagerTree({ branchCount: 6, usersPerBranch: 2 }));

    const astSmall = byId(small.nodes, "ast-1");
    const astLarge = byId(large.nodes, "ast-1");
    const managerSmall = byId(small.nodes, "manager");
    const managerLarge = byId(large.nodes, "manager");

    // Смещение assistant относительно manager не зависит от ширины ветки.
    expect(astLarge.x - managerLarge.x).toBeCloseTo(astSmall.x - managerSmall.x, 5);
    expect(astLarge.x).toBeLessThan(managerLarge.x + managerLarge.width + 100);
  });

  it("manager без assistant не получает пустую assistant зону (CR-013_assistant Test 9)", () => {
    const { nodes } = computeUnifiedLayout(makeManagerTree({ withAssistant: false }));
    expect(nodes.some((node) => node.type === NODE_ASSISTANT)).toBe(false);
  });

  it("несколько managers: каждый assistant у своего manager (CR-013_assistant Test 10)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("mgr-a", "Manager A", {
          managerSubLevel: 2,
          users: [user("ast-a", "Assistant A", { position: "Административный ассистент" })],
        }),
        dept("mgr-b", "Manager B", {
          managerSubLevel: 2,
          users: [user("ast-b", "Assistant B", { position: "Персональный ассистент" })],
        }),
        dept("mgr-c", "Manager C", { managerSubLevel: 2 }),
      ],
    });

    const { tree } = computeUnifiedLayout(root);
    const mgrA = tree.children.find((c) => c.data.id === "mgr-a");
    const mgrB = tree.children.find((c) => c.data.id === "mgr-b");
    const mgrC = tree.children.find((c) => c.data.id === "mgr-c");

    const astA = mgrA.children.find((c) => c.type === NODE_ASSISTANT);
    const astB = mgrB.children.find((c) => c.type === NODE_ASSISTANT);

    expect(astA.data.id).toBe("ast-a");
    expect(astB.data.id).toBe("ast-b");
    // без перекрёстной привязки
    expect(astA.data.id).not.toBe("ast-b");
    expect(mgrC.children.some((c) => c.type === NODE_ASSISTANT)).toBe(false);

    // Assistant A под Manager A (центрирован), без бокового sidecar.
    expect(astA.x).toBeCloseTo(mgrA.x + (mgrA.width - astA.width) / 2, 5);
    // Assistant B под Manager B.
    expect(astB.x).toBeCloseTo(mgrB.x + (mgrB.width - astB.width) / 2, 5);
  });

  it("проставляет headDisplayName в data department — «Фамилия Имя» (CR-016 §30)", () => {
    const root = dept("root", "ROOT", {
      manager: "Глазунов Всеволод Игоревич",
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    expect(tree.data.headName).toBe("Глазунов Всеволод Игоревич");
    expect(tree.data.headDisplayName).toBe("Глазунов Всеволод");
  });

  it("проставляет headDisplayName с полным ФИО для top-3 manager (CR-016 §20)", () => {
    const root = dept("root", "ROOT", {
      manager: "Лукьянов Алексей Александрович",
      keepFullName: true,
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    expect(tree.data.headName).toBe("Лукьянов Алексей Александрович");
    expect(tree.data.headDisplayName).toBe("Лукьянов Алексей Александрович");
    expect(tree.data.keepFullName).toBe(true);
  });

  it("проставляет displayName для employee-колонки (CR-016 §34)", () => {
    const root = dept("root", "ROOT", {
      users: [user("u1", "Елизарова Лаура Вячеславовна")],
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    const employeesNode = tree.children.find((c) => c.type === NODE_EMPLOYEES);
    const person = employeesNode.persons[0];
    expect(person.data.name).toBe("Елизарова Лаура Вячеславовна");
    expect(person.data.displayName).toBe("Елизарова Лаура");
  });

  it("проставляет displayName для assistant sidecar (CR-016 §32)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      users: [user("ast-1", "Лихачева Екатерина Олеговна", { position: "Административный ассистент" })],
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    const ast = tree.children.find((c) => c.type === NODE_ASSISTANT);
    expect(ast).toBeTruthy();
    expect(ast.data.displayName).toBe("Лихачева Екатерина");
  });

  it("два административных ассистента группируются в один NODE_ASSISTANT (CR-020 §6)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      users: [
        user("ast-1", "Рысь Екатерина", { position: "Административный ассистент" }),
        user("ast-2", "Тимофеева Алена", { position: "Административный ассистент" }),
      ],
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    const assistants = tree.children.filter((c) => c.type === NODE_ASSISTANT);
    expect(assistants).toHaveLength(1);
    expect(assistants[0].data.members).toHaveLength(2);
    expect(assistants[0].data.members.map((m) => m.id)).toEqual(["ast-1", "ast-2"]);
  });

  it("executive (__person) получает displayName: top-3 полное, остальные сокращённые (CR-016 §20, §23)", () => {
    const root = dept("root", "Винник Лев Арнольдович", {
      __person: {
        id: "exec-1",
        full_name: "Винник Лев Арнольдович",
        position: "Директор",
      },
      keepFullName: false,
      children: [],
    });
    const { tree } = computeUnifiedLayout(root);

    expect(tree.data.name).toBe("Винник Лев Арнольдович");
    expect(tree.data.displayName).toBe("Винник Лев");
  });
});


describe("unified-layout · assistant sidecar geometry (CR-015)", () => {
  it("assistant ниже manager и полностью выше следующего row (CR-019 §7, §9)", () => {
    const tree = dept("klyuev", "Клюев", {
      managerSubLevel: 2,
      users: [user("ast-1", "Лихачева", { position: "Персональный ассистент" })],
      children: ["A", "B", "C"].map((name, i) =>
        dept(`dept-${i}`, `Department ${name}`, { managerSubLevel: 3 }),
      ),
    });
    const { nodes } = computeUnifiedLayout(tree);

    const manager = byId(nodes, "klyuev");
    const ast = byId(nodes, "ast-1");
    const childrenRowTop = Math.min(
      ...["A", "B", "C"].map((_, i) => byId(nodes, `dept-${i}`).y),
    );

    // Assistant под manager (центрирован), не в зоне children junction.
    expect(ast.y).toBeGreaterThan(manager.y + manager.height);
    expect(ast.x + ast.width / 2).toBeCloseTo(manager.x + manager.width / 2, 5);
    expect(ast.y + ast.height).toBeLessThan(childrenRowTop);
    expect(childrenRowTop - (ast.y + ast.height)).toBeGreaterThanOrEqual(28);
  });

  it("без assistant Y-layout не меняется (Test 12)", () => {
    const tree = dept("manager", "Manager", {
      managerSubLevel: 2,
      children: [
        dept("A", "A", { managerSubLevel: 3 }),
        dept("B", "B", { managerSubLevel: 3 }),
      ],
    });
    const { nodes } = computeUnifiedLayout(tree);

    const manager = byId(nodes, "manager");
    const a = byId(nodes, "A");
    const b = byId(nodes, "B");

    // Стандартная формула без дополнительной vertical assistant-zone.
    expect(a.y).toBe(manager.y + manager.height + 60);
    expect(b.y).toBe(a.y);
  });

  it("assistant остаётся локально у manager при широком subtree (Test 13)", () => {
    const tree = dept("manager", "Manager", {
      managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: Array.from({ length: 10 }, (_, i) => dept(`d${i}`, `D${i}`, { managerSubLevel: 3 })),
    });
    const { nodes } = computeUnifiedLayout(tree);

    const manager = byId(nodes, "manager");
    const ast = byId(nodes, "ast-1");

    // assistant центрирован под manager, не уезжает вправо при широком subtree.
    expect(ast.x + ast.width / 2).toBeCloseTo(manager.x + manager.width / 2, 5);
    expect(ast.x).toBeLessThan(manager.x + manager.width);
    for (let i = 0; i < 10; i += 1) {
      const child = byId(nodes, `d${i}`);
      expect(ast.y + ast.height).toBeLessThanOrEqual(child.y);
    }
  });

  it("assistant-zone независима: каждый assistant у своего manager, row детей согласован (Test 14)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("mgr-a", "Manager A", {
          managerSubLevel: 2,
          users: [user("ast-a", "Assistant A", { position: "Административный ассистент" })],
          children: [dept("a1", "A1", { managerSubLevel: 3 })],
        }),
        dept("mgr-b", "Manager B", {
          managerSubLevel: 2,
          users: [user("ast-b", "Assistant B", { position: "Персональный ассистент" })],
          children: [dept("b1", "B1", { managerSubLevel: 3 })],
        }),
        dept("mgr-c", "Manager C", {
          managerSubLevel: 2,
          children: [dept("c1", "C1", { managerSubLevel: 3 })],
        }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const mgrA = byId(nodes, "mgr-a");
    const mgrB = byId(nodes, "mgr-b");
    const astA = byId(nodes, "ast-a");
    const astB = byId(nodes, "ast-b");

    // Каждый assistant у своего manager (центрирован под ним), без перекрёстной привязки.
    expect(astA.x + astA.width / 2).toBeCloseTo(mgrA.x + mgrA.width / 2, 5);
    expect(astB.x + astB.width / 2).toBeCloseTo(mgrB.x + mgrB.width / 2, 5);
    expect(astA.x).toBeLessThan(mgrB.x);
    // Ассистенты выше своих детей.
    expect(astA.y + astA.height).toBeLessThanOrEqual(byId(nodes, "a1").y);
    expect(astB.y + astB.height).toBeLessThanOrEqual(byId(nodes, "b1").y);
    // Общий row детей остаётся согласованным.
    expect(byId(nodes, "a1").y).toBe(byId(nodes, "b1").y);
    expect(byId(nodes, "b1").y).toBe(byId(nodes, "c1").y);
  });

  it("assistant остаётся под manager при collapse (CR-019 §25)", () => {
    const tree = dept("manager", "Manager", {
      managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: [
        dept("A", "A", { managerSubLevel: 3 }),
        dept("B", "B", { managerSubLevel: 3 }),
      ],
    });
    const { nodes } = computeUnifiedLayout(tree, { collapsedIds: new Set(["manager"]) });

    const manager = byId(nodes, "manager");
    const ast = byId(nodes, "ast-1");

    // Организационные children скрыты, junction отсутствует.
    expect(byId(nodes, "A")).toBeUndefined();
    expect(byId(nodes, "B")).toBeUndefined();
    expect(manager.collapsed).toBe(true);
    expect(manager.hiddenChildrenCount).toBe(2);
    // Assistant — visual node и остаётся видимым под manager.
    expect(ast).toBeTruthy();
    expect(ast.y).toBeGreaterThan(manager.y + manager.height);
    expect(ast.x + ast.width / 2).toBeCloseTo(manager.x + manager.width / 2, 5);
  });

  it("toggle имеет единый baseline для siblings одного row (CR-015 §24, §51)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "A", {
          managerSubLevel: 2,
          children: [dept("A1", "A1", { managerSubLevel: 3 })],
        }),
        dept("B", "B", {
          managerSubLevel: 2,
          children: [dept("B1", "B1", { managerSubLevel: 3 })],
        }),
        dept("C", "C", {
          managerSubLevel: 2,
          children: [dept("C1", "C1", { managerSubLevel: 3 })],
        }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const a = byId(nodes, "A");
    const b = byId(nodes, "B");
    const c = byId(nodes, "C");

    expect(a.toggleY).toBeDefined();
    expect(b.toggleY).toBeDefined();
    expect(c.toggleY).toBeDefined();
    expect(Math.abs(a.toggleY - b.toggleY)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(b.toggleY - c.toggleY)).toBeLessThanOrEqual(1e-6);
  });

  it("toggle baseline учитывает самую высокую карточку row при variable-height (CR-015 §21, §50)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "A", {
          managerSubLevel: 2,
          pdfRoles: [{ position: "Роль 1" }],
          children: [dept("A1", "A1", { managerSubLevel: 3 })],
        }),
        dept("B", "B", {
          managerSubLevel: 2,
          pdfRoles: [{ position: "Роль 1" }, { position: "Роль 2" }, { position: "Роль 3" }],
          children: [dept("B1", "B1", { managerSubLevel: 3 })],
        }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root, {
      rolesPresentation: true,
      rolesDepartmentHeaderHeight: 40,
      rolesDepartmentSeparatorHeight: 2,
      rolesDepartmentRowHeight: 16,
      rolesDepartmentPadding: 8,
      rowGap: 60,
    });

    const a = byId(nodes, "A");
    const b = byId(nodes, "B");

    // B (3 роли) выше A (1 роль) — но toggle baseline у siblings общий
    // и совпадает с нижним краем самой высокой карточки row.
    expect(b.height).toBeGreaterThan(a.height);
    expect(a.toggleY).toBe(b.toggleY);
    const rowVisualBottom = Math.max(a.y + a.height, b.y + b.height);
    expect(a.toggleY).toBe(rowVisualBottom + 14);
  });

  it("assistant below опускает toggle baseline ниже visual bottom assistant (CR-019 §24)", () => {
    const withAst = dept("manager", "Manager", {
      managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: [dept("A", "A", { managerSubLevel: 3 })],
    });
    const withoutAst = dept("manager", "Manager", {
      managerSubLevel: 2,
      children: [dept("A", "A", { managerSubLevel: 3 })],
    });

    const { nodes: nodesWith } = computeUnifiedLayout(withAst);
    const { nodes: nodesWithout } = computeUnifiedLayout(withoutAst);

    const managerWith = byId(nodesWith, "manager");
    const ast = byId(nodesWith, "ast-1");
    const toggleWith = managerWith.toggleY;
    const toggleWithout = byId(nodesWithout, "manager").toggleY;

    // Assistant под manager увеличивает вертикальный footprint row →
    // toggle baseline ниже (не поверх assistant).
    expect(toggleWith).toBeGreaterThan(toggleWithout);
    expect(toggleWith).toBeGreaterThan(ast.y + ast.height);
  });

  it("assistant не уезжает от manager при росте ширины subtree (CR-019 §6, §32)", () => {
    const oneChild = dept("manager", "Manager", {
      managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: [dept("C1", "Child 1", { managerSubLevel: 3 })],
    });
    const tenChildren = dept("manager", "Manager", {
      managerSubLevel: 2,
      users: [user("ast-1", "Anna", { position: "Административный ассистент" })],
      children: Array.from({ length: 10 }, (_, i) => dept(`C${i}`, `Child ${i}`, { managerSubLevel: 3 })),
    });

    const { nodes: small } = computeUnifiedLayout(oneChild);
    const { nodes: large } = computeUnifiedLayout(tenChildren);

    const distanceSmall = byId(small, "ast-1").x - byId(small, "manager").x;
    const distanceLarge = byId(large, "ast-1").x - byId(large, "manager").x;

    // assistant центрирован под manager — смещение по X не зависит от ширины subtree.
    expect(distanceSmall).toBeCloseTo(distanceLarge, 5);
    expect(distanceSmall).toBeCloseTo((350 - 240) / 2, 5);
  });
});

function rect(n) {
  return { left: n.x, top: n.y, right: n.x + n.width, bottom: n.y + n.height };
}

function rectsOverlap(a, b) {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

describe("unified-layout · assistant footprint (CR-017)", () => {
  function makeRootWithAssistants() {
    return dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "Department A", {
          managerSubLevel: 2,
          users: [user("ast-a", "Assistant A", { position: "Административный ассистент" })],
        }),
        dept("B", "Department B", { managerSubLevel: 2 }),
      ],
    });
  }

  it("assistant sidecar не перекрывает соседний sibling department (CR-017 §7-8, §10, §21-22)", () => {
    const { nodes } = computeUnifiedLayout(makeRootWithAssistants());

    const astA = byId(nodes, "ast-a");
    const b = byId(nodes, "B");

    expect(astA).toBeTruthy();
    expect(rectsOverlap(rect(astA), rect(b))).toBe(false);
    // Следующий sibling начинается после visual footprint ветви A (включая assistant).
    expect(b.x).toBeGreaterThanOrEqual(astA.x + astA.width);
  });

  it("collapsed branch сохраняет assistant footprint (CR-017 §12, §23-24)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "Department A", {
          managerSubLevel: 2,
          users: [user("ast-a", "Assistant A", { position: "Административный ассистент" })],
          children: [dept("A1", "A1", { managerSubLevel: 3 })],
        }),
        dept("B", "Department B", { managerSubLevel: 2 }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root, { collapsedIds: new Set(["A"]) });

    const astA = byId(nodes, "ast-a");
    const b = byId(nodes, "B");

    expect(byId(nodes, "A1")).toBeUndefined();
    expect(astA).toBeTruthy();
    expect(rectsOverlap(rect(astA), rect(b))).toBe(false);
    expect(b.x).toBeGreaterThanOrEqual(astA.x + astA.width);
  });

  it("несколько sibling managers с assistants не пересекаются (CR-017 §16, §27)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "Department A", {
          managerSubLevel: 2,
          users: [
            user("ast-a1", "Assistant A1", { position: "Административный ассистент" }),
            user("ast-a2", "Assistant A2", { position: "Персональный ассистент" }),
          ],
        }),
        dept("B", "Department B", {
          managerSubLevel: 2,
          users: [user("ast-b", "Assistant B", { position: "Административный ассистент" })],
        }),
        dept("C", "Department C", { managerSubLevel: 2 }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const astA1 = byId(nodes, "ast-a1");
    const astA2 = byId(nodes, "ast-a2");
    const astB = byId(nodes, "ast-b");
    const b = byId(nodes, "B");
    const c = byId(nodes, "C");

    expect(rectsOverlap(rect(astA1), rect(b))).toBe(false);
    expect(rectsOverlap(rect(astA2), rect(b))).toBe(false);
    expect(rectsOverlap(rect(astA1), rect(astB))).toBe(false);
    expect(rectsOverlap(rect(astA2), rect(astB))).toBe(false);
    expect(rectsOverlap(rect(astB), rect(c))).toBe(false);
  });

  it("manager без assistant не получает лишнюю ширину ветки (CR-017 §25)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [dept("A", "A", { managerSubLevel: 2 }), dept("B", "B", { managerSubLevel: 2 })],
    });
    const { tree } = computeUnifiedLayout(root);

    const a = tree.children.find((c) => c.data.id === "A");
    const b = tree.children.find((c) => c.data.id === "B");
    expect(a.subtreeWidth).toBe(a.width);
    expect(b.subtreeWidth).toBe(b.width);
  });

  it("учитывается assistant шире manager (CR-017 §26)", () => {
    const { nodes } = computeUnifiedLayout(makeRootWithAssistants(), {
      departmentWidth: 250,
      assistantSidecarWidth: 350,
    });

    const astA = byId(nodes, "ast-a");
    const b = byId(nodes, "B");

    expect(astA.width).toBe(350);
    expect(rectsOverlap(rect(astA), rect(b))).toBe(false);
    expect(b.x).toBeGreaterThanOrEqual(astA.x + astA.width);
  });

  it("assistant не меняет organizational bounds: row/effectiveLayoutLevel детей сохраняются (CR-017 §5, §15)", () => {
    const withAst = makeRootWithAssistants();
    const withoutAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [dept("A", "Department A", { managerSubLevel: 2 }), dept("B", "Department B", { managerSubLevel: 2 })],
    });

    const { nodes: nodesWith } = computeUnifiedLayout(withAst);
    const { nodes: nodesWithout } = computeUnifiedLayout(withoutAst);

    const aWith = byId(nodesWith, "A");
    const aWithout = byId(nodesWithout, "A");

    expect(aWith.row).toBe(aWithout.row);
    expect(aWith.effectiveLayoutLevel).toBe(aWithout.effectiveLayoutLevel);
  });
});

describe("unified-layout · compact horizontal packing (CR-018)", () => {
  function makeBranch(overrides = {}) {
    return dept(overrides.id || "A", overrides.name || "A", {
      managerSubLevel: 2,
      ...(overrides.assistants
        ? {
            users: overrides.assistants.map((name, i) =>
              user(`ast-${overrides.id}-${i}`, name, {
                position: i % 2 === 0 ? "Административный ассистент" : "Персональный ассистент",
              }),
            ),
          }
        : {}),
      ...(overrides.children ? { children: overrides.children } : {}),
      // Остальные presentation-поля (assistantPlacement и т.п.).
      ...overrides,
    });
  }

  it("обычный assistant ниже manager, top-management assistant — sidecar справа (CR-019 §28, §31-32)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        // Обычный manager → assistant below (центрирован, под карточкой).
        makeBranch({ id: "A", name: "A", assistants: ["Assistant A"] }),
        // Top-management → assistant sidecar справа и слегка ниже.
        makeBranch({
          id: "T",
          name: "T",
          assistants: ["Assistant T"],
          assistantPlacement: "side",
          keepFullName: true,
        }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const managerA = byId(nodes, "A");
    const astA = byId(nodes, "ast-A-0");
    expect(astA.x).toBeCloseTo(managerA.x + (managerA.width - astA.width) / 2, 5);
    expect(astA.y).toBeCloseTo(managerA.y + managerA.height + 8, 5);

    const managerT = byId(nodes, "T");
    const astT = byId(nodes, "ast-T-0");
    expect(astT.x).toBe(managerT.x + managerT.width + 16);
    expect(astT.y).toBe(managerT.y + 28);
    expect(astT.x).toBeGreaterThan(managerT.x);
    expect(astT.y).toBeGreaterThanOrEqual(managerT.y);
  });

  it("assistant не удваивает subtreeWidth (CR-018 §5, §29)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [makeBranch({ id: "A", name: "A", assistants: ["Assistant A"] })],
    });
    const { tree } = computeUnifiedLayout(root);

    const a = tree.children.find((c) => c.data.id === "A");
    expect(a.subtreeWidth).toBe(a.width);
    expect(a.subtreeWidth).toBeLessThan(a.width + 2 * 16 + 2 * 240);
  });

  it("no collision → no additional shift (CR-018 §13, §30)", () => {
    const withAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          assistants: ["Assistant A"],
          children: [
            makeBranch({ id: "A1", name: "A1" }),
            makeBranch({ id: "A2", name: "A2" }),
            makeBranch({ id: "A3", name: "A3" }),
            makeBranch({ id: "A4", name: "A4" }),
          ],
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });
    const withoutAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          children: [
            makeBranch({ id: "A1", name: "A1" }),
            makeBranch({ id: "A2", name: "A2" }),
            makeBranch({ id: "A3", name: "A3" }),
            makeBranch({ id: "A4", name: "A4" }),
          ],
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });

    const { nodes: nodesWith } = computeUnifiedLayout(withAst);
    const { nodes: nodesWithout } = computeUnifiedLayout(withoutAst);

    // Широкий subtree A сам по себе оставляет место для assistant —
    // дополнительного сдвига B не требуется (позиция B совпадает с baseline).
    expect(byId(nodesWith, "B").x).toBe(byId(nodesWithout, "B").x);
  });

  it("collision sidecar (top-management) устраняется сдвигом правой ветви (CR-018 §7, §31, CR-019 §35)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          assistants: ["Assistant A"],
          assistantPlacement: "side",
          keepFullName: true,
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const a = byId(nodes, "A");
    const ast = byId(nodes, "ast-A-0");
    const b = byId(nodes, "B");

    const aVisualMaxX = Math.max(a.x + a.width, ast.x + ast.width);
    // B сдвинут за visual footprint A (с colGap), т.к. initial placement был в collision.
    expect(b.x).toBeGreaterThan(a.x + a.subtreeWidth + 40);
    expect(b.x).toBeGreaterThanOrEqual(aVisualMaxX + 40);
    expect(rectsOverlap(rect(ast), rect(b))).toBe(false);
  });

  it("сдвигается вся branch: B, B1, B2 сохраняют внутреннюю геометрию (CR-018 §8, §32)", () => {
    const withAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({ id: "A", name: "A", assistants: ["Assistant A"] }),
        makeBranch({
          id: "B",
          name: "B",
          children: [makeBranch({ id: "B1", name: "B1" }), makeBranch({ id: "B2", name: "B2" })],
        }),
      ],
    });
    const withoutAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({ id: "A", name: "A" }),
        makeBranch({
          id: "B",
          name: "B",
          children: [makeBranch({ id: "B1", name: "B1" }), makeBranch({ id: "B2", name: "B2" })],
        }),
      ],
    });

    const { nodes: nodesWith } = computeUnifiedLayout(withAst);
    const { nodes: nodesWithout } = computeUnifiedLayout(withoutAst);

    const relWith = (id) => byId(nodesWith, id).x - byId(nodesWith, "B").x;
    const relWithout = (id) => byId(nodesWithout, id).x - byId(nodesWithout, "B").x;

    // Относительные координаты внутри ветви B не меняются при сдвиге.
    expect(relWith("B1")).toBeCloseTo(relWithout("B1"), 5);
    expect(relWith("B2")).toBeCloseTo(relWithout("B2"), 5);
  });

  it("несколько assistants (top-management): группа справа, visualMaxX учитывает правый край (CR-018 §23, §33, CR-019 §16)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          assistants: ["Assistant 1", "Assistant 2"],
          assistantPlacement: "side",
          keepFullName: true,
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const manager = byId(nodes, "A");
    const ast1 = byId(nodes, "ast-A-0");
    const ast2 = byId(nodes, "ast-A-1");
    const b = byId(nodes, "B");

    expect(ast1.x).toBe(manager.x + manager.width + 16);
    expect(ast2.x).toBe(ast1.x + ast1.width + 16);
    // Соседняя ветвь не пересекает группу (правый край второго assistant).
    expect(b.x).toBeGreaterThanOrEqual(ast2.x + ast2.width + 40);
    expect(rectsOverlap(rect(ast2), rect(b))).toBe(false);
  });

  it("collapsed branch: скрытое subtree не резервирует место (CR-018 §16, §34)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          assistants: ["Assistant A"],
          children: [makeBranch({ id: "A1", name: "A1" }), makeBranch({ id: "A2", name: "A2" })],
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });
    const { nodes, tree } = computeUnifiedLayout(root, { collapsedIds: new Set(["A"]) });

    expect(byId(nodes, "A1")).toBeUndefined();
    expect(byId(nodes, "A2")).toBeUndefined();

    const a = tree.children.find((c) => c.data.id === "A");
    expect(a.subtreeWidth).toBe(a.width);
  });

  it("итоговая ширина существенно меньше варианта с симметричным резервом (CR-018 §40)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: ["A", "B", "C", "D"].map((id) =>
        makeBranch({ id, name: id, assistants: [`Assistant ${id}`] }),
      ),
    });
    const { width } = computeUnifiedLayout(root);

    // Симметричное резервирование дало бы >= 4 * (350 + 32 + 480) = 3448 + gaps.
    const oldStyleWidth = 4 * (350 + 2 * 16 + 2 * 240) + 3 * 40;
    expect(width).toBeLessThan(oldStyleWidth);

    // Компактная оценка с фактическим каскадом сдвигов: ветвь i+1 начинается
    // после visual footprint ветви i (manager + gap + assistant + colGap).
    const compactWidth =
      4 * 350 + 3 * (16 + 240 + 40) + (16 + 240) + 2 * 40;
    expect(width).toBeLessThanOrEqual(compactWidth);
  });

  it("assistant не меняет organizational hierarchy: parentId/children/row/effectiveLayoutLevel (CR-018 §36)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeBranch({
          id: "A",
          name: "A",
          assistants: ["Assistant A"],
          children: [makeBranch({ id: "A1", name: "A1" })],
        }),
        makeBranch({ id: "B", name: "B" }),
      ],
    });
    const { nodes, edges } = computeUnifiedLayout(root);

    const a = byId(nodes, "A");
    const a1 = byId(nodes, "A1");
    const b = byId(nodes, "B");

    // row/effectiveLayoutLevel не меняются из-за assistant (A на том же уровне, что B).
    expect(a.row).toBe(b.row);
    expect(a.effectiveLayoutLevel).toBe(b.effectiveLayoutLevel);
    expect(a1.row).toBeGreaterThan(a.row);

    // parent-child hierarchy сохранена.
    const parentEdge = edges.find((e) => e.child === a);
    const parentOfA = parentEdge ? parentEdge.parent.data.id : null;
    expect(parentOfA).toBe("root");
  });
});

describe("unified-layout · assistant placement (CR-019)", () => {
  function makeManagerWithAssistant(overrides = {}) {
    return dept(overrides.id || "A", overrides.name || "A", {
      managerSubLevel: 2,
      users: overrides.assistants
        ? overrides.assistants.map((name, i) =>
            user(`ast-${overrides.id}-${i}`, name, {
              position: i % 2 === 0 ? "Административный ассистент" : "Персональный ассистент",
            }),
          )
        : [],
      ...(overrides.children ? { children: overrides.children } : {}),
      ...overrides,
    });
  }

  it("ordinary assistant не увеличивает horizontal width ветви (CR-019 §6, §33)", () => {
    const withAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [makeManagerWithAssistant({ id: "A", name: "A", assistants: ["Assistant"] })],
    });
    const withoutAst = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [makeManagerWithAssistant({ id: "A", name: "A" })],
    });

    const { tree: withTree, width: withWidth } = computeUnifiedLayout(withAst);
    const { tree: withoutTree, width: withoutWidth } = computeUnifiedLayout(withoutAst);

    const aWith = withTree.children.find((c) => c.data.id === "A");
    const aWithout = withoutTree.children.find((c) => c.data.id === "A");

    // Ширина ветви и общая ширина схемы не меняются (assistant 240 <= manager 350).
    expect(aWith.subtreeWidth).toBe(aWithout.subtreeWidth);
    expect(withWidth).toBe(withoutWidth);
  });

  it("реальные кейсы: Невзорова/Садкова/Мишуев — assistant под карточкой (CR-019 §36-37)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("hr", "Дирекция по персоналу", {
          managerSubLevel: 2,
          manager: "Невзорова Екатерина Викторовна",
          users: [
            user("schekotova", "Щёкотова Екатерина Алексеевна", { position: "Административный ассистент" }),
          ],
        }),
        dept("sales", "Дирекция по продажам", {
          managerSubLevel: 2,
          manager: "Садкова Ксения Александровна",
          users: [
            user("kudasheva", "Кудашева Виктория Витальевна", { position: "Административный ассистент" }),
          ],
        }),
        dept("comfort", "LEGENDA Comfort", {
          managerSubLevel: 2,
          manager: "Мишуев Александр Адольфович",
          users: [
            user("nikolaeva", "Николаева Татьяна Владимировна", { position: "Персональный ассистент" }),
          ],
        }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    for (const astId of ["schekotova", "kudasheva", "nikolaeva"]) {
      const ast = byId(nodes, astId);
      const parent = nodes.find(
        (n) => n.type === NODE_DEPARTMENT && (n.children || []).some((c) => c.data && c.data.id === astId),
      );
      expect(parent).toBeTruthy();
      expect(ast.x + ast.width / 2).toBeCloseTo(parent.x + parent.width / 2, 5);
      expect(ast.y).toBeGreaterThan(parent.y + parent.height);
    }

    // Никакие соседние department cards не перекрываются (CR-019 §36).
    const schekotova = byId(nodes, "schekotova");
    const sales = byId(nodes, "sales");
    expect(rectsOverlap(rect(schekotova), rect(sales))).toBe(false);
  });

  it("collapse top-manager: sidecar остаётся, скрытые дети не резервируют место (CR-019 §39)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        dept("A", "A", {
          managerSubLevel: 2,
          assistantPlacement: "side",
          keepFullName: true,
          users: [user("ast-1", "Assistant", { position: "Административный ассистент" })],
          children: [dept("A1", "A1", { managerSubLevel: 3 }), dept("A2", "A2", { managerSubLevel: 3 })],
        }),
        dept("B", "B", { managerSubLevel: 2 }),
      ],
    });
    const { nodes, tree } = computeUnifiedLayout(root, { collapsedIds: new Set(["A"]) });

    expect(byId(nodes, "A1")).toBeUndefined();
    const a = tree.children.find((c) => c.data.id === "A");
    const ast = byId(nodes, "ast-1");
    const b = byId(nodes, "B");

    // Sidecar assistant остаётся справа от manager.
    expect(ast.x).toBe(a.x + a.width + 16);
    // Скрытые descendants не резервируют место.
    expect(a.subtreeWidth).toBe(a.width);
    expect(rectsOverlap(rect(ast), rect(b))).toBe(false);
  });

  it("variable card widths: below центрируется, side — справа (CR-019 §40)", () => {
    for (const width of [230, 350, 380]) {
      const root = dept("root", "ROOT", {
        managerSubLevel: 1,
        children: [
          makeManagerWithAssistant({ id: "A", name: "A", assistants: ["Assistant"] }),
          makeManagerWithAssistant({
            id: "T",
            name: "T",
            assistants: ["Assistant T"],
            assistantPlacement: "side",
            keepFullName: true,
          }),
        ],
      });
      const { nodes } = computeUnifiedLayout(root, { departmentWidth: width });

      const manager = byId(nodes, "A");
      const ast = byId(nodes, "ast-A-0");
      expect(ast.x + ast.width / 2).toBeCloseTo(manager.x + manager.width / 2, 5);
      expect(ast.y).toBeCloseTo(manager.y + manager.height + 8, 5);

      const managerT = byId(nodes, "T");
      const astT = byId(nodes, "ast-T-0");
      expect(astT.x).toBe(managerT.x + managerT.width + 16);
      expect(astT.y).toBe(managerT.y + 28);
    }
  });

  it("несколько assistants ниже manager укладываются вертикальной группой (CR-019 §23)", () => {
    const root = dept("root", "ROOT", {
      managerSubLevel: 1,
      children: [
        makeManagerWithAssistant({ id: "A", name: "A", assistants: ["Assistant 1", "Assistant 2"] }),
      ],
    });
    const { nodes } = computeUnifiedLayout(root);

    const manager = byId(nodes, "A");
    const ast1 = byId(nodes, "ast-A-0");
    const ast2 = byId(nodes, "ast-A-1");

    expect(ast1.x).toBeCloseTo(manager.x + (manager.width - ast1.width) / 2, 5);
    expect(ast2.x).toBeCloseTo(manager.x + (manager.width - ast2.width) / 2, 5);
    expect(ast2.y).toBe(ast1.y + ast1.height + 8);
  });
});

