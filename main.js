
import * as d3 from "d3";
import { flextree } from "d3-flextree";
import { OrgChart } from "d3-org-chart";

import { fetchOrganizationStructure } from "./src/api.js";
import { addLevels } from "./src/layout.js";
import { buildTreeView, createSyntheticRoot } from "./src/sidebar-tree.js";
import { renderNodeContent } from "./src/chart-cards.js";
import { renderCompactA4Screen } from "./src/compact-a4/compact-a4-screen-renderer.js";
import {
  initEmployeeModal,
  openEmployeeDetails,
} from "./src/employee-modal.js";
import { exportOrgChartToPdf, exportCompactA4ToPdf } from "./src/pdf-d3-export.js";
import { initChangelog } from "./src/changelog.js";

import {
  createScenario,
  resetScenario,
  renameScenario,
  getTreeByViewMode,
  getScenarioStats,
  getDepartmentOptions,
  findDepartmentById,
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
} from "./src/scenario-manager.js";

window.d3 = { ...d3, flextree };

let sourceTree = [];
let scenario = null;
let chart = null;
let selectedNode = null;
let showVacancies = true;
let cardDesign = localStorage.getItem("orgCardDesign") || "classic";
let viewMode = "to-be";
let isOrgChartDelegationBound = false;
const SCENARIO_PANEL_COLLAPSED_KEY = "orgScenarioPanelCollapsed";

async function initApp() {
  const container = document.getElementById("tree-container");
  if (!container) return;

  container.innerHTML = "<p>Загрузка организационной структуры...</p>";

  try {
    sourceTree = await fetchOrganizationStructure();

    if (!sourceTree.length) {
      container.innerHTML = "<p>Не удалось загрузить структуру.</p>";
      return;
    }

    addLevels(sourceTree, 0);

    scenario = createScenario(sourceTree);
    selectedNode = createSyntheticRoot(getCurrentTree());

    initDesignSwitcher();
    initEmployeeModal();
    initScenarioControls();
    initScenarioPanelToggle();
    initChangelog();

    renderApp();
    initExportHandler();

    document
      .getElementById("showVacancies")
      ?.addEventListener("change", (event) => {
        showVacancies = event.target.checked;
        renderApp();
      });
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    container.innerHTML = "<p>Произошла ошибка. Обновите страницу.</p>";
  }
}

function initExportHandler() {
  document.getElementById("exportPdf")?.addEventListener("click", () => {
    const exportWithoutNames =
      document.getElementById("exportWithoutNames")?.checked;

    if (cardDesign === "compact-a4") {
      exportCompactA4ToPdf({
        rootNodes: [selectedNode],
        title: getExportTitle(),
        subtitle: getExportSubtitle(exportWithoutNames),
        hideNames: exportWithoutNames,
        showVacancies,
        viewMode,
      });
      return;
    }

    exportOrgChartToPdf({
      rootNodes: [selectedNode],
      title: getExportTitle(),
      subtitle: getExportSubtitle(exportWithoutNames),
      hideNames: exportWithoutNames,
      showVacancies,
      viewMode,
    });
  });
}

function initDesignSwitcher() {
  const select = document.getElementById("cardDesign");
  if (!select) return;

  select.value = cardDesign;

  select.addEventListener("change", (event) => {
    cardDesign = event.target.value;
    localStorage.setItem("orgCardDesign", cardDesign);
    renderApp();
  });
}

function initScenarioPanelToggle() {
  const panel = document.getElementById("scenarioPanel");
  const toggle = document.getElementById("scenarioPanelToggle");
  const icon = document.getElementById("scenarioPanelIcon");

  if (!panel || !toggle || !icon) return;

  const storedValue = localStorage.getItem(SCENARIO_PANEL_COLLAPSED_KEY);
  const isCollapsed = storedValue === null ? true : storedValue === "true";

  setScenarioPanelCollapsed(isCollapsed, { panel, toggle, icon });

  toggle.addEventListener("click", () => {
    const nextCollapsed = !panel.classList.contains("scenario-panel--collapsed");
    setScenarioPanelCollapsed(nextCollapsed, { panel, toggle, icon });
    localStorage.setItem(SCENARIO_PANEL_COLLAPSED_KEY, String(nextCollapsed));
  });
}

