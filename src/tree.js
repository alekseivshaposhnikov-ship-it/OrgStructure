// Функция строит дерево DOM из массива отделов
export function buildTree(data) {
  const map = {};
  const roots = [];

  // создаём объекты по guid
  data.forEach(d => {
    map[d.department_guid] = { ...d, children: [] };
  });

  // связываем с родителями
  data.forEach(d => {
    if (d.parent_guid && d.parent_guid !== "00000000-0000-0000-0000-000000000000" && map[d.parent_guid]) {
      map[d.parent_guid].children.push(map[d.department_guid]);
    } else {
      roots.push(map[d.department_guid]);
    }
  });

  // рекурсивно строим DOM
  function createNode(dep) {
    const div = document.createElement("div");
    div.className = "department";
    div.innerHTML = `<strong>${dep.department_name}</strong> (${dep.user_count} чел.)<br/>Руководитель: ${dep.department_manager || "-"}`;
    dep.children.forEach(child => div.appendChild(createNode(child)));
    return div;
  }

  const container = document.createElement("div");
  roots.forEach(root => container.appendChild(createNode(root)));
  return container;
}