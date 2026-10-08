import { describe, it, expect } from "vitest";
import {
  getExportTitle,
  getExportSubtitle,
  getDepartmentNodeHeight,
  isHoldingRoot,
} from "./orgchart.js";

describe("orgchart (Фаза 2)", () => {
  describe("getExportTitle", () => {
    it("должен возвращать название подразделения", () => {
      expect(getExportTitle({ department_name: "Холдинг" })).toBe("Холдинг");
    });

    it("должен возвращать fallback для пустого узла", () => {
      expect(getExportTitle(null)).toBe("Организационная структура");
      expect(getExportTitle({})).toBe("Организационная структура");
    });
  });

  describe("getExportSubtitle", () => {
    it("должен собирать подпись из режима, вакансий и фамилий", () => {
      const subtitle = getExportSubtitle({
        viewMode: "to-be",
        showVacancies: true,
        hideNames: false,
      });

      expect(subtitle).toContain("Целевая структура");
      expect(subtitle).toContain("с фамилиями");
    });

    it("должен учитывать скрытые вакансии и фамилии", () => {
      const subtitle = getExportSubtitle({
        viewMode: "as-is",
        showVacancies: false,
        hideNames: true,
      });

      expect(subtitle).toContain("Текущая структура");
      expect(subtitle).toContain("без вакансий");
      expect(subtitle).toContain("по должностям");
    });

    it("должен использовать fallback для неизвестного режима", () => {
      const subtitle = getExportSubtitle({
        viewMode: "unknown",
        showVacancies: true,
        hideNames: false,
      });

      expect(subtitle).toContain("Организационная структура");
    });
  });

  describe("getDepartmentNodeHeight", () => {
    it("должен возвращать высоту сотрудника по умолчанию", () => {
      expect(getDepartmentNodeHeight({ isDepartment: false }, "classic")).toBe(96);
    });

    it("должен учитывать дизайн карточек", () => {
      expect(getDepartmentNodeHeight({ isDepartment: true }, "classic")).toBe(104);
      expect(getDepartmentNodeHeight({ isDepartment: true }, "variant2")).toBe(176);
      expect(getDepartmentNodeHeight({ isDepartment: true }, "variant3")).toBe(158);
    });

    it("должен добавлять высоту ассистента", () => {
      expect(
        getDepartmentNodeHeight({ isDepartment: true, assistant: {} }, "classic"),
      ).toBe(104 + 44);
    });
  });

  describe("isHoldingRoot (CR-012)", () => {
    it("определяет синтетический корень Холдинга по структурному маркеру", () => {
      expect(isHoldingRoot({ department_guid: "synthetic-root" })).toBe(true);
    });

    it("не считает конкретную Дирекцию корнем Холдинга", () => {
      expect(
        isHoldingRoot({ department_guid: "dir-it", department_name: "Дирекция по ИТ" }),
      ).toBe(false);
    });

    it("безопасно обрабатывает null/undefined/пустой объект", () => {
      expect(isHoldingRoot(null)).toBe(false);
      expect(isHoldingRoot(undefined)).toBe(false);
      expect(isHoldingRoot({})).toBe(false);
    });
  });
});