function setScenarioPanelCollapsed(isCollapsed, { panel, toggle, icon }) {
  panel.classList.toggle("scenario-panel--collapsed", isCollapsed);
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  icon.textContent = isCollapsed ? "▶" : "▼";
}

function initScenarioControls() {
  const scenarioName = document.getElementById("scenarioName");
  const viewModeSelect = document.getElementById("viewMode");

  if (scenarioName) {
    scenarioName.value = scenario.name;

    scenarioName.addEventListener("change", (event) => {
      scenario = renameScenario(scenario, event.target.value);
      renderScenarioPanels();
    });
  }

  if (viewModeSelect) {
    viewModeSelect.value = viewMode;

    viewModeSelect.addEventListener("change", (event) => {
      viewMode = event.target.value;
      refreshSelectedNode();
      renderApp();
    });
  }

  document.getElementById("resetScenario")?.addEventListener("click", () => {
    if (!confirm("Сбросить все изменения сценария?")) return;

    scenario = resetScenario(scenario);
    refreshSelectedNode();
    renderApp();
  });

  document
    .getElementById("compareScenario")
    ?.addEventListener("click", openCompareModal);

  document
    .getElementById("closeScenarioModal")
    ?.addEventListener("click", closeScenarioModal);
  document
    .querySelector("#scenarioModal .scenario-modal__backdrop")
    ?.addEventListener("click", closeScenarioModal);

  document
    .getElementById("closeCompareModal")
    ?.addEventListener("click", closeCompareModal);
  document
    .querySelector("[data-close-compare]")
    ?.addEventListener("click", closeCompareModal);
}

function getExportTitle() {
  return (
    selectedNode?.department_name ||
    selectedNode?.name ||
    "Организационная структура"
  );
}

function getExportSubtitle(hideNames) {
  const modeTitles = {
    "as-is": "Текущая структура",
    "to-be": "Целевая структура",
    changes: "Изменения",
  };

  const parts = [modeTitles[viewMode] || "Организационная структура"];

  if (!showVacancies) {
    parts.push("без вакансий");
  }

  parts.push(hideNames ? "без фамилий" : "с фамилиями");

  return parts.join(" · ");
}

function getCurrentTree() {
  return getTreeByViewMode(scenario, viewMode);
}

function refreshSelectedNode() {
  const tree = getCurrentTree();

  if (!selectedNode) {
    selectedNode = createSyntheticRoot(tree);
    return;
  }

  if (selectedNode.department_guid === "synthetic-root") {
    selectedNode = createSyntheticRoot(tree);
    return;
  }

  const updatedSelectedNode = findDepartmentById(
    tree,
    selectedNode.department_guid,
  );

  selectedNode = updatedSelectedNode || createSyntheticRoot(tree);
}

function renderApp() {
  const tree = getCurrentTree();

  addLevels(tree, 0);
  refreshSelectedNode();

  renderSidebarTree(tree);
  renderScreenOrgChart([selectedNode]);
  renderScenarioPanels();
}

function renderSidebarTree(tree) {
  const container = document.getElementById("tree-container");
  if (!container) return;

  selectedNode = buildTreeView({
    nodes: tree,
    container,
    selectedNode,
    onSelect: (node) => {
      selectedNode = node;
      renderScreenOrgChart([node]);
    },
  });
}

function renderScenarioPanels() {
  renderStats();
  renderChangesList();
}

function renderStats() {
  const statsEl = document.getElementById("scenarioStats");
  if (!statsEl) return;

  const stats = getScenarioStats(scenario);

  statsEl.innerHTML = `
    <div><b>Сотрудники:</b> ${stats.toBe.staff} (${formatDiff(stats.diff.staff)})</div>
    <div><b>Вакансии:</b> ${stats.toBe.vacancies} (${formatDiff(stats.diff.vacancies)})</div>
    <div><b>Всего:</b> ${stats.toBe.total} (${formatDiff(stats.diff.total)})</div>
    <div><b>Подразделения:</b> ${stats.toBe.departments} (${formatDiff(stats.diff.departments)})</div>
  `;
}

