import { jsPDF } from "jspdf";
import { calculateCompactLayout, convertToCompactTree } from "./compact-a4/compact-a4-layout.js";
import { renderCompactSvg } from "./compact-a4/compact-a4-svg-renderer.js";

const DEPT_CARD_WIDTH = 300;
const DEPT_CARD_HEIGHT = 136;
const PERSON_CARD_WIDTH = 300;
const PERSON_CARD_HEIGHT = 96;

const H_GAP = 56;
const V_GAP = 76;
const PERSON_GRID_GAP_X = 48;
const PERSON_GRID_GAP_Y = 36;

const PADDING = 56;
const HEADER_HEIGHT = 124;
const EXPORT_SCALE = 2;

const MAX_PERSON_COLUMNS = 2;

const COLORS = {
  blue: "#155eef",
  blueLight: "#eef4ff",
  text: "#101828",
  muted: "#667085",
  border: "#d0d5dd",
  line: "#98a2b3",
  purple: "#7a5af8",
  red: "#f04438",
};

export async function exportOrgChartToPdf({
  rootNodes = [],
  title = "Организационная структура",
  subtitle = "",
  hideNames = false,
  showVacancies = true,
  viewMode = "to-be",
} = {}) {
  if (!rootNodes.length) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const exportButton = document.getElementById("exportPdf");
  const originalButtonText = exportButton?.textContent;

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.textContent = "Экспорт...";
  }

  try {
    const exportTree = buildExportTree(rootNodes, { hideNames, showVacancies });
    if (!exportTree) throw new Error("Нет данных для экспорта");

    validateExportTree(exportTree);

    const svg = renderExportSvg(exportTree, {
      title,
      subtitle,
      viewMode,
      hideNames,
    });

    await saveSvgAsPdf(svg, sanitizeFileName(title));
  } catch (error) {
    console.error("Ошибка экспорта PDF:", error);
    alert(`Не удалось экспортировать PDF. ${error.message}`);
  } finally {
    if (exportButton) {
      exportButton.disabled = false;
      exportButton.textContent = originalButtonText || "📄 Экспорт в PDF";
    }
  }
}

function buildExportTree(rootNodes, { hideNames, showVacancies }) {
  const syntheticRoot =
    rootNodes.length === 1
      ? rootNodes[0]
      : {
          department_guid: "export-root",
          department_name: "Организационная структура",
          department_manager: "",
          department_manager_position: "",
          staffCount: rootNodes.reduce((sum, node) => sum + (node.staffCount || 0), 0),
          vacancyCount: rootNodes.reduce((sum, node) => sum + (node.vacancyCount || 0), 0),
          totalWithVacancies: rootNodes.reduce(
            (sum, node) => sum + (node.totalWithVacancies || node.staffCount || 0),
            0,
          ),
          users: [],
          children: rootNodes,
        };

  return convertDepartmentToExportNode(syntheticRoot, {
    hideNames,
    showVacancies,
    isRoot: true,
    parentId: null,
  });
}

function convertDepartmentToExportNode(
  node,
  { hideNames, showVacancies, isRoot = false, parentId = null },
) {
  const departmentId = node.department_guid || node.id || createFallbackId();

  const exportNode = {
    id: departmentId,
    type: "department",
    name: node.department_name || node.name || "Без названия",
    manager: hideNames ? "" : node.department_manager || "",
    position: node.department_manager_position || "",
    count: showVacancies
      ? node.totalWithVacancies ?? node.staffCount ?? 0
      : node.staffCount ?? 0,
    project: "",
    scenarioState: node.scenarioState || "",
    parentId,
    children: [],
  };

  const assistant = isRoot ? findAdministrativeAssistantInSubtree(node) : null;
  const assistantId = assistant?.id || null;

  if (assistant) {
    exportNode.children.push(
      convertUserToExportNode(assistant, {
        hideNames,
        forceType: "assistant",
        parentId: departmentId,
      }),
    );
  }

  (node.children || []).forEach(child => {
    const childNode = convertDepartmentToExportNode(child, {
      hideNames,
      showVacancies,
      isRoot: false,
      parentId: departmentId,
    });

    exportNode.children.push(childNode);
  });

  (node.users || [])
    .filter(user => showVacancies || !user.isVacancy)
    .filter(user => !assistantId || user.id !== assistantId)
    .filter(user => !isAdministrativeAssistant(user))
    .forEach(user => {
      exportNode.children.push(
        convertUserToExportNode(user, {
          hideNames,
          parentId: departmentId,
        }),
      );
    });

  return exportNode;
}

