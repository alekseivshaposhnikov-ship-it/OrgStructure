import { escapeHtml, normalizeProjects } from "../core/utils/string.js";
import { getScenarioLabel } from "./tokens.js";
import { normalizeAssistantLabel, formatLayoutDebugText } from "./unified-layout.js";

/**
 * Единый флаг диагностики уровней (CR-010 §3, CR-023-01 §3).
 * Управляется переключателем «Показывать уровни»: приложение синхронизирует
 * его со state.showLevels перед рендером. В обычном пользовательском режиме
 * технические подписи скрыты (enabled = false).
 */
export const layoutDebugConfig = { enabled: false };

/**
 * Возвращает строку диагностики уровней (без HTML) для card renderers.
 * CR-023-01 §2: формат включает sub_level, layout, row, а для подразделений —
 * ещё и фактическую глубину (level). Реальные значения берутся существующими
 * механизмами layout; отсутствующее значение обозначается «—».
 * compact — короткий формат для Compact A4 ("s:4 l:4 r:1").
 */
export function getLayoutDebugText(nd, options = {}) {
  if (!layoutDebugConfig.enabled) return "";
  return formatLayoutDebugText(nd, options);
}

/**
 * HTML-блок диагностики для экранных карточек (CR-010 §5, §8).
 * Нижний левый strip; pointer-events: none в CSS.
 */
export function renderLayoutDebug(nd) {
  const text = getLayoutDebugText(nd);
  if (!text) return "";

  return `
    <div class="chart-card__layout-debug">${escapeHtml(text)}</div>
  `;
}

export function renderNodeContent(nd, options = {}) {
  const {
    cardDesign = "classic",
    showVacancies = true,
    viewMode = "to-be",
    hideNames = false,
    isPdfExport = false,
  } = options;

  if (nd.isHoldingExecutive) {
    return renderHoldingExecutive(nd, viewMode);
  }

  // CR-023 §5: групповая карточка — несколько сотрудников одной должности
  // внутри подразделения (остаётся продолжением существующего дизайна).
  if (nd.isGroup) {
    return isPdfExport
      ? renderEmployeeGroupPdf(nd, hideNames)
      : renderEmployeeGroup(nd, viewMode);
  }

  if (nd.isDepartment) {
    if (isPdfExport) {
      return renderDepartmentPdf(nd, showVacancies, hideNames);
    }

    if (cardDesign === "variant2") {
      return renderDepartmentVariant2(nd, showVacancies, viewMode);
    }

    if (cardDesign === "variant3") {
      return renderDepartmentVariant3(nd, showVacancies, viewMode);
    }

    return renderDepartmentClassic(nd, showVacancies, viewMode);
  }

  if (nd.isAssistant) {
    return isPdfExport
      ? renderAssistantCardPdf(nd, hideNames)
      : renderAssistantCard(nd, viewMode);
  }

  if (nd.isVacancy) {
    return isPdfExport ? renderVacancyPdf(nd) : renderVacancy(nd, viewMode);
  }

  return isPdfExport ? renderEmployeePdf(nd, hideNames) : renderEmployee(nd, viewMode);
}

