// src/sidebar-tree.js

export function createSyntheticRoot(nodes) {
  const totalStaff = nodes.reduce((sum, n) => sum + (n.staffCount || 0), 0);
  const totalVac = nodes.reduce((sum, n) => sum + (n.vacancyCount || 0), 0);

  return {
    department_name: "Холдинг LEGENDA",
    department_guid: "synthetic-root",
    children: nodes,
    staffCount: totalStaff,
    vacancyCount: totalVac,
    totalWithVacancies: totalStaff + totalVac,
    department_manager: "Селиванов Василий Геннадьевич",
    department_manager_position: "Генеральный директор",
    users: [],
  };
}

export function buildTreeView({
  nodes,
  container,
  selectedNode,
  onSelect,
}) {
  container.innerHTML = "";

  const rootUl = document.createElement("ul");
  rootUl.className = "tree-list";

  const rootNode = createSyntheticRoot(nodes);

  const actualSelectedNode =
    selectedNode?.department_guid === "synthetic-root"
      ? rootNode
      : selectedNode;

  createNodeElement({
    node: rootNode,
    parentUl: rootUl,
    selectedNode: actualSelectedNode,
    onSelect,
    isRoot: true,
  });

  container.appendChild(rootUl);

  return actualSelectedNode;
}

function createNodeElement({
  node,
  parentUl,
  selectedNode,
  onSelect,
  isRoot = false,
}) {
  const li = document.createElement("li");

  const row = document.createElement("div");
  row.className = "tree-row";

  const toggle = document.createElement("span");
  toggle.className = "toggle";
  toggle.textContent = "▶";
  toggle.style.visibility = node.children?.length ? "visible" : "hidden";

  const label = document.createElement("span");
  label.className = "dept-label";
  label.textContent = node.department_name || "Без названия";

  if (selectedNode?.department_guid === node.department_guid) {
    label.classList.add("selected");
  }

  row.appendChild(toggle);
  row.appendChild(label);
  li.appendChild(row);

  const childUl = document.createElement("ul");
  childUl.style.display = isRoot ? "block" : "none";

  if (isRoot) {
    toggle.textContent = "▼";
  }

  (node.children || []).forEach(child => {
    createNodeElement({
      node: child,
      parentUl: childUl,
      selectedNode,
      onSelect,
    });
  });

  li.appendChild(childUl);

  toggle.addEventListener("click", event => {
    event.stopPropagation();

    const isHidden = childUl.style.display === "none";

    childUl.style.display = isHidden ? "block" : "none";
    toggle.textContent = isHidden ? "▼" : "▶";
  });

  label.addEventListener("click", event => {
    event.stopPropagation();

    document
      .querySelectorAll(".dept-label")
      .forEach(el => el.classList.remove("selected"));

    label.classList.add("selected");

    onSelect?.(node);
  });

  label.addEventListener("dblclick", event => {
    event.stopPropagation();

    if (node.children?.length) {
      toggle.click();
    }
  });

  parentUl.appendChild(li);
}