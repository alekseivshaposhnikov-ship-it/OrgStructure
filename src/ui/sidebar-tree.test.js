import { describe, it, expect, beforeEach } from "vitest";
import { createSyntheticRoot, buildTreeView } from "./sidebar-tree.js";

describe("sidebar-tree (Фаза 5)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("createSyntheticRoot", () => {
    it("должен агрегировать статистику и подставлять детей", () => {
      const root = createSyntheticRoot([
        { department_guid: "a", staffCount: 2, vacancyCount: 1, children: [] },
        { department_guid: "b", staffCount: 3, vacancyCount: 0, children: [] },
      ]);

      expect(root.department_guid).toBe("synthetic-root");
      expect(root.department_name).toBe("Холдинг LEGENDA");
      expect(root.staffCount).toBe(5);
      expect(root.vacancyCount).toBe(1);
      expect(root.totalWithVacancies).toBe(6);
      expect(root.children).toHaveLength(2);
      expect(Array.isArray(root.users)).toBe(true);
    });

    it("должен корректно обрабатывать пустой массив", () => {
      const root = createSyntheticRoot([]);
      expect(root.staffCount).toBe(0);
      expect(root.vacancyCount).toBe(0);
    });
  });

  describe("buildTreeView", () => {
    function mount(nodes, onSelect = () => {}) {
      const container = document.createElement("div");
      document.body.appendChild(container);
      return {
        container,
        result: buildTreeView({
          nodes,
          container,
          selectedNode: null,
          onSelect,
        }),
      };
    }

    it("должен рендерить дерево с labels", () => {
      const { container } = mount([
        { department_guid: "a", department_name: "Отдел А", children: [] },
      ]);

      const labels = container.querySelectorAll(".dept-label");
      // synthetic root + Отдел А
      expect(labels.length).toBe(2);
      expect(labels[1].textContent).toBe("Отдел А");
    });

    it("должен возвращать свежий synthetic root при выбранном synthetic-root", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const result = buildTreeView({
        nodes: [{ department_guid: "a", department_name: "Отдел А", children: [] }],
        container,
        selectedNode: { department_guid: "synthetic-root" },
        onSelect: () => {},
      });

      expect(result.department_guid).toBe("synthetic-root");
      expect(result.staffCount).toBe(0);
    });

    it("должен возвращать null, если selectedNode не задан", () => {
      const { result } = mount([{ department_guid: "a", children: [] }]);
      expect(result).toBeNull();
    });

    it("должен вызывать onSelect при клике на узел", () => {
      let selected = null;
      const { container } = mount(
        [{ department_guid: "a", department_name: "Отдел А", children: [] }],
        (node) => {
          selected = node;
        },
      );

      container.querySelectorAll(".dept-label")[1].click();

      expect(selected).toBeTruthy();
      expect(selected.department_guid).toBe("a");
    });

    it("должен подсвечивать выбранный узел", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      buildTreeView({
        nodes: [{ department_guid: "a", department_name: "Отдел А", children: [] }],
        container,
        selectedNode: { department_guid: "a", department_name: "Отдел А" },
        onSelect: () => {},
      });

      expect(container.querySelectorAll(".dept-label")[1].classList.contains("selected")).toBe(true);
    });
  });
});
