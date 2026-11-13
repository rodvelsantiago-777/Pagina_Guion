/* Carga inicial, documento largo y trabajo del visor ante ráfagas del puntero. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name),{chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const baseline=process.env.PLANO_PERF_BASELINE==='1',ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(let number=1;number<=48;number++){const sheet=pdf.addPage([595,842]);sheet.drawText(`INT. ESTUDIO ${number} - DIA`,{x:65,y:770,size:12,font});for(let row=0;row<8;row++)sheet.drawText('El equipo prepara la siguiente toma.',{x:65,y:700-row*45,size:12,font});}
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>requests.push(request.url()));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>globalThis.PlanoPatchNotes&&globalThis.PlanoCloudLibrary);await page.waitForTimeout(80);
  const initial=requests.filter(url=>/\/vendor\/pdf(?:-assets)?\.js(?:\?|$)/.test(url)),metrics={initialPdfBytes:initial.reduce((sum,url)=>sum+fs.statSync(path.join(root,new URL(url).pathname.split('/').slice(-2).join('/'))).size,0)};
  if(!baseline)assert.equal(initial.length,0,'El inicio y el acceso no descargan el motor PDF ni sus recursos');
  metrics.initialHeavyAssets=requests.filter(url=>/\/vendor\/(?:pdf-lib|exceljs|jszip|writer-engine|spanish-spelling)[^/]*\.js(?:\?|$)/.test(url)).length;
  assert.equal(metrics.initialHeavyAssets,0,'El inicio tampoco carga motores de escritura, exportación o diccionario antes de usarlos');
  await page.locator('#file-input').setInputFiles({name:'Rendimiento.pdf',mimeType:'application/pdf',buffer});await ready(page);
  const notes=Array.from({length:400},(_,i)=>({id:'perf-'+i,shotId:'perf-'+i,shotName:'P'+(i+1),type:'line',page:Math.floor(i/9)+1,color:'#64a7d9',start:{x:.78+(i%3)*.04,y:.18+(i%9)*.045},end:{x:.78+(i%3)*.04,y:.21+(i%9)*.045},description:'Preparación de la toma.',sound:'Sonido directo.',note:''}));
  metrics.change=await page.evaluate(notes=>{
   state.annotations=validateNotes(notes);const breakdown={};
   const measure=(name,run)=>(...args)=>{const start=performance.now();try{return run(...args);}finally{breakdown[name]=(breakdown[name]||0)+performance.now()-start;}};
   const attach=PlanoScreenplayLinks.attach,segments=sceneTools.workingSegments,labels=PlanoDocumentLabels.draw,cards=refreshAnnotations;
   PlanoScreenplayLinks.attach=measure('attachMs',attach);sceneTools.workingSegments=measure('segmentsMs',segments);PlanoDocumentLabels.draw=measure('labelsMs',labels);refreshAnnotations=measure('cardsMs',cards);
   const start=performance.now();try{changed();return {elapsedMs:performance.now()-start,...breakdown};}
   finally{PlanoScreenplayLinks.attach=attach;sceneTools.workingSegments=segments;PlanoDocumentLabels.draw=labels;refreshAnnotations=cards;}
  },notes);
  metrics.hiddenTechnicalRows=await page.locator('#technical-table-body tr[data-shot-id]').count();if(!baseline)assert.equal(metrics.hiddenTechnicalRows,0,'La tabla oculta no construye cientos de filas');
  await ready(page);
  metrics.metadata=await page.evaluate(()=>{
   refreshAnnotations();drawAnnotations();
   const card=document.querySelector('.annotation-card[data-id="perf-300"]'),focus=card.querySelector('button');focus.focus({preventScroll:true});
   const labels=[...document.querySelectorAll('.document-shot-tag')],marks=[...document.querySelectorAll('.annotation-overlay>[data-annotation-id]')];
   const start=performance.now();state.annotations[0].sound='Sonido directo actualizado, sin alterar la cobertura.';changed();
   return{elapsedMs:performance.now()-start,unchangedCard:card.isConnected,focusKept:document.activeElement===focus,labelsKept:labels.length>0&&labels.every(label=>label.isConnected),marksKept:marks.length>0&&marks.every(mark=>mark.isConnected)};
  });
  if(!baseline)for(const key of ['unchangedCard','focusKept','labelsKept','marksKept'])assert(metrics.metadata[key],key+': cambiar sonido conserva el documento y los planos ajenos');
  metrics.repeatChangeMs=await page.evaluate(()=>{const start=performance.now();changed();return performance.now()-start;});
  metrics.sidebarMs=await page.evaluate(()=>{const samples=[];for(let i=0;i<3;i++){const start=performance.now();refreshAnnotations();samples.push(performance.now()-start);}return samples.sort((a,b)=>a-b)[1];});
  await page.locator('#stage-tabs [data-stage=technical]').click();assert.equal(await page.locator('#technical-table-body tr[data-shot-id]').count(),400);
  assert((await page.locator('tr[data-shot-id="perf-0"] [data-field="sound"]').textContent()).includes('Sonido directo actualizado'));
  metrics.technical=await page.evaluate(()=>{
   const untouched=document.querySelector('tr[data-shot-id="perf-300"] [data-field="sound"] .technical-cell-value').firstChild,heading=document.querySelector('.technical-scene-row th').firstChild;
   const start=performance.now();commitTechnicalField('perf-0','sound','Nueva edición desde la tabla.');
   return{elapsedMs:performance.now()-start,untouchedCell:untouched.isConnected,headingKept:heading.isConnected};
  });
  if(!baseline){assert(metrics.technical.untouchedCell,'La tabla no reescribe las celdas que no cambiaron');assert(metrics.technical.headingKept,'La tabla conserva sus cabeceras sin cambios');}
  await page.evaluate(()=>window.perfOldCanvases=[...document.querySelectorAll('.page-window canvas')]);await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);
  metrics.oldCanvasesReleased=await page.evaluate(()=>perfOldCanvases.every(canvas=>canvas.width===0&&canvas.height===0));if(!baseline)assert(metrics.oldCanvasesReleased,'El visor libera explícitamente los lienzos reemplazados');
  await page.locator('#scene-select').selectOption('print',{force:true});await ready(page);
  for(const number of [9,18,27,36,48]){await page.locator(`.page-slot[data-page="${number}"]`).scrollIntoViewIfNeeded();await page.locator(`.page-slot[data-page="${number}"][data-ready="true"]`).waitFor();}
  metrics.scroll=await page.evaluate(()=>{
   const contexts=[...state.viewer.contexts.values()];let reads=0;
   for(const {crop} of contexts){const bounds=crop.getBoundingClientRect.bind(crop);crop.getBoundingClientRect=()=>{reads++;return bounds();};}
   try{updatePageIndicator();return{reads,total:contexts.length,page:contexts[state.segmentIndex].segment.page};}
   finally{for(const {crop} of contexts)delete crop.getBoundingClientRect;}
  });
  if(!baseline){assert.equal(metrics.scroll.page,48);assert(metrics.scroll.reads<metrics.scroll.total/2,'Actualizar el indicador al desplazarse solo mide las páginas cercanas');}
  metrics.livePages=await page.locator('.page-slot[data-ready=true]').count();assert(metrics.livePages<=8);await page.locator('.page-slot[data-page="1"]').scrollIntoViewIfNeeded();await page.locator('.page-slot[data-page="1"][data-ready="true"]').waitFor();
  assert(await page.locator('.page-slot[data-page="1"] .annotation-overlay [data-annotation-id="perf-0"]').count(),'Las marcas reaparecen al volver a una página liberada');
  assert(await page.locator('.page-slot[data-page="1"] .document-shot-tag[data-annotation-id="perf-0"]').count(),'Sus títulos también reaparecen tras liberar el lienzo');
  await page.locator('[data-tool=line]').click();const box=await page.locator('.page-slot[data-page="1"] .page-window').boundingBox(),x=box.x+box.width*.65,y=Math.max(180,box.y+150);
  await page.evaluate(()=>{globalThis.existingMarks=[...document.querySelectorAll('.page-slot[data-page="1"] .annotation-overlay > [data-annotation-id]')];});
  await page.mouse.move(x,y);await page.mouse.down();assert(await page.evaluate(()=>!!state.drawing));
  metrics.burst=await page.evaluate(async({x,y})=>{
   const original=drawAnnotations,pointer=coveragePointer;let draws=0,positions=0;drawAnnotations=(...args)=>{draws++;return original(...args);};coveragePointer=(...args)=>{positions++;return pointer(...args);};
   const start=performance.now();for(let i=0;i<80;i++)document.querySelector('#pdf-stage').dispatchEvent(new PointerEvent('pointermove',{pointerId:state.drawing.pointerId,clientX:x,clientY:y+i/4,bubbles:true,cancelable:true,pointerType:'mouse',buttons:1}));
   const synchronous=draws;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));drawAnnotations=original;coveragePointer=pointer;
   return{events:80,synchronous,draws,positions,elapsedMs:performance.now()-start,marksKept:existingMarks.length>0&&existingMarks.every(mark=>mark.isConnected)};
  },{x,y});if(!baseline){assert.equal(metrics.burst.synchronous,0);assert(metrics.burst.draws<=2,'Una ráfaga se dibuja como máximo una vez por fotograma');assert(metrics.burst.positions<=2,'La geometría del puntero también se calcula una vez por fotograma');assert(metrics.burst.marksKept,'La vista previa de una línea conserva las marcas ya pintadas');}
  await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>state.annotations.length),400);
  await page.evaluate(async()=>{const version=new URL(document.querySelector("script[src^='app.js']").src).search;await Promise.all([loadScript('vendor/jszip.min.js'),loadScript('./vendor/jszip.min.js'+version)]);});
  assert.equal(requests.filter(url=>/\/vendor\/jszip\.min\.js(?:\?|$)/.test(url)).length,1,'Las herramientas comparten una única carga versionada de la misma biblioteca');
  await page.evaluate(()=>{
   const backup=structuredClone(state.annotations);state.annotations[0].shotName='';state.annotations[10].shotName='';changed();
   const before=document.querySelector('.annotation-card[data-id="perf-10"] .annotation-jump').textContent;
   state.annotations.splice(0,1);changed();
   const after=document.querySelector('.annotation-card[data-id="perf-10"] .annotation-jump').textContent;
   if(before!=='Línea 11'||after!=='Línea 10')throw Error('La numeración de planos antiguos sin nombre no se actualizó al borrar un plano de otra escena.');
   state.annotations=backup;changed();
  });
  const libraryLoads=requests.filter(url=>/\/vendor\/pdf(?:-assets)?\.js(?:\?|$)/.test(url));assert.equal(libraryLoads.length,2,'Cada dependencia se carga una sola vez');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,baseline?'performance-before.json':'performance-after.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
