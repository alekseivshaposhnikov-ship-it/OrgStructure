import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

const SVG_NS = "http://www.w3.org/2000/svg";

const EXPORT_FRAME_CLASS = "pdf-export-frame-layer";

const COLORS = {
  department: "#4d8ce9",
  employee: "#d0d5dd",
  vacancy: "#b0c4de",
};

export async function exportOrgChartToPdf({ chart }) {
  if (!chart) {
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
    const state = chart.getChartState();

    removeExportFrames();

    const frameGroup = drawSvgFrames(state);

    await waitForPaint();
    await wait(100);

    const container = getContainerElement(state);

    const canvas = await toCanvas(container, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      fontEmbedCSS: "",
      style: {
        background: "#ffffff",
        fontFamily: "Arial, sans-serif",
      },
    });

    const imgData = canvas.toDataURL("image/png");

    const { width, height } = canvas;

    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, width, height);
    pdf.save("orgchart.pdf");

    frameGroup?.remove();
  } catch (error) {
    console.error("Ошибка экспорта PDF:", error);
    alert(`Не удалось экспортировать PDF. ${error.message}`);
  } finally {
    removeExportFrames();

    if (exportButton) {
      exportButton.disabled = false;
      exportButton.textContent = originalButtonText || "📄 Экспорт в PDF";
    }
  }
}

function drawSvgFrames(state) {
  const nodesWrapper = getD3ElementNode(state.nodesWrapper);

  if (!nodesWrapper) {
    throw new Error("Не найден слой узлов диаграммы");
  }

  const frameGroup = document.createElementNS(SVG_NS, "g");
  frameGroup.setAttribute("class", EXPORT_FRAME_CLASS);

  const visibleNodes = state.allNodes.filter(
    node => Number.isFinite(node.x) && Number.isFinite(node.y),
  );

  visibleNodes.forEach(node => {
    const width = state.nodeWidth(node);
    const height = state.nodeHeight(node);

    const rect = document.createElementNS(SVG_NS, "rect");

    rect.setAttribute("x", String(node.x - width / 2));
    rect.setAttribute("y", String(node.y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("rx", "8");
    rect.setAttribute("ry", "8");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", getNodeStroke(node));
    rect.setAttribute("stroke-width", "2");
    rect.setAttribute("pointer-events", "none");

    frameGroup.appendChild(rect);
  });

  nodesWrapper.prepend(frameGroup);

  return frameGroup;
}

function getNodeStroke(node) {
  if (node.data?.isVacancy) {
    return COLORS.vacancy;
  }

  if (node.data?.isDepartment) {
    return COLORS.department;
  }

  return COLORS.employee;
}

function getContainerElement(state) {
  const container = state.container;

  if (typeof container === "string") {
    const element = document.querySelector(container);

    if (!element) {
      throw new Error("Контейнер диаграммы не найден");
    }

    return element;
  }

  return getD3ElementNode(container) || container;
}

function getD3ElementNode(value) {
  if (!value) return null;

  if (typeof value.node === "function") {
    return value.node();
  }

  return value;
}

function removeExportFrames() {
  document
    .querySelectorAll(`.${EXPORT_FRAME_CLASS}`)
    .forEach(element => element.remove());
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