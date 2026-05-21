import * as d3 from "d3";
import { flextree } from "d3-flextree";
import { OrgChart } from "d3-org-chart";
import { fetchOrganizationStructure } from './src/api.js';
import { addLevels, flattenTree } from './src/layout.js';

// Глобальный d3 для d3-org-chart
window.d3 = { ...d3, flextree };

// Глобальные переменные
let fullTree = [];
let chart = null;
let selectedNode = null;
const nodeDataMap = new Map();

// -------------------- Инициализация приложения --------------------
async function initApp() {
  const container = document.getElementById('tree-container');
  if (!container) return;

  container.innerHTML = '<p>Загрузка организационной структуры...</p>';

  try {
    fullTree = await fetchOrganizationStructure();
    if (!fullTree.length) {
      container.innerHTML = '<p>Не удалось загрузить структуру.</p>';
      return;
    }

    addLevels(fullTree, 0);
    buildTreeView(fullTree, container);

    selectedNode = {
      department_name: "Компания",
      department_guid: "synthetic-root",
      children: fullTree,
      staffCount: fullTree.reduce((sum, n) => sum + (n.staffCount || 0), 0),
      department_manager: "",
      users: [],
    };
    renderOrgChart([selectedNode]);

    document.getElementById('exportPdf')?.addEventListener('click', exportToPdf);

  } catch (error) {
    console.error('Ошибка инициализации:', error);
    container.innerHTML = '<p>Произошла ошибка. Обновите страницу.</p>';
  }
}

// -------------------- Построение интерактивного дерева (без изменений) --------------------
function buildTreeView(nodes, container) {
  container.innerHTML = '';
  const rootUl = document.createElement('ul');
  rootUl.className = 'tree-list';

  function createNodeElement(node, parentUl) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'tree-row';

    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '▶';
    toggle.style.visibility = (node.children && node.children.length > 0) ? 'visible' : 'hidden';

    const label = document.createElement('span');
    label.className = 'dept-label';
    label.textContent = `${node.department_name} (${node.staffCount || 0})`;

    row.appendChild(toggle);
    row.appendChild(label);
    li.appendChild(row);

    const childUl = document.createElement('ul');
    childUl.style.display = 'none';

    if (node.children) {
      node.children.forEach(child => createNodeElement(child, childUl));
    }
    li.appendChild(childUl);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = childUl.style.display === 'none';
      childUl.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '▼' : '▶';
    });

    label.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedNode = node;
      renderOrgChart([node]);
      document.querySelectorAll('.dept-label').forEach(el => el.classList.remove('selected'));
      label.classList.add('selected');
    });

    parentUl.appendChild(li);
  }

  nodes.forEach(node => createNodeElement(node, rootUl));
  container.appendChild(rootUl);
}

// -------------------- Рендеринг D3-оргчарта (с должностью) --------------------
function renderOrgChart(rootNodes) {
  if (!rootNodes || rootNodes.length === 0) return;

  const flatData = convertToFlatData(rootNodes);
  if (!flatData.length) return;

  const container = document.getElementById('orgChart');
  if (container) container.innerHTML = '';

  chart = new OrgChart()
    .container('#orgChart')
    .nodeHeight(d => (d.data.isDepartment ? 90 : 60))
    .nodeWidth(() => 270)
    .childrenMargin(() => 40)
    .compactMarginBetween(() => 20)
    .compactMarginPair(() => 60)
    .nodeContent(d => {
      const nd = d.data;
      if (nd.isDepartment) {
        return `
          <div style="position: relative; padding: 10px 10px 25px 10px; border:1px solid #4d8ce9; border-radius:8px; background:#fff; font-family: Inter; text-align:center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
            <div style="font-weight:600; font-size:14px; margin-bottom:6px;">${nd.name}</div>
            <div style="font-size:12px; color:#555; margin-bottom:4px;">👤 ${nd.headName || "Нет руководителя"}</div>
            <div style="position: absolute; bottom: 8px; right: 10px; font-size: 14px; font-weight: bold; color: #333;">${nd.totalCount || 0}</div>
          </div>
        `;
      } else {
        return `
          <div style="padding:8px; border:1px solid #ddd; border-radius:8px; background:#f9f9f9; font-family: Inter; text-align:center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-weight:500; font-size:13px;">${nd.name}</div>
            ${nd.position ? `<div style="font-size:11px; color:#777; margin-top:2px;">${nd.position}</div>` : ''}
          </div>
        `;
      }
    });

  chart.data(flatData).render().fit();
}

// -------------------- Преобразование дерева в плоский массив --------------------
function convertToFlatData(nodes) {
  if (!nodes || nodes.length === 0) return [];
  nodeDataMap.clear();

  let result = [];
  let idCounter = 1;

  function walk(node, parentId = null) {
    const currentId = idCounter++;
    const nodeId = node.department_guid || node.id || currentId;

    const totalCount = node.staffCount || 0;
    const headName = node.department_manager || "";

    const flatNode = {
      id: nodeId,
      parentId: parentId,
      name: node.department_name || node.name || "Без названия",
      totalCount,
      headName,
      isDepartment: !!node.department_guid,
    };
    result.push(flatNode);
    nodeDataMap.set(nodeId, flatNode);

    (node.children || []).forEach(child => walk(child, nodeId));

    (node.users || []).forEach(user => {
      const userId = user.id || `user_${idCounter++}`;
      const userFlat = {
        id: userId,
        parentId: nodeId,
        name: user.full_name || user.name || "Сотрудник",
        position: user.position || "",   // <-- должность сотрудника
        isDepartment: false,
      };
      result.push(userFlat);
      nodeDataMap.set(userId, userFlat);
    });
  }

  nodes.forEach(node => walk(node, null));
  return result;
}

// -------------------- Экспорт в PDF --------------------
async function exportToPdf() {
  const element = document.getElementById('orgChart');
  if (!element || !chart) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const originalCursor = element.style.cursor;
  element.style.cursor = 'wait';

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height],
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

// Стартуем после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);