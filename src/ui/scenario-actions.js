/**
 * scenario-actions.js
 * Контекстное меню карточек и обработка сценарных операций (Фаза 2 рефакторинга).
 * Вынесены из main.js.
 */

import { escapeHtml } from "../core/utils/string.js";
import {
  addDepartment,
  editDepartment,
  addEmployee,
  editEmployee,
  addVacancy,
  editVacancy,
  removeEmployee,
  removeVacancy,
  removeDepartment,
  moveEmployee,
  moveVacancy,
  moveDepartment,
} from "../domain/scenario-manager.js";
import {
  openDepartmentForm,
  openEmployeeForm,
  openVacancyForm,
  openMoveForm,
} from "./scenario-forms.js";

export function openContextMenu({ x, y, node, nodeType, onAction, extraActions = [] }) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "scenario-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // CR-024 §2.1: компактное меню подразделения может дополняться операциями
  // раскрытия ветки (extraActions), которые не являются сценарными изменениями.
  const actions = [...extraActions, ...getContextActions(nodeType)];

  menu.innerHTML = actions
    .map(
      (action) => `
      <button type="button" data-action="${action.id}">
        ${escapeHtml(action.label)}
      </button>
    `,
    )
    .join("");

  menu.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      onAction(button.dataset.action, node);
      closeContextMenu();
    });
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
  }, 0);
}

export function closeContextMenu() {
  document
    .querySelectorAll(".scenario-context-menu")
    .forEach((menu) => menu.remove());
}

export function getContextActions(nodeType) {
  if (nodeType === "department") {
    return [
      { id: "addDepartment", label: "Добавить подразделение" },
      { id: "addEmployee", label: "Добавить сотрудника" },
      { id: "addVacancy", label: "Добавить вакансию" },
      { id: "editDepartment", label: "Редактировать подразделение" },
      { id: "moveDepartment", label: "Переместить подразделение" },
      { id: "removeDepartment", label: "Удалить подразделение" },
    ];
  }

  if (nodeType === "vacancy") {
    return [
      { id: "editVacancy", label: "Редактировать" },
      { id: "moveVacancy", label: "Переместить" },
      { id: "removeVacancy", label: "Удалить" },
    ];
  }

  return [
    { id: "editEmployee", label: "Редактировать" },
    { id: "moveEmployee", label: "Переместить" },
    { id: "removeEmployee", label: "Удалить" },
  ];
}

/**
 * Применяет сценарную операцию из контекстного меню.
 *
 * @param {object} opts
 * @param {string} opts.action - id действия (addDepartment, removeEmployee, ...)
 * @param {object} opts.node - выбранный узел (flat-объект карточки)
 * @param {object} opts.state - состояние приложения (мутируется: state.scenario)
 * @param {Function} opts.afterChange - колбэк после изменения сценария
 */
export function handleScenarioAction({ action, node, state, afterChange }) {
  if (!node) return;

  const applyChange = (mutator) => {
    state.scenario = mutator(state.scenario);
    afterChange();
  };

  if (action === "addDepartment") {
    openDepartmentForm({
      title: "Добавить подразделение",
      onSubmit: (values) => applyChange((scenario) => addDepartment(scenario, node.id, values)),
    });
    return;
  }

  if (action === "editDepartment") {
    openDepartmentForm({
      title: "Редактировать подразделение",
      initialValues: {
        department_name: node.name,
        department_manager: node.headName,
        department_manager_position: node.headPosition,
      },
      onSubmit: (values) => applyChange((scenario) => editDepartment(scenario, node.id, values)),
    });
    return;
  }

  if (action === "addEmployee") {
    openEmployeeForm({
      title: "Добавить сотрудника",
      onSubmit: (values) => applyChange((scenario) => addEmployee(scenario, node.id, values)),
    });
    return;
  }

  if (action === "editEmployee") {
    openEmployeeForm({
      title: "Редактировать сотрудника",
      initialValues: node,
      onSubmit: (values) => applyChange((scenario) => editEmployee(scenario, node.id, values)),
    });
    return;
  }

  if (action === "addVacancy") {
    openVacancyForm({
      title: "Добавить вакансию",
      onSubmit: (values) => applyChange((scenario) => addVacancy(scenario, node.id, values)),
    });
    return;
  }

  if (action === "editVacancy") {
    openVacancyForm({
      title: "Редактировать вакансию",
      initialValues: node,
      onSubmit: (values) => applyChange((scenario) => editVacancy(scenario, node.id, values)),
    });
    return;
  }

  if (action === "removeEmployee") {
    if (!confirm("Удалить сотрудника из сценария?")) return;
    applyChange((scenario) => removeEmployee(scenario, node.id));
    return;
  }

  if (action === "removeVacancy") {
    if (!confirm("Удалить вакансию из сценария?")) return;
    applyChange((scenario) => removeVacancy(scenario, node.id));
    return;
  }

  if (action === "removeDepartment") {
    if (!confirm("Удалить подразделение из сценария?")) return;
    applyChange((scenario) => removeDepartment(scenario, node.id));
    return;
  }

  if (action === "moveEmployee") {
    openMoveForm({
      title: "Переместить сотрудника",
      excludeDepartmentId: null,
      scenario: state.scenario,
      onSubmit: (values) =>
        applyChange((scenario) => moveEmployee(scenario, node.id, values.targetDepartmentId)),
    });
    return;
  }

  if (action === "moveVacancy") {
    openMoveForm({
      title: "Переместить вакансию",
      excludeDepartmentId: null,
      scenario: state.scenario,
      onSubmit: (values) =>
        applyChange((scenario) => moveVacancy(scenario, node.id, values.targetDepartmentId)),
    });
    return;
  }

  if (action === "moveDepartment") {
    openMoveForm({
      title: "Переместить подразделение",
      excludeDepartmentId: node.id,
      scenario: state.scenario,
      onSubmit: (values) =>
        applyChange((scenario) => moveDepartment(scenario, node.id, values.targetDepartmentId)),
    });
  }
}
