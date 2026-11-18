/* Editor del icono. El borrador se aplica a la ficha al guardar. */
(function (root) {
  'use strict';
  const Avatar = root.PlanoCharacterAvatar, Wardrobe = root.PlanoCharacterWardrobe;
  const features = [
    ['pelo', 'Peinado', { corto: 'Corto', medio: 'Media melena', largo: 'Largo', 'tres-pelos': 'Tres pelos', calvo: 'Sin cabello' }],
    ['edad', 'Edad visual', { joven: 'Joven', mayor: 'Mayor' }],
    ['expresion', 'Expresión facial', { feliz: 'Feliz', triste: 'Triste', serio: 'Serio', enojado: 'Enojado' }],
    ['vello', 'Vello facial', { ninguno: 'Sin vello facial', barba: 'Barba', bigote: 'Bigote', chivo: 'Barba de chivo' }],
    ['orejas', 'Orejas', { normales: 'Normales', puntiagudas: 'Puntiagudas (elfo)', ninguna: 'Sin orejas' }],
    ['colmillos', 'Colmillos', { ninguno: 'Sin colmillos', abajo: 'Hacia abajo', arriba: 'Hacia arriba' }],
    ['nariz', 'Nariz', { normal: 'Normal', grande: 'Grande y ancha' }],
    ['formaOjos', 'Forma de ojos', { rasgados: 'Rasgados', abiertos: 'Más abiertos' }],
  ];
  const detail = ['detallePiel', 'Detalle facial', { ninguno: 'Ninguno', pecas: 'Pecas', granos: 'Granos', rubor: 'Rubor' }];
  const outfit = ['vestuario', 'Vestuario', Object.fromEntries(Object.entries(Wardrobe.styles).map(([key, item]) => [key, item.label]))];
  const select = ([key, label, choices]) => `<div class="character-avatar-field">
    <label for="character-avatar-field-${key}">${label}</label><select id="character-avatar-field-${key}" name="${key}">${Object.entries(choices).map(
    ([value, text]) => `<option value="${value}">${text}</option>`
  ).join('')}</select></div>`;
  const toggle = (key, label) => `<label class="character-avatar-toggle"><input type="checkbox" name="${key}"> ${label}</label>`;
  const color = (key, label = '') => `<div class="character-avatar-color">
    <button class="color-launch" type="button" data-color-target="character-avatar-color-${key}" aria-haspopup="dialog" aria-controls="color-picker-dialog">
      <span class="character-avatar-swatch" aria-hidden="true"></span><strong>${label}</strong><code aria-hidden="true"></code>
    </button>
    <input type="color" name="${key}" id="character-avatar-color-${key}" hidden>
  </div>`;

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
        <div class="character-avatar-settings">
          <div class="character-avatar-fields">
            ${features.map(select).join('')}${toggle('cejas', 'Cejas')}${toggle('gafas', 'Gafas')}
          </div>
          <fieldset>
            <legend>Piel</legend>
            <div class="character-avatar-tones">${Avatar.tones.map(tone => `<label title="${tone.name}" style="--tone:${tone.color}">
              <input type="radio" name="piel" value="${tone.id}" aria-label="${tone.name}"><span aria-hidden="true"></span>
            </label>`).join('')}</div>
            ${color('piel', 'Color de piel personalizado')}
            ${select(detail)}
          </fieldset>
          <fieldset>
            <legend>Colores</legend>
            <div class="character-avatar-fields">${color('ojos', 'Ojos')}${color('cabello', 'Cabello')}</div>
          </fieldset>
          <div class="character-avatar-outfit">
            ${select(outfit)}
            <div class="character-avatar-fields" data-outfit-colors>${Wardrobe.colorKeys.map(key => color(key)).join('')}</div>
            <p data-fixed-color hidden>Uniforme y gorro blancos</p>
          </div>
        </div>
      </div>
      <footer>
        <button class="workspace-button character-avatar-reset" type="button" data-avatar-reset>Restablecer</button>
        <button class="workspace-button" type="button" data-avatar-cancel>Cancelar</button>
        <button class="workspace-button workspace-button-primary" type="submit">Guardar icono</button>
      </footer>
    </form>`;
    parent.append(dialog);
    const form = dialog.querySelector('form'), fields = form.elements, title = form.querySelector('h2');
    const settingsPanel = form.querySelector('.character-avatar-settings');
    const previews = [...form.querySelectorAll('[data-avatar-preview]')];
    const skinRadios = [...form.querySelectorAll('input[type="radio"][name="piel"]')];
    const colorRows = new Map([...form.querySelectorAll('.character-avatar-color')].map(row => {
      const input = row.querySelector('input'), launch = row.querySelector('button');
      return [input.name, { row, input, launch, label: launch.querySelector('strong'), code: launch.querySelector('code') }];
    }));
    const outfitColors = form.querySelector('[data-outfit-colors]'), fixedColor = form.querySelector('[data-fixed-color]');
    const editedPalettes = new Map();
    let settings, resolve;

    function paint() {
      const graphic = Avatar.svg(settings);
      for (const preview of previews) preview.innerHTML = graphic;
    }

    function syncColor(key, value) {
      const { input, launch, code } = colorRows.get(key);
      input.value = value.toLowerCase();
      code.textContent = value;
      root.PlanoColors.syncLaunch(launch);
    }

    function syncSkin() {
      for (const input of skinRadios) input.checked = Number(input.value) === settings.piel;
      syncColor('piel', Avatar.skinColor(settings.piel));
    }

    function syncOutfit() {
      const { colors } = Wardrobe.styles[settings.vestuario];
      outfitColors.hidden = !colors.length;
      fixedColor.hidden = Boolean(colors.length);
      for (const [index, key] of Wardrobe.colorKeys.entries()) {
        const { row, label } = colorRows.get(key);
        const choice = colors[index];
        row.hidden = !choice;
        if (!choice) continue;
        label.textContent = choice[0];
        syncColor(key, settings[key]);
      }
    }

    function syncForm() {
      for (const [key] of [...features, detail, outfit]) fields[key].value = settings[key];
      for (const key of ['cejas', 'gafas']) fields[key].checked = settings[key];
      for (const key of ['ojos', 'cabello']) syncColor(key, settings[key]);
      syncSkin();
      syncOutfit();
      paint();
    }

    function changeOutfit(style) {
      editedPalettes.set(settings.vestuario, Wardrobe.normalizeColors(settings.vestuario, settings));
      const next = { ...settings, vestuario: style };
      for (const key of Wardrobe.colorKeys) delete next[key];
      settings = Avatar.normalize(Object.assign(next, editedPalettes.get(style)));
      syncOutfit();
    }

    form.addEventListener('change', ({ target }) => {
      const { name: key, type, value } = target;
      if (!Object.hasOwn(settings, key)) return;
      if (key === 'vestuario') changeOutfit(value);
      else {
        const next = type === 'checkbox' ? target.checked : type === 'radio' ? Number(value) : value;
        settings = Avatar.normalize({ ...settings, [key]: next });
        if (key === 'piel') syncSkin();
        else if (type === 'color') syncColor(key, settings[key]);
      }
      paint();
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
