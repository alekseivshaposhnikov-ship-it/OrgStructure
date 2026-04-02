// src/drawio.js

/**
 * Экспорт организационной структуры в файл .drawio (draw.io/diagrams.net)
 * Раскладка: корневой блок по центру вверху, его дети — горизонтальными колонками,
 * внутри колонок — вертикальные списки подчинённых блоков.
 * @param {Array} nodes – массив узлов с полями department_guid, department_name,
 *                        staffCount, department_manager, users, parent_department_guid
 */
export function exportToDrawio(nodes) {
    // ---------- helpers ----------
    // Экранирование спецсимволов XML (но не тегов HTML, т.к. будем вставлять <b> и <br/>)
    const escXml = text =>
        String(text ?? '')
            .replace(/[&<>]/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;'
            })[ch]);

    // Экранирование для атрибута value (дополнительно кавычки)
    const escAttr = text =>
        String(text ?? '')
            .replace(/[&<>"]/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;'
            })[ch]);

    // ---------- rebuild hierarchy (flat list → tree) ----------
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

    // ---------- label builder (HTML с форматированием) ----------
    const buildLabel = node => {
        const name = escXml(node.department_name ?? '');
        const count = node.staffCount ?? 0;
        const manager = node.department_manager ? escXml(node.department_manager) : '';
        const employees = Array.isArray(node.users) && node.users.length
            ? node.users.map(u => u.full_name || u.email || '').filter(Boolean).map(escXml)
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
    const HORIZONTAL_GAP = 40;      // расстояние между колонками второго уровня
    const VERTICAL_GAP = 30;        // расстояние между блоками по вертикали
    const BLOCK_WIDTH = 200;        // фиксированная ширина блока (авторазмер не даст красивых колонок)
    const BLOCK_HEIGHT = 80;         // базовая высота (будет расти под текст, но для расчётов используем приблизительную)
    const ROOT_Y = 40;              // отступ сверху для корневого блока
    const COLUMN_Y = 160;           // Y для блоков второго уровня (ниже корневого)

    // Вычисление реальной высоты блока по количеству строк текста (приблизительно)
    function getBlockHeight(node) {
        const label = buildLabel(node);
        const lines = label.split('<br/>').length;
        // Каждая строка ~20px, плюс отступы
        return Math.max(BLOCK_HEIGHT, lines * 18 + 20);
    }

    // ---------- рекурсивное вычисление высоты поддерева ----------
    function computeSubtreeHeight(node) {
        if (!node.children || node.children.length === 0) {
            node.height = getBlockHeight(node);
            node.subtreeHeight = node.height;
            return node.subtreeHeight;
        }
        // Сначала вычисляем высоту детей
        for (let child of node.children) {
            computeSubtreeHeight(child);
        }
        // Высота самого узла
        node.height = getBlockHeight(node);
        // Высота поддерева = высота узла + сумма высот поддеревьев детей + отступы между ними
        let totalChildrenHeight = 0;
        for (let i = 0; i < node.children.length; i++) {
            totalChildrenHeight += node.children[i].subtreeHeight;
            if (i > 0) totalChildrenHeight += VERTICAL_GAP;
        }
        node.subtreeHeight = node.height + totalChildrenHeight;
        return node.subtreeHeight;
    }

    // Применяем к каждому корню
    for (let root of roots) {
        computeSubtreeHeight(root);
    }

    // ---------- рекурсивное позиционирование узлов ----------
    // Для корневого узла: по центру по X, Y = ROOT_Y
    // Для детей второго уровня: горизонтальный ряд, их Y = COLUMN_Y
    // Для внуков и далее: вертикально под своим родителем, X = родитель.X, Y = родитель.Y + родитель.высота + VERTICAL_GAP

    function layoutTree(node, x, y) {
        node.x = x;
        node.y = y;
        if (!node.children || node.children.length === 0) return;

        let childY = y + node.height + VERTICAL_GAP;
        for (let child of node.children) {
            layoutTree(child, x, childY);
            childY += child.subtreeHeight + VERTICAL_GAP;
        }
    }

    // Размещение корней (обычно один корень)
    // Сначала размещаем корни по центру
    const canvasWidth = 1200; // предположительная ширина поля
    for (let root of roots) {
        const rootX = (canvasWidth - BLOCK_WIDTH) / 2;
        layoutTree(root, rootX, ROOT_Y);
    }

    // Теперь размещаем детей второго уровня (если корень имеет детей) – они должны быть в колонках
    // Для каждого корня переопределяем позиции его детей: горизонтальный ряд, центрированный под корнем
    for (let root of roots) {
        if (root.children && root.children.length) {
            const children = root.children;
            const totalWidth = children.length * BLOCK_WIDTH + (children.length - 1) * HORIZONTAL_GAP;
            let startX = root.x + (BLOCK_WIDTH - totalWidth) / 2; // центрируем под корнем
            if (startX < 20) startX = 20; // защита от вылета за левый край
            let currentX = startX;
            for (let child of children) {
                child.x = currentX;
                child.y = COLUMN_Y;
                // Для внуков (и далее) уже вызвано layoutTree, но они получили x = child.x из рекурсивного вызова выше,
                // который использовал x родителя. Надо пересчитать для внуков, чтобы они были под своим родителем с тем же x.
                // Перевызовем layoutTree для поддерева каждого ребёнка, чтобы зафиксировать правильный x.
                layoutTree(child, child.x, child.y);
                currentX += BLOCK_WIDTH + HORIZONTAL_GAP;
            }
        }
    }

    // ---------- XML generation ----------
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

    // Функция для добавления всех узлов (обход дерева)
    function addNodeToCells(node, parentId = null) {
        const thisId = `${idCounter++}`;
        const labelHtml = buildLabel(node);
        // Важно: значение должно быть экранировано для XML, но внутри могут быть HTML-теги.
        // В draw.io value с HTML работает, если в стиле есть html=1.
        const value = escAttr(labelHtml);
        const style = "shape=rectangle;whiteSpace=wrap;html=1;rounded=0;strokeColor=#000000;fillColor=#FFFFFF;";
        // Координаты уже рассчитаны
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
        if (node.children) {
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

    // Download
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'org-structure.drawio';
    a.click();
    URL.revokeObjectURL(url);
}