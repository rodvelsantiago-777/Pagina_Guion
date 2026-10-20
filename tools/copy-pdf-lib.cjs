/* Copia reproducible del motor de exportación, distribuido para uso sin conexión. */
const fs=require('node:fs'),path=require('node:path');
const source=process.argv[2]||path.dirname(require.resolve('pdf-lib/package.json'));
const version=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version;
if(version!=='1.17.1')throw new Error('La exportación se ha verificado con pdf-lib 1.17.1.');
const destination=path.resolve(__dirname,'../vendor');
fs.copyFileSync(path.join(source,'dist/pdf-lib.min.js'),path.join(destination,'pdf-lib.min.js'));
fs.copyFileSync(path.join(source,'LICENSE.md'),path.join(destination,'LICENSE-pdf-lib.md'));
console.log('pdf-lib 1.17.1 y su licencia copiados para exportación local.');
