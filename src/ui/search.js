/**
 * search.js
 * CR-024 §4: интерфейс глобального поиска сотрудников — поле ввода, список
 * результатов, навигация клавиатурой, сообщение о поиске вне текущего фильтра.
 *
 * Модуль не изменяет данные оргструктуры: поиск идёт по локальному индексу
 * (см. src/domain/search-index.js), а навигация делегируется вызывающему коду
 * через колбэки (onSelect / onNavigate).
 */

import {
  searchEmployees,
  formatSearchPath,
  normalizeSearchText,
  MIN_SEARCH_LENGTH,
} from "../domain/search-index.js";
import { collectSubtreeDepartmentIds } from "../domain/expand-state.js";
import { escapeHtml } from "../core/utils/string.js";

const SEARCH_DEBOUNCE_MS = 120;

/**
 * CR-024 §4.4/§4.5: входит ли сотрудник в текущую область просмотра (фильтр).
 * @param {object} entry - запись поискового индекса
 * @param {object|null} selectedNode - выбранный корень (фильтр)
 * @returns {boolean}
 */
export function isWithinSelection(entry, selectedNode) {
  if (!entry || !selectedNode) return true;
  if (selectedNode.department_guid === "synthetic-root") return true;
  return collectSubtreeDepartmentIds(selectedNode).includes(entry.departmentId);
}

function findElement(id) {
  return document.getElementById(id);
}

/**
 * Инициализирует поле глобального поиска.
 *
 * @param {object} deps
 * @param {Function} deps.getIndex - () => Array<entry>
 * @param {Function} deps.getSelectedNode - () => object|null (текущий фильтр)
 * @param {Function} [deps.onSelect] - (entry) => void — выбор внутри фильтра
 * @param {Function} [deps.onNavigate] - (entry) => void — «Перейти к сотруднику»
 * @param {object} [deps.elements] - override DOM-элементов (для тестов)
 * @returns {{ destroy: Function, clear: Function, setReturn: Function }}
 */
export function initEmployeeSearch({
  getIndex,
  getSelectedNode,
  onSelect,
  onNavigate,
  elements,
} = {}) {
  const input = elements?.input || findElement("employeeSearch");
  const resultsEl = elements?.results || findElement("searchResults");
  const clearButton = elements?.clear || findElement("searchClear");
  const returnButton = elements?.returnButton || findElement("searchReturn");

  if (!input || !resultsEl) {
    return { destroy() {}, clear() {}, setReturn() {} };
  }

  let activeIndex = -1;
  let currentResults = [];
  let debounceTimer = null;
  let returnHandler = null;

  function closeResults() {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    activeIndex = -1;
    currentResults = [];
  }

  function openResults() {
    resultsEl.classList.remove("hidden");
  }

  function renderResults(entries) {
    currentResults = entries;
    activeIndex = -1;

    if (!entries.length) {
      resultsEl.innerHTML = `<div class="search-results__empty">Сотрудники не найдены</div>`;
      openResults();
      return;
    }

    resultsEl.innerHTML = entries
      .map(
        (entry, index) => `
        <button type="button" class="search-result" data-search-index="${index}">
          <span class="search-result__name">${escapeHtml(entry.fullName)}</span>
          ${
            entry.position
              ? `<span class="search-result__position">${escapeHtml(entry.position)}</span>`
              : ""
          }
          <span class="search-result__path">${escapeHtml(formatSearchPath(entry))}</span>
        </button>`,
      )
      .join("");

    resultsEl.querySelectorAll("[data-search-index]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        choose(currentResults[Number(button.dataset.searchIndex)]);
      });
    });

    openResults();
  }

  function renderOutsideFilter(entry) {
    resultsEl.innerHTML = `
      <div class="search-outside">
        <div class="search-outside__message">Сотрудник найден вне текущего фильтра</div>
        <div class="search-outside__name">${escapeHtml(entry.fullName)}</div>
        ${
          entry.position
            ? `<div class="search-outside__position">${escapeHtml(entry.position)}</div>`
            : ""
        }
        <div class="search-outside__location"><b>Расположение:</b> ${escapeHtml(
          formatSearchPath(entry),
        )}</div>
        <button type="button" class="search-outside__go" data-search-navigate>
          Перейти к сотруднику
        </button>
      </div>
    `;
    openResults();

    resultsEl
      .querySelector("[data-search-navigate]")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        closeResults();
        onNavigate?.(entry);
      });
  }

  function choose(entry) {
    if (!entry) return;
    closeResults();
    if (isWithinSelection(entry, getSelectedNode?.())) {
      onSelect?.(entry);
    } else {
      renderOutsideFilter(entry);
    }
  }

  function runSearch() {
    const query = input.value;
    if (normalizeSearchText(query).length < MIN_SEARCH_LENGTH) {
      closeResults();
      return;
    }
    renderResults(searchEmployees(getIndex?.() || [], query));
  }

  function scheduleSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  }

  function highlightActive() {
    const items = resultsEl.querySelectorAll(".search-result");
    items.forEach((item, index) => {
      item.classList.toggle("search-result--active", index === activeIndex);
    });
    items[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  function onInput() {
    scheduleSearch();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      closeResults();
      input.blur();
      return;
    }

    const items = resultsEl.querySelectorAll(".search-result");
    if (!items.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      highlightActive();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      highlightActive();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(currentResults[activeIndex >= 0 ? activeIndex : 0]);
    }
  }

  function onClear() {
    input.value = "";
    closeResults();
    input.focus();
  }

  function onDocumentClick(event) {
    if (resultsEl.classList.contains("hidden")) return;
    if (input.contains(event.target) || resultsEl.contains(event.target)) return;
    closeResults();
  }

  function setReturn(label, handler) {
    if (!returnButton) return;
    returnHandler = handler || null;
    if (label && handler) {
      returnButton.textContent = label;
      returnButton.classList.remove("hidden");
    } else {
      returnButton.classList.add("hidden");
    }
  }

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  clearButton?.addEventListener("click", onClear);
  returnButton?.addEventListener("click", () => returnHandler?.());
  document.addEventListener("click", onDocumentClick);

  return {
    clear: onClear,
    setReturn,
    runSearch,
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
      clearButton?.removeEventListener("click", onClear);
      document.removeEventListener("click", onDocumentClick);
    },
  };
}
