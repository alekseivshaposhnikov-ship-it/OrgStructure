# CR-004: Покрытие системы юнит-тестами

**Автор:** Cline  
**Дата:** 2026-06-25  
**Статус:** Черновик  

---

## 1. Цель

Разработать и внедрить юнит-тесты для ключевых модулей системы Org Structure Viewer.  
Обеспечить регрессионную защиту при дальнейшем развитии функциональности: сценарное моделирование, экспорт PDF, трансформация API-данных, рендеринг карточек.

---

## 2. Предлагаемые изменения

### 2.1. Выбор и настройка тестового фреймворка

**Инструмент:** [Vitest](https://vitest.dev/) (v3+)

**Обоснование:**
- Проект уже использует Vite — единый инструмент сборки.
- Vitest совместим с Vite-конфигурацией (resolve aliases, плагины).
- Быстрый запуск, поддержка ESM, встроенный coverage.
- Низкий порог входа — API совместим с Jest.

**Установка:**

```bash
npm install -D vitest @vitest/coverage-v8
```

**Конфигурация `vite.config.js`:**

```js
/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // ...существующая конфигурация
  test: {
    globals: true,
    environment: 'jsdom',   // для модулей, работающих с DOM / DOMParser
    include: ['src/**/*.test.js'],
    coverage: {
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
```

**Зависимости для `jsdom`:**

```bash
npm install -D jsdom
```

**Скрипты в `package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

### 2.2. Приоритеты покрытия

| Приоритет | Модуль | Обоснование |
|-----------|--------|-------------|
| **P0** | `src/scenario-manager.js` | Ядро бизнес-логики: CRUD-операции над деревом, статистика, поиск, рекурсивные обходы. Наибольший риск регрессии. |
| **P0** | `src/api.js` | Трансформация «сырых» API-данных во внутреннюю структуру. Чистая функция без внешних зависимостей. |
| **P1** | `src/layout.js` | Утилиты обхода дерева (`addLevels`, `flattenTree`). Простые, но используются повсеместно. |
| **P1** | `src/chart-cards.js` | Рендеринг HTML-строк карточек. Зависит от входных данных (cardDesign, showVacancies, viewMode). |
| **P2** | `src/changelog.js` | Работа с localStorage и DOM-событиями. Можно частично покрыть через утилиты. |
| **P2** | `src/pdf-d3-export.js` | SVG-генерация для PDF. Зависит от DOM (createElementNS). Логика расчёта позиций — чистая. |
| **P3** | `src/sidebar-tree.js` | DOM-манипуляции, event listeners. Требует jsdom и сложных моков. |
| **P3** | `src/employee-modal.js` | Преимущественно DOM-операции. |
| **P3** | `main.js` | Интеграционный сценарий. Тестируется через e2e, не юнит-тесты. |
| **P3** | `src/render.js` | Устаревший модуль, минимальная ценность. |

---

### 2.3. Тест-кейсы по модулям

#### 2.3.1. `src/scenario-manager.js` — 40+ тестов

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `createScenario` — создаёт сценарий с клонированным деревом | Проверить, что baseTree и workingTree — независимые копии (мутация одной не влияет на другую) |
| 2 | `createScenario` — operations пуст | Массив операций пуст |
| 3 | `resetScenario` — сбрасывает изменения | workingTree становится копией baseTree, operations пуст |
| 4 | `renameScenario` — обновляет имя | Проверить новое имя в возвращаемом объекте |
| 5 | `renameScenario` — пустая строка | Должен вернуть имя по умолчанию |
| 6 | `addDepartment` — добавляет дочернее подразделение | parent найден, department добавлен, scenarioState = "added" |
| 7 | `addDepartment` — parent не найден | Вернуть исходный scenario без изменений |
| 8 | `addDepartment` — рекалькуляция численности | После добавления staffCount/vacancyCount родителя увеличился |
| 9 | `addDepartment` — операция записана | В operations появилась запись с type="addDepartment" |
| 10 | `editDepartment` — меняет название | Проверить обновление department_name |
| 11 | `editDepartment` — меняет руководителя | Проверить department_manager |
| 12 | `editDepartment` — scenarioState = "changed" | Если не "added" — устанавливается "changed" |
| 13 | `editDepartment` — не меняет scenarioState="added" | Если уже "added" — остаётся "added" |
| 14 | `editDepartment` — department не найден | Вернуть исходный scenario |
| 15 | `addEmployee` — добавляет сотрудника | users.length увеличился, isVacancy=false |
| 16 | `addEmployee` — scenarioState = "added" | У нового сотрудника scenarioState="added" |
| 17 | `addEmployee` — department не найден | Вернуть исходный scenario |
| 18 | `addEmployee` — рекалькуляция | staffCount родителя увеличился |
| 19 | `addEmployee` — сортировка после добавления | Проверить порядок users (vacancies в конце) |
| 20 | `editEmployee` — обновление ФИО, должности, email | Все поля изменились |
| 21 | `editEmployee` — scenarioState = "changed" | Если не "added" |
| 22 | `editEmployee` — не меняет scenarioState="added" | Остаётся "added" |
| 23 | `editEmployee` — user не найден | Вернуть исходный scenario |
| 24 | `addVacancy` — добавляет вакансию | isVacancy=true, scenarioState="added" |
| 25 | `addVacancy` — department не найден | Вернуть исходный scenario |
| 26 | `editVacancy` — обновление должности, проекта | Поля изменились |
| 27 | `editVacancy` — для isVacancy=false не срабатывает | Вернуть исходный scenario |
| 28 | `removeEmployee` — удаляет сотрудника | users.length уменьшился |
| 29 | `removeEmployee` — рекалькуляция | staffCount уменьшился |
| 30 | `removeEmployee` — operationType = "removeEmployee" | В operations добавлена запись |
| 31 | `removeVacancy` — удаляет вакансию | users отфильтрованы |
| 32 | `moveEmployee` — перенос в другое подразделение | Из одного department.users ушёл, в другом появился |
| 33 | `moveEmployee` — scenarioState = "moved" | Если не "added" |
| 34 | `moveVacancy` — перенос вакансии | Аналогично moveEmployee |
| 35 | `moveDepartment` — перенос подразделения | Дерево изменилось, parent_guid обновлён |
| 36 | `moveDepartment` — сам в себя | Вернуть исходный scenario |
| 37 | `moveDepartment` — в дочернее подразделение | Защита от цикла, вернуть исходный scenario |
| 38 | `removeDepartment` — удаление подразделения с детьми | Всё поддерево удалено, операция зафиксирована |
| 39 | `getTreeByViewMode` — "as-is" | Возвращает scenario.baseTree |
| 40 | `getTreeByViewMode` — "to-be" | Возвращает scenario.workingTree |
| 41 | `getTreeByViewMode` — "changes" | Возвращает дерево только с изменёнными узлами |
| 42 | `getScenarioStats` — расчёт статистики | Корректные значения departments, staff, vacancies, total для asIs, toBe, diff |
| 43 | `getDepartmentOptions` — все опции | Количество и формат (с отступами) |
| 44 | `findDepartmentById` — найден | Возвращает узел |
| 45 | `findDepartmentById` — не найден | null |
| 46 | `findUserById` — найден | Возвращает { user, department } |
| 47 | `findUserById` — не найден | null |
| 48 | `cloneTree` — глубокая копия | Мутация копии не влияет на оригинал |

#### 2.3.2. `src/api.js` — 15+ тестов

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `fetchOrganizationStructure` — успешный ответ | Вызов fetch, трансформация, возврат массива |
| 2 | `fetchOrganizationStructure` — HTTP ошибка | Проверить alert / возврат пустого массива |
| 3 | `fetchOrganizationStructure` — сетевой error | Проверить обработку исключения |
| 4 | `transformApiResponse` — пустой массив | Возвращает пустой массив |
| 5 | `transformApiResponse` — null | Возвращает пустой массив |
| 6 | Transform: один узел с сотрудниками | Проверить структуру: department_guid, department_name, users, children |
| 7 | Transform: короткая должность (с "/") | Должность обрезана до "/" |
| 8 | Transform: руководитель исключён из списка | manager удалён из users (по id или full_name) |
| 9 | Transform: сотрудник с count < 1 | Не включается в validEmployees |
| 10 | Transform: вакансии | Преобразуются, isVacancy=true |
| 11 | Transform: sub_level | Корректный парсинг (включая запятую как разделитель) |
| 12 | Transform: сотрудник с проектами | getProject находит projects/project/project_name и т.д. |
| 13 | Transform: подсчёт численности | staffCount, vacancyCount, totalWithVacancies рассчитаны рекурсивно |
| 14 | Transform: сортировка users | Сотрудники перед вакансиями, по sub_level |
| 15 | Transform: вложенные children | Рекурсивный обход, parent_guid корректны |

#### 2.3.3. `src/layout.js` — 4+ тестов

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `addLevels` — level проставлен | Каждый узел имеет поле level |
| 2 | `addLevels` — рекурсия | Вложенные узлы имеют level+1 |
| 3 | `addLevels` — пустой массив | Не падает |
| 4 | `flattenTree` — все узлы | Массив содержит все узлы дерева |
| 5 | `flattenTree` — порядок | Порядок соответствует DFS |
| 6 | `flattenTree` — пустой массив | Возвращает [] |

#### 2.3.4. `src/chart-cards.js` — 12+ тестов

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `renderNodeContent` — department classic | HTML содержит название, руководителя, численность |
| 2 | `renderNodeContent` — department variant2 | HTML содержит класс `chart-card--department-v2` |
| 3 | `renderNodeContent` — department variant3 | HTML содержит инициалы руководителя |
| 4 | `renderNodeContent` — employee | HTML содержит ФИО, должность, data-employee-id |
| 5 | `renderNodeContent` — vacancy | HTML содержит "Вакансия" |
| 6 | `renderNodeContent` — assistant | HTML содержит "Административный ассистент" |
| 7 | `renderNodeContent` — PDF mode для department | Используется `renderDepartmentPdf` |
| 8 | `renderNodeContent` — PDF mode для employee | Используется `renderEmployeePdf` |
| 9 | `renderNodeContent` — hideNames=true | Имена скрыты |
| 10 | `renderNodeContent` — scenarioState="added" | HTML содержит scenario-badge с "NEW" |
| 11 | `renderNodeContent` — project отображается | HTML содержит "Проект:" |
| 12 | `renderMenuButton` — viewMode="as-is" | Пустая строка |
| 13 | `renderMenuButton` — viewMode="to-be" | HTML содержит кнопку "⋮" |

#### 2.3.5. `src/changelog.js` — 5+ тестов

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `hasUnreadLatestVersion` — не просмотрено | true |
| 2 | `hasUnreadLatestVersion` — просмотрено | false |
| 3 | `markLatestVersionAsSeen` — устанавливает localStorage | Ключ `orgAppLastSeenVersion` равен последней версии |
| 4 | `formatDate` — корректный формат | "24.06.2026" |
| 5 | `formatDate` — пустая строка | "" |

#### 2.3.6. `src/pdf-d3-export.js` — 10+ тестов (чистая логика)

| # | Тест-кейс | Описание |
|---|-----------|----------|
| 1 | `buildExportTree` — одиночный корень | Используется как есть |
| 2 | `buildExportTree` — несколько корней | Создаётся syntheticRoot |
| 3 | `buildExportTree` — hideNames=true | manager пуст |
| 4 | `buildExportTree` — showVacancies=false | Вакансии отфильтрованы |
| 5 | `sanitizeFileName` — недопустимые символы | Заменены на "_" |
| 6 | `sanitizeFileName` — длинное имя | Обрезано до 120 символов |
| 7 | `formatDate` — форматирование | "25.06.2026" |
| 8 | `getScenarioLabel` — все состояния | added/changed/moved/removed и default |
| 9 | `wrapText` — перенос строк | split by words, maxChars |
| 10 | `truncateText` — обрезка с многоточием | "Длинный те…" |

---

### 2.4. Структура тестовых файлов

```
src/
  __tests__/
    scenario-manager.test.js     # ~40 тестов
    api.test.js                  # ~15 тестов
    layout.test.js               # ~6 тестов
    chart-cards.test.js          # ~13 тестов
    changelog.test.js            # ~5 тестов
    pdf-d3-export.test.js        # ~10 тестов
```

Или опционально — тесты рядом с модулями:

```
src/
  scenario-manager.js
  scenario-manager.test.js
  api.js
  api.test.js
  layout.js
  layout.test.js
  chart-cards.js
  chart-cards.test.js
  changelog.js
  changelog.test.js
  pdf-d3-export.js
  pdf-d3-export.test.js
```

**Рекомендуемый подход** — файлы рядом с модулями (colocated tests):
- Меньше навигации.
- Очевидно, какие модули покрыты.
- Проще поддерживать соответствие модуля и тестов.

---

### 2.5. Рекомендации по рефакторингу для улучшения тестируемости

#### 2.5.1. `src/api.js`

**Проблема:** `fetchOrganizationStructure` вызывает `alert()` и не inject-ит fetch.

**Решение:** Вынести чистую трансформацию в отдельную функцию `transformApiResponse`, которая уже существует. Для тестов мокать глобальный `fetch` через `vi.stubGlobal` или передавать fetcher параметром.

```js
// Вариант: параметр fetcher с умолчанием
export async function fetchOrganizationStructure(fetcher = window.fetch) {
  // ...
}
```

#### 2.5.2. `src/main.js`

**Проблема:** Точка входа — не тестируется как модуль. Все функции и переменные замыкаются внутри модуля.

**Решение:** Тестировать интеграцию не юнит-тестами, а e2e (Playwright) при дальнейшем развитии. Для юнит-тестов main.js не покрывать, сосредоточиться на src/ модулях.

#### 2.5.3. `src/pdf-d3-export.js`

**Проблема:** Функции работы с SVG (`createSvgElement`) зависят от DOM.

**Решение:** Для тестов использовать `jsdom` окружение. Функции чистой логики (`buildLayout`, `assignPositions`, `wrapText`, `sanitizeFileName`, `getScenarioLabel`) тестировать без DOM. Функции `drawCard`, `drawConnectors` и т.д. покрывать интеграционно.

#### 2.5.4. `src/chart-cards.js`

Все функции — чистые, возвращают строки. Тестируются без моков.

#### 2.5.5. `src/scenario-manager.js`

Все экспортируемые функции принимают данные как параметры и возвращают новые объекты (иммутабельный паттерн). Тестируются без моков. Идеальный кандидат для unit-тестов.

---

## 3. Риски и ограничения

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Тестирование `pdf-d3-export.js` требует jsdom | Высокая | Среднее | Использовать `environment: 'jsdom'` только для этого файла |
| `chart-cards.js` использует `escapeHtml`, дублированный в нескольких модулях | Средняя | Низкое | Проверить, что тестируем экспортируемую функцию |
| `alert()` в `api.js` и `main.js` | Низкая | Низкое | Мокать глобальный alert через `vi.stubGlobal` |
| `jsdom` может не поддерживать `createElementNS` для SVG | Низкая | Высокое | Проверить, при необходимости заглушить |

---

## 4. Критерии приёмки (Definition of Done)

- [ ] Vitest установлен и сконфигурирован.
- [ ] Скрипты `test`, `test:watch`, `test:coverage` добавлены в `package.json`.
- [ ] Модуль `src/scenario-manager.js` покрыт тестами (≥80% функций, ≥80% строк).
- [ ] Модуль `src/api.js` покрыт тестами (≥90% строк, включая трансформацию).
- [ ] Модуль `src/layout.js` покрыт тестами (100% функций).
- [ ] Модуль `src/chart-cards.js` покрыт тестами (≥70% строк).
- [ ] Модуль `src/pdf-d3-export.js` покрыт тестами (чистая логика ≥80%).
- [ ] Модуль `src/changelog.js` покрыт тестами (утилиты ≥70%).
- [ ] Все тесты проходят (`npm run test`).
- [ ] Покрытие проекта в целом ≥50% строк.
- [ ] Отчёт coverage генерируется без ошибок.

---

## 5. План внедрения

| Этап | Действия | Ожидаемый результат |
|------|----------|---------------------|
| 1. Инфраструктура | Установка Vitest + jsdom, настройка `vite.config.js`, добавление скриптов | `npm run test` — успешный запуск (0 тестов) |
| 2. scenario-manager | Написание ~48 тестов | Все тесты зелёные |
| 3. api.js | Написание ~15 тестов с моком fetch | Все тесты зелёные |
| 4. layout.js | Написание ~6 тестов | Все тесты зелёные |
| 5. chart-cards.js | Написание ~13 тестов | Все тесты зелёные |
| 6. pdf-d3-export.js (чистая логика) | Написание ~10 тестов | Все тесты зелёные |
| 7. changelog.js | Написание ~5 тестов | Все тесты зелёные |
| 8. Финальная проверка | `npm run test:coverage` | Покрытие ≥50% |

---

## 6. Ожидаемые метрики

| Модуль | Функций экспортировано | Минимум тестов | Ожидаемое покрытие строк |
|--------|----------------------|----------------|--------------------------|
| `scenario-manager.js` | 15 | 48 | ≥85% |
| `api.js` | 1 (основная) + трансформация | 15 | ≥90% |
| `layout.js` | 2 | 6 | 100% |
| `chart-cards.js` | 1 | 13 | ≥75% |
| `pdf-d3-export.js` | 1 (основная) | 10 | ≥50% |
| `changelog.js` | 1 | 5 | ≥70% |
| **Итого по src/** | | **~97 тестов** | **≥55%** |

---

## 7. Заключение

Внедрение юнит-тестов обеспечит регрессионную защиту для ключевой бизнес-логики (сценарное моделирование, трансформация API-данных), упростит рефакторинг и позволит безопасно расширять функциональность приложения.

Наибольший приоритет — **scenario-manager** и **api.js**: эти модули реализуют основную бизнес-логику, используются во всех сценариях работы приложения и наиболее критичны для стабильности системы.