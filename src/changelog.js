const CHANGELOG_STORAGE_KEY = "orgAppLastSeenVersion";

const CHANGELOG_ENTRIES = [
  {
    version: "1.6.0",
    date: "2026-06-24",
    added: [
      "Компактная иконка журнала обновлений рядом с заголовком приложения.",
      "Сворачиваемый блок сценарного моделирования с сохранением состояния в localStorage.",
      "Брендбук интерфейса ui-brandbook.md.",
    ],
    fixed: [
      "Экспорт PDF приближен к экранной логике расположения структуры.",
      "Название дизайна карточек Вариант 3 заменено на «Профиль руководителя».",
    ],
    implemented: [
      "Упрощенный практический формат раздела «Что нового»: версия, дата, добавлено, исправлено, реализовано.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-06-24",
    added: ["Журнал обновлений внутри приложения."],
    fixed: [],
    implemented: [
      "Индикатор NEW для непросмотренной версии журнала обновлений.",
      "Сохранение последней просмотренной версии в localStorage.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-06-23",
    added: [
      "Отображение проектов сотрудников, вакансий и административного ассистента.",
      "Карточка административного ассистента рядом с руководителем выбранной структуры.",
    ],
    fixed: [
      "Административный ассистент не дублируется в нижнем списке сотрудников, если уже показан рядом с руководителем.",
    ],
    implemented: ["Отображение проектов в PDF-экспорте."],
  },
  {
    version: "1.3.0",
    date: "2026-06-20",
    added: [
      "Режимы AS IS, TO BE и Изменения.",
      "Операции добавления, редактирования, удаления и перемещения подразделений, сотрудников и вакансий.",
      "Правая панель изменений сценария.",
      "Сравнение текущей и целевой структуры.",
    ],
    fixed: [],
    implemented: [],
  },
];

export function initChangelog({
  openButtonId = "openChangelog",
  badgeId = "changelogBadge",
  modalId = "changelogModal",
  closeButtonId = "closeChangelogModal",
  contentId = "changelogContent",
  latestVersionId = "changelogLatestVersion",
} = {}) {
  const openButton = document.getElementById(openButtonId);
  const badge = document.getElementById(badgeId);
  const modal = document.getElementById(modalId);
  const closeButton = document.getElementById(closeButtonId);
  const content = document.getElementById(contentId);
  const latestVersion = document.getElementById(latestVersionId);

  if (!openButton || !modal || !content) return;

  renderChangelog(content);
  renderLatestVersion(latestVersion);
  updateUnreadBadge(badge);

  openButton.addEventListener("click", () => {
    openChangelogModal(modal, badge);
  });

  closeButton?.addEventListener("click", () => {
    closeChangelogModal(modal);
  });

  modal
    .querySelector("[data-close-changelog]")
    ?.addEventListener("click", () => {
      closeChangelogModal(modal);
    });
}

function openChangelogModal(modal, badge) {
  modal.classList.remove("hidden");
  markLatestVersionAsSeen();
  updateUnreadBadge(badge);
}

function closeChangelogModal(modal) {
  modal.classList.add("hidden");
}

function renderLatestVersion(container) {
  if (!container) return;

  const latestEntry = getLatestEntry();
  container.textContent = latestEntry ? `Последняя версия: ${latestEntry.version}` : "";
}

function renderChangelog(container) {
  if (!CHANGELOG_ENTRIES.length) {
    container.innerHTML = `<div class="changelog-empty">Обновлений пока нет</div>`;
    return;
  }

  container.innerHTML = CHANGELOG_ENTRIES.map(renderVersionEntry).join("");

  container.querySelectorAll("[data-changelog-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = button.closest(".changelog-entry");
      if (!entry) return;

      entry.classList.toggle("changelog-entry--collapsed");
    });
  });
}

function renderVersionEntry(entry, index) {
  const isLatest = index === 0;

  return `
    <section class="changelog-entry ${isLatest ? "" : "changelog-entry--collapsed"}">
      <button class="changelog-entry__header" type="button" data-changelog-toggle>
        <span>
          <span class="changelog-entry__version">Версия ${escapeHtml(entry.version)}</span>
          <span class="changelog-entry__date">Дата: ${escapeHtml(formatDate(entry.date))}</span>
        </span>
        <span class="changelog-entry__toggle">⌄</span>
      </button>

      <div class="changelog-entry__body">
        ${renderChangeGroup("Добавлено", entry.added)}
        ${renderChangeGroup("Исправлено", entry.fixed)}
        ${renderChangeGroup("Реализовано", entry.implemented)}
      </div>
    </section>
  `;
}

function renderChangeGroup(title, items = []) {
  if (!items.length) return "";

  return `
    <div class="changelog-group">
      <h3>${escapeHtml(title)}</h3>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function updateUnreadBadge(badge) {
  if (!badge) return;

  badge.classList.toggle("hidden", !hasUnreadLatestVersion());
}

function hasUnreadLatestVersion() {
  const latestEntry = getLatestEntry();
  if (!latestEntry) return false;

  return localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestEntry.version;
}

function markLatestVersionAsSeen() {
  const latestEntry = getLatestEntry();
  if (!latestEntry) return;

  localStorage.setItem(CHANGELOG_STORAGE_KEY, latestEntry.version);
}

function getLatestEntry() {
  return CHANGELOG_ENTRIES[0] || null;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
