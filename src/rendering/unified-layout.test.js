import { describe, it, expect } from "vitest";
import {
  computeUnifiedLayout,
  NODE_DEPARTMENT,
  NODE_EMPLOYEES,
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
    const yWith = byId(computeUnifiedLayout(withAst).nodes, "B1").y;
    const yNo = byId(computeUnifiedLayout(noAst).nodes, "B1").y;
    expect(yWith).toBe(yNo);
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
});
