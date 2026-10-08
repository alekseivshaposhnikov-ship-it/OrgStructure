import { describe, it, expect, beforeEach } from "vitest";
import { renderUnifiedScreen } from "./unified-screen-renderer.js";
import { createExpandState } from "../domain/expand-state.js";

function makeTree() {
  return {
    department_guid: "root",
    department_name: "Холдинг",
    department_manager: "Директор",
    department_manager_position: "CEO",
    staffCount: 2,
    users: [
      { id: "u1", name: "Иван", full_name: "Иван", position: "Разработчик", isVacancy: false },
      { id: "u2", name: "Мария", full_name: "Мария", position: "Менеджер", isVacancy: false },
    ],
    children: [
      {
        department_guid: "child",
        department_name: "Отдел разработки",
        department_manager: "Пётр",
        department_manager_position: "Руководитель",
        staffCount: 1,
        users: [
          { id: "u3", name: "Пётр", full_name: "Пётр", position: "Тестировщик", isVacancy: false },
        ],
        children: [],
      },
    ],
  };
}

function makeBranches() {
  return {
    department_guid: "root",
    department_name: "Холдинг",
    department_manager: "Директор",
    department_manager_position: "CEO",
    users: [],
    children: [
      {
        department_guid: "childA",
        department_name: "Дирекция A",
        department_manager: "А",
        department_manager_position: "Руководитель",
        users: [],
        children: [
          {
            department_guid: "childA1",
            department_name: "Отдел A1",
            department_manager: "А1",
            department_manager_position: "Руководитель",
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
        users: [],
        children: [
          {
            department_guid: "childB1",
            department_name: "Отдел B1",
            department_manager: "Б1",
            department_manager_position: "Руководитель",
            users: [],
            children: [],
          },
        ],
      },
    ],
  };
}

function nodeExists(nodeId) {
  return Boolean(document.querySelector(`g.unified-node[data-node-id="${nodeId}"]`));
}

describe("unified-screen-renderer — CR-024", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="orgChart" style="width:800px;height:600px"></div>';
  });

  it("без collapseEmployees сотрудники видимы (совместимость)", () => {
    renderUnifiedScreen([makeTree()], "#orgChart", {});
    expect(document.querySelector(".employees-column")).toBeTruthy();
    expect(document.querySelector("[data-employees-toggle]")).toBeNull();
  });

  it("collapseEmployees прячет сотрудников и показывает кнопку «Сотрудники · N»", () => {
    renderUnifiedScreen([makeTree()], "#orgChart", { collapseEmployees: true });
    expect(document.querySelector(".employees-column")).toBeNull();

    const toggle = document.querySelector('[data-employees-toggle="root"]');
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toContain("Сотрудники · 2");
  });

  it("toggleEmployees независимо раскрывает сотрудников подразделения", () => {
    const chart = renderUnifiedScreen([makeTree()], "#orgChart", { collapseEmployees: true });
    chart.toggleEmployees("root");

    expect(document.querySelector('[data-employees-toggle="root"]')).toBeNull();
    expect(document.querySelector('[data-employee-id="u1"]')).toBeTruthy();
    // Сотрудники соседнего подразделения всё ещё скрыты.
    expect(document.querySelector('[data-employees-toggle="child"]')).toBeTruthy();
  });

  it("внешнее expandState сохраняет раскрытие между рендерами (CR-024 §2.5)", () => {
    const expandState = createExpandState();
    const chart = renderUnifiedScreen([makeBranches()], "#orgChart", {
      expandState,
      collapseEmployees: true,
    });
    chart.toggleCollapse("childA");
    expect(nodeExists("childA1")).toBe(false);

    // Повторный рендер с тем же состоянием не сбрасывает раскрытие.
    renderUnifiedScreen([makeBranches()], "#orgChart", { expandState, collapseEmployees: true });
    expect(nodeExists("childA1")).toBe(false);
  });

  it("expandNextLevel показывает только следующий уровень", () => {
    const chart = renderUnifiedScreen([makeBranches()], "#orgChart", {
      collapseEmployees: true,
      collapseTopLevel: true,
    });
    expect(nodeExists("childA1")).toBe(false);

    chart.expandNextLevel("childA");
    expect(nodeExists("childA1")).toBe(true);
    expect(nodeExists("childB1")).toBe(false);
  });

  it("expandAll раскрывает всю структуру, collapseAll сворачивает", () => {
    const chart = renderUnifiedScreen([makeBranches()], "#orgChart", {
      collapseEmployees: true,
      collapseTopLevel: true,
    });
    chart.expandAll();
    expect(nodeExists("childA1")).toBe(true);
    expect(nodeExists("childB1")).toBe(true);

    chart.collapseAll();
    expect(nodeExists("root")).toBe(true);
    expect(nodeExists("childA")).toBe(false);
  });

  it("revealPath раскрывает путь и показывает сотрудника", () => {
    const chart = renderUnifiedScreen([makeTree()], "#orgChart", {
      collapseEmployees: true,
      collapseTopLevel: true,
    });

    chart.revealPath(["root", "child"], "u3", "child");
    expect(document.querySelector('[data-employee-id="u3"]')).toBeTruthy();
  });
});
