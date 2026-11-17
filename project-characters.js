/* Fichas por proyecto. El redactor y este panel comparten el índice de menciones. */
(function (root) {
  'use strict';
  const S = root.PlanoScreenplay, $ = selector => document.querySelector(selector);
  const list = $('#character-list'), add = $('#character-add');
  const status = $('#characters-summary'), error = $('#characters-error');
  const dialog = document.createElement('dialog');
  dialog.className = 'character-dialog';
  dialog.setAttribute('aria-labelledby', 'character-dialog-title');
  dialog.innerHTML = '<form autocomplete="off"><header><h2 id="character-dialog-title">Nuevo personaje</h2></header><div class="character-dialog-body">' +
    '<div class="character-fields"><label>Nombre(s)<input name="givenNames" maxlength="80" required></label>' +
    '<label>Apellido(s)<input name="surnames" maxlength="80"></label>' +
    '<label>Edad<input name="age" maxlength="32"></label>' +
    '<label>Sexo<select name="sex"><option value="">Sin definir</option></select></label>' +
    '<label class="character-wide">Rol en la historia<select name="role"><option value="">Sin definir</option></select></label>' +
    '<div class="character-about character-wide"><label for="character-about">Acerca de</label>' +
    '<textarea id="character-about" name="about" rows="3" maxlength="' + S.characterAboutLimit + '" aria-describedby="character-about-count"></textarea>' +
    '<span id="character-about-count" class="character-about-count"></span></div></div>' +
    '<fieldset class="character-aliases"><legend>Apodos y formas de nombrarlo</legend>' +
    '<div class="character-tags" aria-label="Nombres y apodos"></div>' +
    '<div class="character-add-alias"><input name="alias" maxlength="80" placeholder="Escribe un apodo" aria-label="Nuevo apodo">' +
    '<button type="button" class="workspace-button" data-add-alias aria-label="Añadir apodo" title="Añadir apodo">+</button></div>' +
    '<p>El nombre completo y el nombre de pila se incluyen automáticamente.</p>' +
    '<div class="character-primary-alias" hidden><label for="character-primary-alias">Apodo principal</label>' +
    '<select id="character-primary-alias" name="primaryAlias" aria-describedby="character-primary-help"></select>' +
    '<p id="character-primary-help">Así aparecerá al elegir quién habla en el redactor.</p></div></fieldset>' +
    '<section class="character-extras" aria-labelledby="character-extras-title">' +
    '<h3 id="character-extras-title">Información adicional</h3><div id="character-extra-fields"></div>' +
    '<div class="character-field-actions"><button id="character-add-field" class="workspace-button" type="button" aria-controls="character-field-picker" aria-expanded="false">+ Añadir campo</button>' +
    '<select id="character-field-picker" aria-label="Campo de información adicional" hidden></select></div></section></div>' +
    '<footer><p class="characters-error" role="alert" hidden></p>' +
    '<button class="workspace-button" type="button" id="cancel-character-profile">Cancelar</button>' +
    '<button class="workspace-button workspace-button-primary" type="submit">Guardar personaje</button></footer></form>';
  document.body.append(dialog);
  const form = dialog.querySelector('form'), fields = form.elements;
  const tags = dialog.querySelector('.character-tags'), formError = dialog.querySelector('.characters-error');
  const cancel = form.querySelector('#cancel-character-profile');
  const primaryAlias = fields.primaryAlias, primaryRow = primaryAlias.closest('.character-primary-alias');
  const aboutCount = form.querySelector('#character-about-count');
  const extras = root.PlanoCharacterDetailsEditor.create(form.querySelector('.character-extras'));
  for (const [field, choices] of [['sex', S.characterSexes], ['role', S.characterRoles]]) {
    for (const choice of choices) fields[field].append(new Option(choice, choice));
  }
  let context, editing, sourceName, relationshipTargets, saving = false, generation = 0;
  const properties = ['givenNames', 'surnames', 'age', 'sex', 'role', 'about'];
  const characterContext = ['givenNames', 'surnames'];
  const message = (node, text = '') => { node.textContent = text; node.hidden = !text; };
  const emptyProfile = (name, id = S.id()) => ({ id, givenNames: name, surnames: '', age: '', sex: '', role: '', aliases: [] });
  const count = (amount, one, many) => amount + ' ' + (amount === 1 ? one : many);
  const updateAboutCount = () => { aboutCount.textContent = fields.about.value.length + ' de ' + S.characterAboutLimit + ' caracteres'; };

  function nameFields() {
    return Object.fromEntries(characterContext.map(key => [key, fields[key].value.trim().replace(/\s+/g, ' ')]));
  }
  function automaticNames() {
    return S.characterForms({ ...nameFields(), aliases: sourceName ? [sourceName] : [] });
  }
  function renderTags() {
    const automatic = automaticNames(), keys = new Set(automatic.map(S.characterKey));
    const aliases = editing.aliases.map((name, i) => ({ name, i })).filter(entry => !keys.has(S.characterKey(entry.name)));
    const entries = [...automatic.map(name => ({ name, fixed: true })), ...aliases];
    const preferred = primaryAlias.value;
    primaryAlias.replaceChildren(new Option('Usar nombre completo', ''), ...aliases.map(({ name }) => new Option(name, name)));
    primaryAlias.value = aliases.some(({ name }) => name === preferred) ? preferred : '';
    primaryRow.hidden = !aliases.length;
    tags.replaceChildren();
    for (const entry of entries) {
      const chip = document.createElement('span');
      chip.className = 'character-tag';
      chip.textContent = entry.name;
      if (entry.fixed) chip.title = 'Nombre automático';
      else {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Quitar apodo ' + entry.name);
        remove.addEventListener('click', () => { editing.aliases.splice(entry.i, 1); renderTags(); fields.alias.focus(); });
        chip.append(remove);
      }
      tags.append(chip);
    }
  }
  function addAlias() {
    const name = fields.alias.value.trim().replace(/\s+/g, ' ');
    if (!name) return true;
    const key = S.characterKey(name);
    if (!/[\p{L}\p{N}]/u.test(key)) { message(formError, 'Escribe un apodo válido.'); return false; }
    if ([...automaticNames(), ...editing.aliases].some(form => S.characterKey(form) === key)) {
      fields.alias.value = '';
      return true;
    }
    if (editing.aliases.length >= 24) { message(formError, 'Puedes añadir hasta 24 apodos.'); return false; }
    editing.aliases.push(name);
    fields.alias.value = '';
    renderTags();
    message(formError);
    return true;
  }
  function edit(item) {
    if (!context || saving) return;
    editing = item?.profile ? structuredClone(item.profile) : emptyProfile(item?.name || '');
    sourceName = item && !item.profile ? item.name : '';
    form.reset();
    for (const key of properties) fields[key].value = editing[key] ?? '';
    updateAboutCount();
    dialog.querySelector('h2').textContent = item ? 'Ficha de personaje' : 'Nuevo personaje';
    message(formError);
    primaryAlias.value = '';
    renderTags();
    primaryAlias.value = editing.primaryAlias || '';
    const choices = context.characters.filter(other => other !== item).map(other => ({
      id: other.profile?.id || S.id(), name: other.name, profile: other.profile,
    }));
    choices.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    relationshipTargets = new Map(choices.map(choice => [choice.id, choice]));
    extras.open(editing.details, choices);
    dialog.showModal();
    fields.givenNames.focus();
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
      if (item.profile) card.dataset.characterId = item.profile.id;
      avatar.className = 'character-initials';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = item.name.split(/\s+/).slice(0, 2).map(name => Array.from(name)[0]).join('').toLocaleUpperCase('es');
      const title = document.createElement('strong'), role = document.createElement('span'), references = document.createElement('small');
      title.textContent = item.name;
      role.className = 'character-role';
      role.textContent = item.profile?.role || (item.profile ? 'Rol sin definir' : 'Del guion');
      references.textContent = count(item.mentions.reduce((total, row) => total + row.ranges.length, 0), 'mención', 'menciones') +
        ' · ' + count(item.dialogues.length, 'diálogo', 'diálogos');
      card.append(avatar, title, role, references);
      card.addEventListener('click', () => edit(item));
      cards.append(card);
    }
    if (!characters.length) {
      const empty = document.createElement('p');
      empty.className = 'character-empty';
      empty.textContent = 'Aún no hay personajes. Crea una ficha o añade un personaje en el guion.';
      cards.append(empty);
    }
    list.replaceChildren(cards);
    if (focusId) list.querySelector('[data-character-id="' + focusId + '"]')?.focus();
  }

  add.addEventListener('click', () => edit());
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  for (const key of characterContext) fields[key].addEventListener('input', renderTags);
  fields.about.addEventListener('input', updateAboutCount);
  dialog.querySelector('[data-add-alias]').addEventListener('click', () => { addAlias(); fields.alias.focus(); });
  fields.alias.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addAlias(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!context || saving || !addAlias()) return;
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
      for (const { targetId } of profile.details.relationships || []) {
        const target = relationshipTargets.get(targetId);
        if (target && !target.profile && !related.has(targetId)) related.set(targetId, emptyProfile(target.name, target.id));
      }
      const current = active.profiles.some(item => item.id === profile.id)
        ? active.profiles.map(item => item.id === profile.id ? profile : item) : [...active.profiles, profile];
      const profiles = S.validateProfiles([...current, ...related.values()]);
      saving = true;
      form.setAttribute('aria-busy', 'true');
      disabledForSave.push(...[...fields].filter(control => !control.disabled));
      for (const control of disabledForSave) control.disabled = true;
      message(formError);
      const project = await active.commit(active.project, profiles);
      if (token !== generation) return;
      context = { ...active, project, profiles };
      dialog.close();
      render(profile.id);
    } catch (reason) {
      if (token === generation) message(formError, reason.message || 'No se pudo guardar el personaje.');
    } finally {
      saving = false;
      form.removeAttribute('aria-busy');
      for (const control of disabledForSave) control.disabled = false;
    }
  });
  root.PlanoProjectCharacters = {
    async open({ load, commit }) {
      const token = ++generation;
      context = null;
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
      if (dialog.open) dialog.close();
      list.replaceChildren();
    }
  };
})(globalThis);
