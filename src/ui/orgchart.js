/**
 * orgchart.js
 * Экранный рендер оргдиаграммы и обработчик экспорта (Фаза 2 рефакторинга).
 * Вынесены из main.js.
 */

import { renderCompactA4Screen } from "../rendering/compact-a4/compact-a4-screen-renderer.js";
import { renderUnifiedScreen } from "../rendering/unified-screen-renderer.js";
import { exportCompactA4ToPdf, exportOrgChartToPdf } from "../export/pdf-d3-export.js";
import { VIEW_MODE_TITLES } from "../core/constants.js";
import { openEmployeeDetails } from "./employee-modal.js";
import { openContextMenu } from "./scenario-actions.js";

export function initExportHandler(state) {
  document.getElementById("exportPdf")?.addEventListener("click", () => {
    const exportWithoutNames =
      document.getElementById("exportWithoutNames")?.checked;

    const payload = {
      rootNodes: [state.selectedNode],
      title: getExportTitle(state.selectedNode),
      subtitle: getExportSubtitle({
        viewMode: state.viewMode,
        showVacancies: state.showVacancies,
        hideNames: exportWithoutNames,
      }),
      hideNames: exportWithoutNames,
      showVacancies: state.showVacancies,
      viewMode: state.viewMode,
      // PDF использует ту же конфигурацию Unified Layout, что и экран (CR-003 §17),
      // чтобы геометрия карточек и расстояние совпадали.
      departmentWidth: state.cardWidth,
      departmentHeight: getDepartmentNodeHeight({ isDepartment: true }, state.cardDesign),
      employeeWidth: state.cardWidth,
      employeeHeight: 96,
      assistantWidth: state.cardWidth,
      assistantHeight: 96,
    };

    if (state.cardDesign === "compact-a4") {
      exportCompactA4ToPdf(payload);
      return;
    }

    exportOrgChartToPdf(payload);
  });
}

export function getExportTitle(selectedNode) {
  return (
    selectedNode?.department_name ||
    selectedNode?.name ||
    "Организационная структура"
  );
}

export function getExportSubtitle({ viewMode, showVacancies, hideNames }) {
  const parts = [VIEW_MODE_TITLES[viewMode] || "Организационная структура"];

  if (!showVacancies) {
    parts.push("без вакансий");
  }

  parts.push(hideNames ? "без фамилий" : "с фамилиями");

  return parts.join(" · ");
}

export function getDepartmentNodeHeight(data, cardDesign) {
  if (!data.isDepartment) return 96;

  const assistantExtraHeight = data.assistant ? 44 : 0;

  if (cardDesign === "variant2") return 176 + assistantExtraHeight;
  if (cardDesign === "variant3") return 158 + assistantExtraHeight;

  return 130 + assistantExtraHeight;
}

/**
 * Рендерит выбранную структуру в #orgChart в зависимости от дизайна карточек.
 * Мутирует state.chart и state.isOrgChartDelegationBound.
 *
 * @param {object} state - состояние приложения (см. src/ui/app-state.js)
 * @param {object} [deps]
 * @param {Function} [deps.onScenarioAction] - колбэк сценария: (action, node) => void
 */
export function renderScreenOrgChart(state, deps = {}) {
  if (!state.selectedNode) return;

  const rootNodes = [state.selectedNode];

  // Компактный A4 использует тот же единый layout, но компактный рендер карточек
  if (state.cardDesign === "compact-a4") {
    state.chart = renderCompactA4Screen(rootNodes, "#orgChart", {
      hideNames: false,
      showVacancies: state.showVacancies,
      viewMode: state.viewMode,
    });
    if (!state.chart) return;
    window.orgChart = state.chart;
    return;
  }

  const container = document.getElementById("orgChart");
  if (!container) return;
  container.innerHTML = "";

  state.chart = renderUnifiedScreen(rootNodes, "#orgChart", {
    cardDesign: state.cardDesign,
    showVacancies: state.showVacancies,
    viewMode: state.viewMode,
    departmentWidth: state.cardWidth,
    departmentHeight: getDepartmentNodeHeight({ isDepartment: true }, state.cardDesign),
    employeeHeight: 96,
  });

  if (!state.chart) return;

  state.chart.fit();
  window.orgChart = state.chart;

  bindOrgChartDelegatedEvents(state, deps);
}

export function bindOrgChartDelegatedEvents(state, deps = {}) {
  const container = document.getElementById("orgChart");
  if (!container) return;

  container.__flatData = state.chart?.flatData;

  if (state.isOrgChartDelegationBound) return;
  state.isOrgChartDelegationBound = true;

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
        onAction: (action, targetNode) => deps.onScenarioAction?.(action, targetNode),
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
