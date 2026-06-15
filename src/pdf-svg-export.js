import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const SVG_NS = "http://www.w3.org/2000/svg";

const CARD_WIDTH = 340;
const CARD_HEIGHT_DEPARTMENT = 124;
const CARD_HEIGHT_PERSON = 82;

const H_GAP = 56;
const V_GAP = 90;
const PADDING = 60;

const COLORS = {
  departmentStroke: "#4d8ce9",
  employeeStroke: "#d0d5dd",
  vacancyStroke: "#b0c4de",
  connector: "#98a2b3",
  text: "#333333",
  muted: "#667085",
  vacancyBg: "#e0f0ff",
  white: "#ffffff",
  count: "#0066cc",
};

export async function exportOrgChartToPdf({ selectedNode, showVacancies }) {
  if (!selectedNode) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const exportButton = document.getElementById("exportPdf");
  const originalButtonText = exportButton?.textContent;

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.textContent = "Экспорт...";
  }

  const { exportRoot, exportArea } = createExportContainer();

  try {
    const exportTree = buildExportTree(selectedNode, showVacancies);
    const layout = calculateLayout(exportTree);
    const svg = renderSvg(layout);

    exportArea.appendChild(svg);

    await waitForPaint();
    await wait(100);

    const canvas = await toCanvas(exportArea, {
      pixelRatio: 2,
      backgroundColor: COLORS.white,
      cacheBust: true,
      fontEmbedCSS: "",
      style: {
        background: COLORS.white,
        fontFamily: "Arial, sans-serif",
      },
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save("orgchart.pdf");
  } catch (error) {
    console.error("Ошибка экспорта PDF:", error);
    alert(`Не удалось экспортировать PDF. ${error.message}`);
  } finally {
    exportRoot.remove();

    if (exportButton) {
      exportButton.disabled = false;
      exportButton.textContent = originalButtonText || "📄 Экспорт в PDF";
    }
  }
}

function createExportContainer() {
  const exportRoot = document.createElement("div");
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "0";
  exportRoot.style.top = "0";
  exportRoot.style.zIndex = "99999";
  exportRoot.style.background = COLORS.white;
  exportRoot.style.overflow = "auto";
  exportRoot.style.pointerEvents = "none";

  const exportArea = document.createElement("div");
  exportArea.style.display = "inline-block";
  exportArea.style.background = COLORS.white;
  exportArea.style.padding = "0";
  exportArea.style.fontFamily = "Arial, sans-serif";

  exportRoot.appendChild(exportArea);
  document.body.appendChild(exportRoot);

  return {
    exportRoot,
    exportArea,
  };
}

function buildExportTree(node, showVacancies) {
  const children = [];

  (node.children || []).forEach(child => {
    children.push(buildExportTree(child, showVacancies));
  });

  (node.users || [])
    .filter(user => showVacancies || !user.isVacancy)
    .forEach(user => {
      children.push({
        type: user.isVacancy ? "vacancy" : "employee",
        title: user.isVacancy ? "Вакансия" : user.full_name || user.name || "Сотрудник",
        subtitle: user.position || "",
        count: null,
        children: [],
      });
    });

  return {
    type: "department",
    title: node.department_name || node.name || "Без названия",
    manager: node.department_manager || "Нет руководителя",
    position: node.department_manager_position || "",
    count: showVacancies
      ? node.totalWithVacancies || node.staffCount || 0
      : node.staffCount || 0,
    children,
  };
}

function getNodeHeight(node) {
  return node.type === "department" ? CARD_HEIGHT_DEPARTMENT : CARD_HEIGHT_PERSON;
}

function calculateLayout(root) {
  calculateSubtreeWidth(root);
  assignPositions(root, PADDING, PADDING);

  const bounds = getBounds(root);

  return {
    root,
    width: Math.ceil(bounds.right + PADDING),
    height: Math.ceil(bounds.bottom + PADDING),
  };
}

function calculateSubtreeWidth(node) {
  const ownWidth = CARD_WIDTH;

  if (!node.children.length) {
    node.subtreeWidth = ownWidth;
    return node.subtreeWidth;
  }

  const childrenWidth =
    node.children.reduce((sum, child) => sum + calculateSubtreeWidth(child), 0) +
    H_GAP * Math.max(0, node.children.length - 1);

  node.subtreeWidth = Math.max(ownWidth, childrenWidth);
  return node.subtreeWidth;
}

function assignPositions(node, left, top) {
  node.x = left + node.subtreeWidth / 2 - CARD_WIDTH / 2;
  node.y = top;

  if (!node.children.length) return;

  const childrenTotalWidth =
    node.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
    H_GAP * Math.max(0, node.children.length - 1);

  let childLeft = left + node.subtreeWidth / 2 - childrenTotalWidth / 2;
  const childTop = top + getNodeHeight(node) + V_GAP;

  node.children.forEach(child => {
    assignPositions(child, childLeft, childTop);
    childLeft += child.subtreeWidth + H_GAP;
  });
}

function getBounds(root) {
  const bounds = {
    right: 0,
    bottom: 0,
  };

  walkTree(root, node => {
    bounds.right = Math.max(bounds.right, node.x + CARD_WIDTH);
    bounds.bottom = Math.max(bounds.bottom, node.y + getNodeHeight(node));
  });

  return bounds;
}

function renderSvg(layout) {
  const svg = createSvgElement("svg", {
    width: layout.width,
    height: layout.height,
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    xmlns: SVG_NS,
  });

  svg.style.background = COLORS.white;

  walkTree(layout.root, node => {
    node.children.forEach(child => {
      drawConnector(svg, node, child);
    });
  });

  walkTree(layout.root, node => {
    drawCard(svg, node);
  });

  return svg;
}

function drawConnector(svg, parent, child) {
  const parentHeight = getNodeHeight(parent);

  const fromX = parent.x + CARD_WIDTH / 2;
  const fromY = parent.y + parentHeight;

  const toX = child.x + CARD_WIDTH / 2;
  const toY = child.y;

  const middleY = fromY + (toY - fromY) / 2;

  const path = createSvgElement("path", {
    d: `M ${fromX} ${fromY} V ${middleY} H ${toX} V ${toY}`,
    fill: "none",
    stroke: COLORS.connector,
    "stroke-width": 2,
  });

  svg.appendChild(path);
}

function drawCard(svg, node) {
  if (node.type === "department") {
    drawDepartmentCard(svg, node);
    return;
  }

  drawPersonCard(svg, node);
}

function drawDepartmentCard(svg, node) {
  const group = createSvgElement("g", {
    transform: `translate(${node.x}, ${node.y})`,
  });

  const rect = createSvgElement("rect", {
    x: 0,
    y: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT_DEPARTMENT,
    rx: 8,
    ry: 8,
    fill: COLORS.white,
    stroke: COLORS.departmentStroke,
    "stroke-width": 2,
  });

  group.appendChild(rect);

  appendWrappedText(group, node.title, {
    x: 16,
    y: 26,
    maxChars: 34,
    maxLines: 2,
    lineHeight: 16,
    size: 13,
    weight: 700,
    fill: COLORS.text,
  });

  appendWrappedText(group, node.manager, {
    x: 16,
    y: 66,
    maxChars: 38,
    maxLines: 1,
    lineHeight: 15,
    size: 12,
    fill: COLORS.muted,
    prefix: "Руководитель: ",
  });

  if (node.position) {
    appendWrappedText(group, node.position, {
      x: 16,
      y: 86,
      maxChars: 42,
      maxLines: 1,
      lineHeight: 15,
      size: 11,
      fill: COLORS.muted,
    });
  }

  appendText(group, String(node.count), {
    x: CARD_WIDTH - 16,
    y: CARD_HEIGHT_DEPARTMENT - 16,
    size: 14,
    weight: 700,
    fill: COLORS.count,
    anchor: "end",
  });

  svg.appendChild(group);
}

function drawPersonCard(svg, node) {
  const group = createSvgElement("g", {
    transform: `translate(${node.x}, ${node.y})`,
  });

  const isVacancy = node.type === "vacancy";

  const rect = createSvgElement("rect", {
    x: 0,
    y: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT_PERSON,
    rx: 8,
    ry: 8,
    fill: isVacancy ? COLORS.vacancyBg : COLORS.white,
    stroke: isVacancy ? COLORS.vacancyStroke : COLORS.employeeStroke,
    "stroke-width": 2,
  });

  group.appendChild(rect);

  appendWrappedText(group, node.title, {
    x: 16,
    y: 28,
    maxChars: 36,
    maxLines: 2,
    lineHeight: 16,
    size: 13,
    weight: 700,
    fill: COLORS.text,
  });

  if (node.subtitle) {
    appendWrappedText(group, node.subtitle, {
      x: 16,
      y: 60,
      maxChars: 42,
      maxLines: 1,
      lineHeight: 15,
      size: 11,
      fill: COLORS.muted,
    });
  }

  svg.appendChild(group);
}

function appendText(
  group,
  text,
  {
    x,
    y,
    size = 12,
    weight = 400,
    fill = COLORS.text,
    anchor = "start",
  },
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

function appendWrappedText(
  group,
  text,
  {
    x,
    y,
    maxChars,
    maxLines,
    lineHeight,
    size = 12,
    weight = 400,
    fill = COLORS.text,
    prefix = "",
  },
) {
  const lines = wrapText(`${prefix}${text || ""}`, maxChars, maxLines);

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

function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach(word => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxChars) {
      currentLine = candidate;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  const result = lines.slice(0, maxLines);

  if (lines.length > maxLines && result.length) {
    result[result.length - 1] = `${result[result.length - 1].slice(0, maxChars - 1)}…`;
  }

  return result;
}

function walkTree(node, callback) {
  callback(node);
  node.children.forEach(child => walkTree(child, callback));
}

function createSvgElement(tagName, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tagName);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

function waitForPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}