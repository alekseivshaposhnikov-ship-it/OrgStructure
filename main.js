import * as d3 from "d3";
import { flextree } from "d3-flextree";
import { OrgChart } from "d3-org-chart";

import {
  buildTree,
  collectSubDepartments,
  getTopLevelDepartments,
  attachUsersToDepartments,
} from "./src/tree.js";

import { renderTree } from "./src/render.js";

// -------------------- Глобальный d3 для d3-org-chart --------------------
window.d3 = { ...d3, flextree };

// -------------------- Глобальные переменные --------------------
let treeData = [];
let fullTree = [];
let usersData = [];
let chart = null;

// Хранилище данных узлов для быстрого доступа по id
const nodeDataMap = new Map();

// -------------------- DOM элементы --------------------
const fileInput = document.getElementById("fileInput");
const usersInput = document.getElementById("usersInput");
const departmentSelect = document.getElementById("departmentSelect");
const treeContainer = document.getElementById("treeContainer");
const showAllCheckbox = document.getElementById("showAll");
const exportPdfBtn = document.getElementById("exportPdf");
const addNodeModal = document.getElementById("addNodeModal");
const modalTitle = document.getElementById("modalTitle");
const nodeForm = document.getElementById("nodeForm");
const nodeTypeSelect = document.getElementById("nodeType");
const deptFields = document.getElementById("deptFields");
const userFields = document.getElementById("userFields");
const cancelModalBtn = document.getElementById("cancelModalBtn");

// --- Глобальная переменная для хранения целевого узла для операций ---
let targetNodeForAction = null;

// --- Предотвращаем закрытие модалки при клике внутри ---
addNodeModal.addEventListener("click", (e) => e.stopPropagation());
nodeForm.addEventListener("click", (e) => e.stopPropagation());

// --- Слушатель для изменения типа узла в модальном окне ---
nodeTypeSelect.addEventListener("change", (e) => {
  if (e.target.value === "department") {
    deptFields.style.display = "block";
    userFields.style.display = "none";
  } else {
    deptFields.style.display = "none";
    userFields.style.display = "block";
  }
});

// --- Закрытие модального окна ---
cancelModalBtn.addEventListener("click", () => {
  addNodeModal.style.display = "none";
  targetNodeForAction = null;
});

// --- Отправка формы модального окна ---
nodeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!targetNodeForAction) return;

  const nodeType = nodeTypeSelect.value;
  const newNodeData = {};

  if (nodeType === "department") {
    newNodeData.department_name = document.getElementById("deptName").value;
    newNodeData.department_manager = document.getElementById("deptManager").value;
    newNodeData.department_guid = generateGuid();
    newNodeData.children = [];
    newNodeData.users = [];
  } else {
    newNodeData.name = document.getElementById("userName").value;
  }

  addNewNodeToTarget(targetNodeForAction, newNodeData, nodeType);

  addNodeModal.style.display = "none";
  targetNodeForAction = null;
  nodeForm.reset();
});

// -------------------- Функция генерации GUID --------------------
function generateGuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// -------------------- Удаление узла --------------------
function deleteNode(nodeToDelete) {
  const guidToDelete = nodeToDelete.department_guid || nodeToDelete.id;

  function removeNodeFromArray(nodes, guid) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.department_guid === guid) {
        nodes.splice(i, 1);
        return true;
      }

      if (!node.department_guid && node.id === guid) {
        nodes.splice(i, 1);
        return true;
      }

      if (node.children && Array.isArray(node.children)) {
        if (removeNodeFromArray(node.children, guid)) return true;
      }

      if (node.users && Array.isArray(node.users)) {
        for (let j = 0; j < node.users.length; j++) {
          if (node.users[j].id === guid) {
            node.users.splice(j, 1);
            return true;
          }
        }
      }
    }
    return false;
  }

  const removed = removeNodeFromArray(fullTree, guidToDelete);

  if (removed) {
    enhanceTreeStats(fullTree);
    populateDepartmentSelect();
    updateTree();
    console.log(`Узел с GUID ${guidToDelete} удален.`);
  } else {
    console.error(`Не удалось найти узел с GUID ${guidToDelete} для удаления.`);
  }

  targetNodeForAction = null;
}

