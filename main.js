import * as d3 from "d3";
import { flextree } from "d3-flextree";
import { OrgChart } from "d3-org-chart";
import { fetchOrganizationStructure } from "./src/api.js";
import { addLevels } from "./src/layout.js";
import { exportOrgChartToPdf } from "./src/pdf-export.js";
import "./src/pdf-export.css";

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
    buildTreeView(fullTree, container);
    renderScreenOrgChart([selectedNode]);

    document.getElementById("exportPdf")?.addEventListener("click", () => {
      exportOrgChartToPdf({
        selectedNode,
        chart,
        convertToFlatData,
        createOrgChartInstance,
      });
    });

    document.getElementById("showVacancies")?.addEventListener("change", event => {
      showVacancies = event.target.checked;
      buildTreeView(fullTree, container);
      renderScreenOrgChart([selectedNode]);
    });

    document
      .getElementById("closeEmployeeModal")
      ?.addEventListener("click", closeEmployeeDetails);

    document
      .querySelector(".employee-modal__backdrop")
      ?.addEventListener("click", closeEmployeeDetails);
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

function createSyntheticRoot(nodes) {
  const totalStaff = nodes.reduce((sum, n) => sum + (n.staffCount || 0), 0);
  const totalVac = nodes.reduce((sum, n) => sum + (n.vacancyCount || 0), 0);

  return {
    department_name: "Холдинг LEGENDA",
    department_guid: "synthetic-root",
    children: nodes,
    staffCount: totalStaff,
    vacancyCount: totalVac,
    totalWithVacancies: totalStaff + totalVac,
    department_manager: "Селиванов Василий Геннадьевич",
    department_manager_position: "Генеральный директор",
    users: [],
  };
}

function getDisplayCount(node) {
  return showVacancies
    ? node.totalWithVacancies || node.staffCount || 0
    : node.staffCount || 0;
}

