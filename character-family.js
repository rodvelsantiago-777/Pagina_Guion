/* Movimiento guiado y geometría familiar. Solo datos, sin imágenes ni almacenamiento adicional. */
(function (root) {
  'use strict';
  const step = 80, generationGap = 240;
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
  const snap = value => Math.max(-20000, Math.min(20000, Math.round(value / step) * step));
  function ageRow(age) {
    if (age === null) return null;
    if (age < 100) return Math.floor(age / 5);
    if (age < 200) return 20 + Math.floor((age - 100) / 10);
    if (age < 1000) return 30 + Math.floor((age - 200) / 50);
    const power = Math.floor(Math.log10(age));
    return Math.min(230, 46 + (power - 3) * 20 + Math.floor((age / 10 ** power - 1) * 20 / 9));
  }
  const familyLink = link => link.type === 'Familia' || link.type === 'Romance';
  function layoutByAge(characters, links = []) {
    const positions = new Map(), occupied = [], byId = new Map(characters.map(item => [item.key, item]));
    const adjacent = new Map(characters.map(item => [item.key, []]));
    const parents = new Map(), partners = new Map();
    for (const link of links) {
      if (!byId.has(link.source) || !byId.has(link.target)) continue;
      for (const [a, b] of [[link.source, link.target], [link.target, link.source]]) adjacent.get(a).push({ key: b, family: familyLink(link) });
      if (link.parentId) {
        const child = childOf(link); if (!parents.has(child)) parents.set(child, new Set()); parents.get(child).add(link.parentId);
      } else if (link.type === 'Romance') {
        for (const [a, b] of [[link.source, link.target], [link.target, link.source]]) { if (!partners.has(a)) partners.set(a, []); partners.get(a).push(b); }
      }
    }
    const siblings = new Map();
    for (const [child, parentSet] of parents) {
      const key = JSON.stringify([...parentSet].sort());
      if (!siblings.has(key)) siblings.set(key, []); siblings.get(key).push(child);
    }
    const remaining = new Set(byId.keys()), units = [], unitFor = new Map();
    for (const item of characters) {
      if (!remaining.has(item.key)) continue;
      const keys = [item.key]; remaining.delete(item.key);
      for (let i = 0; i < keys.length; i++) for (const edge of adjacent.get(keys[i])) if (edge.family && remaining.delete(edge.key)) keys.push(edge.key);
      const unit = { keys, satellites: [], family: keys.length > 1, order: units.length };
      units.push(unit); for (const key of keys) unitFor.set(key, unit);
    }
    // Un amigo sin familia propia acompaña al bloque familiar, sin incorporarse a su árbol.
    const attached = new Set();
    for (const unit of units.filter(unit => !unit.family)) {
      const neighbors = adjacent.get(unit.keys[0]).map(edge => unitFor.get(edge.key)).filter(other => other.family);
      if (neighbors.length) { neighbors[0].satellites.push(unit.keys[0]); attached.add(unit); }
    }
    function free(at) { return !occupied.some(other => Math.abs(other.x - at.x) < 200 && Math.abs(other.y - at.y) < 196); }
    function place(key, wish, y) {
      const item = byId.get(key), manual = item.position?.grid === 1;
      let at = manual ? { x: snap(item.position.x), y: snap(item.position.y) } : { x: snap(wish), y: snap(y) };
      if (!manual) {
        const start = at.x;
        for (let slot = 0; !free(at) && slot < 500; slot++) at.x = snap(start + Math.ceil((slot + 1) / 2) * step * (slot % 2 ? -1 : 1));
      }
      positions.set(key, at); occupied.push(at); return at;
    }
    // Las posiciones guardadas con la cuadrícula nueva son decisiones explícitas del usuario.
    for (const item of characters) if (item.position?.grid === 1) place(item.key, 0, 0);
    const ordered = units.filter(unit => !attached.has(unit)).sort((a, b) => Number(b.family) - Number(a.family) || a.order - b.order);
    let cursor = 0;
    for (const unit of ordered) {
      const local = new Map(), keys = unit.keys;
      const pivot = [...keys].sort((a, b) => Number(Boolean(parents.get(a)?.size)) - Number(Boolean(parents.get(b)?.size)) || (partners.get(b)?.length || 0) - (partners.get(a)?.length || 0)
        || adjacent.get(b).filter(edge => edge.family).length - adjacent.get(a).filter(edge => edge.family).length || keys.indexOf(a) - keys.indexOf(b))[0];
      local.set(pivot, 0);
      function expandPartners() {
        let added = false;
        for (const [key, at] of [...local]) {
          let slot = 0;
          for (const other of partners.get(key) || []) if (!local.has(other)) {
            slot++;
            const count = [...siblings.values()].filter(children => parents.get(children[0]).has(key) && parents.get(children[0]).has(other))
              .reduce((sum, children) => sum + children.reduce((width, child) => width + 1 + (partners.get(child)?.length || 0), 0), 0);
            const own = siblings.get(JSON.stringify([...(parents.get(key) || [])].sort()));
            const outward = own?.length > 1 ? Math.sign(own.indexOf(key) - (own.length - 1) / 2) : 0;
            local.set(other, at + Math.ceil(slot / 2) * generationGap * Math.max(1, count) * (outward || (slot % 2 ? -1 : 1)));
            added = true;
          }
        }
        return added;
      }
      expandPartners();
      // Los hijos van bajo el centro de sus progenitores; los hermanos comparten barra.
      for (let pass = 0; pass < keys.length; pass++) {
        let added = expandPartners();
        for (const key of keys) if (!local.has(key)) {
          const known = [...(parents.get(key) || [])].filter(id => local.has(id));
          if (known.length) {
            const group = siblings.get(JSON.stringify([...(parents.get(key) || [])].sort()));
            local.set(key, known.reduce((sum, id) => sum + local.get(id), 0) / known.length + (group.indexOf(key) - (group.length - 1) / 2) * generationGap);
            added = true;
          }
        }
        if (!added) break;
      }
      for (const key of keys) if (!local.has(key)) {
        const neighbor = adjacent.get(key).find(edge => local.has(edge.key));
        local.set(key, neighbor ? local.get(neighbor.key) + generationGap : local.size * generationGap);
      }
      const minimum = Math.min(...local.values());
      const offset = cursor - minimum;
      const yFor = new Map();
      for (const key of keys) { const row = ageRow(ageYears(byId.get(key).age)); if (row !== null) yFor.set(key, -row * step); }
      if (!yFor.size) yFor.set(pivot, 0);
      for (let pass = 0; pass < keys.length; pass++) {
        let added = false;
        for (const key of keys) if (!yFor.has(key)) {
          const knownParents = [...(parents.get(key) || [])].filter(id => yFor.has(id));
          const children = keys.filter(child => parents.get(child)?.has(key) && yFor.has(child));
          const partner = (partners.get(key) || []).find(id => yFor.has(id));
          if (knownParents.length) yFor.set(key, Math.max(...knownParents.map(id => yFor.get(id))) + generationGap);
          else if (children.length) yFor.set(key, Math.min(...children.map(id => yFor.get(id))) - generationGap);
          else if (partner) yFor.set(key, yFor.get(partner));
          else continue;
          added = true;
        }
        if (!added) break;
      }
      for (const key of keys) if (!positions.has(key)) place(key, local.get(key) + offset, yFor.get(key) ?? (unit.family ? step * 2 : 0));
      let right = Math.max(...keys.map(key => positions.get(key).x));
      for (const key of unit.satellites) {
        if (positions.has(key)) continue;
        const anchor = adjacent.get(key).find(edge => keys.includes(edge.key)), at = positions.get(anchor.key);
        const row = ageRow(ageYears(byId.get(key).age));
        place(key, right + generationGap * 1.5, row === null ? at.y : -row * step);
        right = Math.max(right, positions.get(key).x);
      }
      cursor = snap(Math.max(cursor, right + generationGap * 2));
    }
    // Si no hay familias, aproxima redes sociales alrededor de su personaje de referencia.
    if (!units.some(unit => unit.family)) {
      const visited = new Set();
      for (const pivot of [...characters].sort((a, b) => adjacent.get(b.key).length - adjacent.get(a.key).length)) {
        if (visited.has(pivot.key)) continue;
        visited.add(pivot.key); const queue = [pivot.key];
        for (let i = 0; i < queue.length; i++) {
          const at = positions.get(queue[i]); let slot = 0;
          for (const edge of adjacent.get(queue[i])) if (!visited.has(edge.key)) {
            visited.add(edge.key); queue.push(edge.key); slot++;
            const item = byId.get(edge.key); if (item.position?.grid === 1) continue;
            const previous = positions.get(edge.key); occupied.splice(occupied.indexOf(previous), 1);
            const row = ageRow(ageYears(item.age));
            const around = [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3]][(slot - 1) % 6];
            place(edge.key, at.x + around[0] * step, row === null ? at.y + around[1] * step : -row * step);
          }
        }
      }
    }
    return positions;
  }
  function resetChangedPositions(before, after) {
    const edges = profiles => new Map(profiles.flatMap(profile => (profile.details?.relationships || []).map(link => {
      const ids = [profile.id, link.targetId].sort(); return [JSON.stringify([...ids, link.type, link.parentId || '']), { source: profile.id, target: link.targetId, type: link.type }];
    })));
    const old = edges(before), next = edges(after), changed = new Set();
    for (const [key, link] of [...old, ...next]) if (!old.has(key) || !next.has(key)) { changed.add(link.source); changed.add(link.target); }
    if (!changed.size) return after;
    const links = [...old.values(), ...next.values()];
    const queue = [...changed];
    for (let i = 0; i < queue.length; i++) for (const link of links) if (familyLink(link) && [link.source, link.target].includes(queue[i])) {
      const other = link.source === queue[i] ? link.target : link.source; if (!changed.has(other)) { changed.add(other); queue.push(other); }
    }
    return after.map(profile => { if (!changed.has(profile.id) || !profile.relationshipPosition) return profile; const copy = { ...profile }; delete copy.relationshipPosition; return copy; });
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
    const byChild = new Map();
    const pairKey = (...ids) => JSON.stringify(ids.sort());
    for (const link of links) if (link.parentId) {
      const child = childOf(link), parents = byChild.get(child) || new Set();
      parents.add(link.parentId); byChild.set(child, parents);
    }
    const groups = new Map();
    for (const [child, parentSet] of byChild) {
      const selected = [...parentSet].sort();
      if (selected.length < 2 || selected.some(id => !positions.has(id))) continue;
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
    return { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) };
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
      const gap = Math.min(Math.hypot(point.x - middle.x, point.y - middle.y),
        Math.hypot(point.x - (a.x + b.x) / 2, point.y - (a.y + b.y) / 2));
      if (gap > tolerance || gap >= distance) continue;
      const position = { x: snap(middle.x), y: snap(Math.max(a.y, b.y) + generationGap) };
      let slot = 0;
      while ([...positions].some(([id, at]) => id !== key && Math.abs(at.x - position.x) < 170 && Math.abs(at.y - position.y) < 140)) {
        slot++;
        position.x = snap(middle.x) + Math.ceil(slot / 2) * generationGap * (slot % 2 ? 1 : -1);
      }
      if (Math.abs(position.x) > 20000 || Math.abs(position.y) > 20000) continue;
      candidate = { parents: [link.source, link.target], child: key, position, middle };
      distance = gap;
    }
    return candidate;
  }
  const api = { step, generationGap, guidedPosition, inferParents, groupsFor, joinFor, childOf, middleFor,
    ageYears, ageBand, ageRow, snap, layoutByAge, resetChangedPositions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterFamily = api;
})(globalThis);
