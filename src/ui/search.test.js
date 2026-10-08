import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initEmployeeSearch, isWithinSelection } from "./search.js";

function makeEntry(overrides = {}) {
  return {
    id: "u1",
    fullName: "Иванов Иван Иванович",
    displayName: "Иванов Иван",
    position: "Разработчик",
    departmentId: "dept-1",
    departmentName: "Отдел разработки",
    path: ["Дирекция по ИТ", "Отдел разработки"],
    pathIds: ["dir-it", "dept-1"],
    focusId: "u1",
    searchName: "иванов иван иванович",
    ...overrides,
  };
}

describe("search.js (CR-024 §4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <input id="employeeSearch" type="text" />
      <button id="searchClear" type="button">×</button>
      <button id="searchReturn" type="button" class="hidden"></button>
      <div id="searchResults" class="hidden"></div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isWithinSelection", () => {
    it("всё входит в синтетический корень Холдинга", () => {
      expect(
        isWithinSelection(makeEntry(), { department_guid: "synthetic-root" }),
      ).toBe(true);
    });

    it("определяет сотрудника внутри выбранного подразделения", () => {
      const node = {
        department_guid: "dir-it",
        children: [{ department_guid: "dept-1", children: [] }],
      };
      expect(isWithinSelection(makeEntry(), node)).toBe(true);
    });

    it("определяет сотрудника вне выбранного подразделения", () => {
      const node = { department_guid: "dir-other", children: [] };
      expect(isWithinSelection(makeEntry(), node)).toBe(false);
    });
  });

  describe("initEmployeeSearch", () => {
    it("показывает результаты после ввода двух символов", () => {
      const index = [makeEntry()];
      initEmployeeSearch({ getIndex: () => index, getSelectedNode: () => null });

      const input = document.getElementById("employeeSearch");
      input.value = "ив";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);

      expect(document.querySelectorAll(".search-result").length).toBe(1);
      expect(document.getElementById("searchResults").classList.contains("hidden")).toBe(false);
    });

    it("не ищет при одном символе", () => {
      initEmployeeSearch({ getIndex: () => [makeEntry()], getSelectedNode: () => null });
      const input = document.getElementById("employeeSearch");
      input.value = "и";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);

      expect(document.getElementById("searchResults").classList.contains("hidden")).toBe(true);
    });

    it("показывает сообщение, если совпадений нет", () => {
      initEmployeeSearch({ getIndex: () => [], getSelectedNode: () => null });
      const input = document.getElementById("employeeSearch");
      input.value = "zz";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);

      expect(document.getElementById("searchResults").textContent).toContain(
        "Сотрудники не найдены",
      );
    });

    it("вызывает onSelect для сотрудника внутри фильтра", () => {
      const onSelect = vi.fn();
      initEmployeeSearch({
        getIndex: () => [makeEntry()],
        getSelectedNode: () => ({ department_guid: "synthetic-root" }),
        onSelect,
      });
      const input = document.getElementById("employeeSearch");
      input.value = "иванов";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);

      document.querySelector(".search-result").click();
      expect(onSelect).toHaveBeenCalledWith(makeEntry());
    });

    it("показывает сообщение о поиске вне фильтра и вызывает onNavigate", () => {
      const onNavigate = vi.fn();
      initEmployeeSearch({
        getIndex: () => [makeEntry()],
        getSelectedNode: () => ({ department_guid: "dir-other", children: [] }),
        onNavigate,
      });
      const input = document.getElementById("employeeSearch");
      input.value = "иванов";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);

      document.querySelector(".search-result").click();
      expect(document.getElementById("searchResults").textContent).toContain(
        "Сотрудник найден вне текущего фильтра",
      );

      document.querySelector("[data-search-navigate]").click();
      expect(onNavigate).toHaveBeenCalledWith(makeEntry());
    });

    it("закрывает список по Escape", () => {
      initEmployeeSearch({ getIndex: () => [makeEntry()], getSelectedNode: () => null });
      const input = document.getElementById("employeeSearch");
      input.value = "иванов";
      input.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(200);
      expect(document.getElementById("searchResults").classList.contains("hidden")).toBe(false);

      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(document.getElementById("searchResults").classList.contains("hidden")).toBe(true);
    });

    it("очищает строку поиска", () => {
      const controller = initEmployeeSearch({
        getIndex: () => [makeEntry()],
        getSelectedNode: () => null,
      });
      const input = document.getElementById("employeeSearch");
      input.value = "иванов";
      controller.clear();

      expect(input.value).toBe("");
      expect(document.getElementById("searchResults").classList.contains("hidden")).toBe(true);
    });

    it("setReturn показывает и скрывает кнопку возврата", () => {
      const controller = initEmployeeSearch({ getIndex: () => [], getSelectedNode: () => null });
      const returnButton = document.getElementById("searchReturn");

      controller.setReturn("← Вернуться", () => {});
      expect(returnButton.classList.contains("hidden")).toBe(false);
      expect(returnButton.textContent).toBe("← Вернуться");

      controller.setReturn(null, null);
      expect(returnButton.classList.contains("hidden")).toBe(true);
    });
  });
});
