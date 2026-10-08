/**
 * orgchart.js
 * Экранный рендер оргдиаграммы и обработчик экспорта (Фаза 2 рефакторинга).
 * Вынесены из main.js.
 */

import { renderCompactA4Screen } from "../rendering/compact-a4/compact-a4-screen-renderer.js";
import { renderUnifiedScreen } from "../rendering/unified-screen-renderer.js";
import { buildHoldingLeadershipTree } from "../rendering/holding-leadership.js";
import { exportCompactA4ToPdf, exportOrgChartToPdf } from "../export/pdf-d3-export.js";
import { VIEW_MODE_TITLES } from "../core/constants.js";
import { openEmployeeDetails } from "./employee-modal.js";
import { openContextMenu } from "./scenario-actions.js";
import { layoutDebugConfig } from "../rendering/chart-cards.js";
import { buildSearchIndex } from "../domain/search-index.js";
import { initEmployeeSearch } from "./search.js";
import { findDepartmentById } from "../core/utils/tree.js";
import { hiddenEmployeeIds } from "../domain/expand-state.js";

/**
 * CR-024 §2.1: операции раскрытия ветки в компактном меню подразделения.
 * Основное действие (раскрытие следующего уровня) выполняет стандартный
 * toggle-контрол карточки, поэтому в меню дублируются только веточные операции.
 */
export const EXPANSION_ACTIONS = [
  { id: "expandNextLevel", label: "Раскрыть следующий уровень" },
  { id: "expandBranch", label: "Развернуть всю ветку" },
  { id: "collapseBranch", label: "Свернуть всю ветку" },
];

const EXPANSION_ACTION_IDS = new Set(EXPANSION_ACTIONS.map((a) => a.id));

export function initExportHandler(state) {
  document.getElementById("exportPdf")?.addEventListener("click", () => {
    const exportWithoutNames =
      document.getElementById("exportWithoutNames")?.checked;

    // CR-024 §5: PDF учитывает текущее состояние раскрытия структуры.
    const chartRoot = getChartRootNode(state);

    const payload = {
      // CR-013 §31: PDF использует ту же holding hierarchy, что и экран.
      rootNodes: [chartRoot],
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
      // CR-023 §9: PDF-геометрия и режим (группировка) соответствуют экрану.
      layoutOptions: buildPdfLayoutOptions(state, chartRoot),
    };

    if (state.cardDesign === "compact-a4") {
      exportCompactA4ToPdf(payload);
      return;
    }

    exportOrgChartToPdf(payload);
  });
}

/**
 * CR-024 §5: опции layout для PDF — как у экрана, плюс текущее состояние
 * раскрытия подразделений и видимости сотрудников. Если пользователь выбрал
 * другой существующий режим экспорта (ролевой PDF), геометрия карточек не
 * меняется — учитывается только раскрытие структуры.
 */
export function buildPdfLayoutOptions(state, rootNode) {
  const options = buildScreenLayoutOptions(state);
  if (state.expandState) {
    options.collapsedIds = state.expandState.childrenCollapsed;
    options.hiddenEmployeeIds = hiddenEmployeeIds(state.expandState, [rootNode]);
  }
  return options;
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

  // CR-003-03 §23: ролевой режим отражается в subtitle как «по должностям»,
  // а не техническим «без фамилий».
  parts.push(hideNames ? "по должностям" : "с фамилиями");

  return parts.join(" · ");
}

export function getDepartmentNodeHeight(data, cardDesign) {
  if (!data.isDepartment) return 96;

  const assistantExtraHeight = data.assistant ? 44 : 0;

  if (cardDesign === "variant2") return 176 + assistantExtraHeight;
  if (cardDesign === "variant3") return 158 + assistantExtraHeight;

  // CR-023 §6: компактная карточка подразделения (отступы уменьшены,
  // длинное название переносится внутри фиксированной высоты).
  return 104 + assistantExtraHeight;
}

