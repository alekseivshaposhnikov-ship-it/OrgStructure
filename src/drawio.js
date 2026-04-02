// src/drawio.js

/**
 * Экспорт организационной структуры в файл .drawio (draw.io/diagrams.net)
 * @param {Array} nodes – массив узлов с полями department_guid, department_name,
 *                        staffCount, department_manager, users, parent_department_guid
 */
export function exportToDrawio(nodes) {
    // ---------- helpers ----------
    // Экранирование спецсимволов XML и переводов строк
    const esc = text =>
        String(text ?? '')
            .replace(/[&<>"\n]/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                '\n': '&#10;'
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

    // ---------- label builder ----------
    const buildLabel = node => {
        const lines = [];

        // 1️⃣ Department name + staff count
        const name = node.department_name ?? '';
        const count = node.staffCount ?? 0;
        lines.push(`${name} (${count})`);

        // 2️⃣ Manager (if any)
        if (node.department_manager) {
            lines.push(`Руководитель: ${node.department_manager}`);
        }

        // 3️⃣ Employees list (full name → email fallback)
        if (Array.isArray(node.users) && node.users.length) {
            const empLines = node.users
                .map(u => u.full_name || u.email || '')
                .filter(Boolean);
            if (empLines.length) {
                lines.push('Сотрудники:');
                lines.push(empLines.join('\n'));
            }
        }

        return lines.join('\n');
    };

    // ---------- XML assembly ----------
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

    // ---------- recursive XML generation ----------
    let idCounter = 2;   // 0 и 1 зарезервированы
    // Обязательные ячейки (корневой слой и слой по умолчанию)
    const cells = [
        '<mxCell id="0"/>',
        '<mxCell id="1" parent="0"/>'
    ];

    // Простая вертикальная раскладка (каждый узел – новая строка)
    let yCounter = 0;

    /**
     * Добавляет узел и его потомков в массив ячеек.
     * @param {Object} node       узел дерева
     * @param {number} depth      глубина (смещение по X)
     * @param {string|null} parentId  ID родительской вершины (null для корня)
     */
    function addNode(node, depth = 0, parentId = null) {
        const thisId = `${idCounter++}`;
        const label = esc(buildLabel(node));
        const style = "shape=rectangle;whiteSpace=wrap;html=1;rounded=0;strokeColor=#000000;fillColor=#FFFFFF;autosize=1";
        const x = depth * 250;   // горизонтальное смещение
        const y = yCounter * 120; // вертикальный шаг
        yCounter++;

        // Вершина (прямоугольник)
        cells.push(
            `<mxCell id="${thisId}" value="${label}" style="${style}" vertex="1" parent="${parentId ?? 1}">` +
            `<mxGeometry x="${x}" y="${y}" width="0" height="0" as="geometry"/>` +
            `</mxCell>`
        );

        // Ребро (соединительная линия) – если есть родитель
        if (parentId) {
            const edgeId = `${idCounter++}`;
            cells.push(
                `<mxCell id="${edgeId}" value="" edge="1" source="${parentId}" target="${thisId}" parent="1">` +
                `<mxGeometry relative="1" as="geometry"/>` +
                `</mxCell>`
            );
        }

        // Рекурсивно обрабатываем детей
        if (node.children && node.children.length) {
            node.children.forEach(child => addNode(child, depth + 1, thisId));
        }
    }

    // Обрабатываем все корневые узлы
    roots.forEach(root => addNode(root));

    // ---------- финальный XML ----------
    const xml = [
        mxfileOpen,
        diagramOpen,
        graphModelOpen,
        ...cells,
        graphModelClose,
        diagramClose,
        mxfileClose
    ].join('');

    // ---------- триггер скачивания ----------
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'org-structure.drawio';
    a.click();
    URL.revokeObjectURL(url);
}