function getCountClass() {
  return showVacancies ? "count-with-vacancies" : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "—";

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function buildTreeView(nodes, container) {
  container.innerHTML = "";

  const rootUl = document.createElement("ul");
  rootUl.className = "tree-list";

  const rootNode = createSyntheticRoot(nodes);

  if (selectedNode?.department_guid === "synthetic-root") {
    selectedNode = rootNode;
  }

  createNodeElement(rootNode, rootUl, true);
  container.appendChild(rootUl);
}

function createNodeElement(node, parentUl, isRoot = false) {
  const li = document.createElement("li");

  const row = document.createElement("div");
  row.className = "tree-row";

  const toggle = document.createElement("span");
  toggle.className = "toggle";
  toggle.textContent = "▶";
  toggle.style.visibility = node.children?.length ? "visible" : "hidden";

  const label = document.createElement("span");
  label.className = "dept-label";
  label.textContent = node.department_name || "Без названия";

  if (selectedNode?.department_guid === node.department_guid) {
    label.classList.add("selected");
  }

  row.appendChild(toggle);
  row.appendChild(label);
  li.appendChild(row);

  const childUl = document.createElement("ul");
  childUl.style.display = isRoot ? "block" : "none";

  if (isRoot) {
    toggle.textContent = "▼";
  }

  (node.children || []).forEach(child => createNodeElement(child, childUl));

  li.appendChild(childUl);

  toggle.addEventListener("click", event => {
    event.stopPropagation();

    const isHidden = childUl.style.display === "none";
    childUl.style.display = isHidden ? "block" : "none";
    toggle.textContent = isHidden ? "▼" : "▶";
  });

  label.addEventListener("click", event => {
    event.stopPropagation();

    selectedNode = node;
    renderScreenOrgChart([node]);

    document
      .querySelectorAll(".dept-label")
      .forEach(el => el.classList.remove("selected"));

    label.classList.add("selected");
  });

  label.addEventListener("dblclick", event => {
    event.stopPropagation();

    if (node.children?.length) {
      toggle.click();
    }
  });

  parentUl.appendChild(li);
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
    .nodeContent(d => renderNodeContent(d.data));

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

function renderNodeContent(nd) {
  if (nd.isDepartment) {
    if (cardDesign === "variant2") {
      return renderDepartmentVariant2(nd);
    }

    if (cardDesign === "variant3") {
      return renderDepartmentVariant3(nd);
    }

    return renderDepartmentClassic(nd);
  }

  if (nd.isVacancy) {
    return `
      <div class="chart-card chart-card--vacancy">
        <div class="chart-card__title">Вакансия</div>
        ${
          nd.position
            ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="chart-card chart-card--employee" data-employee-id="${escapeHtml(nd.id)}">
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      ${
        nd.position
          ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
          : ""
      }
    </div>
  `;
}

function renderDepartmentClassic(nd) {
  return `
    <div class="chart-card chart-card--department">
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>

      <div class="chart-card__manager">
        👤 ${escapeHtml(nd.headName || "Нет руководителя")}
      </div>

      ${
        nd.headPosition
          ? `<div class="chart-card__manager-position">${escapeHtml(nd.headPosition)}</div>`
          : ""
      }

      <div class="chart-card__count ${getCountClass()}">
        ${getDisplayCount(nd)}
      </div>
    </div>
  `;
}

function renderDepartmentVariant2(nd) {
  return `
    <div class="chart-card chart-card--department-v2">
      <div class="chart-card-v2__header">
        <div class="chart-card-v2__title">${escapeHtml(nd.name)}</div>
      </div>

      <div class="chart-card-v2__body">
        <div class="chart-card-v2__manager">${escapeHtml(nd.headName || "Нет руководителя")}</div>
        ${
          nd.headPosition
            ? `<div class="chart-card-v2__position">${escapeHtml(nd.headPosition)}</div>`
            : ""
        }
      </div>

      <div class="chart-card-v2__footer">
        ${getDisplayCount(nd)} сотрудников
      </div>
    </div>
  `;
}

function renderDepartmentVariant3(nd) {
  return `
    <div class="chart-card chart-card--department-v3">
      <div class="chart-card-v3__avatar">${escapeHtml(getInitials(nd.headName))}</div>

      <div class="chart-card-v3__content">
        <div class="chart-card-v3__title">${escapeHtml(nd.name)}</div>
        <div class="chart-card-v3__manager">${escapeHtml(nd.headName || "Нет руководителя")}</div>
        ${
          nd.headPosition
            ? `<div class="chart-card-v3__position">${escapeHtml(nd.headPosition)}</div>`
            : ""
        }

        <div class="chart-card-v3__count">
          ${getDisplayCount(nd)} сотрудников
        </div>
      </div>
    </div>
  `;
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

function openEmployeeDetails(employee) {
  const modal = document.getElementById("employeeModal");
  const details = document.getElementById("employeeDetails");

  if (!modal || !details) return;

  details.innerHTML = `
    <div class="employee-details">
      ${
        employee.photo
          ? `<img class="employee-details__photo" src="${escapeHtml(employee.photo)}" alt="${escapeHtml(employee.name || "")}" />`
          : `<div class="employee-details__photo employee-details__photo--empty">👤</div>`
      }

      <h2>${escapeHtml(employee.name || employee.full_name || "Сотрудник")}</h2>

      ${employee.position ? `<p><b>Должность:</b> ${escapeHtml(employee.position)}</p>` : ""}
      ${employee.project ? `<p><b>Проект:</b> ${escapeHtml(employee.project)}</p>` : ""}
      ${employee.phone ? `<p><b>Телефон:</b> ${escapeHtml(employee.phone)}</p>` : ""}
      ${employee.email ? `<p><b>Email:</b> <a href="mailto:${escapeHtml(employee.email)}">${escapeHtml(employee.email)}</a></p>` : ""}
      ${employee.typeEmployment ? `<p><b>Тип занятости:</b> ${escapeHtml(employee.typeEmployment)}</p>` : ""}
      ${employee.state ? `<p><b>Статус:</b> ${escapeHtml(employee.state)}</p>` : ""}
    </div>
  `;

  modal.classList.remove("hidden");
}

function closeEmployeeDetails() {
  document.getElementById("employeeModal")?.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", initApp);