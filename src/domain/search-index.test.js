import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  searchEmployees,
  normalizeSearchText,
  formatSearchPath,
  MIN_SEARCH_LENGTH,
} from "./search-index.js";

function makeTree() {
  return [
    {
      department_guid: "dir-it",
      department_name: "Дирекция по ИТ",
      department_manager: "Петров Пётр Петрович",
      department_manager_position: "ИТ-директор",
      users: [
        {
          id: "u1",
          full_name: "Иванов Иван Иванович",
          name: "Иванов Иван Иванович",
          position: "Ведущий разработчик",
        },
        {
          id: "u2",
          full_name: "Сидорова Мария",
          name: "Сидорова Мария",
          position: "Аналитик",
        },
        { id: "v1", full_name: "Вакансия", isVacancy: true, position: "Тестировщик" },
      ],
      children: [
        {
          department_guid: "dept-dev",
          department_name: "Отдел разработки",
          users: [
            {
              id: "u3",
              full_name: "Иванов Сергей Петрович",
              name: "Иванов Сергей Петрович",
              position: "Разработчик",
            },
          ],
          children: [],
        },
      ],
    },
  ];
}

describe("search-index.js (CR-024 §4)", () => {
  it("normalizeSearchText приводит регистр и ё→е", () => {
    expect(normalizeSearchText("Пётр")).toBe("петр");
    expect(normalizeSearchText("  Иван   Иванович ")).toBe("иван иванович");
  });

  it("MIN_SEARCH_LENGTH = 2", () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
  });

  describe("buildSearchIndex", () => {
    it("индексирует сотрудников и руководителей с путём", () => {
      const index = buildSearchIndex(makeTree());
      const names = index.map((e) => e.fullName);

      expect(names).toContain("Иванов Иван Иванович");
      expect(names).toContain("Петров Пётр Петрович");
      expect(names).toContain("Иванов Сергей Петрович");
    });

    it("исключает вакансии", () => {
      const index = buildSearchIndex(makeTree());
      expect(index.some((e) => e.fullName === "Вакансия")).toBe(false);
    });

    it("сохраняет расположение (Дирекция → Отдел)", () => {
      const index = buildSearchIndex(makeTree());
      const sergey = index.find((e) => e.id === "u3");
      expect(sergey.path).toEqual(["Дирекция по ИТ", "Отдел разработки"]);
      expect(formatSearchPath(sergey)).toBe("Дирекция по ИТ → Отдел разработки");
    });

    it("для руководителя фокусируется на карточке подразделения", () => {
      const index = buildSearchIndex(makeTree());
      const manager = index.find((e) => e.isManager);
      expect(manager.focusId).toBe("dir-it");
    });
  });

  describe("searchEmployees", () => {
    const index = buildSearchIndex(makeTree());

    it("не ищет при вводе одного символа", () => {
      expect(searchEmployees(index, "и")).toEqual([]);
    });

    it("находит по части фамилии", () => {
      const results = searchEmployees(index, "иван");
      expect(results.map((r) => r.fullName)).toEqual(
        expect.arrayContaining(["Иванов Иван Иванович", "Иванов Сергей Петрович"]),
      );
    });

    it("находит по имени", () => {
      const results = searchEmployees(index, "мария");
      expect(results[0].fullName).toBe("Сидорова Мария");
    });

    it("эквивалентность е/ё", () => {
      const results = searchEmployees(index, "петр");
      expect(results.map((r) => r.fullName)).toContain("Петров Пётр Петрович");
    });

    it("поиск без учёта регистра", () => {
      expect(searchEmployees(index, "ИВАНОВ").length).toBe(2);
    });

    it("сочетание фамилии и имени", () => {
      const results = searchEmployees(index, "иванов сер");
      expect(results.map((r) => r.id)).toContain("u3");
    });
  });
});
