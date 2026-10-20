/* Ejemplo de revisión: alimenta el mismo exportador del navegador con la referencia. */
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
(async()=>{
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../tests/.output/excel-reference.json'),'utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
  await page.addScriptTag({path:path.join(__dirname,'../vendor/exceljs.min.js')});await page.addScriptTag({path:path.join(__dirname,'../vendor/excel-template.js')});
  const bytes=await page.evaluate(async source=>Array.from(new Uint8Array((await PlanoExcelExport.run({sections:source.sections,fileName:source.project+'.pdf',displayName:item=>item.shotName,values:PlanoShotValues})).bytes)),source);
  const destination=path.join(__dirname,'../outputs/excel-redesign-20261020');fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'Guion técnico.xlsx'),Buffer.from(bytes));
  console.log(path.join(destination,'Guion técnico.xlsx'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
