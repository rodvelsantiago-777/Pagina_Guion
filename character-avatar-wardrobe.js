/* Vestuario del busto. Cada opción define los colores que se pueden guardar. */
(function (root) {
  'use strict';

  const styles = Object.freeze({
    camiseta: { label: 'Camiseta', colors: [['Camiseta', '#446B5D']] },
    policia: { label: 'Policía', colors: [['Uniforme', '#314D73']] },
    doctor: { label: 'Doctor', colors: [['Uniforme bajo la bata', '#537F84']] },
    enfermero: { label: 'Enfermero', colors: [['Uniforme', '#508583']] },
    cocinero: { label: 'Cocinero', colors: [] },
    soldado: { label: 'Soldado', colors: [['Uniforme', '#63754C']] },
    ingeniero: { label: 'Ingeniero / electricista', colors: [['Uniforme', '#536985'], ['Casco', '#E8B53F']] },
    caballero: { label: 'Caballero con armadura', colors: [['Metal', '#778994'], ['Ribetes', '#BF9760']] },
    chaleco: { label: 'Camiseta con chaleco', colors: [['Camiseta', '#C8A782'], ['Chaleco', '#5F6170']] },
    traje: { label: 'Traje', colors: [['Blazer', '#333449'], ['Camisa', '#F5F1EB']] },
    camisa: { label: 'Camisa de vestir', colors: [['Camisa', '#ABBDCF']] },
    lenador: { label: 'Leñador', colors: [['Cuadros · color principal', '#A75450'], ['Cuadros · color secundario', '#442C3B'], ['Camiseta interior', '#E1D3B8']] },
  });
  const colorKeys = ['ropa', 'ropa2', 'ropa3'];
  const outline = 'M24 187c3-20 12-31 33-36l23-9h32l23 9c21 5 30 16 33 36H24Z';
  const armorOutline = 'M19 187l3-16c3-13 16-23 33-25l19 2 7-6h30l7 6 19-2c17 2 30 12 33 25l3 16Z';
  const collar = 'M72 143l8-3h32l8 3v2c-5 11-13 18-24 18s-19-7-24-18v-2Z';
  const panels = 'M24 140h55l8 23v24H24Zm144 0h-55l-8 23v24h63Z';
  const capBand = 'M48 48h96v11q-9 6-20 7H68q-12-1-20-7Z';
  const path = (fill, d) => `<path fill="${fill}" d="${d}"/>`;
  const line = (stroke, d, width = 2) =>
    `<path fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
  const clip = (d, content) => `<g style="clip-path: path('${d}') view-box">${content}</g>`;
  const base = color => path(color, 'M24 140h144v47H24Z');

  function normalizeColors(style, value) {
    const result = {};
    for (const [index, [, fallback]] of styles[style].colors.entries()) {
      const key = colorKeys[index], color = value?.[key];
      result[key] = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
    }
    return result;
  }

  function tee(color, dark) {
    return base(color) + path(dark(color, .24), 'M26 181c9 1 16 2 26 2h88c10 0 17-1 26-2l2 6H24l2-6Z')
      + path(dark(color, .26), collar);
  }

  function dressShirt(color, dark, light) {
    return base(color)
      + path(light(color, .22), 'M79 141l17 15-12 9-14-18Zm34 0-17 15 12 9 14-18Z')
      + line(dark(color, .22), 'M96 157v30', 1.6)
      + line(dark(color, .45), 'M101 170h.1m-.1 8h.1', 2.4);
  }

  function scrubs(color, dark, light) {
    return base(color) + path(dark(color, .29), 'M72 144l8-5 16 18 16-18 8 5-24 22Z')
      + path(dark(color, .16), 'M119 167h18v11h-18Z') + line(light(color, .27), 'M124 172h8m-4-4v8', 1.8);
  }

  function labCoat(color, dark) {
    return base('#FCFCF8')
      + path(color, 'M80 142h32c-1 7-6 19-8 28v17H88v-17c-2-9-7-21-8-28Z')
      + path(dark(color, .29), 'M80 143c3 7 8 12 16 13 8-1 13-6 16-13l-1 8c-4 7-9 12-15 15-6-3-11-8-15-15Z')
      + stethoscope
      + path('#E7ECEA', 'M80 142c1 7 6 19 8 28l-14-9 4-6-7-3 3-8Zm32 0c-1 7-6 19-8 28l14-9-4-6 7-3-3-8Z')
      + line('#CDD8D6', 'M133 170h13', 1.35);
  }

  function chefJacket() {
    const buttons = [164, 173, 182].map(y =>
      `<circle cx="88" cy="${y}" r="1.85"/><circle cx="103" cy="${y}" r="1.85"/>`
    ).join('');
    return base('#FFFEFA')
      + path('#F2F3EF', 'M79 141h34l5 4c-2 6-5 11-10 14-5-1-9-3-12-5-4 3-8 5-13 5-4-4-7-9-9-14Z')
      + path('#F8F8F4', 'M113 149c-1 6-2 10-2 14v24h57v-47h-44Z')
      + line('#CFD5D3', 'M77 146c3 7 10 12 19 12 8 0 14-5 18-12m0 0c-2 6-3 12-3 17v24', 1.25)
      + `<g fill="#8A9A9F">${buttons}</g>`;
  }

  function chefToque() {
    return path('#FFFEFA', 'M42 53c-7-5-9-13-5-21 4-8 13-13 25-11C68 10 81 5 95 7c11 0 20 6 24 14 11-3 22-1 30 6 8 7 10 18 1 26l-2 10c-35 6-69 6-104 0Z')
      + path('#F1F3F0', 'M41 43c4 5 11 7 20 7 6 0 12-2 17-5-5 6-12 9-20 9-7 0-13-4-17-11Zm110 0c-4 5-11 7-20 7-6 0-12-2-17-5 5 6 12 9 20 9 7 0 13-4 17-11Z')
      + path('#F2F4F0', 'M42 52q54 7 108 0l-2 11c-35 6-69 6-104 0Z')
      + line('#DDE3DD', 'M43 52q53 7 106 0', 1.1)
      + line('#E2E7E0', 'M67 25c3 3 5 6 6 11m45-11c-4 3-6 6-7 11', 1.45);
  }

  function knightArmor({ ropa: metal, ropa2: trim, dark, light }) {
    const shoulder = path(dark(metal, .32), 'M19 182c6-13 24-21 49-21l-4 19c-16 3-23 5-27 7H19Z')
      + path(light(metal, .23), 'M21 174c4-15 18-25 34-27 8 0 14 3 17 8l-9 12c-16 0-29 4-40 11Z')
      + path(metal, 'M21 178c10-8 23-12 42-13l-2 7c-16 1-30 5-41 11Z')
      + line(trim, 'M27 172c9-6 21-9 32-10', 1.55);
    return path(dark(metal, .54), 'M19 140h154v47H19Z')
      + path(metal, 'M55 158c8-10 18-15 27-17h28c9 2 19 7 27 17l-3 20-11 9H69l-11-9Z')
      + path(light(metal, .14), 'M60 161c7-6 16-10 23-11 0 12 4 20 13 28v9H69l-8-9Z')
      + path(dark(metal, .14), 'M132 161c-7-6-16-10-23-11 0 12-4 20-13 28v9h27l8-9Z')
      + shoulder + `<g transform="translate(192 0) scale(-1 1)">${shoulder}</g>`
      + path(dark(metal, .32), 'M75 146l7-5h28l7 5c-4 12-11 19-21 23-10-4-17-11-21-23Z')
      + line(light(metal, .24), 'M80 148c3 8 8 13 16 17 8-4 13-9 16-17', 1.75)
      + path(trim, 'M96 172l5 5-5 6-5-6Z');
  }

  function knightHelmet({ ropa: metal, ropa2: trim, dark, light }) {
    return path(metal, 'M42 64c-1-21 9-39 25-49C76 9 87 9 96 5c9 4 20 4 29 10 16 10 26 28 25 49l-8 10-7-4-4-12q-35-14-70 0l-4 12-7 4Z')
      + path(light(metal, .28), 'M45 53C49 33 61 21 78 15l14-5c-6 8-10 20-12 31-13 2-25 6-35 12Z')
      + path(dark(metal, .22), 'M101 10l13 4c16 6 29 20 33 39-10-6-22-10-35-12-2-12-6-24-11-31Z')
      + path(dark(metal, .33), 'M42 58c17-10 38-15 54-15s37 5 54 15v6l-8 10-7-4-4-12q-35-14-70 0l-4 12-7 4-8-10Z')
      + line(light(trim, .10), 'M46 59c16-8 34-13 50-13s34 5 50 13', 2.1)
      + line(light(metal, .45), 'M95 12c-3 7-5 15-6 23', 1.9)
      + `<g fill="${trim}"><circle cx="51" cy="66" r="1.9"/><circle cx="141" cy="66" r="1.9"/></g>`;
  }

  const stethoscope = `<g data-stethoscope="">
    ${line('#344653', 'M85 133c-4 7-7 16.5-17 22.5M107 133c6 7 10 16 12 24 2 7 3 12 8 15.5', 3.2)}
    ${line('#879AA3', 'M54 165.5l-5.5 11c-2 4-.5 7.5 3 7.5M72 165.5l-5.5 11c-1.5 3.2-4 4.5-6.5 3.8', 1.9)}
    ${line('#344653', 'M54 165.5c3.5-6 8-10 14-10 5 1.5 6 5.5 4 10', 2.9)}
    ${line('#344653', 'M51.5 184l2.6-.4M60 180.3l-2.2-.9', 3.3)}
    <g transform="rotate(-18 128 175)">
      <ellipse cx="128" cy="175" rx="4.6" ry="5.35" fill="#344653"/>
      <ellipse cx="128" cy="175" rx="3.15" ry="3.75" fill="#C9D5D9"/>
      <path d="M126 175q0-2 1.8-2.4" fill="none" stroke="#EDF2F3" stroke-linecap="round"/>
    </g>
  </g>`;

  const neckwear = {
    traje: ({ ropa2: shirt, dark, light }) =>
      path(light(shirt, .24), 'M82 143c1 5 5 9 12 11.5l-6.5 7.5c-4.5-4-7.5-9.5-8.5-16Zm28 0c-1 5-5 9-12 11.5l6.5 7.5c4.5-4 7.5-9.5 8.5-16Z')
      + line(dark(shirt, .18), 'M79 146c1 6.5 4 12 8.5 16l6.5-7.5m19-8.5c-1 6.5-4 12-8.5 16l-6.5-7.5', .9),
  };

  const bodies = {
    camiseta: ({ ropa, dark }) => tee(ropa, dark),
    policia: ({ ropa: color, dark, light }) => dressShirt(color, dark, light)
      + path(dark(color, .26), 'M38 157l25-7 2 6-27 8Zm116 0-25-7-2 6 27 8Z')
      + path(light(color, .57), 'M120 161h13v8q-2 5-6.5 7-4.5-2-6.5-7Z')
      + line(dark(color, .39), 'M58 169h17m-17 10h17', 2),
    doctor: ({ ropa, dark }) => labCoat(ropa, dark),
    enfermero: ({ ropa, dark, light }) => scrubs(ropa, dark, light),
    cocinero: chefJacket,
    soldado: ({ ropa: color, dark, light }) => base(color)
      + path(dark(color, .28), 'M32 159l16-6 10 2 6 9-12 4-15-3Zm92-6 10 1 15-3 8 8-12 6-17-4Zm-60 22 9-8 11 2 6 9-6 9H63Zm54 0 12-8 8 6 14 2 2 12h-25Z')
      + path(light(color, .18), 'M35 178l12-5 9 3-3 9H32Zm75-28 11 3 7 10-9 5-9-6Z')
      + path(dark(color, .38), collar) + line(light(color, .28), 'M56 172h19m42 0h19', 2.5),
    ingeniero: ({ ropa: color, dark, light }) => base(color) + path(dark(color, .37), collar)
      + path(light(color, .47), 'M56 149h10v38H56Zm70 0h10v38h-10Z')
      + path(light(color, .24), 'M24 176h144v5H24Z')
      + line(dark(color, .32), 'M96 157v30m15-21h11', 2),
    caballero: knightArmor,
    chaleco: ({ ropa: shirt, ropa2: vest, dark }) => tee(shirt, dark) + path(vest, panels)
      + line(dark(vest, .32), 'M54 171h18m48 0h18M79 146l8 18v20m26-38-8 18v20', 2.2),
    traje: ({ ropa: jacket, ropa2: shirt, dark, light }) => base(jacket)
      + path(shirt, 'M77 143h38c-3 14-9 27-19 37-10-10-16-23-19-37Z')
      + path(dark(jacket, .38), 'M91.75 157q4.25-1 8.5 0l-1.75 4 2.5 12.2-5 4.05-5-4.05 2.5-12.2Z')
      + path(light(jacket, .14), 'M77 143c3 14 9 27 19 37l-23-16 4-6-6-2 1-11Zm38 0c-3 14-9 27-19 37l23-16-4-6 6-2-1-11Z')
      + line(dark(jacket, .27), 'M96 180v7', 1.1)
      + line(light(jacket, .22), 'M122 169l11-1.5', 1.4),
    camisa: ({ ropa, dark, light }) => dressShirt(ropa, dark, light),
    lenador: ({ ropa: main, ropa2: secondary, ropa3: shirt, dark, light }) => tee(shirt, dark) + clip(panels,
      base(main)
      + line(secondary, 'M36 139v49m16-49v49m16-49v49m16-49v49m24-49v49m16-49v49m16-49v49m16-49v49M24 152h144M24 169h144M24 185h144', 5)
      + line(light(main, .27), 'M24 158h144m-144 17h144', 1.1))
      + path(dark(main, .26), 'M73 143l14 19v25h-5v-23l-14-16Zm46 0-14 19v25h5v-23l14-16Z'),
  };

  const hats = {
    policia: ({ ropa: color, dark, light }) => path(color, 'M41 40q3-17 23-22l32-9 32 9q20 5 23 22l-7 13H48Z')
      + path(dark(color, .3), capBand)
      + path(dark(color, .52), 'M48 55q48-8 96 0l-5 11q-43-9-86 0Z')
      + path(light(color, .6), 'M89 30h14v10q-2 5-7 7-5-2-7-7Z'),
    cocinero: chefToque,
    soldado: ({ ropa: color, dark, light }) => path(color, 'M44 54C44 27 65 11 96 11s52 16 52 43l-5 12H49Z')
      + path(dark(color, .27), 'M45 44q5-18 25-25l9 6-3 8-17 7-3 12-11 1Zm55-32 17 3 11 8 2 11-13 3-7-12-14-5Zm30 34 14-4 3 11-8 9-14-5Z')
      + path(light(color, .2), 'M80 36l13-9 9 5 1 8-12 6-9-1Z')
      + path(dark(color, .42), 'M43 54q53-11 106 0v10q-53-9-106 0Z'),
    ingeniero: ({ ropa2: helmet, dark, light }) => path(helmet, 'M47 55c1-26 20-40 49-40s48 14 49 40Z')
      + path(light(helmet, .32), 'M91 15h10l3 37H88Z')
      + line(dark(helmet, .25), 'M68 29q-7 10-8 22m64-22q7 10 8 22', 2.7)
      + path(dark(helmet, .21), 'M42 52q54-10 108 0l1 11q-55 5-110 0Z')
      + path(light(helmet, .24), 'M43 52q53-9 106 0l1 5H42Z'),
    caballero: knightHelmet,
  };

  const hairlines = {
    cocinero: 'M0 68L48 56H144L192 68V192H0Z',
    caballero: 'M0 70L45 56Q96 36 147 56L192 70V192H0Z',
  };

  function render(model, mix) {
    const dark = (color, weight) => mix(color, '#162923', weight);
    const light = (color, weight) => mix(color, '#FFF9F0', weight);
    const { vestuario, ropa, ropa2, ropa3 } = model;
    const palette = { ropa, ropa2, ropa3, dark, light };
    const torsoOutline = vestuario === 'caballero' ? armorOutline : outline;
    return {
      torso: `<g data-wardrobe="">${clip(torsoOutline, bodies[vestuario](palette))}</g>`,
      neckwear: neckwear[vestuario]?.(palette) || '',
      headwear: hats[vestuario] ? `<g data-headwear="">${hats[vestuario](palette)}</g>` : '',
      hairline: hairlines[vestuario] || 'M0 62h192v130H0Z',
    };
  }

  const api = Object.freeze({ styles, colorKeys, normalizeColors, render });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterWardrobe = api;
})(globalThis);
