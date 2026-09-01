import { describe, it, expect } from "vitest";
import {
  EXCLUDED_EMPLOYEE_STATES,
  isEmployeeExcludedByState,
  shouldKeepFullName,
  formatEmployeeDisplayName,
} from "./employee.js";

describe("employee.js · CR-016", () => {
  describe("isEmployeeExcludedByState", () => {
    it("должен исключать сотрудника со статусом «Отпуск по уходу за ребенком»", () => {
      expect(
        isEmployeeExcludedByState({ state: "Отпуск по уходу за ребенком" }),
      ).toBe(true);
    });

    it("должен нормализовать статус через trim (CR-016 §4)", () => {
      expect(
        isEmployeeExcludedByState({ state: "  Отпуск по уходу за ребенком  " }),
      ).toBe(true);
    });

    it("не должен исключать другие статусы", () => {
      expect(isEmployeeExcludedByState({ state: "Активен" })).toBe(false);
      expect(isEmployeeExcludedByState({ state: "Декретный отпуск" })).toBe(false);
      expect(isEmployeeExcludedByState({ state: "Отпуск по уходу за РЕБЕНКОМ" })).toBe(false);
    });

    it("должен корректно обрабатывать пустые и отсутствующие данные", () => {
      expect(isEmployeeExcludedByState({})).toBe(false);
      expect(isEmployeeExcludedByState(null)).toBe(false);
      expect(isEmployeeExcludedByState(undefined)).toBe(false);
      expect(isEmployeeExcludedByState({ state: "" })).toBe(false);
    });

    it("не должен использовать fuzzy/includes (строгое сравнение)", () => {
      expect(isEmployeeExcludedByState({ state: "Отпуск по уходу" })).toBe(false);
      expect(
        isEmployeeExcludedByState({ state: "Отпуск по уходу за ребенком, доп" }),
      ).toBe(false);
    });

    it("единственный источник статуса — EXCLUDED_EMPLOYEE_STATES", () => {
      expect(EXCLUDED_EMPLOYEE_STATES.has("Отпуск по уходу за ребенком")).toBe(true);
      expect(EXCLUDED_EMPLOYEE_STATES.size).toBe(1);
    });
  });

  describe("shouldKeepFullName", () => {
    it("top-3 сохраняют полное ФИО (CR-016 §20)", () => {
      expect(shouldKeepFullName("Селиванов Василий Геннадиевич")).toBe(true);
      expect(shouldKeepFullName("Лукьянов Алексей Александрович")).toBe(true);
      expect(shouldKeepFullName("Клюев Алексей Васильевич")).toBe(true);
    });

    it("Винник и Мишуев не относятся к top-3 (CR-016 §23, §31)", () => {
      expect(shouldKeepFullName("Винник Лев Арнольдович")).toBe(false);
      expect(shouldKeepFullName("Мишуев Александр Адольфович")).toBe(false);
    });

    it("остальные сотрудники — false", () => {
      expect(shouldKeepFullName("Елизарова Лаура Вячеславовна")).toBe(false);
      expect(shouldKeepFullName("Лихачева Екатерина Олеговна")).toBe(false);
      expect(shouldKeepFullName("Глазунов Всеволод Игоревич")).toBe(false);
    });

    it("нормализует пробелы и не сравнивает без учёта регистра", () => {
      expect(shouldKeepFullName("  Селиванов Василий Геннадиевич  ")).toBe(true);
      expect(shouldKeepFullName("селиванов василий геннадиевич")).toBe(false);
    });

    it("корректно обрабатывает пустые значения", () => {
      expect(shouldKeepFullName("")).toBe(false);
      expect(shouldKeepFullName(null)).toBe(false);
      expect(shouldKeepFullName(undefined)).toBe(false);
    });
  });

  describe("formatEmployeeDisplayName", () => {
    it("сокращает ФИО до «Фамилия Имя» (CR-016 §19, §22)", () => {
      expect(formatEmployeeDisplayName("Елизарова Лаура Вячеславовна")).toBe(
        "Елизарова Лаура",
      );
      expect(formatEmployeeDisplayName("Винник Лев Арнольдович")).toBe("Винник Лев");
      expect(formatEmployeeDisplayName("Мишуев Александр Адольфович")).toBe(
        "Мишуев Александр",
      );
      expect(formatEmployeeDisplayName("Лихачева Екатерина Олеговна")).toBe(
        "Лихачева Екатерина",
      );
      expect(formatEmployeeDisplayName("Глазунов Всеволод Игоревич")).toBe(
        "Глазунов Всеволод",
      );
    });

    it("keepFullName=true сохраняет полное ФИО (CR-016 §20)", () => {
      expect(
        formatEmployeeDisplayName("Селиванов Василий Геннадиевич", {
          keepFullName: true,
        }),
      ).toBe("Селиванов Василий Геннадиевич");
      expect(
        formatEmployeeDisplayName("Лукьянов Алексей Александрович", {
          keepFullName: true,
        }),
      ).toBe("Лукьянов Алексей Александрович");
      expect(
        formatEmployeeDisplayName("Клюев Алексей Васильевич", { keepFullName: true }),
      ).toBe("Клюев Алексей Васильевич");
    });

    it("не повреждает ФИО из двух частей (CR-016 §28)", () => {
      expect(formatEmployeeDisplayName("Сойдан Айкут")).toBe("Сойдан Айкут");
    });

    it("не формирует пустую вторую часть для односоставных имён (CR-016 §29)", () => {
      expect(formatEmployeeDisplayName("Иванов")).toBe("Иванов");
      expect(formatEmployeeDisplayName("Иванов")).not.toContain("undefined");
    });

    it("принимает объект сотрудника", () => {
      expect(
        formatEmployeeDisplayName({ full_name: "Давыдова Наталья Владимировна" }),
      ).toBe("Давыдова Наталья");
      expect(
        formatEmployeeDisplayName({ fullName: "Волкова Алина Викторовна" }),
      ).toBe("Волкова Алина");
      expect(formatEmployeeDisplayName({ name: "Кириллов Олег Сергеевич" })).toBe(
        "Кириллов Олег",
      );
    });

    it("не мутирует исходное full_name (CR-016 §26, §53)", () => {
      const employee = { full_name: "Елизарова Лаура Вячеславовна" };
      formatEmployeeDisplayName(employee);
      expect(employee.full_name).toBe("Елизарова Лаура Вячеславовна");
    });

    it("корректно обрабатывает пустые значения", () => {
      expect(formatEmployeeDisplayName("")).toBe("");
      expect(formatEmployeeDisplayName(null)).toBe("");
      expect(formatEmployeeDisplayName(undefined)).toBe("");
      expect(formatEmployeeDisplayName({})).toBe("");
    });
  });
});
