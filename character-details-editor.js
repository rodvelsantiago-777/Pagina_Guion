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
    const picker = section.querySelector('#character-field-picker');
    const output = section.querySelector('#character-extra-fields');
    let details = {}, targets = [];
    const customFields = new Set();

    function showPicker(open) {
      picker.hidden = !open;
      add.setAttribute('aria-expanded', String(open));
      if (open) picker.focus();
    }

    function renderPicker() {
      const options = [new Option('Elige un campo', '')];
      for (const field of catalog.fields.values()) {
        if (!Object.hasOwn(details, field.id)) options.push(new Option(field.label, field.id));
      }
      picker.replaceChildren(...options);
      add.disabled = options.length === 1;
      if (add.disabled) showPicker(false);
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
      for (const [index, relation] of relations.entries()) {
        const row = make('div', 'character-relation-row');
        const person = make('select');
        person.id = 'character-relation-target-' + index;
        person.required = true;
        person.append(new Option('Seleccionar personaje', ''), ...targets.map(target => new Option(target.name, target.id)));
        person.value = relation.targetId;
        person.addEventListener('change', () => { relation.targetId = person.value; });
        const type = make('input');
        type.id = 'character-relation-type-' + index;
        type.required = true;
        type.maxLength = catalog.relationshipLimit;
        type.placeholder = 'Ej. Hermana, mentor, rival';
        type.value = relation.type;
        type.addEventListener('input', () => { relation.type = type.value; });
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
      const addRelation = make('button', 'workspace-button character-add-relation', '+ Añadir relación');
      addRelation.type = 'button';
      addRelation.id = controlId('relationships');
      addRelation.disabled = !targets.length || relations.length >= catalog.maxRelationships;
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
      if (isRelationships || field.kind === 'textarea' || field.customLabel || field.label.length > 25) box.classList.add('character-wide');
      const heading = make('div', 'character-extra-field-heading');
      const remove = removeButton('Quitar campo ' + field.label, () => {
        delete details[field.id];
        customFields.delete(field.id);
        render();
        (picker.hidden ? add : picker).focus();
      });
      heading.append(isRelationships ? make('strong', '', field.label) : label(controlId(field.id), field.label), remove);
      box.append(heading);
      if (isRelationships) relationshipField(box);
      else scalarField(field, box);
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
    picker.addEventListener('change', () => {
      const field = catalog.fields.get(picker.value);
      if (!field) return;
      details[field.id] = field.kind === 'relationships' ? [] : '';
      showPicker(false);
      render();
      const control = document.getElementById(controlId(field.id));
      (control.disabled ? control.closest('.character-extra-field').querySelector('.character-detail-remove') : control).focus();
    });

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
