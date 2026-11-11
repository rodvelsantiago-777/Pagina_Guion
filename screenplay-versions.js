/* Copias finalizadas del guion, independientes del borrador y de sus planos. */
(function (root) {
  'use strict';
  const commonjs = typeof module === 'object' && module.exports;
  const screenplay = commonjs ? require('./screenplay.js') : root.PlanoScreenplay;
  const byteLimit = 1000000;
  const label = number => 'v' + number;
  const number = script => script.edition ?? screenplay.coverDetails(script).edition;

  function validate(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 1000) throw Error('El historial de versiones no es válido.');
    let previous = 0;
    return value.map(entry => {
      if (!Number.isSafeInteger(entry?.number) || entry.number <= previous || entry.number >= Number.MAX_SAFE_INTEGER ||
          (entry.date !== null && (typeof entry.date !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.date) ||
          !Number.isFinite(Date.parse(entry.date)))) || typeof entry.gzip !== 'string' || entry.gzip.length > 350000 ||
          entry.gzip.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.gzip)) {
        throw Error('Hay una versión finalizada que no es válida.');
      }
      previous = entry.number;
      return { number: entry.number, date: entry.date, gzip: entry.gzip };
    });
  }

  async function archive(script, date = new Date().toISOString()) {
    const { edition, copyright, contacts } = screenplay.coverDetails(script);
    if (edition >= Number.MAX_SAFE_INTEGER) throw Error('No se puede asignar un número a la próxima versión.');
    const snapshot = screenplay.validate({ ...script, edition, copyright, authors: contacts, sourceLayout: undefined });
    const json = JSON.stringify(snapshot);
    const source = new Blob([json]);
    if (source.size > byteLimit) throw Error('Esta versión supera el tamaño admitido para el historial.');
    const compressed = source.stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return validate([{ number: edition, date, gzip: btoa(binary) }])[0];
  }

  async function read(entry) {
    const bytes = Uint8Array.from(atob(entry.gzip), char => char.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let json = '', length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > byteLimit) throw Error('Esta versión supera el tamaño admitido para el historial.');
        json += decoder.decode(value, { stream: true });
      }
      const snapshot = screenplay.validate(JSON.parse(json + decoder.decode()));
      if (!snapshot || number(snapshot) !== entry.number) throw Error('El número de la copia no coincide.');
      return snapshot;
    } catch {
      throw Error('No se pudo leer la versión ' + label(entry.number) + '.');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  function nextDraft(script, previous, versions) {
    const latest = versions.at(-1);
    if (!latest) return script;
    const edition = number(previous);
    if (latest.number !== edition) return script;
    const changed = script.title !== previous.title || script.copyright !== previous.copyright ||
      ['authors', 'characters', 'doc'].some(key => JSON.stringify(script[key]) !== JSON.stringify(previous[key]));
    return changed ? { ...script, edition: edition + 1 } : script;
  }

  // Los identificadores de párrafo se conservan en el redactor. La subsecuencia
  // ascendente mantiene alineados los bloques que siguen en el mismo orden.
  function anchors(left, right) {
    const positions = new Map(right.map((item, index) => [item.key, index]));
    const candidates = left.flatMap((item, index) => positions.has(item.key) ? [[index, positions.get(item.key)]] : []);
    const tails = [], parents = [];
    for (const [i, pair] of candidates.entries()) {
      let lo = 0, hi = tails.length;
      while (lo < hi) {
        const middle = (lo + hi) >> 1;
        if (candidates[tails[middle]][1] < pair[1]) lo = middle + 1;
        else hi = middle;
      }
      parents[i] = lo ? tails[lo - 1] : -1;
      tails[lo] = i;
    }
    const matches = [];
    for (let i = tails.at(-1); i >= 0; i = parents[i]) matches.push(candidates[i]);
    return matches.reverse();
  }

  function fragments(left, right) {
    const tokenize = text => text.match(/[\p{L}\p{M}\p{N}]+|\s+|[^\s\p{L}\p{M}\p{N}]/gu) || [];
    const a = tokenize(left), b = tokenize(right);
    const result = [[], []];
    const push = (side, text, changed) => {
      const runs = result[side], last = runs.at(-1);
      if (!text) return;
      if (last?.changed === changed) last.text += text;
      else runs.push({ text, changed });
    };
    let start = 0, endA = a.length, endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) {
      push(0, a[start], false);
      push(1, b[start++], false);
    }
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    const height = endA - start, width = endB - start;
    if (height && width && height * width <= 120000) {
      const stride = width + 1, table = new Uint32Array((height + 1) * stride);
      for (let i = height - 1; i >= 0; i--) {
        for (let j = width - 1; j >= 0; j--) {
          const p = i * stride + j;
          table[p] = a[start + i] === b[start + j] ?
            1 + table[p + stride + 1] : Math.max(table[p + stride], table[p + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < height || j < width) {
        if (i < height && j < width && a[start + i] === b[start + j]) {
          push(0, a[start + i++], false);
          push(1, b[start + j++], false);
        } else if (j === width || (i < height && table[(i + 1) * stride + j] >= table[i * stride + j + 1])) {
          push(0, a[start + i++], true);
        } else push(1, b[start + j++], true);
      }
    } else {
      push(0, a.slice(start, endA).join(''), true);
      push(1, b.slice(start, endB).join(''), true);
    }
    const suffix = a.slice(endA).join('');
    push(0, suffix, false);
    push(1, suffix, false);
    return result;
  }

  function rows(script) {
    const { contacts, copyright } = screenplay.coverDetails(script);
    const metadata = [
      { key: 'title', name: 'Título', text: script.title },
      ...contacts.map((author, index) => ({
        key: 'author:' + author.id,
        name: 'Autoría ' + (index + 1),
        text: [author.name, author.email, author.phone, author.contact].filter(Boolean).join('\n')
      })),
      { key: 'copyright', name: 'Copyright', text: copyright },
      { key: 'characters', name: 'Personajes registrados', text: script.characters.join(', ') }
    ];
    return metadata.filter(row => row.text).concat(script.doc.content.map(node => {
      let offset = 0;
      const marks = [];
      for (const piece of node.content || []) {
        if (piece.marks?.length) marks.push({ from: offset, to: offset + piece.text.length, marks: piece.marks });
        offset += piece.text.length;
      }
      return { key: 'body:' + node.attrs.id, name: screenplay.kinds[node.attrs.kind], text: screenplay.plain(node), marks };
    }));
  }

  function compare(before, after) {
    const left = rows(before);
    if (!after) return left.map(item => ({ before: item, type: 'same' }));
    const right = rows(after), result = [];
    let i = 0, j = 0;
    for (const [a, b] of [...anchors(left, right), [left.length, right.length]]) {
      while (i < a) result.push({ before: left[i++], type: 'removed' });
      while (j < b) result.push({ after: right[j++], type: 'added' });
      if (i === left.length || j === right.length) break;
      const previous = left[i++], next = right[j++];
      const changed = previous.text !== next.text;
      const styles = item => JSON.stringify(changed ? item.marks?.map(run => run.marks) : item.marks);
      const format = styles(previous) !== styles(next) || previous.name !== next.name;
      result.push({
        before: previous, after: next,
        type: changed || format ? 'changed' : 'same',
        format, fragments: changed ? fragments(previous.text, next.text) : null
      });
    }
    return result;
  }

  const api = { validate, archive, read, number, label, nextDraft, compare };
  if (commonjs) module.exports = api;
  else root.PlanoScreenplayVersions = api;
})(globalThis);
