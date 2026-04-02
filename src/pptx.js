// src/pptx.js
import PptxGenJS from "pptxgenjs";

/**
 * Экспорт организационной структуры в PowerPoint.
 * Раскладка:
 * - главный блок по центру вверху
 * - его дети (2-й уровень) – горизонтальными колонками (автоматическое масштабирование при переполнении)
 * - подчинённые блоки (3+ уровень) – вертикальными списками внутри своих колонок
 * @param {Array} nodes – массив корневых узлов (используется первый как главный)
 */
export function exportToPptx(nodes) {
    if (!nodes || nodes.length === 0) {
        alert("Нет данных для экспорта!");
        return;
    }

    // Параметры макета (в дюймах)
    const FONT_SIZE = 8;
    const LINE_HEIGHT = 0.18;        // высота строки шрифта 8pt
    const VERTICAL_GAP = 0.25;       // вертикальный отступ между блоками
    const HORIZONTAL_GAP = 0.3;      // горизонтальный отступ между колонками
    const MIN_BOX_WIDTH = 2.2;
    const MIN_BOX_HEIGHT = 0.6;
    const MARGIN = 0.08;             // внутренние отступы текста
    const SLIDE_WIDTH = 10;          // стандартная ширина слайда (дюймы)
    const TOP_MARGIN = 0.5;          // отступ сверху для главного блока
    const SIDE_MARGIN = 0.25;        // минимальный отступ по бокам слайда

    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();

    // 1. Подготовка данных: расчёт реальных размеров блоков по содержимому
    function prepareNode(node) {
        const employeeLines = (node.users && node.users.length > 0)
            ? node.users.map(u => u.name || u.email || "").filter(Boolean)
            : [];
        const textLines = [
            `${node.department_name} (${node.staffCount || 0})`,
            `Руководитель: ${node.department_manager || "—"}`,
            ...employeeLines
        ];
        const maxLineLength = Math.max(...textLines.map(line => line.length), 10);
        const charWidth = 0.06;   // эмпирическая ширина символа шрифта 8pt
        let calculatedWidth = Math.max(MIN_BOX_WIDTH, maxLineLength * charWidth + MARGIN * 2);
        const calculatedHeight = Math.max(MIN_BOX_HEIGHT, textLines.length * LINE_HEIGHT + MARGIN * 2);
        return {
            ...node,
            textLines,
            width: calculatedWidth,
            height: calculatedHeight,
            children: (node.children || []).map(child => prepareNode(child))
        };
    }

    // Берём первый корневой узел как главный блок
    const root = prepareNode(nodes[0]);

    // 2. Рекурсивное вычисление высоты поддерева для вертикальной раскладки
    function computeSubtreeHeight(node) {
        if (!node.children || node.children.length === 0) {
            node.subtreeHeight = node.height;
            return node.height;
        }
        let totalChildrenHeight = 0;
        for (let i = 0; i < node.children.length; i++) {
            computeSubtreeHeight(node.children[i]);
            totalChildrenHeight += node.children[i].subtreeHeight;
            if (i > 0) totalChildrenHeight += VERTICAL_GAP;
        }
        node.subtreeHeight = node.height + totalChildrenHeight;
        return node.subtreeHeight;
    }
    computeSubtreeHeight(root);

    // 3. Размещение главного блока по центру вверху
    const rootX = (SLIDE_WIDTH - root.width) / 2;
    const rootY = TOP_MARGIN;
    root.x = rootX;
    root.y = rootY;

    // 4. Горизонтальное размещение блоков второго уровня (детей главного) с масштабированием
    const secondLevel = root.children || [];
    const secondLevelCount = secondLevel.length;
    if (secondLevelCount > 0) {
        // Доступная ширина для всех колонок (с учётом отступов по краям)
        const availableWidth = SLIDE_WIDTH - 2 * SIDE_MARGIN;
        
        // Сначала рассчитаем общую ширину при исходных размерах
        let totalOriginalWidth = secondLevel.reduce((sum, child) => sum + child.width, 0) +
                                 (secondLevelCount - 1) * HORIZONTAL_GAP;
        
        let scaleFactor = 1.0;
        if (totalOriginalWidth > availableWidth) {
            scaleFactor = availableWidth / totalOriginalWidth;
            // Масштабируем ширину каждого блока второго уровня
            for (let child of secondLevel) {
                child.width = child.width * scaleFactor;
                // Важно: ширина должна оставаться не меньше минимальной (но scaleFactor может сделать её меньше MIN_BOX_WIDTH – допускаем)
            }
        }
        
        // Пересчитываем общую ширину с учётом масштабирования
        let totalWidth = secondLevel.reduce((sum, child) => sum + child.width, 0) +
                         (secondLevelCount - 1) * HORIZONTAL_GAP;
        let startX = (SLIDE_WIDTH - totalWidth) / 2;
        let currentX = startX;
        const baseY = rootY + root.height + VERTICAL_GAP;
        
        for (let child of secondLevel) {
            child.x = currentX;
            child.y = baseY;
            currentX += child.width + HORIZONTAL_GAP;
        }
    }

    // 5. Вертикальное размещение всех потомков (3+ уровень) под своими родителями
    function placeChildrenVertically(node) {
        if (!node.children || node.children.length === 0) return;
        let childY = node.y + node.height + VERTICAL_GAP;
        for (let child of node.children) {
            child.y = childY;
            placeChildrenVertically(child);
            childY += child.subtreeHeight + VERTICAL_GAP;
        }
    }
    for (let child of secondLevel) {
        placeChildrenVertically(child);
    }

    // 6. Отрисовка всех блоков (белый фон + синяя рамка)
    const rendered = new Set();
    function drawNode(node) {
        if (rendered.has(node.department_guid)) return;
        rendered.add(node.department_guid);
        
        slide.addText(node.textLines.join("\n"), {
            x: node.x,
            y: node.y,
            w: node.width,
            h: node.height,
            fontSize: FONT_SIZE,
            align: "center",
            valign: "middle",
            margin: MARGIN,
            fill: { color: "FFFFFF" },          // белый фон
            border: { pt: 1, color: "0000FF" }  // синяя рамка
        });
        
        if (node.children) {
            for (let child of node.children) {
                drawNode(child);
            }
        }
    }
    
    drawNode(root);
    
    // Сохраняем презентацию
    pptx.writeFile({ fileName: "organization_structure.pptx" });
}