function convertUserToExportNode(user, { hideNames, forceType = null, parentId = null }) {
  const isVacancy = Boolean(user.isVacancy);
  const type = forceType || (isVacancy ? "vacancy" : "employee");

  return {
    id: user.id || createFallbackId(),
    type,
    name: isVacancy ? "Вакансия" : hideNames ? "" : user.full_name || user.name || "Сотрудник",
    manager: "",
    position: String(user.position || user.rawPosition || ""),
    count: null,
    project: normalizeProjects(user.project),
    scenarioState: user.scenarioState || "",
    parentId,
    children: [],
  };
}

function renderExportSvg(root, options) {
  const layoutRoot = buildExportLayout(root);
  assignExportPositions(layoutRoot, PADDING, PADDING + HEADER_HEIGHT);

  const bounds = getBounds(layoutRoot);
  const width = bounds.maxX + PADDING;
  const height = bounds.maxY + PADDING;

  const svg = createSvgElement("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    xmlns: "http://www.w3.org/2000/svg",
  });

  svg.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width,
      height,
      fill: "#ffffff",
    }),
  );

  drawHeader(svg, {
    width,
    title: options.title,
    subtitle: options.subtitle,
  });

  drawConnectors(svg, layoutRoot);
  drawNodes(svg, layoutRoot);

  return svg;
}

/**
 * Layout не меняет иерархию.
 * Department-дети раскладываются как orgchart-ветки.
 * Employee/vacancy/assistant раскладываются отдельным sibling grid-блоком.
 */
function buildExportLayout(node, depth = 0) {
  const children = (node.children || []).map(child => buildExportLayout(child, depth + 1));

  const departmentChildren = children.filter(child => child.type === "department");
  const personChildren = children.filter(child => child.type !== "department");

  const cardWidth = getCardWidth(node);
  const cardHeight = getCardHeight(node);

  const departmentRowWidth = getRowWidth(departmentChildren);
  const departmentRowHeight = getRowHeight(departmentChildren);

  const personGrid = buildPersonGrid(personChildren);
  const personGridWidth = personGrid.width;
  const personGridHeight = personGrid.height;

  const childrenWidth = Math.max(departmentRowWidth, personGridWidth);
  const childrenHeight =
    (departmentChildren.length ? V_GAP + departmentRowHeight : 0) +
    (personChildren.length ? V_GAP + personGridHeight : 0);

  return {
    ...node,
    depth,
    children,
    departmentChildren,
    personChildren,
    personGrid,
    cardWidth,
    cardHeight,
    subtreeWidth: Math.max(cardWidth, childrenWidth),
    subtreeHeight: cardHeight + childrenHeight,
    x: 0,
    y: 0,
  };
}

function assignExportPositions(node, left, top) {
  node.x = left + node.subtreeWidth / 2 - node.cardWidth / 2;
  node.y = top;

  let cursorY = top + node.cardHeight;

  if (node.departmentChildren.length) {
    cursorY += V_GAP;

    const rowWidth = getRowWidth(node.departmentChildren);
    let childLeft = left + node.subtreeWidth / 2 - rowWidth / 2;

    node.departmentChildren.forEach(child => {
      assignExportPositions(child, childLeft, cursorY);
      childLeft += child.subtreeWidth + H_GAP;
    });

    cursorY += getRowHeight(node.departmentChildren);
  }

  if (node.personChildren.length) {
    cursorY += V_GAP;

    const grid = node.personGrid;
    const gridLeft = left + node.subtreeWidth / 2 - grid.width / 2;

    node.personChildren.forEach((child, index) => {
      const col = index % grid.columns;
      const row = Math.floor(index / grid.columns);

      child.x = gridLeft + col * (PERSON_CARD_WIDTH + PERSON_GRID_GAP_X);
      child.y = cursorY + row * (PERSON_CARD_HEIGHT + PERSON_GRID_GAP_Y);
    });
  }
}

