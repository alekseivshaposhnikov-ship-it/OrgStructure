export function addLevels(nodes, level = 0) {
  nodes.forEach(n => {
    n.level = level;
    if (n.children) {
      addLevels(n.children, level + 1);
    }
  });
}