function renderDepartmentPdf(nd, showVacancies, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-department ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      <div class="chart-card-pdf__eyebrow">Подразделение</div>
      <div class="chart-card-pdf__title">${escapeHtml(nd.name)}</div>

      ${
        !hideNames && nd.headName
          ? `<div class="chart-card-pdf__person">${escapeHtml(nd.headDisplayName || nd.headName)}</div>`
          : ""
      }

      ${
        nd.headPosition
          ? `<div class="chart-card-pdf__position">${escapeHtml(nd.headPosition)}</div>`
          : ""
      }

      ${renderAssistantPdf(nd.assistant, hideNames)}

      <div class="chart-card-pdf__footer">
        <span class="chart-card-pdf__count">${getDisplayCount(nd, showVacancies)}</span>
        <span>${showVacancies ? "штат + вакансии" : "штат"}</span>
      </div>
    </div>
  `;
}

function renderEmployeePdf(nd, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      <div class="chart-card-pdf__eyebrow">Сотрудник</div>
      ${!hideNames ? `<div class="chart-card-pdf__person">${escapeHtml(nd.displayName || nd.name)}</div>` : ""}
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderAssistantCardPdf(nd, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      <div class="chart-card-pdf__eyebrow">Административный ассистент</div>
      ${!hideNames ? `<div class="chart-card-pdf__person">${escapeHtml(nd.displayName || nd.name)}</div>` : ""}
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderVacancyPdf(nd) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-vacancy ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="vacancy">
      <div class="chart-card-pdf__eyebrow">Вакансия</div>
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderAssistantPdf(assistant, hideNames) {
  if (!assistant) return "";

  return `
    <div class="chart-card-pdf__assistant">
      <div class="chart-card-pdf__eyebrow">Административный ассистент</div>
      ${
        !hideNames
          ? `<div class="chart-card-pdf__assistant-name">${escapeHtml(assistant.displayName || assistant.full_name || assistant.name || "Сотрудник")}</div>`
          : ""
      }
      ${
        assistant.position
          ? `<div class="chart-card-pdf__assistant-position">${escapeHtml(assistant.position)}</div>`
          : ""
      }
      ${renderProjectPdf(assistant)}
    </div>
  `;
}

function renderProjectPdf(nd) {
  const project = normalizeProjects(nd.project);
  if (!project) return "";

  return `
    <div class="chart-card-pdf__project">
      Проект: ${escapeHtml(project)}
    </div>
  `;
}

function renderAssistantCard(nd, _viewMode) {
  // CR-013_assistant §6, §13: sidecar-карточка ассистента — метка роли + имя.
  // CR-020 §6: несколько административных ассистентов одного руководителя
  // выводятся одной визуальной группой (одна карточка с несколькими ФИО).
  if (Array.isArray(nd.members) && nd.members.length > 1) {
    return renderAssistantGroupCard(nd);
  }

  const label = normalizeAssistantLabel(nd.position);
  return `
    <div class="chart-card chart-card--assistant ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="assistant">
      ${renderScenarioBadge(nd)}
      <div class="chart-card__assistant-label">${escapeHtml(label)}</div>
      <div class="chart-card__assistant-name">${escapeHtml(nd.displayName || nd.name)}</div>
    </div>
  `;
}

function renderAssistantGroupCard(nd) {
  const label = normalizeAssistantLabel(nd.position) || "Административный ассистент";
  const members = nd.members
    .map(
      (member) => `
      <div class="chart-card__assistant-member" data-employee-id="${escapeHtml(member.id || "")}">
        <div class="chart-card__assistant-name">${escapeHtml(member.displayName || member.full_name || member.name || "Сотрудник")}</div>
        ${member.position ? `<div class="chart-card__assistant-position">${escapeHtml(member.position)}</div>` : ""}
      </div>`,
    )
    .join("");

  return `
    <div class="chart-card chart-card--assistant chart-card--assistant-group ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="assistant">
      ${renderScenarioBadge(nd)}
      <div class="chart-card__assistant-label">${escapeHtml(label)}</div>
      ${members}
    </div>
  `;
}

function renderDepartmentClassic(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      <div class="chart-card__manager">${escapeHtml(nd.headDisplayName || nd.headName || "Вакансия")}</div>
      ${nd.headPosition ? `<div class="chart-card__manager-position">${escapeHtml(nd.headPosition)}</div>` : ""}
      ${renderLayoutDebug(nd)}
      ${renderAssistant(nd.assistant)}
      <div class="chart-card__count ${showVacancies ? "count-with-vacancies" : ""}">
        ${getDisplayCount(nd, showVacancies)}
      </div>
    </div>
  `;
}

function renderDepartmentVariant2(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department-v2 ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card-v2__header"><div class="chart-card-v2__title">${escapeHtml(nd.name)}</div></div>
      <div class="chart-card-v2__body">
        <div class="chart-card-v2__manager">${escapeHtml(nd.headDisplayName || nd.headName || "Вакансия")}</div>
        ${nd.headPosition ? `<div class="chart-card-v2__position">${escapeHtml(nd.headPosition)}</div>` : ""}
        ${renderLayoutDebug(nd)}
        ${renderAssistant(nd.assistant)}
      </div>
      <div class="chart-card-v2__footer">${getDisplayCount(nd, showVacancies)} сотрудников</div>
    </div>
  `;
}

function renderDepartmentVariant3(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department-v3 ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card-v3__avatar">${escapeHtml(getInitials(nd.headDisplayName || nd.headName))}</div>
      <div class="chart-card-v3__content">
        <div class="chart-card-v3__title">${escapeHtml(nd.name)}</div>
        <div class="chart-card-v3__manager">${escapeHtml(nd.headDisplayName || nd.headName || "Вакансия")}</div>
        ${nd.headPosition ? `<div class="chart-card-v3__position">${escapeHtml(nd.headPosition)}</div>` : ""}
        ${renderLayoutDebug(nd)}
        ${renderAssistant(nd.assistant)}
        <div class="chart-card-v3__count">${getDisplayCount(nd, showVacancies)} сотрудников</div>
      </div>
    </div>
  `;
}

