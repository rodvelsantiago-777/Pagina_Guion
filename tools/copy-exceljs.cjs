/* Bundle oficial, cargado solo al exportar; nunca necesita CDN en producción. */
const fs=require('node:fs'),path=require('node:path');
const source=process.argv[2]||path.dirname(require.resolve('exceljs/package.json'));
if(JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version!=='4.4.0')throw new Error('La exportación se ha verificado con ExcelJS 4.4.0.');
const destination=path.resolve(__dirname,'../vendor');
fs.copyFileSync(path.join(source,'dist/exceljs.min.js'),path.join(destination,'exceljs.min.js'));
fs.copyFileSync(path.join(source,'LICENSE'),path.join(destination,'LICENSE-exceljs.txt'));
console.log('ExcelJS 4.4.0 y licencia MIT copiados.');
