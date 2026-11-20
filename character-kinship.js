/* Parentescos calculados desde la filiación. Las deducciones no se guardan como vínculos nuevos. */
(function (root) {
  'use strict';
  const cache = new WeakMap();
  const gendered = (profile, masculine, feminine, neutral) => profile?.gender === 'Mujer' ? feminine : profile?.gender === 'Hombre' ? masculine : neutral;
  function ancestorLabel(profile, generations, descending) {
    const forms = descending
      ? [['Hijo', 'Hija', 'Hijo/a'], ['Nieto', 'Nieta', 'Nieto/a'], ['Bisnieto', 'Bisnieta', 'Bisnieto/a'], ['Tataranieto', 'Tataranieta', 'Tataranieto/a']]
      : [['Padre', 'Madre', 'Progenitor/a'], ['Abuelo', 'Abuela', 'Abuelo/a'], ['Bisabuelo', 'Bisabuela', 'Bisabuelo/a'], ['Tatarabuelo', 'Tatarabuela', 'Tatarabuelo/a']];
    const words = forms[generations - 1];
    if (words) return gendered(profile, ...words);
    return (descending ? 'Descendiente' : gendered(profile, 'Antepasado', 'Antepasada', 'Antepasado/a')) + ' (' + generations + ' generaciones)';
  }
  function collateralLabel(profile, ownDistance, otherDistance, halfSibling) {
    if (ownDistance === 1 && otherDistance === 1) {
      return halfSibling ? gendered(profile, 'Medio hermano', 'Media hermana', 'Medio hermano/a') : gendered(profile, 'Hermano', 'Hermana', 'Hermano/a');
    }
    if (otherDistance === 1) {
      const suffix = ['', ' abuelo', ' bisabuelo', ' tatarabuelo'][ownDistance - 2];
      if (suffix !== undefined) return gendered(profile, 'Tío' + suffix, 'Tía' + suffix.replace('abuelo', 'abuela'), 'Tío/a' + suffix.replace('abuelo', 'abuelo/a'));
      return gendered(profile, 'Tío', 'Tía', 'Tío/a') + ' (' + (ownDistance - 1) + ' generaciones de diferencia)';
    }
    if (ownDistance === 1) {
      const suffix = ['', ' nieto', ' bisnieto', ' tataranieto'][otherDistance - 2];
      if (suffix !== undefined) return gendered(profile, 'Sobrino' + suffix, 'Sobrina' + suffix.replace('nieto', 'nieta'), 'Sobrino/a' + suffix.replace('nieto', 'nieto/a'));
      return gendered(profile, 'Sobrino', 'Sobrina', 'Sobrino/a') + ' (' + (otherDistance - 1) + ' generaciones de diferencia)';
    }
    const degree = Math.min(ownDistance, otherDistance) - 1, removed = Math.abs(ownDistance - otherDistance);
    const masculine = ['hermano', 'segundo', 'tercero', 'cuarto'][degree - 1];
    const cousin = masculine ? gendered(profile, 'Primo ' + masculine, 'Prima ' + masculine.replace(/o$/, 'a'), 'Primo/a ' + masculine + '/a')
      : gendered(profile, 'Primo', 'Prima', 'Primo/a') + ' de grado ' + degree;
    return cousin + (removed ? ' (' + removed + (removed === 1 ? ' generación' : ' generaciones') + ' de diferencia)' : '');
  }
  function indexFor(profiles) {
    if (cache.has(profiles)) return cache.get(profiles);
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    const parents = new Map(profiles.map(profile => [profile.id, new Set()]));
    const ancestors = new Map(), results = new Map();
    for (const profile of profiles) for (const entry of profile.details?.relationships || []) {
      if (entry.type !== 'Familia' || !entry.parentId || ![profile.id, entry.targetId].includes(entry.parentId)) continue;
      const child = entry.parentId === profile.id ? entry.targetId : profile.id;
      if (parents.has(child) && byId.has(entry.parentId)) parents.get(child).add(entry.parentId);
    }
    function ancestry(id) {
      if (ancestors.has(id)) return ancestors.get(id);
      const distances = new Map([[id, 0]]), queue = [id];
      for (let index = 0; index < queue.length; index++) for (const parent of parents.get(queue[index]) || []) {
        if (distances.has(parent)) continue;
        distances.set(parent, distances.get(queue[index]) + 1);
        queue.push(parent);
      }
      ancestors.set(id, distances);
      return distances;
    }
    function forCharacter(id) {
      if (!byId.has(id)) return [];
      if (results.has(id)) return results.get(id);
      const own = ancestry(id), found = [];
      for (const other of profiles) {
        if (other.id === id) continue;
        const theirs = ancestry(other.id);
        let label, distance, evidence;
        if (own.has(other.id)) {
          distance = own.get(other.id);
          label = ancestorLabel(other, distance, false);
          evidence = 'Ascendencia de ' + distance + (distance === 1 ? ' generación.' : ' generaciones.');
        } else if (theirs.has(id)) {
          distance = theirs.get(id);
          label = ancestorLabel(other, distance, true);
          evidence = 'Descendencia de ' + distance + (distance === 1 ? ' generación.' : ' generaciones.');
        } else {
          let nearest = Infinity;
          const labels = new Set(), sharedParents = [...parents.get(id)].filter(parent => parents.get(other.id).has(parent));
          const half = sharedParents.length === 1 && parents.get(id).size >= 2 && parents.get(other.id).size >= 2;
          for (const [ancestor, ownDistance] of own) {
            const otherDistance = theirs.get(ancestor);
            if (!ownDistance || !otherDistance) continue;
            const total = ownDistance + otherDistance;
            if (total > nearest) continue;
            if (total < nearest) { labels.clear(); nearest = total; }
            labels.add(collateralLabel(other, ownDistance, otherDistance, half));
          }
          if (labels.size) {
            label = [...labels].join(' / ');
            distance = nearest;
            evidence = sharedParents.length ? 'Comparten ' + sharedParents.length + (sharedParents.length === 1 ? ' progenitor conocido.' : ' progenitores conocidos.')
              : 'Detectado a partir de sus antepasados compartidos.';
          }
        }
        if (label) found.push({ targetId: other.id, type: 'Familia', inferred: true, label, distance, evidence });
      }
      found.sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label, 'es') ||
        byId.get(a.targetId).givenNames.localeCompare(byId.get(b.targetId).givenNames, 'es'));
      if (results.size >= 32) results.delete(results.keys().next().value);
      results.set(id, found);
      return found;
    }
    const index = { forCharacter };
    cache.set(profiles, index);
    return index;
  }
  const api = { forCharacter: (profiles, id) => indexFor(profiles).forCharacter(id) };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterKinship = api;
})(globalThis);