function renderEmployee(nd, viewMode) {
  return `
    <div class="chart-card chart-card--employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__title">${escapeHtml(nd.displayName || nd.name)}</div>
      ${nd.position ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderLayoutDebug(nd)}
      ${renderProject(nd)}
    </div>
  `;
}

/**
 * Групповая карточка (CR-023 §5): должность показана один раз со счётчиком,
 * ФИО сотрудников перечислены строками. Каждый сотрудник остаётся отдельным
 * интерактивным элементом (данные для клика/меню — собственный id записи).
 */
function renderEmployeeGroup(nd, viewMode) {
  const members = Array.isArray(nd.members) ? nd.members : [];

  const memberHtml = members
    .map(
      (member) => `
      <div class="chart-card__group-member"
           data-employee-id="${escapeHtml(member.id || "")}"
           data-node-id="${escapeHtml(member.id || "")}"
           data-node-type="employee">
        ${renderScenarioBadge(member)}
        <span class="chart-card__group-member-name">${escapeHtml(
          member.displayName || member.name || "Сотрудник",
        )}</span>
        ${renderMenuButton(viewMode)}
      </div>`,
    )
    .join("");

  return `
    <div class="chart-card chart-card--employee chart-card--group ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee-group">
      <div class="chart-card__group-header">
        <span class="chart-card__group-position">${escapeHtml(nd.position || "")}</span>
        <span class="chart-card__group-count">${members.length}</span>
      </div>
      <div class="chart-card__group-members">${memberHtml}</div>
      ${renderLayoutDebug(nd)}
    </div>
  `;
}

function renderEmployeeGroupPdf(nd, hideNames) {
  const members = Array.isArray(nd.members) ? nd.members : [];

  const names = hideNames
    ? ""
    : members
        .map(
          (member) =>
            `<div class="chart-card-pdf__group-member">${escapeHtml(
              member.displayName || member.name || "Сотрудник",
            )}</div>`,
        )
        .join("");

  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-employee chart-card--pdf-group ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee-group">
      <div class="chart-card-pdf__eyebrow">Группа · ${members.length}</div>
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${names}
    </div>
  `;
}

/**
 * Карточка верхнего руководителя Холдинга (CR-013 §27): ФИО + роль.
 * Использует профильный дизайн сотрудника (data-node-type="executive");
 * искусственная численность не отображается. Клик открывает детальную
 * карточку человека (data-employee-id).
 */
function renderHoldingExecutive(nd, viewMode) {
  return `
    <div class="chart-card chart-card--employee chart-card--executive ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="executive">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__title">${escapeHtml(nd.displayName || nd.name)}</div>
      ${nd.headPosition ? `<div class="chart-card__position">${escapeHtml(nd.headPosition)}</div>` : ""}
      ${renderLayoutDebug(nd)}
      ${renderProject(nd)}
    </div>
  `;
}

function renderVacancy(nd, viewMode) {
  return `
    <div class="chart-card chart-card--vacancy ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="vacancy">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__title">Вакансия</div>
      ${nd.position ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProject(nd)}
    </div>
  `;
}

function renderAssistant(assistant) {
  if (!assistant) return "";

  return `
    <div class="chart-card__assistant" data-assistant-id="${escapeHtml(assistant.id || "")}">
      <div class="chart-card__assistant-label">Административный ассистент</div>
      <div class="chart-card__assistant-name">${escapeHtml(assistant.displayName || assistant.full_name || assistant.name || "Сотрудник")}</div>
      ${assistant.position ? `<div class="chart-card__assistant-position">${escapeHtml(assistant.position)}</div>` : ""}
      ${renderProject(assistant)}
    </div>
  `;
}

function renderProject(nd) {
  const project = normalizeProjects(nd.project);
  if (!project) return "";

  return `
    <div class="chart-card__project">
      <span>Проект:</span> ${escapeHtml(project)}
    </div>
  `;
}

function renderMenuButton(viewMode) {
  if (viewMode === "as-is") return "";

  return `
    <button class="chart-card__menu" type="button" data-scenario-menu>
      ⋮
    </button>
  `;
}

function renderScenarioBadge(nd) {
  const label = getScenarioLabel(nd.scenarioState);
  if (!label) return "";

  return `
    <div class="scenario-badge scenario-badge--${escapeHtml(nd.scenarioState)}">
      ${escapeHtml(label)}
    </div>
  `;
}

function getScenarioClass(nd) {
  return nd.scenarioState ? `chart-card--scenario-${nd.scenarioState}` : "";
}

function getDisplayCount(node, showVacancies) {
  return showVacancies
    ? node.totalWithVacancies || node.staffCount || 0
    : node.staffCount || 0;
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}
