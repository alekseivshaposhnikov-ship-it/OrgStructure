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
const exportPdfBtn = document.getElementById('exportPdf');

// -------------------- Расчёт статистики (руководитель + численность) для департаментов --------------------
function enhanceNodeStats(node) {
  // Прямая численность — это количество сотрудников в node.users
  let directCount = (node.users && Array.isArray(node.users)) ? node.users.length : 0;
  let totalCount = directCount;

  for (let child of (node.children || [])) {
    enhanceNodeStats(child);
    totalCount += child.totalCount;
  }

  // Руководитель из department_manager (если есть)
  let headName = (node.department_manager && node.department_manager.trim() !== '')
    ? node.department_manager
    : 'Нет руководителя';

  node.totalCount = totalCount;
  node.headName = headName;
}

function enhanceTreeStats(tree) {
  tree.forEach(node => enhanceNodeStats(node));
}

// -------------------- Преобразование в плоский массив для d3-org-chart --------------------
function convertToFlatData(rootNodes) {
  if (!rootNodes || rootNodes.length === 0) return [];

  let nodesToProcess = rootNodes;
  let syntheticRoot = null;
  if (rootNodes.length > 1) {
    syntheticRoot = {
      department_name: 'Компания',
      department_guid: 'synthetic-root',
      children: rootNodes,
      totalCount: rootNodes.reduce((sum, n) => sum + (n.totalCount || 0), 0),
      headName: 'Генеральный директор',
      isDepartment: true,
    };
    nodesToProcess = [syntheticRoot];
  }

  const result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    result.push({
      id: currentId,
      parentId: parentId,
      name: node.department_name || 'Без названия',
      totalCount: node.totalCount,
      headName: node.headName,
      isDepartment: true
    });

    (node.children || []).forEach(child => walk(child, currentId));

    const users = node.users || [];
    users.forEach(user => {
      result.push({
        id: idCounter++,
        parentId: currentId,
        name: user.name || user.full_name || 'Сотрудник',
        isDepartment: false
      });
    });
  }

  nodesToProcess.forEach(node => walk(node, null));
  return result;
}

// -------------------- Рендеринг орг. диаграммы (полное пересоздание) --------------------
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

  console.log('📊 flatData для org-диаграммы:', flatData);

  // Удаляем старую диаграмму, если она существует
  const container = document.getElementById('orgChart');
  if (container) {
    container.innerHTML = '';
  }

  // Создаём новую диаграмму
  chart = new OrgChart()
    .container('#orgChart')
    .nodeHeight((d) => d.data.isDepartment ? 90 : 60)
    .nodeWidth(() => 270)
    .childrenMargin(() => 40)
    .compactMarginBetween(() => 20)
    .compactMarginPair(() => 60)
    .nodeContent(d => {
      if (d.data.isDepartment) {
        return `
          <div style="position: relative; padding: 10px 10px 25px 10px; border:1px solid #ddd; border-radius:8px; background:#fff; font-family: Inter; text-align:center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
            <div style="font-weight:600; font-size:14px; margin-bottom:6px;">${d.data.name}</div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">👤 ${d.data.headName || 'Нет руководителя'}</div>
            <div style="position: absolute; bottom: 8px; right: 10px; font-size: 14px; font-weight: bold; color: #333;">${d.data.totalCount || 0}</div>
          </div>
        `;
      } else {
        return `
          <div style="padding:8px; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; font-family: Inter; text-align:center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-weight:500; font-size:13px;">${d.data.name}</div>
          </div>
        `;
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

// -------------------- Экспорт в PDF --------------------
async function exportToPdf() {
  const element = document.getElementById('orgChart');
  if (!element || !chart) {
    alert('Нет диаграммы для экспорта');
    return;
  }

  const originalCursor = element.style.cursor;
  element.style.cursor = 'wait';

  try {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      throw new Error('Библиотеки html2canvas и jspdf не загружены');
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      allowTaint: false,
      useCORS: true
    });

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('orgchart.pdf');
  } catch (error) {
    console.error('Ошибка экспорта PDF:', error);
    alert('Не удалось экспортировать PDF. ' + error.message);
  } finally {
    element.style.cursor = originalCursor;
  }
}

if (exportPdfBtn) {
  exportPdfBtn.addEventListener('click', exportToPdf);
}

// -------------------- Обработчики событий --------------------
departmentSelect.addEventListener('change', updateTree);
showAllCheckbox.addEventListener('change', updateTree);