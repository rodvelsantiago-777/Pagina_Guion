/* Guion largo: cursor, escritura, paginación y límites UTF-8 sin servicios externos. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');
(async()=>{
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.waitForFunction(()=>globalThis.PlanoWriter&&globalThis.PlanoCloudLibrary);
  await page.evaluate(async()=>{
   const script=PlanoScreenplay.create('Ensayo de un guion largo',PlanoAccounts.getUser());
   script.doc.content=Array.from({length:900},(_,i)=>({type:'paragraph',attrs:{kind:i%30===0?'scene':'action',id:'perf-paragraph-'+i},content:[{type:'text',text:i%30===0?`INT. ESTUDIO ${i/30+1} - DÍA`:'El equipo entra en la habitación y prepara la toma. La cámara recorre el espacio mientras esperan una señal.'}]}));
   await createNativeScript(script);
  });
  await page.locator('#writer-body-tab').click();
  const metrics=await page.evaluate(()=>{
   const view=PlanoWriter.view(),P=PlanoProseMirror,outline=document.querySelector('.writer-page-outline'),pages=document.querySelectorAll('.writer-page-outline').length;
   const observer=new MutationObserver(()=>{});observer.observe(document.querySelector('#writer-page-chrome'),{childList:true});
   const cursor=[];for(let i=0;i<12;i++){const start=performance.now();view.dispatch(view.state.tr.setSelection(P.TextSelection.create(view.state.doc,i+1)));cursor.push(performance.now()-start);}
   const typing=[],createDecorations=P.DecorationSet.create;
   let fullPaginationBuilds=0;
   P.DecorationSet.create=function(doc,decorations){
    if(decorations.length>100&&decorations.some(item=>item.type.attrs?.class==='writer-paragraph'))fullPaginationBuilds++;
    return createDecorations.call(this,doc,decorations);
   };
   try{
    for(let i=0;i<12;i++){const start=performance.now();view.dispatch(view.state.tr.insertText('a'));typing.push(performance.now()-start);}
   }finally{P.DecorationSet.create=createDecorations;}
   const pageChanges=observer.takeRecords().length;observer.disconnect();
   const saved=view.state.doc.toJSON(),oversize=view.state.schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',attrs:{kind:'action',id:'oversize'},content:[{type:'text',text:'😀'.repeat(80000)}]}]});
   view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,oversize.content));
   const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
   return{pages,cursorMedianMs:median(cursor),typingMedianMs:median(typing),fullPaginationBuilds,pageChanges,originalPageKept:outline.isConnected,byteLimitPreserved:JSON.stringify(saved)===JSON.stringify(view.state.doc.toJSON())};
  });
  assert(metrics.pages>=40,'El ensayo incluye más de cuarenta páginas de guion');
  assert(metrics.originalPageKept,'Escribir no destruye las hojas existentes');
  assert.equal(metrics.pageChanges,0,'Sin cambios de paginación no se reconstruyen las hojas');
  assert.equal(metrics.fullPaginationBuilds,0,'Escribir dentro de una línea solo actualiza las decoraciones del párrafo editado');
  assert(metrics.byteLimitPreserved,'Un pegado con demasiados bytes UTF-8 se rechaza sin modificar el guion');
  const pagination=await page.evaluate(async()=>{
   const view=PlanoWriter.view(),P=PlanoProseMirror,S=PlanoScreenplay;
   function snapshot(state){
    const decorations=state.plugins.map(plugin=>plugin.getState(state)).find(value=>value instanceof P.DecorationSet);
    return decorations.find().map(({from,to,type,spec})=>JSON.stringify([from,to,type.attrs,spec.key,spec.blockId])).sort();
   }
   const layout=S.layout(view.state.doc.toJSON());
   for(const [index,block] of layout.blocks.entries()){
    if(block.kind!=='action'||!block.lines[1]||!block.breakBefore&&!block.lines.some(line=>line.breakBefore))continue;
    const tr=view.state.tr.insertText('El ',block.pos+1),next=S.layout(tr.doc.toJSON()).blocks[index];
    if(next.lines.length!==block.lines.length||next.lines[1].from===block.lines[1].from)continue;
    view.dispatch(tr);
    const incremental=snapshot(view.state),script=PlanoWriter.get();
    PlanoWriter.close();
    await PlanoWriter.open(script);
    return {incremental,rebuilt:snapshot(PlanoWriter.view().state)};
   }
   return null;
  });
  assert(pagination,'El ensayo encuentra un párrafo que cambia sus saltos de línea junto a un cambio de página');
  assert.deepEqual(pagination.incremental,pagination.rebuilt,'La actualización parcial produce los mismos saltos que reconstruir el guion');
  assert.deepEqual(errors,[]);
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'writer-performance.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
