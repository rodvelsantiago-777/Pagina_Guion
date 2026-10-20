// Plantilla base: ejecutar con el runtime de hojas de cálculo de Codex.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';
import JSZip from 'jszip';
const root=fileURLToPath(new URL('../',import.meta.url));
const wb=Workbook.create(), sheet=wb.worksheets.add('Guion técnico');
// Mismo trazado de la referencia: A:B escena, H:I grip, L:M notas.
const widths=[3.25,7.63,10.75,12.63,22,17,17,3.25,15.75,22,30,26,3.25];
sheet.showGridLines=false; sheet.tabColor='#434343';
const area=sheet.getRange('A1:M15');
area.format.font={name:'Arial',size:11,color:'#242424'};
area.format.verticalAlignment='center';
area.format.rowHeight=20;
for(let i=0;i<widths.length;i++)sheet.getRangeByIndexes(0,i,15,1).format.columnWidth=widths[i];
sheet.mergeCells('A1:M1'); sheet.getRange('A1').values=[['GUION TÉCNICO']];
sheet.getRange('A1:M1').format={fill:'#434343',font:{name:'Arial',size:14,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:28};
sheet.getRange('A2:M12').format.fill='#E6E6E6';
sheet.getRange('A2:M12').format.borders={preset:'outside',style:'thin',color:'#777777'};
for(const row of [2,4,6,8,10,12])sheet.getRange(`A${row}:M${row}`).format.rowHeight=9;
for(const row of [3,5,7,9,11])sheet.getRange(`A${row}:M${row}`).format.rowHeight=24;
const labels=['B3:C3','B5:C5','B7:D7','B9:D9','B11:D11'];
for(const range of labels)sheet.mergeCells(range);
const inputs=['D3:G3','D5:G5','E7:G7','E9:G9','E11:G11','J3:L3','J5:L5','J9:L9'];
for(const range of inputs){sheet.mergeCells(range);sheet.getRange(range).format={fill:'#FFFFFF',horizontalAlignment:'center',verticalAlignment:'center',wrapText:true};}
for(const [cell,text] of Object.entries({B3:'PROYECTO:',B5:'DIRECTOR:',B7:'ASISTENTE DE DIRECCIÓN:',B9:'DIRECTOR DE FOTOGRAFÍA:',B11:'DISEÑADOR DE PRODUCCIÓN:',I3:'FECHA:',I5:'PRODUCTORA:',I9:'SONIDISTA:'})){
 sheet.getRange(cell).values=[[text]];
 sheet.getRange(cell).format.font={name:'Arial',size:10,bold:true,color:'#242424'};
}
sheet.getRange('A13:M13').format.rowHeight=14;
for(const range of ['A14:B14','H14:I14','L14:M14'])sheet.mergeCells(range);
sheet.getRange('A14:M14').format={fill:'#434343',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:26};
for(const [cell,text] of Object.entries({A14:'ESCENA',C14:'PLANO',D14:'VALOR',E14:'ANGULACIÓN',F14:'ÓPTICA',G14:'MOVIMIENTO',H14:'GRIP',J14:'SONIDO',K14:'DESCRIPCIÓN',L14:'NOTAS'}))sheet.getRange(cell).values=[[text]];
sheet.freezePanes.freezeRows(14);sheet.freezePanes.freezeColumns(3);
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:"'Guion técnico'!A14:M15",tableMaxRows:2,tableMaxCols:13,maxChars:1500})).ndjson);
const preview=await wb.render({sheetName:'Guion técnico',range:'A1:M15',scale:1,format:'png'});
await fs.writeFile(root+'tests/.output/excel-template.png',new Uint8Array(await preview.arrayBuffer()));
const output=await SpreadsheetFile.exportXlsx(wb);const target=root+'tests/.output/excel-template.xlsx';await output.save(target);
// ExcelJS 4.4 lee el namespace principal por defecto; Artifact Tool usa el prefijo x.
// Normalizar solo ese prefijo mantiene intactos valores, estilos y relaciones OOXML.
const zip=await JSZip.loadAsync(await fs.readFile(target));
for(const [name,file] of Object.entries(zip.files))if(/\.(xml|rels)$/.test(name)){
 const xml=await file.async('string');
 zip.file(name,xml.replace(/<(\/?)(?:x):/g,'<$1').replace(/xmlns:x="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g,'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'));
}
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
await fs.writeFile(root+'vendor/excel-template.js',`/* Plantilla PLANO, generada con tools/build-excel-template.mjs. */\nglobalThis.PlanoExcelTemplate = ${JSON.stringify(bytes.toString('base64'))};\n`);
console.log('Plantilla local de guion técnico generada.');
