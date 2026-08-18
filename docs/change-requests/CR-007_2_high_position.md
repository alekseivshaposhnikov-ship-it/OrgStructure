Исправить расчет вертикальных координат в `unified-layout.js`.

### Проблема

Сейчас большие колонки сотрудников создают огромные вертикальные разрывы между подразделениями следующих управленческих уровней.

Причина найдена в текущем алгоритме.

`NODE_EMPLOYEES` получает:

```js
node.row = parentRow + 1;
```

После этого его высота рассчитывается как:

```js
node.height =
  opts.employeesHeaderHeight +
  n * opts.employeeHeight +
  (n > 1 ? (n - 1) * opts.personGap : 0);
```

Далее `collectRowHeights()` включает эту высоту в максимальную высоту всей строки:

```js
rowHeights[index] = Math.max(
  rowHeights[index] || 0,
  node.height
);
```

А `computeRowTops()` использует эту высоту для положения следующей строки:

```js
rowTops[index] =
  rowTops[index - 1] +
  rowHeights[index - 1] +
  opts.rowGap;
```

В результате одна колонка из большого количества сотрудников может иметь высоту 1000–2000 px и опустить весь следующий управленческий уровень на эту величину.

Это неверно.

---

# Требуемая модель

Необходимо разделить:

```text
organizational levels
```

и

```text
department content
```

## 1. Организационные строки

Только:

```js
NODE_DEPARTMENT
```

участвует в расчете управленческих строк по `sub_level / effectiveLayoutLevel`.

Карточки подразделений одинакового уровня должны иметь одинаковый `Y`.

Например:

```text
ROOT        level 2

A           level 3
B           level 3

A1          level 4
B1          level 4
```

обязательно:

```js
A.y === B.y;
A1.y === B1.y;
```

---

# 2. NODE_EMPLOYEES не является организационной строкой

`NODE_EMPLOYEES` не должен участвовать в:

```js
buildRowIndexMap()
collectRowHeights()
computeRowTops()
```

как самостоятельный organizational level.

Высота списка сотрудников не должна определять положение следующего `sub_level`.

Это соответствует CR007: сотрудники являются содержимым подразделения, а не следующим уровнем организационной структуры.

---

# 3. Положение employee-column

Employee-column необходимо позиционировать относительно своего непосредственного родительского подразделения.

Условно:

```js
employeeNode.y =
  parentDepartment.y +
  parentDepartment.height +
  CONTENT_GAP;
```

Добавить отдельный параметр, например:

```js
contentGap: 30
```

или использовать подходящий существующий gap, если это архитектурно чище.

Не использовать для employee-column глобальный `rowTop`.

---

# 4. Положение дочерних подразделений

Дочернее подразделение должно получать Y исключительно из своего organizational/effective level:

```js
childDepartment.y =
  departmentLevelTops.get(childDepartment.row);
```

Высота employee-column его родителя или соседней ветки не должна изменять этот Y.

---

# 5. Не допустить наложений

Важно: нельзя просто исключить employees из `rowHeights` и закончить изменение.

После этого длинная employee-column потенциально может пересечься с дочерним подразделением следующего уровня.

Поэтому при изменении layout необходимо проверить spatial collision внутри конкретной parent-ветки.

Предпочтительный принцип:

```text
Y = organizational management level
X = hierarchy / subtree geometry
```

Если employee-column длиннее пространства между двумя organizational levels, не нужно глобально опускать весь следующий уровень.

Вместо этого employee-column должна занимать собственную горизонтальную колонку внутри subtree родителя.

Пример:

```text
                         ОТДЕЛ A
                            |
          +-----------------+----------------+
          |                 |                |
     сотрудники          ОТДЕЛ A1         ОТДЕЛ A2
      отдела A
          |
       employee
       employee
       employee
       employee
       employee
```

То есть длинная колонка сотрудников растет вниз в своем X-диапазоне, а дочерние departments находятся в соседних X-диапазонах.

Она не должна находиться непосредственно над дочерней department-card, если это приводит к пересечению.

---

# 6. NODE_ASSISTANT

`NODE_ASSISTANT` также не должен влиять на глобальные organizational row heights.

Это специальный content-node.

Сохранить существующее специальное отображение административного ассистента, но его высота не должна сдвигать следующие `sub_level`.

---

# 7. Что сохранить

Не менять:

* расчет `managerSubLevel`;
* fallback `sub_level`;
* parent-child hierarchy;
* порядок подразделений;
* состав сотрудников;
* вакансии;
* collapse/expand;
* renderer карточек;
* debug-вывод `sub_level`.

Изменение должно касаться layout positioning.

---

# 8. Желательная архитектура

Разделить расчет Y на две категории.

### Departments

Например:

```js
function assignDepartmentY(...) {
    // Y определяется organizational row
}
```

### Content nodes

Например:

```js
function assignContentY(node, parent, opts) {
    node.y =
      parent.y +
      parent.height +
      opts.contentGap;
}
```

Названия функций могут быть другими — важен принцип, а не конкретная сигнатура.

---

# 9. Особое внимание к X-layout

Текущий `computeSubtreeWidths()` уже учитывает children как отдельные горизонтальные элементы.

Сохранить этот принцип.

Employee-column должна продолжать иметь:

```js
subtreeWidth = employeeWidth
```

и участвовать в горизонтальном распределении children родителя.

То есть при:

```text
Department A
├── employees
├── Department A1
└── Department A2
```

горизонтальный layout должен резервировать три колонки:

```text
[ employees A ] [ Department A1 subtree ] [ Department A2 subtree ]
```

Это необходимо для предотвращения пересечений.

---

# 10. Критерий результата

До исправления:

```text
Level 3 departments
       |
       |
       | ← employee-column 1500 px
       |
       |
       |
       |
       |
Level 4 departments
```

После:

```text
Level 3 departments
       |
       +---- employee columns
       |
Level 4 departments
```

При этом employee-column может продолжаться вниз независимо в собственной колонке.

Большое количество сотрудников одного подразделения не должно создавать огромную пустую вертикальную область во всех остальных ветках диаграммы.

---

# Перед изменением

Сначала кратко опиши предлагаемый новый расчет Y и проверь потенциальные collision cases.

После этого внеси изменение в `unified-layout.js` и добавь/обнови unit-тесты минимум для:

1. department без employees;
2. department с 1 employee;
3. department с 20 employees;
4. две соседние ветки, где только одна содержит 20 employees;
5. несколько departments одинакового `sub_level`;
6. employees + child departments у одного parent;
7. administrative assistant;
8. collapsed department.

Ключевой тест:

при увеличении количества сотрудников с `1` до `20` координата `Y` подразделения следующего `sub_level` в другой ветке **не должна изменяться**.
