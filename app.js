"use strict";

const $ = selector => document.querySelector(selector);
const sceneTools = window.PlanoScenes;
const shotValues = window.PlanoShotValues;
shotValues.setupForms();
const colorPalette = window.PlanoColors.setup();
const MAX_SIZE = 100 * 1024 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";
const state = {
  pdf: null, loading: null, file: null, url: null, key: null, fingerprint: null, cloudProject: null, thumbnail: null, pages: [], scenes: [],
  annotations: [], corrections: [], crew: {}, proofreading: PlanoSpelling.validate(), crewEditing: false, activeCorrection: null, history: [], future: [], selectedShots: new Set(), scene: "all", segmentIndex: 0,
  tool: "select", zoom: 1, fit: true, renderId: 0, loadId: 0,
  viewer: null, panelOpen: null, viewAnchor: null, pending: null, editing: null, details: null, highlightCorrection: null, highlightAction: null, stage: "coverage", selectedLine: null, lineGesture: null,
  segments: [], drawing: null, rendered: false, renderWidth: 0, busy: false, screen: "import", titleMenu: null, exporting: false, pasteChoice: null, pasteHighlight: null
};

let copiedShot = null;
let annotationDrawFrame = 0;
let preparingLinkedText = false;
let feedbackTimer;
function message(text, error = false) {
  clearTimeout(feedbackTimer);
  $("#feedback").textContent = text;
  $("#feedback").hidden = !text;
  $("#feedback").classList.toggle("info", !error);
  if (text && !error) feedbackTimer = setTimeout(() => { $("#feedback").hidden = true; }, 4500);
}
function status(text, ready = false) {
  $("#workspace-status").replaceChildren(document.createElement("span"), document.createTextNode(text));
  $("#workspace-status").classList.toggle("ready", ready);
}
function busy(value) {
  state.busy = value;
  $("#upload-button").disabled = value;
  $("#replace-button").disabled = value;
  $(".script-workspace").setAttribute("aria-busy", String(value));
  $("#document-view").inert = value; $("#technical-view").inert = value;
  syncTechnicalWindowLock();
}

function showScreen(screen) {
  hideHighlightAction();
  const editing = screen === "editor" && Boolean(state.pdf);
  if (!editing && state.screen === "editor") state.viewAnchor = capturePosition();
  state.screen = editing ? "editor" : "import";
  document.body.classList.toggle("is-editing", editing);
  $("#upload-view").hidden = editing;
  updateStageView();
  $("#return-editor").hidden = !state.pdf;
  $("#nav-editor").disabled = !state.pdf;
  for (const [id, active] of [["#nav-import", !editing], ["#nav-editor", editing]]) {
    $(id).classList.toggle("active", active);
    if (active) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  $("#breadcrumb-current").textContent = editing ? "Guion técnico / cobertura" : "Mis guiones";
  $("#workspace-title").textContent = editing ? "Guion técnico / líneas de cobertura" : "Biblioteca de guiones";
  $("#page-title").textContent = editing ? "Cada escena, un nuevo plano." : "Tus guiones.";
  $("#page-eyebrow").textContent = editing ? "DEL GUION AL RODAJE" : "TU ESPACIO DE TRABAJO";
  $("#page-description").textContent = editing ? "Lee, resalta y diseña la cobertura de tu historia." : "Retoma una historia o empieza a preparar la siguiente.";
  $("#project-menu").open = false;
  if (editing) {
    setPanelOpen(state.panelOpen ?? !smallScreen.matches);
    if (state.stage === "coverage") renderDocument({ anchor: state.viewAnchor });
    else refreshTechnicalScript();
  } else { $("#panel-backdrop").hidden = true; PlanoCloudLibrary.showHome(); }
}
function updateStageView() {
  const editing = state.screen === "editor" && Boolean(state.pdf), technical = state.stage === "technical";
  $("#document-view").hidden = !editing || technical;
  $("#technical-view").hidden = !editing || !technical;
  for (const tab of document.querySelectorAll("#stage-tabs [data-stage]")) {
    const active = tab.dataset.stage === state.stage;
    tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
  }
  $("#toggle-annotations").hidden = technical;
  $(".view-mode-control").hidden = technical;
  if (technical || !editing) PlanoPopover.hide($("#view-mode-menu"));
  document.body.classList.toggle("is-technical", editing && technical);
  $("#panel-backdrop").hidden = !editing || technical || !state.panelOpen || !smallScreen.matches;
}
async function switchStage(stage) {
  if (state.pasteHighlight) return;
  if (!["coverage", "technical"].includes(stage) || !state.pdf || stage === state.stage) return;
  if (!PlanoTechnicalScript.finishEditing()) return;
  if (state.stage === "coverage") state.viewAnchor = capturePosition();
  hideHighlightAction(); cancelHighlightCorrection(); window.getSelection()?.removeAllRanges();
  state.stage = stage; updateStageView();
  if (stage === "technical") refreshTechnicalScript();
  else await renderDocument({ anchor: state.viewAnchor });
}
for (const button of document.querySelectorAll("#stage-tabs [data-stage]")) button.addEventListener("click", () => switchStage(button.dataset.stage));
$("#stage-tabs").addEventListener("keydown", async event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = Array.from($("#stage-tabs").querySelectorAll("button:not(:disabled)")), current = tabs.indexOf(document.activeElement);
  const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  await switchStage(tabs[index].dataset.stage);
  if (state.stage === tabs[index].dataset.stage) tabs[index].focus({ preventScroll: true });
});
$("#back-to-coverage").addEventListener("click", () => switchStage("coverage"));
$("#technical-undo").addEventListener("click", () => undo());
$("#technical-redo").addEventListener("click", () => undo(true));

