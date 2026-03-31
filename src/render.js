export function renderTree(nodes, container) {
  nodes.forEach(n => {
    const el = document.createElement("div");

    el.style.marginLeft = n.level * 20 + "px";
    el.style.padding = "4px";

    el.innerHTML = `
      <b>${n.department_name}</b><br/>
      ${n.department_manager || ""}
    `;

    container.appendChild(el);

    if (n.children) {
      renderTree(n.children, container);
    }
  });
}