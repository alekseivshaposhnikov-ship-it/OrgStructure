// src/drawio.js

/**
 * Экспорт организационной структуры в файл .drawio (draw.io/diagrams.net)
 * 
 * Раскладка:
 * - корневой блок (главный отдел) по центру вверху
 * - его дочерние блоки (2-й уровень) — горизонтальным рядом, симметрично центрированным относительно корня
 * - для каждого дочернего блока его подчинённые (3+ уровни) — вертикальным списком под ним
 * 
 * Форматирование блока:
 * - Название отдела (численность) — жирным
 * - Руководитель: ФИО — жирным
 * - пустая строка
 * - список сотрудников (каждый с новой строки)
 *
 * @param {Array} nodes – массив узлов с полями:
 *   department_guid, department_name, staffCount, department_manager, users, parent_department_guid
 */
export function exportToDrawio(nodes) {
    // ---------- helpers ----------
    // Экранирование для XML-атрибутов (кавычки и спецсимволы)
    const escAttr = text =>
        String(text ?? '')
            .replace(/[&<>"]/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;'
            })[ch]);

    // Экранирование для HTML-содержимого (не трогаем <br/>, <b>)
    const escHtml = text =>
        String(text ?? '')
            .replace(/[&<>]/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;'
            })[ch]);

    // ---------- построение дерева из плоского списка ----------
    const nodeMap = {};
    nodes.forEach(n => {
        nodeMap[n.department_guid] = { ...n, children: [] };
    });
    const roots = [];
    Object.values(nodeMap).forEach(node => {
        const parentGuid = node.parent_department_guid || node.parent_guid;
        if (parentGuid && nodeMap[parentGuid]) {
            nodeMap[parentGuid].children.push(node);
        } else {
            roots.push(node);
        }
    });

    // ---------- формирование HTML-метки блока ----------
    const buildLabel = node => {
        const name = escHtml(node.department_name ?? '');
        const count = node.staffCount ?? 0;
        const manager = node.department_manager ? escHtml(node.department_manager) : '';
        const employees = (Array.isArray(node.users) && node.users.length)
            ? node.users.map(u => u.full_name || u.email || '').filter(Boolean).map(escHtml)
            : [];

        let html = `<b>${name} (${count})</b>`;
        if (manager) {
            html += `<br/><b>Руководитель: ${manager}</b>`;
        }
        if (employees.length) {
            html += `<br/><br/>Сотрудники:<br/>${employees.join('<br/>')}`;
        }
        return html;
    };

    // ---------- параметры макета (в пикселях, для draw.io) ----------
    const HORIZONTAL_GAP = 40;      // расстояние между блоками второго уровня
    const VERTICAL_GAP = 30;        // расстояние между блоками по вертикали
    const BLOCK_WIDTH = 220;        // фиксированная ширина блока (для колонок)
    const BASE_BLOCK_HEIGHT = 80;    // базовая высота (будет увеличена под содержимое)
    const ROOT_Y = 40;              // отступ сверху для корневого блока
    const COLUMN_Y = 150;           // Y для блоков второго уровня (ниже корневого)
    const CANVAS_WIDTH = 1200;      // предполагаемая ширина поля (для центрирования)

    // вычисление реальной высоты блока по количеству строк
    function getBlockHeight(node) {
        const html = buildLabel(node);
        // считаем количество <br/> и <br/> + базовые строки
        const lineCount = (html.match(/<br\/>/g) || []).length + 1;
        return Math.max(BASE_BLOCK_HEIGHT, lineCount * 18 + 20);
    }

    // рекурсивное вычисление высоты поддерева (для вертикального позиционирования)
    function computeSubtreeHeight(node) {
        if (!node.children || node.children.length === 0) {
            node.height = getBlockHeight(node);
            node.subtreeHeight = node.height;
            return node.subtreeHeight;
        }
        for (let child of node.children) {
            computeSubtreeHeight(child);
        }
        node.height = getBlockHeight(node);
        let totalChildrenHeight = 0;
        for (let i = 0; i < node.children.length; i++) {
            totalChildrenHeight += node.children[i].subtreeHeight;
            if (i > 0) totalChildrenHeight += VERTICAL_GAP;
        }
        node.subtreeHeight = node.height + totalChildrenHeight;
        return node.subtreeHeight;
    }

    for (let root of roots) {
        computeSubtreeHeight(root);
    }

    // ---------- позиционирование блоков ----------
    // для корневых узлов: центр по горизонтали
    for (let root of roots) {
        root.x = (CANVAS_WIDTH - BLOCK_WIDTH) / 2;
        root.y = ROOT_Y;
    }

    // вертикальное позиционирование подчинённых (начиная с 2-го уровня, но пока все подряд)
    function layoutVertical(node) {
        if (!node.children || node.children.length === 0) return;
        let childY = node.y + node.height + VERTICAL_GAP;
        for (let child of node.children) {
            child.x = node.x;          // сначала наследуем x родителя
            child.y = childY;
            layoutVertical(child);
            childY += child.subtreeHeight + VERTICAL_GAP;
        }
    }

    for (let root of roots) {
        layoutVertical(root);
    }

    // ---------- переопределение позиций для детей второго уровня (горизонтальный ряд, центрированный под корнем) ----------
    for (let root of roots) {
        if (root.children && root.children.length) {
            const children = root.children;
            // общая ширина ряда детей
            const totalChildrenWidth = children.length * BLOCK_WIDTH + (children.length - 1) * HORIZONTAL_GAP;
            // центр корневого блока
            const rootCenterX = root.x + BLOCK_WIDTH / 2;
            // левый край группы детей, чтобы её центр совпал с rootCenterX
            const startX = rootCenterX - totalChildrenWidth / 2;
            let currentX = startX;
            for (let child of children) {
                child.x = currentX;
                child.y = COLUMN_Y;
                // пересчитываем вертикальное расположение для поддерева этого ребёнка (внуки и т.д.),
                // чтобы они наследовали правильный x
                layoutVertical(child);
                currentX += BLOCK_WIDTH + HORIZONTAL_GAP;
            }
        }
    }

    // ---------- генерация XML для draw.io ----------
    const mxfileAttrs = {
        host: "app.diagrams.net",
        modified: new Date().toISOString(),
        agent: "org-structure-viewer",
        etag: "0",
        version: "14.6.13",
        type: "device"
    };
    const mxfileOpen = `<mxfile ${Object.entries(mxfileAttrs)
        .map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
    const diagramOpen = `<diagram name="OrgStructure" id="0">`;
    const graphModelOpen = '<mxGraphModel><root>';
    const graphModelClose = '</root></mxGraphModel>';
    const diagramClose = '</diagram>';
    const mxfileClose = '</mxfile>';

    let idCounter = 2;
    const cells = [
        '<mxCell id="0"/>',
        '<mxCell id="1" parent="0"/>'
    ];

    function addNodeToCells(node, parentId = null) {
        const thisId = `${idCounter++}`;
        const labelHtml = buildLabel(node);
        const value = escAttr(labelHtml);
        const style = "shape=rectangle;whiteSpace=wrap;html=1;rounded=0;strokeColor=#000000;fillColor=#FFFFFF;";
        const x = node.x;
        const y = node.y;
        cells.push(
            `<mxCell id="${thisId}" value="${value}" style="${style}" vertex="1" parent="${parentId ?? 1}">` +
            `<mxGeometry x="${x}" y="${y}" width="${BLOCK_WIDTH}" height="${node.height}" as="geometry"/>` +
            `</mxCell>`
        );
        if (parentId) {
            const edgeId = `${idCounter++}`;
            cells.push(
                `<mxCell id="${edgeId}" value="" edge="1" source="${parentId}" target="${thisId}" parent="1">` +
                `<mxGeometry relative="1" as="geometry"/>` +
                `</mxCell>`
            );
        }
        if (node.children && node.children.length) {
            for (let child of node.children) {
                addNodeToCells(child, thisId);
            }
        }
    }

    for (let root of roots) {
        addNodeToCells(root);
    }

    const xml = [
        mxfileOpen,
        diagramOpen,
        graphModelOpen,
        ...cells,
        graphModelClose,
        diagramClose,
        mxfileClose
    ].join('');

    // скачивание файла
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'org-structure.drawio';
    a.click();
    URL.revokeObjectURL(url);
}