const scriptLoads = new Map();
function loadScript(src) {
  if (scriptLoads.has(src)) return scriptLoads.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = src;
    script.onload = resolve;
    script.onerror = () => { script.remove(); scriptLoads.delete(src); reject(new Error("No se pudo cargar una biblioteca local. Comprueba la carpeta vendor.")); };
    document.head.append(script);
  });
  scriptLoads.set(src, promise); return promise;
}
let engineReady;
function prepareEngine() {
  if (!engineReady) engineReady = (async () => {
    await Promise.all([
      window.pdfjsLib ? null : loadScript("vendor/pdf.js"),
      window.planoPdfAssets ? null : loadScript("vendor/pdf-assets.js")
    ]);
    if (!window.pdfjsLib) throw new Error("No se encontró el motor PDF. Conserva la carpeta vendor junto a index.html.");
    if (!window.planoPdfAssets) throw new Error("No se encontraron los recursos del PDF. Conserva la carpeta vendor junto a index.html.");
    if (location.protocol === "file:") await loadScript("vendor/pdf.worker.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.mjs";
  })().catch(error => { engineReady = null; throw error; });
  return engineReady;
}
function decodeAsset(group, name) {
  const encoded = window.planoPdfAssets?.[group]?.[name];
  if (!encoded) throw new Error(`Recurso PDF no encontrado: ${name}`);
  return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
}
class LocalBinaryFactory {
  async fetch({ kind, filename }) {
    const group = { cMapUrl: "cmaps", standardFontDataUrl: "standard_fonts", wasmUrl: "wasm" }[kind];
    if (!group) throw new Error(`Tipo de recurso PDF desconocido: ${kind}`);
    return decodeAsset(group, filename);
  }
}

async function upload(file, options = {}) {
  await PlanoAccounts.ready;
  if (!PlanoAccounts.getUser()) { $("#file-input").value = ""; PlanoAccounts.open("signup"); return; }
  if (!file || state.busy || state.pending || state.editing || state.pasteHighlight) return;
  if (!PlanoTechnicalScript.finishEditing()) return;
  const id = ++state.loadId;
  let candidate = null;
  busy(true); message("");
  const previousStatus = state.pdf ? "Guion listo" : "Sin documento";
  try {
    await PlanoCloudLibrary.finishPreview();
    if (PlanoCloud.configured) await PlanoCloud.flush();
    if (!file.size) throw new Error("El archivo está vacío. Selecciona un PDF con contenido.");
    if (file.size > MAX_SIZE) throw new Error("El PDF supera el límite de 100 MB.");
    if (!(await file.slice(0, 1024).text()).includes("%PDF-")) throw new Error("Este archivo no parece ser un PDF válido.");
    await prepareEngine();
    if (id !== state.loadId) return;
    status("Leyendo PDF…");
    const data = new Uint8Array(await file.arrayBuffer());
    const hash = window.crypto?.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), byte => byte.toString(16).padStart(2, "0")).join("") : null;
    if (id !== state.loadId) return;
    candidate = pdfjsLib.getDocument({ data, isEvalSupported: false, useWasm: true, useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: LocalBinaryFactory });
    state.loading = candidate;
    const pdf = await new Promise((resolve, reject) => {
      candidate.onPassword = () => {
        const error = new Error("PDF protegido con contraseña");
        error.name = "PasswordException";
        reject(error);
      };
      candidate.promise.then(resolve, reject);
    });
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      if (id !== state.loadId) { await candidate.destroy(); return; }
      status(`Detectando escenas… ${number}/${pdf.numPages}`);
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height, lines: sceneTools.linesFromItems(text.items, viewport, pdfjsLib.Util.transform) });
      if (number % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (id !== state.loadId) { await candidate.destroy(); return; }
    let cloudProject = options.project || null;
    let incomingPayload = null, incomingNotes = null, incomingCorrections = null, incomingCrew = null, incomingProofreading = null;
    if (PlanoCloud.configured) {
      if (!cloudProject) cloudProject = await PlanoCloud.importFile(file);
      if (cloudProject.fingerprint !== hash) throw new Error("La huella del PDF no coincide con el proyecto. Vuelve a descargarlo.");
      incomingPayload = PlanoCloud.preview(cloudProject);
      incomingNotes = validateNotes(incomingPayload.annotations, pdf.numPages);
      incomingCorrections = PlanoCorrections.validate(incomingPayload.corrections, pdf.numPages);
      incomingCrew = PlanoCrew.validate(incomingPayload.crew);
      incomingProofreading = PlanoSpelling.validate(incomingPayload.proofreading);
      await PlanoCloud.flush();
      if (id !== state.loadId) { await candidate.destroy(); return; }
    }
    cancelRendering();
    clearShotSelection();
    PlanoTechnicalScript.clear(); $("#technical-table-body").replaceChildren(); PlanoTechnicalWindow.invalidate();
    crewEditor.close();
    cancelSpelling();
    const previousPdf = state.pdf;
    if (state.url) URL.revokeObjectURL(state.url);
    state.pdf = pdf; state.loading = null; state.file = cloudProject ? new File([file], cloudProject.name, { type: 'application/pdf' }) : file;
    state.cloudProject = cloudProject;
    state.url = URL.createObjectURL(file); state.pages = pages;
    state.scenes = sceneTools.detectScenes(pages);
    state.fingerprint = hash || pdf.fingerprints[0];
    state.key = PlanoAccounts.notesKey(state.fingerprint);
    const cloudPayload = cloudProject ? PlanoCloud.attach(cloudProject) : null;
    state.thumbnail = PlanoScriptPreview.valid(cloudPayload?.thumbnail) ? cloudPayload.thumbnail : null;
    state.annotations = cloudPayload && !cloudProject.created ? incomingNotes : readSavedNotes();
    state.corrections = cloudPayload && !cloudProject.created ? incomingCorrections : readSavedCorrections();
    state.crew = cloudPayload && !cloudProject.created ? incomingCrew : readSavedCrew();
    state.proofreading = cloudPayload && !cloudProject.created ? incomingProofreading : readSavedProofreading(); refreshSpelling();
    state.history = []; state.future = []; state.scene = "all"; state.stage = "coverage";
    state.segmentIndex = 0; state.fit = true; state.zoom = 1; state.drawing = null; state.viewAnchor = null;
    if (cloudPayload?.view && !cloudProject.created) {
      if (["all", "editing", "print", ...state.scenes.map(scene => scene.id)].includes(cloudPayload.view.scene)) state.scene = cloudPayload.view.scene;
      if (["coverage", "technical"].includes(cloudPayload.view.stage)) state.stage = cloudPayload.view.stage;
    }
    $("#file-name").textContent = state.file.name; $("#file-name").title = state.file.name;
    $("#file-size").textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "página" : "páginas"} · ${(file.size / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} KB · ${cloudProject ? "PDF en tu cuenta" : "Archivo local"}`;
    $("#open-document").href = state.url;
    updateSceneOptions(); refreshSegments(); setTool("select"); refreshAnnotations();
    status(`${state.scenes.length} ${state.scenes.length === 1 ? "escena" : "escenas"} · Guion listo`, true);
    if (previousPdf) previousPdf.destroy().catch(() => {});
    showScreen("editor");
    if (!state.thumbnail) createDocumentPreview(pdf);
    if (cloudProject?.created && state.annotations.length) saveNotes();
    else if (cloudProject) PlanoCloudLibrary.refreshStatus();
    message("");
    setTimeout(() => { if (state.pdf === pdf) startSpelling(); }, 0);
    return true;
  } catch (error) {
    if (id !== state.loadId) return;
    if (candidate) candidate.destroy().catch(() => {});
    state.loading = null; status(previousStatus, Boolean(state.pdf));
    const text = error.name === "PasswordException" || /password|destroyed/i.test(error.message) ? "El PDF está protegido con contraseña. Abre una copia sin contraseña para trabajar la cobertura." : error.name === "InvalidPDFException" ? "El archivo está dañado o no es un PDF válido." : `No se pudo abrir el PDF. ${error.message || "Prueba con otro archivo."}`;
    message(text, true);
    return false;
  } finally {
    if (id === state.loadId) { busy(false); $("#file-input").value = ""; }
  }
}

async function createDocumentPreview(pdf) {
  try {
    const thumbnail = await PlanoScriptPreview.create(pdf);
    if (state.pdf !== pdf || !thumbnail) return;
    state.thumbnail = thumbnail;
    const project = currentLibraryProject();
    PlanoCloudLibrary.updatePreview(project, thumbnail);
    if (PlanoCloud.configured) saveNotes();
  } catch { /* Un PDF legible sigue disponible aunque falle su miniatura. */ }
}
function currentLibraryProject() {
  if (!state.file) return null;
  return { ...state.cloudProject, id: state.cloudProject?.id || "local", name: state.file.name, fingerprint: state.fingerprint, size_bytes: state.file.size, state: "ready", thumbnail: state.thumbnail };
}
function renameDocumentFile(name) {
  state.file = new File([state.file], name, { type: "application/pdf" });
  $("#file-name").textContent = name; $("#file-name").title = name;
  PlanoTechnicalWindow.publish();
}
async function buildLibraryPreview(project) {
  const owner = PlanoCloud.info().owner;
  await prepareEngine();
  const loaded = await PlanoCloud.open(project.id);
  const loading = pdfjsLib.getDocument({ data: new Uint8Array(await loaded.file.arrayBuffer()), isEvalSupported: false, useWasm: true, useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: LocalBinaryFactory });
  try {
    const pdf = await loading.promise, thumbnail = await PlanoScriptPreview.create(pdf);
    if (!thumbnail || owner !== PlanoCloud.info().owner) return null;
    let updated = loaded.project;
    // Mantener las anotaciones completas y la revisión; jamás sobrescribir un borrador.
    if (state.cloudProject?.id === project.id) {
      state.thumbnail = thumbnail; saveNotes(); await PlanoCloud.flush(); updated = PlanoCloud.info().project;
    } else {
      const payload = { ...loaded.project.payload, thumbnail };
      if (new TextEncoder().encode(JSON.stringify(payload)).length <= 350000) {
        try { updated = (await PlanoCloud.request("save", { id: project.id, revision: loaded.project.revision, payload })).project; }
        catch (error) { if (error.code !== "CONFLICT") throw error; }
      }
    }
    return { thumbnail, project: updated };
  } finally { await loading.destroy(); }
}

function updateSceneOptions() {
  const select = $("#scene-select");
  select.replaceChildren(new Option("Guion completo", "all"), new Option("Vista de edición", "editing"), new Option("Vista de impresión", "print"));
  if (state.scenes.length) {
    const group = document.createElement("optgroup"); group.label = "Escena por escena";
    for (const scene of state.scenes) group.append(new Option(`${String(scene.number).padStart(2, "0")} · ${scene.title}`, scene.id));
    select.append(group);
  }
  select.value = state.scene;
  $("#scene-summary").textContent = `${state.scenes.length} ${state.scenes.length === 1 ? "escena" : "escenas"}`;
  buildViewMenu();
}
function buildViewMenu() {
  const menu = $("#view-mode-menu"); menu.replaceChildren();
  for (const group of [null, ...$("#scene-select").querySelectorAll("optgroup")]) {
    const section = document.createElement("div"); section.className = "view-menu-group"; section.setAttribute("role", "group");
    const heading = document.createElement("p"); heading.className = "view-menu-caption"; heading.textContent = group?.label || "Vistas del guion";
    section.setAttribute("aria-label", heading.textContent); section.append(heading);
    const options = group ? group.children : $("#scene-select").querySelectorAll(":scope > option");
    for (const option of options) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.view = option.value;
      button.setAttribute("role", "menuitemradio");
      const check = document.createElement("span"); check.className = "view-menu-check"; check.textContent = "✓"; check.setAttribute("aria-hidden", "true");
      const text = document.createElement("span"); text.textContent = option.textContent; button.append(check, text);
      button.addEventListener("click", () => { PlanoPopover.hide(menu, true); $("#scene-select").value = option.value; $("#scene-select").dispatchEvent(new Event("change", { bubbles: true })); });
      section.append(button);
    }
    menu.append(section);
  }
  syncViewMenu();
}
function syncViewMenu() {
  const name = $("#scene-select").selectedOptions[0]?.textContent || "Guion completo";
  $("#view-mode-button").title = `Vista del guion: ${name}`;
  $("#view-mode-button").setAttribute("aria-label", `Vista del guion: ${name}`);
  for (const button of $("#view-mode-menu").querySelectorAll("[data-view]")) {
    const active = button.dataset.view === state.scene; button.setAttribute("aria-checked", String(active)); button.tabIndex = active ? 0 : -1;
  }
}
function openViewMenu(last = false) {
  const menu = $("#view-mode-menu"); syncViewMenu(); PlanoPopover.show(menu, $("#view-mode-button"));
  if (menu.matches(":popover-open")) {
    const target = last ? Array.from(menu.querySelectorAll("[data-view]")).at(-1) : menu.querySelector('[aria-checked="true"]') || menu.querySelector("button");
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
  }
}
$("#view-mode-button").addEventListener("click", () => openViewMenu());
$("#view-mode-button").addEventListener("keydown", event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openViewMenu(event.key === "ArrowUp"); } });
$("#view-mode-menu").addEventListener("keydown", event => {
  const buttons = Array.from($("#view-mode-menu").querySelectorAll("button")), current = buttons.indexOf(document.activeElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault(); const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus({ preventScroll: true }); buttons[index]?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Tab") {
    event.preventDefault(); PlanoPopover.hide($("#view-mode-menu"));
    (event.shiftKey ? $("#open-appearance") : $("#project-menu summary")).focus({ preventScroll: true });
  }
});
function refreshSegments() {
  state.segments = sceneTools.workingSegments(state.scenes, state.pages, state.scene, [...state.annotations, ...PlanoCorrections.annotations(state.corrections)]);
  state.segmentIndex = Math.max(0, Math.min(state.segmentIndex, state.segments.length - 1));
}
function cancelRendering() {
  cancelAnimationFrame(annotationDrawFrame); annotationDrawFrame = 0;
  cancelDrawing(false); cancelLineGesture(false);
  ++state.renderId;
  const viewer = state.viewer;
  if (viewer) {
    viewer.cancelled = true;
    viewer.observer?.disconnect();
    for (const context of viewer.contexts.values()) {
      context.renderTask?.cancel(); context.textLayer?.cancel();
      const canvas = context.content?.querySelector("canvas");
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      context.resolve?.(false);
    }
  }
  state.viewer = null; state.rendered = false; state.drawing = null;
}

function capturePosition() {
  if (!state.viewer) return null;
  const stageTop = $("#pdf-stage").getBoundingClientRect().top;
  const contexts = Array.from(state.viewer.contexts.values());
  const context = contexts.find(item => item.crop.getBoundingClientRect().bottom > stageTop + 3) || contexts.at(-1);
  if (!context) return null;
  const offset = stageTop - context.crop.getBoundingClientRect().top;
  return { page: context.segment.page, y: Math.max(context.segment.top, Math.min(context.segment.bottom, context.segment.top + offset / context.viewport.height)) };
}

function scrollToPosition(anchor) {
  const context = contextAt(anchor);
  if (!context) return;
  const stage = $("#pdf-stage");
  const target = (anchor.y - context.segment.top) * context.viewport.height;
  stage.scrollTop += context.crop.getBoundingClientRect().top - stage.getBoundingClientRect().top + target;
}
function contextAt(anchor) {
  if (!anchor) return null;
  const contexts = Array.from(state.viewer?.contexts.values() || []);
  return contexts.find(context => context.segment.page === anchor.page && anchor.y >= context.segment.top && (anchor.y < context.segment.bottom || anchor.y === 1 && context.segment.bottom === 1)) || null;
}

async function renderDocument({ preservePosition = false, anchor = null } = {}) {
  if (!state.pdf || state.screen !== "editor" || state.stage !== "coverage") return;
  hideHighlightAction();
  syncViewMenu(); PlanoPopover.hide($("#view-mode-menu"));
  if (preservePosition) anchor = capturePosition();
  cancelRendering();
  const stage = $("#pdf-stage");
  state.renderWidth = stage.clientWidth;
  const viewer = { id: state.renderId, pdf: state.pdf, contexts: new Map(), queue: [], active: 0, nearby: new Set(), cancelled: false, observer: null };
  state.viewer = viewer;
  $("#render-status").hidden = false;
  $("#render-status").textContent = "Preparando guion…";
  const fragment = document.createDocumentFragment();
  const blocks = new Map();
  const divided = state.scene !== "print" && state.scenes.length > 0;
  if (["all", "editing"].includes(state.scene)) {
    const cover = sceneTools.coverLines(state.pages, state.scenes);
    if (cover.length) {
      const card = document.createElement("section"); card.className = "script-cover-card"; card.setAttribute("aria-label", "Información de la portada");
      const page = state.pages[(state.segments[0]?.page || 1) - 1];
      const scale = state.fit ? Math.min(1.6, Math.max(0.2, (stage.clientWidth - 48) / page.width)) : state.zoom;
      const width = page.width * scale;
      card.style.width = `${width}px`;
      card.style.setProperty("--cover-font-size", `${Math.max(16, 12 * scale)}px`);
      card.style.setProperty("--cover-inset", `${Math.max(24, width * 0.11)}px`);
      const caption = document.createElement("span"); caption.className = "cover-card-caption"; caption.textContent = "PORTADA DEL GUION";
      const title = document.createElement("h2"); title.textContent = cover[0];
      const info = document.createElement("div"); info.className = "cover-card-info";
      for (const text of cover.slice(1)) { const line = document.createElement("p"); line.textContent = text; info.append(line); }
      card.append(caption, title, info); fragment.append(card);
    }
  }
  $("#pdf-container").classList.toggle("has-scene-blocks", divided);
  for (const [index, segment] of state.segments.entries()) {
    const base = state.pages[segment.page - 1];
    const fitScale = Math.max(0.2, (stage.clientWidth - 48) / base.width);
    const scale = state.fit ? Math.min(1.6, fitScale) : state.zoom;
    const viewport = { width: base.width * scale, height: base.height * scale, scale };
    const slot = document.createElement("section"); slot.className = "page-slot";
    slot.dataset.page = segment.page; slot.dataset.segment = segment.id; slot.dataset.scene = segment.sceneId || ""; slot.dataset.ready = "false";
    slot.setAttribute("aria-label", `Página ${segment.page}`); slot.setAttribute("aria-busy", "true");
    slot.style.width = `${viewport.width}px`;
    const label = document.createElement("div"); label.className = "sheet-label"; label.textContent = `PÁGINA ${segment.page}`;
    const crop = document.createElement("div"); crop.className = "page-window";
    crop.style.width = `${viewport.width}px`; crop.style.height = `${(segment.bottom - segment.top) * viewport.height}px`; crop.style.margin = state.scene === "print" ? "16px 0 0" : "0";
    const labelLayer = document.createElement("div"); labelLayer.className = "page-shot-labels"; labelLayer.setAttribute("aria-label", `Nombres de plano de la página ${segment.page}`);
    if (state.scene === "print") slot.append(label, crop, labelLayer);
    else {
      slot.classList.add("is-scene-content");
      const paper = document.createElement("div"); paper.className = "scene-paper"; paper.append(crop); slot.append(paper, labelLayer);
    }
    if (divided) {
      if (!blocks.has(segment.sceneId)) {
        const block = document.createElement("section"); block.className = "script-scene-block"; block.dataset.scene = segment.sceneId;
        const heading = document.createElement("h2"); heading.className = "document-scene-heading";
        const scene = state.scenes.find(scene => scene.id === segment.sceneId);
        heading.textContent = scene ? `ESCENA ${String(scene.number).padStart(2, "0")}` : "PORTADA Y CONTENIDO PREVIO";
        if (scene) heading.title = scene.title;
        block.append(heading); blocks.set(segment.sceneId, block); fragment.append(block);
      }
      blocks.get(segment.sceneId).append(slot);
    } else fragment.append(slot);
    viewer.contexts.set(segment.id, { viewer, index, segment, viewport, slot, crop, labelLayer, labelTextBoxes: [], inkBlocked: null, status: "idle", promise: null, resolve: null, content: null, svg: null, renderTask: null, textLayer: null });
  }
  $("#pdf-container").replaceChildren(fragment);
  stage.scrollTop = 0; stage.scrollLeft = 0;
  if (anchor) scrollToPosition(anchor);
  const first = contextAt(anchor) || viewer.contexts.values().next().value;
  if (!first) {
    const empty = document.createElement("div"); empty.className = "no-scenes-view";
    const title = document.createElement("h2"); title.textContent = "No se detectaron escenas";
    const text = document.createElement("p"); text.textContent = "Puedes ver el documento completo en la vista de impresión.";
    const button = document.createElement("button"); button.type = "button"; button.className = "button button-secondary"; button.textContent = "Ver vista de impresión";
    button.addEventListener("click", () => { $("#scene-select").value = "print"; $("#scene-select").dispatchEvent(new Event("change")); });
    empty.append(title, text, button); $("#pdf-container").append(empty); $("#render-status").hidden = true;
    state.rendered = true; $("#page-label").textContent = `— / ${state.pdf.numPages}`;
    $("#page-label").setAttribute("aria-label", `Documento de ${state.pdf.numPages} páginas sin escenas detectadas.`); return;
  }
  state.zoom = first.viewport.scale;
  $("#zoom-label").textContent = `${Math.round(state.zoom * 100)}%`;
  $("#zoom-out").disabled = state.zoom <= 0.25; $("#zoom-in").disabled = state.zoom >= 3;
  viewer.observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const context = viewer.contexts.get(entry.target.dataset.segment);
      if (entry.isIntersecting) { viewer.nearby.add(context); ensurePage(context); }
      else {
        viewer.nearby.delete(context);
        if (context.status === "queued") {
          viewer.queue = viewer.queue.filter(item => item !== context);
          context.status = "idle"; context.resolve?.(false);
          context.resolve = null; context.promise = null;
        }
      }
    }
    releaseDistantPages(viewer);
  }, { root: stage, rootMargin: "700px 0px" });
  for (const context of viewer.contexts.values()) viewer.observer.observe(context.slot);
  await ensurePage(first);
  if (viewer.cancelled) return;
  state.rendered = true;
  $("#render-status").hidden = true;
  updatePageIndicator(); updateSelectionButton();
}

function ensurePage(context) {
  if (!context || context.viewer.cancelled) return Promise.resolve(false);
  if (context.status === "ready") return Promise.resolve(true);
  if (context.promise) return context.promise;
  context.status = "queued";
  context.promise = new Promise(resolve => { context.resolve = resolve; });
  context.viewer.queue.push(context);
  pumpPages(context.viewer);
  return context.promise;
}

function pumpPages(viewer) {
  while (!viewer.cancelled && viewer.active < 2 && viewer.queue.length) {
    const context = viewer.queue.shift(); viewer.active++;
    renderContext(context).finally(() => { viewer.active--; pumpPages(viewer); releaseDistantPages(viewer); });
  }
}

async function renderContext(context) {
  const { viewer, segment, crop } = context;
  context.status = "loading";
  try {
    const page = await viewer.pdf.getPage(segment.page);
    if (viewer.cancelled) return;
    const viewport = page.getViewport({ scale: context.viewport.scale });
    context.viewport = viewport;
    const content = document.createElement("div"); content.className = "pdf-page-content";
    content.style.width = `${viewport.width}px`; content.style.height = `${viewport.height}px`; content.style.top = `${-segment.top * viewport.height}px`;
    content.style.setProperty("--scale-factor", viewport.scale); content.style.setProperty("--total-scale-factor", viewport.scale); content.style.setProperty("--user-unit", 1);
    const canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    const textLayer = document.createElement("div"); textLayer.className = "textLayer"; textLayer.setAttribute("aria-label", `Texto de la página ${segment.page}`);
    const svg = document.createElementNS(SVG_NS, "svg"); svg.classList.add("annotation-overlay");
    svg.setAttribute("viewBox", "0 0 1000 1000"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-label", "Capa de líneas, resaltados y correcciones");
    content.append(canvas, textLayer, svg); crop.replaceChildren(content);
    context.content = content; context.svg = svg;
    const task = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
    context.renderTask = task; await task.promise;
    if (viewer.cancelled) return;
    const furniture = state.scene === "print" ? [] : state.pages[segment.page - 1].lines.filter(sceneTools.pageFurniture(state.pages));
    if (furniture.length) {
      const ink = canvas.getContext("2d"); ink.save(); ink.setTransform(ratio, 0, 0, ratio, 0, 0); ink.fillStyle = "#ffffff";
      for (const line of furniture) ink.fillRect(0, (line.y - line.height * 0.25) * viewport.height, viewport.width, line.height * 1.75 * viewport.height);
      ink.restore();
    }
    const text = await page.getTextContent();
    if (viewer.cancelled) return;
    context.textLayer = new pdfjsLib.TextLayer({ textContentSource: text, container: textLayer, viewport });
    await context.textLayer.render();
    if (viewer.cancelled) return;
    // El mismo PDF puede aparecer en varios recortes: solo su texto visible participa en la selección.
    const contentBounds = content.getBoundingClientRect();
    for (const span of Array.from(textLayer.querySelectorAll("span"))) {
      const rect = span.getBoundingClientRect();
      const top = (rect.top - contentBounds.top) / viewport.height, bottom = (rect.bottom - contentBounds.top) / viewport.height;
      if (bottom <= segment.top || top >= segment.bottom || furniture.some(line => top < line.y + line.height * 1.5 && bottom > line.y - line.height * 0.25)) span.remove();
    }
    PlanoDocumentLabels.prepare(context);
    context.status = "ready"; context.slot.dataset.ready = "true"; context.slot.setAttribute("aria-busy", "false");
    drawAnnotations(context); bindDrawing(context);
    let highlightDown = null;
    textLayer.addEventListener("pointerdown", event => { highlightDown = event.button === 0 ? { x: event.clientX, y: event.clientY } : null; });
    textLayer.addEventListener("pointerup", event => {
      const point = { x: event.clientX, y: event.clientY }, down = highlightDown; highlightDown = null;
      setTimeout(() => {
        if (["highlight", "correction"].includes(state.tool) && state.pasteHighlight?.kind !== "script-link") highlightSelection();
        else if (state.tool === "select" && !state.highlightCorrection && down && Math.hypot(point.x - down.x, point.y - down.y) < 5 && window.getSelection()?.isCollapsed) {
          const bounds = content.getBoundingClientRect(), x = (point.x - bounds.left) / viewport.width, y = (point.y - bounds.top) / viewport.height;
          const item = [...state.annotations].reverse().find(note => note.type === "highlight" && note.page === segment.page && note.rects.some(rect => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height));
          if (item) showHighlightAction(item, point);
        }
      }, 0);
    });
  } catch (error) {
    if (viewer.cancelled || error.name === "RenderingCancelledException" || error.name === "AbortException") return;
    context.status = "error";
    const warning = document.createElement("p"); warning.className = "page-error";
    warning.textContent = `No se pudo mostrar la página ${segment.page}. Abre el PDF original desde el menú del proyecto.`;
    crop.replaceChildren(warning); context.slot.setAttribute("aria-busy", "false");
  } finally {
    context.resolve?.(context.status === "ready"); context.resolve = null;
  }
}

function releaseDistantPages(viewer) {
  if (viewer.cancelled) return;
  const ready = Array.from(viewer.contexts.values()).filter(context => context.status === "ready");
  if (ready.length <= 8) return;
  const stageTop = $("#pdf-stage").getBoundingClientRect().top;
  const selection = window.getSelection();
  const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
  const candidates = ready.filter(context => !viewer.nearby.has(context) && !context.draggingTitle && state.drawing?.context !== context && state.lineGesture?.context !== context && !range?.intersectsNode(context.content)).sort((a, b) => Math.abs(b.slot.getBoundingClientRect().top - stageTop) - Math.abs(a.slot.getBoundingClientRect().top - stageTop));
  for (const context of candidates.slice(0, ready.length - 8)) {
    context.textLayer?.cancel();
    const canvas = context.content?.querySelector("canvas");
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    context.crop.replaceChildren();
    context.labelLayer.replaceChildren();
    if (context.overflowTitles) { context.overflowTitles.style.minHeight = `${context.overflowTitles.offsetHeight}px`; context.overflowTitles.replaceChildren(); }
    Object.assign(context, { content: null, svg: null, textLayer: null, renderTask: null, labelTextBoxes: [], inkBlocked: null, promise: null, status: "idle" });
    context.slot.dataset.ready = "false"; context.slot.setAttribute("aria-busy", "true");
  }
}

function updatePageIndicator() {
  if (!state.viewer) return;
  const stage = $("#pdf-stage").getBoundingClientRect();
  let context = null; let largestArea = 0;
  for (const candidate of state.viewer.contexts.values()) {
    const bounds = candidate.crop.getBoundingClientRect();
    const visible = Math.max(0, Math.min(bounds.bottom, stage.bottom) - Math.max(bounds.top, stage.top));
    if (visible > largestArea) { largestArea = visible; context = candidate; }
  }
  if (!context) return;
  state.segmentIndex = context.index;
  $("#page-label").textContent = `${context.segment.page} / ${state.pdf.numPages}`;
  $("#page-label").setAttribute("aria-label", `Página ${context.segment.page} de ${state.pdf.numPages}. Lectura continua.`);
}

function setTool(tool) {
  if (state.pasteHighlight) return;
  hideHighlightAction();
  if (state.highlightCorrection) cancelHighlightCorrection();
  cancelDrawing(false); cancelLineGesture(false); state.selectedLine = null;
  state.tool = tool; state.drawing = null;
  $("#correction-tool-bar").hidden = tool !== "correction";
  $(".color-picker").hidden = tool === "correction";
  for (const button of document.querySelectorAll("button[data-tool]")) {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  }
  $("#pdf-stage").dataset.tool = tool;
  drawAnnotations(); updateSelectionButton();
}
function selectionInPage() {
  const selection = window.getSelection();
  if (!state.viewer || !selection || selection.isCollapsed || !selection.rangeCount) return null;
  const contexts = Array.from(state.viewer.contexts.values()).filter(context => context.status === "ready");
  const inText = node => contexts.some(context => context.content?.querySelector(".textLayer")?.contains(node));
  return inText(selection.anchorNode) && inText(selection.focusNode) ? selection : null;
}
function updateSelectionButton() {
  const selected = Boolean(selectionInPage());
  $("#apply-highlight").hidden = !selected || Boolean(state.highlightCorrection || state.pasteHighlight);
  $("#apply-highlight").textContent = state.tool === "correction" ? "Marcar corrección" : "Resaltar selección";
  $("#apply-pasted-highlight").disabled = !selected;
  $("#apply-highlight-correction").disabled = !selected;
}
function highlightSelection() {
  if (!state.pdf || state.pending || state.editing || state.lineGesture || state.busy || state.exporting) return;
  const selection = selectionInPage();
  if (!selection) return;
  const original = selection.getRangeAt(0);
  const notes = [];
  for (const context of state.viewer.contexts.values()) {
    const layer = context.content?.querySelector(".textLayer");
    if (!layer || context.status !== "ready" || !original.intersectsNode(layer)) continue;
    const range = document.createRange(); range.selectNodeContents(layer);
    if (original.compareBoundaryPoints(Range.START_TO_START, range) > 0) range.setStart(original.startContainer, original.startOffset);
    if (original.compareBoundaryPoints(Range.END_TO_END, range) < 0) range.setEnd(original.endContainer, original.endOffset);
    const text = range.toString().trim(); if (!text) continue;
    const bounds = context.content.getBoundingClientRect(); const { segment } = context;
    const rects = Array.from(range.getClientRects()).map(rect => {
      const x = Math.max(0, (rect.left - bounds.left) / bounds.width);
      const y = Math.max(segment.top, (rect.top - bounds.top) / bounds.height);
      const right = Math.min(1, (rect.right - bounds.left) / bounds.width);
      const bottom = Math.min(segment.bottom, (rect.bottom - bounds.top) / bounds.height);
      return { x, y, width: right - x, height: bottom - y };
    }).filter(rect => rect.width > 0.0001 && rect.height > 0.0001);
    if (!rects.length) continue;
    const unique = rects.filter((rect, index) => !rects.slice(0, index).some(other => Math.abs(other.x - rect.x) < 0.001 && Math.abs(other.y - rect.y) < 0.001 && Math.abs(other.width - rect.width) < 0.001 && Math.abs(other.height - rect.height) < 0.001));
    notes.push({ type: "highlight", page: segment.page, text, rects: unique, color: $("#annotation-color").value });
  }
  if (!notes.length) return;
  selection.removeAllRanges(); updateSelectionButton();
  if (state.pasteHighlight) {
    const pending = state.pasteHighlight; finishPastedHighlight();
    if (pending.kind === "script-link") { restoreLinkedEditor(pending, notes); return; }
    try { if (state.pdf === pending.pdf) { commitPastedNotes(notes, pending.copy); message("Plano pegado en el texto seleccionado."); } }
    catch (error) { message(`No se pudo pegar el plano. ${error.message}`, true); }
  }
  else if (state.tool === "correction") {
    try {
      if (state.corrections.length >= 1000) throw new Error("El documento ya tiene 1000 correcciones.");
      const correction = PlanoCorrections.create(notes, state.pdf.numPages);
      remember(); state.corrections.push(correction); $("#script-corrections").open = true;
      changed(); message("Corrección marcada en el texto.");
    } catch (error) { message(`No se pudo marcar la corrección. ${error.message}`, true); }
  }
  else if (state.highlightCorrection) replaceHighlight(notes);
  else requestNamedAnnotations(notes);
}
function cancelHighlightCorrection() {
  state.highlightCorrection = null; $("#highlight-correction-bar").hidden = true; updateSelectionButton();
}
function replaceHighlight(notes) {
  const previous = state.highlightCorrection;
  const originals = state.annotations.filter(item => (item.shotId || item.id) === previous?.shotId);
  if (!previous || !originals.length) { cancelHighlightCorrection(); return; }
  remember();
  const index = state.annotations.findIndex(item => item.id === originals[0].id);
  const replacements = notes.map((part, i) => {
    const item = createAnnotation({ ...originals[0], ...part, color: originals[0].color });
    item.id = originals[i]?.id || item.id; item.createdAt = originals[0].createdAt; delete item.labelPosition; delete item.labelPinned;
    const previous = originals.find(old => old.page === part.page);
    if (previous?.labelPinned) { item.labelPinned = true; if (previous.labelPosition) item.labelPosition = { ...previous.labelPosition }; }
    return item;
  });
  state.annotations = state.annotations.filter(item => !originals.some(old => old.id === item.id));
  state.annotations.splice(index, 0, ...replacements);
  cancelHighlightCorrection(); changed(); message("Resalte corregido. Se han conservado el nombre y la ficha del plano.");
}
function hideHighlightAction() {
  hideCorrectionAction();
  hideTitlePositionMenu();
  state.highlightAction = null;
  const action = $("#highlight-action");
  if (action.matches(":popover-open")) action.hidePopover();
}
function hideCorrectionAction() {
  state.activeCorrection = null;
  const action = $("#correction-action"); if (action.matches(":popover-open")) PlanoPopover.hide(action);
}
function showCorrectionAction(id, point) {
  if (!canSelectShots() || !state.corrections.some(item => item.id === id)) return;
  hideHighlightAction(); state.activeCorrection = id;
  const item = state.corrections.find(item => item.id === id);
  $("#correction-word").hidden = !PlanoCorrections.automatic(item);
  $("#correction-word").textContent = PlanoCorrections.automatic(item) ? `«${item.word}» · ${item.message || "Posible error ortográfico."}` : "";
  $("#delete-correction").textContent = item.source === "syntax" ? "Ignorar esta incidencia" : item.source === "spelling" ? "Ignorar esta palabra" : "Quitar corrección";
  PlanoPopover.show($("#correction-action"), point); $("#delete-correction").focus({ preventScroll: true });
}
function removeCorrection(id) {
  if (!canSelectShots() || !state.corrections.some(item => item.id === id)) return;
  const correction = state.corrections.find(item => item.id === id);
  hideCorrectionAction(); remember();
  if (PlanoCorrections.automatic(correction)) {
    const key = PlanoCorrections.ignoreKey(correction);
    if (state.proofreading.ignored.length < 500 && !state.proofreading.ignored.includes(key)) state.proofreading.ignored.push(key);
    state.corrections = state.corrections.filter(item => !PlanoCorrections.automatic(item) || PlanoCorrections.ignoreKey(item) !== key);
  } else state.corrections = state.corrections.filter(item => item.id !== id);
  changed();
  message("Corrección eliminada. Puedes recuperarla con Deshacer.");
}
function refreshCorrections() {
  $("#script-corrections").hidden = !state.corrections.length;
  $("#script-correction-count").textContent = state.corrections.length;
  const list = $("#script-correction-list"), fragment = document.createDocumentFragment();
  for (const item of state.corrections) {
    const card = document.createElement("div"); card.className = "script-correction-card"; card.dataset.correctionId = item.id;
    const jump = document.createElement("button"); jump.type = "button"; jump.className = "script-correction-jump";
    const text = document.createElement("span"); text.textContent = PlanoCorrections.automatic(item) ? `${item.source === "syntax" ? "Revisar redacción" : "Posible error"}: ${item.word}` : item.parts.map(part => part.text).join(" ").replace(/\s+/g," ");
    jump.title = text.textContent; jump.setAttribute("aria-label", `Localizar corrección: ${text.textContent.slice(0,160)}`);
    const pages = [...new Set(item.parts.map(part => part.page))].sort((a,b)=>a-b), meta = document.createElement("small");
    meta.textContent = pages.length>1 ? `Páginas ${pages[0]}–${pages.at(-1)}` : `Página ${pages[0]}`;
    jump.append(text, meta); jump.addEventListener("click", () => { if (canSelectShots()) jumpToAnnotation(PlanoCorrections.annotations([item])[0]); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "script-correction-remove"; remove.textContent = "×"; remove.setAttribute("aria-label", "Quitar corrección"); remove.title = "Quitar corrección"; remove.addEventListener("click", () => removeCorrection(item.id));
    card.append(jump, remove); fragment.append(card);
  }
  list.replaceChildren(fragment);
}
$("#finish-corrections").addEventListener("click", () => setTool("select"));
$("#delete-correction").addEventListener("click", () => removeCorrection(state.activeCorrection));
$("#correction-action").addEventListener("toggle", () => { if (!$("#correction-action").matches(":popover-open")) state.activeCorrection = null; });
document.addEventListener("pointerdown", event => { if (state.activeCorrection && !$("#correction-action").contains(event.target)) hideCorrectionAction(); });
function hideTitlePositionMenu() {
  state.titleMenu = null;
  const menu = $("#title-position-menu");
  if (menu.matches(":popover-open")) PlanoPopover.hide(menu);
}
function showTitlePositionMenu(item, point, position, linePosition) {
  hideHighlightAction(); state.titleMenu = { id: item.id, position, linePosition };
  $("#toggle-title-safety").textContent = item.labelUnrestricted ? "Volver a colocación protegida" : "Mover sin proteger el contenido";
  $("#toggle-title-pin").hidden = item.type === "line";
  $("#toggle-title-pin").textContent = item.labelPinned ? "Liberar posición" : "Fijar posición";
  PlanoPopover.show($("#title-position-menu"), point); $("#toggle-title-safety").focus({ preventScroll: true });
}
$("#toggle-title-safety").addEventListener("click", () => {
  const menu = state.titleMenu, item = state.annotations.find(note => note.id === menu?.id);
  if (!item) return;
  remember();
  if (item.labelUnrestricted) delete item.labelUnrestricted;
  else { item.labelUnrestricted = true; delete item.labelPinned; }
  if (item.type === "line") { if (menu.linePosition) item.lineLabel = menu.linePosition; }
  else if (menu.position) item.labelPosition = menu.position;
  hideTitlePositionMenu(); changed(); $("#pdf-stage").focus({ preventScroll: true });
});
$("#toggle-title-pin").addEventListener("click", () => {
  const menu = state.titleMenu, item = state.annotations.find(note => note.id === menu?.id);
  if (!item) return;
  remember();
  if (item.labelPinned) delete item.labelPinned;
  else { item.labelPinned = true; if (menu.position) item.labelPosition = menu.position; }
  hideTitlePositionMenu(); changed(); $("#pdf-stage").focus({ preventScroll: true });
});
$("#title-position-menu").addEventListener("toggle", () => { if (!$("#title-position-menu").matches(":popover-open")) state.titleMenu = null; });
function showHighlightAction(item, point) {
  if (state.stage !== "coverage" || state.tool !== "select" || state.highlightCorrection || state.lineGesture || state.pending || state.editing || state.pasteHighlight) return;
  hideHighlightAction(); state.highlightAction = item.id;
  const action = $("#highlight-action"); action.showPopover();
  const box = action.getBoundingClientRect();
  action.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, point.x))}px`;
  action.style.top = `${Math.max(8, Math.min(innerHeight - box.height - 8, point.y + 14))}px`;
  $("#correct-highlight").focus({ preventScroll: true });
}
$("#correct-highlight").addEventListener("click", async () => {
  const item = state.annotations.find(note => note.id === state.highlightAction && note.type === "highlight");
  if (!item) return;
  hideHighlightAction(); setTool("select");
  await jumpToAnnotation(item);
  if (!state.annotations.some(note => note.id === item.id)) return;
  state.highlightCorrection = { shotId: item.shotId || item.id };
  window.getSelection()?.removeAllRanges(); $("#highlight-correction-bar").hidden = false; updateSelectionButton();
  if (smallScreen.matches) setPanelOpen(false); $("#pdf-stage").focus({ preventScroll: true });
});
$("#apply-highlight-correction").addEventListener("pointerdown", event => event.preventDefault());
$("#apply-highlight-correction").addEventListener("click", highlightSelection);
$("#cancel-highlight-correction").addEventListener("click", () => { cancelHighlightCorrection(); window.getSelection()?.removeAllRanges(); });
function pointerPosition(event, context) {
  const bounds = context.content.getBoundingClientRect(); const { segment } = context;
  return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(segment.top, Math.min(segment.bottom, (event.clientY - bounds.top) / bounds.height)) };
}
// Buscar la página bajo el puntero aunque el SVG inicial conserve su captura.
function coveragePointer(event, fallback) {
  let closest = fallback, distance = Infinity;
  for (const context of state.viewer?.contexts.values() || []) {
    const box = context.crop.getBoundingClientRect();
    const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom);
    if (dy < distance) { closest = context; distance = dy; }
  }
  const box = closest.crop.getBoundingClientRect();
  if (closest.status === "idle") ensurePage(closest);
  if (closest.content) return { ...pointerPosition(event, closest), page: closest.segment.page };
  return { page: closest.segment.page, x: Math.max(0, Math.min(1, (event.clientX - box.left) / closest.viewport.width)),
    y: Math.max(closest.segment.top, Math.min(closest.segment.bottom, closest.segment.top + (event.clientY - box.top) / closest.viewport.height)) };
}
let coverageScrollFrame = 0;
function autoScrollCoverage() {
  if (coverageScrollFrame) return;
  function tick() {
    coverageScrollFrame = 0;
    const gesture = state.drawing || state.lineGesture, event = gesture?.pointer;
    if (!event || !state.viewer) return;
    const stage = $("#pdf-stage"), bounds = stage.getBoundingClientRect(), edge = 52;
    const speed = event.clientY > bounds.bottom - edge ? Math.min(24, (event.clientY - bounds.bottom + edge) * .4)
      : event.clientY < bounds.top + edge ? -Math.min(24, (bounds.top + edge - event.clientY) * .4) : 0;
    const before = stage.scrollTop;
    if (speed) stage.scrollTop += speed;
    if (stage.scrollTop !== before) {
      refreshCoverageGesture();
    }
    coverageScrollFrame = requestAnimationFrame(tick);
  }
  coverageScrollFrame = requestAnimationFrame(tick);
}
function stopCoverageScroll() { cancelAnimationFrame(coverageScrollFrame); coverageScrollFrame = 0; }
function refreshCoverageGesture() {
  if (state.drawing?.pointer) { state.drawing.end = endPosition(state.drawing.pointer); scheduleAnnotationDraw(); }
  else if (state.lineGesture?.pointer) updateLineGesture(state.lineGesture.pointer);
}
function releaseCoveragePointer(pointerId) {
  const stage = $("#pdf-stage");
  if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
}
function cancelDrawing(redraw = true) {
  const drawing = state.drawing; state.drawing = null; stopCoverageScroll();
  if (drawing) releaseCoveragePointer(drawing.pointerId);
  if (redraw) drawAnnotations();
}
function endPosition(event) {
  const { context, start } = state.drawing, point = coveragePointer(event, context);
  if (event.shiftKey) {
    if (point.page === start.page && Math.abs(point.x - start.x) * context.viewport.width > Math.abs(point.y - start.y) * context.viewport.height) point.y = start.y;
    else point.x = start.x;
  }
  return point;
}
function bindDrawing(context) {
  const { svg } = context;
  svg.addEventListener("pointerdown", event => {
    if (state.tool !== "line" || state.drawing || state.pending || context.status !== "ready" || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault(); window.getSelection()?.removeAllRanges();
    const start = { ...pointerPosition(event, context), page: context.segment.page };
    state.drawing = { context, start, end: start, pointerId: event.pointerId, pointer: event };
    $("#pdf-stage").setPointerCapture(event.pointerId); autoScrollCoverage(); drawAnnotations();
  });

}
function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}
let continuingLine = false;
function syncContinueLine() {
  const button = $("#continue-line"), item = state.annotations.find(note => note.id === state.selectedLine && note.type === "line");
  $("#selected-line-actions").hidden = !item || state.tool !== "select" || state.stage !== "coverage" || Boolean(state.lineGesture || state.pending || state.editing || state.highlightCorrection || state.pasteHighlight);
  button.hidden = !item || state.tool !== "select" || state.stage !== "coverage" || Boolean(state.lineGesture || state.pending || state.editing || state.highlightCorrection || state.pasteHighlight);
  const last = item && PlanoCoverage.endPage(item) >= state.pdf?.numPages;
  button.disabled = continuingLine || !item || last;
  button.title = last ? "La línea ya llega a la última página del documento" : "Prolongar este mismo plano hasta la página siguiente";
}
async function continueSelectedLine() {
  const item = state.annotations.find(note => note.id === state.selectedLine && note.type === "line"), pdf = state.pdf;
  if (!item || !pdf || continuingLine || state.busy || state.drawing || state.lineGesture || state.pending || state.editing || state.highlightCorrection || state.pasteHighlight) return;
  const page = PlanoCoverage.endPage(item) + 1;
  if (page > pdf.numPages) return;
  continuingLine = true; syncContinueLine();
  try {
    const furniture = sceneTools.pageFurniture(state.pages), first = state.pages[page - 1].lines.find(line => !furniture(line));
    const y = Math.min(.9, Math.max(.08, (first?.y ?? .08) + .07));
    const draft = { ...item, endPage: page, end: { x: item.end.x, y } };
    const notes = state.annotations.map(note => note.id === item.id ? draft : note);
    const contains = view => sceneTools.workingSegments(state.scenes, state.pages, view, notes).some(segment => segment.page === page && y >= segment.top && y <= segment.bottom);
    if (!contains(state.scene)) {
      state.scene = contains("all") ? "all" : "print";
      $("#scene-select").value = state.scene; syncViewMenu();
    }
    remember(); item.endPage = page; item.end = { ...draft.end }; changed();
    const context = contextAt({ page, y });
    if (context) {
      await ensurePage(context);
      if (state.pdf !== pdf || state.viewer !== context.viewer) return;
      scrollToPosition({ page, y: Math.max(context.segment.top, y - 80 / context.viewport.height) });
      state.selectedLine = item.id; drawAnnotations(); focusLineControl(item.id, context, "end");
    }
    message(`El plano continúa en la página ${page}. Arrastra su extremo para ajustar dónde termina.`);
  } finally { continuingLine = false; syncContinueLine(); }
}
$("#continue-line").addEventListener("click", continueSelectedLine);
function scheduleAnnotationDraw() {
  if (!annotationDrawFrame) annotationDrawFrame = requestAnimationFrame(() => {
    annotationDrawFrame = 0; drawAnnotations();
  });
}
function drawAnnotations(onlyContext = null) {
  syncTechnicalWindowLock();
  if (!onlyContext?.segment) { cancelAnimationFrame(annotationDrawFrame); annotationDrawFrame = 0; }
  syncContinueLine();
  // Los listeners pueden pasar un evento: solo se aceptan contextos de página aquí.
  const contexts = onlyContext?.segment ? [onlyContext] : Array.from(state.viewer?.contexts.values() || []);
  const items = [...state.annotations, ...PlanoCorrections.annotations(state.corrections), ...(state.pending?.items || [])].map(item => state.lineGesture && item.id === state.lineGesture.id ? state.lineGesture.draft : item);
  const pages = new Map();
  for (const context of contexts) {
    if (!context.svg || context.status !== "ready") continue;
    context.svg.replaceChildren();
    if (!pages.has(context.segment.page)) pages.set(context.segment.page, PlanoCoverage.onPage(items, context.segment.page));
    const annotations = pages.get(context.segment.page).filter(item => annotationInSegment(item, context.segment));
    for (const annotation of annotations.filter(item => item.page === context.segment.page)) {
      const group = svgElement("g", { "data-annotation-id": annotation.id || "pending", ...(annotation.id ? {} : { class: "pending-annotation" }) });
      if (annotation.correction) {
        group.classList.add("script-correction-mark");
        const size = state.pages[annotation.page - 1], shapes = PlanoCorrections.zigzags(annotation.rects, size);
        for (const shape of shapes) {
          const points = shape.map(point => `${point.x * 1000},${point.y * 1000}`).join(" ");
          group.append(svgElement("polyline", { class: "script-correction-underline", points, fill: "none", stroke: PlanoCorrections.color, "stroke-width": .9 * context.viewport.scale, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round" }));
          const hit = svgElement("polyline", { class: "correction-hit-target", points, tabindex: state.tool === "select" ? 0 : -1, role: "button", "aria-label": `Corrección: ${annotation.text.slice(0, 160)}` });
          hit.addEventListener("pointerdown", event => { if (state.tool === "select") { event.preventDefault(); event.stopPropagation(); } });
          hit.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); showCorrectionAction(annotation.correctionId, { x: event.clientX, y: event.clientY }); });
          hit.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); const box = hit.getBoundingClientRect(); showCorrectionAction(annotation.correctionId, { x: box.left, y: box.bottom }); } });
          group.append(hit);
        }
      } else if (annotation.type === "highlight") {
        for (const rect of annotation.rects) group.append(svgElement("rect", { x: rect.x * 1000, y: rect.y * 1000, width: rect.width * 1000, height: rect.height * 1000, fill: annotation.color, "fill-opacity": 0.38, stroke: "none" }));
      } else group.append(lineElement(annotation.start, annotation.end, annotation.color), ...lineCaps(annotation.start, annotation.end, annotation.color, context.viewport, annotation));
      if (annotation.id && annotation.type === "line") {
        const target = svgElement("path", { class: "line-hit-target", d: `M${annotation.start.x * 1000} ${annotation.start.y * 1000}L${annotation.end.x * 1000} ${annotation.end.y * 1000}`, stroke: "transparent", fill: "none", "stroke-width": 18, "vector-effect": "non-scaling-stroke", tabindex: state.tool === "select" ? 0 : -1, role: "button", "aria-label": `Mover línea: ${annotationDisplayName(annotation)}`, "aria-pressed": String(state.selectedLine === annotation.id) });
        const help = svgElement("title"); help.textContent = "Arrastra para mover la línea. Clic para mostrar sus extremos. Flechas: mover; Mayús + flechas: 10 px."; target.append(help);
        target.addEventListener("pointerdown", event => beginLineGesture(event, annotation, context, "move"));
        target.addEventListener("keydown", event => lineKeydown(event, annotation, context, "move"));
        group.append(target);
      }
      context.svg.append(group);
    }
    if (state.drawing) {
      const draft = PlanoCoverage.part({type:"line", ...PlanoCoverage.fromEnds(state.drawing.start, state.drawing.end)}, context.segment.page);
      if (draft) context.svg.append(lineElement(draft.start, draft.end, $("#annotation-color").value, true), ...lineCaps(draft.start, draft.end, $("#annotation-color").value, context.viewport, draft));
    }
    const selected = state.tool === "select" && annotations.find(item => item.id === state.selectedLine && item.type === "line");
    if (selected) drawLineHandles(selected, context);
    if (!state.drawing) PlanoDocumentLabels.draw(context, annotations.filter(item => !item.correction && item.page === context.segment.page), {
      displayName: annotationDisplayName, locate: jumpToAnnotation, scenes: state.scenes,
      positionMenu: showTitlePositionMenu,
      canDrag: () => state.tool === "select" && !state.pending && !state.editing && !state.lineGesture && !state.highlightCorrection && !state.pasteHighlight,
      move: (item, position) => { remember(); item.labelPosition = position; changed(); },
      moveLineTitle: (item, position) => { const source = state.annotations.find(note => note.id === item.id); if (!source) return; remember(); source.lineLabel = position; delete source.labelPosition; changed(); }
    });
  }
}
function annotationInSegment(item, segment) {
  if (item.page !== segment.page) return false;
  const top = item.type === "line" ? Math.min(item.start.y, item.end.y) : Math.min(...item.rects.map(rect => rect.y));
  const bottom = item.type === "line" ? Math.max(item.start.y, item.end.y) : Math.max(...item.rects.map(rect => rect.y + rect.height));
  return bottom >= segment.top && top < segment.bottom;
}
function lineElement(start, end, color, preview = false) {
  return svgElement("line", { x1: start.x * 1000, y1: start.y * 1000, x2: end.x * 1000, y2: end.y * 1000, stroke: color, "stroke-width": 3, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke", ...(preview ? { "stroke-dasharray": "5 4" } : {}) });
}
function lineCaps(start, end, color, viewport, item = {}) {
  return PlanoDocumentLabels.capSegments({ start, end }, viewport).map((cap, i) => svgElement("path", {
    d: `M${cap.start.x / viewport.width * 1000} ${cap.start.y / viewport.height * 1000}L${cap.end.x / viewport.width * 1000} ${cap.end.y / viewport.height * 1000}`,
    class: "coverage-cap", "data-endpoint": i ? "end" : "start", fill: "none", stroke: color, "stroke-width": 3, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke"
  })).filter(cap => cap.dataset.endpoint === "start" ? !item.continuesBefore : !item.continuesAfter);
}

function drawLineHandles(item, context) {
  item = state.lineGesture?.id === item.id ? state.lineGesture.draft : state.annotations.find(note => note.id === item.id) || item;
  const group = svgElement("g", { class: "line-selection", "data-line-id": item.id });
  const { width, height } = context.viewport;
  for (const endpoint of ["start", "end"]) {
    if ((endpoint === "start" ? item.page : PlanoCoverage.endPage(item)) !== context.segment.page) continue;
    const point = item[endpoint];
    if (point.y < context.segment.top || point.y > context.segment.bottom) continue;
    const attributes = { cx: point.x * 1000, cy: point.y * 1000 };
    const hit = svgElement("ellipse", { ...attributes, rx: 14 / width * 1000, ry: 14 / height * 1000, class: "line-handle-hit", "data-endpoint": endpoint, fill: "transparent", stroke: "none", tabindex: 0, role: "button", "aria-label": `Cambiar ${endpoint === "start" ? "inicio" : "fin"} de línea: ${annotationDisplayName(item)}` });
    const help = svgElement("title"); help.textContent = "Arrastra este extremo para cambiar el tamaño. Mayús fija la dirección. También puedes usar las flechas."; hit.append(help);
    hit.addEventListener("pointerdown", event => beginLineGesture(event, item, context, endpoint));
    hit.addEventListener("keydown", event => lineKeydown(event, item, context, endpoint));
    const dot = svgElement("ellipse", { ...attributes, rx: 6 / width * 1000, ry: 6 / height * 1000, class: "line-handle-dot", fill: "#ffffff", stroke: item.color, "stroke-width": 2.5, "vector-effect": "non-scaling-stroke" });
    group.append(hit, dot);
  }
  context.svg.append(group);
}
function transformedLine(original, context, mode, origin, point, snap = false) {
  const draft = structuredClone(original);
  point.page ??= context.segment.page; origin.page ??= context.segment.page;
  if (mode !== "move") {
    const fixed = { page: mode === "start" ? PlanoCoverage.endPage(original) : original.page, ...original[mode === "start" ? "end" : "start"] };
    if (snap) {
      if (point.page === fixed.page && Math.abs((point.x - fixed.x) * context.viewport.width) > Math.abs((point.y - fixed.y) * context.viewport.height)) point = { ...point, y: fixed.y };
      else point = { ...point, x: fixed.x };
    }
    const geometry = mode === "start" ? PlanoCoverage.fromEnds(point, fixed) : PlanoCoverage.fromEnds(fixed, point);
    delete draft.endPage; return Object.assign(draft, geometry);
  }
  if (PlanoCoverage.endPage(original) !== original.page || point.page !== origin.page) {
    delete draft.endPage; return Object.assign(draft, PlanoCoverage.moved(original, point.x - origin.x, PlanoCoverage.unit(point) - PlanoCoverage.unit(origin), state.pdf.numPages));
  }
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  if (mode === "move") {
    const minX = Math.min(original.start.x, original.end.x), maxX = Math.max(original.start.x, original.end.x);
    const minY = Math.min(original.start.y, original.end.y), maxY = Math.max(original.start.y, original.end.y);
    const fits = minY >= context.segment.top && maxY <= context.segment.bottom;
    const dx = clamp(point.x - origin.x, -minX, 1 - maxX);
    const dy = clamp(point.y - origin.y, (fits ? context.segment.top : 0) - minY, (fits ? context.segment.bottom : 1) - maxY);
    draft.start = { x: original.start.x + dx, y: original.start.y + dy };
    draft.end = { x: original.end.x + dx, y: original.end.y + dy };
  }
  return draft;
}
function commitLineGeometry(id, draft, context) {
  const item = state.annotations.find(note => note.id === id && note.type === "line");
  if (!item || Math.hypot((draft.end.x - draft.start.x) * context.viewport.width, (PlanoCoverage.endPage(draft) - draft.page + draft.end.y - draft.start.y) * context.viewport.height) < 6) return false;
  if (item.page === draft.page && PlanoCoverage.endPage(item) === PlanoCoverage.endPage(draft) && ["start", "end"].every(end => Math.abs(item[end].x - draft[end].x) < 1e-9 && Math.abs(item[end].y - draft[end].y) < 1e-9)) return false;
  remember(); item.page = draft.page; delete item.endPage; if (draft.endPage) item.endPage = draft.endPage; item.start = { ...draft.start }; item.end = { ...draft.end }; changed(); return true;
}
function beginLineGesture(event, item, context, mode) {
  if (state.tool !== "select" || state.pending || state.editing || state.lineGesture || state.highlightCorrection || state.pasteHighlight || context.status !== "ready" || event.button !== 0 || event.pointerType === "touch" && !event.isPrimary) return;
  event.preventDefault(); event.stopPropagation();
  window.getSelection()?.removeAllRanges();
  item = state.annotations.find(note => note.id === item.id) || item;
  state.selectedLine = item.id;
  state.lineGesture = { id: item.id, context, mode, original: structuredClone(item), draft: structuredClone(item), origin: { ...pointerPosition(event, context), page: context.segment.page }, pointer: event, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, moved: false, frame: 0 };
  $("#pdf-stage").setPointerCapture(event.pointerId); autoScrollCoverage();
  $("#pdf-stage").classList.add("is-transforming-line");
  drawAnnotations();
}
function updateLineGesture(event) {
  const gesture = state.lineGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  event.preventDefault();
  const point = coveragePointer(event, gesture.context);
  const distance = Math.hypot((point.x - gesture.origin.x) * gesture.context.viewport.width,
    (PlanoCoverage.unit(point) - PlanoCoverage.unit(gesture.origin)) * gesture.context.viewport.height);
  if (!gesture.moved && distance < 3) return;
  gesture.moved = true; gesture.pointer = event;
  gesture.draft = transformedLine(gesture.original, gesture.context, gesture.mode, gesture.origin, point, event.shiftKey);
  if (!gesture.frame) gesture.frame = requestAnimationFrame(() => {
    gesture.frame = 0;
    if (state.lineGesture === gesture) drawAnnotations();
  });
}
function cancelLineGesture(redraw = true) {
  const gesture = state.lineGesture;
  if (!gesture) return;
  state.lineGesture = null; stopCoverageScroll();
  cancelAnimationFrame(gesture.frame);
  releaseCoveragePointer(gesture.pointerId);
  $("#pdf-stage").classList.remove("is-transforming-line");
  if (redraw) drawAnnotations();
}
// La captura y el ciclo del gesto pertenecen al visor, no a un SVG de página.
$("#pdf-stage").addEventListener("pointermove", event => {
  if (state.drawing?.pointerId === event.pointerId) {
    event.preventDefault(); state.drawing.pointer = event; state.drawing.end = endPosition(event); scheduleAnnotationDraw();
  } else if (state.lineGesture?.pointerId === event.pointerId) updateLineGesture(event);
});
$("#pdf-stage").addEventListener("pointerup", event => {
  if (state.drawing?.pointerId === event.pointerId) {
    const { context, start } = state.drawing, end = endPosition(event), geometry = PlanoCoverage.fromEnds(start, end);
    cancelDrawing(false);
    const distance = Math.hypot((end.x - start.x) * context.viewport.width, (PlanoCoverage.unit(end) - PlanoCoverage.unit(start)) * context.viewport.height);
    if (distance >= 6) requestNamedAnnotations([{ type: "line", ...geometry, color: $("#annotation-color").value }]); else drawAnnotations();
  } else if (state.lineGesture?.pointerId === event.pointerId) {
    const gesture = state.lineGesture;
    updateLineGesture(event); cancelLineGesture(false);
    if (!gesture.moved || !commitLineGeometry(gesture.id, gesture.draft, gesture.context)) drawAnnotations();
  }
});
for (const type of ["pointercancel", "lostpointercapture"]) $("#pdf-stage").addEventListener(type, event => {
  if (state.drawing?.pointerId === event.pointerId) cancelDrawing();
  if (state.lineGesture?.pointerId === event.pointerId) cancelLineGesture();
});
window.addEventListener("blur", () => {
  const active = Boolean(state.drawing || state.lineGesture);
  cancelDrawing(false); cancelLineGesture(false);
  if (active) drawAnnotations();
});
function focusLineControl(id, context, mode) {
  if (mode === "move") Array.from(context.svg.querySelectorAll("g[data-annotation-id]")).find(group => group.dataset.annotationId === id)?.querySelector(".line-hit-target")?.focus({ preventScroll: true });
  else Array.from(context.svg.querySelectorAll(".line-selection")).find(group => group.dataset.lineId === id)?.querySelector(`[data-endpoint="${mode}"]`)?.focus({ preventScroll: true });
}
function lineKeydown(event, item, context, mode) {
  if (state.tool !== "select" || state.lineGesture || state.pending || state.editing || state.highlightCorrection || state.pasteHighlight) return;
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!direction && event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault(); event.stopPropagation(); state.selectedLine = item.id;
  const original = state.annotations.find(note => note.id === item.id);
  if (!original) return;
  if (direction) {
    const origin = { ...original[mode === "end" ? "end" : "start"], page: mode === "end" ? PlanoCoverage.endPage(original) : original.page }, step = event.shiftKey ? 10 : 1;
    const point = { page: origin.page, x: Math.max(0, Math.min(1, origin.x + direction[0] * step / context.viewport.width)), y: Math.max(context.segment.top, Math.min(context.segment.bottom, origin.y + direction[1] * step / context.viewport.height)) };
    if (!commitLineGeometry(item.id, transformedLine(original, context, mode, origin, point), context)) drawAnnotations();
  } else drawAnnotations();
  focusLineControl(item.id, context, mode);
}

function remember() {
  state.history.push(documentSnapshot());
  if (state.history.length > 50) state.history.shift(); state.future = [];
}
function documentSnapshot() { return structuredClone({ annotations: state.annotations, corrections: state.corrections, crew: state.crew, proofreading: state.proofreading }); }
function annotationY(annotation) { return annotation.type === "line" ? annotation.start.y : annotation.rects[0].y; }
function annotationPages(item) { return item.type === "line" && PlanoCoverage.endPage(item) !== item.page ? `Páginas ${item.page}–${item.endPage}` : `Página ${item.page}`; }
function annotationDisplayName(item) {
  if (item.shotName) return item.shotName;
  const index = state.annotations.filter(note => note.type === item.type).findIndex(note => note.id === item.id) + 1;
  return `${item.type === "line" ? "Línea" : "Resalte"} ${String(Math.max(1, index)).padStart(2, "0")}`;
}
function createAnnotation(data) { return { note: "", description: "", grip: "", sound: "", ...data, id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, createdAt: new Date().toISOString() }; }
// El portapapeles de planos vive en esta sesión/documento y nunca mezcla cuentas.
function currentCopiedShot() {
  if (!copiedShot) return null;
  return copiedShot?.owner === PlanoAccounts.getUser()?.id && copiedShot?.fingerprint === state.fingerprint ? copiedShot.data : null;
}
function copyShot(id) {
  if (state.pasteHighlight || state.pending || state.editing || state.drawing || state.lineGesture || state.busy) return false;
  const data = PlanoShotCopy.capture(state.annotations, id);
  if (!data) return false;
  copiedShot = { data, owner: PlanoAccounts.getUser()?.id, fingerprint: state.fingerprint };
  message(`Plano «${annotationDisplayName(data.base)}» copiado. Pulsa Ctrl+V para pegarlo.`);
  return true;
}
function cancelPasteChoice() {
  state.pasteChoice = null;
  if ($("#paste-shot-dialog").open) $("#paste-shot-dialog").close();
}
function openPasteChoice() {
  const copy = currentCopiedShot();
  if (!copy || !state.pdf || state.screen !== "editor" || state.busy || state.exporting || state.pending || state.editing || state.lineGesture || state.drawing || state.highlightCorrection || state.pasteHighlight || state.pasteChoice || !PlanoTechnicalScript.finishEditing()) return;
  const anchor = state.stage === "coverage" ? capturePosition() : null;
  hideHighlightAction();
  if ($("#shot-details-dialog").open) { state.details = null; $("#shot-details-dialog").close(); }
  state.pasteChoice = { copy: structuredClone(copy), pdf: state.pdf, anchor: anchor || { page: copy.base.page, y: annotationY(copy.base) } };
  $("#paste-shot-description").textContent = `¿Cómo quieres pegar el plano «${annotationDisplayName(copy.base)}»?`;
  $("#paste-shot-dialog").showModal(); $("#paste-as-line").focus();
}
function commitPastedNotes(items, copy) {
  if (!items.length || !state.pdf) return null;
  const name = PlanoShotCopy.nextName(state.annotations, PlanoShotNames.next);
  const shotId = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const shotOrder = Math.max(-1, ...state.annotations.map((note, i) => note.shotOrder ?? i)) + 1;
  const created = items.map(item => createAnnotation({ ...PlanoShotCopy.properties(copy, item.type), ...item, color: copy.base.color, shotId, shotOrder, shotName: name }));
  remember(); state.annotations.push(...created);
  state.selectedLine = created[0].type === "line" ? created[0].id : null;
  changed(); return created[0];
}
async function pasteCopiedLine() {
  const choice = state.pasteChoice; cancelPasteChoice();
  if (!choice || state.pdf !== choice.pdf) return;
  try {
    if (state.stage !== "coverage") await switchStage("coverage");
    if (state.pdf !== choice.pdf) return;
    const viewport = contextAt(choice.anchor)?.viewport || { width: state.pages[choice.anchor.page - 1].width * state.zoom };
    const line = PlanoShotCopy.line(choice.copy, choice.anchor, state.pdf.numPages, viewport, PlanoCoverage);
    const item = commitPastedNotes([line], choice.copy);
    await jumpToAnnotation(item);
    if (state.pdf === choice.pdf) { state.selectedLine = item.id; drawAnnotations(); }
    message(`Plano «${item.shotName}» pegado como línea.`);
  } catch (error) { message(`No se pudo pegar el plano. ${error.message}`, true); }
}
async function beginPastedHighlight() {
  const choice = state.pasteChoice; cancelPasteChoice();
  if (!choice || state.pdf !== choice.pdf) return;
  if (state.stage !== "coverage") await switchStage("coverage");
  if (state.pdf !== choice.pdf) return;
  startTextPlacement({ copy: choice.copy, pdf: choice.pdf });
}
function startTextPlacement(data) {
  hideHighlightAction();
  for (const popover of document.querySelectorAll('[popover]:popover-open')) popover.hidePopover();
  $("#project-menu").open = false;
  const tool = state.tool, panelOpen = state.panelOpen;
  setTool("highlight"); window.getSelection()?.removeAllRanges();
  if (smallScreen.matches) setPanelOpen(false);
  const locks = Array.from(document.querySelectorAll('.topbar,.sidebar,#annotations-panel,.annotation-toolbar,#technical-view,.page-heading,.workspace-toolbar,.main-footer')).map(node => ({ node, inert: node.inert }));
  for (const {node} of locks) node.inert = true;
  state.pasteHighlight = { ...data, tool, panelOpen, locks };
  $("#paste-highlight-bar [role='status']").textContent = data.kind === "script-link" ? "Selecciona el texto que abarca este plano. Pulsa Listo para confirmar." : "Resalta el texto donde quieres colocar el plano copiado.";
  $("#apply-pasted-highlight").textContent = data.kind === "script-link" ? "Listo" : "Pegar en selección";
  document.body.classList.add("pasting-shot");
  $("#paste-highlight-bar").hidden = false;
  $("#pdf-stage").classList.add("is-pasting-highlight"); $("#pdf-stage").focus({ preventScroll: true });
  drawAnnotations(); updateSelectionButton();
}
function finishPastedHighlight(cancelled = false) {
  const pending = state.pasteHighlight;
  if (!pending) return;
  state.pasteHighlight = null;
  document.body.classList.remove("pasting-shot");
  for (const {node, inert} of pending.locks) if (node.isConnected) node.inert = inert;
  $("#paste-highlight-bar").hidden = true; $("#pdf-stage").classList.remove("is-pasting-highlight");
  window.getSelection()?.removeAllRanges(); setTool(pending.tool);
  if (smallScreen.matches) setPanelOpen(pending.panelOpen);
  if (cancelled && pending.kind === "script-link") restoreLinkedEditor(pending);
  else if (cancelled) message("Pegado cancelado. No se creó ningún plano.");
}
function syncLinkedEditor() {
  const item = state.annotations.find(note => note.id === state.editing?.id); if (!item) return;
  const linked = state.editing.scriptSelection;
  $("#line-script-status").textContent = linked ? "Texto vinculado" : "Automático";
  $("#reset-line-script").hidden = !linked;
  const parts = state.annotations.filter(part => (part.shotId || part.id) === (item.shotId || item.id)).map(part => {
    const copy = { ...part }; delete copy.scriptSelection; if (linked) copy.scriptSelection = linked; return copy;
  });
  $("#edit-shot-text").textContent = PlanoShotScript.excerpt(parts, state.pages) || "Sin texto detectado en este tramo.";
}
async function beginLinkedText() {
  const editing = state.editing, item = state.annotations.find(note => note.id === editing?.id);
  if (!item || item.type !== "line" || state.pasteHighlight) return;
  const draft = { ...editing, values: Array.from($("#edit-shot-form").querySelectorAll('input[id],select[id],textarea[id]')).map(input => [input.id, input.value]) };
  const shell = $(".app-shell"), wasInert = shell.inert;
  preparingLinkedText = true; shell.inert = true;
  state.editing = null; $("#edit-shot-dialog").close("linking"); syncTechnicalWindowLock();
  try {
    if (state.stage !== "coverage") await switchStage("coverage");
    await jumpToAnnotation(item);
    if (state.pdf !== draft.pdf) return;
    startTextPlacement({ kind: "script-link", pdf: draft.pdf, draft });
  } catch (error) { restoreLinkedEditor({ pdf: draft.pdf, draft }); throw error; }
  finally { preparingLinkedText = false; shell.inert = wasInert; syncTechnicalWindowLock(); }
}
function restoreLinkedEditor(pending, notes = null) {
  if (state.pdf !== pending.pdf) return;
  const item = state.annotations.find(note => note.id === pending.draft.id); if (!item) return;
  openShotEditor(item, pending.draft.previousFocus);
  for (const [id, value] of pending.draft.values) document.getElementById(id).value = value;
  for (const key of shotValues.otherKeys) document.getElementById(shotValues.fields[key].edit).dispatchEvent(new Event("change"));
  state.editing.scriptSelection = pending.draft.scriptSelection;
  if (notes) {
    try { state.editing.scriptSelection = PlanoShotScript.validateSelection(notes, state.pdf.numPages); }
    catch (error) { message(error.message, true); }
  }
  colorPalette.syncLaunches(); $("#edit-color-value").textContent = $("#edit-shot-color").value.toUpperCase(); syncLinkedEditor();
}
$("#link-line-script").addEventListener("click", () => beginLinkedText().catch(error => message(`No se pudo seleccionar el fragmento. ${error.message}`, true)));
$("#reset-line-script").addEventListener("click", () => { if (state.editing) { state.editing.scriptSelection = null; syncLinkedEditor(); } });
$("#copy-selected-line").addEventListener("click", () => copyShot(state.selectedLine));
$("#copy-highlight").addEventListener("click", () => { const id = state.highlightAction; if (copyShot(id)) hideHighlightAction(); });
$("#copy-shot-details").addEventListener("click", () => { if (copyShot(state.details?.id)) { state.details = null; $("#shot-details-dialog").close(); } });
$("#paste-as-line").addEventListener("click", pasteCopiedLine);
$("#paste-as-highlight").addEventListener("click", () => beginPastedHighlight().catch(error => message(`No se pudo preparar el pegado. ${error.message}`, true)));
$("#close-paste-shot").addEventListener("click", cancelPasteChoice);
$("#paste-shot-dialog").addEventListener("cancel", event => { event.preventDefault(); cancelPasteChoice(); });
$("#paste-shot-dialog").addEventListener("close", () => { if (!$("#paste-shot-dialog").open) state.pasteChoice = null; });
$("#apply-pasted-highlight").addEventListener("pointerdown", event => event.preventDefault());
$("#apply-pasted-highlight").addEventListener("click", highlightSelection);
$("#cancel-pasted-highlight").addEventListener("click", () => finishPastedHighlight(true));
document.addEventListener("keydown", event => {
  const editable = event.target.closest('input,textarea,select,[contenteditable]');
  if (state.pasteHighlight) {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finishPastedHighlight(true); }
    else if (event.key === "Enter" && !event.target.closest('#paste-highlight-bar button')) { event.preventDefault(); event.stopImmediatePropagation(); highlightSelection(); }
    else if (!event.target.closest('#paste-highlight-bar') && !['Shift','Control','Meta','Alt','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
    return;
  }
  if (editable || !(event.ctrlKey || event.metaKey) || !['c','v'].includes(event.key.toLowerCase()) || state.screen !== "editor") return;
  if (document.querySelector('dialog[open]:not(#shot-details-dialog)')) return;
  if (event.key.toLowerCase() === "c") {
    if (window.getSelection()?.toString().trim()) return;
    const id = state.selectedLine || state.highlightAction || state.details?.id;
    if (id && copyShot(id)) { event.preventDefault(); event.stopImmediatePropagation(); }
  } else if (currentCopiedShot()) {
    event.preventDefault(); event.stopImmediatePropagation(); openPasteChoice();
  }
}, true);
document.addEventListener("copy", event => {
  if (event.target.closest?.('input,textarea,[contenteditable]') || window.getSelection()?.toString().trim()) copiedShot = null;
});

async function requestNamedAnnotations(items) {
  if (!items.length || !state.pdf || state.pending) return;
  const pending = { items, pdf: state.pdf };
  state.pending = pending;
  drawAnnotations();
  const details = await askShotName(items);
  if (state.pending !== pending) return;
  state.pending = null;
  if (details && state.pdf === pending.pdf) {
    remember();
    const shotId = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const shotOrder = Math.max(-1, ...state.annotations.map((note, i) => note.shotOrder ?? i)) + 1;
    state.annotations.push(...items.map(item => createAnnotation({ ...item, color: details.color, shotName: details.name, ...details.technical, shotId, shotOrder })));
    changed();
  } else drawAnnotations();
}

function askShotName(items) {
  const dialog = $("#shot-name-dialog");
  const form = $("#shot-name-form");
  const input = $("#shot-name-input");
  const previousFocus = document.activeElement;
  dialog.returnValue = "";
  input.value = ""; input.setCustomValidity("");
  shotValues.formValues("input", {});
  $("#new-shot-color").value = items[0].color;
  $("#new-color-value").textContent = items[0].color.toUpperCase(); colorPalette.syncLaunches();
  $("#shot-name-form .shot-writing-section").open = false;
  const suggestion = PlanoShotNames.suggest(state.annotations, state.scenes, items[0], sceneTools.sceneAt);
  input.placeholder = suggestion;
  $("#shot-name-hint").textContent = `Si lo dejas vacío, se guardará como «${suggestion}». La secuencia continúa a partir del último nombre guardado en esta escena.`;
  $("#shot-name-description").textContent = items[0].type === "line" ? (items[0].endPage ? "Este plano continúa entre páginas. Tendrá una sola ficha y el mismo nombre en todos sus tramos." : "Dale un nombre al plano que acabas de trazar.") : items.length > 1 ? "Este resalte abarca varias páginas. Todas sus partes compartirán el nombre del plano." : "Dale un nombre al plano de este fragmento resaltado.";
  return new Promise(resolve => {
    function submit(event) {
      event.preventDefault();
      const name = input.value.trim() || suggestion;
      dialog.close(name);
    }
    function close() {
      form.removeEventListener("submit", submit);
      dialog.removeEventListener("close", close);
      resolve(dialog.returnValue.trim() ? { name: dialog.returnValue.trim(), color: $("#new-shot-color").value, technical: shotValues.formValues("input") } : null);
      if (previousFocus?.isConnected && !previousFocus.closest("dialog")) previousFocus.focus({ preventScroll: true });
    }
    form.addEventListener("submit", submit);
    dialog.addEventListener("close", close);
    dialog.showModal();
  });
}
$("#shot-name-input").addEventListener("input", event => event.target.setCustomValidity(""));
$("#cancel-shot-name").addEventListener("click", () => $("#shot-name-dialog").close(""));
$("#new-shot-color").addEventListener("input", event => { $("#new-color-value").textContent = event.target.value.toUpperCase(); });

function openShotEditor(item, previousFocus = document.activeElement) {
  hideHighlightAction();
  if (!state.pdf || state.pending || state.editing || state.highlightCorrection || state.pasteHighlight || !state.annotations.some(note => note.id === item.id)) return;
  state.editing = { id: item.id, pdf: state.pdf, previousFocus, scriptSelection: item.scriptSelection ? structuredClone(item.scriptSelection) : null };
  $("#edit-shot-name").value = annotationDisplayName(item);
  $("#edit-shot-name").setCustomValidity("");
  shotValues.formValues("edit", item);
  $("#edit-shot-color").value = item.color;
  colorPalette.syncLaunches();
  $("#edit-color-value").textContent = item.color.toUpperCase();
  $("#edit-shot-meta").textContent = `${item.type === "line" ? "Línea de cobertura" : "Resalte"} · ${annotationPages(item)}`;
  $("#line-script-controls").hidden = item.type !== "line";
  $("#edit-shot-excerpt").hidden = false;
  $("#edit-shot-excerpt").open = false;
  syncLinkedEditor();
  $("#edit-shot-dialog").showModal();
  syncTechnicalWindowLock();
  $("#edit-shot-name").focus();
}
$("#edit-shot-name").addEventListener("input", event => event.target.setCustomValidity(""));
$("#edit-shot-color").addEventListener("input", event => { $("#edit-color-value").textContent = event.target.value.toUpperCase(); });
$("#cancel-edit-shot").addEventListener("click", () => $("#edit-shot-dialog").close(""));
$("#edit-shot-form").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#edit-shot-name").value.trim();
  if (!name) { $("#edit-shot-name").setCustomValidity("Escribe un nombre para el plano."); $("#edit-shot-name").reportValidity(); return; }
  const item = state.annotations.find(note => note.id === state.editing?.id);
  if (!item || state.editing.pdf !== state.pdf) { $("#edit-shot-dialog").close(""); return; }
  remember();
  const shotId = item.shotId || item.id;
  for (const part of state.annotations.filter(note => (note.shotId || note.id) === shotId)) {
    part.shotName = name; Object.assign(part, shotValues.formValues("edit")); part.color = $("#edit-shot-color").value;
    if (part.type === "line") {
      if (state.editing.scriptSelection) part.scriptSelection = structuredClone(state.editing.scriptSelection);
      else delete part.scriptSelection;
    }
  }
  $("#edit-shot-dialog").close("saved");
  changed();
});
$("#edit-shot-dialog").addEventListener("close", () => {
  if ($("#edit-shot-dialog").open) return;
  const previousFocus = state.editing?.previousFocus;
  const id = state.editing?.id;
  state.editing = null;
  syncTechnicalWindowLock();
  restoreShotFocus(previousFocus, id);
});
function restoreShotFocus(previous, id) {
  if (previous?.isConnected && !previous.closest("dialog:not([open])")) previous.focus({ preventScroll: true });
  else {
    if (state.stage === "technical") {
      const item = state.annotations.find(note => note.id === id);
      const row = Array.from($("#technical-table-body").querySelectorAll("tr[data-shot-id]")).find(node => node.dataset.shotId === (item?.shotId || id));
      (row?.querySelector("button") || $("#stage-tabs [aria-selected='true']")).focus({ preventScroll: true }); return;
    }
    const card = Array.from($("#annotations-list").querySelectorAll(".annotation-card")).find(node => node.dataset.id === id);
    (card?.querySelector(".annotation-jump") || $("#pdf-stage")).focus({ preventScroll: true });
  }
}
function shotIcon(name) {
  const svg = document.createElementNS(SVG_NS, "svg"); svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use"); use.setAttribute("href", `#i-${name}`); svg.append(use); return svg;
}
function openShotDetails(item) {
  hideHighlightAction();
  // El evento close nativo puede llegar después del siguiente clic o Enter.
  if (!$("#shot-details-dialog").open) state.details = null;
  const current = state.annotations.find(note => note.id === item.id);
  if (!current || state.pending || state.editing || state.lineGesture || state.details || state.highlightCorrection || state.pasteHighlight) return;
  state.details = { id: current.id, previousFocus: document.activeElement };
  $("#shot-details-title").textContent = annotationDisplayName(current);
  const scene = sceneTools.sceneAt(state.scenes, current.page, annotationY(current));
  $("#shot-details-meta").textContent = `${scene ? `Escena ${String(scene.number).padStart(2, "0")} · ` : ""}${current.type === "line" ? "Línea de cobertura" : "Resalte"} · ${annotationPages(current)}`;
  const list = $("#shot-details-technical"); list.replaceChildren();
  for (const key of shotValues.keys) {
    const pair = document.createElement("div"), term = document.createElement("dt"), value = document.createElement("dd");
    term.textContent = shotValues.fields[key].label;
    value.textContent = key === "shotValue" && current.shotValue ? `${current.shotValue} · ${shotValues.fullName(current.shotValue)}` : shotValues.display(current, key);
    pair.append(term, value); list.append(pair);
  }
  const color = document.createElement("div"), term = document.createElement("dt"), value = document.createElement("dd");
  term.textContent = "Color"; value.textContent = current.color.toUpperCase(); value.className = "shot-detail-color"; value.style.setProperty("--annotation-color", current.color);
  color.append(term, value); list.append(color);
  const duration = document.createElement("div"), durationLabel = document.createElement("dt"), durationValue = document.createElement("dd");
  durationLabel.textContent = "Duración estimada";
  durationValue.textContent = PlanoShotScript.format(PlanoShotScript.duration(state.annotations.filter(part => (part.shotId || part.id) === (current.shotId || current.id)), state.pages));
  duration.append(durationLabel, durationValue); list.append(duration);
  for (const key of Object.keys(shotValues.textFields)) {
    const field = $(`#shot-details-${key}`); field.textContent = current[key]?.trim() || "Sin definir";
    field.classList.toggle("is-empty", !current[key]?.trim());
  }
  $("#shot-details-excerpt").hidden = false; $("#shot-details-excerpt").open = false;
  $("#shot-details-text").textContent = PlanoShotScript.excerpt(state.annotations.filter(part => (part.shotId || part.id) === (current.shotId || current.id)), state.pages) || "Sin texto detectado en este tramo.";
  $("#shot-details-dialog").showModal(); $("#close-shot-details").focus();
  syncTechnicalWindowLock();
}
$("#close-shot-details").addEventListener("click", () => $("#shot-details-dialog").close());
$("#shot-details-dialog").addEventListener("close", () => {
  if ($("#shot-details-dialog").open) return;
  const previous = state.details; state.details = null;
  syncTechnicalWindowLock();
  if (!$("#edit-shot-dialog").open && previous) restoreShotFocus(previous.previousFocus, previous.id);
});
$("#edit-shot-details").addEventListener("click", () => {
  const details = state.details, item = state.annotations.find(note => note.id === details?.id);
  $("#shot-details-dialog").close(); state.details = null;
  if (item) openShotEditor(item, details.previousFocus);
});
$("#locate-shot-details").addEventListener("click", () => {
  const item = state.annotations.find(note => note.id === state.details?.id);
  $("#shot-details-dialog").close(); state.details = null;
  if (item) jumpToAnnotation(item);
});
function changed() {
  PlanoTechnicalWindow.publish();
  const anchor = state.screen === "editor" ? capturePosition() : null;
  refreshSegments();
  const previous = Array.from(state.viewer?.contexts.values() || []);
  const layoutChanged = previous.length !== state.segments.length || state.segments.some((segment, i) => previous[i]?.segment.id !== segment.id || previous[i].segment.top !== segment.top || previous[i].segment.bottom !== segment.bottom);
  saveNotes(); refreshAnnotations();
  if (state.stage !== "coverage") return;
  if (layoutChanged && state.screen === "editor") { renderDocument({ anchor }); return; }
  drawAnnotations();
  if (anchor) scrollToPosition(anchor);
  updatePageIndicator();
}
function saveNotes() {
  if (!state.key) return;
  if (PlanoCloud.configured) {
    if (!state.cloudProject) { $("#save-status").textContent = "Este guion todavía no está guardado en tu cuenta."; return; }
    const payload = { version: 1, fingerprint: state.fingerprint, annotations: state.annotations, corrections: state.corrections, crew: state.crew, proofreading: state.proofreading, view: { scene: state.scene, stage: state.stage } };
    if (PlanoScriptPreview.valid(state.thumbnail)) {
      payload.thumbnail = state.thumbnail;
      if (new TextEncoder().encode(JSON.stringify(payload)).length > 350000) delete payload.thumbnail;
    }
    PlanoCloud.schedule(payload);
    return;
  }
  try {
    localStorage.setItem(state.key, JSON.stringify({ version: 1, fingerprint: state.fingerprint, annotations: state.annotations, corrections: state.corrections, crew: state.crew, proofreading: state.proofreading }));
    $("#save-status").textContent = "✓ Notas guardadas en este navegador";
  } catch { $("#save-status").textContent = "No se pudo guardar aquí. Exporta las notas antes de cerrar."; }
}
function validateNotes(value, pageCount = state.pdf.numPages) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error("La copia de notas no es válida.");
  const ids = new Set();
  const coordinate = number => Number.isFinite(number) && number >= 0 && number <= 1;
  const point = value => value && coordinate(value.x) && coordinate(value.y);
  return value.map(item => {
    if (!item || typeof item.id !== "string" || item.id.length > 120 || ids.has(item.id) || !["highlight", "line"].includes(item.type) || !Number.isInteger(item.page) || item.page < 1 || item.page > pageCount || !/^#[0-9a-f]{6}$/i.test(item.color)) throw new Error("La copia contiene anotaciones inválidas.");
    ids.add(item.id);
    if (item.shotName !== undefined && (typeof item.shotName !== "string" || item.shotName.length > 120)) throw new Error("Hay nombres de plano inválidos.");
    if (item.shotId !== undefined && (typeof item.shotId !== "string" || item.shotId.length > 120)) throw new Error("Hay identificadores de plano inválidos.");
    for (const field of shotValues.keys) {
      if (item[field] !== undefined && !shotValues.valid(item[field], field)) throw new Error(field === "shotValue" ? "Hay valores de plano inválidos." : `Hay datos de ${shotValues.fields[field].label.toLowerCase()} inválidos.`);
    }
    const clean = { id: item.id, type: item.type, page: item.page, color: item.color, shotId: item.shotId || item.id, shotName: (item.shotName || "").trim(), note: String(item.note || "").slice(0, 3000), createdAt: String(item.createdAt || "") };
    for (const field of shotValues.keys) clean[field] = item[field] || "";
    for (const key of shotValues.otherKeys) {
      const field = `${key}Other`;
      if (item[field] !== undefined && (typeof item[field] !== "string" || item[field].length > 140)) throw new Error("Hay especificaciones de Otro inválidas.");
      clean[field] = clean[key] === "other" ? (item[field] || "").trim() : "";
    }
    for (const [key, field] of Object.entries(shotValues.textFields)) {
      if (key !== "note" && item[key] !== undefined && (typeof item[key] !== "string" || item[key].length > field.max)) throw new Error(`Hay datos de ${field.label.toLowerCase()} inválidos.`);
      clean[key] = String(item[key] || "").slice(0, field.max);
    }
    if (item.shotOrder !== undefined) {
      if (!Number.isInteger(item.shotOrder) || item.shotOrder < 0 || item.shotOrder > 10000000) throw new Error("Hay órdenes de plano inválidos.");
      clean.shotOrder = item.shotOrder;
    }
    if (item.scriptSelection !== undefined && item.type === "line") clean.scriptSelection = PlanoShotScript.validateSelection(item.scriptSelection, pageCount);
    if (item.lineLabel !== undefined) {
      if (!item.lineLabel || !coordinate(item.lineLabel.t) || !["left", "right"].includes(item.lineLabel.side)) throw new Error("Hay posiciones de título de línea inválidas.");
      clean.lineLabel = { t: item.lineLabel.t, side: item.lineLabel.side };
    }
    if (item.labelPosition !== undefined) {
      const p = item.labelPosition;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 4 || p.y < -1 || p.y > 2) throw new Error("Hay posiciones de título inválidas.");
      clean.labelPosition = { x: p.x, y: p.y };
    }
    if (item.labelPinned !== undefined) {
      if (typeof item.labelPinned !== "boolean") throw new Error("Hay estados de posición de título inválidos.");
      if (item.labelPinned) clean.labelPinned = true;
    }
    if (item.labelUnrestricted !== undefined) {
      if (typeof item.labelUnrestricted !== "boolean") throw new Error("Hay modos de colocación de título inválidos.");
      if (item.labelUnrestricted) clean.labelUnrestricted = true;
    }
    if (item.type === "line") {
      if (!point(item.start) || !point(item.end)) throw new Error("Hay coordenadas de línea inválidas.");
      if (item.endPage !== undefined) {
        if (!Number.isInteger(item.endPage) || item.endPage < item.page || item.endPage > pageCount) throw new Error("Hay páginas finales de línea inválidas.");
        if (item.endPage > item.page && item.endPage - item.page + item.end.y - item.start.y <= 0) throw new Error("Hay líneas entre páginas sin longitud válida.");
        if (item.endPage !== item.page) clean.endPage = item.endPage;
      }
      clean.start = { x: item.start.x, y: item.start.y }; clean.end = { x: item.end.x, y: item.end.y };
    } else {
      if (!Array.isArray(item.rects) || !item.rects.length || item.rects.length > 5000 || item.rects.some(rect => !point(rect) || !coordinate(rect.width) || !coordinate(rect.height) || rect.x + rect.width > 1.001 || rect.y + rect.height > 1.001)) throw new Error("Hay coordenadas de resalte inválidas.");
      clean.rects = item.rects.map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })); clean.text = String(item.text || "").slice(0, 30000);
    }
    return clean;
  });
}
function readSavedNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(state.key) || "null");
    if (!saved) { $("#save-status").textContent = "Las notas se guardan en este navegador."; return []; }
    const notes = validateNotes(saved.annotations); $("#save-status").textContent = "✓ Anotaciones anteriores recuperadas"; return notes;
  } catch { $("#save-status").textContent = "No se recuperaron notas locales. Puedes importar una copia."; return []; }
}
function readSavedCorrections() {
  try { return PlanoCorrections.validate(JSON.parse(localStorage.getItem(state.key) || "null")?.corrections, state.pdf.numPages); }
  catch { message("No se recuperaron las correcciones guardadas. Puedes importar una copia de notas.", true); return []; }
}
function readSavedCrew() {
  try { return PlanoCrew.validate(JSON.parse(localStorage.getItem(state.key) || "null")?.crew); }
  catch { return {}; }
}
function readSavedProofreading() {
  try { return PlanoSpelling.validate(JSON.parse(localStorage.getItem(state.key) || "null")?.proofreading); }
  catch { return PlanoSpelling.validate(); }
}
let spellingJob = null;
function refreshSpelling(text = "") {
  $("#toggle-spelling").setAttribute("aria-pressed", String(state.proofreading.enabled));
  $("#toggle-spelling").textContent = `Ortografía y redacción del PDF: ${state.proofreading.enabled ? "activadas" : "desactivadas"}`;
  $("#spelling-status").textContent = text; $("#spelling-status").hidden = !text;
}
function cancelSpelling() { spellingJob?.controller.abort(); spellingJob = null; $("#retry-spelling").hidden = true; }
async function startSpelling() {
  if (!state.pdf || !state.proofreading.enabled || state.proofreading.dictionary === PlanoSpelling.version || spellingJob || globalThis.PlanoTestDisableSpelling) return;
  const job = { pdf: state.pdf, owner: PlanoAccounts.getUser()?.id, controller: new AbortController() }; spellingJob = job; refreshSpelling("Revisando ortografía y redacción en español…");
  const current = () => spellingJob === job && state.pdf === job.pdf && PlanoAccounts.getUser()?.id === job.owner && !job.controller.signal.aborted;
  try {
    const version = new URL($("script[src^='app.js']").src).search;
    const found = await PlanoSpelling.scan({ pages: state.pages, scenes: state.scenes, ignored: state.proofreading.ignored, signal: job.controller.signal, load: () => loadScript(`vendor/spanish-spelling.js${version}`) });
    while (current() && (!canSelectShots() || document.querySelector('dialog[open]'))) await new Promise(resolve => setTimeout(resolve, 300));
    if (!current()) return;
    const manual = state.corrections.filter(item => !PlanoCorrections.automatic(item));
    const ids = new Set(manual.map(item => item.id)), additions = [];
    let size = new TextEncoder().encode(JSON.stringify({ annotations: state.annotations, corrections: manual, crew: state.crew, proofreading: state.proofreading })).length;
    for (const item of found) {
      if (ids.has(item.id) || additions.length >= 200 || manual.length + additions.length >= 1000) continue;
      const correction = PlanoCorrections.validate([{ ...item, source: item.source || "spelling", createdAt: new Date().toISOString() }], state.pdf.numPages)[0];
      size += new TextEncoder().encode(JSON.stringify(correction)).length;
      if (size > 310000) break;
      additions.push(correction);
    }
    const changes = additions.length || manual.length !== state.corrections.length;
    if (changes) remember();
    state.proofreading.dictionary = PlanoSpelling.version; state.corrections = [...manual,...additions];
    changes ? changed() : saveNotes();
    refreshSpelling(additions.length ? `${additions.length} posibles errores señalados. Los nombres propios pueden ignorarse.` : "Revisión terminada.");
  } catch (error) {
    if (current() && error.name !== "AbortError") { refreshSpelling("No se pudo completar la revisión. Puedes reintentar."); $("#retry-spelling").hidden = false; }
  } finally { if (spellingJob === job) spellingJob = null; }
}
$("#toggle-spelling").addEventListener("click", () => {
  if (!canSelectShots()) return;
  cancelSpelling(); remember(); state.proofreading.enabled = !state.proofreading.enabled; state.proofreading.dictionary = "";
  if (!state.proofreading.enabled) state.corrections = state.corrections.filter(item => !PlanoCorrections.automatic(item));
  changed(); refreshSpelling(); if (state.proofreading.enabled) startSpelling();
});
$("#retry-spelling").addEventListener("click", startSpelling);
function orderedShots(items, indexes = new Map(state.annotations.map((item, i) => [item.id, i]))) {
  return [...items].sort((a, b) => (a.shotOrder ?? indexes.get(a.id)) - (b.shotOrder ?? indexes.get(b.id)));
}
function technicalSections() {
  const report = PlanoShotScript.report(state.annotations, state.pages);
  const indexes = new Map(state.annotations.map((item, i) => [item.id, i]));
  const groups = new Map();
  for (const item of state.annotations) {
    const id = sceneTools.sceneAt(state.scenes, item.page, annotationY(item))?.id || "intro";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  const scenes = [...(groups.has("intro") ? [{ id: "intro", number: null, title: state.scenes.length ? "Contenido previo" : "Guion" }] : []), ...state.scenes];
  return scenes.map(scene => ({ scene, items: orderedShots(groups.get(scene.id) || [], indexes).map(item => ({ ...item, ...report.get(item.shotId || item.id) })) }));
}
function refreshTechnicalScript() {
  for (const id of ['#export-excel', '#technical-export-excel']) $(id).disabled = !state.annotations.length || state.exporting;
  if (state.screen !== "editor" || state.stage !== "technical") return;
  PlanoTechnicalScript.render(technicalSections(), { displayName: annotationDisplayName, open: openShotDetails, commit: commitTechnicalField, remove: deleteTechnicalShot, history: state.history.length, future: state.future.length });
}
function commitTechnicalField(id, field, value, other = "", expected = null) {
  const item = state.annotations.find(note => note.id === id);
  if (!item || state.busy || state.exporting || state.pending || state.editing || state.details || state.drawing || state.lineGesture || state.highlightCorrection || state.pasteHighlight) return false;
  if (expected && ((item[field] || "") !== expected.value || (item[field + "Other"] || "") !== expected.other)) { message("Este campo cambió en la otra ventana. Revisa el valor actualizado antes de guardarlo.", true); return false; }
  const patch = {};
  if (field === "shotName") {
    if (typeof value !== "string" || !value.trim() || value.length > 120) return false;
    patch.shotName = value.trim();
  } else if (shotValues.keys.includes(field)) {
    if (!shotValues.valid(value, field) || value === "other" && (!other.trim() || other.length > 140)) return false;
    patch[field] = value;
    if (shotValues.otherKeys.includes(field)) patch[`${field}Other`] = value === "other" ? other.trim() : "";
  } else if (shotValues.textFields[field]) {
    if (typeof value !== "string" || value.length > shotValues.textFields[field].max) return false;
    patch[field] = value.trim();
  } else return false;
  if (Object.entries(patch).every(([key, next]) => (item[key] || "") === next)) return true;
  remember();
  for (const part of state.annotations.filter(note => (note.shotId || note.id) === (item.shotId || item.id))) Object.assign(part, patch);
  changed(); return true;
}
function deleteTechnicalShot(id) {
  if (!canSelectShots() || !PlanoTechnicalScript.finishEditing()) return false;
  const item = state.annotations.find(note => note.id === id); if (!item) return false;
  const shotId = item.shotId || item.id; remember();
  state.annotations = state.annotations.filter(note => (note.shotId || note.id) !== shotId);
  if (!state.annotations.some(note => note.id === state.selectedLine)) state.selectedLine = null;
  changed(); message("Plano eliminado. Puedes recuperarlo con Deshacer."); return true;
}
function reorderShots(sceneId, source, destination, after) {
  if (source === destination || state.pending || state.editing || state.lineGesture || state.highlightCorrection || state.pasteHighlight) return;
  const items = state.annotations.filter(item => (sceneTools.sceneAt(state.scenes, item.page, annotationY(item))?.id || "intro") === sceneId);
  const ids = [...new Set(orderedShots(items).map(item => item.shotId || item.id))], reordered = ids.filter(id => id !== source);
  if (!ids.includes(source) || !ids.includes(destination)) return;
  reordered.splice(reordered.indexOf(destination) + Number(after), 0, source);
  if (ids.every((id, i) => reordered[i] === id)) return;
  remember();
  for (const item of items) { const index = reordered.indexOf(item.shotId || item.id); if (index >= 0) item.shotOrder = index; }
  changed();
  const card = Array.from($("#annotations-list").querySelectorAll(".annotation-card")).find(node => node.dataset.shotId === source);
  card?.querySelector(".shot-reorder-handle")?.focus({ preventScroll: true });
}
function canSelectShots() {
  return Boolean(state.pdf) && !state.crewEditing && !preparingLinkedText && !state.busy && !state.exporting && !state.pending && !state.editing && !state.details && !state.drawing && !state.lineGesture && !state.highlightCorrection && !state.pasteHighlight;
}
const crewEditor = PlanoCrew.setup({
  get: () => state.crew,
  canEdit: () => canSelectShots() && PlanoTechnicalScript.finishEditing(),
  toggle: open => { state.crewEditing = open; syncTechnicalWindowLock(); },
  save: crew => { remember(); state.crew = crew; changed(); message("Equipo guardado en este guion."); }
});
for (const id of ["#edit-crew", "#technical-crew"]) $(id).addEventListener("click", () => crewEditor.open());
function syncShotSelection() {
  // Una selección representa planos completos, incluidos todos sus tramos.
  const ids = new Set(state.annotations.map(item => item.shotId || item.id));
  for (const id of state.selectedShots) if (!ids.has(id)) state.selectedShots.delete(id);
  const count = state.selectedShots.size, all = $("#select-all-shots");
  all.checked = Boolean(ids.size) && count === ids.size;
  all.indeterminate = count > 0 && count < ids.size; all.disabled = !ids.size;
  $("#shot-selection-count").textContent = count ? `${count} ${count === 1 ? "seleccionado" : "seleccionados"}` : "Seleccionar planos";
  $("#shot-selection-actions").hidden = !count;
  for (const card of $("#annotations-list").querySelectorAll(".annotation-card")) {
    const selected = state.selectedShots.has(card.dataset.shotId);
    card.classList.toggle("is-batch-selected", selected);
    card.querySelector(".shot-select").checked = selected;
  }
  const colors = new Set(state.annotations.filter(item => state.selectedShots.has(item.shotId || item.id)).map(item => item.color.toLowerCase()));
  if (colors.size) $("#batch-shot-color").value = colors.values().next().value;
  colorPalette.syncLaunches();
  const launch = $("#batch-color-launch");
  launch.classList.toggle("is-mixed", colors.size > 1);
  launch.setAttribute("aria-label", `Cambiar color de ${count} ${count === 1 ? "plano seleccionado" : "planos seleccionados"}${colors.size > 1 ? "; colores distintos" : ""}`);
  launch.title = colors.size > 1 ? "Colores distintos · Cambiar color de la selección" : "Cambiar color de la selección";
}
function clearShotSelection() {
  state.selectedShots.clear();
  if ($("#batch-color-launch").getAttribute("aria-expanded") === "true") PlanoPopover.hide($("#color-picker-dialog"));
  syncShotSelection();
}
function colorSelectedShots(color) {
  if (!canSelectShots() || !/^#[0-9a-f]{6}$/i.test(color)) return;
  const selected = state.annotations.filter(item => state.selectedShots.has(item.shotId || item.id));
  color = color.toLowerCase();
  if (!selected.some(item => item.color.toLowerCase() !== color)) return;
  remember();
  for (const item of selected) item.color = color;
  changed();
}
$("#select-all-shots").addEventListener("change", event => {
  if (canSelectShots()) state.selectedShots = event.target.checked ? new Set(state.annotations.map(item => item.shotId || item.id)) : new Set();
  syncShotSelection();
});
$("#clear-shot-selection").addEventListener("click", () => { if (canSelectShots()) { clearShotSelection(); $("#select-all-shots").focus({ preventScroll: true }); } });
$("#batch-shot-color").addEventListener("input", event => colorSelectedShots(event.target.value));

function refreshAnnotations() {
  refreshCorrections();
  refreshTechnicalScript();
  const indexes = new Map(state.annotations.map((item, i) => [item.id, i]));
  const list = $("#annotations-list"); const visible = state.annotations;
  const openGroups = new Map(Array.from(list.querySelectorAll(".annotation-scene-group")).map(group => [group.dataset.scene, { open: group.open, count: Number(group.dataset.count) }]));
  $("#annotation-count").textContent = visible.length;
  $("#highlight-count").textContent = visible.filter(item => item.type === "highlight").length;
  $("#line-count").textContent = visible.filter(item => item.type === "line").length;
  $("#highlight-count").parentElement.lastChild.textContent = $("#highlight-count").textContent === "1" ? " resalte" : " resaltes";
  $("#line-count").parentElement.lastChild.textContent = $("#line-count").textContent === "1" ? " línea" : " líneas";
  $("#undo-button").disabled = !state.history.length; $("#redo-button").disabled = !state.future.length;
  list.replaceChildren();
  if (!visible.length && !state.scenes.length) {
    const empty = document.createElement("div"); empty.className = "empty-annotations";
    const icon = document.createElement("span"); icon.textContent = "╱";
    const title = document.createElement("strong"); title.textContent = "Tu cobertura empieza aquí";
    const text = document.createElement("p"); text.textContent = "Resalta una frase o traza una línea y nombra el plano. Abre su tarjeta para ver la ficha completa.";
    empty.append(icon, title, text); list.append(empty); syncShotSelection(); return;
  }
  const groups = new Map();
  for (const item of visible) {
    const id = sceneTools.sceneAt(state.scenes, item.page, annotationY(item))?.id || "intro";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  const sections = [...(groups.has("intro") ? [{ id: "intro", number: null, title: state.scenes.length ? "Portada y contenido previo" : "Guion" }] : []), ...state.scenes];
  for (const scene of sections) {
    const items = orderedShots(groups.get(scene.id) || [], indexes);
    const section = document.createElement("details"); section.className = "annotation-scene-group"; section.dataset.scene = scene.id;
    const previous = openGroups.get(scene.id);
    section.open = previous ? previous.open || previous.count === 0 && items.length > 0 : items.length > 0 || scene.id === state.scene;
    section.dataset.count = items.length;
    const summary = document.createElement("summary"); summary.className = "annotation-scene-heading";
    const caption = document.createElement("span"); caption.className = "annotation-scene-caption";
    const name = document.createElement("strong"); name.textContent = scene.number ? `Escena ${String(scene.number).padStart(2, "0")}` : "Sin escena";
    const title = document.createElement("span"); title.textContent = scene.title; caption.append(name, title);
    const count = document.createElement("span"); count.className = "scene-shot-count"; count.textContent = new Set(items.map(item => item.shotId || item.id)).size;
    count.title = "Planos en esta escena"; summary.append(caption, count); section.append(summary);
    const cards = document.createElement("div"); cards.className = "scene-annotation-cards"; section.append(cards); list.append(section);
    if (!items.length) {
      const empty = document.createElement("p"); empty.className = "scene-no-shots"; empty.textContent = "Sin planos todavía."; cards.append(empty);
    }
    for (const item of items) {
    const card = document.createElement("article"); card.className = "annotation-card"; card.dataset.id = item.id; card.style.setProperty("--annotation-color", item.color);
    card.dataset.shotId = item.shotId || item.id;
    card.addEventListener("click", event => { if (!event.target.closest("button,input,label")) openShotDetails(item); });
    const heading = document.createElement("div"); heading.className = "annotation-card-heading";
    const select = document.createElement("input"); select.type = "checkbox"; select.className = "shot-select";
    select.setAttribute("aria-label", `Seleccionar plano ${annotationDisplayName(item)}`); select.title = "Seleccionar para cambiar el color en conjunto";
    select.addEventListener("change", () => {
      if (canSelectShots()) {
        const id = item.shotId || item.id;
        if (select.checked) state.selectedShots.add(id); else state.selectedShots.delete(id);
      }
      syncShotSelection();
    });
    const link = document.createElement("button"); link.className = "annotation-jump"; link.type = "button";
    link.textContent = annotationDisplayName(item);
    link.title = "Abrir ficha completa del plano"; link.setAttribute("aria-label", `Abrir ficha del plano: ${link.textContent}`); link.addEventListener("click", () => openShotDetails(item));
    const edit = document.createElement("button"); edit.className = "edit-annotation"; edit.type = "button";
    edit.title = "Editar nombre, ficha técnica, color e información"; edit.setAttribute("aria-label", `Editar plano: ${link.textContent}`);
    const editIcon = document.createElementNS(SVG_NS, "svg"); const editUse = document.createElementNS(SVG_NS, "use"); editUse.setAttribute("href", "#i-edit"); editIcon.append(editUse); edit.append(editIcon);
    edit.addEventListener("click", () => openShotEditor(item));
    const locate = document.createElement("button"); locate.className = "locate-annotation"; locate.type = "button"; locate.title = "Ver en el guion"; locate.setAttribute("aria-label", `Localizar plano: ${link.textContent}`); locate.append(shotIcon("locate")); locate.addEventListener("click", () => jumpToAnnotation(item));
    const remove = document.createElement("button"); remove.className = "delete-annotation"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Eliminar ${link.textContent}`);
    remove.addEventListener("click", () => { remember(); state.annotations = state.annotations.filter(note => note.id !== item.id); changed(); });
    const reorder = document.createElement("button"); reorder.type = "button"; reorder.className = "shot-reorder-handle";
    reorder.title = "Arrastrar para ordenar dentro de la escena. Alt + flechas arriba/abajo."; reorder.setAttribute("aria-label", `Ordenar plano ${link.textContent}. Alt y flechas arriba o abajo.`); reorder.append(shotIcon("drag"));
    PlanoShotOrder.bind(reorder, card, (source, target, after) => reorderShots(scene.id, source, target, after));
    heading.append(reorder, select, link);
    if (item.note?.trim()) {
      const note = document.createElement("span"); note.className = "annotation-has-notes"; note.title = "Este plano tiene notas"; note.setAttribute("role", "img"); note.setAttribute("aria-label", "Este plano tiene notas"); note.append(shotIcon("note")); heading.append(note);
    }
    const specs = document.createElement("p"); specs.className = "annotation-specs";
    for (const key of ["shotValue", "shotAngle", "shotLens"]) {
      const value = document.createElement("span"); value.dataset.shotField = key;
      value.textContent = key === "shotValue" ? item[key] || "—" : shotValues.display(item, key);
      value.title = key === "shotValue" ? shotValues.fullName(item[key]) : shotValues.fields[key].label;
      specs.append(value);
    }
    const description = document.createElement("p"); description.className = "annotation-description";
    const chars = Array.from((item.description || "").replace(/\s+/g, " ").trim());
    description.textContent = chars.length > 160 ? `${chars.slice(0, 159).join("")}…` : chars.join("") || "Añade una descripción del plano…";
    description.classList.toggle("is-empty", !chars.length);
    const footer = document.createElement("div"); footer.className = "annotation-card-footer";
    const kind = document.createElement("span"); kind.className = "annotation-kind"; kind.textContent = `${item.type === "line" ? "Línea" : "Resalte"} · ${annotationPages(item)}`;
    const actions = document.createElement("div"); actions.className = "annotation-card-actions"; actions.append(locate, edit, remove); footer.append(kind, actions);
    card.append(heading, specs, description, footer);
    cards.append(card);
    }
  }
  syncShotSelection();
}
async function jumpToAnnotation(item) {
  hideHighlightAction();
  if (state.stage !== "coverage") await switchStage("coverage");
  const y = annotationY(item);
  if (state.scene !== "print" && !sceneTools.sceneAt(state.scenes, item.page, y)) {
    state.scene = "print"; $("#scene-select").value = "print"; refreshSegments();
  }
  let index = state.segments.findIndex(segment => segment.page === item.page && y >= segment.top && y <= segment.bottom);
  const changedScene = index < 0;
  if (index < 0) { state.scene = "all"; $("#scene-select").value = "all"; refreshSegments(); index = state.segments.findIndex(segment => segment.page === item.page); }
  if (changedScene || !contextAt({ page: item.page, y })) await renderDocument({ anchor: { page: item.page, y } });
  const context = contextAt({ page: item.page, y });
  if (!context) return;
  scrollToPosition({ page: item.page, y: Math.max(context.segment.top, y - 80 / context.viewport.height) });
  await ensurePage(context); refreshAnnotations(); updatePageIndicator();
  const group = Array.from(context.svg?.children || []).find(node => node.dataset.annotationId === item.id);
  group?.classList.add("annotation-flash"); setTimeout(() => group?.classList.remove("annotation-flash"), 1600);
  const label = Array.from(context.slot.querySelectorAll(".document-shot-label")).find(node => node.dataset.annotationId === item.id);
  label?.classList.add("annotation-flash"); setTimeout(() => label?.classList.remove("annotation-flash"), 1600);
  if (smallScreen.matches) setPanelOpen(false);
  $("#pdf-stage").focus({ preventScroll: true });
}
function undo(redo = false) {
  if (state.pasteHighlight) return;
  if (state.stage === "technical" && !PlanoTechnicalScript.finishEditing()) return;
  hideHighlightAction();
  if (state.highlightCorrection) cancelHighlightCorrection();
  const transforming = Boolean(state.lineGesture);
  cancelLineGesture(false);
  const source = redo ? state.future : state.history; const target = redo ? state.history : state.future;
  if (!source.length) { if (transforming) drawAnnotations(); return; }
  target.push(documentSnapshot()); const restored = source.pop();
  state.annotations = Array.isArray(restored) ? restored : restored.annotations;
  cancelSpelling(); state.corrections = Array.isArray(restored) ? [] : restored.corrections || []; state.crew = restored.crew || state.crew; state.proofreading = restored.proofreading || state.proofreading; refreshSpelling(); changed();
}
function closeDocument() {
  if (state.exporting) return;
  PlanoTechnicalWindow.invalidate();
  crewEditor.close();
  cancelSpelling();
  PlanoSpelling.stop();
  PlanoTechnicalScript.clear();
  cancelPasteChoice(); finishPastedHighlight(); copiedShot = null;
  clearShotSelection();
  hideHighlightAction();
  cancelHighlightCorrection();
  state.selectedLine = null;
  state.pending = null;
  state.editing = null;
  state.details = null;
  if ($("#shot-details-dialog").open) $("#shot-details-dialog").close();
  if ($("#edit-shot-dialog").open) $("#edit-shot-dialog").close("");
  if ($("#shot-name-dialog").open) $("#shot-name-dialog").close("");
  ++state.loadId; cancelRendering();
  state.loading?.destroy().catch(() => {}); state.pdf?.destroy().catch(() => {});
  if (state.url) URL.revokeObjectURL(state.url);
  Object.assign(state, { pdf: null, loading: null, url: null, file: null, key: null, cloudProject: null, thumbnail: null, annotations: [], corrections: [], crew: {}, proofreading: PlanoSpelling.validate(), crewEditing: false, pages: [], scenes: [], viewer: null, viewAnchor: null, history: [], future: [] });
  refreshCorrections();
  syncShotSelection();
  $("#pdf-container").replaceChildren(); $("#technical-table-body").replaceChildren(); $("#open-document").removeAttribute("href");
  busy(false); message(""); status("Sin documento"); showScreen("import"); $("#upload-button").focus();
}

$("#file-input").addEventListener("change", event => upload(event.target.files[0]));
const smallScreen = window.matchMedia("(max-width: 900px)");
function setPanelOpen(open) {
  state.panelOpen = open;
  $("#annotations-panel").hidden = !open;
  document.body.classList.toggle("annotations-collapsed", !open);
  $("#toggle-annotations").setAttribute("aria-expanded", String(open));
  $("#toggle-annotations").title = open ? "Ocultar anotaciones" : "Mostrar anotaciones";
  $("#panel-backdrop").hidden = !open || !smallScreen.matches || state.screen !== "editor" || state.stage !== "coverage";
}
$("#toggle-annotations").addEventListener("click", () => setPanelOpen(!state.panelOpen));
$("#panel-backdrop").addEventListener("click", () => { setPanelOpen(false); $("#toggle-annotations").focus(); });
smallScreen.addEventListener("change", () => { if (state.screen === "editor") setPanelOpen(!smallScreen.matches); });
for (const id of ["#editor-home", "#menu-home"]) $(id).addEventListener("click", () => { message(""); showScreen("import"); });
$(".project-menu-content").addEventListener("click", event => { if (event.target.closest("button,a")) $("#project-menu").open = false; });
document.addEventListener("pointerdown", event => { if (!$("#project-menu").contains(event.target)) $("#project-menu").open = false; });
document.addEventListener("pointerdown", event => { if (state.highlightAction && !$("#highlight-action").contains(event.target)) hideHighlightAction(); });
document.addEventListener("pointerdown", event => { if (state.titleMenu && !$("#title-position-menu").contains(event.target)) hideTitlePositionMenu(); });
document.addEventListener("pointerdown", event => { if (state.selectedLine && !state.lineGesture && !event.target.closest("#selected-line-actions")) { state.selectedLine = null; drawAnnotations(); } });
let scrollFrame = 0;
$("#pdf-stage").addEventListener("scroll", () => {
  hideHighlightAction();
  refreshCoverageGesture();
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updatePageIndicator(); });
}, { passive: true });
for (const id of ["#upload-button", "#replace-button"]) $(id).addEventListener("click", () => $("#file-input").click());
$("#remove-button").addEventListener("click", async () => {
  try { if (PlanoCloud.configured) { if (!PlanoTechnicalScript.finishEditing()) return; await PlanoCloud.flush(); PlanoCloud.detach(); } closeDocument(); }
  catch (error) { message(error.message, true); PlanoCloudLibrary.open(); }
});
$("#nav-import").addEventListener("click", () => { message(""); showScreen("import"); });
for (const id of ["#nav-editor", "#return-editor"]) $(id).addEventListener("click", () => { message(""); showScreen("editor"); });
$("#scene-select").addEventListener("change", event => {
  const anchor = ["all", "editing"].includes(event.target.value) ? capturePosition() : null;
  state.scene = event.target.value; state.segmentIndex = 0; refreshSegments(); renderDocument({ anchor }); refreshAnnotations(); if (smallScreen.matches) setPanelOpen(false);
});
for (const button of document.querySelectorAll("button[data-tool]")) button.addEventListener("click", () => setTool(button.dataset.tool));
$("#annotation-color").addEventListener("input", drawAnnotations);
$("#apply-highlight").addEventListener("pointerdown", event => event.preventDefault());
$("#apply-highlight").addEventListener("click", highlightSelection);
document.addEventListener("selectionchange", updateSelectionButton);
$("#undo-button").addEventListener("click", () => undo()); $("#redo-button").addEventListener("click", () => undo(true));
for (const [id, delta] of [["#zoom-in", 0.2], ["#zoom-out", -0.2]]) $(id).addEventListener("click", () => { state.fit = false; state.zoom = Math.max(0.25, Math.min(3, state.zoom + delta)); renderDocument({ preservePosition: true }); });
$("#fit-width").addEventListener("click", () => { state.fit = true; renderDocument({ preservePosition: true }); });
let exportEngine;
async function exportCoveragePdf(includeTechnical = false) {
  if (!state.pdf || state.busy || state.exporting) return;
  if (!PlanoTechnicalScript.finishEditing()) return;
  if (state.pending || state.editing || state.drawing || state.lineGesture || state.highlightCorrection || state.pasteHighlight) {
    message("Termina o cancela la edición del plano antes de exportar.", true); return;
  }
  const snapshot = { source: state.file, pdf: state.pdf, annotations: [...state.annotations.map(item => ({ ...structuredClone(item), shotName: annotationDisplayName(item) })), ...PlanoCorrections.annotations(structuredClone(state.corrections))], scenes: structuredClone(state.scenes), displayName: item => item.shotName, onProgress: text => message(text) };
  const technical = includeTechnical ? technicalExportSnapshot() : null;
  const name = `${state.file.name.replace(/\.pdf$/i, "")}-${includeTechnical ? "completo" : "cobertura"}.pdf`, button = $(includeTechnical ? "#export-all" : "#export-pdf"), previous = button.textContent;
  state.exporting = true; busy(true); $("#export-pdf").disabled = true; $("#export-all").disabled = true; $("#remove-button").disabled = true; button.textContent = "Exportando PDF…";
  $("#project-menu").open = false; hideHighlightAction();
  try {
    message("Preparando PDF con cobertura…");
    if ((includeTechnical || snapshot.annotations.length) && !window.PDFLib) {
      if (!exportEngine) exportEngine = loadScript("vendor/pdf-lib.min.js").catch(error => { exportEngine = null; throw error; });
      await exportEngine;
    }
    if (includeTechnical) {
      const version = new URL($("script[src^='app.js']").src).search;
      await Promise.all([prepareExcelExport(), loadScript(`all-export.js${version}`)]);
    }
    const result = includeTechnical ? await PlanoAllExport.run({ coverage: snapshot, technical, onProgress: snapshot.onProgress }) : await PlanoPdfExport.run(snapshot);
    const url = URL.createObjectURL(new Blob([result.bytes], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.hidden = true; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message(includeTechnical ? `PDF completo descargado: guion con cobertura y ${result.technicalPages} ${result.technicalPages === 1 ? "página horizontal" : "páginas horizontales"} de guion técnico.` : result.references ? "PDF descargado. Los nombres sin espacio libre están en las referencias al final." : "PDF con cobertura descargado.");
  } catch (error) {
    message(`No se pudo exportar el PDF${includeTechnical ? " completo" : ""}. ${error.message || "Inténtalo de nuevo."}`, true);
  } finally {
    state.exporting = false; busy(false); $("#export-pdf").disabled = false; $("#export-all").disabled = false; $("#remove-button").disabled = false; button.textContent = previous;
    for (const id of ['#export-excel', '#technical-export-excel']) $(id).disabled = !state.annotations.length;
  }
}
$("#export-pdf").addEventListener("click", () => exportCoveragePdf());
$("#export-all").addEventListener("click", () => exportCoveragePdf(true));
let excelEngine;
function prepareExcelExport() {
  if (!excelEngine) excelEngine = Promise.all([loadScript("vendor/exceljs.min.js"), loadScript("vendor/excel-template.js")]).catch(error => { excelEngine = null; throw error; });
  return excelEngine;
}
function technicalExportSnapshot() {
  return { sections: structuredClone(technicalSections()).map(section => ({ ...section, items: section.items.map(item => ({ ...item, shotName: annotationDisplayName(item) })) })), crew: structuredClone(state.crew), fileName: state.file.name, displayName: item => item.shotName, values: shotValues, onProgress: text => message(text) };
}
async function exportTechnicalExcel() {
  if (!state.pdf || state.busy || state.exporting || !PlanoTechnicalScript.finishEditing()) return;
  if (state.pending || state.editing || state.drawing || state.lineGesture || state.highlightCorrection || state.pasteHighlight) {
    message("Termina o cancela la edición del plano antes de exportar.", true); return;
  }
  if (!state.annotations.length) { message("Añade al menos un plano para exportar el guion técnico.", true); return; }
  const snapshot = technicalExportSnapshot();
  const buttons = [$("#export-excel"), $("#technical-export-excel")];
  state.exporting = true; busy(true); buttons.forEach(button => button.disabled = true); $("#remove-button").disabled = true;
  $("#project-menu").open = false; hideHighlightAction();
  try {
    message("Preparando guion técnico en Excel…");
    await prepareExcelExport();
    const result = await PlanoExcelExport.run(snapshot);
    const url = URL.createObjectURL(new Blob([result.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = `${snapshot.fileName.replace(/\.pdf$/i, "")}-guion-tecnico.xlsx`; link.hidden = true;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    message(`Excel descargado: ${result.shots} ${result.shots === 1 ? "plano" : "planos"} en ${result.scenes} ${result.scenes === 1 ? "escena" : "escenas"}.`);
  } catch (error) {
    message(`No se pudo exportar el Excel. ${error.message || "Inténtalo de nuevo."}`, true);
  } finally {
    state.exporting = false; busy(false); buttons.forEach(button => button.disabled = !state.annotations.length); $("#remove-button").disabled = false;
  }
}
for (const id of ["#export-excel", "#technical-export-excel"]) $(id).addEventListener("click", exportTechnicalExcel);
$("#save-backup").addEventListener("click", () => {
  const payload = { app: "PLANO", version: 1, fingerprint: state.fingerprint, fileName: state.file.name, annotations: state.annotations, corrections: state.corrections, crew: state.crew, proofreading: state.proofreading };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${state.file.name.replace(/\.pdf$/i, "")}-notas-plano.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("#restore-backup").addEventListener("click", () => $("#backup-input").click());
$("#backup-input").addEventListener("change", async event => {
  const file = event.target.files[0]; const pdf = state.pdf;
  try {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error("La copia supera los 10 MB.");
    const data = JSON.parse(await file.text()); if (state.pdf !== pdf) return;
    if (data.app !== "PLANO" || data.version !== 1 || data.fingerprint !== state.fingerprint) throw new Error("Estas notas no corresponden al PDF abierto.");
    const imported = validateNotes(data.annotations), corrections = PlanoCorrections.validate(data.corrections, state.pdf.numPages), crew = data.crew === undefined ? state.crew : PlanoCrew.validate(data.crew), proofreading = data.proofreading === undefined ? state.proofreading : PlanoSpelling.validate(data.proofreading); cancelSpelling(); remember();
    const existingIds = new Set(state.annotations.map(item => item.id)); const added = imported.filter(item => !existingIds.has(item.id));
    const correctionIds = new Set(state.corrections.map(item => item.id)), newCorrections = corrections.filter(item => !correctionIds.has(item.id));
    state.annotations.push(...added); state.corrections.push(...newCorrections); state.crew = crew; state.proofreading = proofreading; refreshSpelling(); changed(); message(`${added.length} anotaciones${newCorrections.length ? ` y ${newCorrections.length} correcciones` : ""} importadas. Las notas que ya tenías se conservaron.`);
  } catch (error) { message(`No se pudieron importar las notas: ${error.message}`, true); }
  finally { event.target.value = ""; }
});
document.addEventListener("keydown", event => {
  if (document.querySelector(".compact-popover:popover-open")) return;
  if (document.querySelector("dialog[open]")) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (event.key === "Escape") {
    if (state.activeCorrection) { hideCorrectionAction(); $("#pdf-stage").focus({ preventScroll: true }); return; }
    if (state.highlightAction) { hideHighlightAction(); $("#pdf-stage").focus({ preventScroll: true }); return; }
    if (state.highlightCorrection) { cancelHighlightCorrection(); window.getSelection()?.removeAllRanges(); return; }
    $("#project-menu").open = false;
    if (smallScreen.matches && state.panelOpen) { setPanelOpen(false); $("#toggle-annotations").focus(); }
    cancelDrawing(false); setTool("select"); return;
  }
  if (!state.pdf || state.screen !== "editor") return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
  else if (state.stage === "coverage" && !event.ctrlKey && !event.metaKey && !event.altKey) { const tools = { v: "select", h: "highlight", l: "line", r: "correction" }; if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]); }
});
let resizeTimer; let previousWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width); if (!width || width === previousWidth) return;
  previousWidth = width; clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.fit && Math.abs($("#pdf-stage").clientWidth - state.renderWidth) > 1) renderDocument({ preservePosition: true });
  }, 180);
}).observe($("#pdf-stage"));
let dragDepth = 0; const workspace = $(".script-workspace");
const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes("Files");
function clearDrag() { dragDepth = 0; workspace.classList.remove("drag-over"); $("#drop-zone").classList.remove("drag-over"); }
workspace.addEventListener("dragenter", event => { if (hasFiles(event)) { event.preventDefault(); dragDepth++; workspace.classList.add("drag-over"); $("#drop-zone").classList.add("drag-over"); } });
workspace.addEventListener("dragleave", () => { if (--dragDepth <= 0) clearDrag(); });
workspace.addEventListener("dragover", event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
workspace.addEventListener("drop", event => {
  event.preventDefault(); clearDrag(); const files = event.dataTransfer?.files; if (!files?.length) return;
  if (files.length > 1) message("Selecciona un solo guion PDF a la vez.", true); else upload(files[0]);
});
for (const name of ["dragover", "drop"]) window.addEventListener(name, event => { if (hasFiles(event)) event.preventDefault(); if (name === "drop") clearDrag(); });
window.addEventListener("blur", () => { clearDrag(); cancelLineGesture(); }); window.addEventListener("dragend", clearDrag);
window.addEventListener("beforeunload", () => { if (state.url) URL.revokeObjectURL(state.url); });

function syncTechnicalWindowLock() { PlanoTechnicalWindow.lock(!canSelectShots()); }
PlanoTechnicalWindow.configure({
  key: () => state.pdf,
  canEdit: () => Boolean(PlanoAccounts.getUser()) && canSelectShots(),
  snapshot: () => ({
    name: state.file?.name || "Guion técnico", sections: structuredClone(technicalSections()).map(section => ({ ...section, items: section.items.map(item => ({ ...item, shotName: annotationDisplayName(item) })) })),
    history: state.history.length, future: state.future.length, locked: !canSelectShots(),
    theme: { style: document.documentElement.style.cssText, mode: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette }
  }),
  commit: commitTechnicalField, remove: deleteTechnicalShot, undo: redo => { undo(redo); return true; },
  open: item => { window.focus(); openShotDetails(item); syncTechnicalWindowLock(); }, export: exportTechnicalExcel, crew: () => { window.focus(); crewEditor.open(); }
});
const technicalWindowMenu = document.createElement("div"); technicalWindowMenu.id = "technical-window-menu"; technicalWindowMenu.className = "technical-window-menu compact-popover"; technicalWindowMenu.setAttribute("popover", "auto"); technicalWindowMenu.setAttribute("role", "menu");
const openTechnicalWindow = document.createElement("button"); openTechnicalWindow.type = "button"; openTechnicalWindow.textContent = "Abrir en otra ventana"; openTechnicalWindow.setAttribute("role", "menuitem"); technicalWindowMenu.append(openTechnicalWindow); document.body.append(technicalWindowMenu);
$("#stage-tabs [data-stage='technical']").title = "Guion técnico · Clic derecho para abrir en otra ventana";
$("#stage-tabs [data-stage='technical']").addEventListener("contextmenu", event => {
  event.preventDefault(); if (!state.pdf || state.pasteHighlight) return;
  PlanoPopover.show(technicalWindowMenu, { x: event.clientX, y: event.clientY }); openTechnicalWindow.focus();
});
openTechnicalWindow.addEventListener("click", () => {
  PlanoPopover.hide(technicalWindowMenu);
  if (!PlanoTechnicalScript.finishEditing()) return;
  if (!PlanoTechnicalWindow.open()) message("No se pudo abrir la ventana. Termina la edición pendiente o permite las ventanas emergentes para este sitio.", true);
});

// Cambiar de cuenta cierra el documento y su historial antes de activar el nuevo espacio.
PlanoAccounts.connectWorkspace({
  canChange: () => !state.busy && !state.exporting && !state.pending && !state.editing && !state.lineGesture && !state.highlightCorrection && !state.pasteHighlight && PlanoTechnicalScript.finishEditing(),
  beforeChange: async () => { await globalThis.PlanoAccountAppearance?.flush(); try { if (PlanoCloud.configured) await PlanoCloud.flush(); } catch { throw Object.assign(new Error("Cloud save pending"), { code: "plano/cloud-unsaved" }); } },
  change: async nextOwner => {
    const shell = $(".app-shell"); shell.inert = true;
    try {
      // Las exportaciones ya capturaron sus datos; terminan antes de destruir el PDF.
      while (state.exporting) await new Promise(resolve => setTimeout(resolve, 100));
      if (state.pdf && !PlanoCloud.configured) saveNotes();
      PlanoCloudLibrary.closeOnIdentity(); PlanoCloud.changeOwner(nextOwner);
      PlanoTechnicalScript.finishEditing(false);
      closeDocument();
      $("#annotations-list").replaceChildren();
      $("#technical-table-body").replaceChildren();
    } finally { shell.inert = !nextOwner; }
  }
});

PlanoCloudLibrary.init({
  currentProject: currentLibraryProject,
  canRename: () => !state.busy && !state.exporting && !state.pending && !state.editing && !state.lineGesture && !state.highlightCorrection && !state.pasteHighlight && PlanoTechnicalScript.finishEditing(),
  preview: buildLibraryPreview,
  open: async id => { if (state.busy || state.exporting || state.pending || state.editing || state.pasteHighlight || !PlanoTechnicalScript.finishEditing()) throw new Error("Termina la edición o exportación actual antes de abrir otro guion."); if (id === "local") { showScreen("editor"); return; } const loaded = await PlanoCloud.open(id); if (!await upload(loaded.file, { project: loaded.project })) throw new Error("No se pudo abrir el proyecto. Comprueba el mensaje del editor e inténtalo de nuevo."); },
  renameLocal: name => { renameDocumentFile(name); return currentLibraryProject(); },
  renamed: project => { if (state.cloudProject?.id !== project.id) return; state.cloudProject = project; renameDocumentFile(project.name); },
  deleted: id => { if (state.cloudProject?.id === id) closeDocument(); },
  reload: project => { if (!state.pdf || state.cloudProject?.id !== project?.id) return; const notes = validateNotes(project.payload.annotations), corrections = PlanoCorrections.validate(project.payload.corrections, state.pdf.numPages), crew = PlanoCrew.validate(project.payload.crew), proofreading = PlanoSpelling.validate(project.payload.proofreading); cancelSpelling(); state.annotations = notes; state.corrections = corrections; state.crew = crew; state.proofreading = proofreading; refreshSpelling(); state.cloudProject = project; state.history = []; state.future = []; refreshSegments(); refreshAnnotations(); PlanoTechnicalWindow.publish(); if (state.stage === "coverage") renderDocument({ preservePosition: true }); },
  exportDraft: () => { if (!state.pdf) return false; $("#save-backup").click(); return true; }
});