// -------------------- Добавление нового узла --------------------
function addNewNodeToTarget(parentNode, newNodeData, type) {
  const parentGuid = parentNode.department_guid || parentNode.id;

  // Особая обработка синтетического корня
  if (parentGuid === "synthetic-root") {
    if (type === "department") {
      fullTree.push(newNodeData);
    } else {
      console.error("Нельзя добавить сотрудника напрямую в корень компании");
      return;
    }
  } else {
    let parentFound = null;

    function findParent(nodes, guid) {
      for (let node of nodes) {
        if (node.department_guid === guid || node.id === guid) {
          parentFound = node;
          return true;
        }
        if (node.children && findParent(node.children, guid)) return true;
      }
      return false;
    }

    findParent(fullTree, parentGuid);

    if (!parentFound) {
      console.error("Родительский узел не найден.");
      return;
    }

    if (type === "department") {
      if (!parentFound.children) parentFound.children = [];
      parentFound.children.push(newNodeData);
    } else {
      if (!parentFound.users) parentFound.users = [];
      newNodeData.id = "user_" + generateGuid();
      parentFound.users.push(newNodeData);
    }
  }

  enhanceTreeStats(fullTree);
  populateDepartmentSelect();
  updateTree();
  console.log(`Новый ${type} добавлен.`);
}

// -------------------- Обработчик двойного клика --------------------
function handleNodeDoubleClick(nodeData) {
  targetNodeForAction = nodeData;

  if (nodeData.isDepartment) {
    showActionMenu(nodeData);
  } else {
    if (confirm(`Удалить сотрудника "${nodeData.name}"?`)) {
      deleteNode(nodeData);
    }
    targetNodeForAction = null;
  }
}

function showActionMenu(nodeData) {
  const action = prompt(
    `Выберите действие для департамента "${nodeData.name}":\n` +
    `1 - Добавить подразделение\n` +
    `2 - Добавить сотрудника\n` +
    `3 - Удалить${nodeData.id === 'synthetic-root' ? ' (недоступно для корня)' : ''}\n` +
    `Введите номер:`
  );

  if (action === '1') {
    if (nodeData.id === 'synthetic-root' || nodeData.isDepartment) {
      modalTitle.textContent = "Добавить департамент";
      nodeTypeSelect.value = "department";
      deptFields.style.display = "block";
      userFields.style.display = "none";
      addNodeModal.style.display = "block";
    } else {
      alert("Нельзя добавить департамент к сотруднику");
      targetNodeForAction = null;
    }
  } else if (action === '2') {
    if (nodeData.isDepartment && nodeData.id !== 'synthetic-root') {
      modalTitle.textContent = "Добавить сотрудника";
      nodeTypeSelect.value = "user";
      deptFields.style.display = "none";
      userFields.style.display = "block";
      addNodeModal.style.display = "block";
    } else {
      alert("Сотрудника можно добавить только в обычный департамент");
      targetNodeForAction = null;
    }
  } else if (action === '3') {
    if (nodeData.id !== 'synthetic-root') {
      if (confirm(`Удалить департамент "${nodeData.name}" и всё его содержимое?`)) {
        deleteNode(nodeData);
      }
    } else {
      alert("Корневой департамент удалить нельзя");
    }
    targetNodeForAction = null;
  } else {
    targetNodeForAction = null;
  }
}

// -------------------- Панель инструментов (кнопки компоновки) --------------------
const toolbar = document.createElement("div");
toolbar.style.position = "fixed";
toolbar.style.top = "20px";
toolbar.style.right = "20px";
toolbar.style.zIndex = "1000";
toolbar.style.display = "flex";
toolbar.style.gap = "10px";
toolbar.style.backgroundColor = "#ffffff";
toolbar.style.padding = "8px 12px";
toolbar.style.borderRadius = "8px";
toolbar.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
toolbar.style.border = "1px solid #e0e0e0";

const buttonStyle = {
  padding: "8px 16px",
  fontSize: "14px",
  fontWeight: "500",
  border: "1px solid #ccc",
  borderRadius: "6px",
  backgroundColor: "#f8f9fa",
  cursor: "pointer",
  transition: "all 0.2s",
  color: "#333",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  outline: "none",
};

const topButton = document.createElement("button");
topButton.textContent = "⬆️ Top";
Object.assign(topButton.style, buttonStyle);
topButton.onmouseover = () => {
  topButton.style.backgroundColor = "#e9ecef";
  topButton.style.borderColor = "#aaa";
};
topButton.onmouseout = () => {
  topButton.style.backgroundColor = "#f8f9fa";
  topButton.style.borderColor = "#ccc";
};
topButton.onclick = () => {
  if (chart) {
    chart.layout("top").render().fit();
  }
};

