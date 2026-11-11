/* Compatibilidad con copias JSON antiguas. El flujo habitual de proyectos usa .plano. */
(function(root){
 'use strict';
 function save(){
  const payload = { app: "PLANO", version: 1, fingerprint: state.fingerprint, fileName: state.file.name, annotations: state.annotations, corrections: state.corrections, crew: state.crew, proofreading: state.proofreading };
  if (state.screenplay) payload.screenplay = state.screenplay;
  if (state.projectInfo) payload.projectInfo = state.projectInfo;
  if (state.screenplayVersions.length) payload.screenplayVersions = state.screenplayVersions;
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${state.file.name.replace(/\.pdf$/i, "")}-notas-plano.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 async function importNotes({input,file,pdf}){
  try {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error("La copia supera los 10 MB.");
    const data = JSON.parse(await file.text()); if (state.pdf !== pdf) return;
    if (data.app !== "PLANO" || data.version !== 1 || data.fingerprint !== state.fingerprint) throw new Error("Estas notas no corresponden al guion abierto.");
    if (data.screenplay && (data.screenplayCoverage || JSON.stringify(PlanoScreenplay.validate(data.screenplay))!==JSON.stringify(state.screenplay))) { await restore(data); return; }
    const importedWriter = PlanoScreenplay.validate(data.screenplay);PlanoScreenplay.validate(data.screenplayCoverage);
    const imported = validateNotes(data.annotations), corrections = PlanoCorrections.validate(data.corrections, state.pdf.numPages), crew = data.crew === undefined ? state.crew : PlanoCrew.validate(data.crew), proofreading = data.proofreading === undefined ? state.proofreading : PlanoSpelling.validate(data.proofreading); cancelSpelling(); remember();
    const existingIds = new Set(state.annotations.map(item => item.id)); const added = imported.filter(item => !existingIds.has(item.id));
    const correctionIds = new Set(state.corrections.map(item => item.id)), newCorrections = corrections.filter(item => !correctionIds.has(item.id));
    state.annotations.push(...added); state.corrections.push(...newCorrections); state.crew = crew; state.proofreading = proofreading;
    if(data.projectInfo!==undefined)state.projectInfo=PlanoProjectInfo.validate(data.projectInfo);
    if (importedWriter) { state.screenplay = importedWriter; PlanoWriter.close(); if (state.stage === "writing") await PlanoWriter.open(state.screenplay); }
    refreshSpelling(); changed(); message(`${added.length} anotaciones${newCorrections.length ? ` y ${newCorrections.length} correcciones` : ""} importadas. Las notas que ya tenías se conservaron.`);
  } catch (error) { message(`No se pudieron importar las notas: ${error.message}`, true); }
  finally { input.value = ""; }
 }
async function restore(data){
  const owner=PlanoAccounts.getUser()?.id,document=state.pdf,coverage=PlanoScreenplay.validate(data.screenplayCoverage);
  let screenplay=PlanoScreenplay.validate(data.screenplay),info=PlanoProjectInfo.validate(data.projectInfo===undefined?state.projectInfo:data.projectInfo);
  const history=new Map(PlanoScreenplayVersions.validate(data.screenplayVersions).map(entry=>[entry.number,entry]));
  for(const entry of state.screenplayVersions)history.set(entry.number,entry);
  const versions=[...history.values()].sort((a,b)=>a.number-b.number),latest=versions.at(-1);
  if(latest&&(latest.number>PlanoScreenplayVersions.number(screenplay)||data.screenplayVersions===undefined&&latest.number===PlanoScreenplayVersions.number(screenplay))){
   screenplay={...screenplay,edition:latest.number+1};
   if(info)info={...info,completed:false};
  }
  if(coverage&&coverage.id!==screenplay.id)throw Error('Las versiones de la copia no pertenecen al mismo guion.');
  const generated=await generateScreenplayPdf(coverage||screenplay),pageCount=generated.titlePages+generated.pages;
  const payload={version:1,fingerprint:state.fingerprint,annotations:validateNotes(data.annotations,pageCount),corrections:PlanoCorrections.validate(data.corrections,pageCount),crew:PlanoCrew.validate(data.crew),proofreading:PlanoSpelling.validate(data.proofreading),screenplay,view:{scene:'all',stage:'writing'}};
  if(info)payload.projectInfo=info;
  if(versions.length)payload.screenplayVersions=versions;
  if(coverage)payload.screenplayCoverage=coverage;
  const different=JSON.stringify({text:state.screenplay,notes:state.annotations,corrections:state.corrections,crew:state.crew})!==JSON.stringify({text:screenplay,coverage,notes:payload.annotations,corrections:payload.corrections,crew:payload.crew});
  if(different&&!confirm('Esta copia contiene texto editable y planos. ¿Restaurar la versión completa de la copia? Se sustituirá el contenido abierto.'))return;
  if(state.pdf!==document||PlanoAccounts.getUser()?.id!==owner)return;
  if(PlanoCloud.configured)await PlanoCloud.flush();
  if(state.pdf!==document||PlanoAccounts.getUser()?.id!==owner)return;
  const project=PlanoCloud.configured?{...PlanoCloud.info().project,created:false,payload}:null;
  const loaded=await upload(state.file,{project,screenplay,payload,writerRefresh:true,forceWriterReset:true});
  if(!loaded)throw Error('No se pudo restaurar la copia. El guion abierto se conserva.');
  saveNotes();if(PlanoCloud.configured)await PlanoCloud.flush();message('Texto, portada y planos restaurados desde la copia.');
}

 root.PlanoLegacyNotes={save,importNotes,restore};
})(globalThis);
