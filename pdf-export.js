/* Exporta sobre el PDF original; el tema y los recortes de trabajo no se imprimen. */
(function () {
  "use strict";
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function color(hex) { return PDFLib.rgb(...[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)); }
  // Espacio de trabajo cartesiano de la página vista (arriba a la derecha es W,H).
  // La inversa del viewport incluye CropBox, rotación y UserUnit del PDF.
  function pageMatrix(viewport) {
    const [a, b, c, d, e, f] = viewport.transform, det = a * d - b * c;
    const inverse = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
    return [inverse[0], inverse[1], -inverse[2], -inverse[3], inverse[2] * viewport.height + inverse[4], inverse[3] * viewport.height + inverse[5]];
  }
  function titleImage(tag) {
    const box = tag.getBoundingClientRect(), button = tag.querySelector(".document-shot-label"), style = getComputedStyle(button);
    const width = Math.ceil(box.width), height = Math.ceil(box.height), canvas = document.createElement("canvas"), density = 3;
    canvas.width = width * density; canvas.height = height * density;
    const ink = canvas.getContext("2d"); ink.scale(density, density);
    ink.fillStyle = tag.style.getPropertyValue("--shot-color"); ink.beginPath(); ink.roundRect(0, 0, width, height, 3); ink.fill();
    ink.font = `700 ${parseFloat(style.fontSize)}px ${style.fontFamily}`; ink.fillStyle = style.color; ink.textBaseline = "alphabetic";
    const stroke = parseFloat(style.webkitTextStrokeWidth) || 0;
    ink.strokeStyle = style.color; ink.lineWidth = stroke; ink.lineJoin = "round";
    const ascent = ink.measureText("Mg").fontBoundingBoxAscent || parseFloat(style.fontSize) * .85;
    const node = button.firstChild, range = document.createRange(), lines = []; let offset = 0;
    // Medir las líneas del DOM conserva los saltos y los nombres Unicode de la interfaz.
    for (const character of node?.textContent || "") {
      range.setStart(node, offset); offset += character.length; range.setEnd(node, offset);
      const rect = range.getBoundingClientRect(); if (!rect.width) continue;
      let line = lines.at(-1);
      if (!line || Math.abs(line.top - rect.top) > 1) { line = { top: rect.top, left: rect.left, text: "" }; lines.push(line); }
      line.text += character;
    }
    for (const line of lines) {
      const x = line.left - box.left, y = line.top - box.top + ascent;
      if (stroke) ink.strokeText(line.text, x, y);
      ink.fillText(line.text, x, y);
    }
    const data = canvas.toDataURL("image/png"); canvas.width = canvas.height = 0;
    return { data, width, height };
  }
  async function preparePage(pdfPage, annotations, scenes, displayName, host) {
    const natural = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 2400 / Math.max(natural.width, natural.height), Math.sqrt(3000000 / (natural.width * natural.height)));
    const viewport = pdfPage.getViewport({ scale }), slot = document.createElement("div"), crop = document.createElement("div"), content = document.createElement("div"), layer = document.createElement("div");
    slot.className = "page-slot"; slot.style.width = `${viewport.width}px`;
    crop.className = "page-window"; content.className = "pdf-page-content"; layer.className = "page-shot-labels";
    for (const element of [crop, content]) { element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`; }
    content.style.setProperty("--scale-factor", viewport.scale); content.style.setProperty("--total-scale-factor", viewport.scale);
    const canvas = document.createElement("canvas"), text = document.createElement("div"); text.className = "textLayer";
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    content.append(canvas, text); crop.append(content); slot.append(crop, layer); host.replaceChildren(slot);
    let textLayer;
    try {
      await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      textLayer = new pdfjsLib.TextLayer({ textContentSource: await pdfPage.getTextContent(), container: text, viewport }); await textLayer.render();
      const context = { viewport, segment: { page: pdfPage.pageNumber, top: 0, bottom: 1 }, content, crop, slot, labelLayer: layer };
      PlanoDocumentLabels.prepare(context);
      PlanoDocumentLabels.draw(context, annotations.filter(item => !item.correction), { scenes, displayName, pageOnly: true, canDrag: () => false, locate: () => {} });
      const labels = context.labelPlacements.map(placement => {
        const tag = Array.from(slot.querySelectorAll(".document-shot-tag")).find(node => node.dataset.annotationId === placement.id);
        return { ...placement, image: titleImage(tag), item: annotations.find(item => item.id === placement.id) };
      });
      return { natural, scale, labels };
    } finally {
      textLayer?.cancel(); canvas.width = canvas.height = 0; host.replaceChildren();
    }
  }
  function drawMarks(target, natural, annotations, scale) {
    const { width, height } = natural;
    const point = p => ({ x: p.x * width, y: (1 - p.y) * height });
    for (const item of annotations.filter(item => item.type === "highlight" && !item.correction)) for (const rect of item.rects) {
      target.drawRectangle({ x: rect.x * width, y: (1 - rect.y - rect.height) * height, width: rect.width * width, height: rect.height * height, color: color(item.color), opacity: .38, blendMode: PDFLib.BlendMode.Multiply });
    }
    for (const item of annotations.filter(item => item.type === "line")) {
      const start = point(item.start), end = point(item.end), dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
      const style = { color: color(item.color), thickness: 3 / scale, lineCap: PDFLib.LineCapStyle.Round };
      target.drawLine({ start, end, ...style });
      const nx = -dy / length * 6 / scale, ny = dx / length * 6 / scale;
      for (const p of [...(item.continuesBefore ? [] : [start]), ...(item.continuesAfter ? [] : [end])]) target.drawLine({ start: { x: p.x - nx, y: p.y - ny }, end: { x: p.x + nx, y: p.y + ny }, ...style });
    }
    for (const item of annotations.filter(item => item.correction)) for (const points of PlanoCorrections.zigzags(item.rects, natural)) {
      for (let index=1;index<points.length;index++) target.drawLine({start:point(points[index-1]),end:point(points[index]),color:color(PlanoCorrections.color),thickness:.9,lineCap:PDFLib.LineCapStyle.Round});
    }
  }
  async function references(document, labels) {
    if (!labels.length) return 0;
    const font = await document.embedFont(PDFLib.StandardFonts.CourierBold), plain = await document.embedFont(PDFLib.StandardFonts.Courier);
    let sheet, y = 0, count = 0;
    for (const label of labels) {
      const factor = Math.min(1 / label.scale, 310 / label.image.width, 120 / label.image.height);
      const width = label.image.width * factor, height = label.image.height * factor, rowHeight = Math.max(height + 18, 38);
      if (!sheet || y - rowHeight < 48) {
        sheet = document.addPage([595.28, 841.89]); count++;
        sheet.drawText("REFERENCIAS DE COBERTURA", { x: 42, y: 792, font, size: 15 });
        sheet.drawText("Nombres sin espacio libre en las paginas originales.", { x: 42, y: 769, font: plain, size: 10 }); y = 732;
      }
      sheet.drawText(`Pagina ${label.page} / ${label.item.type === "line" ? "Linea" : "Resalte"}`, { x: 42, y: y - 13, font: plain, size: 10 });
      sheet.drawImage(await document.embedPng(label.image.data), { x: 205, y: y - height, width, height }); y -= rowHeight;
    }
    return count;
  }
  async function run({ source, pdf, annotations, scenes, displayName, onProgress = () => {} }) {
    const original = new Uint8Array(await source.arrayBuffer());
    if (!annotations.length) return { bytes: original, references: 0 };
    if (!window.PDFLib) throw new Error("No se encontró el motor de exportación local.");
    const document = await PDFLib.PDFDocument.load(original, { updateMetadata: false });
    const host = window.document.createElement("div"); host.className = "pdf-export-workbench"; host.setAttribute("aria-hidden", "true"); window.document.body.append(host);
    const overflow = [], pages = [...new Set(annotations.flatMap(PlanoCoverage.pages))].sort((a, b) => a - b);
    try {
      for (const [index, number] of pages.entries()) {
        onProgress(`Preparando PDF con cobertura… ${index + 1}/${pages.length}`); await pause();
        const items = PlanoCoverage.onPage(annotations, number), rendered = await preparePage(await pdf.getPage(number), items, scenes, displayName, host), target = document.getPage(number - 1);
        target.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(...pageMatrix(rendered.natural)));
        drawMarks(target, rendered.natural, items, rendered.scale);
        for (const label of rendered.labels) {
          if (label.sceneFallback) { overflow.push({ ...label, page: number, scale: rendered.scale }); continue; }
          target.drawImage(await document.embedPng(label.image.data), { x: label.x / rendered.scale, y: rendered.natural.height - (label.y + label.height) / rendered.scale, width: label.image.width / rendered.scale, height: label.image.height / rendered.scale });
        }
        target.pushOperators(PDFLib.popGraphicsState());
      }
      const referenceCount = await references(document, overflow);
      onProgress("Guardando PDF…"); await pause();
      return { bytes: await document.save({ updateFieldAppearances: false }), references: referenceCount };
    } finally { host.remove(); }
  }
  window.PlanoPdfExport = { run };
})();
