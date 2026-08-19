/**
 * scenario-forms.js
 * Модальные формы сценарного моделирования (Фаза 2 рефакторинга).
 * Вынесены из main.js.
 */

import { getDepartmentOptions } from "../domain/scenario-manager.js";
import { escapeHtml } from "../core/utils/string.js";

export function openDepartmentForm({ title, initialValues = {}, onSubmit }) {
  openScenarioForm({
    title,
    fields: [
      {
        name: "department_name",
        label: "Название подразделения",
        required: true,
      },
      { name: "department_manager", label: "Руководитель" },
      { name: "department_manager_position", label: "Должность руководителя" },
    ],
    initialValues,
    onSubmit,
  });
}

export function openEmployeeForm({ title, initialValues = {}, onSubmit }) {
  openScenarioForm({
    title,
    fields: [
      { name: "full_name", label: "ФИО", required: true },
      { name: "position", label: "Должность", required: true },
      { name: "email", label: "Email" },
      { name: "phone", label: "Телефон" },
      { name: "project", label: "Проект" },
      { name: "typeEmployment", label: "Тип занятости" },
      { name: "state", label: "Статус" },
      { name: "subLevel", label: "sub_level" },
    ],
    initialValues,
    onSubmit,
  });
}

export function openVacancyForm({ title, initialValues = {}, onSubmit }) {
  openScenarioForm({
    title,
    fields: [
      { name: "position", label: "Должность", required: true },
      { name: "project", label: "Проект" },
      { name: "subLevel", label: "sub_level" },
    ],
    initialValues,
    onSubmit,
  });
}

export function openMoveForm({ title, excludeDepartmentId, onSubmit, scenario }) {
  const options = getDepartmentOptions(scenario.workingTree).filter(
    (item) => item.id !== excludeDepartmentId,
  );

  openScenarioForm({
    title,
    fields: [
      {
        name: "targetDepartmentId",
        label: "Новое подразделение",
        type: "select",
        required: true,
        options,
      },
    ],
    initialValues: {},
    onSubmit,
  });
}

export function openScenarioForm({ title, fields, initialValues, onSubmit }) {
  const modal = document.getElementById("scenarioModal");
  const modalTitle = document.getElementById("scenarioModalTitle");
  const form = document.getElementById("scenarioForm");

  if (!modal || !modalTitle || !form) return;

  modalTitle.textContent = title;

  form.innerHTML = `
    ${fields.map((field) => renderFormField(field, initialValues)).join("")}

    <div class="scenario-form__actions">
      <button type="submit">Сохранить</button>
      <button type="button" class="button-secondary" data-close-form>Отмена</button>
    </div>
  `;

  form
    .querySelector("[data-close-form]")
    ?.addEventListener("click", closeScenarioModal);

  form.onsubmit = (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const values = {};

    fields.forEach((field) => {
      values[field.name] = String(data.get(field.name) || "").trim();
    });

    onSubmit(values);
    closeScenarioModal();
  };

  modal.classList.remove("hidden");
}

export function renderFormField(field, initialValues) {
  const value = initialValues[field.name] ?? "";

  if (field.type === "select") {
    return `
      <label class="scenario-form__field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>
          ${(field.options || [])
            .map(
              (option) => `
            <option value="${escapeHtml(option.id)}">
              ${escapeHtml(option.name)}
            </option>
          `,
            )
            .join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="scenario-form__field">
      <span>${escapeHtml(field.label)}</span>
      <input name="${escapeHtml(field.name)}"
             value="${escapeHtml(value)}"
             ${field.required ? "required" : ""}
             type="text" />
    </label>
  `;
}

export function closeScenarioModal() {
  document.getElementById("scenarioModal")?.classList.add("hidden");
}
