/**
 * pdf-utils.js
 * Общие утилиты экспорта SVG в PDF (Фаза 3 рефакторинга).
 * Заменяет дублирующиеся saveSvgAsPdf / saveCompactSvgAsA4Pdf
 * и обёртки экспорта с блокировкой кнопки.
 */

import { jsPDF } from "jspdf";

/**
 * Единый конвейер «SVG → canvas → PNG → jsPDF» (A4 и обычный экспорт).
 *
 * @param {object} opts
 * @param {SVGElement} opts.svg - SVG-элемент с корректным viewBox
 * @param {string} opts.fileName - имя файла без расширения
 * @param {number} [opts.scale=2] - коэффициент DPI-рендера canvas
 * @param {"auto"|"landscape"|"portrait"} [opts.orientation="auto"] - ориентация страницы
 * @param {string} [opts.fileNameSuffix=".pdf"] - суффикс имени файла
 */
export async function renderSvgToPdf({
  svg,
  fileName,
  scale = 2,
  orientation = "auto",
  fileNameSuffix = ".pdf",
}) {
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
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imgData = canvas.toDataURL("image/png");

    const resolvedOrientation =
      orientation === "auto"
        ? canvas.width >= canvas.height
          ? "landscape"
          : "portrait"
        : orientation;

    const pdf = new jsPDF({
      orientation: resolvedOrientation,
      unit: "px",
      format: [canvas.width, canvas.height],
      compress: true,
    });

    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save(`${fileName}${fileNameSuffix}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Общая обёртка экспорта: блокирует кнопку, выполняет задачу,
 * при ошибке показывает alert, в finally возвращает кнопку в исходное состояние.
 *
 * @param {object} opts
 * @param {string} [opts.buttonId="exportPdf"]
 * @param {string} [opts.busyLabel="Экспорт..."]
 * @param {Function} opts.task - асинхронная функция экспорта
 */
export async function withExportBusyState({
  buttonId = "exportPdf",
  busyLabel = "Экспорт...",
  task,
}) {
  const exportButton = document.getElementById(buttonId);
  const originalButtonText = exportButton?.textContent;

  if (exportButton) {
    exportButton.disabled = true;
    exportButton.textContent = busyLabel;
  }

  try {
    await task();
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
