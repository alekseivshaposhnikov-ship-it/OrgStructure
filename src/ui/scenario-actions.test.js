import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getContextActions, handleScenarioAction, openContextMenu } from "./scenario-actions.js";
import { createScenario } from "../domain/scenario-manager.js";

function makeDepartment() {
  return {
    department_guid: "d1",
    department_name: "Отдел",
    department_manager: "",
    department_manager_position: "",
    staffCount: 1,
    vacancyCount: 0,
    totalWithVacancies: 1,
    users: [
      {
        id: "u1",
        full_name: "Иван",
        name: "Иван",
        position: "Разработчик",
        rawPosition: "Разработчик",
        isVacancy: false,
        subLevel: 1,
      },
    ],
    children: [],
  };
}

describe("scenario-actions (Фаза 2/5)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scenarioModal" class="hidden">
        <h2 id="scenarioModalTitle"></h2>
        <form id="scenarioForm"></form>
      </div>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getContextActions", () => {
    it("должен возвращать полный набор действий для department", () => {
      const actions = getContextActions("department");
      const ids = actions.map((action) => action.id);

      expect(ids).toEqual([
        "addDepartment",
        "addEmployee",
        "addVacancy",
        "editDepartment",
        "moveDepartment",
        "removeDepartment",
      ]);
      expect(actions.every((action) => action.label)).toBe(true);
    });

    it("должен возвращать действия для vacancy", () => {
      const ids = getContextActions("vacancy").map((action) => action.id);
      expect(ids).toEqual(["editVacancy", "moveVacancy", "removeVacancy"]);
    });

    it("должен возвращать действия для employee по умолчанию", () => {
      const ids = getContextActions("employee").map((action) => action.id);
      expect(ids).toEqual(["editEmployee", "moveEmployee", "removeEmployee"]);
    });
  });

  describe("handleScenarioAction", () => {
    it("removeEmployee должен удалять сотрудника после подтверждения", () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      const state = { scenario: createScenario([makeDepartment()]) };
      const afterChange = vi.fn();

      handleScenarioAction({
        action: "removeEmployee",
        node: { id: "u1" },
        state,
        afterChange,
      });

      expect(afterChange).toHaveBeenCalledTimes(1);
      expect(state.scenario.workingTree[0].users).toHaveLength(0);
    });

    it("removeEmployee не должен удалять без подтверждения", () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      const state = { scenario: createScenario([makeDepartment()]) };
      const afterChange = vi.fn();

      handleScenarioAction({
        action: "removeEmployee",
        node: { id: "u1" },
        state,
        afterChange,
      });

      expect(afterChange).not.toHaveBeenCalled();
      expect(state.scenario.workingTree[0].users).toHaveLength(1);
    });

    it("addDepartment должен открывать форму", () => {
      const state = { scenario: createScenario([makeDepartment()]) };
      const afterChange = vi.fn();

      handleScenarioAction({
        action: "addDepartment",
        node: { id: "d1" },
        state,
        afterChange,
      });

      const modal = document.getElementById("scenarioModal");
      expect(modal.classList.contains("hidden")).toBe(false);
      expect(document.getElementById("scenarioModalTitle").textContent).toBe(
        "Добавить подразделение",
      );
    });

    it("addDepartment через форму должен применить изменение сценария", () => {
      const state = { scenario: createScenario([makeDepartment()]) };
      const afterChange = vi.fn();

      handleScenarioAction({
        action: "addDepartment",
        node: { id: "d1" },
        state,
        afterChange,
      });

      const form = document.getElementById("scenarioForm");
      form.querySelector('input[name="department_name"]').value = "Новый отдел";
      form.dispatchEvent(new Event("submit"));

      expect(afterChange).toHaveBeenCalledTimes(1);
      expect(state.scenario.workingTree[0].children[0].department_name).toBe("Новый отдел");
    });

    it("editEmployee должен открывать форму с данными сотрудника", () => {
      const state = { scenario: createScenario([makeDepartment()]) };
      const afterChange = vi.fn();

      handleScenarioAction({
        action: "editEmployee",
        node: { id: "u1", full_name: "Иван", position: "Разработчик" },
        state,
        afterChange,
      });

      const input = document.querySelector('input[name="full_name"]');
      expect(input).toBeTruthy();
      expect(input.value).toBe("Иван");
    });
  });

  describe("openContextMenu", () => {
    it("должен создавать меню с действиями", () => {
      openContextMenu({
        x: 10,
        y: 20,
        node: { id: "d1" },
        nodeType: "department",
        onAction: () => {},
      });

      const menu = document.querySelector(".scenario-context-menu");
      expect(menu).toBeTruthy();
      expect(menu.querySelectorAll("button").length).toBe(6);
    });

    it("должен вызывать onAction при клике на пункт", () => {
      const onAction = vi.fn();
      openContextMenu({
        x: 0,
        y: 0,
        node: { id: "d1" },
        nodeType: "department",
        onAction,
      });

      document.querySelectorAll(".scenario-context-menu button")[0].click();

      expect(onAction).toHaveBeenCalledWith("addDepartment", { id: "d1" });
      expect(document.querySelector(".scenario-context-menu")).toBeNull();
    });

    it("должен добавлять extraActions (CR-024 раскрытие ветки) перед сценарными действиями", () => {
      openContextMenu({
        x: 0,
        y: 0,
        node: { id: "d1" },
        nodeType: "department",
        extraActions: [
          { id: "expandNextLevel", label: "Раскрыть следующий уровень" },
          { id: "expandBranch", label: "Развернуть всю ветку" },
        ],
        onAction: () => {},
      });

      const buttons = [...document.querySelectorAll(".scenario-context-menu button")];
      expect(buttons.length).toBe(8);
      expect(buttons[0].textContent.trim()).toBe("Раскрыть следующий уровень");
      expect(buttons[1].textContent.trim()).toBe("Развернуть всю ветку");
    });
  });
});

