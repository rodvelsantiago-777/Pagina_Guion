/* Tabla editable: resúmenes compactos, edición de celda y cambios compartidos con cobertura. */
(function (root) {
  "use strict";
  const fields = ["shotName", "shotValue", "shotAngle", "shotLens", "shotMovement", "estimatedSeconds", "description", "grip", "sound", "note"];
  let actions = null, active = null;
  const $ = selector => document.querySelector(selector);
  function label(field) { return field === "shotName" ? "Nombre del plano" : root.PlanoShotValues.fields[field]?.label || root.PlanoShotValues.textFields[field].label; }
  function value(item, field) {
    if (field === "shotName") return actions.displayName(item);
    if (field === "shotValue") return item[field] || "—";
    if (root.PlanoShotValues.fields[field]) return item[field] ? root.PlanoShotValues.display(item, field) : "—";
    return item[field]?.trim() || "—";
  }
  function updateCell(cell) {
    if (active?.cell === cell) return;
    const field = cell.dataset.field, item = cell.parentElement._item, display = cell.querySelector(".technical-cell-value");
    if (field === "estimatedSeconds") { cell.firstChild.textContent = root.PlanoShotScript.format(item.estimatedSeconds || 0); return; }
    display.textContent = value(item, field); display.classList.toggle("is-empty", !item[field]?.trim());
    display.setAttribute("aria-label", `Editar ${label(field).toLowerCase()} de ${actions.displayName(item)}`);
    display.title = `Editar ${label(field).toLowerCase()}`;
    const details = cell.querySelector(".technical-open-details");
    if (details) details.setAttribute("aria-label", `Abrir ficha de ${actions.displayName(item)}`);
  }
  function finishEditing(save = true, restoreFocus = false) {
    if (!active) return true;
    const editor = active, { field, input, other, form, cell } = editor;
    input.setCustomValidity(field === "shotName" && !input.value.trim() ? "Escribe un nombre para el plano." : "");
    if (other) other.setCustomValidity(input.value === "other" && !other.value.trim() ? "Especifica cuál antes de guardar." : "");
    if (save && !form.reportValidity()) return false;
    if (save && !actions.commit(cell.parentElement._item.id, field, input.value, other?.value || "", editor.expected)) {
      $("#technical-edit-status").textContent = "No se pudo guardar. El campo pudo cambiar en la otra vista; cancela para ver su valor actual."; return false;
    }
    active = null; form.remove(); cell.classList.remove("is-cell-editing");
    for (const button of cell.querySelectorAll(":scope > button")) button.hidden = false;
    updateCell(cell);
    $("#technical-edit-status").textContent = save ? "Cambio guardado" : "Edición cancelada";
    if (restoreFocus) cell.querySelector(".technical-cell-value").focus({ preventScroll: true });
    return true;
  }
  function neighbor(cell, direction) {
    const buttons = Array.from($("#technical-table-body").querySelectorAll(".technical-cell-value"));
    const button = buttons[buttons.indexOf(cell.querySelector(".technical-cell-value")) + direction] || cell.querySelector(".technical-cell-value");
    button?.focus({ preventScroll: true }); return button;
  }
  function editCell(cell) {
    if (active?.cell === cell || !finishEditing()) return;
    const item = cell.parentElement._item, field = cell.dataset.field, definition = root.PlanoShotValues.fields[field];
    const form = document.createElement("form"); form.className = "technical-cell-editor"; form.noValidate = true;
    let input, other;
    if (definition) {
      input = document.createElement("select"); root.PlanoShotValues.populate(input, item[field] || "", field);
      if (root.PlanoShotValues.otherKeys.includes(field)) {
        other = document.createElement("input"); other.type = "text"; other.maxLength = 140; other.value = item[field + "Other"] || "";
        other.className = "technical-other-input"; other.placeholder = "Especifica cuál…"; other.setAttribute("aria-label", `Especifica ${label(field).toLowerCase()}`);
      }
    } else if (field === "shotName") {
      input = document.createElement("input"); input.type = "text"; input.maxLength = 120; input.required = true; input.value = actions.displayName(item);
    } else {
      input = document.createElement("textarea"); input.rows = 3; input.maxLength = root.PlanoShotValues.textFields[field].max; input.value = item[field] || "";
      input.placeholder = label(field);
    }
    input.name = field; input.setAttribute("aria-label", label(field));
    form.append(input);
    function syncOther() {
      if (!other) return;
      const enabled = input.value === "other"; other.hidden = !enabled; other.disabled = !enabled; other.required = enabled;
      other.setCustomValidity(enabled && !other.value.trim() ? "Especifica cuál antes de guardar." : "");
    }
    if (other) { form.append(other); syncOther(); other.addEventListener("input", syncOther); }
    if (definition) input.addEventListener("change", () => {
      syncOther(); if (other && input.value === "other") other.focus(); else finishEditing(true, true);
    });
    function fitText() {
      if (input.tagName !== "TEXTAREA") return;
      input.style.height = "auto"; input.style.height = `${input.scrollHeight + 2}px`;
    }
    input.addEventListener("input", () => { input.setCustomValidity(""); fitText(); });
    const tools = document.createElement("div"); tools.className = "technical-cell-tools";
    const hint = document.createElement("span"); hint.textContent = field === "shotName" || definition ? "Enter: guardar" : "Ctrl + Enter: guardar";
    const save = document.createElement("button"); save.type = "submit"; save.className = "technical-cell-save"; save.textContent = "✓"; save.setAttribute("aria-label", "Guardar celda"); save.title = "Guardar celda";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "×"; cancel.setAttribute("aria-label", "Cancelar edición"); cancel.title = "Cancelar edición";
    for (const button of [save, cancel]) button.addEventListener("pointerdown", event => event.preventDefault());
    cancel.addEventListener("click", () => finishEditing(false, true));
    tools.append(hint, save, cancel); form.append(tools);
    form.addEventListener("submit", event => { event.preventDefault(); finishEditing(true, true); });
    form.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finishEditing(false, true); }
      else if (event.key === "Tab") {
        event.preventDefault(); event.stopPropagation(); const direction = event.shiftKey ? -1 : 1;
        if (finishEditing()) neighbor(cell, direction);
      } else if (event.key === "Enter" && (event.target.tagName !== "TEXTAREA" || event.ctrlKey || event.metaKey)) {
        event.preventDefault(); event.stopPropagation(); finishEditing(true, true);
      }
    });
    form.addEventListener("focusout", event => { if (active?.form === form && !form.contains(event.relatedTarget)) finishEditing(); });
    for (const button of cell.querySelectorAll(":scope > button")) button.hidden = true;
    active = { cell, field, form, input, other, expected: { value: item[field] || "", other: item[field + "Other"] || "" } }; cell.classList.add("is-cell-editing"); cell.append(form);
    fitText();
    $("#technical-edit-status").textContent = `Editando ${label(field).toLowerCase()}`;
    input.focus({ preventScroll: true }); if (input.tagName !== "SELECT") input.select();
  }
  function makeRow(item, scene) {
    const row = document.createElement("tr"); row.dataset.shotId = item.shotId || item.id; row.dataset.scene = scene.id;
    for (const [index, field] of fields.entries()) {
      const cell = document.createElement(index === 0 ? "th" : "td"); cell.dataset.field = field;
      if (index === 0) cell.scope = "row";
      if (field === "estimatedSeconds") {
        const duration = document.createElement("span"); duration.className = "technical-duration";
        duration.title = "Estimación automática: una página de guion equivale a 1 minuto."; cell.append(duration); row.append(cell); continue;
      }
      const button = document.createElement("button"); button.type = "button"; button.className = `technical-cell-value${index === 0 ? " technical-shot-name" : ""}`;
      button.addEventListener("click", () => editCell(cell));
      button.addEventListener("keydown", event => {
        if (event.key === "F2") { event.preventDefault(); editCell(cell); return; }
        const direction = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: fields.length - 1, ArrowUp: 1 - fields.length }[event.key];
        if (direction) { event.preventDefault(); neighbor(cell, direction); }
      });
      cell.append(button);
      if (index === 0) {
        const details = document.createElement("button"); details.type = "button"; details.className = "technical-open-details"; details.title = "Abrir ficha completa"; details.textContent = "↗";
        details.addEventListener("click", () => { if (finishEditing()) actions.open(row._item); }); cell.append(details);
        const tools = document.createElement("div"); tools.className = "technical-row-tools";
        const eye = iconButton("Ver fragmento del guion", "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"); eye.classList.add("technical-script-eye");
        eye.addEventListener("pointerenter", () => queueExcerpt(eye, row)); eye.addEventListener("focus", () => queueExcerpt(eye, row));
        eye.addEventListener("pointerleave", hideExcerpt); eye.addEventListener("blur", hideExcerpt);
        eye.addEventListener("click", () => { hideExcerpt(); if (finishEditing()) showExcerpt(row._item); });
        const remove = iconButton("Eliminar plano", "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"); remove.classList.add("technical-delete-shot");
        remove.addEventListener("click", () => { if (finishEditing()) actions.remove?.(row._item.id); });
        tools.append(eye, remove); cell.append(tools);
      }
      row.append(cell);
    }
    return row;
  }
  function render(sections, callbacks) {
    hideExcerpt();
    actions = callbacks;
    const body = $("#technical-table-body"), entries = [], shots = new Set(); let sceneCount = 0;
    for (const { scene, items } of sections) {
      if (!items.length) continue;
      sceneCount++;
      const groups = new Map();
      for (const item of items) {
        const id = item.shotId || item.id;
        if (!groups.has(id)) groups.set(id, item); shots.add(id);
      }
      entries.push({ key: `scene:${scene.id}`, scene, count: groups.size });
      for (const [id, item] of groups) entries.push({ key: `${scene.id}/${id}`, scene, item });
    }
    const old = Array.from(body.children), structureMatches = old.length === entries.length && entries.every((entry, i) => old[i].dataset.key === entry.key);
    if (!structureMatches && active) finishEditing(false);
    const existing = new Map(old.map(row => [row.dataset.key, row])), nodes = [];
    for (const entry of entries) {
      let row = existing.get(entry.key);
      if (!row) {
        if (entry.item) row = makeRow(entry.item, entry.scene);
        else {
          row = document.createElement("tr"); row.className = "technical-scene-row";
          const cell = document.createElement("th"); cell.colSpan = fields.length; cell.scope = "rowgroup"; row.append(cell);
        }
        row.dataset.key = entry.key;
      }
      if (entry.item) {
        row._item = entry.item;
        for (const cell of row.children) updateCell(cell);
      } else {
        const cell = row.firstChild; cell.replaceChildren();
        const number = document.createElement("strong"); number.textContent = entry.scene.number ? `ESCENA ${String(entry.scene.number).padStart(2, "0")}` : "GUION";
        const title = document.createElement("span"); title.textContent = entry.scene.title;
        const count = document.createElement("small"); count.textContent = `${entry.count} ${entry.count === 1 ? "plano" : "planos"}`;
        cell.append(number, title, count);
      }
      nodes.push(row);
    }
    if (!structureMatches) body.replaceChildren(...nodes);
    if (excerptDialog?.open) {
      const entry = entries.find(entry => entry.item && (entry.item.shotId || entry.item.id) === excerptShot);
      if (entry) updateExcerpt(entry.item); else clearExcerpt();
    }
    $("#technical-empty").hidden = Boolean(shots.size); $("#technical-table").hidden = !shots.size;
    $("#technical-summary").textContent = `${shots.size} ${shots.size === 1 ? "plano" : "planos"} / ${sceneCount} ${sceneCount === 1 ? "escena" : "escenas"}`;
    $("#technical-undo").disabled = !callbacks.history; $("#technical-redo").disabled = !callbacks.future;
  }
  let excerptTimer = null, tooltip = null, excerptDialog = null, excerptShot = null;
  function iconButton(title, path) {
    const button = document.createElement("button"); button.type = "button"; button.title = title; button.setAttribute("aria-label", title);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svg.namespaceURI, "path"); shape.setAttribute("d", path); svg.append(shape); button.append(svg); return button;
  }
  function hideExcerpt() { clearTimeout(excerptTimer); if (tooltip) tooltip.hidden = true; }
  function queueExcerpt(anchor, row) {
    hideExcerpt(); excerptTimer = setTimeout(() => {
      if (!anchor.isConnected) return;
      if (!tooltip) { tooltip = document.createElement("div"); tooltip.className = "script-excerpt-tooltip"; tooltip.setAttribute("role", "tooltip"); tooltip.id = "shot-script-tooltip"; document.body.append(tooltip); }
      const title = document.createElement("strong"); title.textContent = `Plano ${actions.displayName(row._item)}`;
      const text = document.createElement("p"); text.textContent = (row._item.scriptExcerpt || "Sin texto detectado en este tramo.").slice(0, 800);
      const hint = document.createElement("small"); hint.textContent = "Haz clic en el ojo para leer el fragmento completo.";
      tooltip.replaceChildren(title, text, hint); tooltip.hidden = false;
      const box = anchor.getBoundingClientRect(), width = tooltip.getBoundingClientRect().width;
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, box.bottom + 8))}px`;
    }, 450);
  }
  function showExcerpt(item) {
    if (!excerptDialog) {
      excerptDialog = document.createElement("dialog"); excerptDialog.className = "shot-name-dialog script-excerpt-dialog"; excerptDialog.id = "shot-script-dialog"; excerptDialog.setAttribute("aria-labelledby", "shot-script-title");
      const title = document.createElement("h2"); title.id = "shot-script-title";
      const text = document.createElement("blockquote"); text.id = "shot-script-full-text";
      const close = document.createElement("button"); close.type = "button"; close.className = "button button-secondary"; close.textContent = "Cerrar"; close.addEventListener("click", () => excerptDialog.close());
      excerptDialog.append(title, text, close); document.body.append(excerptDialog);
    }
    excerptShot = item.shotId || item.id; updateExcerpt(item);
    if (!excerptDialog.open) excerptDialog.showModal();
  }
  function updateExcerpt(item) {
    excerptDialog.querySelector("h2").textContent = `Guion · plano ${actions.displayName(item)}`;
    excerptDialog.querySelector("blockquote").textContent = item.scriptExcerpt || "Sin texto detectado en este tramo. Puedes vincular un fragmento desde la ficha de la línea.";
  }
  function clearExcerpt() {
    hideExcerpt(); tooltip?.replaceChildren(); excerptShot = null;
    if (excerptDialog) { if (excerptDialog.open) excerptDialog.close(); excerptDialog.querySelector("h2").textContent = ""; excerptDialog.querySelector("blockquote").textContent = ""; }
  }
  function clear() { finishEditing(false); clearExcerpt(); }
  root.PlanoTechnicalScript = { render, finishEditing, showExcerpt, clear };
})(globalThis);
