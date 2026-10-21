# Guardado privado de proyectos

El servidor está instalado en el proyecto Supabase **hoymkaxarjkgttkgocrn**, conservando las cuentas Firebase de **planos-15624**. Se confirmó el plan **Free** y se desplegaron la migración `20261021001829_plano_private_cloud` y la función `plano-cloud`, versión 1. La página pública empezará a usarlo cuando se publiquen los cambios locales de este repositorio en GitHub Pages.

La instalación se verificó el **20 de octubre de 2026 (America/Bogota)**: bucket privado de 10 MiB, tablas con RLS, ausencia de permisos de lectura/ejecución para `anon` y `authenticated`, y acceso de servidor mediante `service_role` sin `SECURITY DEFINER`. Una prueba SQL con el rol de servidor comprobó guardado, aislamiento entre propietarios y rechazo de una revisión antigua; se revirtió su transacción y no dejó proyectos ni contadores ficticios. El endpoint real rechaza sesiones ausentes/inválidas y orígenes ajenos; la URL y clave pública coinciden con este proyecto. La prueba final de subir/abrir un PDF con una cuenta Firebase real queda para después de publicar el frontend.

Los asesores no devolvieron alertas WARN/ERROR para la instalación. Los avisos informativos [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) son intencionales: ningún cliente accede directamente a esas tablas; solo la función del servidor. El índice recién creado aparece como [todavía no utilizado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), algo esperable antes de tener proyectos.

## Reinstalación en Supabase Free

Estos pasos ya se completaron en el proyecto actual; se conservan para reinstalarlo en otro entorno. Usa una organización **Free**, sin tarjeta, sin suscripción de pago y con este proyecto dedicado a PLANO. No actives Firebase Blaze. El código no llama a ninguna API de facturación ni cambia planes. Los límites del código son protecciones adicionales; el plan contratado en Supabase es lo que determina la facturación. Si alguien cambia el plan o usa el proyecto para otras aplicaciones, estos límites no controlarán esos otros consumos.

1. En el SQL Editor del proyecto ejecuta **supabase/migrations/20261021001829_plano_private_cloud.sql**. Crea las tablas privadas, la función SQL y el bucket privado `plano-pdfs`. Puede ejecutarse de nuevo sin borrar proyectos. No añadas políticas públicas a ese bucket ni a las tablas.
2. Crea una Edge Function llamada **plano-cloud**. Se puede desplegar la carpeta `supabase/functions/plano-cloud` con la CLI de Supabase o pegar el contenido de **supabase/plano-cloud.deploy.ts** en el editor del panel. Ese archivo se genera con `node tools/build-cloud-function.cjs`.
3. Configura `FIREBASE_PROJECT_ID=planos-15624` y `ALLOWED_ORIGINS=https://rodvelsantiago-777.github.io`. Para desarrollo local añade los orígenes concretos, separados por comas. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables internas que Supabase proporciona a la función: **nunca se copian al frontend ni se comparten en el chat**.
4. En esta función desactiva la comprobación automática «Verify JWT» de Supabase, como indica `supabase/config.toml`. Esta comprobación espera tokens de Supabase; nosotros verificamos los de Firebase dentro de la función. No elimines esa verificación del código: valida firma RS256 con claves públicas de Google, proyecto emisor, audiencia, caducidad, fecha de autenticación y correo verificado antes de tocar los datos.
5. Comprueba que el proyecto sigue siendo Free. Despliega/publica el frontend por el procedimiento habitual de GitHub Pages. Entra con una cuenta verificada, sube un PDF y espera «Guardado en la nube». Abre «Mis proyectos» desde otro navegador y comprueba PDF, planos y notas. Esta comprobación real es necesaria después de instalar; las pruebas locales no sustituyen la configuración del servidor.

No se necesita migrar usuarios ni crear una integración Third-party Auth ni añadir custom claims de Firebase: la Edge Function verifica directamente sus tokens. Esto evita depender de Cloud Functions de Firebase, que requieren activar Blaze.

## Qué se guarda y qué permanece en el navegador

Se guardan el PDF original, el nombre del proyecto y las anotaciones completas: trazos, resaltados, orden de planos, nombres, colores, posición de títulos, valor de plano, angulación, óptica, movimiento, grip, sonido, descripción y notas. Las escenas se detectan de nuevo al abrir el PDF. La vista del guion y la etapa se incluyen en la siguiente versión guardada de anotaciones. El PDF original solo se sube una vez; las exportaciones PDF/Excel se generan cuando se solicitan.

