import { describe, it, expect } from "vitest";
import { computeUnifiedLayout, NODE_EMPLOYEES, NODE_DEPARTMENT } from "./unified-layout.js";

function makeTree() {
  return {
    department_guid: "root",
    department_name: "Дирекция",
    department_manager: "Иванов Иван Иванович",
    department_manager_position: "Директор",
    users: [
      { id: "u1", full_name: "Петров Пётр", name: "Петров Пётр", position: "Разработчик" },
      { id: "u2", full_name: "Сидоров Сидор", name: "Сидоров Сидор", position: "Аналитик" },
    ],
    children: [
      {
        department_guid: "child",
        department_name: "Отдел",
        department_manager: "",
        users: [
          { id: "u3", full_name: "Кузнецов Кузьма", name: "Кузнецов Кузьма", position: "Тестировщик" },
        ],
        children: [],
      },
    ],
  };
}

function departmentNode(nodes, id) {
  return nodes.find((n) => n.type === NODE_DEPARTMENT && n.data?.id === id);
}

describe("unified-layout employees visibility (CR-024 §2.2)", () => {
  it("по умолчанию сотрудники видимы (обратная совместимость)", () => {
    const { nodes } = computeUnifiedLayout(makeTree());
    expect(nodes.some((n) => n.type === NODE_EMPLOYEES)).toBe(true);
    expect(departmentNode(nodes, "root").data.employeesCollapsed).toBeFalsy();
  });

  it("hiddenEmployeeIds скрывает колонку сотрудников и помечает подразделение", () => {
    const { nodes } = computeUnifiedLayout(makeTree(), {
      hiddenEmployeeIds: new Set(["root"]),
    });

    // Сотрудники корня скрыты, но сотрудники child видимы → одна колонка.
    expect(nodes.filter((n) => n.type === NODE_EMPLOYEES).length).toBe(1);

    const root = departmentNode(nodes, "root");
    expect(root.data.employeesCollapsed).toBe(true);
    expect(root.data.employeeCount).toBe(2);
  });

  it("employeeCount считает участников группы, но не вакансии", () => {
    const tree = makeTree();
    const { nodes } = computeUnifiedLayout(tree, {
      groupByPosition: true,
      hiddenEmployeeIds: new Set(["root", "child"]),
    });

    expect(departmentNode(nodes, "root").data.employeeCount).toBe(2);
    expect(departmentNode(nodes, "child").data.employeeCount).toBe(1);
  });

  it("employeesToggleHeight увеличивает высоту карточки подразделения при свернутых сотрудниках", () => {
    const base = computeUnifiedLayout(makeTree()).nodes;
    const withToggle = computeUnifiedLayout(makeTree(), {
      hiddenEmployeeIds: new Set(["root"]),
      employeesToggleHeight: 22,
    }).nodes;

    const baseRoot = departmentNode(base, "root");
    const toggleRoot = departmentNode(withToggle, "root");
    expect(toggleRoot.height).toBe(baseRoot.height + 22);
  });
});
