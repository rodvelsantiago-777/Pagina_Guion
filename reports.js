/* Reportes independientes del editor y del inicio de sesión. Sin guiones ni credenciales. */
(function () {
  'use strict';
  const endpoint = 'https://formsubmit.co/ajax/rodvelsantiago@gmail.com';
  const site = 'https://rodvelsantiago-777.github.io/Pagina_Guion/';
  const script = document.currentScript;
  const version = (() => {
    try { return (new URL(script.src).searchParams.get('v') || 'desarrollo').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80); }
    catch { return 'desarrollo'; }
  })();
  function init() {
    if (document.querySelector('#report-dialog')) return;
    const button = document.createElement('button');
    button.id = 'report-launch'; button.className = 'report-launch'; button.type = 'button';
    button.setAttribute('popover', 'manual');
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'report-dialog');
    button.setAttribute('aria-label', 'Reportar un error'); button.title = 'Reportar un error';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3 2 3m6-3-2 3M3 9h4m10 0h4M3 15h4m10 0h4M6 21l3-3m9 3-3-3M12 10v9"/><rect x="7" y="6" width="10" height="14" rx="5"/></svg><span>Reportar un error</span>';
    const dialog = document.createElement('dialog');
    dialog.id = 'report-dialog'; dialog.className = 'report-dialog';
    dialog.setAttribute('aria-labelledby', 'report-heading');
    dialog.innerHTML = `
      <form id="report-form" novalidate autocomplete="off">
        <header class="report-heading"><div><span class="report-eyebrow">AYÚDANOS A MEJORAR PLANO</span><h2 id="report-heading">Reportar un error</h2></div><button type="button" class="report-close" aria-label="Cerrar reporte">×</button></header>
        <p class="report-intro">Cuéntanos qué ocurrió y cómo podemos reproducirlo.</p>
        <label for="report-title">¿Qué ha fallado?</label>
        <input id="report-title" name="title" required maxlength="120" placeholder="Por ejemplo: no puedo mover un plano" spellcheck="true">
        <label for="report-details">Detalles</label>
        <textarea id="report-details" name="details" required minlength="10" maxlength="5000" rows="5" placeholder="Qué estabas haciendo, qué pasó y qué esperabas que ocurriera…" spellcheck="true"></textarea>
        <label for="report-email">Correo para responderte <span>(opcional)</span></label>
        <input id="report-email" name="reply" type="text" inputmode="email" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="tu@correo.com">
        <div class="report-honey" aria-hidden="true"><label>Deja este campo vacío<input name="_honey" tabindex="-1" autocomplete="off"></label></div>
        <details class="report-diagnostics"><summary>Datos técnicos que se incluirán</summary><p id="report-context"></p></details>
        <p class="report-privacy">Se enviará a soporte mediante FormSubmit. No adjuntamos tu guion, planos ni archivos. Evita incluir contraseñas o información sensible. <a href="https://formsubmit.co/privacy.pdf" target="_blank" rel="noopener noreferrer">Privacidad del servicio</a></p>
        <p id="report-status" class="report-status" role="status" aria-live="polite" hidden></p>
        <footer class="report-actions"><button type="button" class="report-dismiss">Cancelar</button><button type="submit" class="report-send">Enviar reporte</button></footer>
      </form>`;
    document.body.append(button, dialog);
    const form = dialog.querySelector('form'), title = form.querySelector('#report-title');
    const details = form.querySelector('#report-details'), email = form.querySelector('#report-email');
    const status = form.querySelector('#report-status'), send = form.querySelector('.report-send');
    const dismiss = form.querySelector('.report-dismiss');
    let busy = false, sent = false, lastSent = 0, context = null, previousFocus = null;
    const stack = [...document.querySelectorAll('dialog[open]')];
    function placeButton() {
      // La ventana técnica puede clonar un diálogo del editor que contenga este acceso.
      for (const copy of document.querySelectorAll('#report-launch')) if (copy !== button) copy.remove();
      const active = dialog.open ? dialog : stack.filter(item => item.isConnected && item.open && item !== dialog).at(-1);
      const parent = active || document.body;
      if (button.parentElement !== parent) {
        if (button.matches(':popover-open')) button.hidePopover();
        parent.append(button);
      }
      // La capa superior evita recortes del diálogo; ser su descendiente conserva el acceso modal.
      if (!button.matches(':popover-open')) button.showPopover();
      button.setAttribute('aria-expanded', String(dialog.open));
    }
    // Mantiene el icono en la misma esquina, incluso al abrir otro diálogo modal.
    new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          const item = record.target;
          if (!item.matches('dialog')) continue;
          const index = stack.indexOf(item); if (index >= 0) stack.splice(index, 1);
          if (item.open) stack.push(item);
          changed = true;
        } else if ([...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
          (node === button || node.matches('dialog') || node.contains(button) || node.querySelector('dialog')))) changed = true;
      }
      if (changed) { for (const item of document.querySelectorAll('dialog[open]')) if (!stack.includes(item)) stack.push(item); placeButton(); }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    function diagnostics() {
      const classes = document.body.classList;
      const section = document.body.dataset.detached === 'true' ? 'Guion técnico (ventana independiente)' :
        classes.contains('auth-locked') ? 'Acceso a la cuenta' : !classes.contains('is-editing') ? 'Proyectos' :
        classes.contains('is-writing') ? 'Escribir guion' : classes.contains('is-technical') ? 'Guion técnico' : 'Líneas de cobertura';
      const ua = navigator.userAgent;
      const match = ua.match(/(Edg|Firefox|Chrome|Version)\/(\d+)/);
      const browser = match ? `${({ Edg: 'Edge', Version: 'Safari', Chrome: 'Chromium (Chrome/Brave)' })[match[1]] || match[1]} ${match[2]}` : 'No identificado';
      return { section, browser, version, date: new Date().toISOString() };
    }
    function message(text, error = false) {
      status.textContent = text; status.hidden = !text; status.classList.toggle('is-error', error);
    }
    function open() {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      if (sent) { form.reset(); sent = false; message(''); for (const input of [title, details, email]) input.readOnly = false; }
      if (!email.value) {
        try { email.value = String(globalThis.PlanoAccounts?.getUser()?.email || '').slice(0, 254); } catch { /* Acceso también sin cuenta. */ }
      }
      context = diagnostics();
      form.querySelector('#report-context').textContent = `Apartado: ${context.section} · Navegador: ${context.browser} · Versión: ${context.version} · Fecha UTC: ${context.date}`;
      send.disabled = false; send.textContent = 'Enviar reporte'; dismiss.textContent = 'Cancelar';
      dialog.showModal(); placeButton(); title.focus();
    }
    function close() { if (!busy) dialog.close(); }
    button.addEventListener('click', () => dialog.open ? close() : open());
    button.addEventListener('toggle', event => { if (event.newState === 'closed' && button.isConnected) queueMicrotask(placeButton); });
    form.querySelector('.report-close').addEventListener('click', close);
    dismiss.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { placeButton(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    for (const input of [title, details, email]) input.addEventListener('input', () => input.setCustomValidity(''));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || sent) return;
      title.setCustomValidity(title.value.trim() ? '' : 'Escribe un título para el reporte.');
      details.setCustomValidity(details.value.trim().length >= 10 ? '' : 'Describe lo que ocurrió con al menos 10 caracteres.');
      const reply = email.value.trim();
      email.setCustomValidity(!reply || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply) ? '' : 'Revisa el correo de contacto.');
      if (!form.reportValidity()) return;
      if (form.elements._honey.value) { message('No se pudo enviar. Vuelve a abrir el formulario.', true); return; }
      if (Date.now() - lastSent < 60000) { message('Espera un minuto antes de enviar otro reporte.', true); return; }
      if (!['http:', 'https:'].includes(location.protocol)) { message('Para enviar reportes, abre PLANO desde su página web o un servidor local. Conservamos tu mensaje.', true); return; }
      if (navigator.onLine === false) { message('No hay conexión. Tu mensaje sigue aquí; inténtalo cuando vuelvas a conectarte.', true); return; }
      const id = globalThis.crypto?.randomUUID?.() || `R-${Date.now().toString(36)}`;
      const payload = {
        _subject: `PLANO · Reporte: ${title.value.trim()}`, _template: 'table', _url: site, _honey: '',
        Referencia: id, Asunto: title.value.trim(), Descripcion: details.value.trim(),
        Apartado: context.section, Navegador: context.browser, Version: context.version, Fecha: context.date
      };
      if (reply) { payload.email = reply; payload._replyto = reply; }
      busy = true; dialog.setAttribute('aria-busy', 'true');
      // Conserva los datos durante la petición y evita modificaciones que luego parezcan enviadas.
      for (const input of [title, details, email]) input.readOnly = true;
      send.disabled = true; send.textContent = 'Enviando…'; message('Enviando tu reporte…');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit', referrerPolicy: 'origin'
        });
        const result = await response.json();
        if (!response.ok || ![true, 'true'].includes(result?.success)) {
          const error = new Error('rejected');
          if (/needs activation|activate.*form/i.test(String(result?.message || ''))) error.name = 'ActivationRequired';
          throw error;
        }
        sent = true; lastSent = Date.now();
        message(`Reporte recibido por el servicio de envío. Gracias por ayudarnos a mejorar. Referencia: ${id}`);
        send.textContent = 'Reporte enviado'; dismiss.textContent = 'Cerrar';
      } catch (error) {
        message(error.name === 'ActivationRequired' ? 'El canal de reportes está pendiente de activación por soporte. Conservamos tu mensaje para que puedas reintentarlo después.' :
          error.name === 'AbortError' ? 'El servicio tardó demasiado. No pudimos confirmar el envío; conservamos tu mensaje para que puedas reintentarlo.' :
          'No pudimos confirmar el envío. Tu mensaje sigue aquí. Revisa la conexión o los bloqueos del navegador y vuelve a intentarlo.', true);
        send.disabled = false; send.textContent = 'Reintentar envío';
      } finally {
        clearTimeout(timer); busy = false; dialog.removeAttribute('aria-busy');
        for (const input of [title, details, email]) input.readOnly = sent;
      }
    });
    placeButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
