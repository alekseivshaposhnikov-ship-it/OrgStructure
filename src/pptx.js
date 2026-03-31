import PptxGenJS from "pptxgenjs";

export function exportToPptx(nodes) {
    const pptx = new PptxGenJS();

    nodes.forEach(node => {
        const slide = pptx.addSlide();
        slide.addText(`${node.department_name} (${node.user_count})`, { x:0.5, y:0.5, fontSize:18, bold:true });
        if (node.department_manager) {
            slide.addText(`Руководитель: ${node.department_manager}`, { x:0.5, y:1, fontSize:14 });
        }
        if (node.jobtitles && node.jobtitles.length > 0) {
            slide.addText(`Должности: ${node.jobtitles.join(', ')}`, { x:0.5, y:1.5, fontSize:12 });
        }
    });

    pptx.writeFile({ fileName: "OrgStructure.pptx" });
}