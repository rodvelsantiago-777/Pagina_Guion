/* Descarga real, texto original, geometría rotada, imagen escaneada y referencias. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts,degrees,PDFName,PDFNumber}=load('pdf-lib'),{PNG}=load('pngjs');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
async function download(page,name){const pending=page.waitForEvent('download');await page.locator('#project-menu summary').click();await page.locator('#export-pdf').click();const file=await pending;const destination=path.join(output,name);await file.saveAs(destination);await page.waitForFunction(()=>!state.exporting&&!state.busy);return {bytes:fs.readFileSync(destination),name:file.suggestedFilename()};}
(async()=>{
 const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Courier);
 const cover=document.addPage([595,842]);cover.drawText('LA COBERTURA',{x:120,y:600,size:20,font});cover.drawText('Guion original de prueba',{x:65,y:100,size:12,font});
 for(const rotation of [0,90,180,270]){const sheet=document.addPage([595,842]);sheet.setRotation(degrees(rotation));sheet.drawText('INT. ESTUDIO - DIA',{x:65,y:770,size:12,font});sheet.drawText(`Texto seleccionable ${rotation}`,{x:65,y:690,size:12,font});sheet.drawText('No se reescribe el guion.',{x:65,y:200,size:12,font});}
 const crop=document.addPage([655,900]);crop.setMediaBox(-30,-40,655,900);crop.setCropBox(20,30,535,720);crop.setRotation(degrees(90));crop.node.set(PDFName.of('UserUnit'),PDFNumber.of(2));crop.drawText('Texto recortado y girado',{x:100,y:600,size:12,font});
 const image=new PNG({width:400,height:600});image.data.fill(255);for(let y=90;y<500;y+=50)for(let x=50;x<300;x++)for(let row=0;row<3;row++){const i=((y+row)*400+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=50;}
 const scanned=document.addPage([595,842]);scanned.drawImage(await document.embedPng(PNG.sync.write(image)),{x:0,y:0,width:595,height:842});
 const buffer=Buffer.from(await document.save()),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
   const context=await browser.newContext({viewport:{width:1540,height:1100},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const url=route.request().url();return /^https?:/.test(url)&&!process.env.PLANO_TEST_URL?route.abort():route.continue();});
   await page.goto(process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#file-input').setInputFiles({name:'Guion final.PDF',mimeType:'application/pdf',buffer});await ready(page);
   const empty=await download(page,'exportacion-sin-marcas.pdf');assert.equal(empty.name,'Guion final-cobertura.pdf');assert.deepEqual(empty.bytes,buffer,'Sin anotaciones se descarga el original byte a byte');
   const common={type:'line',color:'#d23c52',start:{x:.89,y:.28},end:{x:.89,y:.54},createdAt:'2026-10-20T12:00:00Z'};
   const notes=[];for(let number=2;number<=7;number++){
     notes.push({...common,id:'line-'+number,shotId:'line-'+number,shotName:number===2?'P1 · Ñandú 🎬':'P'+number,page:number,lineLabel:{t:.2,side:'left'}});
     notes.push({id:'highlight-'+number,shotId:'highlight-'+number,shotName:'H'+number,type:'highlight',page:number,color:'#e8b83f',rects:[{x:.15,y:.68,width:.34,height:.025},{x:.15,y:.715,width:.26,height:.025}],text:'Texto resaltado',labelPosition:{x:.57,y:.64},labelPinned:true});
   }
   const fingerprint=await page.evaluate(()=>state.fingerprint);await page.locator('#backup-input').setInputFiles({name:'cobertura.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:notes}))});await page.waitForFunction(()=>state.annotations.length===12);
   await page.locator('#scene-select').selectOption('scene-1',{force:true});await ready(page);
   const before=await page.evaluate(()=>({notes:state.annotations,history:state.history.length,viewer:state.viewer.id,scene:state.scene,zoom:state.zoom,scroll:document.querySelector('#pdf-stage').scrollTop,original:state.file.size}));
   const first=await download(page,'guion-cobertura-exportado.pdf'),exported=await PDFDocument.load(first.bytes);assert.equal(exported.getPageCount(),7,'Se exportan todas las páginas aunque solo se vea una escena');
   for(let i=0;i<7;i++){assert.deepEqual(exported.getPage(i).getMediaBox(),document.getPage(i).getMediaBox());assert.deepEqual(exported.getPage(i).getCropBox(),document.getPage(i).getCropBox());assert.equal(exported.getPage(i).getRotation().angle,document.getPage(i).getRotation().angle);}
   assert.deepEqual(await page.evaluate(()=>({notes:state.annotations,history:state.history.length,viewer:state.viewer.id,scene:state.scene,zoom:state.zoom,scroll:document.querySelector('#pdf-stage').scrollTop,original:state.file.size})),before,'No cambia las notas, historial, zoom, escena ni posición del editor');assert.equal(await page.locator('.pdf-export-workbench').count(),0);
   const rendered=await page.evaluate(async data=>{
     const output=await pdfjsLib.getDocument({data:new Uint8Array(data),isEvalSupported:false,useWasm:true,useSystemFonts:false,useWorkerFetch:false,BinaryDataFactory:LocalBinaryFactory}).promise,results=[];
     for(let number=1;number<=7;number++){
       const source=await state.pdf.getPage(number),target=await output.getPage(number),viewport=source.getViewport({scale:1}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
       const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=width;a.height=b.height=height;
       await source.render({canvasContext:a.getContext('2d'),viewport}).promise;await target.render({canvasContext:b.getContext('2d'),viewport:target.getViewport({scale:1})}).promise;
       const original=a.getContext('2d').getImageData(0,0,width,height).data,marked=b.getContext('2d').getImageData(0,0,width,height).data;
       const get=(data,x,y)=>Array.from(data.slice((Math.floor(y)*width+Math.floor(x))*4,(Math.floor(y)*width+Math.floor(x))*4+3));
       const text=(await target.getTextContent()).items.map(item=>item.str).join(' ').replace(/\s+/g,' ');
       if(number===1)results.push({number,identical:original.every((v,i)=>v===marked[i]),text});
       else{
         const stroke=get(marked,.89*viewport.width,.4*viewport.height),cap=get(marked,.89*viewport.width+2,.28*viewport.height);
         let highlight=false;for(let y=.685*viewport.height;y<.7*viewport.height&&!highlight;y+=2)for(let x=.18*viewport.width;x<.4*viewport.width;x+=2){const p=get(original,x,y),q=get(marked,x,y);if(p.every(c=>c>250)&&q[0]>235&&q[1]>205&&q[2]<220){highlight=true;break;}}
         results.push({number,stroke,cap,highlight,text});
       }
       if([2,3,6,7].includes(number))results.at(-1).png=b.toDataURL('image/png');a.width=a.height=b.width=b.height=0;
     }
     await output.destroy();return results;
   },Array.from(first.bytes));
   for(const result of rendered)if(result.png)fs.writeFileSync(path.join(output,`pdf-exportado-pagina-${result.number}.png`),Buffer.from(result.png.split(',')[1],'base64'));
   assert(rendered[0].identical,'La portada original no cambia ni un píxel');
   for(const result of rendered.slice(1)){assert(result.stroke.every((c,i)=>Math.abs(c-[210,60,82][i])<5),`Línea en página ${result.number}: ${result.stroke}`);assert(result.cap.every((c,i)=>Math.abs(c-[210,60,82][i])<8),`Remate en página ${result.number}: ${result.cap}`);assert(result.highlight,`Resaltes en página ${result.number}`);if(result.number<7)assert(result.text.includes(result.number===6?'Texto recortado':'Texto seleccionable'),'Texto seleccionable en pagina '+result.number+': '+result.text);if(result.png)fs.writeFileSync(path.join(output,`pdf-exportado-pagina-${result.number}.png`),Buffer.from(result.png.split(',')[1],'base64'));}
   await page.locator('#toggle-theme').click();await page.locator('#zoom-in').click();await ready(page);await page.locator('#stage-tabs [data-stage="technical"]').click();const second=await download(page,'guion-cobertura-desde-tabla.pdf');assert.equal((await PDFDocument.load(second.bytes)).getPageCount(),7,'Se puede exportar también desde guion técnico');
   // El archivo es idéntico con otros temas, zoom o etapa (no hay datos variables nuevos).
   assert.deepEqual(second.bytes,first.bytes,'El aspecto de la aplicación no entra en el PDF');
   await page.evaluate(()=>{window.realExport=PlanoPdfExport.run;PlanoPdfExport.run=async()=>{throw new Error('Fallo de prueba');};});await page.locator('#project-menu summary').click();await page.locator('#export-pdf').click();await page.waitForFunction(()=>!state.exporting);assert((await page.locator('#feedback').textContent()).includes('No se pudo exportar'));assert(!(await page.locator('#export-pdf').isDisabled()));assert(!(await page.locator('#remove-button').isDisabled()));await page.evaluate(()=>PlanoPdfExport.run=window.realExport);
   // Sin huecos en la página, las marcas se conservan y los nombres van a referencias.
   const full=await PDFDocument.create(),black=full.addPage([400,600]);black.drawRectangle({x:0,y:0,width:400,height:600,color:load('pdf-lib').rgb(0,0,0)});const solid=Buffer.from(await full.save());
   await page.locator('#file-input').setInputFiles({name:'sin-huecos.pdf',mimeType:'application/pdf',buffer:solid});await page.waitForFunction(()=>state.file?.name==='sin-huecos.pdf'&&!state.busy);
   const id=await page.evaluate(()=>state.fingerprint);await page.locator('#backup-input').setInputFiles({name:'sin-huecos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint:id,annotations:[{...common,id:'full',page:1,shotName:'Plano sin hueco 🎬'}]}))});await page.waitForFunction(()=>state.annotations.length===1);
   const fallback=await download(page,'guion-cobertura-referencias.pdf');assert.equal((await PDFDocument.load(fallback.bytes)).getPageCount(),2);assert((await page.locator('#feedback').textContent()).includes('referencias al final'));
   assert.deepEqual(errors,[]);console.log('OK: descargas reales offline desde escena y tabla, original sin marcas idéntico, texto seleccionable, líneas/remates/resaltes en rotaciones y CropBox/UserUnit, escaneo, nombres Unicode, independencia del tema/zoom, referencias, limpieza y recuperación de errores.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
