/**
 * compact-a4-screen-renderer.js
 *
 * Рендерит компактную orgchart на экране (в т.ч. для экранного просмотра)
 * через SVG без использования d3-org-chart.
 *
 * Для компактного A4 режима на экране создаётся SVG,
 * который вписывается в контейнер #orgChart.
 */

import { calculateCompactLayout, convertToCompactTree, A4_WIDTH, A4_HEIGHT } from './compact-a4-layout.js';
import { renderCompactSvg } from './compact-a4-svg-renderer.js';

/**
 * Рендерит компактную orgchart на экране.
 *
 * @param {Array} rootNodes - корневые узлы (как в renderScreenOrgChart)
 * @param {string} containerSelector - селектор контейнера (например "#orgChart")
 * @param {Object} options - { hideNames, showVacancies, viewMode }
 */
export function renderCompactA4Screen(rootNodes, containerSelector = '#orgChart', options = {}) {
  const {
    hideNames = false,
    showVacancies = true,
    viewMode = 'to-be',
  } = options;

  const container = document.querySelector(containerSelector);
  if (!container) return;

  if (!rootNodes || !rootNodes.length) {
    container.innerHTML = '<div class="empty-chart">Нет данных для отображения</div>';
    return;
  }

  // Строим export-дерево так же, как в pdf-d3-export.js buildExportTree
  const exportTree = buildCompactExportTree(rootNodes, { hideNames, showVacancies });
  if (!exportTree) {
    container.innerHTML = '<div class="empty-chart">Нет данных для отображения</div>';
    return;
  }

  const compactTree = convertToCompactTree(exportTree);
  const layoutResult = calculateCompactLayout(compactTree);

  if (!layoutResult || !layoutResult.canFit) {
    container.innerHTML = `
      <div class="compact-a4-error">
        <p>Структуру невозможно уместить на один лист A4 без потери читаемости.</p>
        <p class="compact-a4-error__hint">Попробуйте другой дизайн карточек.</p>
      </div>
    `;
    return;
  }

  const modeTitles = {
    'as-is': 'Текущая структура',
    'to-be': 'Целевая структура',
    'changes': 'Изменения',
  };

  const title = rootNodes[0]?.department_name || rootNodes[0]?.name || 'Организационная структура';
  const subtitle = `${modeTitles[viewMode] || 'Организационная структура'}${showVacancies ? '' : ' · без вакансий'}`;

  const svg = renderCompactSvg(layoutResult, {
    title,
    subtitle,
  });

  container.innerHTML = '';
  container.appendChild(svg);

  // Адаптируем размер SVG к контейнеру
  fitSvgToContainer(svg, container);
}

/**
 * Подгоняет SVG под размер контейнера с сохранением пропорций.
 */
function fitSvgToContainer(svg, container) {
  const containerWidth = container.clientWidth || 800;
  const containerHeight = container.clientHeight || 600;

  const svgWidth = A4_WIDTH;
  const svgHeight = A4_HEIGHT;

  const scaleX = containerWidth / svgWidth;
  const scaleY = containerHeight / svgHeight;
  const scale = Math.min(scaleX, scaleY, 1.5); // не больше 1.5x

  svg.setAttribute('width', svgWidth * scale);
  svg.setAttribute('height', svgHeight * scale);
  svg.style.maxWidth = '100%';
}

/**
 * Строит export-дерево для компактного рендеринга (аналог buildExportTree из pdf-d3-export.js).
 */
function buildCompactExportTree(rootNodes, { hideNames, showVacancies }) {
  const syntheticRoot = rootNodes.length === 1
    ? rootNodes[0]
    : {
        department_guid: 'export-root',
        department_name: 'Организационная структура',
        department_manager: '',
        department_manager_position: '',
        staffCount: rootNodes.reduce((sum, node) => sum + (node.staffCount || 0), 0),
        vacancyCount: rootNodes.reduce((sum, node) => sum + (node.vacancyCount || 0), 0),
        totalWithVacancies: rootNodes.reduce((sum, node) => sum + (node.totalWithVacancies || node.staffCount || 0), 0),
        users: [],
        children: rootNodes,
      };

  return convertDepartmentToExportNode(syntheticRoot, {
    hideNames,
    showVacancies,
    compactMode: true,
    isRoot: true,
    depth: 0,
  });
}

function convertDepartmentToExportNode(node, { hideNames, showVacancies, compactMode, isRoot, depth }) {
  const departmentId = node.department_guid || node.id || `node_${depth}`;

  const exportNode = {
    id: departmentId,
    type: 'department',
    name: node.department_name || node.name || 'Без названия',
    manager: hideNames ? '' : node.department_manager || '',
    position: node.department_manager_position || '',
    count: showVacancies
      ? (node.totalWithVacancies ?? node.staffCount ?? 0)
      : (node.staffCount ?? 0),
    project: '',
    scenarioState: node.scenarioState || '',
    parentId: null,
    children: [],
  };

  const assistant = isRoot ? findAdministrativeAssistantInSubtree(node) : null;
  const assistantId = assistant?.id || null;

  if (assistant) {
    exportNode.children.push(convertUserToExportNode(assistant, {
      hideNames,
      forceType: 'assistant',
      parentId: departmentId,
    }));
  }

  (node.children || []).forEach(child => {
    const childNode = convertDepartmentToExportNode(child, {
      hideNames,
      showVacancies,
      compactMode,
      isRoot: false,
      depth: depth + 1,
    });
    if (childNode) {
      childNode.parentId = departmentId;
      exportNode.children.push(childNode);
    }
  });

  (node.users || [])
    .filter(user => showVacancies || !user.isVacancy)
    .filter(user => !assistantId || user.id !== assistantId)
    .filter(user => !isAdministrativeAssistant(user))
    .forEach(user => {
      const userNode = convertUserToExportNode(user, {
        hideNames,
        parentId: departmentId,
      });
      if (userNode) exportNode.children.push(userNode);
    });

  return exportNode;
}

function convertUserToExportNode(user, { hideNames, forceType = null, parentId = null }) {
  if (!user) return null;

  const isVacancy = Boolean(user.isVacancy);
  const type = forceType || (isVacancy ? 'vacancy' : 'employee');

  return {
    id: user.id || `user_${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: isVacancy
      ? 'Вакансия'
      : hideNames
        ? ''
        : user.full_name || user.name || 'Сотрудник',
    manager: '',
    position: String(user.position || user.rawPosition || ''),
    count: null,
    project: normalizeProjects(user.project),
    scenarioState: user.scenarioState || '',
    parentId,
    children: [],
  };
}

function findAdministrativeAssistantInSubtree(node) {
  const ownAssistant = findAdministrativeAssistant(node.users || []);
  if (ownAssistant) return ownAssistant;
  for (const child of node.children || []) {
    const found = findAdministrativeAssistantInSubtree(child);
    if (found) return found;
  }
  return null;
}

function findAdministrativeAssistant(users) {
  return (users || []).find(user => isAdministrativeAssistant(user)) || null;
}

function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || '').toLowerCase();
  return position.includes('административный ассистент');
}

function normalizeProjects(value) {
  return String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .join('; ');
}