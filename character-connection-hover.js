/* Un único resaltado por lienzo. Salir de la conexión cancela también la espera. */
(function (root) {
  'use strict';
  function create(canvas) {
    const controls = new WeakMap();
    let pending, active, timer, disabled = false;
    function bindingFor(element) {
      for (let node = element; node && node !== canvas; node = node.parentElement) if (controls.has(node)) return controls.get(node);
    }
    function clear() {
      clearTimeout(timer); timer = null; pending = null;
      if (active) { const previous = active; active = null; previous.hide(); }
    }
    function enter(binding, event) {
      if (disabled || event.pointerType === 'touch' || pending === binding || active === binding) return;
      clear(); pending = binding;
      timer = setTimeout(() => {
        timer = null;
        if (disabled || pending !== binding) return;
        if (!binding.elements.some(element => element.isConnected && element.matches(':hover'))) { clear(); return; }
        pending = null; active = binding; binding.show();
      }, 3000);
    }
    function bind(elements, show, hide) {
      const binding = { elements, show, hide };
      for (const element of elements) {
        controls.set(element, binding);
        element.addEventListener('pointerenter', event => enter(binding, event));
        element.addEventListener('pointerleave', event => {
          if (bindingFor(event.relatedTarget) === binding) return;
          if (pending === binding || active === binding) clear();
        });
      }
    }
    canvas.addEventListener('pointerleave', clear);
    canvas.addEventListener('pointerdown', clear, { capture: true });
    canvas.addEventListener('wheel', clear, { passive: true });
    return { bind, clear, setDisabled(value) { disabled = value; if (value) clear(); } };
  }
  root.PlanoConnectionHover = { create };
})(globalThis);
