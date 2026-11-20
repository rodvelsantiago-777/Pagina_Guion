/* Flechas de sentimientos. Cada dirección pertenece únicamente al personaje que siente. */
(function (root) {
  'use strict';
  let serial = 0;
  function create(host, world, hooks) {
    const Details = root.PlanoCharacterDetails, Router = root.PlanoFeelingRouter, prefix = 'feelings-' + (++serial);
    const groups = new Map(Details.feelingGroups.flatMap(group => group.types.map(type => [type, group])));
    const groupColor = group => 'light-dark(' + group.color + ',' + group.darkColor + ')';
    const svg = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
    const lines = svg('svg'); lines.classList.add('relations-feeling-lines'); lines.setAttribute('aria-hidden', 'true');
    world.insertBefore(lines, world.querySelector('.relations-lines'));
    const heads = svg('svg'); heads.classList.add('relations-feeling-heads'); heads.setAttribute('aria-hidden', 'true');
    world.insertBefore(heads, world.querySelector('.relations-edge-labels'));
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
    feeling.append(new Option('Elige un sentimiento', ''));
    for (const group of Details.feelingGroups) {
      const options = document.createElement('optgroup'); options.label = group.label;
      options.append(...group.types.map(type => new Option(type, type))); feeling.append(options);
    }
    const legend = document.createElement('ul'); legend.className = 'relations-feeling-legend'; legend.setAttribute('aria-label', 'Colores de los sentimientos');
    const caption = document.createElement('li'); caption.textContent = 'Sentimientos'; caption.className = 'relations-feeling-key-caption'; legend.append(caption);
    for (const group of Details.feelingGroups) {
      const item = document.createElement('li'); item.textContent = group.label; item.dataset.feelingGroup = group.id;
      item.style.setProperty('--feeling-color', groupColor(group)); item.title = group.types.join(', '); legend.append(item);
    }
    host.querySelector('.relations-foot').append(legend);
    let items = [], byKey = new Map(), busy = false, lockedTarget = false, epoch = 0, opener;
    const edges = [], buttons = new Map();
    let routes = new Map(), routeSignature = '', routingContent = '';
    function trace(edge) {
      world.closest('.relations-canvas').classList.toggle('is-tracing-feeling', Boolean(edge));
      for (const candidate of edges) for (const element of [candidate.path, candidate.halo, candidate.head, candidate.origin, candidate.button]) element.classList.toggle('is-traced', candidate === edge);
      for (const node of world.querySelectorAll('.relations-node')) node.classList.toggle('is-feeling-endpoint', Boolean(edge && [edge.source, edge.target].includes(node.dataset.characterKey)));
      if (edge) { lines.append(edge.halo, edge.path, edge.hit); heads.append(edge.head, edge.origin); }
    }
    function setBusy(value) {
      busy = value;
      for (const button of buttons.values()) button.disabled = value || items.length < 2;
      for (const edge of edges) edge.button.disabled = value;
      if (value) trace(null);
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
      trace(null); edges.length = 0; buttons.clear(); labels.replaceChildren(); actions.replaceChildren(); lines.replaceChildren(); heads.replaceChildren();
      const content = JSON.stringify([items.map(item => [hooks.key(item), hooks.label(item)]), relationships,
        profiles.map(profile => [profile.id, profile.details?.feelings])]);
      if (content !== routingContent) { routes.clear(); routeSignature = ''; routingContent = content; }
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
        const group = groups.get(entry.feeling), color = groupColor(group);
        const path = svg('path'), hit = svg('path'), halo = svg('path'), head = svg('path'), origin = svg('circle'), button = document.createElement('button');
        halo.classList.add('relations-feeling-halo'); halo.setAttribute('fill', 'none');
        head.classList.add('relations-feeling-arrow'); head.setAttribute('fill', color); head.setAttribute('stroke', 'none');
        origin.classList.add('relations-feeling-origin'); origin.setAttribute('fill', color); origin.setAttribute('r', '2.2'); origin.setAttribute('stroke', 'none');
        path.classList.add('relations-feeling-path'); hit.classList.add('relations-feeling-hit');
        path.setAttribute('stroke', color); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.4');
        path.dataset.feelingGroup = group.id; button.dataset.feelingGroup = group.id;
        path.dataset.feelingSource = profile.id; path.dataset.feelingTarget = entry.targetId;
        hit.setAttribute('fill', 'none'); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', '12');
        button.type = 'button'; button.className = 'relations-feeling-link'; button.textContent = entry.feeling;
        button.style.setProperty('--feeling-color', color);
        const description = hooks.label(byKey.get(profile.id)) + ' hacia ' + hooks.label(byKey.get(entry.targetId));
        button.title = description + ' · ' + entry.feeling + ' (' + group.label + ')';
        button.setAttribute('aria-label', 'Editar sentimiento de ' + description + ': ' + entry.feeling);
        button.addEventListener('pointerdown', event => event.stopPropagation());
        hit.addEventListener('pointerdown', event => event.stopPropagation());
        for (const control of [hit, button]) control.addEventListener('click', () => open(profile.id, entry.targetId, button));
        lines.append(halo, path, hit); heads.append(head, origin); labels.append(button);
        const edge = { id: JSON.stringify([profile.id, entry.targetId]), source: profile.id, target: entry.targetId, path, hit, halo, head, origin, button };
        edges.push(edge);
        for (const control of [hit, button]) {
          control.addEventListener('pointerenter', () => { if (!busy) trace(edge); });
          control.addEventListener('pointerleave', () => { if (document.activeElement !== button) trace(null); });
        }
        button.addEventListener('focus', () => { if (!busy) trace(edge); }); button.addEventListener('blur', () => trace(null));
      }
      setBusy(busy);
    }
    function draw(positions, context = {}) {
      for (const [key, button] of buttons) {
        const at = positions.get(key); if (at) button.style.transform = 'translate(' + (at.x - 11) + 'px,' + (at.y - 69) + 'px)';
      }
      if (!edges.length) return;
      const signature = [...positions].map(([id, at]) => id + ':' + at.x + ',' + at.y).join('|');
      if (signature !== routeSignature && (!context.dragging || !routes.size)) {
        const measured = edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, size: { width: edge.button.offsetWidth, height: edge.button.offsetHeight } }));
        routes = Router.routeAll(measured, positions, context.obstacles?.()); routeSignature = signature;
      }
      for (const edge of edges) {
        const original = routes.get(edge.id); if (!original) continue;
        const sourceAt = positions.get(edge.source), targetAt = positions.get(edge.target);
        const moving = context.dragging && (sourceAt.x !== original.sourcePosition.x || sourceAt.y !== original.sourcePosition.y || targetAt.x !== original.targetPosition.x || targetAt.y !== original.targetPosition.y);
        const shape = moving ? Router.reconnect(original, sourceAt, targetAt) : original;
        edge.path.setAttribute('d', shape.path); edge.hit.setAttribute('d', shape.path); edge.halo.setAttribute('d', shape.path);
        edge.head.setAttribute('d', Router.arrowHead(shape.end, shape.targetSide, context.zoom));
        edge.origin.setAttribute('cx', shape.start.x); edge.origin.setAttribute('cy', shape.start.y);
        edge.head.dataset.feelingSource = edge.source; edge.head.dataset.feelingTarget = edge.target;
        edge.button.style.transform = 'translate(' + shape.x + 'px,' + shape.y + 'px) translate(-50%,-50%)';
      }
    }
    function getBounds() {
      if (!routes.size) return null;
      const points = [...routes.values()].flatMap(route => [...route.points, { x: route.labelBox.left, y: route.labelBox.top }, { x: route.labelBox.right, y: route.labelBox.bottom }]);
      return { left: Math.min(...points.map(point => point.x)) - 20, right: Math.max(...points.map(point => point.x)) + 20,
        top: Math.min(...points.map(point => point.y)) - 20, bottom: Math.max(...points.map(point => point.y)) + 20 };
    }
    target.addEventListener('change', updateTarget);
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    remove.addEventListener('click', () => save(true));
    form.querySelector('[data-feeling-cancel]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); else buttons.get(source.value)?.focus({ preventScroll: true }); });
    return { render, draw, setBusy, getBounds, clear() {
      epoch++; busy = false; items = []; byKey.clear(); edges.length = 0; buttons.clear();
      trace(null); routes.clear(); routeSignature = ''; routingContent = ''; labels.replaceChildren(); actions.replaceChildren(); lines.replaceChildren(); heads.replaceChildren();
      if (dialog.open) dialog.close();
    } };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterFeelings = api;
})(globalThis);