const leftButton = document.createElement("button");
leftButton.textContent = "⬅️ Left";
Object.assign(leftButton.style, buttonStyle);
leftButton.onmouseover = () => {
  leftButton.style.backgroundColor = "#e9ecef";
  leftButton.style.borderColor = "#aaa";
};
leftButton.onmouseout = () => {
  leftButton.style.backgroundColor = "#f8f9fa";
  leftButton.style.borderColor = "#ccc";
};
leftButton.onclick = () => {
  if (chart) {
    chart.layout("left").render().fit();
  }
};

toolbar.appendChild(topButton);
toolbar.appendChild(leftButton);
document.body.appendChild(toolbar);

// -------------------- Статистика --------------------
function enhanceNodeStats(node) {
  let directCount = node.users && Array.isArray(node.users) ? node.users.length : 0;
  let totalCount = directCount;

  for (let child of node.children || []) {
    enhanceNodeStats(child);
    totalCount += child.totalCount;
  }

  let headName = node.department_manager && node.department_manager.trim() !== ""
    ? node.department_manager
    : "Нет руководителя";

  node.totalCount = totalCount;
  node.headName = headName;
}

function enhanceTreeStats(tree) {
  tree.forEach((node) => enhanceNodeStats(node));
}

// -------------------- Преобразование в плоский массив --------------------
function convertToFlatData(rootNodes) {
  if (!rootNodes || rootNodes.length === 0) return [];

  let nodesToProcess = rootNodes;
  let syntheticRoot = null;
  if (rootNodes.length > 1) {
    syntheticRoot = {
      department_name: "Компания",
      department_guid: "synthetic-root",
      children: rootNodes,
      totalCount: rootNodes.reduce((sum, n) => sum + (n.totalCount || 0), 0),
      headName: "Генеральный директор",
      isDepartment: true,
    };
    nodesToProcess = [syntheticRoot];
  }

  const result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    const nodeId = node.department_guid || node.id || currentId;

    const flatNode = {
      id: nodeId,
      parentId: parentId,
      name: node.department_name || node.name || "Без названия",
      totalCount: node.totalCount,
      headName: node.headName,
      isDepartment: node.hasOwnProperty("department_guid"),
    };
    result.push(flatNode);
    nodeDataMap.set(nodeId, flatNode);

    (node.children || []).forEach((child) => walk(child, nodeId));

    const users = node.users || [];
    users.forEach((user) => {
      const userId = user.id || "user_" + generateGuid();
      const userFlatNode = {
        id: userId,
        parentId: nodeId,
        name: user.name || user.full_name || "Сотрудник",
        isDepartment: false,
      };
      result.push(userFlatNode);
      nodeDataMap.set(userId, userFlatNode);
    });
  }

  nodesToProcess.forEach((node) => walk(node, null));
  return result;
}

// -------------------- Рендеринг орг. диаграммы --------------------
function renderOrgChart(nodes) {
  if (!nodes || nodes.length === 0) {
    console.warn("⚠️ Нет данных для графа");
    return;
  }

  nodeDataMap.clear();
  const flatData = convertToFlatData(nodes);
  if (!flatData.length) {
    console.error("❌ Пустой массив данных");
    return;
  }

  console.log("📊 flatData для org-диаграммы:", flatData);

  const container = document.getElementById("orgChart");
  if (container) {
    container.innerHTML = "";
  }

  let clickTimeout = null;
  let lastClickedNodeId = null;

  chart = new OrgChart()
    .container("#orgChart")
    .nodeHeight((d) => (d.data.isDepartment ? 90 : 60))
    .nodeWidth(() => 270)
    .childrenMargin(() => 40)
    .compactMarginBetween(() => 20)
    .compactMarginPair(() => 60)
    .nodeContent((d) => {
      const nodeData = d.data;
      const nodeIdAttr = nodeData.id;

      if (nodeData.isDepartment) {
        return `
          <div data-node-id="${nodeIdAttr}" style="position: relative; padding: 10px 10px 25px 10px; border:1px solid #4d8ce9; border-radius:8px; background:#fff; font-family: Inter; text-align:center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
            <div style="font-weight:600; font-size:14px; margin-bottom:6px;">${nodeData.name}</div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">👤 ${nodeData.headName || "Нет руководителя"}</div>
            <div style="position: absolute; bottom: 8px; right: 10px; font-size: 14px; font-weight: bold; color: #333;">${nodeData.totalCount || 0}</div>
          </div>
        `;
      } else {
        return `
          <div data-node-id="${nodeIdAttr}" style="padding:8px; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; font-family: Inter; text-align:center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-weight:500; font-size:13px;">${nodeData.name}</div>
          </div>
        `;
      }
    })
    .onNodeClick((nodeId) => {
      const nodeData = nodeDataMap.get(nodeId);
      if (!nodeData) return;

      if (clickTimeout && lastClickedNodeId === nodeId) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        lastClickedNodeId = null;
        handleNodeDoubleClick(nodeData);
      } else {
        clickTimeout = setTimeout(() => {
          clickTimeout = null;
          lastClickedNodeId = null;
          console.log("Одинарный клик по узлу:", nodeId);
        }, 250);
        lastClickedNodeId = nodeId;
      }
    });

  chart.data(flatData).render().fit();
}

