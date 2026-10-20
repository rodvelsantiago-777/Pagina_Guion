/* Ficha técnica independiente del nombre y de la numeración del plano. */
(function (root) {
  "use strict";
  const catalog = [
    ["GPG", "Gran Plano General"], ["PG", "Plano General"], ["PE", "Plano Entero"],
    ["PA", "Plano Americano"], ["PM", "Plano Medio"], ["PMC", "Plano Medio Corto"],
    ["PP", "Primer Plano"], ["PPP", "Primerísimo Primer Plano"], ["PD", "Plano Detalle"],
    ["P de 2", "Plano de 2"], ["P de 3", "Plano de 3"], ["P Conjunto", "Plano Conjunto"]
  ];
  const fields = {
    shotValue: { label: "Valor de plano", input: "shot-value-input", edit: "edit-shot-value", options: catalog },
    shotAngle: { label: "Angulación", input: "shot-angle-input", edit: "edit-shot-angle", options: [
      ["normal", "Normal"], ["high", "Picada"], ["low", "Contrapicada"],
      ["dutch", "Holandesa"], ["nadir", "Nadir"], ["overhead", "Cenital"], ["other", "Otra"]
    ] },
    shotLens: { label: "Óptica", input: "shot-lens-input", edit: "edit-shot-lens", options: [
      ["ultra-wide", "Ultra gran angular"], ["wide", "Gran angular"], ["moderate-wide", "Angular (moderado)"], ["normal", "Normal"],
      ["telephoto", "Teleobjetivo"], ["super-telephoto", "Superteleobjetivo"], ["macro", "Macro"],
      ["fisheye", "Ojo de pez"], ["anamorphic", "Anamórfica"], ["tilt-shift", "Tilt-shift"], ["other", "Otra"]
    ] },
    shotMovement: { label: "Movimiento", input: "shot-movement-input", edit: "edit-shot-movement", options: [
      ["none", "Ninguno (fijo)"], ["zoom-in", "Zoom in"], ["zoom-out", "Zoom out"],
      ["pan-right", "Pan right (derecha)"], ["pan-left", "Pan left (izquierda)"],
      ["tilt-up", "Tilt up (arriba)"], ["tilt-down", "Tilt down (abajo)"],
      ["dolly-in", "Dolly in"], ["dolly-out", "Dolly out"], ["travel-in", "Travel in"], ["travel-out", "Travel out"],
      ["tracking", "Seguimiento"], ["truck-right", "Truck right (lateral)"], ["truck-left", "Truck left (lateral)"],
      ["pedestal-up", "Pedestal up (subir)"], ["pedestal-down", "Pedestal down (bajar)"],
      ["crane-up", "Grúa ascendente"], ["crane-down", "Grúa descendente"],
      ["arc-right", "Arco / órbita derecha"], ["arc-left", "Arco / órbita izquierda"],
      ["roll-right", "Roll derecha"], ["roll-left", "Roll izquierda"],
      ["dolly-zoom", "Dolly zoom (vértigo)"], ["whip-pan", "Barrido / whip pan"], ["aerial", "Aéreo"], ["other", "Otro"]
    ] }
  };
  const keys = Object.keys(fields);
  const otherKeys = keys.filter(key => fields[key].options.some(([value]) => value === "other"));
  const textFields = {
    description: { label: "Descripción", input: "shot-description-input", edit: "edit-shot-description", max: 4000, placeholder: "Qué sucede en este plano y cómo quieres contarlo…" },
    grip: { label: "Grip", input: "shot-grip-input", edit: "edit-shot-grip", max: 2000, placeholder: "Soportes, rigging y equipo necesario…" },
    sound: { label: "Sonido", input: "shot-sound-input", edit: "edit-shot-sound", max: 2000, placeholder: "Diálogo, ambiente, efectos y necesidades de sonido…" },
    note: { label: "Notas", input: "shot-notes-input", edit: "edit-shot-info", max: 3000, placeholder: "Observaciones y recordatorios para este plano…" }
  };
  function valid(value, field = "shotValue") { return Boolean(fields[field]) && (value === "" || fields[field].options.some(([code]) => code === value)); }
  function fullName(value) { return catalog.find(([code]) => code === value)?.[1] || "Sin definir"; }
  function populate(select, value = "", field = "shotValue") {
    select.replaceChildren(new Option("Sin definir", ""));
    for (const [code, name] of fields[field].options) select.add(new Option(field === "shotValue" ? `${code} · ${name}` : name, code));
    select.value = valid(value, field) ? value : "";
  }
  function formValues(mode, item) {
    if (item) {
      for (const key of keys) document.getElementById(fields[key][mode]).value = item[key] || "";
      for (const key of otherKeys) {
        const select = document.getElementById(fields[key][mode]);
        document.getElementById(`${select.id}-other`).value = item[`${key}Other`] || "";
        syncOther(select);
      }
      for (const [key, field] of Object.entries(textFields)) document.getElementById(field[mode]).value = item[key] || "";
    }
    const values = Object.fromEntries(keys.map(key => [key, document.getElementById(fields[key][mode]).value]));
    for (const key of otherKeys) values[`${key}Other`] = values[key] === "other" ? document.getElementById(`${fields[key][mode]}-other`).value.trim() : "";
    for (const [key, field] of Object.entries(textFields)) values[key] = document.getElementById(field[mode]).value.trim();
    return values;
  }
  function syncOther(select) {
    const input = document.getElementById(`${select.id}-other`);
    const active = select.value === "other";
    input.parentElement.hidden = !active; input.required = active; input.disabled = !active;
    input.setCustomValidity(active && !input.value.trim() ? "Especifica cuál antes de guardar." : "");
  }
  function setupForms() {
    for (const mode of ["input", "edit"]) {
      for (const key of keys) {
        const select = document.getElementById(fields[key][mode]); populate(select, "", key);
        if (!otherKeys.includes(key)) continue;
        const wrapper = document.createElement("div"); wrapper.className = "shot-other-field"; wrapper.hidden = true;
        const label = document.createElement("label"); label.htmlFor = `${select.id}-other`; label.textContent = `Especifica ${fields[key].label.toLowerCase()}`;
        const input = document.createElement("input"); input.id = label.htmlFor; input.type = "text"; input.maxLength = 140; input.autocomplete = "off";
        input.placeholder = "Escribe cuál…"; input.addEventListener("input", () => syncOther(select));
        select.addEventListener("change", () => { syncOther(select); if (select.value === "other") input.focus(); });
        wrapper.append(label, input); select.after(wrapper); syncOther(select);
      }
      const container = document.querySelector(`[data-shot-writing="${mode}"]`);
      for (const [key, field] of Object.entries(textFields)) {
        const wrapper = document.createElement("div"); wrapper.className = `shot-writing-field ${key}`;
        const label = document.createElement("label"); label.htmlFor = field[mode]; label.textContent = field.label;
        const input = document.createElement("textarea"); input.id = field[mode]; input.maxLength = field.max; input.rows = key === "grip" || key === "sound" ? 2 : 3; input.placeholder = field.placeholder;
        wrapper.append(label, input); container.append(wrapper);
      }
    }
  }
  function display(item, key) {
    if (item[key] === "other") return item[`${key}Other`]?.trim() || "Otra · por definir";
    return fields[key].options.find(([value]) => value === item[key])?.[1] || "Sin definir";
  }
  const api = { catalog, fields, keys, otherKeys, textFields, valid, fullName, populate, formValues, setupForms, display };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanoShotValues = api;
})(globalThis);