function renderChangesList() {
  const list = document.getElementById("changesList");
  const count = document.getElementById("changesCount");

  if (!list || !count) return;

  count.textContent = String(scenario.operations.length);

  if (!scenario.operations.length) {
    list.innerHTML = `<div class="changes-list__empty">Изменений пока нет</div>`;
    return;
  }

  list.innerHTML = scenario.operations
    .slice()
    .reverse()
    .map(
      (operation) => `
      <button class="change-item"
              type="button"
              data-change-entity-id="${escapeHtml(operation.entityId || "")}">
        <span class="change-item__icon">${getOperationIcon(operation.type)}</span>
        <span>
          <b>${escapeHtml(getOperationTitle(operation.type))}</b>
          <small>${escapeHtml(operation.title || "")}</small>
        </span>
      </button>
    `,
    )
    .join("");

  list.querySelectorAll("[data-change-entity-id]").forEach((button) => {
    button.addEventListener("click", () => {
      focusEntity(button.dataset.changeEntityId);
    });
  });
}

function focusEntity(entityId) {
  if (!entityId || !chart) return;

  try {
    chart.setCentered(entityId).render();
  } catch {
    console.warn("Не удалось сфокусироваться на объекте", entityId);
  }
}

function getDepartmentNodeHeight(data) {
  if (!data.isDepartment) return 96;

  const assistantExtraHeight = data.assistant ? 44 : 0;

  if (cardDesign === "variant2") return 176 + assistantExtraHeight;
  if (cardDesign === "variant3") return 158 + assistantExtraHeight;

  return 130 + assistantExtraHeight;
}

function getDepartmentNodeWidth() {
  if (cardDesign === "variant2") return 380;
  if (cardDesign === "variant3") return 400;

  return 350;
}

function createOrgChartInstance(containerSelector, flatData) {
  const orgChart = new OrgChart()
    .container(containerSelector)
    .nodeHeight((d) => getDepartmentNodeHeight(d.data))
    .nodeWidth(() => getDepartmentNodeWidth())
    .childrenMargin(() => 40)
    .compactMarginBetween(() => 20)
    .compactMarginPair(() => 60)
    .nodeContent((d) =>
      renderNodeContent(d.data, {
        cardDesign,
        showVacancies,
        viewMode,
      }),
    );

  orgChart.data(flatData).render();

  return orgChart;
}

function renderScreenOrgChart(rootNodes) {
  if (!rootNodes?.length) return;

  // Для компактного A4 используем отдельный рендерер
  if (cardDesign === "compact-a4") {
    renderCompactA4Screen(rootNodes, "#orgChart", {
      hideNames: false,
      showVacancies,
      viewMode,
    });
    return;
  }

  const flatData = convertToFlatData(rootNodes);

  if (!flatData.length) {
    const container = document.getElementById("orgChart");
    if (container) {
      container.innerHTML = `<div class="empty-chart">Нет данных для отображения</div>`;
    }
    return;
  }

  const container = document.getElementById("orgChart");
  if (container) container.innerHTML = "";

  chart = createOrgChartInstance("#orgChart", flatData);
  chart.fit();

  window.orgChart = chart;

  bindOrgChartDelegatedEvents(flatData);
}

function bindOrgChartDelegatedEvents(flatData) {
  const container = document.getElementById("orgChart");
  if (!container) return;

  container.__flatData = flatData;

  if (isOrgChartDelegationBound) return;
  isOrgChartDelegationBound = true;

  container.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-scenario-menu]");

    if (menuButton) {
      event.preventDefault();
      event.stopPropagation();

      const card = menuButton.closest("[data-node-id]");
      if (!card) return;

      const flatData = container.__flatData || [];
      const nodeId = card.dataset.nodeId;
      const nodeType = card.dataset.nodeType;
      const node = flatData.find((item) => item.id === nodeId);

      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        node,
        nodeType,
      });

      return;
    }

    const assistantCard = event.target.closest("[data-assistant-id]");
    if (assistantCard) {
      const flatData = container.__flatData || [];
      const department = flatData.find(
        (item) => item.assistant?.id === assistantCard.dataset.assistantId,
      );

      if (department?.assistant) {
        event.stopPropagation();
        openEmployeeDetails(department.assistant);
      }

      return;
    }

    const employeeCard = event.target.closest("[data-employee-id]");
    if (!employeeCard) return;

    const flatData = container.__flatData || [];
    const employee = flatData.find(
      (item) => item.id === employeeCard.dataset.employeeId,
    );

    if (employee && !employee.isVacancy) {
      event.stopPropagation();
      openEmployeeDetails(employee);
    }
  });
}

