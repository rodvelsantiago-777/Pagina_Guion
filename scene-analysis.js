/* Detección geométrica de encabezados y límites de escena. Sin servicios externos. */
(function (root) {
  "use strict";
  const coverage = typeof module !== "undefined" && module.exports ? require('./coverage-lines.js') : root.PlanoCoverage;
  function linesFromItems(items, viewport, transform) {
    const rows = [];
    for (const item of items) {
      if (!item.str?.trim() || !item.transform) continue;
      const matrix = transform(viewport.transform, item.transform);
      const height = Math.max(1, Math.hypot(matrix[2], matrix[3]));
      const baseline = matrix[5];
      let row = rows.find(candidate => Math.abs(candidate.baseline - baseline) < Math.max(2, height * 0.3));
      if (!row) { row = { baseline, height, items: [] }; rows.push(row); }
      row.items.push({ text: item.str, x: matrix[4], width: item.width * viewport.scale });
      row.height = Math.max(row.height, height);
    }
    return rows.sort((a, b) => a.baseline - b.baseline).map(row => {
      const items = row.items.sort((a, b) => a.x - b.x);
      let text = "";
      let previous = null;
      for (const item of items) {
        const gap = previous ? item.x - previous.x - previous.width : 0;
        text += (previous && gap > 1.5 && !text.endsWith(" ") ? " " : "") + item.text;
        previous = item;
      }
      return { text: text.replace(/\s+/g, " ").trim(), parts: items.map(item => ({ text: item.text.trim(), x: item.x / viewport.width, width: item.width / viewport.width })), x: items[0].x / viewport.width, width: (Math.max(...items.map(item => item.x + item.width)) - items[0].x) / viewport.width, y: Math.max(0, (row.baseline - row.height * 0.9) / viewport.height), height: row.height / viewport.height };
    });
  }
  function isSceneHeading(text) {
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00a0/g, " ").trim();
    const prefix = "(?:(?:ESCENA|SCENE|SECUENCIA)\\s*)?(?:\\d+[A-Z]?(?:[.\\-):]|\\s)+\\s*)?";
    const location = "(?:INT(?:ERIOR(?:ES)?)?|EXT(?:ERIOR(?:ES)?)?)";
    return new RegExp("^" + prefix + "(?:" + location + "(?:\\s*[./\\-]+\\s*" + location + ")?\\.?|I\\s*/\\s*E\\.?)(?:\\s+|[.:\\-]\\s*)\\S", "i").test(normalized);
  }
  function detectScenes(pages) {
    const scenes = [];
    pages.forEach((page, index) => {
      for (const line of page.lines) {
        if (!isSceneHeading(line.text)) continue;
        const parts = (line.parts || []).filter(part => part.text);
        const last = parts.at(-1), previous = parts.at(-2);
        const rightNumber = previous && /^\d+[a-z]?[.)]?$/i.test(last.text) && last.x - previous.x - previous.width > 0.02 ? last : null;
        const titleParts = rightNumber ? parts.slice(0, -1) : parts;
        if (titleParts.length > 1 && /^\d+[a-z]?[.)]?$/i.test(titleParts[0].text)) titleParts.shift();
        const x = titleParts[0]?.x ?? line.x ?? 0;
        const right = titleParts.length ? Math.max(...titleParts.map(part => part.x + part.width)) : x + (line.width || 0);
        scenes.push({ id: `scene-${scenes.length + 1}`, number: scenes.length + 1, title: titleParts.length ? titleParts.map(part => part.text).join(" ") : line.text,
          heading: { x, y: line.y, width: right - x, height: line.height || 0, rightLimit: rightNumber?.x ?? 0.97 },
          start: { page: index + 1, y: Math.max(0, line.y - 0.005) } });
      }
    });
    return scenes.map((scene, index) => ({ ...scene, end: scenes[index + 1]?.start || { page: pages.length, y: 1 } }));
  }
  function segmentsForScene(scene, pageCount) {
    if (!scene) return Array.from({ length: pageCount }, (_, index) => ({ page: index + 1, top: 0, bottom: 1 }));
    const segments = [];
    for (let page = scene.start.page; page <= scene.end.page; page++) {
      const top = page === scene.start.page ? scene.start.y : 0;
      const bottom = page === scene.end.page ? scene.end.y : 1;
      if (bottom - top > 0.001) segments.push({ page, top, bottom });
    }
    return segments;
  }
  function sceneAt(scenes, page, y) {
    return scenes.find(scene => (page > scene.start.page || (page === scene.start.page && y >= scene.start.y)) && (page < scene.end.page || (page === scene.end.page && y < scene.end.y))) || null;
  }
  function segmentsForView(scenes, pageCount, view) {
    if (view === "print") return segmentsForScene(null, pageCount).map(segment => ({ ...segment, id: `page-${segment.page}`, sceneId: null }));
    const selected = scenes.find(scene => scene.id === view);
    if (selected) return segmentsForScene(selected, pageCount).map((segment, index) => ({ ...segment, id: `${selected.id}-${segment.page}`, sceneId: selected.id, first: index === 0 }));
    return scenes.flatMap(scene => segmentsForScene(scene, pageCount).map((segment, index) => ({ ...segment, id: `${scene.id}-${segment.page}`, sceneId: scene.id, first: index === 0 })));
  }
  function pageFurniture(pages) {
    const repeated = new Map();
    const signature = line => line.text.trim().toUpperCase().replace(/\d+/g, "#");
    const peripheral = line => line.y < 0.09 || line.y > 0.91;
    for (const [index, page] of pages.entries()) for (const line of page.lines) {
      if (!peripheral(line) || isSceneHeading(line.text)) continue;
      const key = signature(line);
      if (!repeated.has(key)) repeated.set(key, new Set());
      repeated.get(key).add(index);
    }
    return line => {
      if (isSceneHeading(line.text)) return false;
      const number = /^[-–—]?\s*(?:(?:P[AÁ]G(?:INA)?\.?|PAGE)\s*)?\d+(?:\s*(?:\/|DE|OF)\s*\d+)?\s*[.\-–—]?$/i.test(line.text.trim());
      if (number && (line.y < 0.12 || line.y > 0.88)) return true;
      return peripheral(line) && repeated.get(signature(line))?.size > 1 && (line.text.length > 12 || line.y < 0.045 || line.y > 0.96);
    };
  }
  function workingSegments(scenes, pages, view, annotations = []) {
    const segments = segmentsForView(scenes, pages.length, view);
    if (view === "print") return segments;
    const furniture = pageFurniture(pages);
    return segments.flatMap(segment => {
      const page = pages[segment.page - 1];
      const lines = page.lines.filter(line => !furniture(line) && line.y >= segment.top && line.y < segment.bottom);
      const bounds = lines.map(line => ({ top: line.y - (line.height || 0.014) * 0.15, bottom: line.y + (line.height || 0.014) * 1.4 }));
      for (const item of coverage.onPage(annotations, segment.page)) {
        const top = item.type === "line" ? Math.min(item.start.y, item.end.y) : Math.min(...item.rects.map(rect => rect.y));
        const bottom = item.type === "line" ? Math.max(item.start.y, item.end.y) : Math.max(...item.rects.map(rect => rect.y + rect.height));
        if (bottom >= segment.top && top < segment.bottom) {
          bounds.push({ top: top - 0.006, bottom: bottom + 0.006 });
          if (item.labelPosition && item.labelPosition.y >= segment.top && item.labelPosition.y < segment.bottom) bounds.push({ top: item.labelPosition.y - 0.006, bottom: item.labelPosition.y + 0.055 });
        }
      }
      // Una página de continuación sin texto puede contener imágenes del guion.
      if (!bounds.length) return page.lines.length ? [] : [segment];
      const top = Math.max(segment.top, Math.min(...bounds.map(box => box.top)) - 0.002);
      const bottom = Math.min(segment.bottom, Math.max(...bounds.map(box => box.bottom)) + 0.002);
      return [{ ...segment, sourceTop: segment.top, sourceBottom: segment.bottom, top, bottom }];
    });
  }
  function coverLines(pages, scenes) {
    if (!pages.length) return [];
    const first = scenes[0]?.start;
    if (!first) return [];
    const furniture = pageFurniture(pages);
    return pages[0].lines.filter(line => !furniture(line) && (first.page > 1 || line.y < first.y)).map(line => line.text);
  }
  const api = { linesFromItems, isSceneHeading, detectScenes, segmentsForScene, segmentsForView, workingSegments, coverLines, pageFurniture, sceneAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanoScenes = api;
})(globalThis);
