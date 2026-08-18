Исправить определение `sub_level` руководителя подразделения.

Сейчас в `transformNode()` значение уровня руководителя формируется так:

```js
manager_sub_level: parseSubLevel(apiNode.manager?.sub_level),
```

Проблема в том, что API не всегда передает `sub_level` внутри объекта:

```js
apiNode.manager
```

При этом тот же руководитель присутствует в:

```js
apiNode.employees
```

и у него там `sub_level` заполнен.

Пример из реальных данных:

```json
{
  "name": "Отдел клиентского сопровождения",
  "manager": {
    "full_name": "Зуева Наталья Сергеевна",
    "position": "Руководитель отдела /Отдел клиентского сопровождения/, (СЕВЕРНЫЙ ПОРТ 5 ООО)",
    "projects": ""
  },
  "employees": [
    {
      "full_name": "Зуева Наталья Сергеевна",
      "position": "Руководитель отдела /Отдел клиентского сопровождения/, (СЕВЕРНЫЙ ПОРТ 5 ООО)",
      "sub_level": "4.0",
      "count": "1"
    }
  ]
}
```

То есть `manager.sub_level` отсутствует, но у соответствующего сотрудника в `employees` есть:

```text
sub_level = 4.0
```

Из-за текущей реализации в карточке подразделения выводится:

```text
sub_level: —
```

хотя фактический уровень руководителя есть.

## Требуемая реализация

Необходимо изменить определение `manager_sub_level` следующим образом.

Приоритет:

1. Если `apiNode.manager.sub_level` присутствует и валиден — использовать его.
2. Если `apiNode.manager.sub_level` отсутствует — найти руководителя в `apiNode.employees`.
3. Для поиска использовать уже существующую логику сопоставления руководителя и сотрудника.
4. В первую очередь сопоставлять по `id`, если `id` есть у обоих объектов.
5. Если `id` отсутствует — сопоставлять по `full_name`:

   * `trim()`;
   * без учета регистра.
6. Если соответствующий сотрудник найден — использовать его `sub_level`.
7. Если руководитель не найден либо у найденного сотрудника тоже отсутствует `sub_level` — оставить текущее fallback-значение через `parseSubLevel(undefined)`.

Не дублировать отдельную новую логику сравнения руководителя и сотрудника, если уже существует функция:

```js
isSamePerson(emp, manager)
```

Нужно переиспользовать ее.

## Рекомендуемая реализация

Добавить отдельную функцию:

```js
function getManagerSubLevel(apiNode) {
  const manager = apiNode.manager;

  if (!manager) {
    return parseSubLevel(undefined);
  }

  if (
    manager.sub_level !== undefined &&
    manager.sub_level !== null &&
    manager.sub_level !== ''
  ) {
    return parseSubLevel(manager.sub_level);
  }

  const managerEmployee = (apiNode.employees || []).find(emp =>
    isSamePerson(emp, manager)
  );

  return parseSubLevel(managerEmployee?.sub_level);
}
```

После этого в `transformNode()` заменить:

```js
manager_sub_level: parseSubLevel(apiNode.manager?.sub_level),
```

на:

```js
manager_sub_level: getManagerSubLevel(apiNode),
```

## Дополнительное требование

Проверить, что эта же логика сопоставления руководителя используется при исключении руководителя из списка обычных сотрудников:

```js
const visibleEmployees = validEmployees.filter(
  emp => !isSamePerson(emp, apiNode.manager)
);
```

Не должно появиться двух разных алгоритмов определения того, является ли сотрудник руководителем подразделения.

## Ожидаемый результат

Для данных:

```text
Подразделение:
Отдел клиентского сопровождения

Руководитель:
Зуева Наталья Сергеевна

manager.sub_level:
отсутствует

employees[].sub_level руководителя:
4.0
```

во внутренней модели должно получиться:

```js
manager_sub_level: 4
```

и в debug-отображении карточки:

```text
sub_level: 4
```

или:

```text
sub_level: 4.0
```

в зависимости от текущего формата отображения.

Главное — вместо:

```text
sub_level: —
```

должен выводиться фактический уровень руководителя.

## Что не менять

В рамках этого изменения не менять:

* структуру API;
* `parseSubLevel`;
* сортировку сотрудников;
* layout диаграммы;
* CR007;
* parent-child связи;
* логику вакансий;
* логику сценариев.

Изменение должно быть локальным и касаться только корректного получения `manager_sub_level`.

## Проверка

После реализации проверить минимум следующие случаи:

```text
1. manager.sub_level заполнен
→ используется manager.sub_level

2. manager.sub_level отсутствует,
   но руководитель найден в employees и у него есть sub_level
→ используется employees[].sub_level

3. manager.sub_level отсутствует,
   руководитель в employees не найден
→ fallback / отсутствующий уровень

4. руководитель найден по id
→ корректный sub_level

5. id отсутствует,
   руководитель найден по full_name
→ корректный sub_level
```

Для реального кейса Зуевой Натальи Сергеевны ожидаемый результат:

```text
sub_level: 4.0
```
