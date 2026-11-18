/* Edición de campos opcionales dentro de una ficha. */
(function (root) {
  'use strict';

  const catalog = root.PlanoCharacterDetails;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const controlId = id => 'character-detail-' + id;
  const customOption = '__character_custom__';

  function label(id, text) {
    const node = make('label', '', text);
    node.htmlFor = id;
    return node;
  }

  function removeButton(name, onClick) {
    const button = make('button', 'character-detail-remove', '×');
    button.type = 'button';
    button.title = name;
    button.setAttribute('aria-label', name);
    button.addEventListener('click', onClick);
    return button;
  }

  function create(section) {
    const add = section.querySelector('#character-add-field');
    const actions = add.parentElement;
    const picker = section.querySelector('#character-field-picker');
    const empty = picker.querySelector('.character-field-empty');
    const scroll = section.closest('.character-dialog-body');
    const output = section.querySelector('#character-extra-fields');
    let details = {}, targets = [];
    const customFields = new Set();
    const options = new Map();

    function buildPicker() {
      const items = document.createDocumentFragment();
      for (const field of catalog.fields.values()) {
        const item = make('li');
        const button = make('button', 'character-field-tag');
        const plus = make('span', 'character-field-tag-plus', '+');
        button.type = 'button';
        button.setAttribute('aria-label', 'Añadir ' + field.label);
        plus.setAttribute('aria-hidden', 'true');
        button.append(plus, field.label);
        button.addEventListener('click', () => chooseField(field, button));
        item.append(button);
        items.append(item);
        options.set(field.id, { item, button });
      }
      picker.append(items);
      renderPicker();
    }

    function showPicker(open) {
      if (open && !options.size) buildPicker();
      picker.hidden = !open;
      add.setAttribute('aria-expanded', String(open));
      if (open) actions.scrollIntoView({ block: actions.offsetHeight > scroll.clientHeight ? 'start' : 'nearest' });
    }

    function renderPicker() {
      let hasChoices = false;
      for (const [id, { item }] of options) {
        item.hidden = Object.hasOwn(details, id);
        if (!item.hidden) hasChoices = true;
      }
      empty.hidden = hasChoices;
    }

    function chooseField(field, button) {
      if (Object.hasOwn(details, field.id)) return;
      const available = [...picker.querySelectorAll('li:not([hidden]) button')];
      const index = available.indexOf(button);
      const next = available[index + 1] || available[index - 1] || add;
      const top = picker.getBoundingClientRect().top;
      details[field.id] = field.kind === 'relationships' ? [] : '';
      render();
      // Los campos aparecen encima del catálogo. Mantén las etiquetas a la vista.
      scroll.scrollTop += picker.getBoundingClientRect().top - top;
      next.focus();
    }

    function customInput(field, select, body) {
      const input = make('input');
      input.id = select.id + '-custom';
      input.maxLength = field.limit;
      input.value = customFields.has(field.id) ? details[field.id] : '';
      const row = make('div', 'character-custom-field');
      row.append(label(input.id, 'Especifica · ' + field.label), input);
      row.hidden = !customFields.has(field.id);
      input.required = !row.hidden;
      input.addEventListener('input', () => { details[field.id] = input.value; });
      select.addEventListener('change', () => {
        const custom = select.value === customOption;
        if (custom) customFields.add(field.id);
        else customFields.delete(field.id);
        row.hidden = !custom;
        input.required = custom;
        details[field.id] = custom ? input.value : select.value;
        if (custom) input.focus();
      });
      body.append(row);
    }

    function scalarField(field, body) {
      const control = make(field.kind === 'text' ? 'input' : field.kind);
      control.id = controlId(field.id);
      if (field.options) {
        control.append(new Option('Sin definir', ''));
        if (field.optionGroups) {
          for (const group of field.optionGroups) {
            const options = make('optgroup');
            options.label = group.label;
            options.append(...group.options.map(option => new Option(option, option)));
            control.append(options);
          }
        } else {
          control.append(...field.options.map(option => new Option(option, option)));
        }
        if (field.customLabel) control.append(new Option(field.customLabel + '…', customOption));
        control.value = customFields.has(field.id) ? customOption : details[field.id];
        if (!field.customLabel) control.addEventListener('change', () => { details[field.id] = control.value; });
      } else {
        control.maxLength = field.limit;
        if (field.kind === 'textarea') control.rows = 2;
        if (field.placeholder) control.placeholder = field.placeholder;
        control.value = details[field.id];
        control.addEventListener('input', () => { details[field.id] = control.value; });
      }
      body.append(control);
      if (field.customLabel) customInput(field, control, body);
    }

    function relationshipField(body) {
      const relations = details.relationships;
      const addRelation = make('button', 'workspace-button character-add-relation', '+ Añadir relación');
      function updateAddRelation() {
        const outgoing = relations.filter(relation => relation.sourceId !== relation.targetId).length;
        addRelation.disabled = !targets.length || outgoing >= catalog.maxRelationships;
      }
      for (const [index, relation] of relations.entries()) {
        const row = make('div', 'character-relation-row');
        const person = make('select');
        person.id = 'character-relation-target-' + index;
        person.required = true;
        person.append(new Option('Seleccionar personaje', ''), ...targets.map(target => new Option(target.name, target.id)));
        person.value = relation.targetId;
        const type = make('select');
        type.id = 'character-relation-type-' + index;
        type.required = true;
        type.append(new Option('Elegir vínculo', ''), ...catalog.relationshipTypes.map(name => new Option(name, name)));
        let legacy;
        if (relation.type && !catalog.relationshipTypes.includes(relation.type)) {
          const description = relation.sourceId === relation.targetId ? ' (desde su ficha)' : ' (descripción anterior)';
          legacy = new Option(relation.type + description, relation.type);
          type.append(legacy);
        }
        type.value = relation.type;
        type.addEventListener('change', () => { relation.type = type.value; });
        person.addEventListener('change', () => {
          relation.targetId = person.value;
          updateAddRelation();
          if (!legacy) return;
          if (type.value === legacy.value) type.value = relation.type = '';
          legacy.remove();
          legacy = null;
        });
        const remove = removeButton('Quitar relación ' + (index + 1), () => {
          relations.splice(index, 1);
          render();
          document.getElementById(controlId('relationships'))?.focus();
        });
        const personField = make('div', 'character-relation-control');
        const typeField = make('div', 'character-relation-control');
        personField.append(label(person.id, 'Personaje'), person);
        typeField.append(label(type.id, 'Tipo de vínculo'), type);
        row.append(personField, typeField, remove);
        body.append(row);
      }
      addRelation.type = 'button';
      addRelation.id = controlId('relationships');
      updateAddRelation();
      addRelation.addEventListener('click', () => {
        relations.push({ targetId: '', type: '' });
        render();
        document.getElementById('character-relation-target-' + (relations.length - 1))?.focus();
      });
      body.append(addRelation);
      if (!targets.length) body.append(make('p', 'character-relation-empty', 'Crea otro personaje del proyecto para vincularlo.'));
    }

    function renderField(field) {
      const isRelationships = field.kind === 'relationships';
      const box = make('div', 'character-extra-field');
      box.classList.toggle('character-wide', isRelationships || field.kind === 'textarea');
      const heading = make('div', 'character-extra-field-heading');
      const remove = removeButton('Quitar campo ' + field.label, () => {
        delete details[field.id];
        customFields.delete(field.id);
        render();
        (picker.hidden ? add : options.get(field.id).button).focus();
      });
      heading.append(isRelationships ? make('strong', '', field.label) : label(controlId(field.id), field.label), remove);
      box.append(heading);
      if (isRelationships) relationshipField(box);
      else {
        const controls = make('div', 'character-extra-field-controls');
        scalarField(field, controls);
        box.append(controls);
      }
      return box;
    }

    function render() {
      renderPicker();
      const content = document.createDocumentFragment();
      for (const field of catalog.fields.values()) {
        if (Object.hasOwn(details, field.id)) content.append(renderField(field));
      }
      output.replaceChildren(content);
    }

    add.addEventListener('click', () => showPicker(picker.hidden));

    return {
      open(values, choices) {
        details = values || {};
        targets = choices;
        customFields.clear();
        for (const [key, value] of Object.entries(details)) {
          const field = catalog.fields.get(key);
          if (value && field?.customLabel && !field.options.includes(value)) customFields.add(key);
        }
        showPicker(false);
        render();
      },
      read: () => details,
    };
  }

  root.PlanoCharacterDetailsEditor = { create };
})(globalThis);
