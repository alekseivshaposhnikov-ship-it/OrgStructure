import { describe, it, expect, beforeEach } from "vitest";
import {
  openScenarioForm,
  closeScenarioModal,
  renderFormField,
} from "./scenario-forms.js";

describe("scenario-forms (Фаза 2)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scenarioModal" class="hidden">
        <h2 id="scenarioModalTitle"></h2>
        <form id="scenarioForm"></form>
      </div>
    `;
  });

  it("должен открывать модалку с заголовком и полями", () => {
    openScenarioForm({
      title: "Добавить подразделение",
      fields: [
        { name: "department_name", label: "Название", required: true },
        { name: "note", label: "Заметка" },
      ],
      initialValues: {},
      onSubmit: () => {},
    });

    const modal = document.getElementById("scenarioModal");
    expect(modal.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("scenarioModalTitle").textContent).toBe(
      "Добавить подразделение",
    );

    const html = document.getElementById("scenarioForm").innerHTML;
    expect(html).toContain('name="department_name"');
    expect(html).toContain("required");
  });

  it("должен собирать значения формы и вызывать onSubmit", () => {
    let submitted = null;

    openScenarioForm({
      title: "Тест",
      fields: [{ name: "name", label: "Имя" }],
      initialValues: { name: "Иван" },
      onSubmit: (values) => {
        submitted = values;
      },
    });

    document.getElementById("scenarioForm").dispatchEvent(new Event("submit"));

    expect(submitted).toEqual({ name: "Иван" });
  });

  it("closeScenarioModal должен скрывать модалку", () => {
    openScenarioForm({
      title: "t",
      fields: [],
      initialValues: {},
      onSubmit: () => {},
    });

    closeScenarioModal();

    expect(document.getElementById("scenarioModal").classList.contains("hidden")).toBe(true);
  });

  it("renderFormField должен рендерить select с опциями", () => {
    const html = renderFormField(
      {
        name: "targetDepartmentId",
        label: "Новое подразделение",
        type: "select",
        options: [{ id: "a", name: "Отдел А" }],
      },
      {},
    );

    expect(html).toContain("<select");
    expect(html).toContain('value="a"');
    expect(html).toContain("Отдел А");
  });
});
