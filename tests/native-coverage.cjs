/* Cobertura editable en equipo nuevo, sin rasterización PDF ni caché de páginas. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('./runtime-deps.cjs').load('playwright'),root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');
(async()=>{
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  fs.mkdirSync(out,{recursive:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.context().route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>globalThis.PlanoHeader&&globalThis.PlanoCloudLibrary);
  const archive=await page.evaluate(()=>{
   const script=PlanoScreenplay.create('Cobertura en cualquier equipo',PlanoAccounts.getUser()),p=(kind,text,id,marks=[])=>({type:'paragraph',attrs:{kind,id},content:[{type:'text',text,...(marks.length?{marks}:{})}]});
   script.doc.content=[p('scene','INT. CASA - DÍA','scene-1'),p('action','La puerta se abre.','first-action',[{type:'bold'},{type:'italic'},{type:'underline'}]),p('character','ANA','ana-1'),p('parenthetical','en voz baja','aside'),p('dialogue','¿Quién está ahí?','dialogue-1'),p('action','Nadie responde.','response'),p('character','ANA','ana-2'),p('dialogue','La espera continúa. '.repeat(140),'long-dialogue'),...Array.from({length:55},(_,i)=>p(i%5===0?'scene':'action',i%5===0?`EXT. CALLE ${i} - NOCHE`:`Acción ${i}. `+'La cámara sigue a Ana por la calle. '.repeat(16),'block-'+i))];
   const map=PlanoScreenplayLinks.geometry(script),row=map.rows.find(row=>row.blockId==='first-action');
   const annotations=PlanoScreenplayLinks.attach([{id:'long-shot',type:'line',page:row.page,endPage:row.page+1,shotName:'P1',color:'#e8b83f',start:{x:.83,y:row.y},end:{x:.83,y:.45},description:'Plano largo'},{id:'highlight',type:'highlight',page:row.page,shotName:'P2',color:'#d94f54',text:'La puerta',rects:[{x:row.x,y:row.y,width:9*7.2/612,height:row.height}]}],script);
   return PlanoProjectArchive.stringify({name:'Proyecto frío',documentName:'Cobertura.plano',payload:{version:1,screenplay:script,annotations,corrections:[],crew:{roles:[]},proofreading:{enabled:false,dictionary:'',ignored:[]}}});
  });
  await page.locator('#file-input').setInputFiles({name:'Cobertura.plano',mimeType:'application/json',buffer:Buffer.from(archive)});await page.waitForFunction(()=>state.screenplay&&!state.busy);
  const baseline=await page.evaluate(()=>structuredClone(state.annotations));assert(await page.evaluate(()=>state.pages.length>8));
  await page.evaluate(()=>{globalThis.rasterCalls=0;const getPage=state.pdf.getPage.bind(state.pdf);state.pdf.getPage=async n=>{const p=await getPage(n);p.render=()=>{rasterCalls++;throw Error('Rasterizador no disponible');};return p;};});
  await page.locator('#stage-tabs [data-stage=coverage]').click();await page.waitForFunction(()=>state.rendered);
  // Todas las páginas/recortes, no solo la primera visible. Incluye liberar y volver a cargar páginas distantes.
  for(const mode of ['print','all','editing']){
   await page.evaluate(mode=>{document.querySelector('#scene-select').value=mode;document.querySelector('#scene-select').dispatchEvent(new Event('change'));},mode);await page.waitForFunction(()=>state.rendered);
   const count=await page.evaluate(()=>state.viewer.contexts.size);
   for(let index=0;index<count;index++){
    const result=await page.evaluate(async index=>{const context=[...state.viewer.contexts.values()][index];await ensurePage(context);return{status:context.status,text:context.content?.textContent,canvas:context.content?.querySelectorAll('canvas').length,spans:context.content?.querySelectorAll('.screenplay-text-surface span').length};},index);
    assert.equal(result.status,'ready',mode+' recorte '+index);assert.equal(result.canvas,0);assert(result.spans>0,JSON.stringify(result));
   }
   assert.equal(await page.locator('.page-error').count(),0);
  }
  await page.evaluate(()=>{document.querySelector('#scene-select').value='print';document.querySelector('#scene-select').dispatchEvent(new Event('change'));});await page.waitForFunction(()=>state.rendered);
  const printed=await page.evaluate(async()=>{const context=[...state.viewer.contexts.values()].find(c=>c.segment.page===2);await ensurePage(context);const spans=[...context.content.querySelectorAll('.textLayer span')],span=spans.find(s=>s.textContent==='La puerta se abre.'),style=getComputedStyle(span),range=document.createRange();range.setStart(span.firstChild,0);range.setEnd(span.firstChild,9);getSelection().removeAllRanges();getSelection().addRange(range);const rect=range.getBoundingClientRect(),base=context.content.getBoundingClientRect(),row=state.pages[1].lines.find(l=>l.text==='La puerta se abre.');return{text:getSelection().toString(),weight:style.fontWeight,italic:style.fontStyle,underline:style.textDecorationLine,color:style.color,x:(rect.x-base.x)/context.viewport.width,y:(rect.y-base.y)/context.viewport.height,row,texts:spans.map(s=>s.textContent)};});
  assert.equal(printed.text,'La puerta');assert.equal(printed.weight,'700');assert.equal(printed.italic,'italic');assert(printed.underline.includes('underline'));assert.equal(printed.color,'rgb(17, 17, 17)');
  assert(Math.abs(printed.x-printed.row.x)<.001);assert(Math.abs(printed.y-printed.row.y)<.004,JSON.stringify(printed));assert(printed.texts.includes(" (CONT'D)"));assert(printed.texts.includes('(')&&printed.texts.includes(')'));
  await page.evaluate(()=>getSelection().removeAllRanges());assert.deepEqual(await page.evaluate(()=>state.annotations),baseline);assert.equal(await page.evaluate(()=>rasterCalls),0);
  await page.evaluate(()=>scrollToPosition({page:2,y:.08}));await page.screenshot({path:path.join(out,'cobertura-nativa.png')});
  // Los cambios del redactor reconstruyen también la superficie; no quedan páginas de una revisión anterior.
  await page.locator('#stage-tabs [data-stage=writing]').click();await page.evaluate(()=>{const view=PlanoWriter.view(),at=view.state.doc.content.size-1;view.dispatch(view.state.tr.insertText(' CAMBIO SIN PDF',at));});
  await page.locator('#stage-tabs [data-stage=coverage]').click();await page.waitForFunction(()=>state.rendered&&state.writerPdfRevision===state.screenplay.revision);
  assert(await page.evaluate(()=>state.pageSurface.some(p=>p.runs.some(r=>r.text.includes('CAMBIO SIN PDF')))));
  assert.deepEqual(await page.evaluate(()=>state.annotations.map(n=>({id:n.id,name:n.shotName,color:n.color}))),baseline.map(n=>({id:n.id,name:n.shotName,color:n.color})));
  // La ruta antigua reproducía el mensaje de la captura; también se puede reintentar un fallo real de la superficie.
  await page.evaluate(async()=>{globalThis.surfaceRender=PlanoScreenplaySurface.render;PlanoScreenplaySurface.render=async()=>{throw Error('Fallo temporal simulado');};await renderDocument();});
  await page.locator('.page-error').first().waitFor();assert(!(await page.locator('.page-error').first().textContent()).includes('PDF'));
  await page.evaluate(()=>{PlanoScreenplaySurface.render=surfaceRender;});await page.locator('.page-error button').first().click();await page.waitForFunction(()=>[...state.viewer.contexts.values()][0].status==='ready');
  assert.deepEqual(errors,[]);console.log('OK: páginas editables completas sin rasterizador PDF, múltiples vistas y páginas, selección y geometría, formato/CONT\'D/paréntesis, liberación/reapertura, planos intactos, actualización del redactor y reintento.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
