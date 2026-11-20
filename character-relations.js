/* Lienzo de relaciones compartidas con las fichas del proyecto. */
(function (root) {
  'use strict';
  const Avatar = root.PlanoCharacterAvatar, Details = root.PlanoCharacterDetails, Family = root.PlanoCharacterFamily;
  const colors = new Map([
    ['Familia', '#9175C8'], ['Conocidos', '#79949C'], ['Romance', '#CC6386'],
    ['Amistad', '#539B77'], ['Trabajo o estudios', '#538EC4'], ['Mentoría', '#B5924B'],
    ['Rivalidad', '#CA8A51'], ['Enemistad', '#C3615B'], ['Otro', '#899278'],
  ]);
  const characterKey = item => item.profile?.id || 'script:' + root.PlanoScreenplay.characterKey(item.name);
  const label = item => (item.profile?.primaryAlias || item.name) + (item.profile?.age ? ' (' + item.profile.age + ')' : '');
  const typeKey = type => type.trim().toLocaleLowerCase('es').normalize('NFC');
  function colorFor(type) {
    if (colors.has(type)) return colors.get(type);
    let hash = 0;
    for (const letter of typeKey(type)) hash = (hash * 31 + letter.codePointAt(0)) | 0;
    return 'hsl(' + ((hash >>> 0) % 360) + ' 38% 54%)';
  }
  function linksFor(profiles) {
    const seen = new Set(), ids = new Set(profiles.map(profile => profile.id)), result = [];
    for (const profile of profiles) for (const entry of profile.details?.relationships || []) {
      if (!ids.has(entry.targetId) || profile.id === entry.targetId) continue;
      const pair = [profile.id, entry.targetId].sort();
      const key = JSON.stringify([...pair, typeKey(entry.type)]);
      if (seen.has(key)) {
        const link = result.find(link => link.source === pair[0] && link.target === pair[1] && typeKey(link.type) === typeKey(entry.type));
        if (entry.parentId) link.parentId = entry.parentId;
        for (const flag of ['married', 'broken']) if (link[flag] === undefined && entry[flag] !== undefined) link[flag] = entry[flag];
        continue;
      }
      seen.add(key);
      result.push({ source: pair[0], target: pair[1], type: entry.type, ...(entry.parentId ? { parentId: entry.parentId } : {}),
        ...(entry.married !== undefined ? { married: entry.married } : {}), ...(entry.broken !== undefined ? { broken: entry.broken } : {}) });
    }
    return result;
  }

  function create(host, hooks) {
    host.innerHTML = `<div class="relations-toolbar">
      <button class="workspace-button" type="button" data-relation-add>+ Añadir relación</button>
      <div class="relations-zoom" role="group" aria-label="Vista del árbol">
        <button type="button" data-zoom-out aria-label="Alejar árbol">−</button>
        <output data-zoom-value>100%</output>
        <button type="button" data-zoom-in aria-label="Acercar árbol">+</button>
        <button type="button" data-fit>Ajustar</button>
      </div>
    </div>
    <div class="relations-canvas" tabindex="0" role="region" aria-label="Lienzo de relaciones. Arrastra el fondo para desplazarte y los personajes para organizarlos.">
      <div class="relations-world">
        <svg class="relations-guides" aria-hidden="true"><path data-motion-guide/></svg>
        <svg class="relations-lines" aria-hidden="true"></svg>
        <div class="relations-edge-labels"></div>
        <div class="relations-nodes"></div>
      </div>
      <p class="relations-empty" hidden>Aún no hay personajes. Crea una ficha o escribe un personaje en el guion.</p>
      <p class="relations-drop-hint" role="status" hidden></p>
    </div>
    <div class="relations-foot">
      <p>Arrastra en ocho direcciones. En Familia, coloca progenitores arriba e hijos abajo. Suelta un hijo en el centro de una relación para vincularlo a ambos.<span class="relations-family-help">Pasa sobre un personaje o abre su ficha para consultar sus parentescos.</span></p>
      <ul class="relations-legend" aria-label="Colores de las relaciones"></ul>
    </div>
    <p class="characters-error" data-relations-error role="alert" hidden></p>`;
    const canvas = host.querySelector('.relations-canvas'), world = host.querySelector('.relations-world');
    const lines = host.querySelector('.relations-lines'), nodes = host.querySelector('.relations-nodes');
    const guide = host.querySelector('[data-motion-guide]'), dropHint = host.querySelector('.relations-drop-hint');
    const edgeLabels = host.querySelector('.relations-edge-labels'), legend = host.querySelector('.relations-legend');
    const empty = host.querySelector('.relations-empty'), add = host.querySelector('[data-relation-add]');
    const error = host.querySelector('[data-relations-error]'), zoomValue = host.querySelector('[data-zoom-value]');
    const dialog = document.createElement('dialog');
    dialog.className = 'relations-dialog';
    dialog.setAttribute('aria-labelledby', 'relation-dialog-title');
    dialog.innerHTML = `<form><h2 id="relation-dialog-title">Añadir relación</h2>
      <label for="relation-source">Personaje</label><select id="relation-source" required></select>
      <label for="relation-target">Relacionado con</label><select id="relation-target" required></select>
      <label for="relation-type">Tipo de relación</label><select id="relation-type" required></select>
      <div class="relations-family-field" hidden><label for="relation-parent">Progenitor</label><select id="relation-parent"></select></div>
      <fieldset class="relations-couple-field" hidden><legend>Estado de la relación</legend>
        <label><input id="relation-married" type="checkbox">Casados</label>
        <label><input id="relation-broken" type="checkbox">Ruptura</label>
        <p data-couple-summary role="status"></p>
      </fieldset>
      <p class="characters-error" role="alert" hidden></p>
      <footer>
        <button class="workspace-button" type="button" data-remove hidden>Quitar relación</button>
        <button class="workspace-button" type="button" data-cancel>Cancelar</button>
        <button class="workspace-button workspace-button-primary" type="submit">Guardar relación</button>
      </footer></form>`;
    host.append(dialog);
    const form = dialog.querySelector('form'), source = form.querySelector('#relation-source');
    const target = form.querySelector('#relation-target'), type = form.querySelector('#relation-type');
    const parent = form.querySelector('#relation-parent'), familyField = form.querySelector('.relations-family-field');
    const coupleField = form.querySelector('.relations-couple-field'), married = form.querySelector('#relation-married'), broken = form.querySelector('#relation-broken');
    const formError = form.querySelector('[role="alert"]'), remove = form.querySelector('[data-remove]');
    const positions = new Map(), nodeElements = new Map(), edgeElements = [], familyElements = [];
    let items = [], profiles = [], links = [], camera = { x: 0, y: 0, zoom: 1 }, gesture, frame = 0;
    let initialized = false, busy = false, currentLink = null, epoch = 0, lastOpener, kinshipKey = null;
    const feelings = root.PlanoCharacterFeelings.create(host, world, { key: characterKey, label,
      async commit(change) {
        const token = epoch; setBusy(true);
        try { return await hooks.commit({ feeling: change }); }
        finally { if (token === epoch) setBusy(false); }
      },
    });

    function showKinship(key) {
      if (key && (busy || gesture?.moved) || key === kinshipKey) return;
      kinshipKey = key;
      const relatives = new Map((key ? Details.familyFor(profiles, key) : []).map(entry => [entry.targetId, entry]));
      for (const item of items) {
        const itemKey = characterKey(item), node = nodeElements.get(itemKey);
        if (!node) continue;
        const badge = node.querySelector('.relations-node-kinship'), relative = relatives.get(itemKey);
        node.classList.toggle('is-family-reference', itemKey === key);
        badge.hidden = !relative;
        badge.textContent = relative?.label || '';
        badge.title = relative?.evidence || '';
      }
    }

    function message(node, text = '') {
      node.textContent = text;
      node.hidden = !text;
    }
    function setBusy(value) {
      busy = value;
      add.disabled = value || items.length < 2;
      canvas.setAttribute('aria-busy', String(value));
      form.querySelector('button[type="submit"]').disabled = value;
      remove.disabled = value;
      source.disabled = value || Boolean(currentLink);
      target.disabled = value || Boolean(currentLink);
      type.disabled = value;
      parent.disabled = value;
      married.disabled = broken.disabled = value;
      feelings.setBusy(value);
    }
    function draw() {
      frame = 0;
      world.style.transform = 'translate(' + camera.x + 'px,' + camera.y + 'px) scale(' + camera.zoom + ')';
      zoomValue.textContent = Math.round(camera.zoom * 100) + '%';
      for (const [key, node] of nodeElements) {
        const position = positions.get(key);
        node.style.transform = 'translate(' + (position.x - 78) + 'px,' + (position.y - 40) + 'px)';
      }
      guide.setAttribute('d', gesture?.key && gesture.moved ? 'M' + gesture.original.x + ' ' + gesture.original.y +
        'L' + positions.get(gesture.key).x + ' ' + positions.get(gesture.key).y : '');
      for (const edge of edgeElements) {
        const a = positions.get(edge.link.source), b = positions.get(edge.link.target);
        if (edge.link.parentId) {
          const p = edge.link.parentId === edge.link.source ? a : b, c = p === a ? b : a;
          const y = (p.y + c.y) / 2;
          edge.path.setAttribute('d', 'M' + p.x + ' ' + (p.y + 40) + 'V' + y + 'H' + c.x + 'V' + (c.y - 40));
          edge.button.style.transform = 'translate(' + ((p.x + c.x) / 2) + 'px,' + y + 'px) translate(-50%,-50%)';
          continue;
        }
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
        const curve = edge.offset * 52, cx = (a.x + b.x) / 2 - dy / length * curve;
        const cy = (a.y + b.y) / 2 + dx / length * curve;
        edge.path.setAttribute('d', 'M' + a.x + ' ' + a.y + 'Q' + cx + ' ' + cy + ' ' + b.x + ' ' + b.y);
        edge.button.style.transform = 'translate(' + ((a.x + 2 * cx + b.x) / 4) + 'px,' +
          ((a.y + 2 * cy + b.y) / 4) + 'px) translate(-50%,-50%)';
      }
      for (const branch of familyElements) {
        const { x, y } = Family.middleFor(branch.parents, positions, links), c = positions.get(branch.child);
        const elbow = (y + c.y) / 2;
        branch.path.setAttribute('d', 'M' + x + ' ' + y + 'V' + elbow + 'H' + c.x + 'V' + (c.y - 40));
        branch.joint.setAttribute('cx', x); branch.joint.setAttribute('cy', y);
        branch.button.style.transform = 'translate(' + c.x + 'px,' + elbow + 'px) translate(-50%,-50%)';
      }
      feelings.draw(positions);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function fit() {
      if (!positions.size || !canvas.clientWidth) return;
      const points = [...positions.values()];
      const left = Math.min(...points.map(point => point.x)) - 95;
      const right = Math.max(...points.map(point => point.x)) + 95;
      const top = Math.min(...points.map(point => point.y)) - 80;
      const bottom = Math.max(...points.map(point => point.y)) + 124;
      camera.zoom = Math.max(.2, Math.min(1, (canvas.clientWidth - 44) / (right - left), (canvas.clientHeight - 44) / (bottom - top)));
      camera.x = canvas.clientWidth / 2 - (left + right) / 2 * camera.zoom;
      camera.y = canvas.clientHeight / 2 - (top + bottom) / 2 * camera.zoom;
      draw();
    }
    function zoom(amount, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
      const next = Math.max(.2, Math.min(2.5, camera.zoom * amount));
      const ratio = next / camera.zoom;
      camera.x = x - (x - camera.x) * ratio;
      camera.y = y - (y - camera.y) * ratio;
      camera.zoom = next;
      schedule();
    }
    function updateTargets() {
      const previous = target.value;
      target.replaceChildren(...items.filter(item => characterKey(item) !== source.value).map(item => new Option(label(item), characterKey(item))));
      if ([...target.options].some(option => option.value === previous)) target.value = previous;
      updateParentChoices();
    }
    function updateParentChoices() {
      const previous = parent.value;
      familyField.hidden = type.value !== 'Familia';
      parent.replaceChildren(new Option('Sin definir', ''), ...[source, target].filter(select => select.value)
        .map(select => new Option(select.selectedOptions[0].textContent, select.value)));
      if ([...parent.options].some(option => option.value === previous)) parent.value = previous;
      updateCouple();
    }
    function updateCouple() {
      coupleField.hidden = !Details.isCouple(type.value);
      form.querySelector('[data-couple-summary]').textContent = Details.coupleCaption({ type: type.value, married: married.checked, broken: broken.checked });
    }
    function editLink(link, opener) {
      if (busy || items.length < 2) return;
      currentLink = link || null;
      lastOpener = opener;
      source.replaceChildren(...items.map(item => new Option(label(item), characterKey(item))));
      if (link) source.value = link.source;
      updateTargets();
      if (link) target.value = link.target;
      const choices = [...Details.relationshipTypes];
      if (link && !choices.includes(link.type)) choices.push(link.type);
      type.replaceChildren(...choices.map(name => new Option(name, name)));
      type.value = link?.type || 'Amistad';
      married.checked = Boolean(link && Details.isCouple(link.type) && Details.isMarried(link));
      broken.checked = Boolean(link?.broken);
      updateParentChoices();
      parent.value = link?.parentId || '';
      dialog.querySelector('h2').textContent = link ? 'Editar relación' : 'Añadir relación';
      remove.hidden = !link;
      message(formError);
      setBusy(false);
      dialog.showModal();
      (link ? type : source).focus();
    }
    async function saveLink(removing = false) {
      if (busy || !form.reportValidity()) return;
      const token = epoch;
      setBusy(true);
      message(formError);
      const change = { source: source.value, target: target.value, type: type.value, previousType: currentLink?.type, remove: removing,
        parent: type.value === 'Familia' ? parent.value : '',
        ...(Details.isCouple(type.value) ? { married: married.checked, broken: broken.checked } : {}) };
      if (!removing && type.value === 'Familia' && !change.parent && currentLink?.type !== 'Familia') {
        change.parent = Family.inferParents(source.value, positions.get(source.value), positions,
          [{ source: source.value, target: target.value, type: 'Familia' }])[0]?.parent || '';
      }
      try {
        const saved = await hooks.commit({ relationship: change });
        if (token === epoch && saved) dialog.close();
      } catch (reason) {
        if (token === epoch) message(formError, reason.message || 'No se pudo guardar la relación.');
      } finally {
        if (token === epoch) setBusy(false);
      }
    }
    function render(characters, roster) {
      items = characters;
      profiles = roster;
      links = linksFor(profiles);
      const layout = Family.layoutByAge(items.map(item => ({ key: characterKey(item), age: item.profile?.age,
        position: item.profile?.relationshipPosition })));
      positions.clear();
      for (const [key, at] of layout) positions.set(key, at);
      nodes.replaceChildren();
      nodeElements.clear();
      kinshipKey = null;
      for (const item of items) {
        const key = characterKey(item), node = document.createElement('button');
        node.type = 'button';
        node.className = 'relations-node';
        node.dataset.characterKey = key;
        const life = Details.lifeState(item.profile), lifeLabel = Details.lifeStateLabel(item.profile);
        node.dataset.lifeState = life;
        node.setAttribute('aria-label', label(item) + (lifeLabel ? '. ' + lifeLabel : '') + '. Abrir ficha. Usa Mayús y las flechas para mover.');
        node.title = (lifeLabel ? lifeLabel + ' · ' : '') + 'Arrastra para mover · Pulsa para ver la ficha';
        const avatar = document.createElement('span'), text = document.createElement('span');
        avatar.className = 'relations-avatar character-avatar-art';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.innerHTML = Avatar.svg(item.profile?.avatar || Avatar.defaults);
        text.className = 'relations-node-name';
        text.textContent = label(item);
        const kinship = document.createElement('span');
        kinship.className = 'relations-node-kinship';
        kinship.hidden = true;
        kinship.setAttribute('aria-hidden', 'true');
        const stateLabel = document.createElement('span');
        stateLabel.className = 'relations-life-label';
        stateLabel.textContent = lifeLabel;
        stateLabel.hidden = !lifeLabel;
        node.append(avatar, text, stateLabel, kinship);
        if (life === 'dead' || life === 'missing') {
          const mark = document.createElement('span');
          mark.className = 'relations-life-mark';
          mark.title = life === 'dead' ? 'Luto' : lifeLabel;
          mark.setAttribute('aria-hidden', 'true');
          mark.innerHTML = '<svg><use href="#' + (life === 'dead' ? 'i-mourning' : 'i-missing') + '"/></svg>';
          node.append(mark);
        }
        node.addEventListener('pointerenter', () => showKinship(key));
        node.addEventListener('pointerleave', () => showKinship(document.activeElement?.closest('.relations-node')?.dataset.characterKey || null));
        node.addEventListener('focus', () => showKinship(key));
        node.addEventListener('blur', () => showKinship(null));
        node.addEventListener('click', event => {
          if (event.detail && node.dataset.dragged === 'true') return;
          if (!busy) hooks.open(item, node);
        });
        node.addEventListener('keydown', event => {
          const steps = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };
          if (!event.shiftKey || !steps[event.key] || busy) return;
          event.preventDefault();
          const [x, y] = steps[event.key], previous = positions.get(key);
          const next = { x: previous.x + x, y: previous.y + y };
          moveNode(key, next, previous);
        });
        nodeElements.set(key, node);
        nodes.append(node);
      }
      lines.replaceChildren();
      edgeLabels.replaceChildren();
      edgeElements.length = 0;
      familyElements.length = 0;
      const groups = Family.groupsFor(links, positions);
      const pairs = new Map();
      for (const link of links) {
        const pair = JSON.stringify([link.source, link.target]);
        if (!pairs.has(pair)) pairs.set(pair, []);
        pairs.get(pair).push(link);
      }
      const byKey = new Map(items.map(item => [characterKey(item), item]));
      for (const group of pairs.values()) for (const [index, link] of group.entries()) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', colorFor(link.type));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '2.3');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'relations-link';
        button.style.setProperty('--relationship-color', colorFor(link.type));
        const inferred = link.type === 'Familia' && !link.parentId
          ? Details.familyFor(profiles, link.source).find(entry => entry.targetId === link.target) : null;
        button.textContent = link.parentId ? Details.parentTitle(byKey.get(link.parentId)?.profile) + ' → ' +
          Details.childTitle(byKey.get(Family.childOf(link))?.profile) : inferred?.label || link.type;
        if (Details.isCouple(link.type)) {
          button.textContent = '';
          if (Details.isMarried(link) || link.broken) button.classList.add('relations-couple-link');
          for (const icon of [...(Details.isMarried(link) ? ['i-rings'] : []), ...(link.broken ? ['i-heart-broken'] : [])]) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('aria-hidden', 'true');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#' + icon);
            svg.append(use); button.append(svg);
          }
          const caption = document.createElement('span'); caption.textContent = Details.coupleCaption(link); button.append(caption);
          button.title = caption.textContent + ' · Pulsa para editar matrimonio o ruptura';
        }
        if (inferred) button.title = label(byKey.get(link.target)) + ' · ' + inferred.label + ' de ' + label(byKey.get(link.source));
        button.setAttribute('aria-label', 'Editar ' + link.type + ' entre ' + label(byKey.get(link.source)) +
          ' y ' + label(byKey.get(link.target)));
        button.addEventListener('click', () => editLink(link, button));
        const grouped = link.parentId && groups.some(group => group.parents.includes(link.parentId) && group.children.includes(Family.childOf(link)));
        path.style.display = grouped ? 'none' : '';
        button.hidden = Boolean(grouped);
        lines.append(path);
        edgeLabels.append(button);
        edgeElements.push({ link, path, button, offset: index - (group.length - 1) / 2 });
      }
      for (const group of groups) for (const child of group.children) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const joint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        path.setAttribute('stroke', colorFor('Familia')); path.setAttribute('stroke-width', '2.3'); path.setAttribute('fill', 'none');
        path.classList.add('relations-family-branch');
        joint.setAttribute('r', '4'); joint.setAttribute('fill', colorFor('Familia'));
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'relations-link relations-family-label';
        button.style.setProperty('--relationship-color', colorFor('Familia'));
        button.textContent = Details.childTitle(byKey.get(child)?.profile);
        button.setAttribute('aria-label', 'Ver progenitores de ' + label(byKey.get(child)));
        button.addEventListener('click', () => { if (!busy) hooks.open(byKey.get(child), button); });
        lines.append(path, joint); edgeLabels.append(button);
        familyElements.push({ ...group, child, path, joint, button });
      }
      legend.replaceChildren();
      for (const type of new Set([...Details.relationshipTypes, ...links.map(link => link.type)])) {
        const item = document.createElement('li');
        item.style.setProperty('--relationship-color', colorFor(type));
        item.textContent = type;
        legend.append(item);
      }
      empty.hidden = Boolean(items.length);
      feelings.render(items, profiles, links);
      setBusy(busy);
      if (!initialized && items.length) { initialized = true; fit(); }
      else draw();
    }
    async function moveNode(key, next, previous, join) {
      next = { x: Math.max(-20000, Math.min(20000, Math.round(next.x))), y: Math.max(-20000, Math.min(20000, Math.round(next.y))) };
      positions.set(key, next);
      draw();
      const token = epoch;
      setBusy(true);
      message(error);
      try {
        const parents = join ? join.parents.map(parent => ({ parent, child: key })) : Family.inferParents(key, next, positions, links);
        const saved = await hooks.commit({ position: { key, ...next }, parents });
        if (token === epoch && !saved) { positions.set(key, previous); draw(); }
      } catch (reason) {
        if (token === epoch) {
          positions.set(key, previous);
          draw();
          message(error, reason.message || 'No se pudo guardar la posición.');
        }
      } finally {
        if (token === epoch) setBusy(false);
      }
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || busy || gesture || event.target.closest('.relations-link')) return;
      const node = event.target.closest('.relations-node');
      if (node) { node.dataset.dragged = 'false'; node.focus({ preventScroll: true }); }
      const key = node?.dataset.characterKey;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, key, node,
        original: key ? { ...positions.get(key) } : { x: camera.x, y: camera.y }, moved: false };
      if (!node) canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (gesture?.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      gesture.moved = true;
      showKinship(null);
      if (!canvas.hasPointerCapture(event.pointerId)) canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      if (gesture.key) {
        gesture.node.dataset.dragged = 'true';
        const point = { x: gesture.original.x + dx / camera.zoom, y: gesture.original.y + dy / camera.zoom };
        gesture.join = Family.joinFor(gesture.key, point, positions, links, Math.min(80, 40 / camera.zoom));
        positions.set(gesture.key, gesture.join?.position || Family.guidedPosition(gesture.original, dx / camera.zoom, dy / camera.zoom));
        const parents = gesture.join?.parents.map(key => label(items.find(item => characterKey(item) === key)));
        message(dropHint, parents ? 'Suelta para añadir como hijo/a de ' + parents.join(' y ') + '.' : '');
        canvas.classList.toggle('has-family-drop', Boolean(gesture.join));
      } else {
        camera.x = gesture.original.x + dx;
        camera.y = gesture.original.y + dy;
      }
      schedule();
    });
    function release(event) {
      if (gesture?.id !== event.pointerId) return;
      const finished = gesture;
      gesture = null;
      canvas.classList.remove('is-dragging');
      canvas.classList.remove('has-family-drop');
      message(dropHint);
      guide.setAttribute('d', '');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!finished.key || !finished.moved) return;
      if (event.type === 'pointercancel') { positions.set(finished.key, finished.original); schedule(); return; }
      moveNode(finished.key, positions.get(finished.key), finished.original, finished.join);
    }
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, release);
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (gesture) return;
      if (event.ctrlKey || event.metaKey) {
        const box = canvas.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * .002), event.clientX - box.left, event.clientY - box.top);
      } else {
        const amount = event.deltaMode === 1 ? 18 : 1;
        camera.x -= (event.shiftKey ? event.deltaY : event.deltaX) * amount;
        camera.y -= (event.shiftKey ? 0 : event.deltaY) * amount;
        schedule();
      }
    }, { passive: false });
    canvas.addEventListener('keydown', event => {
      if (event.target !== canvas) return;
      const arrows = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] };
      if (arrows[event.key]) {
        event.preventDefault();
        camera.x += arrows[event.key][0]; camera.y += arrows[event.key][1]; schedule();
      }
    });
    add.addEventListener('click', () => editLink(null, add));
    source.addEventListener('change', updateTargets);
    target.addEventListener('change', updateParentChoices);
    type.addEventListener('change', updateParentChoices);
    married.addEventListener('change', updateCouple);
    broken.addEventListener('change', updateCouple);
    host.querySelector('[data-fit]').addEventListener('click', fit);
    host.querySelector('[data-zoom-in]').addEventListener('click', () => zoom(1.2));
    host.querySelector('[data-zoom-out]').addEventListener('click', () => zoom(1 / 1.2));
    form.addEventListener('submit', event => { event.preventDefault(); saveLink(); });
    remove.addEventListener('click', () => saveLink(true));
    form.querySelector('[data-cancel]').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { if (!dialog.open && lastOpener?.isConnected) lastOpener.focus({ preventScroll: true }); });
    return {
      render, setBusy,
      clear() {
        epoch++;
        feelings.clear();
        gesture = null;
        if (frame) cancelAnimationFrame(frame);
        frame = 0; initialized = false; busy = false; kinshipKey = null;
        positions.clear(); nodeElements.clear(); edgeElements.length = 0; familyElements.length = 0;
        items = []; profiles = []; links = [];
        nodes.replaceChildren(); lines.replaceChildren(); edgeLabels.replaceChildren();
        message(error);
        message(dropHint); guide.setAttribute('d', '');
        canvas.classList.remove('is-dragging', 'has-family-drop');
        if (dialog.open) dialog.close();
      },
    };
  }
  root.PlanoCharacterRelations = { create, key: characterKey, linksFor };
})(globalThis);
