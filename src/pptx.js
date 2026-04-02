// src/pptx.js
import PptxGenJS from "pptxgenjs";

/**
 * Экспортирует выбранные департаменты в PPTX
 * @param {Array} nodes - массив департаментов (TreeNode)
 */
export function exportToPptx(nodes) {
    if (!nodes || nodes.length === 0) {
        alert("Нет данных для экспорта!");
        return;
    }

    console.log(nodes);

    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    slide.addText("Организационная структура", {
        x: 0.5,
        y: 0.25,
        fontSize: 24,
        bold: true,
    });

    // Параметры для рендеринга прямоугольников
    const boxWidth = 3.5;
    const boxHeight = 0.7;
    const verticalSpacing = 1;
    const horizontalSpacing = 0.3;

    let yPos = 1.0;

     // Keep track of already rendered department GUIDs to avoid duplicates
     const rendered = new Set();

    function renderNode(node, level = 0, xOffset = 0.5) {
         // Skip if this department has already been rendered (duplicate prevention)
         if (rendered.has(node.department_guid)) return;
         rendered.add(node.department_guid);

        const xPos = xOffset + level * (boxWidth + horizontalSpacing);

        // Отображаем только название и руководителя
        const textLines = [`${node.department_name}`, `Руководитель: ${node.department_manager || "—"}`];

        slide.addText(textLines.join("\n"), {
            x: xPos,
            y: yPos,
            w: boxWidth,
            h: boxHeight,
            fontSize: 12,
            bold: true,
            align: "center",
            valign: "middle",
            fill: { color: "BFDFFF" },
            border: { pt: 1, color: "000000" },
        });

        yPos += boxHeight + 0.2; // небольшой отступ после каждого блока

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => renderNode(child, level + 1, xOffset));
        }
    }

    nodes.forEach(node => renderNode(node));

    pptx.writeFile({ fileName: "OrgStructure.pptx" });
}