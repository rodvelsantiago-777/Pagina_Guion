/* Paneles pequeños junto al control que los abre. */
(function () {
  "use strict";
  const anchors = new Map();
  function place(element, anchor = anchors.get(element)) {
    if (!anchor || !element.matches(":popover-open")) return;
    const box = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const size = element.getBoundingClientRect(), gap = 7;
    const left = Math.max(8, Math.min(innerWidth - size.width - 8, box.right - size.width));
    const below = box.bottom + gap, above = box.top - size.height - gap;
    const top = below + size.height <= innerHeight - 8 || above < 8 ? Math.max(8, Math.min(innerHeight - size.height - 8, below)) : above;
    element.style.left = `${left}px`; element.style.top = `${top}px`;
  }
  function hide(element, restore = false) {
    const anchor = anchors.get(element);
    if (element.matches(":popover-open")) element.hidePopover();
    if (restore && anchor instanceof Element && anchor.isConnected) anchor.focus({ preventScroll: true });
  }
  function show(element, anchor) {
    if (element.matches(":popover-open")) { hide(element, true); return; }
    anchors.set(element, anchor);
    if (!element.dataset.positionBound) {
      element.dataset.positionBound = "true";
      element.addEventListener("toggle", () => {
        const target = anchors.get(element);
        if (target instanceof Element) target.setAttribute("aria-expanded", String(element.matches(":popover-open")));
      });
    }
    element.showPopover(); place(element, anchor);
  }
  for (const type of ["resize", "scroll"]) window.addEventListener(type, event => {
    for (const [element, anchor] of anchors) {
      if (!element.matches(":popover-open")) continue;
      if (type === "scroll" && element.contains(event.target)) continue;
      place(element, anchor);
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const opened = [...anchors.keys()].filter(element => element.matches(":popover-open"));
    if (!opened.length) return;
    event.preventDefault(); event.stopImmediatePropagation(); hide(opened.at(-1), true);
  }, true);
  window.PlanoPopover = { show, hide, place };
})();
