/* Fichas por proyecto. El redactor y este panel comparten el índice de menciones. */
(function (root) {
  'use strict';
  const S = root.PlanoScreenplay, Details = root.PlanoCharacterDetails, Avatar = root.PlanoCharacterAvatar;
  const $ = selector => document.querySelector(selector);
  const list = $('#character-list'), add = $('#character-add');
  const status = $('#characters-summary'), error = $('#characters-error');
  const dialog = document.createElement('dialog');
  dialog.className = 'character-dialog';
  dialog.setAttribute('aria-labelledby', 'character-dialog-title');
  dialog.innerHTML = `<div class="character-profile-view" hidden>
    <div class="character-profile-scroll">
      <div class="character-profile-side">
        <span class="character-initials" data-profile-initials aria-hidden="true"></span>
        <p class="character-profile-role" data-profile-role hidden></p>
        <p class="character-profile-references" data-profile-references hidden></p>
      </div>
      <div class="character-profile-content">
        <header class="character-profile-identity">
          <h2 id="character-profile-title" tabindex="-1"></h2>
          <div class="character-profile-alias-line" hidden><span>Apodos</span><ul class="character-profile-aliases" aria-label="Apodos"></ul></div>
        </header>
        <section class="character-profile-basics" aria-labelledby="character-profile-basics-title">
          <h3 id="character-profile-basics-title">Datos básicos</h3><dl></dl>
        </section>
        <section class="character-profile-extras" aria-labelledby="character-profile-extras-title" hidden>
          <h3 id="character-profile-extras-title">Información adicional</h3><dl></dl>
        </section>
      </div>
    </div>
    <footer class="character-profile-actions">
      <button class="workspace-button character-profile-edit" type="button" data-profile-edit><svg aria-hidden="true"><use href="#i-edit"/></svg>Editar personaje</button>
      <button class="workspace-button" type="button" data-profile-close aria-label="Cerrar ficha">Cerrar</button>
    </footer>
  </div>` + '<form autocomplete="off"><header class="character-edit-header">' +
    '<button class="character-avatar-trigger" type="button" aria-haspopup="dialog" aria-label="Editar icono del personaje" title="Editar icono del personaje">' +
    '<span class="character-initials" data-edit-avatar aria-hidden="true"></span>' +
    '<span class="character-avatar-pencil" aria-hidden="true"><svg><use href="#i-edit"/></svg></span></button>' +
    '<h2 id="character-dialog-title">Nuevo personaje</h2></header><div class="character-dialog-body">' +
    '<div class="character-edit-basics">' +
    '<div class="character-fields"><label>Nombre(s)<input name="givenNames" maxlength="80" required></label>' +
    '<label>Apellido(s)<input name="surnames" maxlength="80"></label>' +
    '<label>Edad<input name="age" maxlength="32"></label>' +
    '<div class="character-gender-field"><label for="character-gender">Género</label>' +
    '<select id="character-gender" name="gender" aria-describedby="character-gender-previous"><option value="">Sin definir</option></select>' +
    '<small id="character-gender-previous" class="character-gender-previous" hidden></small></div>' +
    '<label class="character-wide">Rol en la historia<select name="role"><option value="">Sin definir</option></select></label>' +
    '<div class="character-about character-wide"><label for="character-about">Acerca de</label>' +
    '<textarea id="character-about" name="about" rows="3" maxlength="' + S.characterAboutLimit + '" aria-describedby="character-about-count"></textarea>' +
    '<span id="character-about-count" class="character-about-count"></span></div></div>' +
    '<fieldset class="character-aliases"><legend>Apodos y formas de nombrarlo</legend>' +
    '<div class="character-tags" aria-label="Nombres y apodos"><span class="character-tag-list"></span>' +
    '<span class="character-tag character-alias-composer">' +
    '<button type="button" data-add-alias aria-label="Añadir apodo" aria-controls="character-new-alias"><span aria-hidden="true">+</span> Apodo</button>' +
    '<input id="character-new-alias" name="alias" maxlength="80" placeholder="Apodo" aria-label="Nuevo apodo" aria-describedby="character-alias-error" hidden></span></div>' +
    '<p id="character-alias-error" class="characters-error" role="alert" hidden></p>' +
    '<p>El nombre completo y el nombre de pila se incluyen automáticamente.</p>' +
    '<div class="character-primary-alias" hidden><label for="character-primary-alias">Apodo principal</label>' +
    '<select id="character-primary-alias" name="primaryAlias" aria-describedby="character-primary-help"></select>' +
    '<p id="character-primary-help">Así aparecerá al elegir quién habla en el redactor.</p></div></fieldset></div>' +
    '<section class="character-extras" aria-labelledby="character-extras-title">' +
    '<h3 id="character-extras-title">Información adicional</h3><div id="character-extra-fields"></div>' +
    '<div class="character-field-actions"><button id="character-add-field" class="workspace-button" type="button" aria-controls="character-field-picker" aria-expanded="false">' +
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>Añadir campo</button>' +
    '<ul id="character-field-picker" class="character-field-picker" aria-label="Campos disponibles" hidden><li class="character-field-empty" hidden>Ya añadiste todos los campos.</li></ul></div></section></div>' +
    '<footer><p class="characters-error" role="alert" hidden></p>' +
    '<button class="workspace-button" type="button" id="cancel-character-profile">Cancelar</button>' +
    '<button class="workspace-button workspace-button-primary" type="submit">Guardar personaje</button></footer></form>';
  $('#project-characters').append(dialog);
  const form = dialog.querySelector('form'), fields = form.elements;
  const editTitle = form.querySelector('h2'), editBody = form.querySelector('.character-dialog-body');
  const avatarTrigger = form.querySelector('.character-avatar-trigger'), editAvatar = avatarTrigger.querySelector('[data-edit-avatar]');
  const reader = dialog.querySelector('.character-profile-view');
  const profileTitle = reader.querySelector('h2'), profileScroll = reader.querySelector('.character-profile-scroll');
  const profileAliases = reader.querySelector('.character-profile-aliases');
  const basics = reader.querySelector('.character-profile-basics dl');
  const additional = reader.querySelector('.character-profile-extras'), optionalFields = additional.querySelector('dl');
  const tags = form.querySelector('.character-tag-list'), formError = form.querySelector('footer .characters-error');
  const aliasInput = fields.alias, aliasButton = form.querySelector('[data-add-alias]'), aliasError = form.querySelector('#character-alias-error');
  const cancel = form.querySelector('#cancel-character-profile');
  const primaryAlias = fields.primaryAlias, primaryRow = primaryAlias.closest('.character-primary-alias');
  const aboutCount = form.querySelector('#character-about-count');
  const genderPrevious = form.querySelector('#character-gender-previous');
  const extras = root.PlanoCharacterDetailsEditor.create(form.querySelector('.character-extras'));
  for (const [field, choices] of [['gender', S.characterGenders], ['role', S.characterRoles]]) {
    for (const choice of choices) fields[field].append(new Option(choice, choice));
  }
  let context, viewing, opener, editing, sourceName, relationshipTargets, saving = false, generation = 0;
  let avatarEditor, editingAvatar = false;
  let relations, showingRelations = false;
  const cardsPanel = $('#characters-cards-panel'), relationsPanel = $('#characters-relations-panel');
  const viewTabs = [$('#characters-cards-tab'), $('#characters-relations-tab')];
  const properties = ['givenNames', 'surnames', 'age', 'gender', 'role', 'about'];
  const characterContext = ['givenNames', 'surnames'];
  const message = (node, text = '') => { node.textContent = text; node.hidden = !text; };
  const emptyProfile = (name, id = S.id()) => ({ id, givenNames: name, surnames: '', age: '', gender: '', role: '', aliases: [] });
  const previousGenderData = profile => profile.sex ? 'Dato anterior · ' + profile.sex : '';
  const count = (amount, one, many) => amount + ' ' + (amount === 1 ? one : many);
  const initials = name => name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es');
  const references = item => count(item.mentions.reduce((total, row) => total + row.ranges.length, 0), 'mención', 'menciones') +
    ' · ' + count(item.dialogues.length, 'diálogo', 'diálogos');
  const updateAboutCount = () => { aboutCount.textContent = fields.about.value.length + ' de ' + S.characterAboutLimit + ' caracteres'; };

  function nameFields() {
    return Object.fromEntries(characterContext.map(key => [key, fields[key].value.trim().replace(/\s+/g, ' ')]));
  }
  function paintAvatar(slot, avatar, name) {
    slot.classList.toggle('character-avatar-art', Boolean(avatar));
    if (avatar) slot.innerHTML = Avatar.svg(avatar);
    else if (name) slot.textContent = initials(name);
    else slot.innerHTML = '<svg aria-hidden="true"><use href="#i-character"/></svg>';
  }
  function paintEditAvatar() {
    paintAvatar(editAvatar, editing.avatar, S.characterName(nameFields()));
  }
  async function commitGraph(change) {
    if (!context || saving) throw Error('Espera a que termine el guardado.');
    const active = context, token = generation;
    let profiles = [...active.profiles];
    const resolved = new Map();
    function ensureProfile(key) {
      if (resolved.has(key)) return profiles.find(profile => profile.id === resolved.get(key));
      const item = active.characters.find(character => root.PlanoCharacterRelations.key(character) === key);
      if (!item) throw Error('El personaje ya no está disponible. Vuelve a abrir el árbol.');
      if (item.profile) { resolved.set(key, item.profile.id); return profiles.find(profile => profile.id === item.profile.id); }
      const profile = emptyProfile(item.name);
      profiles.push(profile);
      resolved.set(key, profile.id);
      return profile;
    }
    if (change.position) {
      const profile = ensureProfile(change.position.key);
      profiles = profiles.map(item => item.id === profile.id
        ? { ...item, relationshipPosition: { x: change.position.x, y: change.position.y, grid: 1 } } : item);
    }
    if (change.relationship) {
      const { source, target, type, previousType, remove, parent, married, broken } = change.relationship;
      const owner = ensureProfile(source), other = ensureProfile(target);
      if (owner.id === other.id) throw Error('Elige dos personajes diferentes.');
      const current = Details.relationshipsFor(profiles, owner.id) || [];
      const relationships = current.filter(entry => !(entry.targetId === other.id && entry.type === previousType));
      if (!remove) relationships.push({ targetId: other.id, type,
        ...(parent && type === 'Familia' ? { parentId: ensureProfile(parent).id } : {}),
        ...(Details.isCouple(type) ? { married: Boolean(married), broken: Boolean(broken) } : {}) });
      profiles = Details.updateRelationships(profiles, { ...owner, details: { ...owner.details, relationships } });
    }
    if (change.feeling) {
      const owner = ensureProfile(change.feeling.source), other = ensureProfile(change.feeling.target);
      const feelings = (owner.details?.feelings || []).filter(entry => entry.targetId !== other.id);
      if (!change.feeling.remove) feelings.push({ targetId: other.id, feeling: change.feeling.feeling });
      profiles = profiles.map(profile => profile.id === owner.id ? { ...profile, details: { ...profile.details, feelings } } : profile);
    }
    for (const family of change.parents || []) {
      const parent = ensureProfile(family.parent), child = ensureProfile(family.child);
      const relationships = (Details.relationshipsFor(profiles, parent.id) || [])
        .filter(entry => !(entry.targetId === child.id && entry.type === 'Familia'));
      relationships.push({ targetId: child.id, type: 'Familia', parentId: parent.id });
      profiles = Details.updateRelationships(profiles, { ...parent, details: { ...parent.details, relationships } });
    }
    if (change.relationship) profiles = root.PlanoCharacterFamily.resetChangedPositions(active.profiles, profiles);
    profiles = S.validateProfiles(profiles);
    saving = true;
    add.disabled = true;
    try {
      const project = await active.commit(active.project, profiles);
      if (token !== generation) return false;
      context = { ...active, project, profiles };
      render();
      return true;
    } finally {
      saving = false;
      if (token === generation) add.disabled = false;
    }
  }
  function setView(tree) {
    showingRelations = tree;
    $('#characters-title').textContent = tree ? 'Árbol de relaciones' : 'Personajes';
    cardsPanel.hidden = tree;
    relationsPanel.hidden = !tree;
    for (const [index, tab] of viewTabs.entries()) {
      const selected = Boolean(index) === tree;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (tree && context) {
      relations ??= root.PlanoCharacterRelations.create(relationsPanel, { commit: commitGraph, open: showProfile });
      relations.render(context.characters, context.profiles);
    }
    root.PlanoHistory?.changed();
  }
  for (const [index, tab] of viewTabs.entries()) {
    tab.addEventListener('click', () => setView(Boolean(index)));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      setView(Boolean(next));
      viewTabs[next].focus();
    });
  }
  function automaticNames() {
    return S.characterForms({ ...nameFields(), aliases: sourceName ? [sourceName] : [] });
  }
  function nameTag(name, index) {
    const chip = document.createElement('span');
    chip.className = 'character-tag';
    chip.textContent = name;
    if (index === undefined) chip.title = 'Nombre automático';
    else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Quitar apodo ' + name);
      remove.addEventListener('click', () => {
        editing.aliases.splice(index, 1);
        renderTags();
        (aliasInput.hidden ? aliasButton : aliasInput).focus();
      });
      chip.append(remove);
    }
    return chip;
  }
  function renderTags() {
    const automatic = automaticNames(), keys = new Set(automatic.map(S.characterKey));
    const aliases = editing.aliases.map((name, i) => ({ name, i })).filter(entry => !keys.has(S.characterKey(entry.name)));
    const preferred = primaryAlias.value;
    primaryAlias.replaceChildren(new Option('Usar nombre completo', ''), ...aliases.map(({ name }) => new Option(name, name)));
    primaryAlias.value = aliases.some(({ name }) => name === preferred) ? preferred : '';
    primaryRow.hidden = !aliases.length;
    tags.replaceChildren(...automatic.map(name => nameTag(name)), ...aliases.map(({ name, i }) => nameTag(name, i)));
  }
  function closeAlias(restoreFocus = false) {
    aliasInput.hidden = true;
    aliasInput.value = '';
    aliasInput.removeAttribute('aria-invalid');
    aliasButton.hidden = false;
    message(aliasError);
    if (restoreFocus) aliasButton.focus();
  }
  function finishAlias(restoreFocus = false) {
    if (aliasInput.hidden) return true;
    const name = aliasInput.value.trim().replace(/\s+/g, ' ');
    const key = S.characterKey(name);
    const duplicate = [...automaticNames(), ...editing.aliases].some(value => S.characterKey(value) === key);
    if (name && !duplicate) {
      const valid = /[\p{L}\p{N}]/u.test(key);
      if (!valid || editing.aliases.length >= 24) {
        message(aliasError, valid ? 'Puedes añadir hasta 24 apodos.' : 'Escribe un apodo válido.');
        aliasInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      const index = editing.aliases.push(name) - 1;
      tags.append(nameTag(name, index));
      primaryAlias.append(new Option(name, name));
      primaryRow.hidden = false;
    }
    closeAlias(restoreFocus);
    return true;
  }
  function fieldRow(label, value, wide = false) {
    const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
    row.classList.toggle('character-wide', wide);
    term.textContent = label;
    if (typeof value === 'string') detail.textContent = value || '—';
    else detail.append(value);
    row.append(term, detail);
    return row;
  }
  function showProfile(item, trigger) {
    viewing = item;
    opener = trigger;
    const profile = item.profile || { givenNames: item.name, aliases: [] };
    profileTitle.textContent = item.name;
    paintAvatar(reader.querySelector('[data-profile-initials]'), profile.avatar, item.name);
    message(reader.querySelector('[data-profile-role]'), profile.role);
    const hasReferences = item.mentions.length || item.dialogues.length;
    message(reader.querySelector('[data-profile-references]'), hasReferences ? references(item) : '');
    profileAliases.replaceChildren(...profile.aliases.map(name => {
      const tag = document.createElement('li');
      tag.textContent = name;
      if (name === profile.primaryAlias) {
        const label = document.createElement('small');
        label.textContent = 'Principal';
        tag.append(' ', label);
      }
      return tag;
    }));
    profileAliases.parentElement.hidden = !profile.aliases.length;
    const gender = fieldRow('Género', profile.gender || '');
    const previous = previousGenderData(profile);
    if (previous) {
      const note = document.createElement('small');
      note.className = 'character-gender-previous';
      note.textContent = previous;
      gender.querySelector('dd').append(note);
    }
    basics.replaceChildren(fieldRow('Edad', profile.age || ''), gender);
    if (profile.about) basics.append(fieldRow('Acerca de', profile.about, true));
    optionalFields.replaceChildren();
    const details = { ...profile.details };
    const marital = Details.maritalState(context.profiles, profile.id);
    if (marital.automatic || marital.value) details.maritalStatus = marital.label;
    const relationships = Details.displayRelationshipsFor(context.profiles, profile.id);
    if (relationships.length) details.relationships = relationships;
    const feelings = Details.feelingsFor(context.profiles, profile.id);
    if (feelings.length) details.feelings = feelings;
    for (const field of Details.fields.values()) {
      if (!Object.hasOwn(details, field.id)) continue;
      const value = details[field.id];
      if (field.kind === 'relationships' && value.length) {
        const byId = new Map(context.profiles.map(other => [other.id, S.characterName(other)]));
        const relations = document.createElement('ul');
        relations.className = 'character-profile-relations';
        for (const relationship of value) {
          const { targetId, type, sourceId } = relationship;
          const entry = document.createElement('li'), name = document.createElement('strong');
          name.textContent = byId.get(targetId);
          const description = sourceId === targetId && !Details.relationshipTypes.includes(type)
            ? 'Vínculo anotado desde su ficha («' + type + '»)' : Details.relationshipLabel(relationship, context.profiles);
          entry.append(name, ' · ' + description);
          if (relationship.inferred) {
            const automatic = document.createElement('small');
            automatic.className = 'character-kinship-auto';
            automatic.textContent = 'Automático';
            automatic.title = relationship.evidence + ' Se actualiza al editar los progenitores.';
            entry.append(automatic);
          }
          relations.append(entry);
        }
        optionalFields.append(fieldRow(field.label, relations, true));
      } else if (field.kind === 'feelings' && value.length) {
        const byId = new Map(context.profiles.map(other => [other.id, S.characterName(other)]));
        const entries = document.createElement('ul'); entries.className = 'character-profile-relations';
        for (const sentiment of value) {
          const entry = document.createElement('li'), name = document.createElement('strong');
          name.textContent = byId.get(sentiment.targetId);
          entry.append(sentiment.direction === 'incoming' ? 'De ' : 'Hacia ', name, ' · ' + sentiment.feeling);
          entries.append(entry);
        }
        optionalFields.append(fieldRow(field.label, entries, true));
      } else {
        const wide = field.kind === 'textarea' || field.kind === 'relationships' || field.kind === 'feelings';
        const row = fieldRow(field.label, typeof value === 'string' ? value : '', wide);
        if (field.id === 'maritalStatus' && marital.automatic) {
          const automatic = document.createElement('small');
          automatic.className = 'character-kinship-auto'; automatic.textContent = 'Automático';
          automatic.title = Details.maritalExplanation(marital);
          row.querySelector('dd').append(automatic);
        }
        optionalFields.append(row);
      }
    }
    additional.hidden = !optionalFields.childElementCount;
    form.hidden = true;
    reader.hidden = false;
    dialog.classList.add('is-reading');
    dialog.setAttribute('aria-labelledby', profileTitle.id);
    if (!dialog.open) dialog.showModal();
    profileScroll.scrollTop = 0;
    profileTitle.focus({ preventScroll: true });
  }
  function edit(item) {
    if (!context || saving) return;
    if (!item) { viewing = null; opener = null; }
    editing = item?.profile ? structuredClone(item.profile) : emptyProfile(item?.name || '');
    sourceName = item && !item.profile ? item.name : '';
    closeAlias();
    form.reset();
    for (const key of properties) fields[key].value = editing[key] ?? '';
    paintEditAvatar();
    message(genderPrevious, previousGenderData(editing));
    updateAboutCount();
    editTitle.textContent = item ? 'Editar personaje' : 'Nuevo personaje';
    message(formError);
    primaryAlias.value = '';
    renderTags();
    primaryAlias.value = editing.primaryAlias || '';
    const choices = context.characters.filter(other => other !== item).map(other => ({
      id: other.profile?.id || S.id(), name: other.name, profile: other.profile,
    }));
    choices.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    relationshipTargets = new Map(choices.map(choice => [choice.id, choice]));
    const relationships = Details.relationshipsFor(context.profiles, editing.id);
    if (relationships) editing.details = { ...editing.details, relationships };
    extras.open(editing.details, choices, editing.id, Details.maritalState(context.profiles, editing.id));
    reader.hidden = true;
    form.hidden = false;
    dialog.classList.remove('is-reading');
    dialog.setAttribute('aria-labelledby', editTitle.id);
    if (!dialog.open) dialog.showModal();
    editBody.scrollTop = 0;
    fields.givenNames.focus({ preventScroll: true });
  }
  function render(focusId) {
    const characters = S.analyze(context.script, context.profiles, { includeUnusedProfiles: true }).characters;
    context.characters = characters;
    status.textContent = count(characters.length, 'personaje', 'personajes');
    add.disabled = false;
    const cards = document.createDocumentFragment();
    for (const item of characters) {
      const card = document.createElement('button'), avatar = document.createElement('span');
      card.type = 'button';
      card.className = 'character-card';
      card.setAttribute('aria-haspopup', 'dialog');
      if (item.profile) card.dataset.characterId = item.profile.id;
      avatar.className = 'character-initials';
      avatar.setAttribute('aria-hidden', 'true');
      paintAvatar(avatar, item.profile?.avatar, item.name);
      const title = document.createElement('strong'), role = document.createElement('span'), summary = document.createElement('small');
      title.textContent = item.name;
      role.className = 'character-role';
      role.textContent = item.profile?.role || (item.profile ? 'Rol sin definir' : 'Del guion');
      summary.textContent = references(item);
      card.append(avatar, title, role, summary);
      card.addEventListener('click', () => showProfile(item, card));
      cards.append(card);
    }
    if (!characters.length) {
      const empty = document.createElement('p');
      empty.className = 'character-empty';
      empty.textContent = 'Aún no hay personajes. Crea una ficha o añade un personaje en el guion.';
      cards.append(empty);
    }
    list.replaceChildren(cards);
    if (showingRelations) relations?.render(characters, context.profiles);
    if (focusId) list.querySelector('[data-character-id="' + focusId + '"]')?.focus();
  }

  add.addEventListener('click', () => edit());
  const editProfile = reader.querySelector('[data-profile-edit]');
  function cancelEdit() {
    closeAlias();
    if (!viewing) { dialog.close(); return; }
    showProfile(viewing, opener);
    editProfile.focus({ preventScroll: true });
  }
  editProfile.addEventListener('click', () => edit(viewing));
  avatarTrigger.addEventListener('click', async () => {
    if (!context || saving || editingAvatar || !dialog.open) return;
    avatarEditor ??= root.PlanoCharacterAvatarEditor.create(dialog.parentElement);
    avatarTrigger.setAttribute('aria-controls', 'character-avatar-dialog');
    const token = generation, scrollTop = editBody.scrollTop;
    editingAvatar = true;
    dialog.close();
    const value = await avatarEditor.open(editing.avatar);
    if (token !== generation) return;
    editingAvatar = false;
    if (value) {
      editing.avatar = value;
      paintEditAvatar();
    }
    dialog.showModal();
    editBody.scrollTop = scrollTop;
    avatarTrigger.focus({ preventScroll: true });
  });
  reader.querySelector('[data-profile-close]').addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', cancelEdit);
  dialog.addEventListener('cancel', event => {
    if (saving || (viewing && !form.hidden)) event.preventDefault();
    if (!saving && viewing && !form.hidden) cancelEdit();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open || editingAvatar) return;
    if (context && opener?.isConnected) opener.focus();
    viewing = null;
    opener = null;
  });
  for (const key of characterContext) fields[key].addEventListener('input', () => {
    renderTags();
    if (!editing.avatar) paintEditAvatar();
  });
  fields.about.addEventListener('input', updateAboutCount);
  aliasButton.addEventListener('click', () => {
    aliasButton.hidden = true;
    aliasInput.hidden = false;
    aliasInput.focus();
  });
  aliasInput.addEventListener('blur', () => finishAlias());
  dialog.addEventListener('click', event => {
    if (document.activeElement === aliasInput && !aliasInput.parentElement.contains(event.target)) finishAlias();
  });
  aliasInput.addEventListener('input', () => {
    aliasInput.removeAttribute('aria-invalid');
    message(aliasError);
  });
  aliasInput.addEventListener('keydown', event => {
    if (event.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') closeAlias(true);
    else finishAlias(true);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!context || saving) return;
    if (!finishAlias()) { aliasInput.focus(); return; }
    const active = context, token = generation;
    const profile = {
      ...editing,
      ...Object.fromEntries(properties.map(key => [key, fields[key].value])),
      primaryAlias: primaryAlias.value,
      details: extras.read(),
    };
    if (sourceName && !S.characterForms(profile).some(name => S.characterKey(name) === S.characterKey(sourceName))) {
      profile.aliases = [...profile.aliases, sourceName];
    }
    const disabledForSave = [];
    try {
      const related = new Map();
      for (const { targetId } of [...(profile.details.relationships || []), ...(profile.details.feelings || [])]) {
        const target = relationshipTargets.get(targetId);
        if (target && !target.profile && !related.has(targetId)) related.set(targetId, emptyProfile(target.name, target.id));
      }
      const current = Details.updateRelationships(active.profiles, profile);
      const profiles = S.validateProfiles(root.PlanoCharacterFamily.resetChangedPositions(active.profiles, [...current, ...related.values()]));
      saving = true;
      form.setAttribute('aria-busy', 'true');
      disabledForSave.push(...[...fields].filter(control => !control.disabled));
      for (const control of disabledForSave) control.disabled = true;
      message(formError);
      const project = await active.commit(active.project, profiles);
      if (token !== generation) return;
      context = { ...active, project, profiles };
      if (viewing) {
        render();
        const updated = context.characters.find(item => item.profile?.id === profile.id);
        const trigger = showingRelations ? relationsPanel.querySelector('[data-character-key="' + profile.id + '"]')
          : list.querySelector('[data-character-id="' + profile.id + '"]');
        showProfile(updated, trigger);
      } else {
        dialog.close();
        render(profile.id);
      }
    } catch (reason) {
      if (token === generation) message(formError, reason.message || 'No se pudo guardar el personaje.');
    } finally {
      saving = false;
      form.removeAttribute('aria-busy');
      for (const control of disabledForSave) control.disabled = false;
    }
  });
  root.PlanoProjectCharacters = {
    setView, view: () => showingRelations,
    async open({ load, commit }) {
      const token = ++generation;
      context = null;
      relations?.clear();
      setView(false);
      list.replaceChildren();
      add.disabled = true;
      status.textContent = 'Cargando personajes…';
      message(error);
      $('#characters-title').focus();
      try {
        const details = await load();
        if (token !== generation) return;
        if (!details?.script) throw Error('Abre el guion para convertirlo a editable antes de crear fichas.');
        context = { ...details, commit };
        render();
      } catch (reason) {
        if (token === generation) { status.textContent = ''; message(error, reason.message); }
      }
    },
    close() {
      generation++;
      context = null;
      viewing = null;
      opener = null;
      editingAvatar = false;
      avatarEditor?.close();
      relations?.clear();
      closeAlias();
      if (dialog.open) dialog.close();
      list.replaceChildren();
    }
  };
})(globalThis);
