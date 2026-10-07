import { escapeHtml, formatDate } from "../core/utils/string.js";

const CHANGELOG_STORAGE_KEY = "orgAppLastSeenVersion";

const CHANGELOG_ENTRIES = [
  {
    version: "1.9.0",
    date: "2026-10-05",
    added: [],
    fixed: [
      "Длинные названия должностей в PDF без ФИО больше не накладываются друг на друга.",
    ],
    implemented: [
      "Исключены подразделения «Прочие» и «Дирекция по продажам» из экрана, поиска и PDF-выгрузок (актуальная дирекция по маркетингу/продажам сохранена).",
      "Для подразделений без руководителя вместо «Нет руководителя» отображается «Вакансия».",
      "Винник Л. отображается руководителем своей дирекции: организационно дирекция находится непосредственно под Селивановым В., а визуально — на уровне остальных дирекций.",
      "В верхнеуровневом представлении административные ассистенты отображаются только у Клюева, Лукьянова и Селиванова.",
      "Два административных ассистента в УСМР отображаются одной визуальной группой.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-07-10",
    added: [
      "Настраиваемая ширина карточек организационной диаграммы (180–500 px, шаг 10 px) с сохранением значения в localStorage.",
      "Горизонтальный режим отображения диаграммы (переключатель «Ориентация диаграммы»).",
      "Единый стиль карточек — синяя обводка для сотрудников, подразделений и административных ассистентов.",
    ],
    fixed: [],
    implemented: [
      "Автоматическое скрытие пустых подразделений (без сотрудников, вакансий и непустых дочерних узлов) из дерева, диаграммы и экспорта PDF.",
      "Полное исключение подразделения «Администрация+» из отображения и всех расчётов.",
      "Переименование «Дирекция по эксплуатации» в «LEGENDA Comfort» во всех режимах приложения.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-06-26",
    added: [
      "Компактный режим отображения оргструктуры (Compact A4): оптимизированная раскладка для печати на листах A4 с уменьшенными карточками сотрудников.",
    ],
    fixed: [],
    implemented: [
      "Переделана выгрузка в PDF: улучшенный рендеринг через D3 с корректной пагинацией по страницам A4, поддержка альбомной ориентации и высокого DPI.",
    ],
  },
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
