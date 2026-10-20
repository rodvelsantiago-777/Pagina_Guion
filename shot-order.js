/* Arrastre de tarjetas con ratón, tacto y alternativa de teclado. */
(function (root) {
  "use strict";
  function bind(handle, card, commit) {
    let dragging = false;
    handle.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
    handle.addEventListener("keydown", event => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const ids = [...new Set(Array.from(card.parentElement.querySelectorAll(".annotation-card")).map(node => node.dataset.shotId))];
      const target = ids[ids.indexOf(card.dataset.shotId) + (event.key === "ArrowDown" ? 1 : -1)];
      if (target) commit(card.dataset.shotId, target, event.key === "ArrowDown");
    });
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || dragging) return;
      event.preventDefault(); event.stopPropagation();
      const parent = card.parentElement, scroller = document.querySelector("#annotations-list");
      const origin = { x: event.clientX, y: event.clientY }, bounds = card.getBoundingClientRect();
      let last = event, target = null, after = false, ghost = null, frame = 0, ended = false;
      dragging = true; handle.setPointerCapture(event.pointerId);
      function clearTarget() { for (const node of parent.querySelectorAll(".drop-before,.drop-after")) node.classList.remove("drop-before", "drop-after"); }
      function updateTarget() {
        clearTarget(); target = null;
        const node = document.elementFromPoint(last.clientX, last.clientY)?.closest(".annotation-card");
        if (!node || node.parentElement !== parent || node.dataset.shotId === card.dataset.shotId) return;
        const listBounds = scroller.getBoundingClientRect();
        if (last.clientX < listBounds.left || last.clientX > listBounds.right || last.clientY < listBounds.top || last.clientY > listBounds.bottom) return;
        const rect = node.getBoundingClientRect(); after = last.clientY >= rect.top + rect.height / 2;
        target = node.dataset.shotId; node.classList.add(after ? "drop-after" : "drop-before");
      }
      function tick() {
        if (!ghost || ended) return;
        const rect = scroller.getBoundingClientRect();
        if (last.clientY < rect.top + 45) scroller.scrollTop -= 12;
        if (last.clientY > rect.bottom - 45) scroller.scrollTop += 12;
        updateTarget(); frame = requestAnimationFrame(tick);
      }
      function move(e) {
        last = e;
        if (!ghost && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 6) return;
        if (!ghost) {
          ghost = card.cloneNode(true); ghost.className = "reorder-ghost"; ghost.removeAttribute("data-id"); ghost.setAttribute("aria-hidden", "true");
          for (const button of ghost.querySelectorAll("button")) button.tabIndex = -1;
          ghost.style.width = `${bounds.width}px`; document.body.append(ghost); card.classList.add("is-reordering"); frame = requestAnimationFrame(tick);
        }
        ghost.style.left = `${Math.max(4, Math.min(innerWidth - bounds.width - 4, bounds.left + e.clientX - origin.x))}px`;
        ghost.style.top = `${Math.max(4, Math.min(innerHeight - 100, bounds.top + e.clientY - origin.y))}px`;
        updateTarget();
      }
      function finish(save) {
        if (ended) return; ended = true;
        const destination = target, position = after;
        cancelAnimationFrame(frame); clearTarget(); ghost?.remove(); card.classList.remove("is-reordering"); dragging = false;
        handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", cancel); handle.removeEventListener("lostpointercapture", cancel);
        window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", cancel);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        if (save && destination) commit(card.dataset.shotId, destination, position);
      }
      const up = e => { move(e); finish(true); }, cancel = () => finish(false);
      const escape = e => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); } };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", cancel); handle.addEventListener("lostpointercapture", cancel);
      window.addEventListener("keydown", escape, true); window.addEventListener("blur", cancel);
    });
  }
  root.PlanoShotOrder = { bind };
})(globalThis);
