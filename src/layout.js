export function addLevels(nodes, level = 0) {
  nodes.forEach(n => {
    n.level = level;
    if (n.children) {
      addLevels(n.children, level + 1);
    }
  });
}

export function flattenTree(nodes, result = []) {
  nodes.forEach(n => {
    result.push(n);
    if (n.children) flattenTree(n.children, result);
  });
  return result;
}