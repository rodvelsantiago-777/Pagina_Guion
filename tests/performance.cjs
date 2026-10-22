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
  await page.locator('#file-input').setInputFiles({name:'Rendimiento.pdf',mimeType:'application/pdf',buffer});await ready(page);
  const notes=Array.from({length:400},(_,i)=>({id:'perf-'+i,shotId:'perf-'+i,shotName:'P'+(i+1),type:'line',page:Math.floor(i/9)+1,color:'#64a7d9',start:{x:.78+(i%3)*.04,y:.18+(i%9)*.045},end:{x:.78+(i%3)*.04,y:.21+(i%9)*.045},description:'Preparación de la toma.',sound:'Sonido directo.',note:''}));
  metrics.changeMs=await page.evaluate(notes=>{state.annotations=validateNotes(notes);const start=performance.now();changed();return performance.now()-start;},notes);
  metrics.hiddenTechnicalRows=await page.locator('#technical-table-body tr[data-shot-id]').count();if(!baseline)assert.equal(metrics.hiddenTechnicalRows,0,'La tabla oculta no construye cientos de filas');
  metrics.sidebarMs=await page.evaluate(()=>{const samples=[];for(let i=0;i<3;i++){const start=performance.now();refreshAnnotations();samples.push(performance.now()-start);}return samples.sort((a,b)=>a-b)[1];});
  await page.locator('#stage-tabs [data-stage=technical]').click();assert.equal(await page.locator('#technical-table-body tr[data-shot-id]').count(),400);
  await page.evaluate(()=>window.perfOldCanvases=[...document.querySelectorAll('.page-window canvas')]);await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);
  metrics.oldCanvasesReleased=await page.evaluate(()=>perfOldCanvases.every(canvas=>canvas.width===0&&canvas.height===0));if(!baseline)assert(metrics.oldCanvasesReleased,'El visor libera explícitamente los lienzos reemplazados');
  await page.locator('#scene-select').selectOption('print',{force:true});await ready(page);
  for(const number of [9,18,27,36,48]){await page.locator(`.page-slot[data-page="${number}"]`).scrollIntoViewIfNeeded();await page.locator(`.page-slot[data-page="${number}"][data-ready="true"]`).waitFor();}
  metrics.livePages=await page.locator('.page-slot[data-ready=true]').count();assert(metrics.livePages<=8);await page.locator('.page-slot[data-page="1"]').scrollIntoViewIfNeeded();await page.locator('.page-slot[data-page="1"][data-ready="true"]').waitFor();
  await page.locator('[data-tool=line]').click();const box=await page.locator('.page-slot[data-page="1"] .page-window').boundingBox(),x=box.x+box.width*.65,y=Math.max(180,box.y+150);
  await page.mouse.move(x,y);await page.mouse.down();assert(await page.evaluate(()=>!!state.drawing));
  metrics.burst=await page.evaluate(async({x,y})=>{
   const original=drawAnnotations;let draws=0;drawAnnotations=(...args)=>{draws++;return original(...args);};
   const start=performance.now();for(let i=0;i<80;i++)document.querySelector('#pdf-stage').dispatchEvent(new PointerEvent('pointermove',{pointerId:state.drawing.pointerId,clientX:x,clientY:y+i/4,bubbles:true,cancelable:true,pointerType:'mouse',buttons:1}));
   const synchronous=draws;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));drawAnnotations=original;
   return{events:80,synchronous,draws,elapsedMs:performance.now()-start};
  },{x,y});if(!baseline){assert.equal(metrics.burst.synchronous,0);assert(metrics.burst.draws<=2,'Una ráfaga se dibuja como máximo una vez por fotograma');}
  await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>state.annotations.length),400);
  const libraryLoads=requests.filter(url=>/\/vendor\/pdf(?:-assets)?\.js(?:\?|$)/.test(url));assert.equal(libraryLoads.length,2,'Cada dependencia se carga una sola vez');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,baseline?'performance-before.json':'performance-after.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
