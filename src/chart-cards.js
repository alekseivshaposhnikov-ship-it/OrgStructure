// src/chart-cards.js

export function renderNodeContent(nd, options) {
  const { cardDesign, showVacancies } = options;

  if (nd.isDepartment) {
    if (cardDesign === "variant2") {
      return renderDepartmentVariant2(nd, showVacancies);
    }

    if (cardDesign === "variant3") {
      return renderDepartmentVariant3(nd, showVacancies);
    }

    return renderDepartmentClassic(nd, showVacancies);
  }

  if (nd.isVacancy) {
    return `
      <div class="chart-card chart-card--vacancy">
        <div class="chart-card__title">Вакансия</div>
        ${
          nd.position
            ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="chart-card chart-card--employee"
         data-employee-id="${escapeHtml(nd.id)}">
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      ${
        nd.position
          ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
          : ""
      }
    </div>
  `;
}

function renderDepartmentClassic(nd, showVacancies) {
  return `
    <div class="chart-card chart-card--department">
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>

      <div class="chart-card__manager">
        👤 ${escapeHtml(nd.headName || "Нет руководителя")}
      </div>

      ${
        nd.headPosition
          ? `<div class="chart-card__manager-position">
              ${escapeHtml(nd.headPosition)}
            </div>`
          : ""
      }

      <div class="chart-card__count ${showVacancies ? "count-with-vacancies" : ""}">
        ${getDisplayCount(nd, showVacancies)}
      </div>
    </div>
  `;
}

function renderDepartmentVariant2(nd, showVacancies) {
  return `
    <div class="chart-card chart-card--department-v2">
      <div class="chart-card-v2__header">
        <div class="chart-card-v2__title">
          ${escapeHtml(nd.name)}
        </div>
      </div>

      <div class="chart-card-v2__body">
        <div class="chart-card-v2__manager">
          ${escapeHtml(nd.headName || "Нет руководителя")}
        </div>

        ${
          nd.headPosition
            ? `<div class="chart-card-v2__position">
                ${escapeHtml(nd.headPosition)}
              </div>`
            : ""
        }
      </div>

      <div class="chart-card-v2__footer">
        ${getDisplayCount(nd, showVacancies)} сотрудников
      </div>
    </div>
  `;
}

function renderDepartmentVariant3(nd, showVacancies) {
  return `
    <div class="chart-card chart-card--department-v3">
      <div class="chart-card-v3__avatar">
        ${escapeHtml(getInitials(nd.headName))}
      </div>

      <div class="chart-card-v3__content">
        <div class="chart-card-v3__title">
          ${escapeHtml(nd.name)}
        </div>

        <div class="chart-card-v3__manager">
          ${escapeHtml(nd.headName || "Нет руководителя")}
        </div>

        ${
          nd.headPosition
            ? `<div class="chart-card-v3__position">
                ${escapeHtml(nd.headPosition)}
              </div>`
            : ""
        }

        <div class="chart-card-v3__count">
          ${getDisplayCount(nd, showVacancies)} сотрудников
        </div>
      </div>
    </div>
  `;
}

function getDisplayCount(node, showVacancies) {
  return showVacancies
    ? node.totalWithVacancies || node.staffCount || 0
    : node.staffCount || 0;
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "—";

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}