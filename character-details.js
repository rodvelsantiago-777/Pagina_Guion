/* Catálogo y formato de los campos opcionales de la ficha. */
(function (root) {
  'use strict';

  const short = (id, label, placeholder) => ({ id, label, placeholder, kind: 'text', limit: 160 });
  const long = (id, label) => ({ id, label, kind: 'textarea', limit: 4000 });
  const choice = (id, label, options, customLabel) => ({ id, label, kind: 'select', options, customLabel, limit: 160 });
  const relationshipLimit = 120;
  const maxRelationships = 499;
  const relationshipTypes = Object.freeze([
    'Familia', 'Conocidos', 'Romance', 'Amistad', 'Trabajo o estudios', 'Mentoría', 'Rivalidad', 'Enemistad', 'Otro',
  ]);
  const relationshipKey = ({ targetId, type }) => targetId + ':' + type.trim().toLocaleLowerCase('es').normalize('NFC');
  const mbtiTypes = [
    'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
    'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
  ];
  const personalityGroups = [
    { label: 'Tipos MBTI', options: mbtiTypes },
    { label: 'Variante asertiva (-A)', options: mbtiTypes.map(type => type + '-A') },
    { label: 'Variante turbulenta (-T)', options: mbtiTypes.map(type => type + '-T') },
  ];

  const definitions = [
    choice('startStatus', 'Estado al inicio de la historia', ['Vivo', 'Muerto', 'Desconocido'], 'Otro estado'),
    choice('arc', 'Arco de personaje', ['Cambio positivo', 'Plano o estático', 'Cambio negativo', 'Desilusión', 'Caída', 'Corrupción', 'Redención', 'Maduración'], 'Otro arco'),
    long('motivation', 'Motivación'),
    long('want', '¿Qué quiere?'),
    long('need', '¿Qué necesita?'),
    long('internalGoal', 'Objetivo interno'),
    long('externalGoal', 'Objetivo externo'),
    long('innerConflict', 'Conflicto interno (debilidad)'),
    long('greatestFear', 'Su mayor miedo'),
    long('secret', 'Secreto que oculta'),
    { id: 'relationships', label: 'Relaciones', kind: 'relationships' },
    short('allegiance', 'Bando o lealtad'),
    choice('maritalStatus', 'Estado civil', ['Soltero/a', 'Casado/a', 'En unión libre', 'Separado/a', 'Divorciado/a', 'Viudo/a'], 'Otro estado civil'),
    choice('orientation', 'Orientación sexual', [
      'Heterosexual', 'Homosexual', 'Gay', 'Lesbiana', 'Bisexual', 'Pansexual', 'Polisexual', 'Omnisexual',
      'Asexual', 'Grisexual', 'Demisexual', 'Androsexual', 'Ginesexual', 'Abrosexual', 'Queer',
      'Sexualmente fluida', 'En exploración', 'Sin etiqueta',
    ], 'Otra orientación'),
    { ...choice('personalityType', 'Tipo de personalidad (MBTI)', personalityGroups.flatMap(group => group.options)), optionGroups: personalityGroups },
    long('personality', 'Personalidad'),
    long('virtues', 'Virtudes'),
    long('flaws', 'Defectos'),
    long('speech', 'Forma de hablar'),
    short('species', 'Especie'),
    short('birthplace', 'Lugar de nacimiento'),
    short('birthDate', 'Fecha de nacimiento', 'Ej. 29/03/2003'),
    short('height', 'Altura', 'Ej. 1,72 m'),
    short('weight', 'Peso', 'Ej. 68 kg'),
    long('appearance', 'Descripción física'),
    long('clothing', 'Forma de vestir'),
    long('health', 'Salud'),
    long('conditions', 'Alergias o enfermedades'),
    short('workOrStudies', 'Trabajo o estudios'),
    long('skills', 'Habilidades'),
    long('interests', 'Hobbies e intereses'),
    long('importantFacts', 'Datos importantes'),
  ];
  const fields = new Map(definitions.map(field => [field.id, field]));

  function text(value, limit, label) {
    if (typeof value !== 'string') throw Error('Revisa el campo «' + label + '».');
    const normalized = value.replace(/\r\n?/g, '\n');
    if (normalized.length > limit) throw Error('«' + label + '» admite hasta ' + limit + ' caracteres.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw Error('Hay caracteres inválidos en «' + label + '».');
    return normalized.trim();
  }

  function relationships(value, projectIds, ownerId) {
    if (!Array.isArray(value) || value.length > maxRelationships) throw Error('Revisa las relaciones del personaje.');
    const seen = new Set();
    return value.map(entry => {
      if (!entry || typeof entry.targetId !== 'string' || entry.targetId === ownerId || !projectIds.has(entry.targetId)) {
        throw Error('Cada relación debe apuntar a otro personaje de este proyecto.');
      }
      const type = text(entry.type, relationshipLimit, 'Relación');
      if (!type) throw Error('Describe el vínculo de cada relación.');
      const key = relationshipKey({ targetId: entry.targetId, type });
      if (seen.has(key)) throw Error('Esa relación ya está añadida.');
      seen.add(key);
      return { targetId: entry.targetId, type };
    });
  }

  function relationshipsFor(profiles, id) {
    if (!id) return;
    const outgoing = profiles.find(profile => profile.id === id)?.details?.relationships;
    const links = new Map();
    for (const entry of outgoing || []) links.set(relationshipKey(entry), { ...entry, sourceId: id });
    for (const profile of profiles) {
      if (profile.id === id) continue;
      for (const entry of profile.details?.relationships || []) {
        if (entry.targetId !== id) continue;
        const reverse = { targetId: profile.id, type: entry.type, sourceId: profile.id };
        const key = relationshipKey(reverse);
        if (!links.has(key)) links.set(key, reverse);
      }
    }
    if (links.size || outgoing) return [...links.values()];
  }

  function updateRelationships(profiles, edited) {
    const previous = profiles.find(profile => profile.id === edited.id);
    const own = previous?.details?.relationships || [];
    const visible = relationshipsFor(profiles, edited.id) || [];
    const submitted = edited.details?.relationships || [];
    const requested = new Set(submitted.map(relationshipKey));
    if (requested.size !== submitted.length) throw Error('Esa relación ya está añadida.');

    const existing = new Set(visible.map(relationshipKey));
    const incomingOwners = new Set(visible.filter(entry => entry.sourceId === entry.targetId).map(entry => entry.sourceId));
    const additions = new Map();
    for (const entry of submitted) {
      if (existing.has(relationshipKey(entry))) continue;
      const ownerId = entry.sourceId === entry.targetId && incomingOwners.has(entry.sourceId) ? entry.sourceId : edited.id;
      const entries = additions.get(ownerId) || [];
      entries.push({ targetId: ownerId === edited.id ? entry.targetId : edited.id, type: entry.type });
      additions.set(ownerId, entries);
    }
    const outgoing = own.filter(entry => requested.has(relationshipKey(entry))).concat(additions.get(edited.id) || []);
    const saved = { ...edited, details: { ...edited.details } };
    if (outgoing.length || edited.details?.relationships?.length === 0) saved.details.relationships = outgoing;
    else delete saved.details.relationships;

    // Se guarda un solo vínculo nuevo por pareja y tipo. Desde cualquiera de las dos fichas se puede cambiar o quitar.
    const updated = profiles.map(profile => {
      if (profile === previous) return saved;
      const stored = profile.details?.relationships;
      if (!stored?.length) return profile;
      const kept = stored.filter(entry => entry.targetId !== edited.id || requested.has(relationshipKey({ targetId: profile.id, type: entry.type })));
      const added = additions.get(profile.id) || [];
      if (kept.length === stored.length && !added.length) return profile;
      const details = { ...profile.details };
      if (kept.length || added.length) details.relationships = kept.concat(added);
      else delete details.relationships;
      return { ...profile, details };
    });
    if (!previous) updated.push(saved);
    return updated;
  }

  function validate(value, projectIds, ownerId) {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Los campos adicionales del personaje no son válidos.');
    const details = {};
    for (const [key, raw] of Object.entries(value)) {
      const field = fields.get(key);
      if (!field) throw Error('Hay un campo de personaje desconocido.');
      if (field.kind === 'relationships') {
        details[key] = relationships(raw, projectIds, ownerId);
        continue;
      }
      const item = text(raw, field.limit, field.label);
      if (item && field.options && !field.customLabel && !field.options.includes(item)) throw Error('Elige una opción válida en «' + field.label + '».');
      details[key] = item;
    }
    return Object.keys(details).length ? details : undefined;
  }

  const api = { fields, relationshipTypes, maxRelationships, validate, relationshipsFor, updateRelationships };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterDetails = api;
})(globalThis);
