/* Copia versionada del motor DOCX, cargado solo al importar o exportar Word. */
const fs=require('node:fs'),path=require('node:path');
const source=process.argv[2]||path.dirname(require.resolve('jszip/package.json'));
if(JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version!=='3.10.1')throw Error('Se requiere JSZip 3.10.1.');
const destination=path.resolve(__dirname,'../vendor');
fs.copyFileSync(path.join(source,'dist/jszip.min.js'),path.join(destination,'jszip.min.js'));
fs.copyFileSync(path.join(source,'LICENSE.markdown'),path.join(destination,'LICENSE-jszip.md'));
console.log('JSZip 3.10.1 y licencia copiados.');
