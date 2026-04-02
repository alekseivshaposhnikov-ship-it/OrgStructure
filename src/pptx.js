// src/pptx.js
import PptxGenJS from "pptxgenjs";

/**
 * Экспорт иерархии в один PPTX‑слайд.
 * Каждый блок показывает:
 *   - название отдела + численность в скобках,
 *   - руководитель,
 *   - соединительные стрелки к дочерним подразделениям.
 *
 * @param {Array} nodes – массив корневых узлов (может включать поддеревья)
 */
export function exportToPptx(nodes) {
    if (!nodes || nodes.length === 0) {
        alert("Нет данных для экспорта!");
        return;
    }

    console.log(nodes);

    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    // Заголовок
    slide.addText("Организационная структура", {
        x: 0.5,
        y: 0.25,
        fontSize: 20,
        bold: true,
    });

    // Параметры блоков (уменьшены, чтобы у Juventus всё поместилось)
    const boxWidth = 2.5;   // ширина прямоугольника
    const boxHeight = 0.5;  // высота прямоугольника
    const horizontalSpacing = 0.15625;
    const startXOffset = 0.5;        // базовый отступ слева

    let yPos = 1.0; // текущая вертикальная позиция

    // Set, чтобы каждый department_guid отрисовывался лишь один раз
    const rendered = new Set();

    /**
     * Рекурсивно отрисовывает узел и его потомков.
     * @param {Object} node   – текущий узел дерева
     * @param {number} level  – глубина вложенности (0 для корня)
     * @param {number} xOffset – текущий горизонтальный отступ
     */
    function renderNode(node, level = 0, xOffset = startXOffset) {
        // Защита от дублирования
        if (rendered.has(node.department_guid)) return;
        rendered.add(node.department_guid);

        // Вычисляем координаты блока
        const xPos = xOffset + level * (boxWidth + horizontalSpacing);
        const yCurrent = yPos;
        yPos += boxHeight + 0.2; // небольшое расстояние между блоками

        // Текст внутри блока: название, численность, руководитель, сотрудники
        const employeeLines = (node.users && node.users.length > 0)
            ? node.users.map(u => u.name || u.email || "").join("\n")
            : "";
        const textLines = [
            `${node.department_name} (${node.staffCount || 0})`,
            `Руководитель: ${node.department_manager || "—"}`,
            employeeLines
        ].filter(Boolean);

        // Сам блок – без заливки, обычный шрифт 8pt, без жирного начертания
        slide.addText(textLines.join("\n"), {
            x: xPos,
            y: yCurrent,
            w: boxWidth,
            h: boxHeight,
            fontSize: 8,
            bold: false,
            align: "center",
            valign: "middle",
            // fill omitted – прозрачный фон
            border: { pt: 1, color: "000000" },
        });

        // Рекурсивно обрабатываем детей, если они есть
        if (Array.isArray(node.children) && node.children.length) {
            node.children.forEach(child => {
                renderNode(child, level + 1, xOffset);
            });
        }
    }

    // Запускаем рендеринг всех корневых узлов
    nodes.forEach(root => renderNode(root));

    // Сохраняем файл
    pptx.writeFile({ fileName: "organization_structure.pptx" });
}