/**
 * CR-023 §6-7: компактная геометрия схемы — единый источник для экранного
 * рендера и PDF. Уменьшает внутренние/внешние отступы и расстояния между
 * карточками и подразделениями; включает расчёт высот по содержимому.
 */
export const COMPACT_LAYOUT_OPTIONS = {
  employeesHeaderHeight: 22,
  colGap: 24,
  rowGap: 32,
  contentGap: 18,
  personGap: 6,
  paddingX: 24,
  paddingY: 24,
  measureContent: true,
};

/**
 * Опции layout для текущего состояния приложения (CR-023 §3).
 * Значение дизайна «Группировка по должности» включает presentation-группировку.
 */
export function buildScreenLayoutOptions(state) {
  return {
    ...COMPACT_LAYOUT_OPTIONS,
    groupByPosition: state.cardDesign === "grouped",
    // CR-023-01 §3: диагностика уровней управляется отдельным переключателем;
    // геометрия карточек учитывает высоту диагностической строки.
    showLevels: Boolean(state.showLevels),
  };
}

/**
 * Определяет, является ли выбранный узел корнем всей организации (Холдинг).
 *
 * Использует структурный маркер synthetic-root (создаётся createSyntheticRoot),
 * а не анализ текста названия (CR-012 §5). Все непосредственные department
 * children такого корня — дирекции верхнего уровня.
 *
 * @param {object|null} node
 * @returns {boolean}
 */
export function isHoldingRoot(node) {
  return Boolean(node) && node.department_guid === "synthetic-root";
}

/**
 * Возвращает корневой узел диаграммы с учётом CR-013: для корня Холдинга
 * строится верхнеуровневая управленческая проекция (holding leadership
 * projection); для отдельной дирекции — сам выбранный узел.
 *
 * @param {object} state
 * @returns {object}
 */
