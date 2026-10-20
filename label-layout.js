/* Colocación de rótulos en píxeles del visor. Nunca se acepta una colisión. */
(function (root) {
  "use strict";
  function intersects(a, b, gap = 0) {
    return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  }
  function lineIntersects(rect, line, padding = 5) {
    const box = { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
    let low = 0, high = 1;
    const dx = line.end.x - line.start.x, dy = line.end.y - line.start.y;
    for (const [p, q] of [[-dx, line.start.x - box.x], [dx, box.x + box.width - line.start.x], [-dy, line.start.y - box.y], [dy, box.y + box.height - line.start.y]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) low = Math.max(low, t); else high = Math.min(high, t);
      if (low > high) return false;
    }
    return true;
  }
  function isClear(rect, { width, top, bottom, contentTop = top, contentBottom = bottom, allowExternal = true, textBoxes = [], shapes = [], inkBlocked = () => false }, occupied = [], allowMargin = false) {
    if (rect.x < 6 || rect.y < top + 5 || rect.y + rect.height > bottom - 5) return false;
    const inPaper = rect.x + rect.width <= width - 6;
    if (!inPaper && (!allowExternal || !allowMargin || rect.x < width + 18 || rect.x + rect.width > width * 4)) return false;
    const visibleTop = Math.max(rect.y, contentTop), visibleBottom = Math.min(rect.y + rect.height, contentBottom);
    const visible = visibleBottom > visibleTop ? { x: rect.x, y: visibleTop, width: rect.width, height: visibleBottom - visibleTop } : null;
    const clearContent = !visible || (!textBoxes.some(box => intersects(visible, box, 4) && box.y < contentBottom && box.y + box.height > contentTop) && !shapes.some(shape => shape.type === "line" ? lineIntersects(visible, shape) : intersects(visible, shape, 6)) && (!inPaper || !inkBlocked({ x: visible.x - 3, y: Math.max(contentTop, visible.y - 3), width: visible.width + 6, height: Math.min(contentBottom, visible.y + visible.height + 3) - Math.max(contentTop, visible.y - 3) })));
    return clearContent && !occupied.some(label => !label.sceneFallback && intersects(rect, label, 9));
  }
  function lineLabelRect(label, t, side = "right") {
    const { start, end } = label.line;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
    const nx = dy / length, ny = -dx / length, sign = side === "left" ? -1 : 1;
    const distance = Math.abs(nx) * label.width / 2 + Math.abs(ny) * label.height / 2 + 13;
    return { x: start.x + dx * t + sign * nx * distance - label.width / 2, y: start.y + dy * t + sign * ny * distance - label.height / 2, width: label.width, height: label.height, lineT: t, lineSide: side };
  }
  function constrainedLineLabel(label, center) {
    const { start, end } = label.line, dx = end.x - start.x, dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, ((center.x - start.x) * dx + (center.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
    const side = (center.x - start.x) * dy - (center.y - start.y) * dx >= 0 ? "right" : "left";
    return lineLabelRect(label, t, side);
  }
  function placeLabels(options) {
    const { width, top, labels, inlineAllowed = true } = options;
    const placements = [], remaining = [];
    // Las líneas reservan su espacio antes incluso de los títulos manuales de resaltes.
    for (const label of labels.filter(label => label.type === "line" && label.line)) {
      const preferred = label.lineLabel || { t: 0, side: "right" };
      const positions = [preferred, { t: preferred.t, side: preferred.side === "right" ? "left" : "right" }];
      const length = Math.hypot(label.line.end.x - label.line.start.x, label.line.end.y - label.line.start.y);
      const steps = Math.max(1, Math.ceil(length / 8));
      const ts = Array.from({ length: steps + 1 }, (_, i) => i / steps).sort((a, b) => Math.abs(a - preferred.t) - Math.abs(b - preferred.t));
      for (const t of ts) for (const side of [preferred.side, preferred.side === "right" ? "left" : "right"]) positions.push({ t, side });
      const safe = positions.map(({ t, side }) => lineLabelRect(label, t, side)).find(rect => isClear(rect, options, placements, true));
      if (safe) placements.push({ ...safe, id: label.id, type: "line", manual: Boolean(label.lineLabel && Math.abs(safe.lineT - preferred.t) < 1e-6 && safe.lineSide === preferred.side), tier: "line", external: safe.x > width });
      else placements.push({ id: label.id, type: "line", width: label.width, height: label.height, external: true, sceneFallback: true, sceneId: label.sceneId || "intro", x: 0, y: top - label.height - 12 });
    }
    for (const label of labels.filter(label => label.type !== "line" || !label.line)) {
      const manual = label.manual && { ...label.manual, width: label.width, height: label.height };
      if (manual && isClear(manual, { ...options, ...options.manualBounds }, placements, true)) placements.push({ ...manual, id: label.id, manual: true, external: manual.x > width });
      else remaining.push(label);
    }
    for (const label of remaining) {
      const { anchor: a, width: w, height: h } = label;
      const beside = [
        { x: a.x + a.width + 13, y: a.y + (a.height - h) / 2 },
        { x: a.x - w - 13, y: a.y + (a.height - h) / 2 }
      ];
      // Los grupos se evalúan por orden, sin mezclar prioridades por distancia.
      const tiers = [{ name: "side", points: beside }];
      if (label.type === "line") {
        tiers.push({ name: "start", points: beside.flatMap(p => [-h / 2, h / 2].map(dy => ({ x: p.x, y: p.y + dy }))) });
      } else {
        tiers.push({ name: "above-below", points: [a.y - h - 10, a.y + a.height + 10].flatMap(y => [a.x + (a.width - w) / 2, a.x, a.x + a.width - w].map(x => ({ x, y }))) });
      }
      if (label.sceneAnchor) {
        const s = label.sceneAnchor;
        const size = label.headingSize || { width: w, height: h };
        const left = s.x + s.width + 10, right = Math.min(width - 8, (s.rightLimit ?? width) - 8);
        const points = [];
        // Exclusivamente el blanco DESPUÉS del texto del encabezado y ANTES del número derecho.
        for (let x = left; x + size.width <= right; x += 10) points.push({ x, y: s.y + (s.height - size.height) / 2, ...size });
        tiers.push({ name: "heading", points });
      }
      let safe;
      if (inlineAllowed) for (const tier of tiers) {
        const point = tier.points.map(p => ({ width: w, height: h, ...p })).find(rect => isClear(rect, options, placements));
        if (point) { safe = { ...point, tier: tier.name }; break; }
      }
      if (safe) placements.push({ ...safe, id: label.id, external: false });
      else placements.push({ id: label.id, width: w, height: h, external: true, sceneFallback: true, sceneId: label.sceneId || "intro", x: 0, y: top - h - 12 });
    }
    return placements;
  }
  const api = { intersects, lineIntersects, isClear, placeLabels, lineLabelRect, constrainedLineLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanoLabels = api;
})(globalThis);
