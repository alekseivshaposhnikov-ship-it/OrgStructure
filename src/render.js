// Render tree nodes with optional user list display (full name preferred)
export function renderTree(nodes, container) {
  // Clear container before rendering
  container.innerHTML = '';

  function renderNode(node, indent = 0) {
    const el = document.createElement("div");
    el.style.marginLeft = `${indent * 20}px`;
    el.style.padding = "4px";

     // Base info: department name with staff count in brackets
     let html = `<b>${node.department_name} (${node.staffCount || 0})</b>`;

    // Manager info if available
    if (node.department_manager) {
      html += `<br/>${node.department_manager}`;
    }

    // Users list if attached to the node
    if (node.users && node.users.length > 0) {
       // Build users HTML: display full name if present, otherwise email
      const usersHtml = node.users
        .map(u => u.full_name || u.email || "")
        .filter(txt => txt !== "")
        .join("<br/>");
      html += `<div style="margin-left:20px;font-size:12px;color:#555;">${usersHtml}</div>`;
    }

    el.innerHTML = html;
    container.appendChild(el);

    // Recursively render children if any
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => renderNode(child, indent + 1));
    }
  }

  nodes.forEach(rootNode => renderNode(rootNode, rootNode.level || 0));
}

