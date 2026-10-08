import { describe, it, expect } from "vitest";
import {
  buildEmployeePresentations,
  normalizePositionKey,
  normalizePersonKey,
  GROUPED_CARD_DESIGN,
} from "./grouping.js";

function user(overrides = {}) {
  return {
    id: overrides.id || `u-${Math.random().toString(16).slice(2)}`,
    full_name: overrides.full_name || "Иванов Иван Иванович",
    name: overrides.full_name || "Иванов Иван Иванович",
    position: overrides.position || "Специалист",
    isVacancy: overrides.isVacancy || false,
    ...overrides,
  };
}

describe("grouping.js (CR-023)", () => {
  describe("normalizePositionKey", () => {
    it("отсекает служебную часть с подразделением и юр. лицом", () => {
      expect(
        normalizePositionKey(
          'Главный инженер проекта /Отдел главных инженеров проекта/, (ООО "СЕВЕРНЫЙ ПОРТ 5")',
        ),
      ).toBe("главный инженер проекта");
    });

    it("игнорирует регистр и лишние пробелы", () => {
      expect(normalizePositionKey("  Ведущий   Юрисконсульт  ")).toBe(
        "ведущий юрисконсульт",
      );
    });

    it("отсекает юр. лицо в скобках даже без «/»", () => {
      expect(normalizePositionKey('Специалист, (ООО "Ромашка")')).toBe("специалист");
    });

    it("не считает разные должности одинаковыми по частичному совпадению", () => {
      expect(normalizePositionKey("Главный специалист")).not.toBe(
        normalizePositionKey("Специалист"),
      );
      expect(normalizePositionKey("Ведущий инженер проекта")).not.toBe(
        normalizePositionKey("Главный инженер проекта"),
      );
    });

    it("возвращает пустую строку для пустой должности", () => {
      expect(normalizePositionKey("")).toBe("");
      expect(normalizePositionKey(null)).toBe("");
    });
  });

  describe("buildEmployeePresentations", () => {
    it("в обычном режиме (groupByPosition=false) возвращает одиночные карточки", () => {
      const out = buildEmployeePresentations(
        [user({ id: "1" }), user({ id: "2" })],
        { groupByPosition: false },
      );
      expect(out).toHaveLength(2);
      expect(out.every((item) => item.type === "person")).toBe(true);
    });

    it("объединяет три одинаковые должности в одну группу (сценарий 1)", () => {
      const out = buildEmployeePresentations(
        [
          user({ id: "1", full_name: "Дрожжина Анжела Петровна", position: "Главный инженер проекта" }),
          user({ id: "2", full_name: "Пермяков Александр Игоревич", position: "Главный инженер проекта" }),
          user({ id: "3", full_name: "Пинигин Илья Сергеевич", position: "Главный инженер проекта" }),
        ],
        { groupByPosition: true },
      );

      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("group");
      expect(out[0].position).toBe("Главный инженер проекта");
      expect(out[0].members).toHaveLength(3);
    });

    it("не объединяет разные должности (сценарий 2)", () => {
      const out = buildEmployeePresentations(
        [
          user({ position: "Специалист" }),
          user({ position: "Ведущий специалист" }),
          user({ position: "Главный специалист" }),
        ],
        { groupByPosition: true },
      );
      expect(out.every((item) => item.type === "person")).toBe(true);
      expect(out).toHaveLength(3);
    });

    it("игнорирует различия юр. лиц в должности (группирует)", () => {
      const out = buildEmployeePresentations(
        [
          user({ full_name: "Петров Петр", position: 'Специалист /Отдел/, (ООО "A")' }),
          user({ full_name: "Сидоров Семен", position: 'Специалист /Отдел/, (ООО "B")' }),
        ],
        { groupByPosition: true },
      );
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("group");
    });

    it("одиночная должность остаётся компактной карточкой без счётчика (сценарий 4)", () => {
      const out = buildEmployeePresentations(
        [user({ position: "Уникальная должность" })],
        { groupByPosition: true },
      );
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("person");
    });

    it("не выводит одного и того же человека дважды внутри группы (сценарий 5)", () => {
      const out = buildEmployeePresentations(
        [
          user({ id: "1", full_name: "Лукьянов Алексей Александрович", position: "Операционный директор" }),
          user({ id: "2", full_name: "Лукьянов Алексей Александрович", position: "Операционный директор" }),
          user({ id: "3", full_name: "Лукьянов Алексей Александрович", position: "Операционный директор" }),
        ],
        { groupByPosition: true },
      );
      expect(out[0].type).toBe("person");
      expect(out[0].data.full_name).toBe("Лукьянов Алексей Александрович");
    });

    it("группирует людей с одинаковой должностью, дедуплицируя повторы записей", () => {
      const out = buildEmployeePresentations(
        [
          user({ id: "1", full_name: "Лукьянов Алексей Александрович", position: "Операционный директор" }),
          user({ id: "2", full_name: "Лукьянов Алексей Александрович", position: "Операционный директор" }),
          user({ id: "3", full_name: "Абрамова Елена Александровна", position: "Операционный директор" }),
        ],
        { groupByPosition: true },
      );
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe("group");
      expect(out[0].members).toHaveLength(2);
    });

    it("не смешивает вакансии с работающими сотрудниками (§4.5)", () => {
      const out = buildEmployeePresentations(
        [
          user({ full_name: "Петров Петр", position: "Специалист" }),
          user({ full_name: "Сидоров Семен", position: "Специалист" }),
          user({ position: "Специалист", isVacancy: true, id: "v1" }),
          user({ position: "Специалист", isVacancy: true, id: "v2" }),
        ],
        { groupByPosition: true },
      );

      const groups = out.filter((item) => item.type === "group");
      const persons = out.filter((item) => item.type === "person");
      expect(groups).toHaveLength(1);
      expect(groups[0].members).toHaveLength(2);
      expect(persons).toHaveLength(2);
      expect(persons.every((item) => item.data.isVacancy)).toBe(true);
    });

    it("сохраняет порядок первого появления должности", () => {
      const out = buildEmployeePresentations(
        [
          user({ position: "B", full_name: "Борисов Борис" }),
          user({ position: "A", full_name: "Антонов Антон" }),
          user({ position: "B", full_name: "Бельский Богдан" }),
        ],
        { groupByPosition: true },
      );
      expect(
        out.map((item) => (item.type === "group" ? item.position : item.data.position)),
      ).toEqual(["B", "A"]);
    });

    it("экспортирует идентификатор режима grouped", () => {
      expect(GROUPED_CARD_DESIGN).toBe("grouped");
    });
  });

  describe("normalizePersonKey", () => {
    it("игнорирует лишние пробелы и регистр", () => {
      expect(normalizePersonKey("  ЛуКьянов  Алексей ")).toBe("лукьянов алексей");
    });
  });
});
