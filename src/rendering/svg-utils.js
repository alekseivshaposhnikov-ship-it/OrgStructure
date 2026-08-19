/**
 * svg-utils.js
 * Общие SVG-хелперы для PDF и экранных SVG-рендеров (Фаза 4 рефакторинга).
 */

import { COLORS } from "./tokens.js";

/** Создаёт SVG-элемент с атрибутами. */
export function createSvgElement(tagName, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

/**
 * Добавляет text-элемент в группу.
 * Сигнатура (объект параметров) — вариант PDF-рендера.
 */
export function appendText(
  group,
  text,
  { x, y, size = 12, weight = 400, fill = COLORS.text, anchor = "start" } = {},
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

/**
 * Добавляет text-элемент с позиционной сигнатурой Compact A4.
 * Тонкая обёртка над appendText.
 */
export function addText(
  group,
  text,
  x,
  y,
  fontSize,
  fw,
  fill,
  anchor = "start",
) {
  appendText(group, text, { x, y, size: fontSize, weight: fw, fill, anchor });
}

/** Обрезает текст с многоточием до maxChars символов. */
export function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}
