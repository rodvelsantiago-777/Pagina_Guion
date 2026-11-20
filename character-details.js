/* Catálogo y formato de los campos opcionales de la ficha. */
(function (root) {
  'use strict';
  const Kinship = typeof module === 'object' && module.exports ? require('./character-kinship.js') : root.PlanoCharacterKinship;

  const short = (id, label, placeholder) => ({ id, label, placeholder, kind: 'text', limit: 160 });
  const long = (id, label) => ({ id, label, kind: 'textarea', limit: 4000 });
  const choice = (id, label, options, customLabel) => ({ id, label, kind: 'select', options, customLabel, limit: 160 });
  const relationshipLimit = 120;
  const maxRelationships = 499;
  const relationshipTypes = Object.freeze([
    'Familia', 'Conocidos', 'Romance', 'Amistad', 'Trabajo o estudios', 'Mentoría', 'Rivalidad', 'Enemistad', 'Otro',
  ]);
  const feelingGroups = Object.freeze([
    { id: 'romantic', label: 'Románticos', color: '#C400B3', darkColor: '#FF26DF', types: ['Amor', 'Enamoramiento', 'Atracción', 'Deseo'] },
    { id: 'positive', label: 'Positivos', color: '#008D19', darkColor: '#49E500', types: ['Cariño', 'Afecto', 'Ternura', 'Admiración', 'Respeto', 'Gratitud', 'Confianza', 'Lealtad', 'Compasión', 'Esperanza'] },
    { id: 'negative', label: 'Negativos', color: '#D92B00', darkColor: '#FF5B00', types: ['Desconfianza', 'Celos', 'Envidia', 'Rencor', 'Rabia', 'Odio', 'Desprecio'] },
    { id: 'vulnerable', label: 'Tristeza y temor', color: '#005FFF', darkColor: '#00C3FF', types: ['Nostalgia', 'Tristeza', 'Decepción', 'Culpa', 'Vergüenza', 'Miedo'] },
    { id: 'neutral', label: 'Neutrales', color: '#374151', darkColor: '#E4E7EC', types: ['Indiferencia', 'Ambivalencia'] },
  ].map(group => Object.freeze({ ...group, types: Object.freeze(group.types) })));
  const feelingTypes = Object.freeze(feelingGroups.flatMap(group => group.types));
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
    choice('startStatus', 'Estado al inicio de la historia', ['Vivo', 'Muerto', 'Desaparecido', 'Desconocido'], 'Otro estado'),
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
    { id: 'feelings', label: 'Sentimientos', kind: 'feelings' },
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
      const result = { targetId: entry.targetId, type };
      if (entry.parentId !== undefined) {
        if (type !== 'Familia' || ![ownerId, entry.targetId].includes(entry.parentId)) throw Error('Revisa quién es progenitor en la relación familiar.');
        result.parentId = entry.parentId;
      }
      for (const flag of ['married', 'broken']) if (entry[flag] !== undefined) {
        if (!isCouple(type) || typeof entry[flag] !== 'boolean') throw Error('Revisa las opciones de matrimonio y ruptura de la relación de pareja.');
        result[flag] = entry[flag];
      }
      return result;
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
        if (entry.parentId) reverse.parentId = entry.parentId;
        for (const flag of ['married', 'broken']) if (entry[flag] !== undefined) reverse[flag] = entry[flag];
        const key = relationshipKey(reverse);
        if (!links.has(key)) links.set(key, reverse);
        else if (reverse.parentId) links.set(key, { ...links.get(key), parentId: reverse.parentId });
        if (links.has(key)) for (const flag of ['married', 'broken']) {
          if (links.get(key)[flag] === undefined && reverse[flag] !== undefined) links.get(key)[flag] = reverse[flag];
        }
      }
    }
    if (links.size || outgoing) return [...links.values()];
  }
  function validateFeelings(value, projectIds, ownerId) {
    if (!Array.isArray(value) || value.length > maxRelationships) throw Error('Revisa los sentimientos del personaje.');
    const seen = new Set();
    return value.map(entry => {
      if (!entry || entry.targetId === ownerId || !projectIds.has(entry.targetId)) throw Error('Cada sentimiento debe apuntar a otro personaje de este proyecto.');
      if (!feelingTypes.includes(entry.feeling)) throw Error('Elige un sentimiento de la lista.');
      if (seen.has(entry.targetId)) throw Error('Ya existe un sentimiento hacia ese personaje. Edita el existente.');
      seen.add(entry.targetId);
      return { targetId: entry.targetId, feeling: entry.feeling };
    });
  }
  function feelingsFor(profiles, id) {
    const result = [];
    for (const profile of profiles) for (const entry of profile.details?.feelings || []) {
      if (profile.id === id) result.push({ ...entry, direction: 'outgoing' });
      else if (entry.targetId === id) result.push({ targetId: profile.id, feeling: entry.feeling, direction: 'incoming' });
    }
    return result;
  }

  function updateRelationships(profiles, edited) {
    const previous = profiles.find(profile => profile.id === edited.id);
    const own = previous?.details?.relationships || [];
    const visible = relationshipsFor(profiles, edited.id) || [];
    const submitted = edited.details?.relationships || [];
    const requested = new Set(submitted.map(relationshipKey));
    const submittedByKey = new Map(submitted.map(entry => [relationshipKey(entry), entry]));
    const withMetadata = (entry, wanted) => {
      const { parentId, married, broken, ...rest } = entry;
      if (wanted?.type === 'Familia' && wanted.parentId) rest.parentId = wanted.parentId;
      if (isCouple(wanted?.type)) for (const flag of ['married', 'broken']) {
        if (wanted[flag] !== undefined) rest[flag] = wanted[flag];
      }
      return rest;
    };
    if (requested.size !== submitted.length) throw Error('Esa relación ya está añadida.');

    const existing = new Set(visible.map(relationshipKey));
    const incomingOwners = new Set(visible.filter(entry => entry.sourceId === entry.targetId).map(entry => entry.sourceId));
    const additions = new Map();
    for (const entry of submitted) {
      if (existing.has(relationshipKey(entry))) continue;
      const ownerId = entry.sourceId === entry.targetId && incomingOwners.has(entry.sourceId) ? entry.sourceId : edited.id;
      const entries = additions.get(ownerId) || [];
      entries.push(withMetadata({ targetId: ownerId === edited.id ? entry.targetId : edited.id, type: entry.type }, entry));
      additions.set(ownerId, entries);
    }
    const outgoing = own.filter(entry => requested.has(relationshipKey(entry)))
      .map(entry => withMetadata(entry, submittedByKey.get(relationshipKey(entry)))).concat(additions.get(edited.id) || []);
    const saved = { ...edited, details: { ...edited.details } };
    if (outgoing.length || edited.details?.relationships?.length === 0) saved.details.relationships = outgoing;
    else delete saved.details.relationships;

    // Se guarda un solo vínculo nuevo por pareja y tipo. Desde cualquiera de las dos fichas se puede cambiar o quitar.
    const updated = profiles.map(profile => {
      if (profile === previous) return saved;
      const stored = profile.details?.relationships;
      if (!stored?.length) return profile;
      const kept = stored.filter(entry => entry.targetId !== edited.id || requested.has(relationshipKey({ targetId: profile.id, type: entry.type })))
        .map(entry => entry.targetId === edited.id ? withMetadata(entry, submittedByKey.get(relationshipKey({ targetId: profile.id, type: entry.type }))) : entry);
      const added = additions.get(profile.id) || [];
      if (kept.length === stored.length && !added.length && kept.every((entry, index) =>
        ['parentId', 'married', 'broken'].every(flag => entry[flag] === stored[index][flag]))) return profile;
      const details = { ...profile.details };
      if (kept.length || added.length) details.relationships = kept.concat(added);
      else delete details.relationships;
      return { ...profile, details };
    });
    if (!previous) updated.push(saved);
    return updated;
  }

  function parentTitle(profile) {
    return profile?.gender === 'Mujer' ? 'Madre' : profile?.gender === 'Hombre' ? 'Padre' : 'Progenitor/a';
  }
  function childTitle(profile) {
    return profile?.gender === 'Mujer' ? 'Hija' : profile?.gender === 'Hombre' ? 'Hijo' : 'Hijo/a';
  }
  const normalizedStatus = value => String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function isCouple(type) {
    return ['romance', 'pareja', 'conyuge', 'esposo', 'esposa', 'matrimonio'].includes(normalizedStatus(type));
  }
  function isMarried(entry) {
    return entry.married ?? ['conyuge', 'esposo', 'esposa', 'matrimonio'].includes(normalizedStatus(entry.type));
  }
  function coupleCaption(entry) {
    if (entry.broken) return isMarried(entry) ? 'Excónyuges' : 'Expareja';
    if (isMarried(entry)) return 'Matrimonio';
    return entry.married !== undefined || entry.broken !== undefined ? 'Pareja' : entry.type;
  }
  function maritalExplanation(state) {
    if (state.value === 'Casado/a') return 'Matrimonio detectado en la relación de pareja. Se actualiza al cambiar sus opciones.';
    if (state.value === 'Divorciado/a') return 'La relación tiene marcados matrimonio y ruptura. Se actualiza al cambiar sus opciones.';
    return 'Viudez detectada por el fallecimiento de su pareja. Se actualiza al corregir ese estado o vínculo.';
  }
  function lifeState(profile) {
    const status = normalizedStatus(profile?.details?.startStatus);
    if (/^(?:vivo|viva)(?:\/[ao])?$/.test(status)) return 'alive';
    if (/^(?:muert[oa]|fallecid[oa]|difunt[oa])(?:\/[ao])?$/.test(status)) return 'dead';
    if (/^desaparecid[oa](?:\/[ao])?$/.test(status) || status === 'en paradero desconocido') return 'missing';
    return 'unknown';
  }
  function lifeStateLabel(profile) {
    const state = lifeState(profile), feminine = profile?.gender === 'Mujer', neutral = profile?.gender && profile.gender !== 'Hombre' && !feminine;
    const labels = { alive: ['Vivo', 'Viva', 'Vivo/a'], dead: ['Muerto', 'Muerta', 'Muerto/a'], missing: ['Desaparecido', 'Desaparecida', 'Desaparecido/a'] };
    return labels[state]?.[neutral ? 2 : feminine ? 1 : 0] || '';
  }
  function maritalState(profiles, id) {
    const profile = profiles.find(item => item.id === id), value = profile?.details?.maritalStatus || '';
    const widowLabel = profile?.gender === 'Mujer' ? 'Viuda' : profile?.gender === 'Hombre' ? 'Viudo' : 'Viudo/a';
    const manual = { value, label: normalizedStatus(value).startsWith('viud') ? widowLabel : value, automatic: false, partners: [] };
    if (!profile || lifeState(profile) === 'dead') return manual;
    const couples = (relationshipsFor(profiles, id) || []).filter(entry => isCouple(entry.type));
    const active = couples.filter(entry => !entry.broken), married = active.filter(isMarried);
    const partners = active.map(entry => profiles.find(item => item.id === entry.targetId)).filter(Boolean);
    const automatic = (status, masculine, feminine, partners) => ({ value: status,
      label: profile.gender === 'Mujer' ? feminine : profile.gender === 'Hombre' ? masculine : status, automatic: true, partners });
    const currentMarriage = married.filter(entry => lifeState(profiles.find(item => item.id === entry.targetId)) !== 'dead');
    if (currentMarriage.length) return automatic('Casado/a', 'Casado', 'Casada', currentMarriage.map(entry => entry.targetId));
    const legacySeparation = !married.length && /^(?:separad|divorciad)/.test(normalizedStatus(value));
    // Una relación posterior o una pareja desaparecida no se da por fallecida.
    if (!legacySeparation && partners.length && partners.every(partner => lifeState(partner) === 'dead'))
      return { value: 'Viudo/a', label: widowLabel, automatic: true, partners: partners.map(partner => partner.id) };
    const endedMarriages = couples.filter(entry => entry.broken && isMarried(entry));
    if (endedMarriages.length) return automatic('Divorciado/a', 'Divorciado', 'Divorciada', endedMarriages.map(entry => entry.targetId));
    return manual;
  }
  // Describe el papel del otro personaje en la ficha que se está consultando.
  function relationshipLabel(entry, profiles) {
    if (entry.inferred) return entry.label;
    if (isCouple(entry.type)) {
      const other = profiles.find(profile => profile.id === entry.targetId);
      if (isMarried(entry)) return other?.gender === 'Mujer' ? (entry.broken ? 'Exesposa' : 'Esposa')
        : other?.gender === 'Hombre' ? (entry.broken ? 'Exesposo' : 'Esposo') : (entry.broken ? 'Excónyuge' : 'Cónyuge');
      return entry.broken ? 'Expareja' : coupleCaption(entry);
    }
    if (!entry.parentId) return entry.type;
    const other = profiles.find(profile => profile.id === entry.targetId);
    return entry.parentId === entry.targetId ? parentTitle(other) : childTitle(other);
  }
  function displayRelationshipsFor(profiles, id) {
    const explicit = relationshipsFor(profiles, id) || [], inferred = Kinship.forCharacter(profiles, id);
    const result = [...explicit];
    for (const entry of inferred) {
      const existing = result.filter(link => link.targetId === entry.targetId);
      if (existing.some(link => link.parentId || link.type.toLocaleLowerCase('es') === entry.label.toLocaleLowerCase('es'))) continue;
      const generic = result.findIndex(link => link.targetId === entry.targetId && link.type === 'Familia');
      if (generic >= 0) result[generic] = entry;
      else result.push(entry);
    }
    const distances = new Map(inferred.map(entry => [entry.targetId, entry.distance]));
    const proximity = entry => entry.type === 'Familia' ? distances.get(entry.targetId) ?? Infinity : Infinity;
    return result.sort((a, b) => proximity(a) - proximity(b));
  }
  function validateFamily(profiles) {
    const children = new Map(profiles.map(profile => [profile.id, new Set()]));
    for (const profile of profiles) for (const entry of profile.details?.relationships || []) {
      if (!entry.parentId) continue;
      const child = entry.parentId === profile.id ? entry.targetId : profile.id;
      children.get(entry.parentId).add(child);
    }
    const visited = new Set(), visiting = new Set();
    function visit(id) {
      if (visiting.has(id)) throw Error('Ese parentesco formaría un ciclo: un personaje no puede ser antepasado de sí mismo.');
      if (visited.has(id)) return;
      visiting.add(id);
      for (const child of children.get(id)) visit(child);
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of children.keys()) visit(id);
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
      if (field.kind === 'feelings') { details[key] = validateFeelings(raw, projectIds, ownerId); continue; }
      const item = text(raw, field.limit, field.label);
      if (item && field.options && !field.customLabel && !field.options.includes(item)) throw Error('Elige una opción válida en «' + field.label + '».');
      details[key] = item;
    }
    return Object.keys(details).length ? details : undefined;
  }

  const api = { fields, relationshipTypes, maxRelationships, validate, relationshipsFor, updateRelationships,
    parentTitle, childTitle, relationshipLabel, validateFamily, displayRelationshipsFor,
    familyFor: Kinship.forCharacter, lifeState, lifeStateLabel, maritalState,
    isCouple, isMarried, coupleCaption, maritalExplanation, feelingTypes, feelingGroups, feelingsFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanoCharacterDetails = api;
})(globalThis);