function buildPersonGrid(personChildren) {
  if (!personChildren.length) {
    return { columns: 0, rows: 0, width: 0, height: 0 };
  }

  const columns = Math.min(MAX_PERSON_COLUMNS, personChildren.length);
  const rows = Math.ceil(personChildren.length / columns);

  return {
    columns,
    rows,
    width: columns * PERSON_CARD_WIDTH + (columns - 1) * PERSON_GRID_GAP_X,
    height: rows * PERSON_CARD_HEIGHT + (rows - 1) * PERSON_GRID_GAP_Y,
  };
}

function getRowWidth(children) {
  if (!children.length) return 0;
  return children.reduce((sum, child, index) => {
    return sum + child.subtreeWidth + (index > 0 ? H_GAP : 0);
  }, 0);
}

function getRowHeight(children) {
  if (!children.length) return 0;
  return children.reduce((max, child) => Math.max(max, child.subtreeHeight), 0);
}

function getCardWidth(node) {
  return node.type === "department" ? DEPT_CARD_WIDTH : PERSON_CARD_WIDTH;
}

function getCardHeight(node) {
  return node.type === "department" ? DEPT_CARD_HEIGHT : PERSON_CARD_HEIGHT;
}

function getBounds(root) {
  let maxX = 0;
  let maxY = 0;

  walk(root, node => {
    maxX = Math.max(maxX, node.x + node.cardWidth);
    maxY = Math.max(maxY, node.y + node.cardHeight);
  });

  return { maxX, maxY };
}

function drawHeader(svg, { width, title, subtitle }) {
  appendText(svg, "Организационная структура", {
    x: PADDING,
    y: 38,
    size: 15,
    weight: 700,
    fill: COLORS.blue,
  });

  appendText(svg, title, {
    x: PADDING,
    y: 66,
    size: 26,
    weight: 700,
    fill: COLORS.text,
  });

  if (subtitle) {
    appendText(svg, subtitle, {
      x: PADDING,
      y: 92,
      size: 15,
      fill: COLORS.muted,
    });
  }

  appendText(svg, formatDate(new Date()), {
    x: width - PADDING,
    y: 66,
    size: 15,
    fill: COLORS.muted,
    anchor: "end",
  });

  svg.appendChild(
    createSvgElement("line", {
      x1: PADDING,
      y1: 112,
      x2: width - PADDING,
      y2: 112,
      stroke: "#e4e7ec",
      "stroke-width": 1,
    }),
  );
}

function drawConnectors(svg, root) {
  walk(root, parent => {
    if (!parent.children || !parent.children.length) return;

    const children = parent.children;
    const parentX = parent.x + parent.cardWidth / 2;
    const parentY = parent.y + parent.cardHeight;

    const departmentChildren = children.filter(child => child.type === "department");
    const personChildren = children.filter(child => child.type !== "department");

    if (departmentChildren.length) {
      drawSiblingGroupConnector(svg, parent, departmentChildren, parentX, parentY);
    }

    if (personChildren.length) {
      drawSiblingGroupConnector(svg, parent, personChildren, parentX, parentY);
    }
  });
}

function drawSiblingGroupConnector(svg, parent, children, parentX, parentY) {
  if (!children.length) return;

  if (children.length === 1) {
    const child = children[0];
    drawOrthogonalLine(
      svg,
      parentX,
      parentY,
      child.x + child.cardWidth / 2,
      child.y,
    );
    return;
  }

  const minChildY = Math.min(...children.map(child => child.y));
  const trunkY = parentY + Math.max(28, (minChildY - parentY) / 2);

  drawStraightLine(svg, parentX, parentY, parentX, trunkY);

  const minX = Math.min(...children.map(child => child.x + child.cardWidth / 2));
  const maxX = Math.max(...children.map(child => child.x + child.cardWidth / 2));

  drawStraightLine(svg, minX, trunkY, maxX, trunkY);

  children.forEach(child => {
    const childX = child.x + child.cardWidth / 2;
    drawStraightLine(svg, childX, trunkY, childX, child.y);
  });
}

