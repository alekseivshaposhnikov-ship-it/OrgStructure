// main.js

import * as d3 from "d3";
import { flextree } from "d3-flextree";
import { OrgChart } from "d3-org-chart";

import { fetchOrganizationStructure } from "./src/api.js";
import { addLevels } from "./src/layout.js";
import {
  buildTreeView,
  createSyntheticRoot,
} from "./src/sidebar-tree.js";
import { renderNodeContent } from "./src/chart-cards.js";
import {
  initEmployeeModal,
  openEmployeeDetails,
} from "./src/employee-modal.js";
import { exportOrgChartToPdf } from "./src/pdf-d3-export.js";

window.d3 = { ...d3, flextree };

let fullTree = [];
let chart = null;
let selectedNode = null;
let showVacancies = true;
let cardDesign = localStorage.getItem("orgCardDesign") || "classic";

async function initApp() {
  const container = document.getElementById("tree-container");
  if (!container) return;

  container.innerHTML = "<p>Загрузка организационной структуры...</p>";

  try {
    fullTree = await fetchOrganizationStructure();

    if (!fullTree.length) {
      container.innerHTML = "<p>Не удалось загрузить структуру.</p>";
      return;
    }

    addLevels(fullTree, 0);

    selectedNode = createSyntheticRoot(fullTree);

    initDesignSwitcher();
    initEmployeeModal();

    renderSidebarTree(container);
    renderScreenOrgChart([selectedNode]);

    document.getElementById("exportPdf")?.addEventListener("click", () => {
      exportOrgChartToPdf({ chart });
    });

    document.getElementById("showVacancies")?.addEventListener("change", event => {
      showVacancies = event.target.checked;
      renderSidebarTree(container);
      renderScreenOrgChart([selectedNode]);
    });
  } catch (error) {
    console.error("Ошибка инициализации:", error);
    container.innerHTML = "<p>Произошла ошибка. Обновите страницу.</p>";
  }
}

function initDesignSwitcher() {
  const select = document.getElementById("cardDesign");
  if (!select) return;

  select.value = cardDesign;

  select.addEventListener("change", event => {
    cardDesign = event.target.value;
    localStorage.setItem("orgCardDesign", cardDesign);
    renderScreenOrgChart([selectedNode]);
  });
}

function renderSidebarTree(container) {
  selectedNode = buildTreeView({
    nodes: fullTree,
    container,
    selectedNode,
    onSelect: node => {
      selectedNode = node;
      renderScreenOrgChart([node]);
    },
  });
}

function getDepartmentNodeHeight(data) {
  if (!data.isDepartment) return 82;

  if (cardDesign === "variant2") return 164;
  if (cardDesign === "variant3") return 146;

  return 118;
}

function getDepartmentNodeWidth() {
  if (cardDesign === "variant2") return 380;
  if (cardDesign === "variant3") return 400;

  return 350;
}

function createOrgChartInstance(containerSelector, flatData) {
  const orgChart = new OrgChart()
    .container(containerSelector)
    .nodeHeight(d => getDepartmentNodeHeight(d.data))
    .nodeWidth(() => getDepartmentNodeWidth())
    .childrenMargin(() => 40)
    .compactMarginBetween(() => 20)
    .compactMarginPair(() => 60)
    .nodeContent(d =>
      renderNodeContent(d.data, {
        cardDesign,
        showVacancies,
      }),
    );

  orgChart.data(flatData).render();

  return orgChart;
}

function renderScreenOrgChart(rootNodes) {
  if (!rootNodes?.length) return;

  const flatData = convertToFlatData(rootNodes);
  if (!flatData.length) return;

  const container = document.getElementById("orgChart");
  if (container) container.innerHTML = "";

  chart = createOrgChartInstance("#orgChart", flatData);
  chart.fit();

  window.orgChart = chart;

  bindEmployeeCardClicks(flatData);
}

function bindEmployeeCardClicks(flatData) {
  setTimeout(() => {
    document.querySelectorAll("#orgChart [data-employee-id]").forEach(el => {
      el.addEventListener("click", event => {
        event.stopPropagation();

        const employee = flatData.find(item => item.id === el.dataset.employeeId);

        if (employee && !employee.isVacancy) {
          openEmployeeDetails(employee);
        }
      });
    });
  }, 0);
}

function convertToFlatData(nodes) {
  const result = [];

  function walk(node, parentId = null) {
    const nodeId = node.department_guid || node.id;

    result.push({
      id: nodeId,
      parentId,
      name: node.department_name || node.name || "Без названия",
      staffCount: node.staffCount || 0,
      totalWithVacancies: node.totalWithVacancies ?? node.staffCount ?? 0,
      headName: node.department_manager || "",
      headPosition: node.department_manager_position || "",
      isDepartment: !!node.department_guid,
    });

    (node.children || []).forEach(child => walk(child, nodeId));

    (node.users || [])
      .filter(user => showVacancies || !user.isVacancy)
      .forEach(user => {
        result.push({
          ...user,
          id: user.id || `user_${result.length + 1}`,
          parentId: nodeId,
          name: user.full_name || user.name || "Сотрудник",
          position: user.position || "",
          isDepartment: false,
          isVacancy: !!user.isVacancy,
        });
      });
  }

  nodes.forEach(node => walk(node));

  return result;
}

document.addEventListener("DOMContentLoaded", initApp);