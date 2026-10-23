# PLANO — Estudio de guion y cobertura

Aplicación web de producción audiovisual en HTML, CSS y JavaScript. Interfaz en español y adaptable a escritorio, tableta y móvil. Incluye un visor propio basado en [PDF.js de Mozilla](https://mozilla.github.io/pdf.js/), distribuido en `vendor/` con sus recursos y licencias. El acceso requiere una cuenta de Firebase con correo verificado; los PDF y las anotaciones se procesan en el navegador. No requiere compilación.

## Proyectos privados en la nube

**Notas de versión automáticas:** consulta [NOTAS_DE_VERSION.md](NOTAS_DE_VERSION.md). Antes del próximo Push, cambia una vez **Settings → Pages → Source → GitHub Actions**. El flujo incluido publica la web y las novedades juntas; la lectura queda guardada por cuenta.

Esta versión incorpora **Mis guiones**, una biblioteca en el inicio con PDF originales, anotaciones y fichas técnicas asociados a cada cuenta mediante Supabase Free. La configuración pública está en `cloud-config.js`; el SQL y la Edge Function ya están instalados en el proyecto. Los cambios locales del frontend se publican en GitHub Pages mediante Commit y Push. Consulta **[NUBE.md](NUBE.md)** para las verificaciones, las protecciones de acceso y los límites. No se activa Firebase Blaze ni se contrata un plan de pago.

El guardado automático solo se confirma tras responder el servidor. Si falta conexión, los cambios pendientes permanecen en memoria de la pestaña y pueden exportarse a JSON. Hay protección contra sobrescrituras entre dispositivos. Los límites conservadores son 10 MiB por PDF, 10 proyectos por cuenta y 80 para el conjunto de la aplicación; se detienen operaciones cuando se agota una cuota. Las pruebas anteriores del editor aíslan la nube; `tests/cloud.cjs` comprueba esta integración con PostgreSQL WASM y JWT reales, sin tocar el proyecto del usuario.

## Exportar el PDF con cobertura

Abre el **menú del proyecto**, arriba a la derecha, y pulsa **Exportar PDF con cobertura**. Se descarga `nombre-del-guion-cobertura.pdf`, con todas las páginas originales, las líneas con sus remates, los resaltados con transparencia y los nombres de los planos con su color y Courier New negrita. Funciona desde cobertura y desde guion técnico, aunque la vista actual muestre una sola escena.

La exportación trabaja sobre el PDF original: conserva la portada, el texto seleccionable, las páginas escaneadas, los tamaños, los recortes y las rotaciones. No incluye los recortes visuales por escenas ni los colores de la interfaz; el zoom y el modo claro/oscuro no cambian la descarga. Los trazos se guardan como gráficos del PDF; solo las etiquetas de nombre se incrustan como pequeñas imágenes a alta resolución para admitir también caracteres Unicode y emojis. Si aún no hay anotaciones, descarga los bytes originales con el nombre de exportación.

Los títulos se colocan en los espacios seguros de las páginas originales y respetan sus posiciones manuales cuando caben sin tapar contenido. Las posiciones de los márgenes visuales de las escenas se recalculan si caen sobre texto del PDF original. Cuando un nombre no encuentra hueco, se añade a una hoja de **Referencias de cobertura** al final; su raya o resalte permanece en la página correspondiente. No se ensanchan las páginas originales ni se recortan nombres fuera de ellas.

El proceso se ejecuta en el navegador, sin subir el documento ni depender de Internet. La lectura y el historial no cambian; se usan los planos guardados al iniciar la exportación. La interfaz muestra el progreso y evita cambiar o cerrar el archivo durante la preparación. **Exportar notas** sigue generando una copia JSON para recuperar o continuar editando los planos en PLANO; el PDF exportado es la copia visual para compartir o imprimir.

## Apariencia del estudio

La interfaz utiliza superficies sólidas, tipografía editorial, bordes finos y una paleta de cobre y neutros. El inicio, la cobertura, las fichas, los formularios, la paleta de anotaciones y la tabla técnica comparten este diseño. No se aplican filtros al documento.

En la esquina superior derecha, **luna/sol** alterna entre modo claro y oscuro. El botón de **ajustes** abre un menú pequeño junto al control, con doce temas cerrados: **Predeterminado, Rojo, Café, Naranja, Amarillo, Verde, Celeste, Azul, Rosa, Violeta, Grises y Grises oscuros**. No hay selección libre de tonos para la interfaz. Cada tema tiene sus versiones clara y oscura; elegir un tema conserva el modo actual.

La selección se aplica inmediatamente y se guarda en la cuenta: otro dispositivo recupera el tema y el modo al iniciar sesión. El menú indica el estado del guardado y permite reintentar si falla la conexión. Una caché mínima por usuario conserva preferencias pendientes; se sincronizan al volver a conectar o entrar. La apariencia previa de `plano-appearance-v2` se adopta al activar esta versión en la primera cuenta del navegador, si esa cuenta aún no tiene preferencias. Sin almacenamiento de nube configurado se conserva el guardado local en `plano-appearance-v2`. Al recargar se elimina la clave antigua `plano-appearance-v1`, incluidos los tonos libres y el tema anterior, y se vuelve al predeterminado conservando solo el modo claro/oscuro. Esta limpieza no toca las notas ni los colores guardados de los planos, y las nuevas elecciones de tema se conservan normalmente. El tema predeterminado usa superficies grises neutras, también en oscuro. Pulsa fuera, el cierre o **Esc** para cerrar el menú. Si el almacenamiento no está disponible, funciona durante la sesión.

La personalización afecta exclusivamente a la interfaz: el PDF conserva sus colores, los de sus marcas, la portada visual, sus dimensiones y su posición de lectura. La **Vista de impresión** conserva el PDF original. No se altera el contenido del guion ni se incorpora la apariencia a las copias JSON de los planos.

## Abrir y usar

1. Abre la web publicada o sirve esta carpeta por HTTP en una versión actualizada de Edge, Chrome o Firefox. La primera pantalla permite crear una cuenta o iniciar sesión. Verifica tu correo para entrar al estudio. Una sesión verificada guardada entra directamente. Conserva las carpetas y archivos del proyecto juntos; abrir el archivo mediante `file://` no habilita la autenticación. Consulta [CUENTAS.md](CUENTAS.md).
2. El inicio muestra todos los guiones de tu cuenta con miniatura y título. Pulsa una tarjeta para abrirlo o **+ Nuevo guion** para seleccionar un PDF de hasta 10 MB; también puedes arrastrarlo a la biblioteca. Se guardará en tu cuenta, se analizará su texto y pasarás automáticamente a **Guion técnico / líneas de cobertura**. **Renombrar** en una tarjeta cambia su nombre; dentro del editor usa el lápiz junto al archivo o **Cambiar nombre** en su menú. Conserva el PDF y las anotaciones; las siguientes exportaciones usan el nombre nuevo. El modo local de desarrollo sin configuración de nube mantiene el límite anterior de 100 MB y muestra solo el archivo abierto.
3. En el icono **Vista del guion**, fijo en la cabecera derecha, elige **Guion completo** o **Vista de edición** para trabajar únicamente con las escenas y una tarjeta compacta de portada; una escena del grupo **Escena por escena** para concentrarte en ella; o **Vista de impresión** para ver todas las páginas originales del PDF. Todas las vistas tienen desplazamiento vertical continuo.
4. Usa **Resaltar** y selecciona un fragmento. Se abrirá una ventana que pide el **nombre del plano**; al guardarlo aparecerá en el documento y en el panel. Para una selección existente, o una selección táctil, pulsa **Resaltar selección**.
5. Usa **Línea recta** y arrastra entre dos puntos. Al terminar, escribe el nombre del plano y pulsa **Guardar plano**. Mantén **Mayús** para fijar una dirección horizontal o vertical. **Esc** cancela la línea en curso.
6. Las anotaciones se presentan como tarjetas: **nombre del plano**, una línea pequeña con **abreviatura del valor, angulación y óptica**, y la **descripción resumida a un máximo de 160 caracteres**, con hasta dos líneas visibles. Un icono de nota indica que hay observaciones. Pulsa la tarjeta o su título para abrir la **ficha completa**, sin recortar los textos. El documento sigue mostrando únicamente el nombre junto a la línea o el resalte.
7. El icono de **localización** de cada tarjeta (o **Ver en el guion** dentro de la ficha) lleva a la marca. El **lápiz** abre la edición directamente; también puedes pulsar **Editar plano** en la ficha. Allí se configuran nombre, valor, angulación, óptica, movimiento, color, **grip, sonido, descripción y notas**. En modo **Seleccionar**, pulsa una raya para mostrar sus extremos: arrastra el cuerpo para moverla o un extremo para cambiar el tamaño. Pulsar un resalte muestra una pequeña opción **Corregir resalte** junto al punto pulsado, sin abrir la ficha.
8. Arrastra el **asa de puntos** junto al nombre para ordenar los planos dentro de su escena. Una línea del color de acento marca dónde se insertará. También admite tacto y **Alt + flecha arriba/abajo** cuando el asa tiene el foco. **Esc** cancela un arrastre. El orden se guarda y admite deshacer/rehacer; no cambia los nombres, las marcas ni la secuencia automática. Si un plano tiene varias partes en la misma escena se ordenan juntas. El orden de otras escenas se conserva.
9. Junto al archivo aparecen **tres botones de etapa**: **Escribir guion**, bloqueado por ahora; **Líneas de cubrimiento**, el visor de cobertura; y **Guion técnico**, la tabla editable de los planos. El botón activo queda marcado. Las flechas izquierda/derecha permiten cambiar de etapa con el teclado. En pantallas pequeñas los tres botones ocupan una segunda fila, con etiquetas abreviadas en móvil.

La tabla agrupa los planos por escena y respeta el orden del panel. Tiene **diez columnas**: nombre, valor, angulación, óptica, movimiento, duración estimada, descripción, grip, sonido y notas. Se retiraron color, página y tipo de marca de esta vista; sus datos siguen conservándose en las fichas. Las partes de un mismo plano en la misma escena se reúnen en una fila. Las filas ajustan automáticamente su altura al texto completo de sus celdas, respetando saltos de línea y palabras largas. Los campos también crecen mientras se escribe, sin un desplazamiento interno que oculte contenido. Los encabezados tienen fondo de tinta, texto centrado de 14 px y negrita; las escenas usan bandas del color de acento con número y título en negrita. Un sombreado alterno discreto facilita seguir las filas. Los encabezados y el nombre del plano permanecen como referencia al desplazarse por la tabla, con fondo opaco.

**Pulsa cualquier celda para editarla directamente.** Los campos de texto permiten escribir; valor, angulación, óptica y movimiento ofrecen sus desplegables. Al elegir **Otro** se exige especificarlo antes de aplicar ese cambio. Elegir una opción conocida guarda la celda; el texto se guarda al salir de ella, mediante el botón de confirmación, con **Enter** para nombres o **Ctrl/Cmd + Enter** para textos de varias líneas. **Enter** normal en una descripción o nota introduce un salto de línea. **Tab** guarda y avanza a la siguiente celda; **Esc** o el botón de cancelación descarta el borrador. Las flechas permiten navegar entre celdas cuando no se está escribiendo. Un dato inválido requiere corrección o cancelación antes de cambiar de etapa.

Los cambios directos se sincronizan con el proyecto de la nube, se reflejan en cobertura y se pueden deshacer/rehacer durante la sesión; las distintas partes de un plano comparten las ediciones. La flecha pequeña junto al nombre abre la ficha completa para consultar o editar los demás datos. **Ver en el guion** vuelve a cobertura y localiza la marca. La etapa de escritura permanece deshabilitada; no se modifica el texto del PDF.

El valor es independiente del nombre y de su numeración automática: un plano llamado «1» puede tener valor «PA» sin que el siguiente deje de llamarse «2». El formulario muestra la abreviatura y el nombre completo de cada valor; la tarjeta conserva solo la abreviatura. **Sin definir** permite dejarlo pendiente (se muestra «—»). Las notas antiguas sin estos campos siguen funcionando. Toda la ficha técnica se conserva en el historial, el guardado local y las copias JSON; editar un plano entre páginas actualiza los datos de todas sus partes.

Grip, sonido, descripción y notas son campos de texto opcionales, disponibles también al crear un plano en el apartado desplegable **Descripción y producción**. Sus límites de guardado son 2000 caracteres para grip y sonido, 4000 para descripción y 3000 para notas. El recorte de la tarjeta es solo visual: el texto completo se conserva y aparece en la ficha. El antiguo campo **Información del plano** se conserva como **Notas**, sin perder su contenido. La ficha se cierra con el botón de cierre o **Esc**; se puede abrir mediante teclado desde el título de la tarjeta.

| Abreviatura | Valor de plano |
| --- | --- |
| GPG | Gran Plano General |
| PG | Plano General |
| PE | Plano Entero |
| PA | Plano Americano |
| PM | Plano Medio |
| PMC | Plano Medio Corto |
| PP | Primer Plano |
| PPP | Primerísimo Primer Plano |
| PD | Plano Detalle |
| P de 2 | Plano de 2 |
| P de 3 | Plano de 3 |
| P Conjunto | Plano Conjunto |

El catálogo reúne tamaños de encuadre y las composiciones de grupo solicitadas. Incluye **Plano Entero**, descrito entre los encuadres básicos en la [guía de Adobe sobre planos de cámara](https://www.adobe.com/es/creativecloud/video/production/cinematography/camera-shots-and-angles.html).

La ficha técnica incluye los siguientes catálogos, además de **Sin definir** y una opción **Otra/Otro**. Al elegirla aparece un campo de texto obligatorio, de hasta 140 caracteres, para especificar cuál. No permite guardar el formulario vacío o con solo espacios. Al volver a una opción conocida deja de exigirlo y se descarta la especificación al guardar. Las notas antiguas que ya contenían «Otro» sin detalle se conservan como «Otra · por definir» y requieren completarlo si se editan.

| Campo | Opciones |
| --- | --- |
| Angulación | Normal, picada, contrapicada, holandesa, nadir y cenital. |
| Óptica | Ultra gran angular, gran angular, angular (moderado), normal, teleobjetivo, superteleobjetivo, macro, ojo de pez, anamórfica y tilt-shift. |
| Movimiento | Ninguno (fijo), zoom in/out, pan right/left, tilt up/down, dolly in/out, travel in/out, seguimiento, truck right/left, pedestal up/down, grúa ascendente/descendente, arco/órbita derecha/izquierda, roll derecha/izquierda, dolly zoom, barrido/whip pan y aéreo. |

**Ninguno** expresa una cámara fija; **Sin definir** deja el movimiento pendiente. Se conservan «dolly» y «travel» como denominaciones elegibles solicitadas, aunque sus usos pueden coincidir según el equipo. Los movimientos adicionales incluyen los términos del [catálogo XMP Dynamic Media de Adobe](https://developer.adobe.com/xmp/docs/xmp-namespaces/xmp-dm/).

«Angular (moderado)», «Gran angular» y «Ultra gran angular» se ofrecen por separado. La nomenclatura y los límites varían entre clasificaciones: la [guía de Adobe](https://www.adobe.com/es/creativecloud/photography/discover/wide-angle-lens.html), por ejemplo, distingue angular estándar, gran angular y ultra gran angular. No se imponen límites fijos en milímetros, pues el campo de visión también depende del formato de captura. El código anterior `wide` se conserva como «Gran angular», de modo que siguen funcionando las notas guardadas.

Macro describe la capacidad de enfoque cercano y ampliación; puede coexistir con una focal de teleobjetivo, como muestra el [RF 85 mm Macro de Canon](https://sfcc-service.canon-europe.com/4234C005/4234C005.html). Aquí se ofrece como elección de óptica práctica; una combinación más concreta se puede precisar en la información del plano.

El campo propone un nombre de fondo y admite hasta 120 caracteres. **Guardar plano** con el campo vacío o solo espacios utiliza esa propuesta. **Cancelar** o **Esc** descarta la marca nueva, sin avanzar la secuencia. Los nombres se conservan en el guardado local, el historial y las copias exportadas; las notas antiguas sin nombre siguen siendo compatibles.

El primer nombre propuesto es **1**. Dentro de una escena se continúa desde el último plano guardado: **1 → 2**, **PA → PB → PC**, **P1 → P2**, **1A → 1B**, con acarreo de letras (**Z → AA**, **1AZ → 1BA**) y conservación de ceros iniciales (**P009 → P010**). Se toma el nombre efectivamente guardado, incluido un cambio manual del nombre. Un resalte entre páginas cuenta como un único plano. Si el nombre no termina en letras latinas ni cifras, se añade « 2» y se continúa numéricamente.

Al crear el primer plano de una escena nueva, se toma como referencia el **primer plano de la escena anterior con planos**, no su último plano. **1A, 1B, 1C** en una escena propone **2A** al comenzar la siguiente; **P1, P2, P3** propone **P2**, y **PA, PB, PC** propone **PB**. En nombres compuestos como **P1A** se propone **P2A**. Cada escena conserva después su propia secuencia, incluso si vuelves a editar escenas anteriores. La propuesta se calcula con las marcas existentes, por lo que borrar, renombrar o deshacer también afecta al siguiente nombre.

El selector de color de la barra afecta a las nuevas anotaciones. Tanto ese selector como el de **Editar plano** abren una paleta compacta con **ocho colores predeterminados** y un botón con **icono de paleta de pintura**. Al pulsar ese icono se despliega **Editar color**, con un espectro de tono y saturación, una barra vertical de brillo, muestra previa, hexadecimal de seis dígitos y campos **R, G y B** entre 0 y 255. Se pueden elegir colores con ratón, tacto o teclado en el espectro; los valores numéricos y la muestra se sincronizan. **Usar color** confirma el personalizado; cancelar lo descarta. Dentro de este editor, elegir un preset o un reciente cambia el borrador y requiere confirmación.

Los **últimos ocho colores personalizados creados** aparecen debajo **únicamente dentro de Color personalizado**, sin duplicados y del más reciente al más antiguo. Se guardan en este navegador entre documentos y sesiones. La paleta compacta mantiene ocultos los recientes. Elegir un color en el formulario de edición solo modifica el plano al guardar dicho formulario.

Los controles de zoom y **Ajustar** permiten modificar la lectura manteniendo la posición. Las anotaciones conservan su posición al cambiar de zoom, tamaño de pantalla o escena; una selección entre dos páginas pide un único nombre para sus partes, produce un resalte por página y se deshace como una sola acción.

## Nombres en el documento y edición

Las etiquetas de los planos tienen **relleno sólido del color del plano**, con el nombre en **Courier New negrita**. La tinta se elige automáticamente en blanco o negro para mantener contraste, sin depender del tema de la interfaz. Por defecto evitan colisiones; el menú de cada título permite habilitar superposiciones explícitas. Conservan la localización y el arrastre o fijación de los títulos.

Las líneas llevan pequeñas rayas perpendiculares en ambos extremos. Sus nombres se intentan colocar **a un lado del punto donde comenzaste el trazo**, también al dibujar de abajo hacia arriba o de derecha a izquierda. Los títulos de líneas se colocan antes que los de resaltados, incluso cuando estos tienen una posición manual. Si un trazo nuevo invade un título de resalte, se recoloca ese título; el trazo conserva las coordenadas dibujadas. Para los resaltados se sigue este orden estricto: **derecha o izquierda → arriba o abajo → blanco al final del encabezado de escena**. Ese último espacio está **después del texto del encabezado y antes del número del margen derecho**, cuando existe. No se colocan títulos junto al número izquierdo ni después del número derecho. Los títulos se disponen uno al lado del otro dentro del hueco. El motor comprueba los rectángulos del texto extraído, una máscara de tinta del PDF renderizado, todas las líneas (incluidos sus remates), los resaltes y los demás nombres. No acepta una posición que choque con esos obstáculos.

Si el hueco se agota o el nombre no cabe sin tapar contenido, los títulos restantes se ordenan en una zona auxiliar **debajo** del recorte o de la página, identificada como «Títulos sin espacio libre en el encabezado». Esta salida permite trabajar con nombres largos, muchas marcas, continuaciones sin encabezado y escaneos sin texto; no añade rótulos junto a los números de escena ni tapa el guion.

En **Seleccionar**, los títulos de línea se arrastran **a lo largo del trazo o al lado contrario**, sin separarse libremente de él ni sobrepasar sus extremos. Se guarda su posición proporcional y lado, de modo que acompañen a la línea cuando se mueve, cambia de tamaño o se modifica el zoom. Para líneas diagonales u horizontales se aplica el mismo vínculo respecto a su dirección. Los títulos de resalte mantienen el movimiento libre a espacios seguros del documento, del margen derecho y de los márgenes visuales superior e inferior de cada escena. También se pueden arrastrar los que se colocaron automáticamente junto al encabezado. La validación ignora texto y marcas que quedan fuera del recorte visible del PDF.

Con **clic derecho** sobre cualquier título, o **Mayús + F10** con el título enfocado, aparece **Mover sin proteger el contenido**. Permite colocar deliberadamente el nombre sobre texto, marcas u otros nombres; la opción cambia a **Volver a colocación protegida** para recuperar el ajuste al hueco seguro más cercano. Los resaltados se mueven en ambos ejes; los nombres de línea siguen ligados al recorrido y a los dos lados de la raya en los dos modos. Habilitar la colocación libre quita una fijación previa. En resaltados se conserva además **Fijar posición / Liberar posición**, que bloquea o habilita el arrastre de forma independiente. El modo, la posición y la fijación admiten historial, cuenta y copias JSON. El PDF exportado respeta las superposiciones elegidas explícitamente si el título cabe en la página original.

La previsualización muestra dónde se guardará el título. En modo protegido, si el punto elegido tapa contenido, busca el hueco cercano dentro de la página (búsqueda en pasos de 8 px del visor); en líneas, busca solo sobre su recorrido o al otro lado. El borde rojo indica que no hay un destino válido que quepa. **Esc** cancela el arrastre. Un clic corto sigue localizando el plano y mover el título no mueve su línea o resalte. Los títulos de **Títulos sin espacio libre en el encabezado** también se arrastran de vuelta a la página; se puede habilitar el modo libre si no hay huecos seguros. Los recortes, el zoom y la exportación usan las mismas reglas de colocación.

`tests/title-safety.cjs` comprueba arrastre desde el recuadro en ambos modos, superposiciones explícitas con texto y otras marcas, ajuste protegido cercano, vínculo de las líneas, menú dinámico, historial, zoom, validación JSON, recuperación y posiciones en el PDF exportado. Se puede repetir con Edge o Brave.

Pulsar el nombre **en el documento** localiza y destaca la marca. En el panel, pulsar la tarjeta o su título abre su ficha completa; la localización tiene un botón propio. El lápiz abre **Editar plano**, con nombre, ficha técnica, color, grip, sonido, descripción y notas. Los resaltes incluyen un extracto plegable del guion tanto en la ficha como en la edición. **Cancelar** o **Esc** descarta la edición; **Guardar cambios** actualiza el documento, el panel y el guardado local. Los cambios se pueden deshacer/rehacer. Cuando un plano nuevo abarca varias páginas, editar una de sus partes actualiza los datos de todas sus partes. Las anotaciones antiguas sin identificador de grupo se mantienen independientes.

Las rayas se manipulan directamente en **Seleccionar**, sin abrir el formulario de datos. Arrastrar el cuerpo traslada ambos extremos conservando su tamaño; arrastrar un punto de control cambia únicamente ese extremo. **Mayús** ajusta el cambio de tamaño a la dirección horizontal o vertical. **Esc** cancela el gesto y un clic fuera oculta los puntos de control. Se puede mover y redimensionar con ratón o con el dedo. Al enfocar la raya con el teclado, **Enter** la selecciona y las flechas la desplazan 1 px; al enfocar un extremo, las flechas modifican ese extremo. **Mayús + flechas** utiliza pasos de 10 px. Cada arrastre completado se deshace como una sola acción, conserva el nombre y el color, y se guarda al soltar. Las nuevas coordenadas se conservan al cambiar de vista, al exportar las notas y al volver a abrir el PDF. Se evita sacar la línea de la página o reducirla hasta hacerla desaparecer.

Al pulsar un resalte en **Seleccionar** aparece una opción pequeña **Corregir resalte**, sin abrir la ficha ni un modal. Pulsar fuera, **Esc** o desplazar el visor cierra esa opción. Al elegirla, el visor muestra una barra para seleccionar el texto nuevo y **Aplicar corrección**. La selección antigua sigue guardada hasta aplicar. La corrección sustituye todas las partes de ese resalte, conserva nombre, grupo, orden, color y ficha técnica, y se deshace como una sola acción. **Cancelar** o **Esc** deja el original intacto. Cambiar de herramienta también cancela la corrección pendiente. No se pide otro nombre ni se duplica el plano. Los títulos de resaltados se siguen moviendo libremente a blancos seguros; el vínculo al trazo se aplica exclusivamente a los títulos de líneas.

La vista técnica usa toda la ventana, con una barra compacta de herramientas y el panel de escenas y anotaciones a la izquierda. El icono de panel, arriba a la izquierda y junto al panel, permite ocultarlo. El icono de vista, a la derecha, abre un menú propio de la página con las vistas generales y las escenas agrupadas; sigue disponible al ocultar las anotaciones. La opción activa lleva una marca. Las flechas, Inicio y Fin recorren las opciones; Enter o espacio eligen, Escape cierra y Tab vuelve a los controles de la cabecera. Los encabezados largos se ajustan al ancho del menú en móvil. En pantallas de hasta 900 px se abre sobre el lado izquierdo del visor desde ese icono. El menú del proyecto, a la derecha, reúne volver al inicio, cambiar o cerrar el PDF, abrir el original y exportar/importar notas. Se retiró el bloque **Ayuda del visor**; los controles mantienen indicaciones breves al pasar el puntero.

El panel de anotaciones muestra **todas las escenas, en orden, con sus respectivos planos**, independientemente de la vista del visor. Cada división se puede plegar y muestra el encabezado y el número de planos de esa escena. El contenido anterior a la primera escena se agrupa por separado si contiene marcas. Se eliminó el selector «Vista actual / Todo el guion» de las anotaciones. Los contadores generales reflejan todas las marcas del documento; los botones de cada plano mantienen la localización y edición habituales.

Los textos de contenido de la interfaz usan principalmente 15–16 px, las herramientas 14 px y los metadatos 12 px. La portada conserva su estructura, con tipografía ampliada. En móvil las herramientas y el zoom se distribuyen en dos filas para mantener controles legibles. El tamaño del texto original del PDF se controla con el zoom del visor.

El motor dibuja los recortes cercanos a la zona de lectura y libera los lejanos para limitar el uso de memoria. Se conservan hasta ocho recortes dibujados, salvo los que deban permanecer por proximidad o por una selección activa. Las marcas se recuperan al volver a una escena. La página principal conserva su diseño.

En las vistas de trabajo se recorta el contenido visible de cada escena: se omiten las grandes zonas vacías del PDF, las cabeceras y pies periféricos repetidos y los números sueltos de página. Los números de escena se conservan. Se añade un margen blanco visual de **40 px arriba y abajo** de cada recorte (**30 px en móvil**), con una altura mínima para evitar que las escenas cortas queden comprimidas. Las marcas existentes y sus títulos manuales se tienen en cuenta al recortar; sus coordenadas siguen referidas al PDF original.

La información de la primera página de título se reorganiza en un bloque **del mismo ancho que las escenas**, con título, autor y los demás datos extraídos. Su altura crece con el contenido: la portada y sus datos no tienen scroll interno ni una altura máxima. Utiliza **Courier New** (con Courier y monoespaciada como alternativas), texto negro alineado a la izquierda y el título en negrita, independientemente de la tipografía del PDF subido. El tamaño del texto acompaña al zoom del guion, con un mínimo legible de 16 px en la presentación de trabajo. La portada aparece en las vistas generales de trabajo; no se añade a una escena individual. El resto del contenido previo a las escenas no se muestra como páginas del guion. Esta presentación es exclusivamente visual: **Vista de impresión** conserva la portada, los márgenes, los números, las cabeceras y los pies originales, sin aplicar la reorganización ni los recortes. No se reescribe el archivo PDF. Si no se detectan escenas, se ofrece abrir la vista de impresión para inspeccionar el documento.

Atajos fuera de los campos de texto: **V** seleccionar, **H** resaltar, **L** línea, **Ctrl/Cmd+Z** deshacer, **Ctrl/Cmd+Mayús+Z** rehacer. Los campos de notas mantienen sus atajos nativos de edición.

## Detección de escenas

Se extrae el texto de cada página, se reconstruyen las líneas a partir de sus posiciones y se buscan encabezados como:

```text
INT. CASA - DÍA
12 EXT. CALLE - NOCHE
3A. INT./EXT. COCHE - DÍA
ESCENA 7 - INTERIOR. CASA - NOCHE
I/E. COCHE - DÍA
```

Se admiten mayúsculas/minúsculas, numeración y variantes de INT./EXT. Los límites lógicos de una escena van **desde su encabezado hasta el siguiente**, incluso cuando comparten página. También se incluyen sus páginas de continuación. Dentro de esos límites, las vistas de trabajo se ajustan al texto y las marcas visibles y añaden un margen visual propio. **Guion completo** y **Vista de edición** muestran solo las escenas, con la información de portada resumida en una tarjeta. Los recortes de una misma página tienen identidades independientes, de modo que las marcas y la navegación se mantienen en la escena correcta. El texto oculto por un recorte no participa en las selecciones. **Vista de impresión** conserva todas las páginas originales y permite consultar cualquier contenido que no se haya clasificado como escena.

La detección es una heurística de encabezados y necesita revisión: guiones con otra estructura, encabezados partidos, texto con orden de lectura inusual o columnas pueden producir omisiones o falsos resultados. La identificación de cabeceras y pies utiliza posición, repetición y patrones de numeración. Un PDF escaneado sin capa de texto no permite detectar escenas ni seleccionar palabras; puede abrirse en **Vista de impresión**, que mantiene disponible el dibujo y ajuste de líneas. Esta versión no incluye OCR.

## Guardado y copias

- El PDF se procesa en el dispositivo; con la nube configurada, el original se sube de forma privada a tu cuenta una sola vez.
- Las nuevas anotaciones se sincronizan con la nube y no se escriben en `localStorage`. **Mis proyectos** permite recuperar PDF y notas desde otro dispositivo. El modo local de desarrollo sin configuración de nube conserva el comportamiento anterior de notas locales; no debe confundirse con un guardado en la cuenta.
- Se usa la huella SHA-256 de todo el archivo para asociar sus notas cuando Web Crypto está disponible; en otros contextos se utiliza la huella de PDF.js. Renombrar el archivo no afecta a la recuperación.
- **Exportar notas** descarga un JSON con las marcas, nombres, orden de planos, colores, texto seleccionado, coordenadas, posiciones manuales o ligadas de títulos y ficha de plano. **Importar notas** permite recuperarlas junto al PDF correspondiente, conservando las existentes y evitando duplicados por identificador. Los colores recientes pertenecen al navegador y no al JSON de un documento.
- Si falla el guardado en la nube se muestra un aviso y los cambios pendientes permanecen en memoria de la pestaña. Reintenta o exporta una copia antes de cerrar. Los proyectos ya confirmados en la nube no dependen del almacenamiento local del navegador.
- Las anotaciones son una capa de la aplicación: **no se incrustan en el PDF original**. El botón **PDF original** abre la copia sin las marcas de PLANO. El JSON exportado necesita su PDF original para restaurarse.

Los PDF dañados y protegidos con contraseña muestran un aviso y no reemplazan el trabajo abierto. Esta versión requiere una copia sin contraseña.

## Archivos

- `index.html`: importación, espacio de cobertura, controles y panel de notas.
- `styles.css`: diseño de la página principal.
- `editor.css`: espacio de cobertura compacto, visor continuo y panel desplegable.
- `appearance.css`: diseño del estudio, superficies y componentes compartidos, adaptación móvil y ventana de apariencia.
- `appearance-account.js`: sincroniza el tema y el modo por cuenta, con caché aislada y recuperación sin conexión.
- `appearance.js`: doce temas cerrados, claro/oscuro, contraste y persistencia independiente del PDF; se carga antes de mostrar la página.
- `compact-popovers.js`: posicionamiento de menús anclados, límites de pantalla, reajuste con desplazamiento y cierre por Escape.
- `app.js`: carga, renderizado, selección, líneas, historial, guardado y copias.
- `scene-analysis.js`: reconstrucción de líneas, detección/límites de escenas, recortes de trabajo y extracción de datos de portada.
- `shot-names.js`: secuencias automáticas de nombres dentro de las escenas y entre ellas.
- `shot-values.js`: catálogos de valor, angulación, óptica y movimiento, formularios y selectores compartidos.
- `shot-order.js`: arrastre de tarjetas con ratón/tacto, desplazamiento del panel y alternativa de teclado.
- `shot-colors.js`: paleta compartida, editor visual HSV, RGB/HEX y ocho colores personalizados recientes.
- `technical-script.js`: tabla compacta por escenas, edición de celdas con validación, navegación de teclado y acceso a las fichas.
- `label-layout.js`: búsqueda ordenada de espacios sin colisiones y validación de posiciones manuales.
- `document-labels.js`: medición de nombres, texto e imagen del PDF y rótulos interactivos.
- `pdf-export.js`: marcas sobre el PDF original, transformación de coordenadas, etiquetas y referencias de cobertura.
- `vendor/`: PDF.js 5.6.205, workers, fuentes, mapas de caracteres, decodificadores y licencias. Las bibliotecas están preparadas para uso directo; los recursos se incluyen localmente para evitar depender de CDN y admitir `file://`.
- `tests/run.cjs`: pruebas automáticas con PDF de ejemplo generado durante la prueba.
- `tools/build-vendor.cjs`: reconstrucción opcional de las bibliotecas distribuidas.
- `tools/copy-pdf-lib.cjs`: copia del motor de exportación pdf-lib 1.17.1 y su licencia.

## Verificación de desarrollo

Las pruebas requieren Node.js, los paquetes `playwright` y `pdf-lib`, y Microsoft Edge instalado. Con esas dependencias disponibles:

```powershell
node tests/run.cjs
node tests/scenes-view.cjs
node tests/line-editing.cjs
node tests/compact-scenes.cjs
node tests/shot-values.cjs
node tests/workspace-interactions.cjs
node tests/stages-and-colors.cjs
node tests/appearance.cjs
node tests/refinements.cjs
node tests/presentation.cjs
node tests/pdf-export.cjs
```

Por defecto prueban la apertura directa de `index.html`. Para comprobar un servidor estático:

```powershell
$env:PLANO_TEST_URL = 'http://127.0.0.1:8765'
node tests/run.cjs
```

Opcionalmente `PLANO_RUNTIME_MODULES` indica una carpeta existente de `node_modules`. Los PDF de prueba, copias y capturas se generan en `tests/.output/`, excluida de Git. Las pruebas comprueban las prioridades de colocación y colisiones con texto, líneas, resaltes y otros nombres usando las posiciones reales del navegador, incluido un conjunto de 20 marcas; remates en líneas; secuencias de nombres; guardar sin escribir nombre; arrastre válido e inválido, persistencia de su posición con zoom, escenas, copias e historial; localización y edición; cambios de nombre, color e información; edición entre páginas; compatibilidad antigua, lectura continua y tamaños de 390, 768 y 1024 px. También comprueban carga y liberación de páginas con un guion de 16 páginas. `tests/scenes-view.cjs` comprueba el hueco entre texto y número derecho con un encabezado que lleva números a ambos lados, la alineación de varios títulos, el panel agrupado sin filtro, las tres formas de lectura y la selección y navegación entre escenas que comparten una página.

`tests/line-editing.cjs` comprueba la selección sin diálogo, el movimiento y ajuste de ambos extremos, cancelación, tamaño mínimo, límites, teclado, deshacer/rehacer, acceso a la corrección de resaltados, guardado y exportación de las nuevas coordenadas. Incluye arrastres táctiles reales con Chromium para mover y redimensionar sin desplazar accidentalmente el visor.

`tests/compact-scenes.cjs` genera un guion con portada, cabeceras, pies, números de página y escenas entre varias páginas. Comprueba la tarjeta de portada, el recorte al contenido de las escenas, los márgenes visuales y el diseño móvil. Compara píxel a píxel la portada y una página interior de **Vista de impresión** con un renderizado nuevo del PDF original, y verifica que los bytes del archivo permanezcan intactos.

`tests/shot-values.cjs` verifica las tarjetas de lectura, su jerarquía visual, el límite de descripción, el indicador de notas, la ficha completa, teclado y localización independiente. Comprueba los campos obligatorios de «Otro» al crear y editar, el texto de grip/sonido/descripción/notas en líneas y resaltes, cancelación, historial, numeración independiente, copias JSON, recuperación local, grupos entre páginas y compatibilidad con notas antiguas. Incluye tarjetas, ficha y edición en móvil; rechaza datos inválidos sin modificar el trabajo.

`tests/workspace-interactions.cjs` comprueba el orden de tarjetas con ratón, teclado y tacto; la prioridad de los títulos de línea frente a resaltes; su arrastre ligado, cambio de lado y seguimiento al mover la línea; corrección de resaltados y eliminación de partes sobrantes entre páginas. Verifica presets, conversión RGB/HEX, validación de colores, cancelación, ocho recientes sin duplicados, paleta dentro de edición, historial, copias y recuperación de órdenes y posiciones. Incluye móvil.

`tests/stages-and-colors.cjs` verifica los tres botones de etapa y el bloqueo de escritura, las diez columnas y la altura compacta de las filas. Edita directamente nombre, valor, angulación, óptica, movimiento, descripción, grip, sonido y notas, incluyendo «Otro» obligatorio, cancelación, Tab, saltos de línea, Ctrl + Enter, guardado al cambiar de celda, historial y recuperación al reabrir el PDF. Comprueba que las partes de un plano se sincronizan sin alterar geometría, color u orden. También verifica las fichas completas, retorno a cobertura, espectro de color, teclado, brillo, RGB/HEX, recientes condicionados y diseño móvil.

`tests/appearance.cjs` comprueba los doce temas en claro y oscuro, contraste AA, persistencia, datos inválidos y almacenamiento bloqueado. Verifica el menú compacto, teclado, edición y tamaños entre 320 y 1540 px, además de la conservación de píxeles, bytes, marcas y posición del PDF al cambiar de tema.

`tests/refinements.cjs` reproduce un título colocado junto al encabezado de escena, lo arrastra a los márgenes superior e inferior ignorando contenido oculto y comprueba fijar/liberar, historial, recuperación y JSON. Comprueba controles reubicados, tarjetas de menos de 150 px, paletas compactas y la cabecera de tabla con 71 planos al desplazarse. Incluye capturas y menús dentro de los límites de la pantalla móvil.

`tests/presentation.cjs` comprueba la limpieza de preferencias antiguas sin borrar notas ni colores, el oscuro neutro, el menú de vistas con ratón/teclado y en móvil, etiquetas con relleno y contraste, y los encabezados centrados y escenas en negrita. Genera capturas del menú, las etiquetas y la tabla en claro y oscuro.

`tests/pdf-export.cjs` necesita también `pngjs`. Comprueba descargas reales desde cobertura y tabla, el documento sin marcas idéntico byte a byte, texto seleccionable, portada idéntica en píxeles, líneas/remates/resaltes en páginas giradas 0/90/180/270 grados y CropBox con UserUnit, escaneos, nombres Unicode, referencias al final, independencia de tema/zoom, limpieza y recuperación ante errores. Guarda PDF de ejemplo y capturas de su renderizado en `tests/.output/`.

El bundle de exportación ya está incluido. Para volver a copiarlo desde `pdf-lib` **1.17.1** instalado, ejecuta `node tools/copy-pdf-lib.cjs` (o pasa la ruta absoluta del paquete como argumento).

Para reconstruir `vendor/`, usa `pdfjs-dist` **5.6.205** y `esbuild` **0.28.2** y ejecuta:

```powershell
node tools/build-vendor.cjs RUTA_A_PDFJS_DIST RUTA_A_ESBUILD
```

## Pendiente

El sistema de cuentas está integrado con Firebase Authentication y conectado a la app web `planos-15624` mediante su configuración pública en `auth-config.js`. Requiere Email/Password habilitado y el dominio autorizado en Authentication. Sigue [CUENTAS.md](CUENTAS.md) y comprueba los ajustes con `node tools/check-accounts.cjs`. El registro o inicio de sesión con correo verificado es obligatorio para acceder al editor. Supabase conserva los PDF y sincroniza las anotaciones entre dispositivos como se describe en [NUBE.md](NUBE.md).

La escritura/edición del guion literario, detección de personajes, importación de otros formatos y OCR todavía no están implementados.

## Exportar guion técnico a Excel

En la etapa **Guion técnico**, pulsa **Exportar Excel**. También está disponible en el menú del proyecto como **Exportar guion técnico a Excel**. Descarga `nombre-del-guion-guion-tecnico.xlsx`, con todos los planos, aunque estés viendo una sola escena. Debe haber al menos un plano. La celda que estés editando se guarda antes de exportar; si falta un valor obligatorio, debes completarlo o cancelar la edición.

El libro mantiene el orden de las tarjetas, las escenas detectadas y todos los campos técnicos. Las partes de un mismo plano no se duplican dentro de una escena. Si un plano abarca varias escenas, figura en cada una con el mismo nombre. El mensaje de descarga cuenta planos únicos. No exporta color, página ni tipo de marca como columnas.

El diseño recupera la disposición de las plantillas facilitadas: título centrado en una franja gris oscura, ficha de proyecto/equipo en gris claro con campos blancos y tabla desde la fila 14. Se conservan los puestos y la posición de los campos del equipo, sin importar datos personales del ejemplo. No utiliza cobre, beige ni colores del tema de la web.

Las columnas siguen el orden de la referencia: **escena, plano, valor, angulación, óptica, movimiento, grip, sonido, descripción y notas**, con **duración estimada** añadida al final. No se añade la columna de encabezado de escena. El número de escena se muestra en una celda combinada que agrupa sus planos. Grip y notas mantienen las combinaciones horizontales de la referencia. La tipografía es Arial, con títulos y nombres en negrita, texto técnico centrado y textos de producción a la izquierda. Una línea gris más marcada separa las escenas; las celdas del cuerpo usan gris muy claro y bordes discretos.

Incluye las catorce primeras filas y tres columnas identificativas inmovilizadas, listas desplegables para los cuatro campos de catálogo (también admiten escribir valores propios), texto multilínea y altura ajustada. No añade filtros automáticos sobre celdas combinadas. Los textos que superarían la altura máxima de Excel se reparten en filas consecutivas, manteniendo nombre y valores técnicos combinados para que sigan siendo un único plano. No se descarta contenido. Los campos ausentes quedan vacíos, los nombres son texto (por ejemplo `01A`) y la fecha de exportación es una fecha real. No se crean fórmulas con textos escritos por el usuario.

La cabecera usa el nombre del PDF y la fecha local de exportación. Dirección, producción, asistente de dirección, fotografía, sonido y diseño de producción se dejan vacíos para completarlos en Excel: la aplicación aún no tiene esos datos y no copia el equipo del ejemplo. Todo el libro es editable y no está protegido. Los cambios en Excel no se sincronizan de vuelta con la web.

Impresión configurada en **A3 horizontal**, ajustada a una página de ancho y tantas de alto como requiera el contenido, encabezados de columnas repetidos y número de página en el pie. Se puede cambiar el papel desde Excel. La apariencia del archivo es independiente del modo oscuro/claro y del tema de la página. No modifica el PDF ni las anotaciones.

La generación ocurre en el navegador, sin red, también al abrir `index.html` directamente. `excel-export.js` prepara el modelo a partir de las mismas secciones que la tabla; `vendor/exceljs.min.js` y `vendor/excel-template.js` se cargan solo al exportar. Incluye licencia y versión fija. Para reconstruir el bundle: `node tools/copy-exceljs.cjs RUTA_AL_PAQUETE_EXCELJS_4_4_0`.

La plantilla base se reconstruye con `node tools/build-excel-template.mjs`, usando el runtime de hojas de cálculo de Codex y una unión `tools/node_modules` a sus dependencias (`@oai/artifact-tool` y `jszip`). No se necesitan esas dependencias para usar la página. El proceso genera una vista previa de revisión en `tests/.output/` y empaqueta la plantilla en un script para funcionar bajo `file://`. `tools/verify-excel.mjs RUTA_XLSX` inspecciona y renderiza un archivo sin modificarlo.

`node tests/excel-export.cjs` prueba descargas reales offline, edición pendiente, orden de planos, agrupación de partes, planos que cruzan escenas, campos personalizados, nombres con ceros iniciales, textos Unicode y multilínea, continuación sin pérdida de textos largos, listas, paneles, impresión y recuperación ante fallos. Verifica además el orden de las columnas originales y la duración añadida, posiciones de los campos de la cabecera, combinaciones de escena/grip/notas, paleta neutra y tipografía. Reabre el archivo con ExcelJS; también se ha inspeccionado con openpyxl en modo lectura y renderizado con Artifact Tool. Las pruebas usan `PLANO_RUNTIME_MODULES` como el resto de la suite.


### Líneas de cobertura entre páginas

Con **Línea**, arrastra desde el inicio del plano hasta su fin en otra página. Al acercar el puntero al borde superior o inferior del visor, el documento se desplaza automáticamente. Con **Seleccionar**, pulsa una línea y arrastra su extremo para prolongarla o acortarla, también entre páginas. Escape cancela el gesto completo y deshacer/rehacer conserva la operación como un solo cambio.

Puedes mantener sujeto el extremo y desplazar el guion con la rueda sin mover el ratón: el extremo se recalcula al desplazarse el documento y se guarda al soltar. El visor completo conserva la captura durante el gesto, aunque se abandone el SVG de la hoja inicial.

Al seleccionar una línea aparece el botón compacto **Continuar línea**. Prolonga el mismo plano a la página siguiente y lleva al extremo nuevo para ajustarlo; no crea otra ficha ni pide otro nombre. Si la vista por escenas ocultaba esa página, muestra el guion completo para continuar. Cada pulsación es un único paso de deshacer/rehacer. En la última página se desactiva.

Un plano largo mantiene una única ficha, nombre, color y posición en el guion técnico. En el documento se dibuja un tramo por página con el mismo nombre; los remates solo señalan el inicio y el fin reales. La ficha indica el rango de páginas. El PDF exportado incluye todos los tramos, incluso si está seleccionada otra vista del guion. El guardado de cuenta y las copias JSON conservan la página final mediante el campo opcional `endPage`; las líneas antiguas siguen funcionando.

`coverage-lines.js` centraliza la proyección de la línea entre páginas, compartida por el visor, los recortes por escena y la exportación. `node tests/multipage-lines.cjs` verifica arrastre real entre dos y tres páginas de distintas alturas, prolongación desde el extremo, remates, autoscroll, cancelación, historial, recuperación, ficha única y PDF exportado. `tests/cloud.cjs` comprueba también la recuperación de esta geometría desde otra sesión de cuenta.

`node tests/line-continuation.cjs` reproduce la regresión de sujetar el extremo y usar únicamente la rueda. Usa los ejecutables de Brave y Edge, un visor de 1366 × 650 con zoom normal y las cuatro vistas. Comprueba también el botón para continuar entre escenas, la última página, la identidad del plano, el historial y el diseño móvil.


### Copiar y pegar planos

Selecciona una línea y pulsa **Copiar plano** en su barra de acciones, o usa **Ctrl+C**. Un clic en un resaltado ofrece también **Copiar plano** junto a la corrección; la ficha completa incluye el mismo botón. **Ctrl+V** abre una caja con dos opciones, cualquiera que fuera el tipo del original:

- **Como línea** crea el plano directamente, conservando el color, todos los campos técnicos, los textos de «Otro», grip, sonido, descripción y notas. Una línea copiada conserva su longitud y la posición relativa de su título; se coloca desplazada en la zona de lectura, ajustando su posición para caber en el documento. Un resaltado se convierte en una línea que cubre su intervalo de texto.
- **Como resaltado** bloquea las herramientas, la navegación, los cambios de cuenta y los controles del documento. La barra indica que hay que seleccionar el texto de destino. Al terminar la selección con el ratón se pega automáticamente; para selección con teclado se puede pulsar **Pegar en selección** o Enter. **Cancelar** o Esc abandona el pegado. Las herramientas, el modo y el panel vuelven a su estado anterior.

Cada pegado recibe identificadores nuevos y el siguiente nombre al último plano colocado, siguiendo la secuencia de números/letras ya existente y evitando nombres ocupados. La numeración solo se consume al confirmar el pegado. La copia tiene una ficha independiente del original; sus tramos entre páginas comparten el mismo nombre e identificador de plano. La nueva selección y la colocación de sus títulos se calculan de nuevo para evitar arrastrar posiciones fijadas sobre texto distinto. El pegado completo es un único paso de deshacer/rehacer y usa el guardado habitual de la cuenta y las exportaciones.

El portapapeles de planos es interno y permanece en memoria en este documento y cuenta. No copia datos privados al portapapeles del sistema, no persiste al recargar y se limpia al cerrar el documento o cambiar de cuenta. Copiar/pegar texto en formularios y copiar texto seleccionado del PDF conserva su comportamiento normal.

`shot-copy.js` prepara las copias, metadatos, nombres y geometría. `node tests/shot-copy.cjs` verifica las cuatro conversiones, una copia inmutable, metadatos completos, nombres consecutivos, líneas largas, menús, Ctrl+C/V, bloqueo y recuperación, selección real de texto, selección entre páginas, cancelación sin huecos de numeración, historial, recuperación y móvil. Para repetir con Brave: establece `PLANO_BROWSER=brave` además de `PLANO_RUNTIME_MODULES`.

### Color de varios planos

Marca las casillas de las tarjetas en **Anotaciones** y pulsa **Color** en la barra de selección. Utiliza la misma paleta compacta de ocho colores y su editor personalizado con HEX/RGB. La casilla superior selecciona todos los planos del documento, incluidas las escenas plegadas; **×** quita la selección. Las tarjetas conservan sus acciones habituales para abrir, editar, localizar y ordenar.

El cambio afecta todos los tramos de cada plano seleccionado, incluso resaltados repartidos entre páginas. Conserva los demás datos y se deshace o rehace en un solo paso. Los colores usan el guardado habitual de la cuenta, las copias y el PDF exportado. La selección es temporal: se limpia al abrir otro documento, cerrar el actual o cambiar de cuenta.

`node tests/batch-colors.cjs` comprueba la selección entre escenas y páginas, grupos plegados, paleta personalizada, un único paso de historial, recuperación, bloqueo al pegar un resaltado y uso móvil.

### Miniaturas de la biblioteca

`script-preview.js` genera una imagen JPEG pequeña de la primera página original (hasta 180 × 252 px y 20 KB), sin anotaciones ni efectos del tema. Se guarda en el payload privado de la cuenta. La migración `20261022223701_library_previews.sql`, ya instalada, incluye solo esa miniatura en el listado, junto a los metadatos del archivo; no envía las anotaciones ni descarga los PDF completos para mostrar tarjetas.

Los guiones anteriores sin miniatura se preparan uno a uno en segundo plano al visitar el inicio. Esa primera preparación requiere descargar el PDF una vez. Se guarda conservando el resto del payload y comprobando su revisión; un conflicto no sobrescribe las notas de otro dispositivo. Si falla, permanece una tarjeta de documento y se puede abrir el guion normalmente. Las siguientes visitas recuperan la miniatura con el listado. La caché de imágenes es solo de memoria y se limpia al cambiar de cuenta; no hay PDF ni miniaturas en localStorage. Si las notas rozan el límite de 350 KB, se omite la miniatura para priorizar el guardado del trabajo.

`tests/cloud.cjs` verifica biblioteca, miniaturas entre dispositivos sin nueva descarga del PDF, preparación de guiones anteriores, renombrado desde inicio/editor, validación del nombre, botón +, apertura, separación de cuentas y móvil. `tests/stages-and-colors.cjs` comprueba la expansión de las filas y de los campos de texto con sonido largo, además de la edición, el historial y la persistencia existentes.

### Duración, fragmentos y segunda ventana

La tabla incluye **Duración est.**, automática y en formato minutos:segundos. Se calcula sobre la geometría normalizada de las páginas originales: la altura cubierta por una línea es una fracción de 60 segundos por página; se suman los tramos entre páginas y se unen los superpuestos. En resaltados se usa su extensión vertical y, para una sola línea de texto, la proporción horizontal seleccionada. Es una referencia de planificación, independiente del zoom y de los márgenes visuales de las escenas. Cambia al modificar la marca y aparece también en el Excel, conservando la plantilla anterior y añadiendo una columna al final. La tabla ofrece una papelera discreta por plano; elimina todas sus partes y admite deshacer.

En la ficha de una línea, **Seleccionar texto del guion** permite vincular un fragmento exacto. Conserva el borrador del formulario y bloquea las otras acciones mientras eliges el texto; **Listo** vuelve a la ficha, donde **Guardar cambios** confirma todo. Cancelar o Esc conserva el borrador anterior. **Usar automático** restaura la detección según el tramo de la línea. No se crea un plano nuevo ni un resaltado visible; el vínculo conserva texto y coordenadas, se guarda en la cuenta y en las copias JSON, y admite historial. Los planos copiados calculan su fragmento a partir de su nueva posición.

El **ojito** de cada fila muestra una vista previa breve tras mantener el puntero encima unos 450 ms. Un clic abre el fragmento completo en una ventana de lectura. Los resaltados usan el texto seleccionado; las líneas usan el vínculo manual si existe o el texto detectado dentro de su tramo. Si el PDF es escaneado y carece de texto seleccionable, se indica que no se ha detectado texto.

Con **clic derecho en Guion técnico → Abrir en otra ventana** se abre la misma tabla, editable, junto al editor. Ambas vistas comparten un único documento, historial y guardado; no se vuelve a subir el PDF ni se inicia una segunda escritura en la nube. Los cambios confirmados se reflejan inmediatamente, también los borrados y el tema. Un borrador de celda no puede sobrescribir silenciosamente un cambio simultáneo del mismo campo. Esta ventana necesita que el editor principal continúe abierto; al cerrar el documento, cambiar de cuenta o recargar el editor, se retiran sus datos y hay que abrirla de nuevo. El navegador debe permitir la ventana emergente.

`tests/shot-tools.cjs` prueba la duración, el color al crear, los títulos en negrita, el bloqueo de selección con Listo, cancelación, borradores, historial, persistencia, vista previa, borrado y edición entre ventanas con conflicto de celda e invalidación. Admite Edge y Brave mediante `PLANO_BROWSER`.

### Correcciones de redacción

La herramienta **Correcciones**, junto a Línea y Resaltar, también se activa con **R**. Muestra la indicación de seleccionar el texto y lo marca con un **subrayado rojo en zigzag**, respetando las palabras y los saltos de línea. La selección con ratón se guarda al soltar; con teclado o selección táctil se puede usar **Marcar corrección**. **Terminar**, **V** o Esc vuelve a Seleccionar. No intenta detectar ni sustituir automáticamente las palabras del PDF.

Cada selección es una única corrección, incluso si abarca varias páginas. El apartado **Correcciones** del panel muestra su texto y páginas; permite localizarla y quitarla. En Seleccionar, un clic en el subrayado también ofrece **Quitar corrección**. Las correcciones tienen su propio registro y no consumen la numeración ni aparecen en la tabla o el Excel de planos. Comparten el historial de deshacer/rehacer con la cobertura y se guardan en la cuenta, en las copias JSON y en el PDF con cobertura, donde se dibujan como trazos vectoriales. La importación conserva lo existente y evita duplicados por identificador.

El campo `corrections` es opcional en los documentos anteriores; no modifica la estructura de los planos ni requiere cambiar el servidor de almacenamiento. El cliente valida las selecciones al abrirlas, con un máximo de 1000 correcciones por documento y el límite total de almacenamiento existente. Un PDF escaneado necesita una capa de texto seleccionable para poder marcar una selección.

`tests/script-corrections.cjs` comprueba selección real, zigzag, eliminación, historial conjunto con planos, zoom, selección entre páginas, recuperación, JSON sin duplicados, texto original y subrayados visibles en el PDF exportado, cierre y diseño móvil. `tests/cloud.cjs` verifica la recuperación desde otra sesión de cuenta.

### Verificación del rendimiento

El motor PDF y sus recursos se cargan al abrir un documento: el inicio evita descargar unos 3,6 MB hasta necesitarlos. Las cargas simultáneas de una misma biblioteca comparten petición. La tabla técnica se prepara al entrar en su etapa; los movimientos del trazo se agrupan por fotograma y las páginas reemplazadas liberan sus lienzos. El visor conserva el límite de ocho páginas renderizadas al desplazarse por documentos largos.

Con Node y las dependencias de las pruebas disponibles, ejecuta `node tools/run-checks.cjs` para comprobar las funciones del editor, las exportaciones, las cuentas, la nube y las notas de versión. Usa un máximo de dos procesos simultáneos y mide el rendimiento por separado. No crea cuentas reales ni envía correos; la nube se comprueba con un servidor de prueba aislado. Los informes se guardan en `tests/.output/`, fuera de Git y de la publicación.

`node tests/performance.cjs` usa un PDF de 48 páginas y 400 planos para comprobar la carga diferida, la tabla oculta, la liberación de lienzos, las páginas residentes y una ráfaga de 80 movimientos. Guarda las mediciones en `tests/.output/performance-after.json`; los tiempos dependen del equipo. `PLANO_RUNTIME_MODULES` puede apuntar al directorio de módulos del entorno. Para repetir las pruebas compatibles con Brave, usa `PLANO_BROWSER=brave`. La prueba del formulario de correo funciona sin ventana; `PLANO_INPUT_HEADFUL=1` habilita su comprobación interactiva en Brave.