// -------------------- Обновление отображения --------------------
function updateTree() {
  let nodesToRender = fullTree;
  const selectedGuid = departmentSelect.value;

  if (selectedGuid) {
    const selectedNode = findNodeByGuid(fullTree, selectedGuid);
    nodesToRender = selectedNode ? [selectedNode] : [];
  } else if (!showAllCheckbox.checked) {
    nodesToRender = getTopLevelDepartments(fullTree);
  }

  console.log("nodesToRender →", nodesToRender);
  renderTree(nodesToRender, treeContainer);
  renderOrgChart(nodesToRender);
}

// -------------------- Сбор департаментов с уровнем --------------------
function collectDepartmentsWithLevel(nodes, level = 0, result = []) {
  for (const node of nodes) {
    result.push({
      guid: node.department_guid,
      name: node.department_name,
      level: level,
    });
    if (node.children && node.children.length) {
      collectDepartmentsWithLevel(node.children, level + 1, result);
    }
  }
  return result;
}

function getDisplayNameWithIndent(name, level) {
  if (level === 0) return name;
  const indent = "&nbsp;&nbsp;&nbsp;".repeat(level) + "— ";
  return indent + name;
}

// -------------------- Заполнение выпадающего списка --------------------
function populateDepartmentSelect() {
  departmentSelect.innerHTML = '<option value="">-- Выберите департамент --</option>';

  if (showAllCheckbox.checked) {
    const departmentsWithLevel = collectDepartmentsWithLevel(fullTree);
    departmentsWithLevel.forEach((d) => {
      const option = document.createElement("option");
      option.value = d.guid;
      option.innerHTML = getDisplayNameWithIndent(d.name, d.level);
      departmentSelect.appendChild(option);
    });
  } else {
    const topLevel = getTopLevelDepartments(fullTree);
    topLevel.forEach((d) => {
      const option = document.createElement("option");
      option.value = d.department_guid;
      option.textContent = d.department_name;
      departmentSelect.appendChild(option);
    });
  }
}

// -------------------- Поиск узла по GUID --------------------
function findNodeByGuid(nodes, guid) {
  for (const node of nodes) {
    if (node.department_guid === guid) return node;
    if (node.children?.length) {
      const found = findNodeByGuid(node.children, guid);
      if (found) return found;
    }
  }
  return null;
}

// -------------------- Загрузка департаментов --------------------
fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const json = JSON.parse(text);

  treeData = json.departments || [];
  fullTree = buildTree(treeData) || [];

  if (usersData.length > 0) {
    attachUsersToDepartments(fullTree, usersData);
  }

  enhanceTreeStats(fullTree);
  populateDepartmentSelect();
  updateTree();
});

// -------------------- Загрузка сотрудников --------------------
usersInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const json = JSON.parse(text);

  usersData = json.users || [];

  if (fullTree.length > 0) {
    attachUsersToDepartments(fullTree, usersData);
    enhanceTreeStats(fullTree);
    updateTree();
  }
});

// -------------------- Экспорт в PDF --------------------
async function exportToPdf() {
  const element = document.getElementById("orgChart");
  if (!element || !chart) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const originalCursor = element.style.cursor;
  element.style.cursor = "wait";

  try {
    if (typeof html2canvas === "undefined" || typeof jspdf === "undefined") {
      throw new Error("Библиотеки html2canvas и jspdf не загружены");
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      allowTaint: false,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save("orgchart.pdf");
  } catch (error) {
    console.error("Ошибка экспорта PDF:", error);
    alert("Не удалось экспортировать PDF. " + error.message);
  } finally {
    element.style.cursor = originalCursor;
  }
}

if (exportPdfBtn) {
  exportPdfBtn.addEventListener("click", exportToPdf);
}

// -------------------- Обработчики событий --------------------
departmentSelect.addEventListener("change", updateTree);
showAllCheckbox.addEventListener("change", () => {
  populateDepartmentSelect();
  updateTree();
});