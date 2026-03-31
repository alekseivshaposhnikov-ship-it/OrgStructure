import PptxGenJS from "pptxgenjs";

export function exportPPTX(nodes) {
  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  let y = 0;

  function draw(node, depth = 0) {
    slide.addShape(pptx.ShapeType.rect, {
      x: depth * 2.5,
      y: y,
      w: 2.5,
      h: 1,
      fill: { color: "F1F1F1" },
      line: { color: "999999" },
      text: `${node.department_name}\n${node.department_manager || ""}`,
      fontSize: 10
    });

    y += 1.2;

    node.children?.forEach(child => draw(child, depth + 1));
  }

  nodes.forEach(n => draw(n));

  pptx.writeFile("org-structure.pptx");
}