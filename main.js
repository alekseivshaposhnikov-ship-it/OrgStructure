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

// -------------------- Утилиты преобразования данных --------------------
/**
 * Преобразует иерархическое дерево в плоский массив для d3-org-chart
 */
function convertToFlatData(nodes) {
  const result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    result.push({
      id: currentId,
      parentId: parentId,
      name: node.department_name || 'Без названия'
    });

    // Рекурсивно обходим дочерние департаменты
    (node.children || []).forEach(child => walk(child, currentId));

    // Добавляем пользователей как листья
    (node.users || []).forEach(user => {
      result.push({
        id: idCounter++,
        parentId: currentId,
        name: user.name || user.full_name || 'Сотрудник'
      });
    });
  }

  // Создаём единый корень "Company"
  const rootId = idCounter++;
  result.push({
    id: rootId,
    parentId: null,
    name: 'Company'
  });

  nodes.forEach(node => walk(node, rootId));
  return result;
}

/**
 * Преобразование в иерархический формат (не используется, оставлен для совместимости)
 */
function convertToD3Format(nodes) {
  const children = (nodes || [])
    .map(mapNode)
    .filter(Boolean);

  return {
    name: 'Company',
    children: children.length ? children : [{ name: 'Нет данных' }]
  };
}

function mapNode(node) {
  if (!node) return null;

  return {
    name: node.department_name || 'Без названия',
    children: [
      ...(node.children || []).map(mapNode),
      ...((node.users || []).map(u => ({
        name: u.name || u.full_name || 'Сотрудник'
      })))
    ]
  };
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

  // Инициализация d3-org-chart при первом вызове
  if (!chart) {
    chart = new OrgChart()
      .container('#orgChart')
      .nodeHeight(() => 70)
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
          <div style="font-weight:600;">
            ${d.data.name}
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

  // Рендер в HTML (если требуется дополнительный вывод)
  renderTree(nodesToRender, treeContainer);

  // Рендер d3-графа
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