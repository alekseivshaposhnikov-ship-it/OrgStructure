import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getOperationIcon,
  getOperationTitle,
  formatDiff,
  renderStats,
  renderChangesList,
  focusEntity,
  openCompareModal,
  closeCompareModal,
} from "./changes-panel.js";

function makeScenario(operations = []) {
  return {
    baseTree: [],
    workingTree: [],
    operations,
  };
}

function makeOperation(overrides = {}) {
  return {
    id: "op1",
    type: "addDepartment",
    entityId: "dept1",
    title: "Отдел разработки",
    ...overrides,
  };
}

describe("changes-panel (Фаза 2/5)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scenarioStats"></div>
      <div id="changesList"></div>
      <span id="changesCount"></span>
      <div id="compareModal" class="hidden">
        <div id="compareContent"></div>
      </div>
    `;
  });

  describe("getOperationIcon", () => {
    it("должен возвращать иконки для типов операций", () => {
      expect(getOperationIcon("addDepartment")).toBe("+");
      expect(getOperationIcon("removeEmployee")).toBe("−");
      expect(getOperationIcon("moveVacancy")).toBe("⇄");
      expect(getOperationIcon("editDepartment")).toBe("✎");
    });

    it("должен возвращать дефолтную иконку для неизвестного типа", () => {
      expect(getOperationIcon("unknown")).toBe("•");
    });
  });

  describe("getOperationTitle", () => {
    it("должен возвращать заголовки для известных операций", () => {
      expect(getOperationTitle("addDepartment")).toBe("Добавлено подразделение");
      expect(getOperationTitle("removeEmployee")).toBe("Удален сотрудник");
      expect(getOperationTitle("moveVacancy")).toBe("Перемещена вакансия");
    });

    it("должен возвращать fallback для неизвестного типа", () => {
      expect(getOperationTitle("unknown")).toBe("Изменение");
    });
  });

  describe("formatDiff", () => {
    it("должен добавлять + для положительных значений", () => {
      expect(formatDiff(3)).toBe("+3");
    });

    it("должен форматировать отрицательные и нулевые значения", () => {
      expect(formatDiff(-1)).toBe("-1");
      expect(formatDiff(0)).toBe("0");
    });
  });

  describe("renderStats", () => {
    it("должен заполнять блок статистики", () => {
      renderStats(makeScenario());

      const statsEl = document.getElementById("scenarioStats");
      expect(statsEl.textContent).toContain("Сотрудники");
      expect(statsEl.textContent).toContain("Подразделения");
    });
  });

  describe("renderChangesList", () => {
    it("должен выводить количество и список изменений", () => {
      renderChangesList(
        makeScenario([makeOperation(), makeOperation({ id: "op2", title: "Отдел ИТ" })]),
        () => {},
      );

      expect(document.getElementById("changesCount").textContent).toBe("2");
      expect(document.querySelectorAll(".change-item").length).toBe(2);
    });

    it("должен выводить empty state при отсутствии изменений", () => {
      renderChangesList(makeScenario(), () => {});

      expect(document.getElementById("changesList").textContent).toContain(
        "Изменений пока нет",
      );
    });

    it("должен вызывать onFocus при клике на изменение", () => {
      const onFocus = vi.fn();
      renderChangesList(makeScenario([makeOperation()]), onFocus);

      document.querySelector(".change-item").click();

      expect(onFocus).toHaveBeenCalledWith("dept1");
    });
  });

  describe("focusEntity", () => {
    it("должен центрировать узел в chart", () => {
      const setCentered = vi.fn(() => ({ render: vi.fn() }));
      const chart = { setCentered };

      focusEntity("dept1", chart);

      expect(setCentered).toHaveBeenCalledWith("dept1");
    });

    it("должен безопасно игнорировать отсутствие chart", () => {
      expect(() => focusEntity("dept1", null)).not.toThrow();
      expect(() => focusEntity(null, {})).not.toThrow();
    });
  });

  describe("openCompareModal / closeCompareModal", () => {
    it("должен открывать и заполнять модалку сравнения", () => {
      openCompareModal(makeScenario());

      const modal = document.getElementById("compareModal");
      expect(modal.classList.contains("hidden")).toBe(false);
      expect(document.getElementById("compareContent").textContent).toContain("Было");
    });

    it("должен закрывать модалку", () => {
      openCompareModal(makeScenario());
      closeCompareModal();

      expect(document.getElementById("compareModal").classList.contains("hidden")).toBe(true);
    });
  });
});

