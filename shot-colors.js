/* Paleta compartida y editor visual de tono, saturación y brillo. */
(function (root) {
  "use strict";
  const presets = ["#e8b83f", "#e77c6e", "#73a884", "#64a7d9", "#8d77cc", "#d985b5", "#e49752", "#7a8c9e"];
  const storageKey = "plano-custom-colors-v1";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function toHSV(color, previousHue = 0) {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
    let h = previousHue;
    if (delta) h = (((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60) + 360) % 360;
    return { h, s: max ? delta / max : 0, v: max };
  }
  function fromHSV({ h, s, v }) {
    const x = ((h % 360) + 360) % 360 / 60, c = v * s, second = c * (1 - Math.abs(x % 2 - 1)), m = v - c;
    const rgb = x < 1 ? [c, second, 0] : x < 2 ? [second, c, 0] : x < 3 ? [0, c, second] : x < 4 ? [0, second, c] : x < 5 ? [second, 0, c] : [c, 0, second];
    return "#" + rgb.map(value => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("");
  }
  function setup() {
    const $ = selector => document.querySelector(selector), dialog = $("#color-picker-dialog"), spectrum = $("#color-spectrum");
    let target = null, draft = presets[0], recent = [], customMode = false, hsv = toHSV(draft);
    try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (Array.isArray(saved)) recent = [...new Set(saved.filter(value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)).map(value => value.toLowerCase()))].slice(0, 8); } catch {}
    function markSelected() {
      for (const button of dialog.querySelectorAll(".palette-swatch")) button.setAttribute("aria-pressed", String(button.dataset.color === draft));
    }
    function swatch(color) {
      const node = document.createElement("button"); node.type = "button"; node.className = "palette-swatch"; node.style.setProperty("--color", color); node.dataset.color = color;
      node.title = color.toUpperCase(); node.setAttribute("aria-label", `Usar color ${color.toUpperCase()}`);
      node.addEventListener("click", () => { if (customMode) sync(color); else apply(color); }); return node;
    }
    function refresh() {
      $("#preset-colors").replaceChildren(...presets.map(swatch));
      $("#recent-colors").replaceChildren(...recent.map(swatch));
      $("#recent-colors-empty").hidden = Boolean(recent.length); markSelected();
    }
    function sync(color, model) {
      draft = color.toLowerCase(); hsv = model || toHSV(draft, hsv.h);
      $("#custom-color-hex").value = draft.toUpperCase(); $("#custom-color-hex").setCustomValidity("");
      for (const [index, id] of ["red", "green", "blue"].entries()) $("#custom-color-" + id).value = parseInt(draft.slice(1 + index * 2, 3 + index * 2), 16);
      $("#custom-color-preview").style.background = draft;
      $("#spectrum-cursor").style.left = `${hsv.h / 360 * 100}%`; $("#spectrum-cursor").style.top = `${(1 - hsv.s) * 100}%`;
      spectrum.setAttribute("aria-valuenow", String(Math.round(hsv.h)));
      spectrum.setAttribute("aria-valuetext", `Tono ${Math.round(hsv.h)} grados, saturación ${Math.round(hsv.s * 100)} por ciento`);
      $("#color-brightness").value = Math.round(hsv.v * 100);
      $(".color-brightness").style.setProperty("--hue-color", fromHSV({ ...hsv, v: 1 })); markSelected();
    }
    function syncModel(next) { sync(fromHSV(next), next); }
    function syncLaunches() {
      for (const launch of document.querySelectorAll(".color-launch")) {
        const input = document.getElementById(launch.dataset.colorTarget);
        launch.style.setProperty("--color", input.value); launch.title = `Elegir color · ${input.value.toUpperCase()}`;
      }
    }
    function apply(color) {
      if (!target) return;
      target.value = color; target.dispatchEvent(new Event("input", { bubbles: true })); target.dispatchEvent(new Event("change", { bubbles: true }));
      syncLaunches(); PlanoPopover.hide(dialog, true);
    }
    function showCustom(active) {
      customMode = active; dialog.classList.toggle("is-custom", active);
      $("#custom-color-fields").hidden = !active; $("#custom-color-fields").disabled = !active;
      $("#recent-color-section").hidden = !active; $("#save-custom-color").hidden = !active;
      $("#choose-custom-color").setAttribute("aria-expanded", String(active));
      $("#color-picker-title").textContent = active ? "Editar color" : "Elige un color";
      PlanoPopover.place(dialog);
    }
    for (const launch of document.querySelectorAll(".color-launch")) {
      const input = document.getElementById(launch.dataset.colorTarget); input.addEventListener("input", syncLaunches);
      launch.addEventListener("click", () => {
        if (dialog.matches(":popover-open")) { PlanoPopover.hide(dialog, true); return; }
        // Un selector abierto desde una ficha sigue siendo interactivo dentro de su modal.
        (launch.closest("dialog") || document.body).append(dialog);
        target = input; showCustom(false); sync(input.value); refresh(); PlanoPopover.show(dialog, launch); $("#choose-custom-color").focus({ preventScroll: true });
      });
    }
    syncLaunches();
    $("#choose-custom-color").addEventListener("click", () => { showCustom(true); $("#custom-color-hex").focus(); });
    let pointer = null;
    function choosePoint(event) {
      const box = spectrum.getBoundingClientRect();
      syncModel({ h: clamp((event.clientX - box.left) / box.width, 0, 1) * 360, s: 1 - clamp((event.clientY - box.top) / box.height, 0, 1), v: hsv.v });
    }
    spectrum.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); pointer = event.pointerId; spectrum.focus(); spectrum.setPointerCapture(pointer); choosePoint(event);
    });
    spectrum.addEventListener("pointermove", event => { if (event.pointerId === pointer) choosePoint(event); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) spectrum.addEventListener(type, event => { if (event.pointerId === pointer) { pointer = null; if (spectrum.hasPointerCapture(event.pointerId)) spectrum.releasePointerCapture(event.pointerId); } });
    spectrum.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1, next = { ...hsv };
      if (event.key === "ArrowLeft") next.h = clamp(hsv.h - step, 0, 360);
      if (event.key === "ArrowRight") next.h = clamp(hsv.h + step, 0, 360);
      if (event.key === "ArrowUp") next.s = clamp(hsv.s + step / 100, 0, 1);
      if (event.key === "ArrowDown") next.s = clamp(hsv.s - step / 100, 0, 1);
      if (event.key === "Home") next.h = 0;
      if (event.key === "End") next.h = 360;
      syncModel(next);
    });
    $("#color-brightness").addEventListener("input", event => syncModel({ ...hsv, v: Number(event.target.value) / 100 }));
    $("#custom-color-hex").addEventListener("input", event => {
      const value = event.target.value.trim();
      if (!/^#?[0-9a-f]{6}$/i.test(value)) { event.target.setCustomValidity("Escribe un hexadecimal de seis dígitos, por ejemplo #64A7D9."); return; }
      const start = event.target.selectionStart; sync(value.startsWith("#") ? value : "#" + value); event.target.setSelectionRange(start, start);
    });
    for (const id of ["red", "green", "blue"]) $("#custom-color-" + id).addEventListener("input", () => {
      const inputs = ["red", "green", "blue"].map(name => $("#custom-color-" + name));
      if (inputs.some(input => !input.value || !input.validity.valid || !Number.isInteger(Number(input.value)))) return;
      sync("#" + inputs.map(input => Number(input.value).toString(16).padStart(2, "0")).join(""));
    });
    $("#color-editor-form").addEventListener("submit", event => {
      event.preventDefault(); event.stopPropagation(); if (!customMode) return;
      recent = [draft, ...recent.filter(color => color !== draft)].slice(0, 8);
      try { localStorage.setItem(storageKey, JSON.stringify(recent)); } catch {}
      apply(draft);
    });
    for (const id of ["#close-color-picker", "#cancel-color-picker"]) $(id).addEventListener("click", () => PlanoPopover.hide(dialog, true));
    dialog.addEventListener("toggle", event => { if (event.newState === "closed" && !dialog.matches(":popover-open")) { pointer = null; target = null; } });
    return { syncLaunches };
  }
  root.PlanoColors = { presets, setup };
})(globalThis);
