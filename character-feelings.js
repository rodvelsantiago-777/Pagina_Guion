/* Flechas de sentimientos. Cada dirección pertenece únicamente al personaje que siente. */
(function (root) {
  'use strict';
  let serial = 0;
  const tones = new Map();
  for (const [color, names] of [
    ['#C56686', ['Amor', 'Enamoramiento', 'Atracción', 'Deseo', 'Cariño', 'Afecto', 'Ternura']],
    ['#8476B1', ['Admiración', 'Respeto', 'Gratitud', 'Compasión', 'Miedo', 'Vergüenza']],
    ['#559481', ['Confianza', 'Lealtad', 'Esperanza']],
    ['#688EB3', ['Nostalgia', 'Tristeza', 'Decepción', 'Culpa']],
    ['#AA7960', ['Desconfianza', 'Celos', 'Envidia', 'Rabia']],
    ['#BD6269', ['Odio', 'Desprecio', 'Rencor']],
    ['#838B97', ['Indiferencia', 'Ambivalencia']],
  ]) for (const name of names) tones.set(name, color);
  function geometry(a, b, curve = 96) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const control = { x: (a.x + b.x) / 2 - dy / length * curve, y: (a.y + b.y) / 2 + dx / length * curve };
    const first = Math.hypot(control.x - a.x, control.y - a.y) || 1, last = Math.hypot(b.x - control.x, b.y - control.y) || 1;
    const start = { x: a.x + (control.x - a.x) / first * 44, y: a.y + (control.y - a.y) / first * 44 };
    const end = { x: b.x - (b.x - control.x) / last * 48, y: b.y - (b.y - control.y) / last * 48 };
    return { path: 'M' + start.x + ' ' + start.y + 'Q' + control.x + ' ' + control.y + ' ' + end.x + ' ' + end.y,
      x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 };
  }
  function create(host, world, hooks) {
    const Details = root.PlanoCharacterDetails, prefix = 'feelings-' + (++serial);
    const svg = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
    const lines = svg('svg'); lines.classList.add('relations-feeling-lines'); lines.setAttribute('aria-hidden', 'true');
    world.insertBefore(lines, world.querySelector('.relations-lines'));
    const labels = document.createElement('div'), actions = document.createElement('div');
    labels.className = 'relations-feeling-labels'; actions.className = 'relations-feeling-actions';
    world.insertBefore(labels, world.querySelector('.relations-nodes')); world.append(actions);
    const dialog = document.createElement('dialog'); dialog.className = 'relations-dialog relations-feeling-dialog';
    dialog.setAttribute('aria-labelledby', prefix + '-title');
    dialog.innerHTML = `<form><h2 id="${prefix}-title">Añadir sentimiento</h2>
      <label for="${prefix}-source">Quién siente</label><select id="${prefix}-source" disabled></select>
      <label for="${prefix}-target">Hacia quién</label><select id="${prefix}-target" required></select>
      <label for="${prefix}-type">Qué siente</label><select id="${prefix}-type" required></select>
      <p class="relations-feeling-help">La flecha va de quien siente hacia la persona elegida.</p>
      <p class="characters-error" role="alert" hidden></p><footer>
      <button type="button" class="workspace-button" data-feeling-remove hidden>Quitar sentimiento</button>
      <button type="button" class="workspace-button" data-feeling-cancel>Cancelar</button>
      <button type="submit" class="workspace-button workspace-button-primary">Guardar sentimiento</button>
      </footer></form>`;
    host.append(dialog);
    const form = dialog.querySelector('form'), source = form.querySelector('#' + prefix + '-source');
    const target = form.querySelector('#' + prefix + '-target'), feeling = form.querySelector('#' + prefix + '-type');
    const error = form.querySelector('[role=alert]'), remove = form.querySelector('[data-feeling-remove]');
    feeling.append(new Option('Elige un sentimiento', ''), ...Details.feelingTypes.map(type => new Option(type, type)));
    let items = [], byKey = new Map(), busy = false, lockedTarget = false, epoch = 0, opener;
    const edges = [], buttons = new Map();
    function setBusy(value) {
      busy = value;
      for (const button of buttons.values()) button.disabled = value || items.length < 2;
      for (const edge of edges) edge.button.disabled = value;
      target.disabled = value || lockedTarget;
      feeling.disabled = value; remove.disabled = value;
      form.querySelector('[type=submit]').disabled = value;
    }
    function updateTarget() {
      const existing = byKey.get(source.value)?.profile?.details?.feelings?.find(entry => entry.targetId === target.value);
      feeling.value = existing?.feeling || '';
      remove.hidden = !existing;
      dialog.querySelector('h2').textContent = existing ? 'Editar sentimiento' : 'Añadir sentimiento';
      error.hidden = true; error.textContent = '';
    }
    function open(from, to, trigger) {
      if (busy || items.length < 2 || !byKey.has(from)) return;
      opener = trigger; lockedTarget = Boolean(to);
      source.replaceChildren(new Option(hooks.label(byKey.get(from)), from));
      target.replaceChildren(new Option('Elige un personaje', ''), ...items.filter(item => hooks.key(item) !== from).map(item => new Option(hooks.label(item), hooks.key(item))));
      target.value = to || '';
      updateTarget(); setBusy(false); dialog.showModal();
      (to ? feeling : target).focus();
    }
    async function save(removing = false) {
      if (busy || !target.value || !removing && !form.reportValidity()) return;
      const token = epoch;
      setBusy(true); error.hidden = true;
      try {
        const saved = await hooks.commit({ source: source.value, target: target.value, feeling: feeling.value, remove: removing });
        if (token === epoch && saved) dialog.close();
      } catch (reason) {
        if (token === epoch) { error.textContent = reason.message || 'No se pudo guardar el sentimiento.'; error.hidden = false; }
      } finally { if (token === epoch) setBusy(false); }
    }
    function render(characters, profiles, relationships) {
      items = characters; byKey = new Map(items.map(item => [hooks.key(item), item]));
      edges.length = 0; buttons.clear(); labels.replaceChildren(); actions.replaceChildren(); lines.replaceChildren();
      const defs = svg('defs'); lines.append(defs);
      const pairKey = (a, b) => JSON.stringify([a, b].sort()), counts = new Map(), markers = new Map();
      for (const link of relationships) {
        const key = pairKey(link.source, link.target); counts.set(key, (counts.get(key) || 0) + 1);
      }
      for (const item of items) {
        const key = hooks.key(item), button = document.createElement('button');
        button.type = 'button'; button.className = 'relations-feeling-add'; button.textContent = '+';
        button.dataset.feelingSource = key;
        button.setAttribute('aria-label', 'Añadir sentimiento desde ' + hooks.label(item));
        button.title = 'Añadir sentimiento';
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', () => open(key, null, button));
        actions.append(button); buttons.set(key, button);
      }
      for (const profile of profiles) for (const entry of profile.details?.feelings || []) {
        if (!byKey.has(profile.id) || !byKey.has(entry.targetId)) continue;
        const color = tones.get(entry.feeling) || '#838B97';
        if (!markers.has(color)) {
          const marker = svg('marker'), head = svg('path'), id = prefix + '-arrow-' + markers.size;
          marker.id = id; marker.setAttribute('viewBox', '0 0 8 8'); marker.setAttribute('refX', '7'); marker.setAttribute('refY', '4');
          marker.setAttribute('markerWidth', '8'); marker.setAttribute('markerHeight', '8'); marker.setAttribute('orient', 'auto');
          marker.setAttribute('markerUnits', 'userSpaceOnUse'); head.setAttribute('d', 'M0 0L8 4L0 8L2 4Z');
          head.setAttribute('fill', color); head.setAttribute('stroke', 'none'); marker.append(head); defs.append(marker); markers.set(color, id);
        }
        const path = svg('path'), hit = svg('path'), button = document.createElement('button');
        path.classList.add('relations-feeling-path'); hit.classList.add('relations-feeling-hit');
        path.setAttribute('stroke', color); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.2');
        path.setAttribute('marker-end', 'url(#' + markers.get(color) + ')');
        path.dataset.feelingSource = profile.id; path.dataset.feelingTarget = entry.targetId;
        hit.setAttribute('fill', 'none'); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '12');
        button.type = 'button'; button.className = 'relations-feeling-link'; button.textContent = entry.feeling;
        button.style.setProperty('--feeling-color', color);
        const description = hooks.label(byKey.get(profile.id)) + ' hacia ' + hooks.label(byKey.get(entry.targetId));
        button.title = description + ' · ' + entry.feeling;
        button.setAttribute('aria-label', 'Editar sentimiento de ' + description + ': ' + entry.feeling);
        button.addEventListener('pointerdown', event => event.stopPropagation());
        hit.addEventListener('pointerdown', event => event.stopPropagation());
        for (const control of [hit, button]) control.addEventListener('click', () => open(profile.id, entry.targetId, button));
        lines.append(path, hit); labels.append(button);
        const pairCount = counts.get(pairKey(profile.id, entry.targetId)) || 0;
        edges.push({ source: profile.id, target: entry.targetId, path, hit, button, curve: 96 + Math.max(0, (pairCount - 1) / 2) * 52 });
      }
      setBusy(busy);
    }
    function draw(positions) {
      for (const [key, button] of buttons) {
        const at = positions.get(key); if (at) button.style.transform = 'translate(' + (at.x - 11) + 'px,' + (at.y - 69) + 'px)';
      }
      for (const edge of edges) {
        const a = positions.get(edge.source), b = positions.get(edge.target); if (!a || !b) continue;
        const shape = geometry(a, b, edge.curve);
        edge.path.setAttribute('d', shape.path); edge.hit.setAttribute('d', shape.path);
        edge.button.style.transform = 'translate(' + shape.x + 'px,' + shape.y + 'px) translate(-50%,-50%)';
      }
    }
    target.addEventListener('change', updateTarget);
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    remove.addEventListener('click', () => save(true));
    form.querySelector('[data-feeling-cancel]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); else buttons.get(source.value)?.focus({ preventScroll: true }); });
    return { render, draw, setBusy, clear() {
      epoch++; busy = false; items = []; byKey.clear(); edges.length = 0; buttons.clear();
      labels.replaceChildren(); actions.replaceChildren(); lines.replaceChildren();
      if (dialog.open) dialog.close();
    } };
  }
  const api = { create, geometry };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterFeelings = api;
})(globalThis);
