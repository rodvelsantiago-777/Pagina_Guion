/* Piezas del busto compartidas por todas las configuraciones. */
(function (root) {
  'use strict';

  const wardrobe = typeof module === 'object' && module.exports
    ? require('./character-avatar-wardrobe.js') : root.PlanoCharacterWardrobe;
  const versions = [1, 2, 3];
  const tones = Object.freeze([
    { id: 5, name: 'Marfil', color: '#FBE2CE' },
    { id: 0, name: 'Claro', color: '#F5D4B7' },
    { id: 6, name: 'Claro rosado', color: '#ECC3AC' },
    { id: 7, name: 'Claro dorado', color: '#EDBA8B' },
    { id: 1, name: 'Medio claro', color: '#E3A978' },
    { id: 8, name: 'Medio oliva', color: '#BF936C' },
    { id: 2, name: 'Medio', color: '#C78556' },
    { id: 9, name: 'Bronce', color: '#AE6F49' },
    { id: 3, name: 'Medio oscuro', color: '#955B40' },
    { id: 10, name: 'Castaño', color: '#7E4A35' },
    { id: 4, name: 'Oscuro', color: '#603B30' },
    { id: 11, name: 'Profundo', color: '#422921' },
  ]);
  const skinColors = new Map(tones.map(({ id, color }) => [id, color]));
  const skinColor = value => skinColors.get(value) ?? value;
  const hexColor = /^#[0-9a-f]{6}$/i;
  const savedEyeDefault = 'rasgados';
  const baseDefaults = Object.freeze({
    v: 3, pelo: 'medio', gafas: false, cejas: true, nariz: 'normal', piel: 1,
    vello: 'ninguno', expresion: 'feliz', edad: 'joven', orejas: 'normales', colmillos: 'ninguno', detallePiel: 'ninguno',
    ojos: '#765439', formaOjos: 'abiertos', cabello: '#543628', vestuario: 'camiseta',
  });
  const colorKeys = ['ojos', 'cabello'];
  const expressions = {
    feliz: {
      brows: 'M67 78q7-4 15 0M110 78q8-4 15 0',
      eyes: {
        rasgados: { upperLid: 'M64 88.4q9.5-10 20 .1', lowerLid: 'q-10 4.8-20-.1Z', irisY: 87.9 },
        abiertos: { upperLid: 'M64 88q9.6-15.4 20.6.3', lowerLid: 'q-10 10.2-20.6-.3Z', irisY: 87.8 },
      },
      mouth: 'M86.5 111.5q9.5 7.6 19 0', fangY: 114.45,
    },
    triste: {
      brows: 'M67 80q8 0 15-5M110 75q8 5 15 5',
      eyes: {
        rasgados: { upperLid: 'M64 91.1q8-9.1 20-4.6', lowerLid: 'q-8.5 8-20 4.6Z', irisY: 89.8 },
        abiertos: { upperLid: 'M64 91q8.2-14.3 20.4-5.5', lowerLid: 'q-8 13.7-20.4 5.5Z', irisY: 89.8 },
      },
      mouth: 'M88 116.7q8-8 16 0', fangY: 114.3,
    },
    serio: {
      brows: 'M67 78q8-2 15 0M110 78q8-2 15 0',
      eyes: {
        rasgados: { upperLid: 'M64 88q10-5.5 20 0', lowerLid: 'q-10 6.3-20 0Z', irisY: 88.6 },
        abiertos: { upperLid: 'M64 88.3q9.8-12.2 20.4 0', lowerLid: 'q-10.2 10.8-20.4 0Z', irisY: 88.5 },
      },
      mouth: 'M88.5 113.5h15', fangY: 113.5,
    },
    enojado: {
      brows: 'M67 77q7-1 15 5M110 82q8-6 15-5',
      eyes: {
        rasgados: { upperLid: 'M64 85.4q9-.7 20 5.6', lowerLid: 'q-11.5 4.4-20-5.6Z', irisY: 89.9 },
        abiertos: { upperLid: 'M64 85.7q9.5-4.7 20.6 5.3', lowerLid: 'q-12 9.3-20.6-5.3Z', irisY: 89.8 },
      },
      mouth: 'M87.5 115q2-2.6 5.5-2.6h5.5q3.8 0 6 2.6', fangY: 113.1,
    },
  };
  const shapeOptions = {
    pelo: ['corto', 'medio', 'largo', 'tres-pelos', 'calvo'], edad: ['joven', 'mayor'],
    expresion: Object.keys(expressions), vello: ['ninguno', 'barba', 'bigote', 'chivo'],
    orejas: ['normales', 'puntiagudas', 'ninguna'], colmillos: ['ninguno', 'abajo', 'arriba'],
    detallePiel: ['ninguno', 'pecas', 'granos', 'rubor'], nariz: ['normal', 'grande'],
    formaOjos: ['rasgados', 'abiertos'],
  };
  const legacyHair = new Map([
    ['femenino-corto', 'medio'], ['femenino-largo', 'largo'], ['masculino-corto', 'corto'], ['masculino-largo', 'medio'],
  ]);
  const mustache = 'M96 104c-4-2-8-1-12 2-2 1-4 2-6 2 2 3 6 4 10 2 3-1 5-3 8-3s5 2 8 3c4 2 8 1 10-2-2 0-4-1-6-2-4-3-8-4-12-2Z';
  const beard = 'M51 88l5 3c5 14 10 21 18 25 7 4 14 6 22 6s15-2 22-6c8-4 13-11 18-25l5-3v56H51Z';
  const facialHair = { ninguno: '', bigote: mustache, barba: beard + mustache, chivo: 'M85 119q11 5 22 0c0 11-5 16-11 18-6-2-11-7-11-18Z' };
  const freckles = [
    [70, 100.5, .8], [74, 103.3, .9], [76, 96.8, .85], [79, 99, 1], [83, 96, .95],
    [84, 101.5, 1.05], [87.5, 98, 1.15], [91, 95.5, .8], [96, 95, .9], [100.5, 95.5, .85],
    [104, 98.5, 1.2], [108, 96.5, .9], [109, 102, 1.05], [113, 99.5, 1],
    [117, 96.9, .8], [118.5, 103.7, .9], [122, 100.5, .85],
  ];
  const pimples = [[86, 65, 1.8], [110, 69, 2], [67, 100, 2.15], [75, 106, 1.7], [119, 104, 2.25], [124, 110, 1.65], [100, 128, 1.85]];

  function normalize(value) {
    const model = { ...baseDefaults };
    if (!versions.includes(value?.v)) return Object.assign(model, wardrobe.normalizeColors(model.vestuario));
    model.formaOjos = savedEyeDefault;
    for (const [key, options] of Object.entries(shapeOptions)) {
      if (options.includes(value[key])) model[key] = value[key];
    }
    if (value.v === 1) model.pelo = legacyHair.get(value.rostro + '-' + value.pelo) || baseDefaults.pelo;
    for (const key of ['gafas', 'cejas']) {
      if (typeof value[key] === 'boolean') model[key] = value[key];
    }
    if (skinColors.has(value.piel)) model.piel = value.piel;
    else if (typeof value.piel === 'string' && hexColor.test(value.piel)) model.piel = value.piel.toUpperCase();
    for (const key of colorKeys) {
      if (typeof value[key] === 'string' && hexColor.test(value[key])) model[key] = value[key].toUpperCase();
    }
    const wasOfficeOutfit = value.v === 3 && value.vestuario === 'oficinista';
    const style = wasOfficeOutfit ? 'traje' : value.vestuario;
    if (value.v === 3 && typeof style === 'string' && Object.hasOwn(wardrobe.styles, style)) model.vestuario = style;
    return Object.assign(model, wardrobe.normalizeColors(model.vestuario, wasOfficeOutfit ? { ropa2: value.ropa } : value));
  }

  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !versions.includes(value.v)) return undefined;
    const model = normalize(value);
    const defaults = { ...baseDefaults, formaOjos: savedEyeDefault, ...wardrobe.normalizeColors(model.vestuario) };
    return Object.fromEntries(Object.entries(model).filter(([key, setting]) => key === 'v' || setting !== defaults[key]));
  }

  function mix(color, tint, weight) {
    let result = '#';
    for (const index of [1, 3, 5]) {
      const base = parseInt(color.slice(index, index + 2), 16);
      const other = parseInt(tint.slice(index, index + 2), 16);
      result += Math.round(base + (other - base) * weight).toString(16).padStart(2, '0');
    }
    return result;
  }

  const hair = {
    medio: {
      back: 'M46 78C46 45 63 25 94 23c31-2 52 17 55 49 1 18-1 39 6 55-12 3-20 0-25-6l-65 1c-7 9-16 11-27 6 8-15 7-31 8-50Z',
      front: 'M48 79c-3-24 5-42 19-52 8-6 18-8 30-8 34 0 53 20 52 55l-9 14c-3-22-6-33-21-41-9 12-21 18-40 22-12 3-19 7-22 16l-9-6Z',
      sheen: 'M61 51c11-16 28-23 49-21-7 4-13 8-21 16-8 6-18 10-28 14l-4 2 4-11Z',
    },
    largo: {
      back: 'M44 75c0-28 15-52 49-54 32-2 55 16 57 50 2 35 5 56 18 85-20 4-33 0-45-5H69c-12 6-28 10-47 5 17-24 20-54 22-81Z',
      front: 'M47 81c-4-26 6-47 23-56 16-9 44-8 58 3 17 12 24 29 20 51l-8 10c-5-23-14-31-29-41-12 14-28 19-48 25l-9 26-7-18Z',
      sheen: 'M59 56c8-17 24-25 48-25-7 6-15 10-24 16-8 5-16 10-27 14l3-5Z',
    },
    corto: {
      back: 'M49 80c-4-26 2-47 23-57 17-8 42-5 57 8 13 12 18 30 14 50l-7 11-79-3-8-9Z',
      front: 'M50 82c-7-22-4-42 10-54 5-4 13-7 19-8l-3-7 14 6 5-6 8 7c23 0 41 14 42 39l-5 24-6-9-3-18c-19 5-44 3-63-4l-5 21-5 10-8-1Z',
      sheen: 'M59 45c10-14 24-20 47-17 8 1 16 3 21 8-23-2-45 10-65 15l-4 1 1-7Z',
    },
  };

  function drawEars(style, skin, shadow) {
    if (style === 'ninguna') return '';
    if (style === 'normales') {
      return `<g data-ears="normales" fill="${shadow}"><ellipse cx="55" cy="92" rx="8" ry="11"/><ellipse cx="137" cy="92" rx="8" ry="11"/></g>`;
    }
    const pointedEar = `<path fill="${skin}" d="M59 88c-6-6-16-8-24-16 1 6 3 11 4 16 2 9 8 15 15 15 5 0 8-4 8-9Z"/>
      <path fill="${shadow}" d="M52 97c-5-2-8-8-10-16 5 4 11 5 14 10 1 3-1 6-4 6Z"/>`;
    return `<g data-ears="puntiagudas">${pointedEar}<g transform="translate(192 0) scale(-1 1)">${pointedEar}</g></g>`;
  }

  function drawEyes({ upperLid, lowerLid, irisY }, iris, outline) {
    const eyeShape = upperLid + lowerLid;
    const eye = glintX => `<path fill="#FFFAF2" d="${eyeShape}"/>
      <g style="clip-path: path('${eyeShape}') view-box">
        <circle cx="75" cy="${irisY}" r="4.6" fill="${iris}"/>
        <circle cx="75" cy="${irisY}" r="2" fill="#271D22"/>
        <circle cx="${glintX}" cy="${irisY - 1.3}" r="1.05" fill="#FFF9F0"/>
      </g>
      <path data-lid="" fill="none" stroke="${outline}" stroke-width="1.55" stroke-linecap="round" d="${upperLid}"/>`;
    return `<g data-eyes="">${eye(76.3)}<g transform="translate(192 0) scale(-1 1)">${eye(73.7)}</g></g>`;
  }

  function drawMouth({ mouth, fangY }, direction, color) {
    const lip = `<path data-mouth="" d="${mouth}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
    if (direction === 'ninguno') return lip;

    const scale = direction === 'arriba' ? -1 : 1;
    const teeth = `<path data-fangs="${direction}" transform="translate(96 ${fangY}) scale(1 ${scale})"
      d="M-6.8 0h4.3c-.4 2.4-1.5 4.4-3.15 5.5c.05-2.2-.45-4-1.15-5.5ZM6.8 0H2.5c.4 2.4 1.5 4.4 3.15 5.5c-.05-2.2.45-4 1.15-5.5Z"
      fill="#FFF9EE" stroke="${color}" stroke-width=".85" stroke-linejoin="round" paint-order="stroke fill"/>`;
    return teeth + lip;
  }

  function drawSkinDetail(detail, skin) {
    if (detail === 'ninguno') return '';
    if (detail === 'rubor') {
      const blush = mix(skin, '#D56679', .46);
      return `<g data-skin-detail="rubor" fill="${blush}"><ellipse cx="72" cy="101" rx="8" ry="3.9"/><ellipse cx="120" cy="101" rx="8" ry="3.9"/></g>`;
    }
    if (detail === 'pecas') {
      const dots = freckles.map(([x, y, radius]) => `<circle cx="${x}" cy="${y}" r="${radius}"/>`).join('');
      return `<g data-skin-detail="pecas" fill="${mix(skin, '#4A2A32', .47)}">${dots}</g>`;
    }
    const spot = mix(skin, '#000000', .23);
    const highlight = mix(skin, '#FFFFFF', .19);
    const dots = pimples.map(([x, y, radius]) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${spot}"/><circle cx="${x - .35}" cy="${y - .45}" r=".65" fill="${highlight}"/>`).join('');
    return `<g data-skin-detail="granos">${dots}</g>`;
  }

  function drawNose(shape, skin, shadow) {
    if (shape === 'normal') {
      return `<path data-nose="normal" d="M95 90l-2.5 10q2.8 2.4 6 .6" fill="none" stroke="${shadow}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<g data-nose="grande">
      <path fill="${skin}" d="M87 100c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5Z"/>
      <path fill="none" stroke="${shadow}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"
        d="M94 87c-.6 4.5-1.8 7.4-3.2 9.3m-1.5.7c-3.2 2-3.5 4.8-.8 6.1 1.3.65 3.15.65 4.5.2q3 2.7 6 0c1.35.45 3.2.45 4.5-.2 2.7-1.3 2.4-4.1-.8-6.1"/>
      <path d="M93 98q3-1.7 6 0" fill="none" stroke="${mix(skin, '#FFFFFF', .24)}" stroke-width="1.5" stroke-linecap="round"/>
    </g>`;
  }

  function svg(value, { hideHeadwear = false } = {}) {
    const model = normalize(value);
    const skin = skinColor(model.piel);
    const shadow = mix(skin, '#44263A', .28);
    const light = mix(skin, '#FFF4E8', .22);
    const brows = mix(model.cabello, '#30212B', .39);
    const mouthColor = mix(skin, '#5F2735', .55);
    const strands = hair[model.pelo];
    const expression = expressions[model.expresion];
    const facialHairPath = facialHair[model.vello];
    const outfit = wardrobe.render(model, mix);
    const headwear = hideHeadwear ? '' : outfit.headwear;
    const hairMask = headwear ? ` style="clip-path: path('${outfit.hairline}') view-box"` : '';
    // La piel y la barba comparten el contorno de la mandíbula.
    const face = 'M55 71c0-24 17-39 41-39 23 0 41 15 41 39v20c0 21-10 34-26 44-5 3-10 5-15 5-6 0-11-2-16-5-15-10-25-23-25-44V71Z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="Busto del personaje">
      ${strands ? `<path${hairMask} data-hair-back="" fill="${mix(model.cabello, '#2B2028', .34)}" d="${strands.back}"/>` : ''}
      ${outfit.torso}
      <path fill="${shadow}" d="M82 124h28v20c0 7-6 12-14 12s-14-5-14-12v-20Z"/>
      <path fill="${skin}" d="M86 131h24v13c0 5-6 9-14 9-5 0-8-3-10-6v-16Z"/>
      ${outfit.neckwear}
      ${drawEars(model.orejas, skin, shadow)}
      <g style="clip-path: path('${face}') view-box">
        <path fill="${skin}" d="M51 30h90v114H51Z"/>
        <path fill="${light}" d="M59 80c6-29 21-38 39-38 12 0 27 11 32 25-15-11-22-13-33-12-17 2-28 11-38 25Z" opacity=".5"/>
        ${drawSkinDetail(model.detallePiel, skin)}
        ${model.edad === 'mayor' ? `<path data-age-lines="" fill="none" stroke="${shadow}" stroke-width="1.6" stroke-linecap="round" d="M85 69q11-3 21 0M89 64q8-2 15 0M66 96q6 3 12 2M114 98q6 1 12-2M81 103q-3 4-3 9M111 103q3 4 3 9M89 125q7 2 14 0"/>` : ''}
        ${facialHairPath ? `<path data-facial-hair="" fill="${model.cabello}" d="${facialHairPath}"/>` : ''}
      </g>
      ${model.cejas ? `<path data-brows="" fill="none" stroke="${brows}" stroke-width="3" stroke-linecap="round" d="${expression.brows}"/>` : ''}
      ${drawEyes(expression.eyes[model.formaOjos], model.ojos, brows)}
      ${drawNose(model.nariz, skin, shadow)}
      ${drawMouth(expression, model.colmillos, mouthColor)}
      ${strands ? `<g${hairMask}><path data-hair-front="" fill="${model.cabello}" d="${strands.front}"/><path fill="${mix(model.cabello, '#F7DBC5', .24)}" d="${strands.sheen}"/></g>` : ''}
      ${model.pelo === 'tres-pelos' && !headwear ? `<path data-hair-front="" d="M85 35c-2-5-5-8-9-10M96 33c0-7-2-12-5-15M107 34c2-6 5-9 9-11" fill="none" stroke="${model.cabello}" stroke-width="2.8" stroke-linecap="round"/>` : ''}
      ${headwear}
      ${model.gafas ? '<g fill="none" stroke="#322E37" stroke-width="3.1" stroke-linecap="round"><rect x="60" y="80" width="29" height="19" rx="7"/><rect x="103" y="80" width="29" height="19" rx="7"/><path d="M89 86q7-5 14 0m-43 0-6-2m78 2 6-2"/></g>' : ''}
    </svg>`;
  }

  const api = Object.freeze({ defaults: Object.freeze(normalize()), tones, skinColor, normalize, validate, svg });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterAvatar = api;
})(globalThis);
