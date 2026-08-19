/**
 * string.js
 * Общие строковые утилиты (Фаза 1 рефакторинга).
 * Ранее дублировались в main.js, changelog.js, employee-modal.js,
 * chart-cards.js, compact-a4-screen-renderer.js, pdf-d3-export.js.
 */

/** Экранирует HTML-спецсимволы во всех встраиваемых в разметку значениях. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Нормализует список проектов: "А;Б" → "А; Б". */
export function normalizeProjects(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("; ");
}

/**
 * Форматирует дату в "ДД.ММ.ГГГГ".
 * Принимает строку "YYYY-MM-DD" или объект Date.
 */
export function formatDate(value) {
  if (!value) return "";

  const date =
    typeof value === "string" ? new Date(`${value}T00:00:00`) : new Date(value);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Превращает произвольную строку в безопасное имя файла. */
export function sanitizeFileName(value) {
  return String(value || "orgchart")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 120);
}