export function getChartRootNode(state) {
  if (!isHoldingRoot(state.selectedNode)) return state.selectedNode;

  return buildHoldingLeadershipTree(state.selectedNode, {
    // Режим «Изменения» строится из working tree и может не содержать
    // неизменённую «Администрацию» — люди верхнего управления берутся
    // из working tree (TO BE), а не из AS IS (CR-013 §17, §24).
    fallbackTree: state.viewMode === "changes" ? state.scenario?.workingTree : null,
  });
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

  // CR-023-01 §3: диагностическая строка рендерится только при включённом
  // переключателе «Показывать уровни»; переключение происходит без перезагрузки JSON.
  layoutDebugConfig.enabled = Boolean(state.showLevels);

  const rootNode = getChartRootNode(state);
  const rootNodes = [rootNode];

  const isHolding = isHoldingRoot(state.selectedNode);

  // CR-012: при выборе корня Холдинга дирекции верхнего уровня сворачиваются
  // по умолчанию. Для leadership-проекции (CR-013 §22) изначально свернуты
  // дирекции под executive-узлами — список задаётся проекцией.
  const collapseTopLevel = isHolding;
  const initialCollapsedIds = isHolding ? rootNode.__initialCollapsedIds : null;

  // Компактный A4 использует тот же единый layout, но компактный рендер карточек
  if (state.cardDesign === "compact-a4") {
    state.chart = renderCompactA4Screen(rootNodes, "#orgChart", {
      hideNames: false,
      showVacancies: state.showVacancies,
      viewMode: state.viewMode,
      collapseTopLevel,
      initialCollapsedIds,
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
    // CR-023 §6-7: компактная геометрия + presentation-группировка.
    ...buildScreenLayoutOptions(state),
    // CR-024 §2.2, §2.5: пошаговое раскрытие + состояние раскрытия выше lifecycle.
    expandState: state.expandState,
    collapseEmployees: true,
    employeesToggleHeight: 22,
    collapseTopLevel,
    initialCollapsedIds,
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
    // CR-024 §2.2: компактная кнопка «Сотрудники · N» на карточке подразделения
    // независимо раскрывает/скрывает список сотрудников.
    const employeesToggle = event.target.closest("[data-employees-toggle]");
    if (employeesToggle) {
      event.preventDefault();
      event.stopPropagation();
      state.chart?.toggleEmployees(employeesToggle.dataset.employeesToggle);
      return;
    }

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
        // CR-024 §2.1: веточные операции раскрытия в меню подразделения.
        extraActions: nodeType === "department" ? EXPANSION_ACTIONS : [],
        onAction: (action, targetNode) => {
          if (EXPANSION_ACTION_IDS.has(action)) {
            handleExpansionAction(state, action, nodeId);
            return;
          }
          deps.onScenarioAction?.(action, targetNode);
        },
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

/**
 * CR-024 §2.1: применяет веточную операцию раскрытия к диаграмме.
 * @param {object} state
 * @param {string} action - expandNextLevel | expandBranch | collapseBranch
 * @param {string} id - id подразделения
 */
export function handleExpansionAction(state, action, id) {
  const chart = state.chart;
  if (!chart || !id) return;

  if (action === "expandNextLevel") chart.expandNextLevel?.(id);
  else if (action === "expandBranch") chart.expandBranch?.(id);
  else if (action === "collapseBranch") chart.collapseBranch?.(id);
}

/** CR-024 §2.4: глобальные кнопки «Развернуть всё» / «Свернуть всё». */
export function initExpandControls(state) {
  document
    .getElementById("expandAll")
    ?.addEventListener("click", () => state.chart?.expandAll?.());
  document
    .getElementById("collapseAll")
    ?.addEventListener("click", () => state.chart?.collapseAll?.());
}

/** CR-024 §4.4: кратковременная подсветка найденной карточки. */
export function highlightSearchCard(focusId) {
  const container = document.getElementById("orgChart");
  if (!container || !focusId) return;
  const selector = `[data-employee-id="${focusId}"], [data-node-id="${focusId}"]`;
  const card = container.querySelector(selector);
  if (!card) return;

  card.classList.add("search-hit");
  setTimeout(() => card.classList.remove("search-hit"), 2400);
}

function focusSearchEntry(state, entry) {
  const chart = state.chart;
  if (!chart || !entry) return;
  // CR-024 §4.6: группировка не разрушается — раскрывается подразделение, а
  // строка найденного сотрудника подсвечивается по его собственному id.
  chart.revealPath?.(
    entry.pathIds,
    entry.focusId,
    entry.isManager ? null : entry.departmentId,
  );
  highlightSearchCard(entry.focusId);
}

/**
 * CR-024 §4: подключает глобальный поиск к верхней панели приложения.
 *
 * @param {object} state
 * @param {object} deps
 * @param {Function} deps.getTree - () => текущее дерево (для индекса и навигации)
 * @param {Function} [deps.renderApp] - перерисовка приложения после смены фильтра
 * @param {object} [deps.elements] - override DOM-элементов (для тестов)
 */
export function initSearchControls(state, deps = {}) {
  const { getTree, renderApp, elements } = deps;
  let cachedTree = null;
  let cachedIndex = null;

  function getIndex() {
    const tree = getTree ? getTree() : state.sourceTree;
    if (tree !== cachedTree) {
      cachedTree = tree;
      cachedIndex = buildSearchIndex(tree || []);
    }
    return cachedIndex;
  }

  const controller = initEmployeeSearch({
    getIndex,
    getSelectedNode: () => state.selectedNode,
    onSelect: (entry) => focusSearchEntry(state, entry),
    onNavigate: (entry) => {
      // CR-024 §4.5: сохранить текущий фильтр и перейти к нужной ветке.
      const previous = state.selectedNode;
      const tree = getTree ? getTree() : state.sourceTree;
      const target =
        findDepartmentById(tree || [], entry.pathIds[0]) ||
        findDepartmentById(tree || [], entry.departmentId);
      if (!target) return;

      state.selectedNode = target;
      renderApp?.();
      focusSearchEntry(state, entry);

      controller.setReturn("← Вернуться к фильтру", () => {
        state.selectedNode = previous;
        renderApp?.();
        controller.setReturn(null, null);
      });
    },
    elements,
  });

  state.searchController = controller;
  return controller;
}
