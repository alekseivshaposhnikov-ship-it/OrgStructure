import { describe, it, expect } from "vitest";
import {
  addLevels,
  cloneTree,
  shortPosition,
  parseSubLevel,
  findDepartmentById,
} from "./tree.js";

describe("core/utils/tree.js", () => {
  describe("addLevels", () => {
    it("должен проставлять level=0 для корневых узлов", () => {
      const tree = [{ name: "A", children: [] }];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
    });

    it("должен увеличивать level для вложенных узлов", () => {
      const tree = [{ name: "A", children: [{ name: "B", children: [] }] }];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
      expect(tree[0].children[0].level).toBe(1);
    });

    it("должен корректно работать с глубиной 2+", () => {
      const tree = [
        {
          name: "A",
          children: [
            {
              name: "B",
              children: [{ name: "C", children: [] }],
            },
          ],
        },
      ];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
      expect(tree[0].children[0].level).toBe(1);
      expect(tree[0].children[0].children[0].level).toBe(2);
    });

    it("не должен падать на пустом массиве", () => {
      expect(() => addLevels([])).not.toThrow();
    });

    it("не должен падать на узлах без children", () => {
      const tree = [{ name: "A" }];
      expect(() => addLevels(tree)).not.toThrow();
      expect(tree[0].level).toBe(0);
    });
  });

  describe("cloneTree", () => {
    it("должен создавать глубокую копию", () => {
      const base = [{ department_guid: "a", children: [{ id: 1 }] }];
      const cloned = cloneTree(base);
      expect(cloned).toEqual(base);
      cloned[0].department_name = "Изменено";
      expect(base[0].department_name).toBeUndefined();
    });

    it("должен возвращать [] для null/undefined", () => {
      expect(cloneTree(null)).toEqual([]);
      expect(cloneTree(undefined)).toEqual([]);
    });
  });

  describe("shortPosition", () => {
    it("должен обрезать должность по /", () => {
      expect(shortPosition("Главный инженер / отдел")).toBe("Главный инженер");
    });

    it("должен возвращать пустую строку для пустого значения", () => {
      expect(shortPosition("")).toBe("");
      expect(shortPosition(null)).toBe("");
    });

    it("должен обрезать пробелы", () => {
      expect(shortPosition("  Инженер  ")).toBe("Инженер");
    });
  });

  describe("parseSubLevel", () => {
    it("должен возвращать MAX_SAFE_INTEGER для пустых значений", () => {
      expect(parseSubLevel("")).toBe(Number.MAX_SAFE_INTEGER);
      expect(parseSubLevel(null)).toBe(Number.MAX_SAFE_INTEGER);
      expect(parseSubLevel(undefined)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("должен парсить число с запятой", () => {
      expect(parseSubLevel("2,5")).toBe(2.5);
      expect(parseSubLevel("3")).toBe(3);
    });

    it("должен возвращать MAX_SAFE_INTEGER для некорректного значения", () => {
      expect(parseSubLevel("abc")).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe("findDepartmentById", () => {
    it("должен находить узел на верхнем уровне", () => {
      const tree = [{ department_guid: "a", children: [] }];
      expect(findDepartmentById(tree, "a").department_guid).toBe("a");
    });

    it("должен находить вложенный узел", () => {
      const tree = [
        { department_guid: "a", children: [{ department_guid: "b", children: [] }] },
      ];
      expect(findDepartmentById(tree, "b").department_guid).toBe("b");
    });

    it("должен возвращать null, если узел не найден", () => {
      const tree = [{ department_guid: "a", children: [] }];
      expect(findDepartmentById(tree, "missing")).toBeNull();
      expect(findDepartmentById([], "x")).toBeNull();
    });
  });
});
