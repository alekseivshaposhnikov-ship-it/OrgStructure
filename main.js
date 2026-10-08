/**
 * main.js - точка входа приложения.
 *
 * Выполняет инициализацию и композицию UI-модулей. Бизнес-логика и рендер
 * вынесены в src/ (см. src/ui/*).
 */

import { fetchOrganizationStructure } from "./src/data/api.js";
import { addLevels, findDepartmentById } from "./src/core/utils/tree.js";
import { createSyntheticRoot, buildTreeView } from "./src/ui/sidebar-tree.js";
import { initEmployeeModal } from "./src/ui/employee-modal.js";
import { initChangelog } from "./src/ui/changelog.js";
import {
  createScenario,
  resetScenario,
  renameScenario,
  getTreeByViewMode,
} from "./src/domain/scenario-manager.js";
import { createAppState } from "./src/ui/app-state.js";
import { closeScenarioModal } from "./src/ui/scenario-forms.js";
import {
  renderStats,
  renderChangesList,
  focusEntity,
  openCompareModal,
  closeCompareModal,
} from "./src/ui/changes-panel.js";
import { handleScenarioAction } from "./src/ui/scenario-actions.js";
import { initExportHandler, renderScreenOrgChart } from "./src/ui/orgchart.js";

const SCENARIO_PANEL_COLLAPSED_KEY = "orgScenarioPanelCollapsed";

const state = createAppState();

async function initApp() {
  const container = document.getElementById("tree-container");
  if (!container) return;

  container.innerHTML = "<p>Загрузка организационной структуры...</p>";

  try {
    state.sourceTree = await fetchOrganizationStructure();

    if (!state.sourceTree.length) {
      container.innerHTML = "<p>Не удалось загрузить структуру.</p>";
      return;
    }

    addLevels(state.sourceTree, 0);

    state.scenario = createScenario(state.sourceTree);
    state.selectedNode = createSyntheticRoot(getCurrentTree());

    initDesignSwitcher();
    initCardWidthControl();
    initEmployeeModal();
    initScenarioControls();
    initScenarioPanelToggle();
    initChangelog();

    renderApp();
    initExportHandler(state);

    const showVacanciesInput = document.getElementById("showVacancies");
    if (showVacanciesInput) {
      showVacanciesInput.checked = state.showVacancies;
      showVacanciesInput.addEventListener("change", (event) => {
        state.showVacancies = event.target.checked;
        renderApp();
      });
    }

    // CR-023-01 §3: отдельный переключатель диагностических уровней.
    const showLevelsInput = document.getElementById("showLevels");
    if (showLevelsInput) {
      showLevelsInput.checked = state.showLevels;
      showLevelsInput.addEventListener("change", (event) => {
        state.showLevels = event.target.checked;
        renderApp();
      });
    }
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    container.innerHTML = "<p>Произошла ошибка. Обновите страницу.</p>";
  }
}

function initDesignSwitcher() {
  const select = document.getElementById("cardDesign");
  if (!select) return;

  select.value = state.cardDesign;

  select.addEventListener("change", (event) => {
    state.cardDesign = event.target.value;
    localStorage.setItem("orgCardDesign", state.cardDesign);
    renderApp();
  });
}

function initCardWidthControl() {
  const slider = document.getElementById("cardWidth");
  const valueEl = document.getElementById("cardWidthValue");
  if (!slider || !valueEl) return;

  slider.value = state.cardWidth;
  valueEl.textContent = `${state.cardWidth} px`;

  slider.addEventListener("input", (event) => {
    state.cardWidth = Number(event.target.value);
    valueEl.textContent = `${state.cardWidth} px`;
    localStorage.setItem("orgCardWidth", String(state.cardWidth));
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
    scenarioName.value = state.scenario.name;

    scenarioName.addEventListener("change", (event) => {
      state.scenario = renameScenario(state.scenario, event.target.value);
      renderScenarioPanels();
    });
  }

  if (viewModeSelect) {
    viewModeSelect.value = state.viewMode;

    viewModeSelect.addEventListener("change", (event) => {
      state.viewMode = event.target.value;
      refreshSelectedNode();
      renderApp();
    });
  }

  document.getElementById("resetScenario")?.addEventListener("click", () => {
    if (!confirm("Сбросить все изменения сценария?")) return;

    state.scenario = resetScenario(state.scenario);
    refreshSelectedNode();
    renderApp();
  });

  document
    .getElementById("compareScenario")
    ?.addEventListener("click", () => openCompareModal(state.scenario));

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

function getCurrentTree() {
  return getTreeByViewMode(state.scenario, state.viewMode);
}

function refreshSelectedNode() {
  const tree = getCurrentTree();

  if (!state.selectedNode) {
    state.selectedNode = createSyntheticRoot(tree);
    return;
  }

  if (state.selectedNode.department_guid === "synthetic-root") {
    state.selectedNode = createSyntheticRoot(tree);
    return;
  }

  const updatedSelectedNode = findDepartmentById(
    tree,
    state.selectedNode.department_guid,
  );

  state.selectedNode = updatedSelectedNode || createSyntheticRoot(tree);
}

function renderApp() {
  const tree = getCurrentTree();

  addLevels(tree, 0);
  refreshSelectedNode();

  renderSidebarTree(tree);
  renderOrgChart();
  renderScenarioPanels();
}

function renderSidebarTree(tree) {
  const container = document.getElementById("tree-container");
  if (!container) return;

  state.selectedNode = buildTreeView({
    nodes: tree,
    container,
    selectedNode: state.selectedNode,
    onSelect: (node) => {
      state.selectedNode = node;
      renderOrgChart();
    },
  });
}

function renderOrgChart() {
  renderScreenOrgChart(state, {
    onScenarioAction: (action, node) =>
      handleScenarioAction({
        action,
        node,
        state,
        afterChange: refreshAfterScenarioChange,
      }),
  });
}

function renderScenarioPanels() {
  renderStats(state.scenario);
  renderChangesList(state.scenario, (entityId) =>
    focusEntity(entityId, state.chart),
  );
}

function refreshAfterScenarioChange() {
  state.viewMode = "to-be";

  const viewModeSelect = document.getElementById("viewMode");
  if (viewModeSelect) viewModeSelect.value = state.viewMode;

  refreshSelectedNode();
  renderApp();
}

document.addEventListener("DOMContentLoaded", initApp);