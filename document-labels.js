/* Nombres de plano separados del texto y de las marcas del PDF. */
(function (root) {
  "use strict";
  const geometry = root.PlanoLabels;
  function titleInk(color) {
    const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
    const luminance = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return (1.05 / (luminance + .05)) > ((luminance + .05) / .05) ? "#ffffff" : "#000000";
  }
  function toPixels(rect, viewport) {
    return { x: rect.x * viewport.width, y: rect.y * viewport.height, width: rect.width * viewport.width, height: rect.height * viewport.height };
  }
  function makeInkMask(canvas, viewport) {
    try {
      const width = Math.ceil(viewport.width / 3), height = Math.ceil(viewport.height / 3);
      const sourceWidth = canvas.width, sourceHeight = canvas.height;
      const pixels = canvas.getContext("2d").getImageData(0, 0, sourceWidth, sourceHeight).data;
      const stride = width + 1, integral = new Uint32Array(stride * (height + 1));
      for (let y = 0; y < height; y++) {
        let row = 0;
        const startY = Math.floor(y * sourceHeight / height), endY = Math.floor((y + 1) * sourceHeight / height);
        for (let x = 0; x < width; x++) {
          const startX = Math.floor(x * sourceWidth / width), endX = Math.floor((x + 1) * sourceWidth / width);
          let ink = false;
          // Examinar todos los píxeles evita perder letras finas al reducir la imagen.
          for (let sy = startY; sy < endY && !ink; sy++) for (let sx = startX; sx < endX; sx++) {
            const offset = (sy * sourceWidth + sx) * 4;
            if (pixels[offset + 3] && (pixels[offset] < 255 || pixels[offset + 1] < 255 || pixels[offset + 2] < 255)) { ink = true; break; }
          }
          if (ink) row++;
          integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
        }
      }
      return rect => {
        const x1 = Math.max(0, Math.floor(rect.x / viewport.width * width));
        const y1 = Math.max(0, Math.floor(rect.y / viewport.height * height));
        const x2 = Math.min(width, Math.ceil((rect.x + rect.width) / viewport.width * width));
        const y2 = Math.min(height, Math.ceil((rect.y + rect.height) / viewport.height * height));
        if (x2 <= x1 || y2 <= y1) return false;
        return integral[y2 * stride + x2] - integral[y1 * stride + x2] - integral[y2 * stride + x1] + integral[y1 * stride + x1] > 0;
      };
    } catch { return null; }
  }
  function prepare(context) {
    const bounds = context.content.getBoundingClientRect();
    context.labelTextBoxes = Array.from(context.content.querySelectorAll(".textLayer span")).filter(span => span.textContent.trim()).flatMap(span => Array.from(span.getClientRects()).map(rect => ({ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height })));
    context.inkBlocked = makeInkMask(context.content.querySelector("canvas"), context.viewport);
  }
  function capSegments(item, viewport) {
    const start = { x: item.start.x * viewport.width, y: item.start.y * viewport.height };
    const end = { x: item.end.x * viewport.width, y: item.end.y * viewport.height };
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
    const px = -dy / length * 6, py = dx / length * 6;
    return [start, end].map(p => ({ type: "line", start: { x: p.x - px, y: p.y - py }, end: { x: p.x + px, y: p.y + py } }));
  }
  function shapeObstacles(annotations, viewport) {
    return annotations.flatMap(item => item.type === "highlight" ? item.rects.map(rect => ({ type: "rect", ...toPixels(rect, viewport) })) : [{ type: "line", start: { x: item.start.x * viewport.width, y: item.start.y * viewport.height }, end: { x: item.end.x * viewport.width, y: item.end.y * viewport.height } }, ...capSegments(item, viewport)]);
  }
  function anchorFor(item, context) {
    const { viewport, segment } = context;
    const top = segment.top * viewport.height, bottom = segment.bottom * viewport.height;
    if (item.type === "highlight") {
      const rects = item.rects.map(value => toPixels(value, viewport)).filter(value => value.y + value.height > top && value.y < bottom);
      if (!rects.length) return null;
      const x = Math.min(...rects.map(r => r.x)), y = Math.max(top, Math.min(...rects.map(r => r.y)));
      return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.min(bottom, Math.max(...rects.map(r => r.y + r.height))) - y };
    }
    const minY = Math.min(item.start.y, item.end.y) * viewport.height;
    const maxY = Math.max(item.start.y, item.end.y) * viewport.height;
    if (maxY < top || minY >= bottom) return null;
    const y = Math.max(top, Math.min(bottom - 1, item.start.y * viewport.height));
    const fraction = item.end.y === item.start.y ? 0 : (y / viewport.height - item.start.y) / (item.end.y - item.start.y);
    return { x: (item.start.x + (item.end.x - item.start.x) * fraction) * viewport.width, y, width: 0, height: 0 };
  }
  function bindDrag(button, tag, item, context, options, placements, callbacks, descriptor) {
    let suppressClick = false;
    button.addEventListener("click", event => { event.stopPropagation(); if (!suppressClick) callbacks.locate(item); suppressClick = false; });
    function positionMenu(event) {
      if (!callbacks.canDrag()) return;
      event.preventDefault(); event.stopPropagation();
      const placement = placements.find(p => p.id === item.id);
      if (!placement) return;
      const rect = button.getBoundingClientRect();
      callbacks.positionMenu(item, { x: event.clientX || rect.left + rect.width / 2, y: event.clientY || rect.bottom }, placement.sceneFallback ? null : { x: placement.x / context.viewport.width, y: placement.y / context.viewport.height });
    }
    if (item.type === "highlight") {
      button.addEventListener("contextmenu", positionMenu);
      button.addEventListener("keydown", event => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") positionMenu(event); });
    }
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !callbacks.canDrag() || item.labelPinned) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = tag.getBoundingClientRect(), layer = context.labelLayer.getBoundingClientRect();
      const pageTop = context.segment.top * context.viewport.height;
      const origin = { x: bounds.left - layer.left, y: bounds.top - layer.top + pageTop };
      const occupied = placements.filter(p => p.id !== item.id && (item.type !== "line" || p.type === "line"));
      let ghost, candidate, moved = false, ended = false;
      button.setPointerCapture(event.pointerId);
      function update(e) {
        const dx = e.clientX - event.clientX, dy = e.clientY - event.clientY;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        if (!ghost) {
          ghost = tag.cloneNode(true); ghost.removeAttribute("data-annotation-id"); ghost.setAttribute("aria-hidden", "true"); ghost.className = "document-shot-tag dragging-title";
          for (const control of ghost.querySelectorAll("button,select")) control.tabIndex = -1;
          ghost.style.width = `${bounds.width}px`; ghost.style.height = `${bounds.height}px`;
          context.labelLayer.append(ghost); tag.classList.add("drag-source");
        }
        candidate = { x: origin.x + dx, y: origin.y + dy, width: bounds.width, height: bounds.height };
        if (item.type === "line") candidate = geometry.constrainedLineLabel(descriptor, { x: candidate.x + bounds.width / 2, y: candidate.y + bounds.height / 2 });
        ghost.style.left = `${candidate.x}px`; ghost.style.top = `${candidate.y - pageTop}px`;
        ghost.dataset.valid = String(geometry.isClear(candidate, item.type === "highlight" ? { ...options, ...options.manualBounds } : options, occupied, true));
      }
      function finish(e, save = false) {
        if (ended) return; ended = true;
        const valid = moved && candidate && ghost?.dataset.valid === "true";
        suppressClick = moved;
        setTimeout(() => { suppressClick = false; }, 0);
        ghost?.remove(); tag.classList.remove("drag-source");
        button.removeEventListener("pointermove", update); button.removeEventListener("pointerup", up); button.removeEventListener("pointercancel", cancel); button.removeEventListener("lostpointercapture", cancel);
        window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel);
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
        if (save && valid) {
          if (item.type === "line") callbacks.moveLineTitle(item, { t: candidate.lineT, side: candidate.lineSide });
          else callbacks.move(item, { x: candidate.x / context.viewport.width, y: candidate.y / context.viewport.height });
        }
      }
      const up = e => { update(e); finish(e, true); };
      const cancel = e => finish(e);
      const escape = e => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(e); } };
      button.addEventListener("pointermove", update); button.addEventListener("pointerup", up); button.addEventListener("pointercancel", cancel); button.addEventListener("lostpointercapture", cancel);
      window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    });
  }
  function draw(context, annotations, callbacks) {
    const { displayName, scenes } = callbacks;
    const { viewport, segment, labelLayer, crop, slot } = context;
    if (!labelLayer) return;
    labelLayer.replaceChildren();
    if (!context.overflowTitles) {
      context.overflowTitles = document.createElement("div"); context.overflowTitles.className = "overflow-shot-titles";
      context.overflowTitles.setAttribute("aria-label", "Títulos sin espacio libre en el encabezado");
      slot.append(context.overflowTitles);
    }
    context.overflowTitles.replaceChildren(); context.overflowTitles.hidden = true;
    labelLayer.style.width = `${viewport.width}px`;
    const fragment = document.createDocumentFragment(), descriptors = [], buttons = new Map();
    for (const item of annotations.filter(item => item.id)) {
      const anchor = anchorFor(item, context); if (!anchor) continue;
      const tag = document.createElement("div"); tag.className = "document-shot-tag";
      tag.dataset.annotationId = item.id; tag.dataset.pinned = String(Boolean(item.labelPinned)); tag.style.setProperty("--shot-color", item.color);
      tag.style.setProperty("--shot-ink", titleInk(item.color));
      const button = document.createElement("button");
      button.type = "button"; button.className = "document-shot-label";
      button.dataset.annotationId = item.id; button.style.setProperty("--shot-color", item.color);
      button.textContent = displayName(item); button.title = `${displayName(item)} · Clic para localizar; ${item.type === "line" ? "arrastra a lo largo de la línea o al otro lado" : item.labelPinned ? "posición fijada; clic derecho para liberar" : "arrastra en Seleccionar; clic derecho para fijar"}. Los destinos en rojo no se guardan.`;
      button.setAttribute("aria-label", `Localizar plano: ${displayName(item)}. Arrastrar en Seleccionar para mover su título.`);
      tag.style.visibility = "hidden";
      tag.append(button); fragment.append(tag); buttons.set(item.id, tag);
      const scene = root.PlanoScenes.sceneAt(scenes, item.page, item.type === "line" ? item.start.y : item.rects[0].y);
      descriptors.push({ id: item.id, item, type: item.type, anchor, button: tag, nameButton: button, sceneId: scene?.id || "intro", scene,
        sceneAnchor: scene?.start.page === item.page && scene.heading && scene.heading.y >= segment.top && scene.heading.y < segment.bottom ? { ...toPixels(scene.heading, viewport), rightLimit: scene.heading.rightLimit * viewport.width } : null,
        line: item.type === "line" ? { start: { x: item.start.x * viewport.width, y: item.start.y * viewport.height }, end: { x: item.end.x * viewport.width, y: item.end.y * viewport.height } } : null,
        lineLabel: item.lineLabel || null,
        manual: item.type !== "line" && item.labelPosition ? { x: item.labelPosition.x * viewport.width, y: item.labelPosition.y * viewport.height } : null });
    }
    labelLayer.append(fragment);
    for (const descriptor of descriptors) {
      const rect = descriptor.button.getBoundingClientRect();
      descriptor.width = Math.ceil(rect.width); descriptor.height = Math.ceil(rect.height);
      if (descriptor.sceneAnchor) {
        const available = descriptor.sceneAnchor.rightLimit - descriptor.sceneAnchor.x - descriptor.sceneAnchor.width - 20;
        if (available >= 30) {
          descriptor.button.style.width = `${Math.min(descriptor.width, available)}px`;
          const compact = descriptor.button.getBoundingClientRect();
          descriptor.headingSize = { width: Math.ceil(compact.width), height: Math.ceil(compact.height) };
          descriptor.button.style.width = "";
        }
      }
    }
    const paperStyle = slot.classList.contains("is-scene-content") ? getComputedStyle(slot.querySelector(".scene-paper")) : null;
    const paddingTop = paperStyle ? parseFloat(paperStyle.paddingTop) : 0, paddingBottom = paperStyle ? parseFloat(paperStyle.paddingBottom) : 0;
    const options = {
      width: viewport.width, top: Math.max(0, segment.top * viewport.height - 14), bottom: segment.bottom * viewport.height,
      contentTop: segment.top * viewport.height, contentBottom: segment.bottom * viewport.height,
      manualBounds: { top: segment.top * viewport.height - paddingTop, bottom: segment.bottom * viewport.height + paddingBottom },
      labels: descriptors, textBoxes: context.labelTextBoxes || [], shapes: shapeObstacles(annotations, viewport),
      allowExternal: !callbacks.pageOnly,
      inkBlocked: context.inkBlocked || (() => true), inlineAllowed: Boolean(context.inkBlocked && (callbacks.pageOnly || context.labelTextBoxes?.length))
    };
    const placements = geometry.placeLabels(options);
    const overflowItems = document.createElement("div"); overflowItems.className = "overflow-title-items";
    let overflowCount = 0;
    let width = viewport.width, height = (segment.bottom - segment.top) * viewport.height;
    for (const placement of placements) {
      const button = buttons.get(placement.id);
      button.style.width = `${placement.width}px`; button.style.height = `${placement.height}px`;
      button.style.visibility = "";
      button.dataset.placement = placement.sceneFallback ? "overflow" : placement.external ? "margin" : "paper";
      button.dataset.tier = placement.manual ? "manual" : placement.tier || "scene";
      const name = button.querySelector(".document-shot-label"); name.dataset.placement = button.dataset.placement; name.dataset.tier = button.dataset.tier;
      if (placement.sceneFallback) {
        button.style.height = "auto";
        overflowItems.append(button); overflowCount++;
        continue;
      }
      button.style.left = `${placement.x}px`;
      button.style.top = `${placement.y - segment.top * viewport.height}px`;
      width = Math.max(width, placement.x + placement.width + 12);
      height = Math.max(height, placement.y - segment.top * viewport.height + placement.height + 8);
    }
    slot.style.width = `${width}px`;
    if (overflowCount) {
      const hint = document.createElement("p"); hint.className = "overflow-title-hint"; hint.textContent = "Títulos sin espacio libre en el encabezado";
      context.overflowTitles.append(hint, overflowItems);
    }
    context.overflowTitles.hidden = !overflowCount;
    context.overflowTitles.style.minHeight = "";
    context.overflowTitles.style.width = `${viewport.width}px`;
    labelLayer.style.top = `${crop.offsetTop}px`;
    slot.style.paddingBottom = `${Math.max(0, height - (segment.bottom - segment.top) * viewport.height - paddingBottom)}px`;
    slot.classList.toggle("has-margin-labels", placements.some(placement => placement.external));
    labelLayer.style.width = `${width}px`; labelLayer.style.height = `${height}px`;
    context.labelPlacements = placements;
    for (const descriptor of descriptors) bindDrag(descriptor.nameButton, descriptor.button, descriptor.item, context, options, placements, callbacks, descriptor);
  }
  root.PlanoDocumentLabels = { prepare, draw, shapeObstacles, capSegments };
})(globalThis);
