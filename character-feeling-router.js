/* Carriles ortogonales con esquinas suaves. La cámara no modifica los recorridos. */
(function (root) {
  'use strict';
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const bounds = (a, b, pad = 0) => ({ left: Math.min(a.x, b.x) - pad, right: Math.max(a.x, b.x) + pad,
    top: Math.min(a.y, b.y) - pad, bottom: Math.max(a.y, b.y) + pad });
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function intersects(a, b, c, d) {
    return overlaps(bounds(a, b, .01), bounds(c, d, .01)) && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
  }
  function through(a, b, box) {
    if (!overlaps(bounds(a, b, .1), box)) return false;
    const inside = p => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
    if (inside(a) || inside(b)) return true;
    const corners = [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }];
    return corners.some((point, index) => intersects(a, b, point, corners[(index + 1) % 4]));
  }
  function simplify(points) {
    const result = [];
    for (const p of points) {
      if (result.length && distance(result[result.length - 1], p) < .1) continue;
      while (result.length > 1 && Math.abs(cross(result[result.length - 2], result[result.length - 1], p)) < .01) result.pop();
      if (!result.length || distance(result[result.length - 1], p) >= .1) result.push(p);
    }
    return result;
  }
  function rounded(points) {
    let path = 'M' + points[0].x + ' ' + points[0].y;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], p = points[i], b = points[i + 1], before = distance(a, p), after = distance(p, b);
      const radius = Math.min(12, before / 2, after / 2);
      const start = { x: p.x + (a.x - p.x) * radius / before, y: p.y + (a.y - p.y) * radius / before };
      const end = { x: p.x + (b.x - p.x) * radius / after, y: p.y + (b.y - p.y) * radius / after };
      path += 'L' + start.x + ' ' + start.y + 'Q' + p.x + ' ' + p.y + ' ' + end.x + ' ' + end.y;
    }
    const end = points[points.length - 1];
    return path + 'L' + end.x + ' ' + end.y;
  }
  function nodeBoxes(positions) {
    const result = [];
    for (const [id, at] of positions) {
      result.push({ id, kind: 'avatar', left: at.x - 57, right: at.x + 57, top: at.y - 56, bottom: at.y + 43 });
      result.push({ id, kind: 'name', left: at.x - 88, right: at.x + 88, top: at.y + 42, bottom: at.y + 126 });
      result.push({ id, kind: 'control', left: at.x - 20, right: at.x + 20, top: at.y - 83, bottom: at.y - 46 });
    }
    return result;
  }
  function overlapCost(a, b, c, d) {
    const horizontal = Math.abs(a.y - b.y) < .1 && Math.abs(c.y - d.y) < .1;
    const vertical = Math.abs(a.x - b.x) < .1 && Math.abs(c.x - d.x) < .1;
    const overlap = horizontal ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
      : vertical ? Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) : 0;
    if (overlap > 5 && (horizontal && Math.abs(a.y - c.y) < 12 || vertical && Math.abs(a.x - c.x) < 12)) return 120 + overlap * 3;
    return intersects(a, b, c, d) ? 35 : 0;
  }
  function labelFor(points, size, boxes, segments) {
    const options = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = distance(a, b);
      if (length < 42) continue;
      for (const t of [.5, .3, .7]) for (const offset of [0, 30, -30, 44, -44]) {
        const anchor = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const x = anchor.x - (b.y - a.y) / length * offset, y = anchor.y + (b.x - a.x) / length * offset;
        const box = { left: x - size.width / 2 - 6, right: x + size.width / 2 + 6, top: y - size.height / 2 - 5, bottom: y + size.height / 2 + 5 };
        let cost = 100 / length + (t === .5 ? 0 : 3) + Math.abs(offset) * .7;
        for (const obstacle of boxes) if (overlaps(box, obstacle)) cost += 6000;
        for (const segment of segments) if (through(segment.a, segment.b, box)) cost += 700;
        options.push({ x, y, anchor, box, cost });
      }
    }
    if (!options.length) {
      const p = points[Math.floor(points.length / 2)];
      return { ...p, box: bounds({ x: p.x - size.width / 2, y: p.y - size.height / 2 }, { x: p.x + size.width / 2, y: p.y + size.height / 2 }), cost: 10000 };
    }
    return options.sort((a, b) => a.cost - b.cost)[0];
  }
  function routeAll(edges, positions, formal = {}) {
    const boxes = nodeBoxes(positions), labels = [...(formal.labels || [])], segments = [...(formal.segments || [])];
    const ports = new Map(), result = new Map(), points = [...positions.values()];
    if (!points.length) return result;
    const left = Math.min(...points.map(p => p.x)) - 132, right = Math.max(...points.map(p => p.x)) + 132;
    const top = Math.min(...points.map(p => p.y)) - 112, bottom = Math.max(...points.map(p => p.y)) + 158;
    function port(id, side, wish, radius) {
      const used = ports.get(id + ':' + side) || [];
      const offsets = [-24, -8, 8, 24].sort((a, b) => Math.abs(a - wish) - Math.abs(b - wish));
      const y = offsets.find(at => used.every(other => Math.abs(at - other) >= 13)) ?? offsets[0];
      const at = positions.get(id);
      return { x: at.x + side * Math.sqrt(radius * radius - y * y), y: at.y + y, offset: y,
        reused: used.filter(other => Math.abs(other - y) < 13).length };
    }
    // Los pares cercanos se resuelven primero para que los largos puedan rodearlos.
    const ordered = [...edges].sort((a, b) => distance(positions.get(a.source), positions.get(a.target)) - distance(positions.get(b.source), positions.get(b.target)) || a.id.localeCompare(b.id));
    for (const [index, edge] of ordered.entries()) {
      const a = positions.get(edge.source), b = positions.get(edge.target);
      const preferred = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) * .8 ? [b.x >= a.x ? 1 : -1, b.x >= a.x ? -1 : 1] : [a.x + b.x < left + right ? -1 : 1, a.x + b.x < left + right ? -1 : 1];
      let best;
      function consider(candidate, start, end, sSide, tSide, direct = false, extra = 0) {
        const route = simplify(candidate);
        if (route.length < 2 || !direct && ((route[1].x - start.x) * sSide <= 0 || (end.x - route[route.length - 2].x) * tSide >= 0)) return;
        let score = extra + (direct || sSide === preferred[0] && tSide === preferred[1] ? 0 : 30) + (start.reused + end.reused) * 1100 + (route.length - 2) * 28;
        let length = 0;
        for (let i = 1; i < route.length; i++) {
          const p = route[i - 1], q = route[i]; length += distance(p, q);
          for (const box of boxes) {
            if (box.kind === 'avatar' && (i === 1 && box.id === edge.source || i === route.length - 1 && box.id === edge.target)) continue;
            if (through(p, q, box)) score += 12000;
          }
          for (const box of labels) if (through(p, q, box)) score += 5000;
          for (const segment of segments) score += overlapCost(p, q, segment.a, segment.b);
        }
        score += length + Math.max(0, length - distance(a, b) * 1.6) * 2;
        if (best && score >= best.score) return;
        const label = labelFor(route, edge.size, [...boxes, ...labels], segments);
        score += label.cost;
        if (!best || score < best.score) best = { points: route, label, score, start, end, sSide, tSide };
      }
      // Primero intenta una recta, desplazada unos píxeles si hay conexiones paralelas.
      const length = distance(a, b) || 1, ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      for (const offset of [0, 18, 28, -18, -28]) {
        const first = Math.sqrt(46 * 46 - offset * offset), last = Math.sqrt(53 * 53 - offset * offset);
        const start = { x: a.x + ux * first - uy * offset, y: a.y + uy * first + ux * offset };
        const end = { x: b.x - ux * last - uy * offset, y: b.y - uy * last + ux * offset };
        const sSide = Math.sign(start.x - a.x) || 1, tSide = Math.sign(end.x - b.x) || -1;
        start.offset = start.y - a.y; end.offset = end.y - b.y;
        start.reused = (ports.get(edge.source + ':' + sSide) || []).filter(value => Math.abs(value - start.offset) < 12).length;
        end.reused = (ports.get(edge.target + ':' + tSide) || []).filter(value => Math.abs(value - end.offset) < 12).length;
        consider([start, end], start, end, sSide, tSide, true, Math.abs(offset) * .25 + (offset < 0 ? 4 : 0));
      }
      for (const [sSide, tSide] of [[1, -1], [-1, 1], [1, 1], [-1, -1]]) {
        const vertical = Math.abs(a.y - b.y) > 40;
        const wish = vertical ? Math.sign(b.y - a.y) * 24 : edge.source < edge.target ? 24 : -24;
        const start = port(edge.source, sSide, wish, 46), end = port(edge.target, tSide, vertical ? -wish : wish, 53);
        const s = { x: a.x + sSide * 108, y: start.y }, t = { x: b.x + tSide * 108, y: end.y };
        const spread = (index % 5) * 28;
        const xs = new Set([(s.x + t.x) / 2, Math.min(s.x, t.x) - 36 - spread, Math.max(s.x, t.x) + 36 + spread, left - spread, right + spread]);
        const ys = new Set([(s.y + t.y) / 2, Math.min(s.y, t.y) - 56 - spread, Math.max(s.y, t.y) + 56 + spread,
          Math.min(a.y, b.y) - 96 - spread, Math.max(a.y, b.y) + 150 + spread, top - spread, bottom + spread]);
        const candidates = [[start, s, t, end], [start, s, { x: t.x, y: s.y }, t, end], [start, s, { x: s.x, y: t.y }, t, end]];
        for (const x of xs) candidates.push([start, s, { x, y: s.y }, { x, y: t.y }, t, end]);
        for (const y of ys) candidates.push([start, s, { x: s.x, y }, { x: t.x, y }, t, end]);
        for (const candidate of candidates) consider(candidate, start, end, sSide, tSide);
      }
      for (const [id, side, offset] of [[edge.source, best.sSide, best.start.offset], [edge.target, best.tSide, best.end.offset]]) {
        const key = id + ':' + side; if (!ports.has(key)) ports.set(key, []); ports.get(key).push(offset);
      }
      for (let i = 1; i < best.points.length; i++) segments.push({ a: best.points[i - 1], b: best.points[i] });
      labels.push(best.label.box);
      const previous = best.points[best.points.length - 2], end = best.end, terminal = distance(previous, end) || 1;
      result.set(edge.id, { path: rounded(best.points), points: best.points, x: best.label.x, y: best.label.y, labelBox: best.label.box, anchor: best.label.anchor,
        targetDirection: { x: (previous.x - end.x) / terminal, y: (previous.y - end.y) / terminal },
        start: best.start, end: best.end, sourceSide: best.sSide, targetSide: best.tSide, sourcePosition: { ...a }, targetPosition: { ...b } });
    }
    return result;
  }
  function arrowHead(end, side, zoom = 1) {
    const size = Math.min(18, Math.max(10, 7 / zoom));
    const direction = typeof side === 'number' ? { x: side, y: 0 } : side;
    const x = end.x + direction.x * size, y = end.y + direction.y * size;
    return 'M' + end.x + ' ' + end.y + 'L' + (x - direction.y * size * .4) + ' ' + (y + direction.x * size * .4) + 'L' +
      (x + direction.y * size * .4) + ' ' + (y - direction.x * size * .4) + 'Z';
  }
  function reconnect(route, source, target) {
    const start = { x: route.start.x + source.x - route.sourcePosition.x, y: route.start.y + source.y - route.sourcePosition.y };
    const end = { x: route.end.x + target.x - route.targetPosition.x, y: route.end.y + target.y - route.targetPosition.y };
    const inner = route.points.slice(1, -1);
    if (!inner.length) {
      const length = distance(start, end) || 1;
      return { ...route, start, end, points: [start, end], path: rounded([start, end]), x: (start.x + end.x) / 2, y: (start.y + end.y) / 2,
        targetDirection: { x: (start.x - end.x) / length, y: (start.y - end.y) / length }, anchor: null };
    }
    const s = { x: source.x + route.sourceSide * 108, y: start.y }, t = { x: target.x + route.targetSide * 108, y: end.y };
    const points = simplify([start, s, { x: s.x, y: inner[0].y }, ...inner, { x: t.x, y: inner[inner.length - 1].y }, t, end]);
    const label = labelFor(points, { width: route.labelBox.right - route.labelBox.left - 12, height: route.labelBox.bottom - route.labelBox.top - 10 }, [], []);
    return { ...route, start, end, points, path: rounded(points), x: label.x, y: label.y, anchor: label.anchor };
  }
  const api = { routeAll, arrowHead, nodeBoxes, reconnect };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoFeelingRouter = api;
})(globalThis);
