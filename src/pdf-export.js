import { toCanvas } from "html-to-image";

export async function exportOrgChartToPdf({
  selectedNode,
  chart,
  convertToFlatData,
  createOrgChartInstance,
}) {
  if (!selectedNode || !chart) {
    alert("Нет диаграммы для экспорта");
    return;
  }

  const exportButton = document.getElementById("exportPdf");
  const originalButtonText = exportButton?.textContent;

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.textContent = "Экспорт...";
  }

  const { exportRoot, exportSurface, containerSelector } = createExportContainer();

  try {
    const flatData = convertToFlatData([selectedNode]);

    createOrgChartInstance(containerSelector, flatData);

    await waitForPaint();
    await wait(300);

    const cardsCount = exportSurface.querySelectorAll(".chart-card").length;
    console.log("PDF export cards count:", cardsCount);

    if (!cardsCount) {
      throw new Error("Карточки диаграммы не найдены");
    }

    const bounds = getExportBounds(exportSurface);

    const sourceCanvas = await toCanvas(exportSurface, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      cacheBust: true,
      fontEmbedCSS: "",
      width: exportSurface.scrollWidth,
      height: exportSurface.scrollHeight,
      style: {
        background: "#ffffff",
        fontFamily: "Arial, sans-serif",
      },
    });

    const croppedCanvas = cropCanvas(sourceCanvas, bounds, 2);
    const imgData = croppedCanvas.toDataURL("image/png");

    const { jsPDF } = jspdf;

    const pdf = new jsPDF({
      orientation: croppedCanvas.width >= croppedCanvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [croppedCanvas.width, croppedCanvas.height],
    });

    pdf.addImage(imgData, "PNG", 0, 0, croppedCanvas.width, croppedCanvas.height);
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
  exportRoot.className = "org-chart-export-root";

  const exportSurface = document.createElement("div");
  exportSurface.className = "org-chart-export-surface";

  const exportChartEl = document.createElement("div");
  exportChartEl.id = `orgChartExport-${Date.now()}`;
  exportChartEl.className = "org-chart-export";

  exportSurface.appendChild(exportChartEl);
  exportRoot.appendChild(exportSurface);
  document.body.appendChild(exportRoot);

  return {
    exportRoot,
    exportSurface,
    exportChartEl,
    containerSelector: `#${exportChartEl.id}`,
  };
}

function getExportBounds(exportSurface) {
  const cards = Array.from(exportSurface.querySelectorAll(".chart-card"));

  if (!cards.length) {
    throw new Error("Карточки диаграммы не найдены");
  }

  const surfaceRect = exportSurface.getBoundingClientRect();

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  cards.forEach(card => {
    const rect = card.getBoundingClientRect();

    left = Math.min(left, rect.left - surfaceRect.left);
    top = Math.min(top, rect.top - surfaceRect.top);
    right = Math.max(right, rect.right - surfaceRect.left);
    bottom = Math.max(bottom, rect.bottom - surfaceRect.top);
  });

  const padding = 120;

  return {
    x: Math.max(0, Math.floor(left - padding)),
    y: Math.max(0, Math.floor(top - padding)),
    width: Math.ceil(right - left + padding * 2),
    height: Math.ceil(bottom - top + padding * 2),
  };
}

function cropCanvas(sourceCanvas, bounds, pixelRatio = 2) {
  const targetCanvas = document.createElement("canvas");

  targetCanvas.width = bounds.width * pixelRatio;
  targetCanvas.height = bounds.height * pixelRatio;

  const ctx = targetCanvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  ctx.drawImage(
    sourceCanvas,
    bounds.x * pixelRatio,
    bounds.y * pixelRatio,
    bounds.width * pixelRatio,
    bounds.height * pixelRatio,
    0,
    0,
    targetCanvas.width,
    targetCanvas.height,
  );

  return targetCanvas;
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