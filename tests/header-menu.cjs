/* Recorrido visible de cuenta, apariencia y acciones del proyecto. */
const {readFile}=require('node:fs/promises');
const assert=require('node:assert/strict');
async function open(page){if(!await page.locator('#project-menu').evaluate(menu=>menu.open))await page.locator('#project-menu > summary').click();}
async function exportProject(page){
 await open(page);
 await page.locator('#open-export').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-editable').click()]);
 assert.match(download.suggestedFilename(),/\.plano$/);
 const archive=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.equal(archive.format,'plano.project');
 return archive.project.payload;
}
module.exports={open,exportProject};