function openContextMenu({ x, y, node, nodeType }) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "scenario-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const actions = getContextActions(nodeType);

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
      handleScenarioAction(button.dataset.action, node);
      closeContextMenu();
    });
  });

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
  }, 0);
}

function closeContextMenu() {
  document
    .querySelectorAll(".scenario-context-menu")
    .forEach((menu) => menu.remove());
}

function getContextActions(nodeType) {
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

function handleScenarioAction(action, node) {
  if (!node) return;

  if (action === "addDepartment") {
    openDepartmentForm({
      title: "Добавить подразделение",
      onSubmit: (values) => {
        scenario = addDepartment(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "editDepartment") {
    openDepartmentForm({
      title: "Редактировать подразделение",
      initialValues: {
        department_name: node.name,
        department_manager: node.headName,
        department_manager_position: node.headPosition,
      },
      onSubmit: (values) => {
        scenario = editDepartment(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "addEmployee") {
    openEmployeeForm({
      title: "Добавить сотрудника",
      onSubmit: (values) => {
        scenario = addEmployee(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "editEmployee") {
    openEmployeeForm({
      title: "Редактировать сотрудника",
      initialValues: node,
      onSubmit: (values) => {
        scenario = editEmployee(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "addVacancy") {
    openVacancyForm({
      title: "Добавить вакансию",
      onSubmit: (values) => {
        scenario = addVacancy(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "editVacancy") {
    openVacancyForm({
      title: "Редактировать вакансию",
      initialValues: node,
      onSubmit: (values) => {
        scenario = editVacancy(scenario, node.id, values);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "removeEmployee") {
    if (!confirm("Удалить сотрудника из сценария?")) return;

    scenario = removeEmployee(scenario, node.id);
    refreshAfterScenarioChange();
  }

  if (action === "removeVacancy") {
    if (!confirm("Удалить вакансию из сценария?")) return;

    scenario = removeVacancy(scenario, node.id);
    refreshAfterScenarioChange();
  }

  if (action === "removeDepartment") {
    if (!confirm("Удалить подразделение из сценария?")) return;

    scenario = removeDepartment(scenario, node.id);
    refreshAfterScenarioChange();
  }

  if (action === "moveEmployee") {
    openMoveForm({
      title: "Переместить сотрудника",
      excludeDepartmentId: null,
      onSubmit: (values) => {
        scenario = moveEmployee(scenario, node.id, values.targetDepartmentId);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "moveVacancy") {
    openMoveForm({
      title: "Переместить вакансию",
      excludeDepartmentId: null,
      onSubmit: (values) => {
        scenario = moveVacancy(scenario, node.id, values.targetDepartmentId);
        refreshAfterScenarioChange();
      },
    });
  }

  if (action === "moveDepartment") {
    openMoveForm({
      title: "Переместить подразделение",
      excludeDepartmentId: node.id,
      onSubmit: (values) => {
        scenario = moveDepartment(scenario, node.id, values.targetDepartmentId);
        refreshAfterScenarioChange();
      },
    });
  }
}

function refreshAfterScenarioChange() {
  viewMode = "to-be";

  const viewModeSelect = document.getElementById("viewMode");
  if (viewModeSelect) viewModeSelect.value = viewMode;

  refreshSelectedNode();
  renderApp();
}

function openDepartmentForm({ title, initialValues = {}, onSubmit }) {
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

function openEmployeeForm({ title, initialValues = {}, onSubmit }) {
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

function openVacancyForm({ title, initialValues = {}, onSubmit }) {
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

function openMoveForm({ title, excludeDepartmentId, onSubmit }) {
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

function openScenarioForm({ title, fields, initialValues, onSubmit }) {
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

function renderFormField(field, initialValues) {
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

function closeScenarioModal() {
  document.getElementById("scenarioModal")?.classList.add("hidden");
}

function openCompareModal() {
  const modal = document.getElementById("compareModal");
  const content = document.getElementById("compareContent");

  if (!modal || !content) return;

  const stats = getScenarioStats(scenario);

  content.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Показатель</th>
          <th>Было</th>
          <th>Стало</th>
          <th>Изменение</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Подразделения</td>
          <td>${stats.asIs.departments}</td>
          <td>${stats.toBe.departments}</td>
          <td>${formatDiff(stats.diff.departments)}</td>
        </tr>
        <tr>
          <td>Сотрудники</td>
          <td>${stats.asIs.staff}</td>
          <td>${stats.toBe.staff}</td>
          <td>${formatDiff(stats.diff.staff)}</td>
        </tr>
        <tr>
          <td>Вакансии</td>
          <td>${stats.asIs.vacancies}</td>
          <td>${stats.toBe.vacancies}</td>
          <td>${formatDiff(stats.diff.vacancies)}</td>
        </tr>
        <tr>
          <td>Всего</td>
          <td>${stats.asIs.total}</td>
          <td>${stats.toBe.total}</td>
          <td>${formatDiff(stats.diff.total)}</td>
        </tr>
      </tbody>
    </table>
  `;

  modal.classList.remove("hidden");
}

function closeCompareModal() {
  document.getElementById("compareModal")?.classList.add("hidden");
}

function convertToFlatData(nodes) {
  const result = [];
  const assistantsToSkip = new Set();

  function walk(node, parentId = null, isRootNode = false) {
    const nodeId = node.department_guid || node.id;

    result.push({
      id: nodeId,
      parentId,
      name: node.department_name || node.name || "Без названия",
      staffCount: node.staffCount || 0,
      vacancyCount: node.vacancyCount || 0,
      totalWithVacancies: node.totalWithVacancies ?? node.staffCount ?? 0,
      headName: node.department_manager || "",
      headPosition: node.department_manager_position || "",
      scenarioState: node.scenarioState || "",
      isDepartment: !!node.department_guid,
    });

    if (isRootNode) {
      const assistant = findAdministrativeAssistantInSubtree(node);

      if (assistant?.id) {
        assistantsToSkip.add(assistant.id);

        result.push({
          ...assistant,
          id: assistant.id,
          parentId: nodeId,
          name: assistant.full_name || assistant.name || "Сотрудник",
          position: assistant.position || "",
          scenarioState: assistant.scenarioState || "",
          isDepartment: false,
          isVacancy: false,
          isAssistant: true,
        });
      }
    }

    (node.children || []).forEach((child) => walk(child, nodeId, false));

    (node.users || [])
      .filter((user) => showVacancies || !user.isVacancy)
      .filter((user) => !isAdministrativeAssistant(user))
      .filter((user) => !assistantsToSkip.has(user.id))
      .forEach((user) => {
        result.push({
          ...user,
          id: user.id || `user_${result.length + 1}`,
          parentId: nodeId,
          name: user.full_name || user.name || "Сотрудник",
          position: user.position || "",
          scenarioState: user.scenarioState || "",
          isDepartment: false,
          isVacancy: !!user.isVacancy,
        });
      });
  }

  nodes.forEach((node) => walk(node, null, true));

  return result;
}

function findAdministrativeAssistantInSubtree(node) {
  const ownAssistant = findAdministrativeAssistant(node.users || []);

  if (ownAssistant) return ownAssistant;

  for (const child of node.children || []) {
    const childAssistant = findAdministrativeAssistantInSubtree(child);

    if (childAssistant) return childAssistant;
  }

  return null;
}

function findAdministrativeAssistant(users) {
  return (users || []).find((user) => isAdministrativeAssistant(user)) || null;
}

function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;

  const position = String(
    user.rawPosition || user.position || "",
  ).toLowerCase();

  return position.includes("административный ассистент");
}

function getOperationIcon(type) {
  if (type.startsWith("add")) return "+";
  if (type.startsWith("remove")) return "−";
  if (type.startsWith("move")) return "⇄";
  if (type.startsWith("edit")) return "✎";

  return "•";
}

function getOperationTitle(type) {
  const titles = {
    addDepartment: "Добавлено подразделение",
    editDepartment: "Изменено подразделение",
    removeDepartment: "Удалено подразделение",
    moveDepartment: "Перемещено подразделение",

    addEmployee: "Добавлен сотрудник",
    editEmployee: "Изменен сотрудник",
    removeEmployee: "Удален сотрудник",
    moveEmployee: "Перемещен сотрудник",

    addVacancy: "Добавлена вакансия",
    editVacancy: "Изменена вакансия",
    removeVacancy: "Удалена вакансия",
    moveVacancy: "Перемещена вакансия",
  };

  return titles[type] || "Изменение";
}

function formatDiff(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", initApp);
