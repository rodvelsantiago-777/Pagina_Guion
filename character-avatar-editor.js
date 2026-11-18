/* Editor del icono. El borrador se aplica a la ficha al guardar. */
(function (root) {
  'use strict';
  const Avatar = root.PlanoCharacterAvatar, Wardrobe = root.PlanoCharacterWardrobe, Palette = root.PlanoColors;
  const sharedColors = [
    '#252730', '#543628', '#765439', '#C69B5C', '#E8DED1',
    ...Palette.presets.map(hex => hex.toUpperCase()),
  ].map(hex => ({ hex }));
  const skinColors = [...Avatar.tones.map(({ id, name, color }) => ({ value: id, name, hex: color })),
    { name: 'Verde salvia', hex: '#73A884' }];
  const traits = {
    pelo: ['Peinado', { calvo: 'Sin cabello', 'tres-pelos': 'Tres pelos', corto: 'Corto', medio: 'Media melena', largo: 'Largo' }, '22 8 148 148',
      ['cabello', 'Color de cabello']],
    formaOjos: ['Forma de ojos', { abiertos: 'Más abiertos', rasgados: 'Rasgados' }, '57 49 78 78', ['ojos', 'Color de ojos']],
    expresion: ['Expresión facial', { feliz: 'Feliz', triste: 'Triste', serio: 'Serio', enojado: 'Enojado' }, '56 62 80 80'],
    detallePiel: ['Detalle facial', { ninguno: 'Sin detalle', pecas: 'Pecas', granos: 'Granos', rubor: 'Rubor' }, '59 63 74 74',
      ['piel', 'Color de piel', skinColors]],
    vestuario: ['Vestuario', Object.fromEntries(Object.entries(Wardrobe.styles).map(([id, item]) => [id, item.label]))],
    vello: ['Vello facial', { ninguno: 'Sin vello facial', barba: 'Barba', bigote: 'Bigote', chivo: 'Barba de chivo' }, '51 61 90 90'],
    orejas: ['Orejas', { normales: 'Normales', puntiagudas: 'Puntiagudas (elfo)', ninguna: 'Sin orejas' }, '26 29 140 140'],
    nariz: ['Nariz', { normal: 'Normal', grande: 'Grande y ancha' }, '63 65 66 66'],
    cejas: ['Cejas', { true: 'Con cejas', false: 'Sin cejas' }, '55 48 82 82'],
    gafas: ['Gafas', { true: 'Con gafas', false: 'Sin gafas' }, '49 44 94 94'],
    colmillos: ['Colmillos', { ninguno: 'Sin colmillos', abajo: 'Hacia abajo', arriba: 'Hacia arriba' }, '70 85 52 52'],
    edad: ['Edad visual', { joven: 'Joven', mayor: 'Mayor' }, '52 51 88 88'],
  };
  const menus = [
    ['pelo', 'Peinado', ['pelo'], 'pelo'],
    ['ojos', 'Ojos y expresión', ['formaOjos', 'expresion'], 'formaOjos'],
    ['rostro', 'Rasgos faciales', ['colmillos', 'nariz', 'orejas']],
    ['vello', 'Cejas y vello facial', ['cejas', 'vello']],
    ['piel', 'Piel y edad', ['detallePiel', 'edad']],
    ['vestuario', 'Vestuario y gafas', ['vestuario', 'gafas'], 'vestuario'],
  ];
  const booleanKeys = new Set(['cejas', 'gafas']);
  const choiceValue = (key, value) => booleanKeys.has(key) ? value === 'true' : value;
  const swatch = ({ hex, value = hex, name = hex }) => `<button type="button" class="character-avatar-color-choice"
    data-avatar-swatch="${value}" data-hex="${hex}" style="--swatch:${hex}" aria-pressed="false"
    aria-label="Usar color ${name}" title="${name}"></button>`;
  const color = (menu, key, label = '', palette = sharedColors) => `<fieldset class="character-avatar-color" data-avatar-color="${key}">
    <legend>${label}</legend>
    <div class="character-avatar-swatches">${palette.slice(0, 13).map(swatch).join('')}</div>
    <button class="color-launch" type="button" data-custom-color data-color-target="character-avatar-color-${menu}-${key}"
      aria-label="${label} personalizado" aria-haspopup="dialog" aria-controls="color-picker-dialog">
      <span class="character-avatar-swatch" aria-hidden="true"></span><strong>Color personalizado</strong><code aria-hidden="true"></code>
    </button>
    <input type="color" name="${key}" id="character-avatar-color-${menu}-${key}" hidden>
  </fieldset>`;

  function traitMarkup(key, showTitle) {
    const [label, choices, , palette] = traits[key];
    const options = Object.entries(choices).map(([value, name]) => `<label class="character-avatar-choice">
      <input type="radio" name="${key}" value="${value}" aria-label="${name}">
      <span class="character-avatar-art character-avatar-thumbnail" aria-hidden="true"></span>
      <span class="character-avatar-choice-name">${name}</span>
    </label>`).join('');
    const clothes = key === 'vestuario';
    const colors = clothes
      ? `<div class="character-avatar-outfit-colors" data-outfit-colors>${Wardrobe.colorKeys.map(channel => color(key, channel, '', [])).join('')}</div>`
        + '<p class="character-avatar-fixed-color" data-fixed-color hidden>Uniforme y gorro blancos</p>'
      : palette ? color(key, ...palette) : '';
    return `<div class="character-avatar-trait" data-avatar-trait="${key}">
      ${showTitle ? `<h3>${label}</h3>` : ''}
      <div class="character-avatar-choices${clothes ? ' character-avatar-clothes' : ''}"
        role="group" aria-label="${label}"${clothes ? ' tabindex="0"' : ''}>${options}</div>
      ${colors}
    </div>`;
  }

  function menuMarkup([menu, label, keys]) {
    return `<details class="character-avatar-menu" name="plano-character-avatar-options" data-avatar-menu="${menu}">
      <summary><span>${label}</span><span data-current-option></span><span class="character-avatar-chevron" aria-hidden="true"></span></summary>
      <div class="character-avatar-menu-body">
        ${keys.map(key => traitMarkup(key, keys.length > 1)).join('')}
        ${menu === 'vello' ? color(menu, 'cabello', 'Color de cabello, cejas y vello') : ''}
      </div>
    </details>`;
  }

  function create(parent) {
    const dialog = document.createElement('dialog');
    dialog.id = 'character-avatar-dialog';
    dialog.className = 'character-avatar-dialog';
    dialog.setAttribute('aria-labelledby', 'character-avatar-title');
    dialog.innerHTML = `<form autocomplete="off">
      <header><h2 id="character-avatar-title" tabindex="-1">Creador de personaje</h2></header>
      <div class="character-avatar-workbench">
        <div class="character-avatar-preview">
          <div class="character-avatar-art character-avatar-large" data-avatar-preview></div>
          <div class="character-avatar-examples">
            <div><span class="character-avatar-art character-avatar-profile" data-avatar-preview></span>En la ficha</div>
            <div><span class="character-avatar-art character-avatar-card" data-avatar-preview></span>En la lista</div>
          </div>
        </div>
        <div class="character-avatar-settings">${menus.map(menuMarkup).join('')}</div>
      </div>
      <footer>
        <button class="workspace-button character-avatar-reset" type="button" data-avatar-reset>Restablecer</button>
        <button class="workspace-button" type="button" data-avatar-cancel>Cancelar</button>
        <button class="workspace-button workspace-button-primary" type="submit">Guardar icono</button>
      </footer>
    </form>`;
    parent.append(dialog);
    const form = dialog.querySelector('form'), title = form.querySelector('h2');
    const settingsPanel = form.querySelector('.character-avatar-settings');
    const panels = new Map(menus.map(([menu, , keys, selectedKey]) => {
      const panel = settingsPanel.querySelector(`[data-avatar-menu="${menu}"]`);
      const fields = keys.map(key => ({
        key, crop: traits[key][2], options: [...panel.querySelectorAll(`input[name="${key}"]`)],
      }));
      return [menu, { fields, selectedKey, panel, current: panel.querySelector('[data-current-option]') }];
    }));
    const previews = [...form.querySelectorAll('[data-avatar-preview]')];
    const colorRows = [...form.querySelectorAll('[data-avatar-color]')].map(row => {
      const input = row.querySelector('input'), launch = row.querySelector('button.color-launch');
      return { key: input.name, row, input, launch, label: row.querySelector('legend'), swatches: row.querySelector('.character-avatar-swatches'),
        code: launch.querySelector('code') };
    });
    const outfitColors = form.querySelector('[data-outfit-colors]'), fixedColor = form.querySelector('[data-fixed-color]');
    const garmentColors = colorRows.filter(({ key }) => Wardrobe.colorKeys.includes(key));
    const editedPalettes = new Map();
    const activeMenu = () => panels.get(settingsPanel.querySelector('details[open]')?.dataset.avatarMenu);
    let settings, resolve;

    function paint() {
      const graphic = Avatar.svg(settings);
      for (const preview of previews) preview.innerHTML = graphic;
    }

    function paintChoices(section) {
      if (!section?.panel.open) return;
      for (const { key, options, crop } of section.fields) for (const input of options) {
        const value = choiceValue(key, input.value);
        const garment = key === 'vestuario' ? Wardrobe.normalizeColors(value, value === settings.vestuario ? settings : editedPalettes.get(value)) : {};
        const thumbnail = input.nextElementSibling;
        thumbnail.innerHTML = Avatar.svg({ ...settings, ...garment, [key]: value }, { hideHeadwear: key === 'pelo' });
        if (crop) thumbnail.firstElementChild.setAttribute('viewBox', crop);
      }
    }

    function syncSelection() {
      for (const { fields, selectedKey, current } of panels.values()) {
        current.textContent = selectedKey ? traits[selectedKey][1][settings[selectedKey]] : '';
        for (const { key, options } of fields) for (const input of options) input.checked = input.value === String(settings[key]);
      }
    }

    function syncColor({ key, row, input, launch, swatches, code }) {
      if (row.hidden) return;
      const hex = key === 'piel' ? Avatar.skinColor(settings.piel) : settings[key];
      input.value = hex.toLowerCase();
      code.textContent = hex;
      Palette.syncLaunch(launch);
      for (const button of swatches.children) button.setAttribute('aria-pressed', String(button.dataset.hex === hex));
    }

    function syncOutfit() {
      const { colors } = Wardrobe.styles[settings.vestuario];
      outfitColors.hidden = !colors.length;
      fixedColor.hidden = Boolean(colors.length);
      for (const [index, { row, label, launch, swatches }] of garmentColors.entries()) {
        const choice = colors[index];
        row.hidden = !choice;
        if (!choice) continue;
        const [name, initial, presets] = choice;
        label.textContent = name;
        launch.setAttribute('aria-label', name + ' personalizado');
        swatches.innerHTML = [initial, ...presets].slice(0, 13).map(hex => swatch({ hex })).join('');
      }
    }

    function syncForm() {
      syncOutfit();
      syncSelection();
      colorRows.forEach(syncColor);
      paint();
      paintChoices(activeMenu());
    }

    function changeOutfit(style) {
      editedPalettes.set(settings.vestuario, Wardrobe.normalizeColors(settings.vestuario, settings));
      const next = { ...settings, vestuario: style };
      for (const key of Wardrobe.colorKeys) delete next[key];
      settings = Avatar.normalize(Object.assign(next, editedPalettes.get(style)));
      syncOutfit();
    }

    function edit(key, value) {
      if (key === 'vestuario') changeOutfit(value);
      else settings = Avatar.normalize({ ...settings, [key]: value });
      syncSelection();
      colorRows.forEach(syncColor);
      paint();
      paintChoices(activeMenu());
    }

    settingsPanel.addEventListener('toggle', event => {
      const section = panels.get(event.target.dataset.avatarMenu);
      if (!resolve || !section?.panel.open) return;
      paintChoices(section);
      const bounds = settingsPanel.getBoundingClientRect(), summary = section.panel.firstElementChild.getBoundingClientRect();
      if (summary.top < bounds.top) settingsPanel.scrollTop += summary.top - bounds.top;
      else if (summary.bottom > bounds.bottom) settingsPanel.scrollTop += summary.bottom - bounds.bottom;
      const row = section.panel.querySelector('.character-avatar-clothes');
      if (row) {
        const selected = row.querySelector('input:checked').parentElement;
        const area = row.getBoundingClientRect(), chip = selected.getBoundingClientRect();
        if (chip.left < area.left) row.scrollLeft += chip.left - area.left;
        else if (chip.right > area.right) row.scrollLeft += chip.right - area.right;
      }
    }, true);
    form.addEventListener('change', ({ target }) => {
      if (!Object.hasOwn(settings, target.name)) return;
      edit(target.name, choiceValue(target.name, target.value));
    });
    form.addEventListener('click', event => {
      const button = event.target.closest('[data-avatar-swatch]');
      if (!button) return;
      const key = button.closest('[data-avatar-color]').dataset.avatarColor;
      const value = button.dataset.avatarSwatch;
      edit(key, value.startsWith('#') ? value : Number(value));
    });
    form.querySelector('[data-avatar-reset]').addEventListener('click', () => {
      editedPalettes.clear();
      settings = Avatar.normalize();
      syncForm();
    });

    function finish(result) {
      if (!resolve) return;
      const complete = resolve;
      resolve = null;
      const palette = dialog.querySelector('#color-picker-dialog');
      if (palette) {
        root.PlanoPopover.hide(palette);
        document.body.append(palette);
      }
      if (dialog.open) dialog.close();
      complete(result);
    }
    form.querySelector('[data-avatar-cancel]').addEventListener('click', () => finish());
    form.addEventListener('submit', event => {
      event.preventDefault();
      finish(Avatar.validate(settings));
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish();
    });
    dialog.addEventListener('close', () => { if (!dialog.open) finish(); });

    return {
      open(value) {
        settings = Avatar.normalize(value);
        editedPalettes.clear();
        panels.get('pelo').panel.open = true;
        syncForm();
        const completion = new Promise(done => { resolve = done; });
        dialog.showModal();
        settingsPanel.scrollTop = 0;
        title.focus({ preventScroll: true });
        return completion;
      },
      close() { finish(); },
    };
  }

  root.PlanoCharacterAvatarEditor = { create };
})(globalThis);