function drawOrthogonalLine(svg, x1, y1, x2, y2) {
  const midY = y1 + (y2 - y1) / 2;
  svg.appendChild(
    createSvgElement("path", {
      d: `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`,
      fill: "none",
      stroke: COLORS.line,
      "stroke-width": 2,
    }),
  );
}

function drawStraightLine(svg, x1, y1, x2, y2) {
  svg.appendChild(
    createSvgElement("line", {
      x1,
      y1,
      x2,
      y2,
      stroke: COLORS.line,
      "stroke-width": 2,
    }),
  );
}

function drawNodes(svg, root) {
  walk(root, node => drawCard(svg, node));
}

function drawCard(svg, node) {
  const group = createSvgElement("g", {
    transform: `translate(${node.x}, ${node.y})`,
  });

  const styles = getCardStyles(node);

  group.appendChild(
    createSvgElement("rect", {
      x: 0,
      y: 0,
      width: node.cardWidth,
      height: node.cardHeight,
      rx: 14,
      ry: 14,
      fill: styles.fill,
      stroke: styles.stroke,
      "stroke-width": styles.strokeWidth,
    }),
  );

  if (node.scenarioState) {
    drawScenarioBadge(group, node.scenarioState);
  }

  if (node.type === "department") {
    drawDepartmentContent(group, node);
  } else {
    drawPersonContent(group, node);
  }

  svg.appendChild(group);
}

function drawDepartmentContent(group, node) {
  appendWrappedText(group, node.name || "Без названия", {
    x: 18,
    y: node.scenarioState ? 46 : 30,
    maxWidth: node.cardWidth - 36,
    lineHeight: 16,
    maxLines: 2,
    size: 14,
    weight: 700,
    fill: COLORS.text,
  });

  if (node.manager) {
    appendWrappedText(group, node.manager, {
      x: 18,
      y: 76,
      maxWidth: node.cardWidth - 80,
      lineHeight: 15,
      maxLines: 1,
      size: 12,
      fill: "#344054",
    });
  }

  if (node.position) {
    appendWrappedText(group, node.position, {
      x: 18,
      y: node.manager ? 98 : 76,
      maxWidth: node.cardWidth - 80,
      lineHeight: 15,
      maxLines: 1,
      size: 12,
      fill: COLORS.muted,
    });
  }

  if (node.count !== null && node.count !== undefined) {
    drawCount(group, node.count, node.cardWidth, node.cardHeight);
  }
}

function drawPersonContent(group, node) {
  const title = node.type === "assistant"
    ? `Административный ассистент — ${node.name || ""}`
    : node.name || "Сотрудник";

  appendWrappedText(group, title, {
    x: 18,
    y: 30,
    maxWidth: node.cardWidth - 36,
    lineHeight: 16,
    maxLines: 2,
    size: 13,
    weight: 700,
    fill: COLORS.text,
  });

  if (node.position) {
    appendWrappedText(group, node.position, {
      x: 18,
      y: 66,
      maxWidth: node.cardWidth - 36,
      lineHeight: 14,
      maxLines: 1,
      size: 11,
      fill: COLORS.muted,
    });
  }

  if (node.project) {
    drawProject(group, node.project, node.cardWidth, node.cardHeight);
  }
}

function getCardStyles(node) {
  if (node.type === "department") {
    return {
      fill: node.depth === 0 ? "#f8fbff" : "#ffffff",
      stroke: COLORS.blue,
      strokeWidth: 2,
    };
  }

  if (node.type === "vacancy") {
    return {
      fill: "#f5fbff",
      stroke: "#84caff",
      strokeWidth: 2,
    };
  }

  if (node.type === "assistant") {
    return {
      fill: "#f8fafc",
      stroke: COLORS.purple,
      strokeWidth: 2,
    };
  }

  return {
    fill: "#ffffff",
    stroke: COLORS.border,
    strokeWidth: 1.5,
  };
}

