import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EXPANSION_ACTIONS,
  handleExpansionAction,
  initExpandControls,
  highlightSearchCard,
  buildPdfLayoutOptions,
} from "./orgchart.js";
import { createExpandState } from "../domain/expand-state.js";

describe("orgchart CR-024 (раскрытие веток)", () => {
  it("EXPANSION_ACTIONS содержит три операции раскрытия", () => {
    expect(EXPANSION_ACTIONS.map((a) => a.id)).toEqual([
      "expandNextLevel",
      "expandBranch",
      "collapseBranch",
    ]);
    expect(EXPANSION_ACTIONS.every((a) => a.label)).toBe(true);
  });

  it("handleExpansionAction маршрутизирует операцию на chart", () => {
    const chart = {
      expandNextLevel: vi.fn(),
      expandBranch: vi.fn(),
      collapseBranch: vi.fn(),
    };
    const state = { chart };

    handleExpansionAction(state, "expandNextLevel", "d1");
    handleExpansionAction(state, "expandBranch", "d1");
    handleExpansionAction(state, "collapseBranch", "d1");

    expect(chart.expandNextLevel).toHaveBeenCalledWith("d1");
    expect(chart.expandBranch).toHaveBeenCalledWith("d1");
    expect(chart.collapseBranch).toHaveBeenCalledWith("d1");
  });

  it("handleExpansionAction безопасен без chart/id", () => {
    expect(() => handleExpansionAction({}, "expandBranch", "d1")).not.toThrow();
    expect(() => handleExpansionAction({ chart: {} }, "expandBranch", "")).not.toThrow();
  });

  describe("initExpandControls", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button id="expandAll"></button>
        <button id="collapseAll"></button>
      `;
    });

    it("связывает кнопки с chart.expandAll / collapseAll", () => {
      const chart = { expandAll: vi.fn(), collapseAll: vi.fn() };
      initExpandControls({ chart });

      document.getElementById("expandAll").click();
      document.getElementById("collapseAll").click();

      expect(chart.expandAll).toHaveBeenCalledTimes(1);
      expect(chart.collapseAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("buildPdfLayoutOptions (CR-024 §5)", () => {
    it("добавляет состояние раскрытия подразделений и видимости сотрудников", () => {
      const state = {
        cardDesign: "grouped",
        showLevels: false,
        expandState: createExpandState({ initialCollapsedChildren: ["d1"] }),
      };
      const root = { department_guid: "d1", children: [] };

      const options = buildPdfLayoutOptions(state, root);

      expect(options.groupByPosition).toBe(true);
      expect(options.collapsedIds).toBe(state.expandState.childrenCollapsed);
      expect(options.hiddenEmployeeIds.has("d1")).toBe(true);
    });

    it("без expandState возвращает опции экрана без раскрытия", () => {
      const options = buildPdfLayoutOptions({ cardDesign: "classic", showLevels: false }, {});
      expect(options.collapsedIds).toBeUndefined();
      expect(options.hiddenEmployeeIds).toBeUndefined();
    });
  });

  describe("highlightSearchCard", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="orgChart">
          <div data-employee-id="u1" class="chart-card"></div>
        </div>
      `;
    });

    it("подсвечивает найденную карточку по id", () => {
      highlightSearchCard("u1");
      expect(document.querySelector('[data-employee-id="u1"]').classList.contains("search-hit")).toBe(
        true,
      );
    });

    it("безопасно игнорирует отсутствующую карточку", () => {
      expect(() => highlightSearchCard("missing")).not.toThrow();
    });
  });
});
