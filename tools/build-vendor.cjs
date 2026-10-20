/* Opcional: reconstruye las dependencias ya distribuidas en vendor/. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const source = process.argv[2] || path.dirname(require.resolve('pdfjs-dist/package.json'));
const esbuild = process.argv[3] || 'esbuild';
const destination = path.resolve(__dirname, '../vendor');
const version = JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version;
if (version !== '5.6.205') throw new Error('Este visor se ha verificado con pdfjs-dist 5.6.205. Actualiza y prueba la integración antes de cambiar la versión.');
fs.mkdirSync(destination,{recursive:true});
for (const [input,output,global] of [['pdf.mjs','pdf.js','pdfjsLib'],['pdf.worker.mjs','pdf.worker.js','pdfjsWorker']]) {
  execFileSync(esbuild,[path.join(source,'build',input),'--bundle','--format=iife',`--global-name=${global}`,'--minify','--legal-comments=inline',`--outfile=${path.join(destination,output)}`],{stdio:'inherit'});
}
fs.copyFileSync(path.join(source,'build/pdf.worker.min.mjs'),path.join(destination,'pdf.worker.mjs'));
fs.copyFileSync(path.join(source,'LICENSE'),path.join(destination,'LICENSE-pdfjs'));
const assets = {};
for(const group of ['cmaps','standard_fonts','wasm']) {
  assets[group] = {};
  for(const file of fs.readdirSync(path.join(source,group))) {
    if(file.startsWith('LICENSE')) {
      fs.copyFileSync(path.join(source,group,file),path.join(destination,file==='LICENSE'?`LICENSE-${group}`:file));
    } else if(/\.(bcmap|pfb|ttf|wasm)$/.test(file)) assets[group][file]=fs.readFileSync(path.join(source,group,file)).toString('base64');
  }
}
fs.writeFileSync(path.join(destination,'pdf-assets.js'),`/* PDF.js ${version} resources. See the LICENSE files in this folder. */\nwindow.planoPdfAssets=${JSON.stringify(assets)};\n`);
console.log(`PDF.js ${version}: bibliotecas y recursos empaquetados para uso local sin conexión.`);
