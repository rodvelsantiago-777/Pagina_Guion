# Cuenta y seguridad de PLANO

Se abre desde **Mi cuenta** en el menú del avatar. Es una sección completa con perfil, inicio de sesión y seguridad, apariencia y privacidad. Volver al estudio conserva el documento abierto. El perfil guarda nombre, fecha de nacimiento opcional y empresa opcional en Supabase; el correo, la contraseña y la identidad siguen en Firebase Authentication.

El correo se modifica con `verifyBeforeUpdateEmail`: se confirma la contraseña actual y Firebase envía un enlace al nuevo correo. El cambio se completa al verificarlo. La apariencia utiliza las preferencias privadas existentes de cada cuenta, con estados de sincronización y reintento. Sus controles pasan al área de cuenta y no cambian el papel del guion.

## Cambio de contraseña sin Gmail ni SMTP

Por elección del propietario, el cambio se realiza con un **enlace de Firebase enviado por Google**. No utiliza un Gmail personal, una contraseña de aplicación, `PLANO_MAIL_JSON`, Resend ni un dominio contratado. El usuario abre Seguridad → Contraseña → Cambiar → Enviar enlace a mi correo; elige la contraseña nueva desde la página de Firebase. Solicitar el enlace no cambia todavía la contraseña ni cierra sesiones. No se envía un aviso personalizado posterior: el correo es el enlace oficial para completar el cambio.

La función de nube verifica la firma del JWT y consulta los metadatos de Firebase (`validSince` y estado del usuario) antes de autorizar solicitudes. Cuando Firebase invalida las credenciales anteriores, sus sesiones de PLANO se revocan también. Las solicitudes con esos tokens se rechazan aunque todavía no hayan llegado a su expiración. Las pestañas visibles comprueban el estado periódicamente y al recuperar el foco; una pestaña desconectada tendrá que autenticarse al volver a contactar con el servidor.

Los correos de registro, verificación, recuperación y cambio de dirección continúan usando Firebase. La plantilla y el nombre del remitente se administran en Firebase Authentication → Templates. Los enlaces y la entrega están sujetos a las cuotas del plan gratuito de Firebase; no se activa facturación.

## Dispositivos

Cada navegador registra un secreto aleatorio ligado al UID. El servidor guarda únicamente su hash; el secreto no aparece en el listado ni permite entrar sin un token Firebase válido. Se muestran navegador/sistema, fecha de inicio y última actividad. No se inventan ubicaciones ni se guardan direcciones IP. El navegador actual se identifica como **Este dispositivo**.

Puede cerrarse una sesión individual, la actual o todas (esta última con confirmación de contraseña). Un secreto revocado no puede sustituirse por otro para reabrir el mismo inicio de sesión. Una cuenta que ya utiliza el registro no puede omitir la prueba de dispositivo para eludirlo. Las pestañas anteriores a esta actualización deben recargar la página para usar el protocolo nuevo. Los dispositivos previos aparecerán al volver a acceder; no existe un historial anterior que se pueda reconstruir.

Las fechas son las del servidor y las credenciales verificadas. La actividad se actualiza de forma limitada para no escribir en cada pulsación. Una autenticación de más de 30 días requiere iniciar sesión otra vez al registrar/restaurar su dispositivo.

## Suspensión y eliminación

Privacidad y datos solicita la contraseña actual y escribir **ELIMINAR**. Primero se confirman los cambios pendientes del documento. El servidor suspende la cuenta, revoca sus sesiones y fija un plazo de **30 días**. Una sesión antigua no puede reactivarla: hace falta volver a iniciar sesión con las credenciales. Entrar antes del vencimiento cancela la eliminación. Después del vencimiento ya no se permite recuperar la cuenta.

La tarea `plano-account-maintenance` se ejecuta cada hora. Al terminar el plazo, marca el borrado en curso, elimina los objetos PDF antiguos pendientes, elimina la identidad en Firebase y borra los proyectos, perfil, sesiones, preferencias, historial de lectura de versiones y datos de uso propios. Si falla un servicio, conserva el estado y reintenta; no presenta una eliminación fallida como completada. El momento de limpieza física depende de que el proyecto gratuito esté activo y de la disponibilidad de los servicios. Las copias que el usuario descargó a sus dispositivos permanecen bajo su control.

Se conserva temporalmente un hash del UID durante dos horas para impedir que un token todavía no expirado recree un perfil eliminado. No contiene nombre, correo, fecha de nacimiento ni proyectos. Las tablas tienen RLS y acceso directo denegado a `anon` y `authenticated`; solo la función de servidor opera con ellas después de verificar la identidad.

## Instalación del servidor

Las migraciones de cuenta, guardia de sesiones y programador están instaladas en el proyecto **hoymkaxarjkgttkgocrn**. La función `plano-cloud` verifica Firebase por sí misma. El token de mantenimiento se genera dentro de Supabase Vault y nunca se publica. `pg_cron` y `pg_net` ejecutan el mantenimiento sin un navegador abierto.

Único secreto adicional requerido: **FIREBASE_ADMIN_JSON**, con el JSON privado del proyecto **planos-15624**. El propietario ya lo instaló en Supabase → Edge Functions → Secrets. No debe guardarse en el repositorio, pegarse en el chat ni incorporarse a HTML/JavaScript público. Permite consultar el estado de usuarios, revocar credenciales y eliminar las identidades cuyo plazo terminó. La configuración pública de Firebase sigue siendo pública y no sustituye ese permiso de administración.

`account_config_status` permite una comprobación interna que solo devuelve los indicadores de conexión a Firebase y al programador. Requiere el secreto de mantenimiento y no crea, modifica ni elimina usuarios ni envía correos. No existe un punto público de diagnóstico administrativo. No se necesita ningún secreto de envío SMTP.

## Validación y publicación

- `tests/account-center.cjs`: SDK Firebase real con respuestas simuladas y PostgreSQL aislado; perfil entre dos dispositivos, preferencias, cambio de correo, enlace oficial para contraseña, cierre global tras restablecer, suspensión/recuperación y móvil.
- `tests/account-center-server.cjs`: propiedad, privilegios, revocación, imposibilidad de omitir/cambiar el secreto para eludirla, época de credenciales Firebase, plazo, borrado recuperable y separación de cuentas.
- Suite general: `node tools/run-checks.cjs`, con dependencias y navegador definidos como en README. Las pruebas no crean cuentas de producción, no borran usuarios reales y no mandan correos reales.

Para publicar la interfaz hay que incluir los archivos nuevos, crear el commit y hacer **Push origin**. El servidor ya está instalado; no requiere activar Firebase Storage, Functions/Blaze ni un plan de pago de Supabase.
