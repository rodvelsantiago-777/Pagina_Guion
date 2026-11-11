(function (root) {
  'use strict';
  const versions = root.PlanoScreenplayVersions;
  const date = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
  let dialog, renderId = 0, context;

  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'version-history-dialog';
    dialog.id = 'version-history-dialog';
    dialog.setAttribute('aria-labelledby', 'version-history-title');
    dialog.innerHTML = `
      <header>
        <div><h2 id="version-history-title">Historial de versiones</h2><p id="version-history-project"></p></div>
        <form method="dialog"><button class="shot-close" aria-label="Cerrar historial">×</button></form>
      </header>
      <div class="version-history-controls">
        <label>Versión izquierda<select id="version-history-left"></select></label>
        <label>Versión derecha<select id="version-history-right"></select></label>
        <label class="version-history-filter"><input type="checkbox" id="version-history-changes"> Solo cambios</label>
      </div>
      <div id="version-history-legend" class="version-history-legend" hidden>
        <span class="version-removed">Quitado</span><span class="version-added">Añadido</span><span class="version-format">Formato o tipo de párrafo</span>
      </div>
      <p id="version-history-status" role="status"></p>
      <div id="version-history-result" class="version-history-result" tabindex="0" aria-label="Texto de las versiones"></div>`;
    for (const input of dialog.querySelectorAll('select,input')) input.addEventListener('change', render);
    dialog.addEventListener('close', () => {
      context = null;
      renderId++;
      dialog.querySelector('#version-history-result').replaceChildren();
      dialog.querySelector('#version-history-project').textContent = '';
      for (const select of dialog.querySelectorAll('select')) select.replaceChildren();
    });
    document.body.append(dialog);
  }

  function visibleRuns(runs, onlyChanges) {
    let offset = 0;
    return runs.flatMap((run, index) => {
      const from = offset;
      offset += run.text.length;
      if (!onlyChanges || run.changed || run.text.length <= 250) return [{ ...run, from }];
      const parts = [];
      if (index > 0 || runs.length === 1) parts.push({ text: run.text.slice(0, 115), from });
      parts.push({ text: '\n…\n' });
      if (index < runs.length - 1 || runs.length === 1) parts.push({ text: run.text.slice(-115), from: offset - 115 });
      return parts;
    });
  }

  function appendRun(container, run, marks, style) {
    const parent = run.changed ? document.createElement('mark') : container;
    if (run.changed) parent.className = 'version-' + style;
    let cursor = 0;
    if (run.from !== undefined) {
      const end = run.from + run.text.length;
      for (const range of marks) {
        if (range.to <= run.from) continue;
        if (range.from >= end) break;
        const from = Math.max(0, range.from - run.from), to = Math.min(run.text.length, range.to - run.from);
        parent.append(run.text.slice(cursor, from));
        const span = document.createElement('span');
        span.className = range.marks.map(mark => 'version-text-' + mark.type).join(' ');
        span.textContent = run.text.slice(from, to);
        parent.append(span);
        cursor = to;
      }
    }
    parent.append(run.text.slice(cursor));
    if (parent !== container) container.append(parent);
  }

  function cell(item, fragments, style, format, onlyChanges) {
    const cell = document.createElement('div');
    cell.className = 'version-cell' + (item ? '' : ' version-cell-empty');
    if (!item) {
      cell.setAttribute('aria-hidden', 'true');
      return cell;
    }
    const name = document.createElement('span');
    name.className = 'version-row-label';
    name.textContent = item.name;
    if (format) {
      const change = document.createElement('span');
      change.className = 'version-format';
      change.textContent = 'Formato o tipo modificado';
      name.append(' ', change);
    }
    const text = document.createElement('p');
    const runs = fragments || [{ text: item.text, changed: Boolean(style) }];
    for (const run of visibleRuns(runs, onlyChanges)) appendRun(text, run, item.marks || [], style);
    cell.append(name, text);
    return cell;
  }

  async function render() {
    const id = ++renderId, current = context;
    const left = current.options.get(dialog.querySelector('#version-history-left').value);
    const right = current.options.get(dialog.querySelector('#version-history-right').value);
    const filter = dialog.querySelector('#version-history-changes');
    const output = dialog.querySelector('#version-history-result'), status = dialog.querySelector('#version-history-status');
    const legend = dialog.querySelector('#version-history-legend');
    filter.disabled = !right;
    legend.hidden = !right;
    output.classList.toggle('version-history-single', !right);
    output.replaceChildren();
    output.scrollTop = 0;
    if (!left) {
      status.textContent = 'Marca el guion como finalizado en su ficha para guardar la primera versión.';
      return;
    }
    status.textContent = 'Cargando el guion…';
    try {
      for (const option of current.options.values()) if (option !== left && option !== right) option.work = null;
      const load = option => {
        if (!option) return null;
        if (option.script) return option.script;
        return option.work ||= versions.read(option.entry).catch(error => {
          option.work = null;
          throw error;
        });
      };
      const [before, after] = await Promise.all([load(left), load(right)]);
      if (id !== renderId || !dialog.open) return;
      const rows = versions.compare(before, after);
      const count = rows.filter(row => row.type !== 'same').length;
      status.textContent = right
        ? count ? count + (count === 1 ? ' bloque con cambios' : ' bloques con cambios') : 'Estas versiones tienen el mismo contenido.'
        : left.description;
      const list = document.createDocumentFragment(), headings = document.createElement('div');
      headings.className = 'version-history-columns';
      for (const option of [left, right].filter(Boolean)) {
        const heading = document.createElement('strong');
        heading.textContent = option.description;
        headings.append(heading);
      }
      list.append(headings);
      for (const row of rows) {
        if (right && filter.checked && row.type === 'same') continue;
        const element = document.createElement('div');
        element.className = 'version-history-row';
        const leftStyle = ['removed', 'changed'].includes(row.type) ? 'removed' : '';
        const rightStyle = ['added', 'changed'].includes(row.type) ? 'added' : '';
        const onlyChanges = right && filter.checked;
        element.append(cell(row.before, row.fragments?.[0], row.format && !row.fragments ? 'format' : leftStyle, row.format, onlyChanges));
        if (right) element.append(cell(row.after, row.fragments?.[1], row.format && !row.fragments ? 'format' : rightStyle, row.format, onlyChanges));
        list.append(element);
      }
      output.append(list);
    } catch (error) {
      if (id === renderId && dialog.open) status.textContent = error.message;
    }
  }

  function open(value) {
    if (!dialog) createDialog();
    if (dialog.open) return;
    const options = new Map();
    for (const entry of [...value.versions].reverse()) {
      const when = entry.date ? date.format(new Date(entry.date)) : 'Sin fecha registrada';
      options.set(String(entry.number), { entry, description: versions.label(entry.number) + ' · ' + when });
    }
    if (value.script && !value.info?.completed && value.versions.at(-1)?.number !== versions.number(value.script)) {
      options.set('draft', { script: value.script, description: versions.label(versions.number(value.script)) + ' · Borrador actual' });
    }
    context = { options };
    dialog.querySelector('#version-history-project').textContent = value.name;
    const left = dialog.querySelector('#version-history-left'), right = dialog.querySelector('#version-history-right');
    left.replaceChildren();
    right.replaceChildren(new Option('Ver una sola versión', ''));
    for (const [id, option] of options) {
      left.add(new Option(option.description, id));
      right.add(new Option(option.description, id));
    }
    const [latest, previous] = value.versions.slice(-2).reverse().map(entry => String(entry.number));
    left.value = previous || latest || (options.has('draft') ? 'draft' : '');
    right.value = latest && options.has('draft') ? 'draft' : previous ? latest : '';
    if (right.value === 'draft') left.value = latest;
    left.disabled = options.size === 0;
    right.disabled = options.size < 2;
    dialog.querySelector('#version-history-changes').checked = false;
    dialog.showModal();
    render();
  }

  root.PlanoVersionHistory = { open, close: () => dialog?.close() };
})(globalThis);
