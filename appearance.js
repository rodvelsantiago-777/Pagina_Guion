/* Apariencia de la interfaz. No modifica el PDF, sus marcas ni sus datos. */
(function () {
  "use strict";
  const key = "plano-appearance-v2", root = document.documentElement;
  const defaults = { mode: "light", preset: "default" };
  const palettes = {
    default: { label: "Predeterminado", accent: "#93674b", surface: "#888888", contrast: "#383a3e" },
    red: { label: "Rojo", accent: "#b94343", surface: "#9b8585", contrast: "#403134" },
    brown: { label: "Café", accent: "#876044", surface: "#9c8570", contrast: "#3c322c" },
    orange: { label: "Naranja", accent: "#be642a", surface: "#ac947f", contrast: "#43372f" },
    yellow: { label: "Amarillo", accent: "#a17a17", surface: "#a69f80", contrast: "#3e392d" },
    green: { label: "Verde", accent: "#438260", surface: "#84998a", contrast: "#2e3d34" },
    sky: { label: "Celeste", accent: "#2686ac", surface: "#819ba6", contrast: "#2c3b43" },
    blue: { label: "Azul", accent: "#476bab", surface: "#8290a2", contrast: "#29394e" },
    pink: { label: "Rosa", accent: "#b65d87", surface: "#a48897", contrast: "#44313c" },
    violet: { label: "Violeta", accent: "#8057ac", surface: "#9485a3", contrast: "#3a3046" },
    gray: { label: "Grises", accent: "#727272", surface: "#909090", contrast: "#353535" },
    graphite: { label: "Grises oscuros", accent: "#434343", surface: "#696969", contrast: "#292929" }
  };
  let settings = { ...defaults };
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
    const palette = palettes[settings.preset], dark = settings.mode === "dark", s = palette.surface, c = palette.contrast;
    const deep = settings.preset === "graphite";
    const paper = tone(s, dark ? (deep ? .085 : .125) : (deep ? .975 : .997), .06), accentSoft = tone(palette.accent, dark ? .20 : .94, .20);
    const accent = readableAccent(palette.accent, accentSoft, dark);
    const tokens = {
      page: tone(s, dark ? (deep ? .05 : .085) : (deep ? .925 : .958), .07), paper,
      "surface-alt": tone(s, dark ? (deep ? .12 : .155) : (deep ? .95 : .976), .07), "surface-hover": tone(s, dark ? .19 : .948, .07),
      ink: tone(c, dark ? .925 : .14, .14), muted: tone(c, dark ? .73 : .39, .10), faint: tone(c, dark ? .70 : .42, .08),
      line: tone(s, dark ? .25 : .855, .07), "line-strong": tone(s, dark ? .34 : .74, .07),
      accent, "accent-hover": tone(accent, dark ? Math.min(.85, hsl(accent)[2] + .07) : Math.max(.12, hsl(accent)[2] - .07), 1),
      "accent-soft": accentSoft,
      "on-accent": ratio(accent, "#ffffff") >= ratio(accent, "#141414") ? "#ffffff" : "#141414",
      sidebar: tone(c, dark ? .105 : .115, .13), "side-ink": tone(c, .94, .07), "side-muted": tone(c, .67, .08),
      "side-accent": readableAccent(palette.accent, tone(c, .19, .12), true),
      "side-line": tone(c, .25, .10), "side-hover": tone(c, .19, .12),
      workspace: tone(s, dark ? .065 : .905, .06),
      "table-header": tone(c, dark ? .20 : .18, .12), "table-header-ink": tone(c, .97, .04),
      "table-stripe": tone(s, dark ? .14 : .985, .04),
      danger: dark ? "#f0a194" : "#a23d30", "danger-soft": dark ? "#382422" : "#fbede9",
      shadow: dark ? "#00000040" : "#181b2312", backdrop: "#0e1015a6"
    };
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty("--" + name, value);
    root.dataset.theme = settings.mode; root.dataset.palette = settings.preset; root.style.colorScheme = settings.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.paper);
    if (persist) { try { localStorage.setItem(key, JSON.stringify(settings)); } catch {} }
    sync();
  }
  function sync() {
    const toggle = document.querySelector("#toggle-theme");
    if (!toggle) return;
    const dark = settings.mode === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro"); toggle.title = dark ? "Activar modo claro" : "Activar modo oscuro";
    for (const button of document.querySelectorAll("[data-appearance-mode]")) button.setAttribute("aria-pressed", String(button.dataset.appearanceMode === settings.mode));
    for (const button of document.querySelectorAll("[data-appearance-preset]")) {
      button.setAttribute("aria-pressed", String(settings.preset === button.dataset.appearancePreset));
    }
  }
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.querySelector("#appearance-dialog"), open = document.querySelector("#open-appearance");
    document.querySelector("#toggle-theme").addEventListener("click", () => { settings.mode = settings.mode === "dark" ? "light" : "dark"; apply(true); });
    const list = dialog.querySelector(".appearance-presets");
    for (const [id, palette] of Object.entries(palettes)) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.appearancePreset = id;
      const swatch = document.createElement("i"); swatch.style.background = palette.accent; swatch.setAttribute("aria-hidden", "true");
      button.append(swatch, document.createTextNode(palette.label)); list.append(button);
      button.addEventListener("click", () => { settings.preset = id; apply(true); PlanoPopover.hide(dialog, true); });
    }
    open.addEventListener("click", () => { document.querySelector("#project-menu").open = false; sync(); PlanoPopover.show(dialog, open); });
    document.querySelector("#close-appearance").addEventListener("click", () => PlanoPopover.hide(dialog, true));
    for (const button of dialog.querySelectorAll("[data-appearance-mode]")) button.addEventListener("click", () => { settings.mode = button.dataset.appearanceMode; apply(true); });
    sync();
  });
})();
