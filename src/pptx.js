// src/pptx.js
// ------------------------------------------------------------
// Экспорт организационной структуры в PowerPoint (pptxgenjs)
// ------------------------------------------------------------

import PptxGenJS from "pptxgenjs";

/**
 * Экспорт организационной структуры в PowerPoint.
 *
 * Раскладка:
 *   • Главный блок – центр‑верх.
 *   • Дети первого уровня – горизонтальные колонки (масштабируются при переполнении).
 *   • Все остальные уровни – вертикальные списки внутри своих колонок.
 *
 * @param {Array} nodes – массив корневых узлов (используется первый как главный).
 */
export async function exportToPptx(nodes) {
    // -----------------------------------------------------------------
    // 0. Защита от пустого входа
    // -----------------------------------------------------------------
    if (!nodes || nodes.length === 0) {
        alert("Нет данных для экспорта!");
        return;
    }

    // -----------------------------------------------------------------
    // 1. Параметры макета (в дюймах)
    // -----------------------------------------------------------------
    const FONT_SIZE      = 8;   // pt
    const LINE_HEIGHT    = 0.18; // дюйм (≈ 8 pt)
    const VERTICAL_GAP   = 0.25;
    const HORIZONTAL_GAP = 0.30;
    const MIN_BOX_WIDTH  = 2.20;
    const MIN_BOX_HEIGHT = 0.60;
    const MARGIN         = 0.08; // внутренний отступ текста
    const SLIDE_WIDTH    = 10;   // дюймы (стандартный размер 16:9 ≈ 10×5.63)
    const TOP_MARGIN     = 0.50;
    const SIDE_MARGIN    = 0.25;

    // -----------------------------------------------------------------
    // 2. Создаём презентацию и первый слайд
    // -----------------------------------------------------------------
    // В некоторых сборщиках `pptxgenjs` экспортируется как default‑object,
    // а в других – как именованный. Чтобы работать в любой среде,
    // берём либо default, либо сам объект.
    const Pptx = PptxGenJS?.default ?? PptxGenJS;
    const pptx = new Pptx();
    const slide = pptx.addSlide();

    // -----------------------------------------------------------------
    // 3. Подготовка узлов: расчёт размеров блока по содержимому
    // -----------------------------------------------------------------
    function prepareNode(node) {
        const employeeLines = (node.users && node.users.length)
            ? node.users
                .map(u => u.name || u.fullName || u.email || "")
                .filter(Boolean)
            : [];

        const textLines = [
            `${node.department_name} (${node.staffCount ?? 0})`,
            `Руководитель: ${node.department_manager ?? "—"}`,
            ...employeeLines,
        ];

        const maxLineLength = Math.max(
            ...textLines.map(l => l.length),
            10
        );

        // Приблизительная ширина одного символа шрифта 8 pt в дюймах
        const CHAR_WIDTH = 0.06;

        const width  = Math.max(
            MIN_BOX_WIDTH,
            maxLineLength * CHAR_WIDTH + MARGIN * 2
        );

        const height = Math.max(
            MIN_BOX_HEIGHT,
            textLines.length * LINE_HEIGHT + MARGIN * 2
        );

        return {
            ...node,
            textLines,
            width,
            height,
            // рекурсивно подготовим детей
            children: (node.children ?? []).map(prepareNode),
        };
    }

    // Берём первый корневой узел как главный блок
    const root = prepareNode(nodes[0]);

    // -----------------------------------------------------------------
    // 4. Вычисляем высоту поддерева (необходима для вертикального расположения)
    // -----------------------------------------------------------------
    function computeSubtreeHeight(node) {
        if (!node.children || node.children.length === 0) {
            node.subtreeHeight = node.height;
            return node.subtreeHeight;
        }

        let total = node.height;
        node.children.forEach((child, idx) => {
            computeSubtreeHeight(child);
            total += child.subtreeHeight;
            if (idx > 0) total += VERTICAL_GAP;
        });
        node.subtreeHeight = total;
        return total;
    }
    computeSubtreeHeight(root);

    // -----------------------------------------------------------------
    // 5. Размещение главного блока (центр‑верх)
    // -----------------------------------------------------------------
    root.x = (SLIDE_WIDTH - root.width) / 2;
    root.y = TOP_MARGIN;

    // -----------------------------------------------------------------
    // 6. Горизонтальное размещение блоков второго уровня (масштабируем, если не помещаются)
    // -----------------------------------------------------------------
    const secondLevel = root.children ?? [];
    if (secondLevel.length) {
        const availableWidth = SLIDE_WIDTH - 2 * SIDE_MARGIN;
        const originalTotalWidth =
            secondLevel.reduce((s, n) => s + n.width, 0) +
            (secondLevel.length - 1) * HORIZONTAL_GAP;

        let scale = 1;
        if (originalTotalWidth > availableWidth) {
            scale = availableWidth / originalTotalWidth;
            // Масштабируем ширину, но не допускаем падения ниже минимального значения
            secondLevel.forEach(child => {
                child.width = Math.max(child.width * scale, MIN_BOX_WIDTH);
            });
        }

        const totalWidth =
            secondLevel.reduce((s, n) => s + n.width, 0) +
            (secondLevel.length - 1) * HORIZONTAL_GAP;

        let curX = (SLIDE_WIDTH - totalWidth) / 2;
        const baseY = root.y + root.height + VERTICAL_GAP;

        secondLevel.forEach(child => {
            child.x = curX;
            child.y = baseY;
            curX += child.width + HORIZONTAL_GAP;
        });
    }

    // -----------------------------------------------------------------
    // 7. Вертикальное размещение всех «глубоких» потомков (уровень 3+)
    // -----------------------------------------------------------------
    function placeChildrenVertically(node) {
        if (!node.children || node.children.length === 0) return;

        let curY = node.y + node.height + VERTICAL_GAP;
        node.children.forEach(child => {
            child.x = node.x;                 // выравниваем по левому краю родителя
            child.y = curY;
            placeChildrenVertically(child);   // рекурсивно размещаем их детей
            curY += child.subtreeHeight + VERTICAL_GAP;
        });
    }

    secondLevel.forEach(placeChildrenVertically);

    // -----------------------------------------------------------------
    // 8. Рисуем все блоки (белый фон, синяя рамка)
    // -----------------------------------------------------------------
    const drawn = new Set(); // защита от двойного рисования

    function drawNode(node) {
        if (drawn.has(node.department_guid)) return;
        drawn.add(node.department_guid);

        slide.addText(node.textLines.join("\n"), {
            x: node.x,
            y: node.y,
            w: node.width,
            h: node.height,
            fontSize: FONT_SIZE,
            align: "center",
            valign: "middle",
            margin: { left: MARGIN, top: MARGIN, right: MARGIN, bottom: MARGIN },
            fill: { color: "FFFFFF" },               // белый фон
            border: { pt: 1, color: "0000FF" },      // синяя рамка
        });

        (node.children ?? []).forEach(drawNode);
    }

    drawNode(root);

    // -----------------------------------------------------------------
    // 9. Сохраняем файл (возвращаем промис, чтобы вызывающий код мог ждать)
    // -----------------------------------------------------------------
    try {
        await pptx.writeFile({ fileName: "organization_structure.pptx" });
        console.log("PPTX успешно сохранён");
    } catch (err) {
        console.error("Ошибка при сохранении PPTX:", err);
        alert("Не удалось сохранить презентацию. Смотрите консоль для деталей.");
    }
}