La edición usa memoria del navegador y las respuestas llevan `Cache-Control: no-store`. No se persisten PDF ni nuevas anotaciones en localStorage/IndexedDB. La sesión de acceso y la apariencia siguen usando almacenamiento del navegador. Las antiguas notas locales no se borran: al subir por primera vez el mismo PDF desde la misma cuenta se recuperan y se envían al nuevo proyecto. Un proyecto ya existente en la nube tiene prioridad; para añadir una copia antigua usa «Importar notas». Las descargas explícitas de PDF, Excel o JSON siguen siendo archivos del usuario.

El guardado se agrupa durante 1,5 segundos y solo se confirma tras la respuesta del servidor. Si falla la conexión, el borrador queda **en memoria de esa pestaña**, se muestra el error y se avisa antes de cerrarla. Al volver la conexión se reintenta. No hay garantía de conservar cambios no sincronizados si se fuerza el cierre del proceso, se apaga el equipo o se ignora el aviso: descarga una copia JSON cuando no puedas guardar. No se finge un guardado local silencioso.

Al cerrar sesión o cambiar de documento se intenta terminar el guardado. Si falla, la operación voluntaria se bloquea para permitir reintentar o exportar. Un cambio externo de sesión aparta los borradores en memoria por usuario, sin mostrarlos a otras cuentas. Dos pestañas o dispositivos usan un número de revisión: el segundo guardado con una revisión antigua se rechaza y permite descargar sus notas o recargar la versión de la nube. Nunca se sobrescribe un conflicto automáticamente.

## Límites conservadores

- PDF de hasta **10 MiB**, máximo **10 proyectos por cuenta**.
- Máximo **80 proyectos en toda la aplicación**. Cada uno reserva 10 MiB aunque pese menos, de modo que el bucket usa como máximo 800 MiB y deja margen bajo el GB gratuito.
- Anotaciones de hasta **350 KB por proyecto**; SQL mantiene además un límite de 400 KB para su representación JSONB. No se almacena historial infinito de versiones.
- 40.000 operaciones de datos al mes para la aplicación y 8.000 por cuenta; 90 por minuto y cuenta. No hay sondeo periódico ni subida del PDF en cada cambio.
- Reserva mensual conservadora de **3 GB de transferencia** para el conjunto de la aplicación. Cada descarga reserva dos veces el tamaño máximo del PDF para cubrir Storage y la respuesta de la función. Las lecturas de anotaciones y las listas también reservan transferencia. Al agotarse se interrumpen operaciones hasta el mes siguiente, sin borrar proyectos ni contratar un plan.

Los límites se aplican en transacciones SQL con bloqueo, no solo con JavaScript. Las filas de proyectos incompletos siguen consumiendo una reserva hasta eliminarlas, evitando liberar espacio mientras pueda quedar un objeto. Un borrado elimina el objeto antes de retirar la fila; si se interrumpe puede reintentarse. El plan Free puede pausar proyectos inactivos y también aplica sus propios límites de plataforma. Un usuario autenticado que abuse del servicio puede agotar una cuota y afectar la disponibilidad, pero el código no cambia el plan para ampliarla.

## Verificación técnica

`node tests/cloud.cjs` ejecuta PostgreSQL real mediante PGlite, los mismos procedimientos SQL y el mismo manejador de servidor, con JWT firmados y validados mediante jose. Simula únicamente Storage y las credenciales del navegador. Comprueba permisos RLS, aislamiento, firmas/expiración, revisiones, límites, recuperación de subidas/borrados interrumpidos, deduplicación, guardado, otro dispositivo, desconexión, conflictos, copia JSON, renombrado, eliminación y móvil. No usa el proyecto real ni envía correos.

Además de Playwright/pdf-lib y Edge usados por las pruebas anteriores, requiere `@electric-sql/pglite@0.5.10` y `jose@6.1.3` en `tools/node_modules` (por ejemplo, `npm install --prefix tools --no-save @electric-sql/pglite@0.5.10 jose@6.1.3`). `PLANO_RUNTIME_MODULES` apunta a las dependencias de navegador habituales. `node tools/check-cloud.cjs` comprueba que la función desplegada rechace peticiones sin identidad; no crea proyectos ni sube archivos. Que rechace una petición anónima no verifica por sí solo el flujo completo de una cuenta real.

Referencias: [Supabase Free](https://supabase.com/pricing), [pausas por inactividad](https://supabase.com/docs/guides/platform/free-project-pausing), [verificación de tokens Firebase](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [configuración de Edge Functions](https://supabase.com/docs/guides/functions/function-configuration).
