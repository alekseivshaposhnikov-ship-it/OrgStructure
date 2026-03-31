// tree.js

// Строим дерево из плоского массива departments
export function buildTree(data, parentGuid = "00000000-0000-0000-0000-000000000000") {
    const nodes = data.filter(d => d.parent_guid === parentGuid)
                      .map(d => ({
                          ...d,
                          children: buildTree(data, d.department_guid)
                      }));
    return nodes;
}

// Рендерим дерево в HTML
export function renderTree(nodes, container, level = 0) {
    container.innerHTML = '';
    function renderNode(node, indent = 0) {
        const div = document.createElement('div');
        div.style.marginLeft = `${indent * 20}px`;
        div.textContent = `${node.department_name} (${node.user_count})`;
        container.appendChild(div);
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => renderNode(child, indent + 1));
        }
    }
    nodes.forEach(node => renderNode(node));
}

// Собираем все подчинённые департаменты рекурсивно
export function collectSubDepartments(node) {
    let result = [node];
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            result = result.concat(collectSubDepartments(child));
        });
    }
    return result;
}

// Получаем верхние уровни (без родителей)
export function getTopLevelDepartments(tree) {
    return tree;
}