/* Movimiento guiado y geometría familiar. Solo datos, sin imágenes ni almacenamiento adicional. */
(function (root) {
  'use strict';
  const step = 24, generationGap = 240;
  const childOf = link => link.parentId === link.source ? link.target : link.source;
  function ageYears(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().normalize('NFKC').match(/^(\d+(?:[.,]\d+)*)\s*(años?|mes(?:es)?|d[ií]as?)?$/iu);
    if (!match) return null;
    // En edades fantásticas también admite la agrupación habitual de miles en español.
    const number = /^\d{1,3}(?:\.\d{3})+$/.test(match[1]) ? match[1].replaceAll('.', '') : match[1].replace(',', '.');
    const age = Number(number);
    if (!Number.isFinite(age) || age > Number.MAX_SAFE_INTEGER) return null;
    const unit = (match[2] || '').toLocaleLowerCase('es');
    return /^mes/.test(unit) ? age / 12 : /^d/.test(unit) ? age / 365.25 : age;
  }
  function ageBand(age) {
    if (age === null) return null;
    const width = age < 100 ? 5 : age < 200 ? 10 : age < 1000 ? 50 : 10 ** (Math.floor(Math.log10(age)) - 1);
    return Math.floor(age / width) * width;
  }
  function layoutByAge(characters) {
    const positions = new Map(), bands = new Map(), occupied = [];
    for (const item of characters) {
      const band = ageBand(ageYears(item.age));
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(item);
      if (item.position) { positions.set(item.key, { ...item.position }); occupied.push(item.position); }
    }
    // Solo cuentan las franjas presentes. Las edades enormes no generan filas vacías.
    const ordered = [...bands.keys()].sort((a, b) => a === null ? 1 : b === null ? -1 : b - a);
    let row = 0;
    const maxColumns = 160;
    for (const band of ordered) {
      const members = bands.get(band), columns = Math.min(maxColumns, members.length);
      let lastRow = row;
      for (const [index, item] of members.entries()) {
        if (item.position) continue;
        const column = index % columns, initialRow = row + Math.floor(index / columns);
        let at = { x: (column - (columns - 1) / 2) * generationGap, y: initialRow * generationGap };
        // Conserva la fila de edad y busca primero otro hueco horizontal junto a los movimientos guardados.
        let slot = 0;
        while (occupied.some(other => Math.abs(other.x - at.x) < 170 && Math.abs(other.y - at.y) < 150)) {
          slot++;
          const offset = Math.ceil(slot / 2) * generationGap * (slot % 2 ? 1 : -1);
          at.x = (column - (columns - 1) / 2) * generationGap + offset;
          if (Math.abs(at.x) > 19500) { at = { x: (column - (columns - 1) / 2) * generationGap, y: at.y + generationGap }; slot = 0; }
        }
        lastRow = Math.max(lastRow, at.y / generationGap);
        positions.set(item.key, at);
        occupied.push(at);
      }
      row = Math.max(lastRow + 1, row + Math.ceil(members.length / maxColumns));
    }
    return positions;
  }
  function guidedPosition(origin, dx, dy) {
    const direction = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const x = Math.round(Math.cos(direction * Math.PI / 4));
    const y = Math.round(Math.sin(direction * Math.PI / 4));
    let distance = Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / step) * step;
    for (const [axis, sign] of [['x', x], ['y', y]]) {
      if (sign) distance = Math.min(distance, sign > 0 ? 20000 - origin[axis] : origin[axis] + 20000);
    }
    return { x: origin.x + x * distance, y: origin.y + y * distance };
  }
  function inferParents(key, point, positions, links) {
    const result = [];
    for (const link of links) {
      if (link.type !== 'Familia' || ![link.source, link.target].includes(key)) continue;
      const other = link.source === key ? link.target : link.source, at = positions.get(other);
      if (!at || Math.abs(point.y - at.y) < 160 || Math.abs(point.x - at.x) > Math.abs(point.y - at.y) + step) continue;
      const parent = point.y < at.y ? key : other, child = parent === key ? other : key;
      if (link.parentId !== parent) result.push({ parent, child });
    }
    return result;
  }
  function groupsFor(links, positions) {
    const byChild = new Map(), pairs = new Set();
    const pairKey = (a, b) => JSON.stringify([a, b].sort());
    for (const link of links) {
      if (link.parentId) {
        const child = childOf(link), parents = byChild.get(child) || new Set();
        parents.add(link.parentId);
        byChild.set(child, parents);
      } else pairs.add(pairKey(link.source, link.target));
    }
    const groups = new Map();
    for (const [child, parentSet] of byChild) {
      const parents = [...parentSet].sort();
      let selected;
      for (let a = 0; a < parents.length && !selected; a++) for (let b = a + 1; b < parents.length && !selected; b++) {
        if (pairs.has(pairKey(parents[a], parents[b]))) selected = [parents[a], parents[b]];
      }
      if (!selected || selected.some(id => !positions.has(id))) continue;
      const key = pairKey(...selected);
      if (!groups.has(key)) groups.set(key, { parents: selected, children: [] });
      groups.get(key).children.push(child);
    }
    return [...groups.values()];
  }
  function middleFor(parents, positions, links) {
    const pair = links.filter(link => parents.includes(link.source) && parents.includes(link.target));
    const link = pair.find(link => !link.parentId);
    const a = positions.get(link?.source || parents[0]), b = positions.get(link?.target || parents[1]);
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const offset = link ? (pair.indexOf(link) - (pair.length - 1) / 2) * 26 : 0;
    return { x: (a.x + b.x) / 2 - dy / length * offset, y: (a.y + b.y) / 2 + dx / length * offset };
  }
  function joinFor(key, point, positions, links, tolerance = 44) {
    const parents = new Set(links.filter(link => link.parentId && childOf(link) === key).map(link => link.parentId));
    if (!parents.size) return;
    let candidate, distance = Infinity;
    for (const link of links) {
      if (link.parentId || [link.source, link.target].includes(key) || ![link.source, link.target].some(id => parents.has(id))) continue;
      const a = positions.get(link.source), b = positions.get(link.target);
      if (!a || !b) continue;
      const middle = middleFor([link.source, link.target], positions, links);
      const gap = Math.hypot(point.x - middle.x, point.y - middle.y);
      if (gap > tolerance || gap >= distance) continue;
      const position = { x: middle.x, y: Math.max(a.y, b.y) + generationGap };
      let slot = 0;
      while ([...positions].some(([id, at]) => id !== key && Math.abs(at.x - position.x) < 170 && Math.abs(at.y - position.y) < 140)) {
        slot++;
        position.x = middle.x + Math.ceil(slot / 2) * generationGap * (slot % 2 ? 1 : -1);
      }
      if (Math.abs(position.x) > 20000 || Math.abs(position.y) > 20000) continue;
      candidate = { parents: [link.source, link.target], child: key, position, middle };
      distance = gap;
    }
    return candidate;
  }
  const api = { step, generationGap, guidedPosition, inferParents, groupsFor, joinFor, childOf, middleFor,
    ageYears, ageBand, layoutByAge };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterFamily = api;
})(globalThis);
