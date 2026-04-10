import * as d3 from 'd3';
import { flextree } from 'd3-flextree';
import { OrgChart } from 'd3-org-chart';

import {
  buildTree,
  collectSubDepartments,
  getTopLevelDepartments,
  attachUsersToDepartments
} from './src/tree.js';

import { renderTree } from './src/render.js';
import { exportToPptx } from './src/pptx.js';
import { exportToDrawio } from './src/drawio.js';

// -------------------- Глобальный d3 для d3-org-chart --------------------
window.d3 = { ...d3, flextree };

// -------------------- Глобальные переменные --------------------
let treeData = [];
let fullTree = [];
let usersData = [];
let chart = null;

// -------------------- DOM элементы --------------------
const fileInput = document.getElementById('fileInput');
const usersInput = document.getElementById('usersInput');
const departmentSelect = document.getElementById('departmentSelect');
const treeContainer = document.getElementById('treeContainer');
const showAllCheckbox = document.getElementById('showAll');
const exportBtn = document.getElementById('exportPptx');
const exportDrawioBtn = document.getElementById('exportDrawio');

// -------------------- Расчёт статистики (руководитель + численность) для департаментов --------------------
function enhanceNodeStats(node) {
  let directCount = parseInt(node.user_count) || 0;
  let totalCount = directCount;

  for (let child of (node.children || [])) {
    enhanceNodeStats(child);
    totalCount += child.totalCount;
  }

  // Руководитель из department_manager
  let headName = (node.department_manager && node.department_manager.trim() !== '')
    ? node.department_manager
    : 'Нет руководителя';

  node.totalCount = totalCount;
  node.headName = headName;
}

function enhanceTreeStats(tree) {
  tree.forEach(node => enhanceNodeStats(node));
}

// -------------------- Преобразование в плоский массив для d3-org-chart (департаменты + сотрудники, без корня Company) --------------------
function convertToFlatData(nodes) {
  const result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    // Узел департамента
    result.push({
      id: currentId,
      parentId: parentId,
      name: node.department_name || 'Без названия',
      totalCount: node.totalCount,
      headName: node.headName,
      isDepartment: true
    });

    // Дочерние департаменты
    (node.children || []).forEach(child => walk(child, currentId));

    // Сотрудники как отдельные узлы (листья)
    (node.users || []).forEach(user => {
      result.push({
        id: idCounter++,
        parentId: currentId,
        name: user.name || user.full_name || 'Сотрудник',
        isDepartment: false
      });
    });
  }

  nodes.forEach(node => walk(node, null));
  return result;
}

// -------------------- Рендеринг орг. диаграммы --------------------
function renderOrgChart(nodes) {
  if (!nodes || nodes.length === 0) {
    console.warn('⚠️ Нет данных для графа');
    return;
  }

  const flatData = convertToFlatData(nodes);
  if (!flatData.length) {
    console.error('❌ Пустой массив данных');
    return;
  }

  if (!chart) {
    chart = new OrgChart()
      .container('#orgChart')
      .nodeHeight((d) => d.data.isDepartment ? 90 : 60)  // сотрудникам — меньшая высота
      .nodeWidth(() => 220)
      .childrenMargin(() => 40)
      .compactMarginBetween(() => 20)
      .compactMarginPair(() => 60)
      .nodeContent(d => {
        if (d.data.isDepartment) {
          // Карточка департамента
          return `
            <div style="
              padding:10px;
              border:1px solid #ddd;
              border-radius:8px;
              background:#fff;
              font-family: Inter;
              text-align:center;
              box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            ">
              <div style="font-weight:600; font-size:14px; margin-bottom:6px;">
                ${d.data.name}
              </div>
              <div style="font-size:12px; color:#555; margin-bottom:4px;">
                👤 ${d.data.headName || 'Нет руководителя'}
              </div>
              <div style="font-size:11px; color:#777;">
                👥 ${d.data.totalCount || 0} чел.
              </div>
            </div>
          `;
        } else {
          // Карточка сотрудника (только имя)
          return `
            <div style="
              padding:8px;
              border:1px solid #ddd;
              border-radius:8px;
              background:#f9f9f9;
              font-family: Inter;
              text-align:center;
              box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            ">
              <div style="font-weight:500; font-size:13px;">
                ${d.data.name}
              </div>
            </div>
          `;
        }
      });
  }

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

  console.log('nodesToRender →', nodesToRender);
  renderTree(nodesToRender, treeContainer);
  renderOrgChart(nodesToRender);
}

// -------------------- Загрузка департаментов --------------------
fileInput.addEventListener('change', async (event) => {
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
usersInput.addEventListener('change', async (event) => {
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

// -------------------- Заполнение выпадающего списка --------------------
function populateDepartmentSelect() {
  departmentSelect.innerHTML = '<option value="">-- Выберите департамент --</option>';
  const topLevel = getTopLevelDepartments(fullTree);
  topLevel.forEach(d => {
    const option = document.createElement('option');
    option.value = d.department_guid;
    option.textContent = d.department_name;
    departmentSelect.appendChild(option);
  });
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

// -------------------- Экспорт в PPTX --------------------
exportBtn.addEventListener('click', () => {
  const selectedGuid = departmentSelect.value;
  let nodesToExport = [];

  if (selectedGuid) {
    const selectedNode = findNodeByGuid(fullTree, selectedGuid);
    if (selectedNode) nodesToExport = collectSubDepartments(selectedNode);
  } else if (!showAllCheckbox.checked) {
    getTopLevelDepartments(fullTree).forEach(node => {
      nodesToExport = nodesToExport.concat(collectSubDepartments(node));
    });
  } else {
    fullTree.forEach(node => {
      nodesToExport = nodesToExport.concat(collectSubDepartments(node));
    });
  }

  exportToPptx(nodesToExport);
});

// -------------------- Экспорт в draw.io --------------------
exportDrawioBtn.addEventListener('click', () => {
  const selectedGuid = departmentSelect.value;
  let nodesToExport = [];

  if (selectedGuid) {
    const selectedNode = findNodeByGuid(fullTree, selectedGuid);
    if (selectedNode) nodesToExport = collectSubDepartments(selectedNode);
  } else if (!showAllCheckbox.checked) {
    getTopLevelDepartments(fullTree).forEach(node => {
      nodesToExport = nodesToExport.concat(collectSubDepartments(node));
    });
  } else {
    fullTree.forEach(node => {
      nodesToExport = nodesToExport.concat(collectSubDepartments(node));
    });
  }

  exportToDrawio(nodesToExport);
});

// -------------------- Обработчики событий --------------------
departmentSelect.addEventListener('change', updateTree);
showAllCheckbox.addEventListener('change', updateTree);