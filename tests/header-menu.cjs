/* Recorrido visible de cuenta, apariencia y acciones del proyecto. */
async function open(page){if(!await page.locator('#project-menu').evaluate(menu=>menu.open))await page.locator('#project-menu > summary').click();}
module.exports={open};