function drawScenarioBadge(group, state) {
  const label = getScenarioLabel(state);
  const colors = getScenarioColors(state);

  group.appendChild(
    createSvgElement("rect", {
      x: 14,
      y: 12,
      width: label.length * 7 + 18,
      height: 20,
      rx: 10,
      ry: 10,
      fill: colors.bg,
    }),
  );

  appendText(group, label, {
    x: 23,
    y: 27,
    size: 10,
    weight: 700,
    fill: colors.text,
  });
}

function drawProject(group, project, cardWidth, cardHeight) {
  group.appendChild(
    createSvgElement("rect", {
      x: 18,
      y: cardHeight - 30,
      width: Math.min(210, cardWidth - 36),
      height: 20,
      rx: 8,
      ry: 8,
      fill: "#f2f4f7",
    }),
  );

  appendWrappedText(group, `Проект: ${project}`, {
    x: 28,
    y: cardHeight - 16,
    maxWidth: Math.min(190, cardWidth - 56),
    lineHeight: 12,
    maxLines: 1,
    size: 10,
    fill: "#475467",
  });
}

function drawCount(group, count, cardWidth, cardHeight) {
  group.appendChild(
    createSvgElement("rect", {
      x: cardWidth - 62,
      y: cardHeight - 42,
      width: 44,
      height: 28,
      rx: 14,
      ry: 14,
      fill: COLORS.blueLight,
    }),
  );

  appendText(group, String(count), {
    x: cardWidth - 40,
    y: cardHeight - 23,
    size: 14,
    weight: 700,
    fill: COLORS.blue,
    anchor: "middle",
  });
}

function appendWrappedText(
  group,
  text,
  {
    x,
    y,
    maxWidth,
    lineHeight,
    maxLines,
    size = 12,
    weight = 400,
    fill = COLORS.text,
  },
) {
  const lines = wrapText(String(text || ""), maxWidth, size, maxLines);

  lines.forEach((line, index) => {
    appendText(group, line, {
      x,
      y: y + index * lineHeight,
      size,
      weight,
      fill,
    });
  });
}

