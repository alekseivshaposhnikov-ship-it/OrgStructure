import { jsPDF } from "jspdf";

const CARD_WIDTH = 360;
const CARD_HEIGHT = 150;
const H_GAP = 90;
const V_GAP = 130;
const PADDING = 70;
const EXPORT_SCALE = 2;

const COLORS = {
  blue: "#155eef",
  blueLight: "#eef4ff",
  text: "#101828",
  muted: "#667085",
  border: "#d0d5dd",
  line: "#98a2b3",
  green: "#12b76a",
  purple: "#9e77ed",
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
    const exportTree = buildExportTree(rootNodes, {
      hideNames,
      showVacancies,
    });

    if (!exportTree) {
      throw new Error("Нет данных для экспорта");
    }

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
  });
}

function convertDepartmentToExportNode(node, { hideNames, showVacancies, isRoot = false }) {
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
    children: [],
  };

  const assistant = isRoot ? findAdministrativeAssistantInSubtree(node) : null;
  const assistantId = assistant?.id || null;

  if (assistant) {
    exportNode.children.push(convertUserToExportNode(assistant, {
      hideNames,
      forceType: "assistant",
    }));
  }

  (node.children || []).forEach(child => {
    exportNode.children.push(
      convertDepartmentToExportNode(child, {
        hideNames,
        showVacancies,
        isRoot: false,
      }),
    );
  });

  (node.users || [])
    .filter(user => showVacancies || !user.isVacancy)
    .filter(user => !assistantId || user.id !== assistantId)
    .filter(user => !isAdministrativeAssistant(user))
    .forEach(user => {
      exportNode.children.push(
        convertUserToExportNode(user, {
          hideNames,
        }),
      );
    });

  return exportNode;
}

function convertUserToExportNode(user, { hideNames, forceType = null }) {
  const isVacancy = Boolean(user.isVacancy);
  const type = forceType || (isVacancy ? "vacancy" : "employee");

  return {
    id: user.id || createFallbackId(),
    type,
    name: isVacancy ? "Вакансия" : hideNames ? "" : user.full_name || user.name || "Сотрудник",
    manager: "",
    position: user.position || "",
    count: null,
    project: normalizeProjects(user.project),
    scenarioState: user.scenarioState || "",
    children: [],
  };
}

function renderExportSvg(root, options) {
  const layoutRoot = buildLayout(root);
  assignPositions(layoutRoot, PADDING, PADDING + 90);

  const bounds = getBounds(layoutRoot);

  const width = bounds.maxX + CARD_WIDTH + PADDING;
  const height = bounds.maxY + CARD_HEIGHT + PADDING;

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

function buildLayout(node, depth = 0) {
  const children = (node.children || []).map(child => buildLayout(child, depth + 1));

  const childrenWidth = children.reduce((sum, child, index) => {
    return sum + child.subtreeWidth + (index > 0 ? H_GAP : 0);
  }, 0);

  return {
    ...node,
    depth,
    children,
    subtreeWidth: Math.max(CARD_WIDTH, childrenWidth),
    x: 0,
    y: 0,
  };
}

function assignPositions(node, left, top) {
  node.x = left + node.subtreeWidth / 2 - CARD_WIDTH / 2;
  node.y = top + node.depth * (CARD_HEIGHT + V_GAP);

  let childLeft = left + node.subtreeWidth / 2 - getChildrenWidth(node.children) / 2;

  node.children.forEach(child => {
    assignPositions(child, childLeft, top);
    childLeft += child.subtreeWidth + H_GAP;
  });
}

function getChildrenWidth(children) {
  return children.reduce((sum, child, index) => {
    return sum + child.subtreeWidth + (index > 0 ? H_GAP : 0);
  }, 0);
}

function getBounds(root) {
  let maxX = 0;
  let maxY = 0;

  walk(root, node => {
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
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
  walk(root, node => {
    node.children.forEach(child => {
      drawConnector(svg, {
        fromX: node.x + CARD_WIDTH / 2,
        fromY: node.y + CARD_HEIGHT,
        toX: child.x + CARD_WIDTH / 2,
        toY: child.y,
      });
    });
  });
}

function drawConnector(svg, { fromX, fromY, toX, toY }) {
  const middleY = fromY + (toY - fromY) / 2;

  svg.appendChild(
    createSvgElement("path", {
      d: `M ${fromX} ${fromY} V ${middleY} H ${toX} V ${toY}`,
      fill: "none",
      stroke: COLORS.line,
      "stroke-width": 2,
    }),
  );
}

function drawNodes(svg, root) {
  walk(root, node => {
    drawCard(svg, node);
  });
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
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
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

  appendWrappedText(group, getNodeTitle(node), {
    x: 18,
    y: node.scenarioState ? 46 : 28,
    maxWidth: 250,
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
      maxWidth: 260,
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
      maxWidth: 260,
      lineHeight: 15,
      maxLines: 2,
      size: 12,
      fill: COLORS.muted,
    });
  }

  if (node.project) {
    drawProject(group, node.project);
  }

  if (node.count !== null && node.count !== undefined) {
    drawCount(group, node.count);
  }

  svg.appendChild(group);
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
      stroke: "#7a5af8",
      strokeWidth: 2,
    };
  }

  return {
    fill: "#ffffff",
    stroke: COLORS.border,
    strokeWidth: 1.5,
  };
}

function getNodeTitle(node) {
  if (node.type === "assistant") return `Административный ассистент${node.name ? ` — ${node.name}` : ""}`;
  return node.name || "Без названия";
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

function drawProject(group, project) {
  group.appendChild(
    createSvgElement("rect", {
      x: 18,
      y: CARD_HEIGHT - 38,
      width: 210,
      height: 22,
      rx: 8,
      ry: 8,
      fill: "#f2f4f7",
    }),
  );

  appendWrappedText(group, `Проект: ${project}`, {
    x: 28,
    y: CARD_HEIGHT - 23,
    maxWidth: 190,
    lineHeight: 12,
    maxLines: 1,
    size: 10,
    fill: "#475467",
  });
}

function drawCount(group, count) {
  group.appendChild(
    createSvgElement("rect", {
      x: CARD_WIDTH - 62,
      y: CARD_HEIGHT - 42,
      width: 44,
      height: 28,
      rx: 14,
      ry: 14,
      fill: COLORS.blueLight,
    }),
  );

  appendText(group, String(count), {
    x: CARD_WIDTH - 40,
    y: CARD_HEIGHT - 23,
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
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChars) {
      current = next;
      return;
    }

    if (current) lines.push(current);
    current = word;
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
  callback(node);
  node.children.forEach(child => walk(child, callback));
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
  if (state === "added") {
    return { bg: "#dcfae6", text: "#067647" };
  }

  if (state === "changed") {
    return { bg: "#dbeafe", text: "#1d4ed8" };
  }

  if (state === "moved") {
    return { bg: "#f4e8ff", text: "#7e22ce" };
  }

  if (state === "removed") {
    return { bg: "#fee4e2", text: "#b42318" };
  }

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