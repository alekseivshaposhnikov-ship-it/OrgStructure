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

// -------------------- Делаем d3 и flextree глобальными (требование d3-org-chart) --------------------
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

// -------------------- Расчёт статистики по дереву (руководитель + численность) --------------------
/**
 * Рекурсивно вычисляет для узла:
 * - totalCount: общее количество сотрудников в этом отделе и всех подчинённых (сумма user_count)
 * - headName: имя руководителя из department_manager (если есть), иначе fallback на пользователей
 */
function enhanceNodeStats(node) {
  // Считаем прямых сотрудников (user_count из JSON)
  let directCount = parseInt(node.user_count) || 0;
  let totalCount = directCount;

  // Рекурсивно обрабатываем детей и суммируем их totalCount
  for (let child of (node.children || [])) {
    enhanceNodeStats(child);
    totalCount += child.totalCount;
  }

  // Определяем руководителя: приоритет – department_manager из JSON
  let headName = null;
  if (node.department_manager && node.department_manager.trim() !== '') {
    headName = node.department_manager;
  } else {
    // Fallback: ищем среди пользователей, привязанных к этому отделу (если есть)
    const directUsers = node.users || [];
    let headUser = directUsers.find(u => u.role === 'head') || directUsers[0];
    headName = headUser ? (headUser.name || headUser.full_name || 'Сотрудник') : 'Нет руководителя';
  }

  node.totalCount = totalCount;
  node.headName = headName;
}

/**
 * Применяет enhanceNodeStats ко всем корневым узлам дерева
 */
function enhanceTreeStats(tree) {
  tree.forEach(node => enhanceNodeStats(node));
}

// -------------------- Утилиты преобразования данных --------------------
/**
 * Преобразует иерархическое дерево в плоский массив для d3-org-chart
 * Теперь включает totalCount и headName
 */
function convertToFlatData(nodes) {
  const result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    result.push({
      id: currentId,
      parentId: parentId,
      name: node.department_name || 'Без названия',
      totalCount: node.totalCount || 0,
      headName: node.headName || 'Нет руководителя'
    });

    (node.children || []).forEach(child => walk(child, currentId));

    (node.users || []).forEach(user => {
      result.push({
        id: idCounter++,
        parentId: currentId,
        name: user.name || user.full_name || 'Сотрудник'
      });
    });
  }

  const rootId = idCounter++;
  result.push({
    id: rootId,
    parentId: null,
    name: 'Company'
  });

  nodes.forEach(node => walk(node, rootId));
  return result;
}

// -------------------- Рендеринг организационной диаграммы --------------------
function renderOrgChart(nodes) {
  if (!nodes || nodes.length === 0) {
    console.warn('⚠️ Нет данных для графа');
    return;
  }

  const flatData = convertToFlatData(nodes);

  if (!flatData || flatData.length === 0) {
    console.error('❌ Пустой массив данных');
    return;
  }

  if (!chart) {
    chart = new OrgChart()
      .container('#orgChart')
      .nodeHeight(() => 90)
      .nodeWidth(() => 220)
      .childrenMargin(() => 40)
      .compactMarginBetween(() => 20)
      .compactMarginPair(() => 60)
      .nodeContent(d => `
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
            👤 ${d.data.headName}
          </div>
          <div style="font-size:11px; color:#777;">
            👥 ${d.data.totalCount} чел.
          </div>
        </div>
      `);
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

// -------------------- Загрузка данных --------------------
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

  // Пересчитываем статистику после построения дерева
  enhanceTreeStats(fullTree);

  populateDepartmentSelect();
  updateTree();
});

usersInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const json = JSON.parse(text);

  usersData = json.users || [];

  if (fullTree.length > 0) {
    attachUsersToDepartments(fullTree, usersData);
    // После прикрепления пользователей пересчитываем статистику (на случай fallback)
    enhanceTreeStats(fullTree);
    updateTree();
  }
});

// -------------------- Работа с селектом департаментов --------------------
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

    if (node.children && node.children.length > 0) {
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
    if (selectedNode) {
      nodesToExport = collectSubDepartments(selectedNode);
    }
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
    if (selectedNode) {
      nodesToExport = collectSubDepartments(selectedNode);
    }
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