function wrapText(text, maxWidth, fontSize, maxLines) {
  const avgCharWidth = fontSize * 0.56;
  const maxChars = Math.max(4, Math.floor(maxWidth / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);

  const lines = [];
  let current = "";

  words.forEach(word => {
    const safeWord = word.length > maxChars ? truncateText(word, maxChars) : word;
    const next = current ? `${current} ${safeWord}` : safeWord;

    if (next.length <= maxChars) {
      current = next;
      return;
    }

    if (current) lines.push(current);
    current = safeWord;
  });

  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = truncateText(visible[maxLines - 1], maxChars);
    return visible;
  }

  return lines;
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function appendText(
  group,
  text,
  { x, y, size = 12, weight = 400, fill = COLORS.text, anchor = "start" },
) {
  const textEl = createSvgElement("text", {
    x,
    y,
    "font-family": "Arial, sans-serif",
    "font-size": size,
    "font-weight": weight,
    fill,
    "text-anchor": anchor,
  });

  textEl.textContent = text || "";
  group.appendChild(textEl);
}

function createSvgElement(tagName, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

async function saveSvgAsPdf(svg, fileName) {
  const { width, height } = svg.viewBox.baseVal;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });

  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = width * EXPORT_SCALE;
    canvas.height = height * EXPORT_SCALE;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
      compress: true,
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileName}.pdf`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

function walk(node, callback) {
  if (!node) return;
  callback(node);
  (node.children || []).forEach(child => walk(child, callback));
}

function validateExportTree(root) {
  const nodes = [];
  walk(root, node => nodes.push(node));

  const ids = new Set(nodes.map(node => node.id));

  nodes.forEach(node => {
    if (node !== root && !node.parentId) {
      console.warn("PDF export warning: node without parentId", node);
    }

    if (node.parentId && !ids.has(node.parentId)) {
      console.warn("PDF export warning: parentId not found", node);
    }

    if (node.type !== "department" && (node.children || []).length) {
      console.warn("PDF export warning: employee/vacancy has children", node);
    }
  });
}

function findAdministrativeAssistantInSubtree(node) {
  const ownAssistant = findAdministrativeAssistant(node.users || []);
  if (ownAssistant) return ownAssistant;

  for (const child of node.children || []) {
    const childAssistant = findAdministrativeAssistantInSubtree(child);
    if (childAssistant) return childAssistant;
  }

  return null;
}

function findAdministrativeAssistant(users) {
  return (users || []).find(user => isAdministrativeAssistant(user)) || null;
}

function isAdministrativeAssistant(user) {
  if (!user || user.isVacancy) return false;
  const position = String(user.rawPosition || user.position || "").toLowerCase();
  return position.includes("административный ассистент");
}

function normalizeProjects(value) {
  return String(value || "")
    .split(";")
    .map(item => item.trim())
    .filter(Boolean)
    .join("; ");
}

function getScenarioLabel(state) {
  if (state === "added") return "NEW";
  if (state === "changed") return "Изменен";
  if (state === "moved") return "Перемещен";
  if (state === "removed") return "Удален";
  return "";
}

function getScenarioColors(state) {
  if (state === "added") return { bg: "#dcfae6", text: "#067647" };
  if (state === "changed") return { bg: "#dbeafe", text: "#1d4ed8" };
  if (state === "moved") return { bg: "#f4e8ff", text: "#7e22ce" };
  if (state === "removed") return { bg: "#fee4e2", text: "#b42318" };
  return { bg: "#f2f4f7", text: "#344054" };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function sanitizeFileName(value) {
  return String(value || "orgchart")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 120);
}

let fallbackIdCounter = 0;

function createFallbackId() {
  fallbackIdCounter += 1;
  return `export-node-${fallbackIdCounter}`;
}

/**
 * Компактный A4 PDF — оставляем отдельным независимым экспортом.
 */
export async function exportCompactA4ToPdf({
  rootNodes = [],
  title = "Организационная структура",
  subtitle = "",
  hideNames = false,
  showVacancies = true,
  viewMode = "to-be",
} = {}) {
  if (!rootNodes.length) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const exportButton = document.getElementById("exportPdf");
  const originalButtonText = exportButton?.textContent;

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.textContent = "Экспорт компактного A4...";
  }

  try {
    const exportTree = buildCompactA4ExportTree(rootNodes, { hideNames, showVacancies });
    if (!exportTree) throw new Error("Нет данных для экспорта");

    const compactTree = convertToCompactTree(exportTree);
    const layoutResult = calculateCompactLayout(compactTree);

    if (!layoutResult || !layoutResult.canFit) {
      alert("Структуру невозможно уместить на один лист A4 без потери читаемости");
      return;
    }

    const svg = renderCompactSvg(layoutResult, { title, subtitle });
    await saveCompactSvgAsA4Pdf(svg, sanitizeFileName(title));
  } catch (error) {
    console.error("Ошибка экспорта компактного PDF:", error);
    alert(`Не удалось экспортировать компактный PDF. ${error.message}`);
  } finally {
    if (exportButton) {
      exportButton.disabled = false;
      exportButton.textContent = originalButtonText || "📄 Экспорт в PDF";
    }
  }
}

function buildCompactA4ExportTree(rootNodes, { hideNames, showVacancies }) {
  return buildExportTree(rootNodes, { hideNames, showVacancies });
}

async function saveCompactSvgAsA4Pdf(svg, fileName) {
  const { width, height } = svg.viewBox.baseVal;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });

  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [canvas.width, canvas.height],
      compress: true,
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileName}_compact_A4.pdf`);
  } finally {
    URL.revokeObjectURL(url);
  }
}