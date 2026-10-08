import { describe, it, expect } from "vitest";
import {
  createExpandState,
  departmentIdOf,
  isChildrenCollapsed,
  setChildrenCollapsed,
  toggleChildren,
  expandNextLevel,
  isEmployeesExpanded,
  toggleEmployees,
  collectSubtreeDepartmentIds,
  findDepartmentNode,
  expandBranch,
  collapseBranch,
  expandAll,
  collapseAll,
  hiddenEmployeeIds,
} from "./expand-state.js";

function dept(id, children = []) {
  return { department_guid: id, department_name: id, children };
}

function makeTree() {
  return dept("root", [
    dept("dirA", [dept("a1"), dept("a2", [dept("a2x")])]),
    dept("dirB", [dept("b1")]),
  ]);
}

describe("expand-state.js (CR-024 §2)", () => {
  describe("departmentIdOf", () => {
    it("возвращает department_guid или id", () => {
      expect(departmentIdOf({ department_guid: "g1" })).toBe("g1");
      expect(departmentIdOf({ id: "i1" })).toBe("i1");
      expect(departmentIdOf(null)).toBe("");
    });
  });

  describe("children collapse state", () => {
    it("по умолчанию дочерние подразделения раскрыты", () => {
      const state = createExpandState();
      expect(isChildrenCollapsed(state, "a")).toBe(false);
    });

    it("seeding initialCollapsedChildren сворачивает указанные узлы", () => {
      const state = createExpandState({ initialCollapsedChildren: ["dirA"] });
      expect(isChildrenCollapsed(state, "dirA")).toBe(true);
      expect(isChildrenCollapsed(state, "dirB")).toBe(false);
    });

    it("collapse/expand независимы для каждого подразделения", () => {
      const state = createExpandState();
      setChildrenCollapsed(state, "dirA", true);
      expect(isChildrenCollapsed(state, "dirA")).toBe(true);
      expect(isChildrenCollapsed(state, "dirB")).toBe(false);
    });

    it("expandNextLevel раскрывает только непосредственные дочерние узлы", () => {
      const state = createExpandState({ initialCollapsedChildren: ["dirA", "dirB"] });
      expandNextLevel(state, "dirA");
      expect(isChildrenCollapsed(state, "dirA")).toBe(false);
      expect(isChildrenCollapsed(state, "dirB")).toBe(true);
    });

    it("toggleChildren меняет состояние", () => {
      const state = createExpandState();
      toggleChildren(state, "dirA");
      expect(isChildrenCollapsed(state, "dirA")).toBe(true);
      toggleChildren(state, "dirA");
      expect(isChildrenCollapsed(state, "dirA")).toBe(false);
    });
  });

  describe("employees visibility", () => {
    it("сотрудники по умолчанию скрыты", () => {
      const state = createExpandState();
      expect(isEmployeesExpanded(state, "dirA")).toBe(false);
    });

    it("toggleEmployees переключает видимость", () => {
      const state = createExpandState();
      toggleEmployees(state, "dirA");
      expect(isEmployeesExpanded(state, "dirA")).toBe(true);
      toggleEmployees(state, "dirA");
      expect(isEmployeesExpanded(state, "dirA")).toBe(false);
    });

    it("видимость сотрудников не зависит от раскрытия подразделений", () => {
      const state = createExpandState();
      toggleEmployees(state, "dirA");
      setChildrenCollapsed(state, "dirA", true);
      expect(isEmployeesExpanded(state, "dirA")).toBe(true);
    });
  });

  describe("collectSubtreeDepartmentIds / findDepartmentNode", () => {
    it("собирает все id поддерева, включая корень", () => {
      expect(collectSubtreeDepartmentIds(makeTree())).toEqual([
        "root",
        "dirA",
        "a1",
        "a2",
        "a2x",
        "dirB",
        "b1",
      ]);
    });

    it("находит узел по id", () => {
      expect(findDepartmentNode(makeTree(), "a2x")?.department_guid).toBe("a2x");
      expect(findDepartmentNode(makeTree(), "missing")).toBeNull();
    });
  });

  describe("branch operations", () => {
    it("expandBranch раскрывает все подразделения и сотрудников ветки", () => {
      const state = createExpandState({
        initialCollapsedChildren: ["dirA", "a1", "a2", "a2x"],
      });
      expandBranch(state, makeTree(), "dirA");

      expect(collectSubtreeDepartmentIds(findDepartmentNode(makeTree(), "dirA")).every(
        (id) => !isChildrenCollapsed(state, id) && isEmployeesExpanded(state, id),
      )).toBe(true);
      // Соседняя ветка не затронута.
      expect(isEmployeesExpanded(state, "dirB")).toBe(false);
    });

    it("collapseBranch сворачивает ветку, не затрагивая соседей", () => {
      const state = createExpandState();
      expandBranch(state, makeTree(), "dirA");
      collapseBranch(state, makeTree(), "dirA");

      expect(isChildrenCollapsed(state, "dirA")).toBe(true);
      expect(isEmployeesExpanded(state, "a1")).toBe(false);
      expect(isChildrenCollapsed(state, "dirB")).toBe(false);
    });
  });

  describe("global operations", () => {
    it("expandAll раскрывает всю структуру и сотрудников", () => {
      const state = createExpandState({ initialCollapsedChildren: ["root", "dirA", "a1"] });
      const roots = [makeTree()];
      expandAll(state, roots);

      collectSubtreeDepartmentIds(makeTree()).forEach((id) => {
        expect(isChildrenCollapsed(state, id)).toBe(false);
        expect(isEmployeesExpanded(state, id)).toBe(true);
      });
    });

    it("collapseAll сворачивает всю структуру", () => {
      const state = createExpandState();
      expandAll(state, [makeTree()]);
      collapseAll(state, [makeTree()]);

      collectSubtreeDepartmentIds(makeTree()).forEach((id) => {
        expect(isChildrenCollapsed(state, id)).toBe(true);
        expect(isEmployeesExpanded(state, id)).toBe(false);
      });
    });
  });

  describe("hiddenEmployeeIds", () => {
    it("возвращает все подразделения, чьи сотрудники не раскрыты", () => {
      const state = createExpandState();
      const hidden = hiddenEmployeeIds(state, [makeTree()]);
      expect(hidden.has("dirA")).toBe(true);

      toggleEmployees(state, "dirA");
      const hidden2 = hiddenEmployeeIds(state, [makeTree()]);
      expect(hidden2.has("dirA")).toBe(false);
    });
  });
});
