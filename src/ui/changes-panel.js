/**
 * changes-panel.js
 * Статистика, список изменений, сравнение AS IS / TO BE (Фаза 2 рефакторинга).
 * Вынесены из main.js.
 */

import { getScenarioStats } from "../domain/scenario-manager.js";
import { escapeHtml } from "../core/utils/string.js";

export function renderStats(scenario) {
  const statsEl = document.getElementById("scenarioStats");
  if (!statsEl) return;

  const stats = getScenarioStats(scenario);

  statsEl.innerHTML = `
    <div><b>Сотрудники:</b> ${stats.toBe.staff} (${formatDiff(stats.diff.staff)})</div>
    <div><b>Вакансии:</b> ${stats.toBe.vacancies} (${formatDiff(stats.diff.vacancies)})</div>
    <div><b>Всего:</b> ${stats.toBe.total} (${formatDiff(stats.diff.total)})</div>
    <div><b>Подразделения:</b> ${stats.toBe.departments} (${formatDiff(stats.diff.departments)})</div>
  `;
}

export function renderChangesList(scenario, onFocus) {
  const list = document.getElementById("changesList");
  const count = document.getElementById("changesCount");

  if (count) {
    count.textContent = String(scenario.operations.length);
  }

  renderChangesBadge(scenario.operations.length);

  if (!list) return;

  if (!scenario.operations.length) {
    list.innerHTML = `<div class="changes-list__empty">Изменений пока нет</div>`;
    return;
  }

  list.innerHTML = scenario.operations
    .slice()
    .reverse()
    .map(
      (operation) => `
      <button class="change-item"
              type="button"
              data-change-entity-id="${escapeHtml(operation.entityId || "")}">
        <span class="change-item__icon">${getOperationIcon(operation.type)}</span>
        <span>
          <b>${escapeHtml(getOperationTitle(operation.type))}</b>
          <small>${escapeHtml(operation.title || "")}</small>
        </span>
      </button>
    `,
    )
    .join("");

  list.querySelectorAll("[data-change-entity-id]").forEach((button) => {
    button.addEventListener("click", () => {
      onFocus?.(button.dataset.changeEntityId);
    });
  });
}

/**
 * CR-024 §3.2: компактная кнопка «Изменения · N» и видимость панели.
 * Если изменений нет — панель и кнопка не отображаются; если есть — кнопка
 * со счётчиком доступна, панель открывается по нажатию.
 * @param {number} count
 */
export function renderChangesBadge(count) {
  const total = Number(count) || 0;
  const toggle = document.getElementById("changesToggle");

  if (toggle) {
    toggle.textContent = `Изменения · ${total}`;
    toggle.classList.toggle("hidden", total === 0);
  }

  // Последнее изменение отменено → панель автоматически закрывается (CR-024 §3.3).
  if (total === 0) {
    document.getElementById("changesPanel")?.classList.add("hidden");
  }
}

/** CR-024 §3.2: открыть панель изменений справа (overlay). */
export function openChangesPanel() {
  document.getElementById("changesPanel")?.classList.remove("hidden");
}

/** CR-024 §3.2: закрыть панель; кнопка со счётчиком остаётся. */
export function closeChangesPanel() {
  document.getElementById("changesPanel")?.classList.add("hidden");
}

/** CR-024 §3.2: переключить панель изменений. */
export function toggleChangesPanel() {
  const panel = document.getElementById("changesPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
}

export function focusEntity(entityId, chart) {
  if (!entityId || !chart) return;

  try {
    chart.setCentered(entityId).render();
  } catch {
    console.warn("Не удалось сфокусироваться на объекте", entityId);
  }
}

export function openCompareModal(scenario) {
  const modal = document.getElementById("compareModal");
  const content = document.getElementById("compareContent");

  if (!modal || !content) return;

  const stats = getScenarioStats(scenario);

  content.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Показатель</th>
          <th>Было</th>
          <th>Стало</th>
          <th>Изменение</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Подразделения</td>
          <td>${stats.asIs.departments}</td>
          <td>${stats.toBe.departments}</td>
          <td>${formatDiff(stats.diff.departments)}</td>
        </tr>
        <tr>
          <td>Сотрудники</td>
          <td>${stats.asIs.staff}</td>
          <td>${stats.toBe.staff}</td>
          <td>${formatDiff(stats.diff.staff)}</td>
        </tr>
        <tr>
          <td>Вакансии</td>
          <td>${stats.asIs.vacancies}</td>
          <td>${stats.toBe.vacancies}</td>
          <td>${formatDiff(stats.diff.vacancies)}</td>
        </tr>
        <tr>
          <td>Всего</td>
          <td>${stats.asIs.total}</td>
          <td>${stats.toBe.total}</td>
          <td>${formatDiff(stats.diff.total)}</td>
        </tr>
      </tbody>
    </table>
  `;

  modal.classList.remove("hidden");
}

export function closeCompareModal() {
  document.getElementById("compareModal")?.classList.add("hidden");
}

export function getOperationIcon(type) {
  if (type.startsWith("add")) return "+";
  if (type.startsWith("remove")) return "−";
  if (type.startsWith("move")) return "⇄";
  if (type.startsWith("edit")) return "✎";

  return "•";
}

export function getOperationTitle(type) {
  const titles = {
    addDepartment: "Добавлено подразделение",
    editDepartment: "Изменено подразделение",
    removeDepartment: "Удалено подразделение",
    moveDepartment: "Перемещено подразделение",

    addEmployee: "Добавлен сотрудник",
    editEmployee: "Изменен сотрудник",
    removeEmployee: "Удален сотрудник",
    moveEmployee: "Перемещен сотрудник",

    addVacancy: "Добавлена вакансия",
    editVacancy: "Изменена вакансия",
    removeVacancy: "Удалена вакансия",
    moveVacancy: "Перемещена вакансия",
  };

  return titles[type] || "Изменение";
}

export function formatDiff(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}
