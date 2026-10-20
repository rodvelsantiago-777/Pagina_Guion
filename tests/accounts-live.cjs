/* Comprueba el código local bajo el origen de Pages y el servicio Firebase real.
 * Solo intenta acceder con datos inexistentes: no crea usuarios ni envía correos. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),base='https://rodvelsantiago-777.github.io/Pagina_Guion/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(base+'**',async route=>{
   const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname.slice(new URL(base).pathname.length))||'index.html',target=path.resolve(root,relative);
   if(!target.startsWith(root+path.sep)||!fs.existsSync(target))return route.abort();
   const contentType={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(target)]||'application/octet-stream';
   await route.fulfill({contentType,body:fs.readFileSync(target)});
  });
  await page.goto(base);await page.evaluate(()=>PlanoAccounts.ready);
  assert(await page.locator('#auth-entry').isVisible());assert(!(await page.locator('.app-shell').isVisible()));assert.equal(await page.locator('#account-title').textContent(),'Crea tu cuenta');assert(!(await page.locator('#account-submit').isDisabled()));
  await page.screenshot({path:path.join(root,'tests/.output/acceso-inicial-claro.png'),fullPage:true});
  await page.locator('[data-account-view="login"]').click();await page.locator('#account-email').fill('plano-ui-check@example.invalid');await page.locator('#account-password').fill('Clave-inexistente-de-prueba');await page.locator('#account-submit').click();
  await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('no son correctos'),{},{timeout:30000});assert(!(await page.locator('.app-shell').isVisible()));assert(!(await page.locator('#account-submit').isDisabled()));
  await page.locator('[data-account-view="signup"]').click();await page.locator('#account-email').fill('');await page.locator('#auth-theme').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'tests/.output/acceso-inicial-oscuro-movil.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('OK: pantalla inicial local bajo el origen HTTPS de Pages, conexión real con Firebase y respuesta de credenciales inexistentes. Formularios activos, sin errores JS. No se crearon usuarios, enviaron correos ni publicaron archivos.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
