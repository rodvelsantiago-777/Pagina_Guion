/* Apariencia de la interfaz. No modifica el PDF, sus marcas ni sus datos. */
(function () {
  "use strict";
  const key = "plano-appearance-v2", root = document.documentElement;
  const defaults = { mode: "light", preset: "default" };
  const palettes = {
    default: { label: "Predeterminado", accent: "#93674b", surface: "#888888", contrast: "#383a3e" },
    red: { label: "Rojo", accent: "#b94343", surface: "#9b8585", contrast: "#403134", chroma: .48, lightPanel: .89, darkPanel: .17 },
    brown: { label: "Café", accent: "#876044", surface: "#9c8570", contrast: "#3c322c", chroma: .36, lightPanel: .86, darkPanel: .15 },
    orange: { label: "Naranja", accent: "#be642a", surface: "#ac947f", contrast: "#43372f", chroma: .56, lightPanel: .90, darkPanel: .18 },
    yellow: { label: "Amarillo", accent: "#a17a17", surface: "#a69f80", contrast: "#3e392d", chroma: .66, lightPanel: .90, darkPanel: .17 },
    green: { label: "Verde", accent: "#438260", surface: "#84998a", contrast: "#2e3d34", chroma: .40, lightPanel: .88, darkPanel: .15 },
    sky: { label: "Celeste", accent: "#2686ac", surface: "#819ba6", contrast: "#2c3b43", chroma: .60, lightPanel: .89, darkPanel: .165 },
    blue: { label: "Azul", accent: "#476bab", surface: "#8290a2", contrast: "#29394e", chroma: .56, lightPanel: .89, darkPanel: .15 },
    pink: { label: "Rosa", accent: "#b65d87", surface: "#a48897", contrast: "#44313c", chroma: .48, lightPanel: .90, darkPanel: .18 },
    violet: { label: "Violeta", accent: "#8057ac", surface: "#9485a3", contrast: "#3a3046", chroma: .48, lightPanel: .90, darkPanel: .16 },
    gray: { label: "Grises", accent: "#727272", surface: "#909090", contrast: "#353535", lightPanel: .91, darkPanel: .13 },
    graphite: { label: "Grises oscuros", accent: "#434343", surface: "#696969", contrast: "#292929", lightPanel: .84, darkPanel: .07 }
  };
  let settings = { ...defaults }, accountManaged = false;
  const valid = value => Object.fromEntries(Object.entries(value || {}).filter(([name, item]) =>
    name === "mode" ? ["light", "dark"].includes(item) : name === "preset" && Object.hasOwn(palettes, item)));
  try {
    // Retirar los tonos libres y las preferencias de apariencia anteriores.
    const legacy = localStorage.getItem("plano-appearance-v1");
    localStorage.removeItem("plano-appearance-v1");
    const current = localStorage.getItem(key), saved = current ? JSON.parse(current) : null;
    if (!current && legacy) {
      try { const mode = JSON.parse(legacy)?.mode; if (["light", "dark"].includes(mode)) settings.mode = mode; } catch {}
      localStorage.setItem(key, JSON.stringify(settings));
    }
    if (saved && ["light", "dark"].includes(saved.mode)) settings.mode = saved.mode;
    if (Object.hasOwn(palettes, saved?.preset)) settings.preset = saved.preset;
  } catch { /* El modo funciona también sin almacenamiento disponible. */ }
  function hsl(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    const h = !d ? 0 : ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
    return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function rgb(h, s, l) {
    const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
  }
  const hex = channels => "#" + channels.map(v => v.toString(16).padStart(2, "0")).join("");
  const tone = (source, lightness, saturation) => { const [h, s] = hsl(source); return hex(rgb(h, Math.min(s, saturation), lightness)); };
  function luminance(color) {
    return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  }
  function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function readableAccent(source, background, dark) {
    const [h, s, original] = hsl(source);
    let l = original, color = source;
    for (let i = 0; ratio(color, background) < 4.5 && i < 100; i++) {
      l = Math.max(0, Math.min(1, l + (dark ? .01 : -.01))); color = hex(rgb(h, s, l));
    }
    return color;
  }
  function apply(persist = false) {
    const palette = palettes[settings.preset], dark = settings.mode === "dark", s = !dark && settings.preset === "default" ? "#a09080" : palette.surface, c = palette.contrast;
    const deep = settings.preset === "graphite", colored = Boolean(palette.chroma), themed = settings.preset !== "default";
    // En los temas de color, el matiz ocupa superficies enteras. El predeterminado
    // conserva sus neutros; grises y grafito se distinguen por sus niveles de tinta.
    const shade = (lightness, strength = 1) => hex(rgb(hsl(palette.accent)[0], palette.chroma * strength, lightness));
    const surface = (lightness, strength, neutralSaturation) => colored ? shade(lightness, strength) : tone(s, lightness, neutralSaturation);
    const paper = surface(dark ? (deep ? .085 : .125) : (deep ? .975 : .997), .30, .06);
    const accentSoft = colored ? shade(dark ? .22 : .92, .90) : tone(palette.accent, dark ? .20 : .94, .20);
    const accent = readableAccent(palette.accent, accentSoft, dark);
    const panelLevel = dark ? palette.darkPanel ?? .105 : palette.lightPanel ?? .938;
    const sidebar = colored ? shade(panelLevel) : tone(dark ? c : s, panelLevel, dark ? .13 : .09);
    const sideHover = colored ? shade(dark ? panelLevel + .085 : panelLevel - .055, .95) : tone(dark ? c : s, dark ? panelLevel + .085 : panelLevel - .043, .12);
    const selected = readableAccent(palette.accent, "#ffffff", false);
    const tokens = {
      page: surface(dark ? (deep ? .05 : .085) : (deep ? .925 : .958), .50, .07), paper,
      "surface-alt": surface(dark ? (deep ? .12 : .155) : (deep ? .95 : .976), .55, .07), "surface-hover": surface(dark ? .19 : .948, .65, .07),
      ink: tone(c, dark ? .925 : .14, .14), muted: tone(c, dark ? .73 : .39, .10), faint: tone(c, dark ? .70 : .42, .08),
      line: surface(dark ? .25 : .855, .45, .07), "line-strong": surface(dark ? .34 : .74, .55, .07),
      accent, "accent-hover": tone(accent, dark ? Math.min(.85, hsl(accent)[2] + .07) : Math.max(.12, hsl(accent)[2] - .07), 1),
      "accent-soft": accentSoft,
      "on-accent": ratio(accent, "#ffffff") >= ratio(accent, "#141414") ? "#ffffff" : "#141414",
      sidebar, "side-ink": tone(c, dark ? .94 : themed ? .14 : .17, dark ? .07 : .12), "side-muted": readableAccent(tone(c, dark ? (themed ? .74 : .67) : (themed ? .32 : .38), .08), sideHover, dark),
      "side-accent": readableAccent(palette.accent, sideHover, dark),
      "side-line": colored ? shade(dark ? .31 : panelLevel - .13, .65) : tone(dark ? c : s, dark ? .25 : .81, .10), "side-hover": sideHover,
      "side-selected": selected, "on-side-selected": "#ffffff",
      workspace: surface(dark ? .065 : .905, .55, .06),
      "table-header": themed ? selected : tone(dark ? c : s, dark ? .20 : .90, .12), "table-header-ink": themed ? "#ffffff" : tone(c, dark ? .97 : .20, dark ? .04 : .12),
      "table-stripe": surface(dark ? .14 : .985, .35, .04),
      danger: dark ? "#f0a194" : "#a23d30", "danger-soft": dark ? "#382422" : "#fbede9",
      shadow: dark ? "#00000040" : "#181b2312", backdrop: "#0e1015a6"
    };
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty("--" + name, value);
    root.dataset.theme = settings.mode; root.dataset.palette = settings.preset; root.style.colorScheme = settings.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.sidebar);
    if (persist && !accountManaged) { try { localStorage.setItem(key, JSON.stringify(settings)); } catch {} }
    sync();
  }
  function sync() {
    const toggle = document.querySelector("#toggle-theme");
    if (!toggle) return;
    const dark = settings.mode === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro"); toggle.title = dark ? "Activar modo claro" : "Activar modo oscuro";
    const themeLabel=document.querySelector('#header-theme-label');if(themeLabel)themeLabel.textContent=dark?'Modo claro':'Modo oscuro';
    for (const button of document.querySelectorAll("[data-appearance-mode]")) button.setAttribute("aria-pressed", String(button.dataset.appearanceMode === settings.mode));
    for (const button of document.querySelectorAll("[data-appearance-preset]")) {
      button.setAttribute("aria-pressed", String(settings.preset === button.dataset.appearancePreset));
    }
  }
  function choose(patch) {
    patch = valid(patch);
    patch = Object.fromEntries(Object.entries(patch).filter(([name, value]) => settings[name] !== value));
    if (!Object.keys(patch).length) return;
    Object.assign(settings, patch); apply(true);
    document.dispatchEvent(new CustomEvent("plano-appearance-change", { detail: patch }));
  }
  globalThis.PlanoAppearance = {
    get: () => ({ ...settings }), valid, choose, palettes: Object.freeze(palettes), defaults: Object.freeze({ ...defaults }),
    set: value => { settings = { ...defaults, ...valid(value) }; apply(); },
    manageAccount: value => { accountManaged = Boolean(value); }
  };
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.querySelector("#appearance-dialog"), open = document.querySelector("#open-appearance");
    document.querySelector("#toggle-theme").addEventListener("click", () => choose({ mode: settings.mode === "dark" ? "light" : "dark" }));
    const list = dialog.querySelector(".appearance-presets");
    for (const [id, palette] of Object.entries(palettes)) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.appearancePreset = id;
      const swatch = document.createElement("i"); swatch.style.background = palette.accent; swatch.setAttribute("aria-hidden", "true");
      button.append(swatch, document.createTextNode(palette.label)); list.append(button);
      button.addEventListener("click", () => { choose({ preset: id }); PlanoPopover.hide(dialog, true); });
    }
    open.addEventListener("click", () => { document.querySelector("#project-menu").open = false; sync(); PlanoPopover.show(dialog, document.querySelector('#project-menu > summary')||open); });
    document.querySelector("#close-appearance").addEventListener("click", () => PlanoPopover.hide(dialog, true));
    for (const button of dialog.querySelectorAll("[data-appearance-mode]")) button.addEventListener("click", () => choose({ mode: button.dataset.appearanceMode }));
    sync();
  });
})();
