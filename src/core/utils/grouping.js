/**
 * grouping.js
 * Presentation-группировка сотрудников по должности (CR-023).
 *
 * Группировка — исключительно способ визуального представления данных.
 * Исходная модель организационной структуры не изменяется: утилиты лишь
 * формируют набор визуальных элементов (отдельный сотрудник либо группа
 * сотрудников с одинаковой должностью внутри одного подразделения).
 *
 * Правила (CR-023 §4):
 *   - группировка только внутри одного подразделения (входной список users
 *     уже относится к одному подразделению);
 *   - одинаковой считается должность, у которой совпадает фактическое название
 *     после отсечения служебной части «/подразделение/, (ООО "...")»
 *     (нормализация регистра и пробелов, без частичного совпадения);
 *   - вакансии не смешиваются с работающими сотрудниками;
 *   - один и тот же человек (совпадение ФИО) не выводится в группе дважды;
 *   - группа из одного человека разворачивается обратно в одиночную карточку.
 */

import { formatEmployeeDisplayName } from "./employee.js";

/** Идентификатор режима дизайна карточек «Группировка по должности». */
export const GROUPED_CARD_DESIGN = "grouped";

/**
 * Нормализует должность до ключа группировки (CR-023 §4.2).
 * Отсекает служебную часть с подразделением и юридическим лицом, приводит
 * регистр к нижнему и схлопывает пробелы. Разные должности по частичному
 * совпадению не объединяются: сравнение идёт по полному нормализованному
 * названию.
 *
 * @param {string|null|undefined} position
 * @returns {string}
 */
export function normalizePositionKey(position) {
  let value = String(position || "").trim();
  if (!value) return "";

  // «Название /Подразделение/, (ООО "...")» → «Название».
  const slashIndex = value.indexOf("/");
  if (slashIndex !== -1) {
    value = value.slice(0, slashIndex);
  }

  // На случай должности без «/», но с указанием юр. лица в скобках.
  value = value.replace(/,\s*\(.*?\)\s*$/, "");

  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Нормализует ФИО до ключа идентификации человека (CR-023 §4.4).
 * Используется существующее представление проекта — полное ФИО сотрудника,
 * а не только id записи (записи по разным юр. лицам могут иметь разные id).
 *
 * @param {string|null|undefined} fullName
 * @returns {string}
 */
export function normalizePersonKey(fullName) {
  return String(fullName || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Формирует presentation-элементы колонки сотрудников подразделения.
 *
 * @param {Array} users - сотрудники/вакансии одного подразделения (уже
 *   отфильтрованные и отсортированные как для текущего режима).
 * @param {{ groupByPosition?: boolean }} [options]
 * @returns {Array<{type:'person', data:object}|{type:'group', key:string, position:string, members:object[]}>}
 */
export function buildEmployeePresentations(users, { groupByPosition = false } = {}) {
  const list = Array.isArray(users) ? users : [];

  if (!groupByPosition) {
    return list.map((user) => ({ type: "person", data: user }));
  }

  const items = [];
  const groupByKey = new Map();

  list.forEach((user) => {
    // Вакансии не смешиваются с фактически работающими сотрудниками (CR-023 §4.5).
    const key = user.isVacancy ? "" : normalizePositionKey(user.position);

    if (!key) {
      items.push({ type: "person", data: user });
      return;
    }

    const existing = groupByKey.get(key);
    if (existing) {
      existing.members.push(user);
      return;
    }

    const group = {
      type: "group",
      key,
      position: user.position || "",
      members: [user],
    };
    groupByKey.set(key, group);
    items.push(group);
  });

  return items.map((item) => {
    if (item.type !== "group") return item;

    // Дедупликация одинаковых людей внутри группы (CR-023 §4.4): повторные
    // записи одного человека (разные юр. лица/совместительство) не дублируются.
    const seen = new Set();
    const members = item.members.filter((member) => {
      const personKey = normalizePersonKey(member.full_name || member.name);
      if (!personKey) return true;
      if (seen.has(personKey)) return false;
      seen.add(personKey);
      return true;
    });

    if (members.length <= 1) {
      return { type: "person", data: members[0] || item.members[0] };
    }

    return { type: "group", key: item.key, position: item.position, members };
  });
}

/**
 * Presentation-имя участника группы для групповой карточки (CR-023 §5):
 * «Фамилия Имя» для всех, кроме top-3 (keepFullName) — тем же правилом,
 * что и одиночные карточки.
 *
 * @param {object} member
 * @returns {string}
 */
export function formatGroupMemberName(member) {
  return formatEmployeeDisplayName(member.full_name || member.name || "", {
    keepFullName: Boolean(member.keepFullName),
  });
}
