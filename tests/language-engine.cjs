/* Motor público real en navegador: datos locales, contexto y límites, sin cuentas. */
process.env.PLANO_TEST_SPELL='1';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const A=require('../language-engine.js'),root=path.resolve(__dirname,'..'),{load}=require('./runtime-deps.cjs'),{chromium}=load('playwright');
for(const text of ['Sofía está aquí.','🎬 ANGÉLICA está asqueado.','cafe\u0301 y habitación','😀á𠮷']){
 const map=A.byteOffsets(text);for(let i=0;i<=text.length;i++){if(i&&/[\uD800-\uDBFF]/.test(text[i-1]))continue;assert.equal(map.get(Buffer.byteLength(text.slice(0,i))),i);}
}
const long='La puerta está abierta. '.repeat(800)+'🎬 Sofía.';
assert.equal(A.segments(long).map(s=>s.text).join(''),long);assert(A.segments(long).every(s=>s.text.length<=1800));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/spanish-review/0.2.8/manifest.json')));
for(const [file,data]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'vendor/spanish-review/0.2.8',file))).digest('hex'),data.sha256);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/engine-test')return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><script src="/punctuation-review.js"></script><script src="/language-review.js"></script><script src="/language-engine.js"></script><script src="/spelling.js"></script><body>Prueba local</body>');
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address='http://127.0.0.1:'+server.address().port;
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>(errors.push(e.message),console.error('BROWSER:',e.message)));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.context().route('**/*',route=>route.request().url().startsWith(address+'/')?route.continue():route.abort());
  await page.goto(address+'/engine-test');
  assert(!requests.some(r=>/wasm|pack\.gz/.test(r.url)),'El motor no se descarga al abrir la página');
  const check=blocks=>page.evaluate(async blocks=>PlanoSpelling.checkBlocks(blocks,{signal:new AbortController().signal,load:()=>{throw Error('No debe usar el diccionario básico');}}),blocks);
  const start=Date.now(),results=await check([
   {kind:'parenthetical',speaker:'ANGÉLICA',text:'asqueado'},
   {kind:'parenthetical',speaker:'JUAN',text:'asqueada'},
   {kind:'parenthetical',speaker:'ANGÉLICA',text:'con tono asqueado'},
   {kind:'parenthetical',speaker:'ALEX',text:'cansada'},
   'Sofía mira 🎬. Angélica está asqueado.', 'La planta está abierto.','PLANTA ABIERTO',
   'Hola como estas','habiína una habitación un una habitación','Las ventana está abierta.',
   'Sofía pregunta por Juana.','La puerta está abierta.','Esta manzana sabe a mierda.',
   {kind:'scene',text:'INT. HABITACIÓN - NOCHE'},'Hola , Juan .','Vienes?',
   'Juan había echo la cena.','La situación es inverosimil.','Ella estaba extenuado.',
   {kind:'parenthetical',speaker:'ANA Y MARÍA',text:'cansado'}
  ]);
  assert.equal(await page.evaluate(()=>PlanoSpelling.mode),'complete');assert(await page.evaluate(()=>PlanoSpelling.rules>=1600));
  for(const [index,value]of [[0,'asqueada'],[1,'asqueado'],[4,'asqueada'],[5,'abierta']])assert(results[index].some(r=>r.suggestions?.includes(value)||r.replacement===value),JSON.stringify({index,r:results[index]}));
  for(const i of [2,3,10,11,12,13])assert.deepEqual(results[i],[],`Texto correcto: ${i}`);
  assert(results[6].some(r=>r.kind==='syntax'));assert(results[7].some(r=>r.rule.startsWith('lt:')&&r.suggestions.includes('Hola, ¿cómo estás?')));
  assert(results[8].some(r=>r.kind==='spelling'&&r.text==='habiína'));assert(results[9].some(r=>r.rule.startsWith('lt:AGREEMENT_')));
  assert(results[14].some(r=>r.kind==='punctuation'));assert(results[15].some(r=>r.kind==='punctuation'));
  for(const [i,value]of [[16,'hecho'],[17,'inverosímil'],[18,'extenuada']])assert(results[i].some(r=>r.rule?.startsWith('lt:')&&r.suggestions.includes(value)),'El recurso público amplía las reglas locales: '+i);
  assert(results[19].some(r=>r.replacement==='cansadas'),'Conserva el contexto explícito de acotaciones plurales');
  assert.equal(results[4].find(r=>r.text==='asqueado').start,'Sofía mira 🎬. Angélica está '.length,'Convierte offsets UTF-8 incluso con emoji y tildes');
  const large=check(Array(80).fill('Una habitación tranquila, con una ventana que da a la calle.'));
  const frames=await page.evaluate(()=>new Promise(resolve=>{let n=0,start=performance.now();function frame(){n++;if(performance.now()-start>600)resolve(n);else requestAnimationFrame(frame);}frame();}));assert(frames>10,'El motor no bloquea el hilo de la interfaz');await large;
  const cancelled=await page.evaluate(async()=>{const controller=new AbortController(),p=PlanoSpelling.checkBlocks(Array(100).fill('La puerta está abierta.'),{signal:controller.signal,load:()=>{throw Error('No');}});setTimeout(()=>controller.abort(),30);try{await p;return false;}catch(e){return e.name==='AbortError';}});assert(cancelled);assert.deepEqual(await check(['La puerta está abierta.']),[[]]);
  assert(requests.every(r=>r.method==='GET'&&r.url.startsWith(address+'/')),'Ningún texto se envía ni hay peticiones a terceros');
  assert.equal(requests.filter(r=>r.url.endsWith('es.pack.gz')).length,1);assert(!requests.some(r=>r.url.includes('spanish-spelling.js')),'El diccionario básico no se descarga con el motor completo');
  // Editor real: sugerencia, aplicación, deshacer e invalidación del interlocutor.
  await page.goto(address);await page.waitForFunction(()=>globalThis.PlanoCloudLibrary);
  await page.evaluate(async()=>{const s=PlanoScreenplay.create('Motor público',PlanoAccounts.getUser()),b=(kind,text,id)=>({type:'paragraph',attrs:{kind,id},content:[{type:'text',text}]});s.doc.content=[b('scene','INT. CASA - DÍA','scene'),b('character','ANGÉLICA','speaker'),b('parenthetical','asqueado','aside'),b('dialogue','Esta manzana sabe a mierda.','speech')];await createNativeScript(s);});
  await page.locator('#writer-body-tab').click();const aside=page.locator('[data-block-id=aside]');await aside.locator('.writer-review-syntax',{hasText:'asqueado'}).waitFor({timeout:45000});
  await aside.locator('.writer-review-syntax').click();await page.getByRole('button',{name:'Usar «asqueada»',exact:true}).click();assert.equal(await aside.textContent(),'(asqueada)');await page.keyboard.press('Control+z');await aside.locator('.writer-review-syntax').waitFor();
  await page.locator('#stage-tabs [data-stage=coverage]').click();await page.waitForFunction(()=>state.proofreading.dictionary===PlanoSpelling.version&&!state.busy);const coverage=await page.evaluate(()=>state.corrections.find(i=>i.source==='syntax'&&i.word==='asqueado'));assert(coverage,'La cobertura también recibe el aviso del motor público');assert(coverage.parts[0].rects.every(r=>r.width>0&&r.height>0));await page.locator('#stage-tabs [data-stage=writing]').click();await page.locator('.writer-editor').waitFor({state:'visible'});
  await page.evaluate(()=>{const v=PlanoWriter.view();v.state.doc.forEach((n,p)=>{if(n.attrs.id==='speaker')v.dispatch(v.state.tr.insertText('JUAN',p+1,p+n.nodeSize-1));});});await page.waitForFunction(()=>!document.querySelector('[data-block-id=aside] .writer-review-syntax'));
  // Una revisión con muchos avisos nunca debe hacer que un guion válido exceda
  // el espacio del proyecto. Simulamos los avisos, sin analizar un texto artificial.
  const quota=await page.evaluate(async()=>{
   cancelSpelling();const original={screenplay:state.screenplay,corrections:state.corrections,proofreading:{...state.proofreading}},scan=PlanoSpelling.scan;
   try{state.screenplay={...state.screenplay,doc:{type:'doc',content:Array.from({length:45},(_,i)=>({type:'paragraph',attrs:{kind:'action',id:'quota-'+i},content:[{type:'text',text:'á'.repeat(3000)}]}))}};state.proofreading.dictionary='';PlanoSpelling.scan=async()=>Array.from({length:200},(_,i)=>({id:'quota-issue-'+i,source:'spelling',word:'herror',ignoreKey:'herror',message:'Posible error ortográfico. '.repeat(10),parts:[{page:2,text:'herror',rects:[{x:.3,y:.4,width:.1,height:.02}]}]}));await startSpelling();return{count:state.corrections.length,bytes:new TextEncoder().encode(localStorage.getItem(state.key)).length};}
   finally{PlanoSpelling.scan=scan;Object.assign(state,original);saveNotes();}
  });assert(quota.count>0&&quota.count<200);assert(quota.bytes<=350000,'Los avisos respetan el espacio que ocupa también el guion editable');
  await page.evaluate(()=>PlanoSpelling.stop());
  const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.route('**/engine.wasm.gz',r=>r.abort());await fallback.goto(address+'/engine-test');await fallback.clock.install();
  const basic=await fallback.evaluate(async()=>{const issues=await PlanoSpelling.checkText('herror',{signal:new AbortController().signal,load:()=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/spanish-spelling.js';s.onload=resolve;s.onerror=reject;document.head.append(s);})});return{issues,mode:PlanoSpelling.mode,notice:PlanoSpelling.notice,invalidated:PlanoSpelling.validate({enabled:true,dictionary:PlanoSpelling.version,ignored:[]}).dictionary};});
  assert.equal(basic.mode,'basic');assert(basic.notice.includes('Revisión básica'));assert.equal(basic.invalidated,'');assert(basic.issues.some(i=>i.kind==='spelling'&&i.text==='herror'));
  await fallback.clock.fastForward(21000);assert.equal(await fallback.evaluate(()=>PlanoSpelling.mode),'basic','Liberar el diccionario inactivo no cambia el estado de la revisión');
  await fallback.unroute('**/engine.wasm.gz');await fallback.evaluate(()=>PlanoSpelling.stop());
  await fallback.evaluate(async()=>PlanoSpelling.checkText('Ella estaba extenuado.',{signal:new AbortController().signal,load:()=>Promise.resolve()}));assert.equal(await fallback.evaluate(()=>PlanoSpelling.mode),'complete','Se recupera del fallo sin quedarse en la revisión básica');await fallback.close();
  const published=fs.mkdtempSync(path.join(root,'tests/.output/language-published-'));require('../tools/build-pages.cjs').writeSite(root,published,{schema:1,releases:[]},'language-engine-test');
  const deployed=await browser.newPage();deployed.on('pageerror',e=>errors.push(e.message));await deployed.goto(address+'/'+path.relative(root,published).split(path.sep).join('/')+'/index.html');await deployed.waitForFunction(()=>globalThis.PlanoSpelling);
  const fromBuild=await deployed.evaluate(async()=>{const result=await PlanoSpelling.checkText('Ella estaba extenuado.',{signal:new AbortController().signal,load:()=>{throw Error('No debe recurrir al respaldo');}});return{result,mode:PlanoSpelling.mode};});assert.equal(fromBuild.mode,'complete');assert(fromBuild.result.some(i=>i.suggestions?.includes('extenuada')),'El paquete publicado mantiene las rutas en un subdirectorio como GitHub Pages');await deployed.close();
  assert.deepEqual(errors,[]);console.log('OK: LingoTweaker local con '+await page.evaluate(()=>PlanoSpelling.rules)+' reglas; concordancia contextual, ortografía, sintaxis, puntuación, Unicode, frases correctas, Worker fluido, cancelación, descarga diferida y única, privacidad, editor/undo/contexto. Primera revisión: '+(Date.now()-start)+' ms incluidas pruebas.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
