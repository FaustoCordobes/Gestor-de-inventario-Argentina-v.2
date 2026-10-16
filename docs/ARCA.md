# Factura electrónica con ARCA

> **Estado: NO OPERATIVA.** El módulo está escrito y probado sin conexión
> (formato de los mensajes, firma, cálculo de IVA, lectura de respuestas), pero
> **nunca se conectó a los servidores de ARCA** porque falta un certificado.
> Hasta completar esta guía, todos los comprobantes de Mostrador son internos,
> dicen "sin CAE / no válido como factura" y no tienen QR fiscal.

## Qué hay en el proyecto

| Archivo | Qué hace |
|---|---|
| `supabase/functions/arca-wsfe/arca.js` | Funciones puras: arma el pedido de acceso (TRA), lo firma (CMS/PKCS#7, SHA-256), arma y lee los mensajes SOAP de WSAA y WSFEv1 (`FECompUltimoAutorizado`, `FECAESolicitar`, `FECompConsultar`), separa IVA por alícuota y arma la URL del QR **solo con un CAE real**. |
| `supabase/functions/arca-wsfe/index.ts` | Función de servidor (Supabase Edge Function). Verifica la sesión y el rol del usuario, toma el turno de numeración, pide el CAE y guarda cada intento. |
| `supabase/arca.sql` | Tablas `arca_config`, `arca_tokens`, `arca_numeracion`, `comprobantes_arca` y funciones que solo puede usar el servidor. |
| `tests/arca.test.js`, `tests/db.test.js` | Pruebas sin conexión del módulo y de las reglas de la base. |

### Reglas que cumple

- El certificado y su clave privada viven **solo como secretos del servidor**. Nunca en el navegador ni en el repositorio.
- Ningún usuario puede marcar una venta como autorizada: la base solo deja escribir el CAE a la función de servidor.
- La base rechaza un comprobante "aprobado" sin CAE o con un CAE que no tenga 14 dígitos.
- Un CAE de **homologación** queda registrado como prueba y **no** vuelve fiscal a la venta.
- Los números se piden de a uno por punto de venta y tipo (turno en `arca_numeracion`), porque ARCA exige numeración correlativa.
- Si se corta la conexión después de enviar el pedido, el comprobante queda **incierto** y, antes de reintentar, se consulta a ARCA (`FECompConsultar`) si ya lo había autorizado. Así no se duplica.
- Nada se borra: cada intento queda en `comprobantes_arca` con errores y observaciones de ARCA.
- Incluye `CondicionIVAReceptorId` (RG 5616), que ARCA informa como obligatorio desde el 1/12/2026.

## Pasos para habilitarla

Requiere el **modo empresa en la nube** (ver `docs/SUPABASE.md`): la firma no puede hacerse en el navegador.

### 1. Homologación (pruebas, sin valor fiscal)

1. Con clave fiscal, adherir el servicio **"WSASS – Autogestión Certificados Homologación"**.
2. Generar la clave privada y el pedido de certificado (CSR) en una computadora segura:
   ```bash
   openssl genrsa -out mostrador.key 2048
   openssl req -new -key mostrador.key -subj "/C=AR/O=Mi Comercio/CN=mostrador/serialNumber=CUIT 20XXXXXXXXX" -out mostrador.csr
   ```
3. En WSASS: crear el certificado pegando el CSR, y crear la **autorización** de ese certificado para el servicio `wsfe`.
4. Cargar en Supabase:
   ```bash
   supabase secrets set ARCA_ENV=homologacion ARCA_CUIT=20XXXXXXXXX \
     ARCA_CERT="$(cat mostrador.crt)" ARCA_KEY="$(cat mostrador.key)"
   psql "$DATABASE_URL" -f supabase/arca.sql
   supabase functions deploy arca-wsfe
   ```
5. Como administrador de la empresa: `insert into arca_config (empresa_id, punto_venta, habilitado) values ('<id>', <pto>, true);`
6. Hacer ventas de prueba (Factura B a consumidor final, A a un RI, C si es monotributo) y llamar a la función con cada `venta_id`. Revisar `comprobantes_arca`: que haya CAE, que los importes coincidan, y probar un rechazo a propósito (por ejemplo, Factura A sin CUIT).
7. Verificar en homologación los valores de `CondicionIVAReceptorId` con `FEParamGetCondicionIvaReceptor` y los tipos con `FEParamGetTiposCbte`.

### 2. Producción (con valor fiscal)

1. Generar un **nuevo** par clave/CSR y obtener el certificado en **"Administrador de Certificados Digitales"**.
2. En **"Administrador de Relaciones de Clave Fiscal"**, asociar ese certificado (computador fiscal) al servicio **Facturación Electrónica (wsfe)**.
3. En **"Administración de puntos de venta y domicilios"**, crear un punto de venta para web services (RI: "RECE para aplicativo y web services"; monotributo: "Factura Electrónica – Monotributo – Web Services"). No usar uno de "Comprobantes en línea".
4. Cambiar los secretos (`ARCA_ENV=produccion`, certificado y clave nuevos), poner el punto de venta y `ambiente = 'produccion'` en `arca_config`.
5. Emitir un primer comprobante real chico y verificarlo en "Mis comprobantes" de ARCA.

## Qué falta (pendiente)

- **Pantalla en la app** para pedir el CAE y mostrar el estado: no existe, porque el modo en la nube todavía no está conectado al frontend.
- **Notas de crédito** (`CbteTipo` 3/8/13 con `CbtesAsoc`) para devoluciones de ventas ya autorizadas. Hoy una devolución de una venta autorizada **no** genera la nota de crédito en ARCA.
- **Ticket fiscal con QR**: `urlQR()` existe pero el ticket todavía no lo muestra (no hay CAE reales).
- **Un CUIT por instalación**: el certificado es un secreto del servidor. Para varias empresas con CUIT distinto haría falta guardar certificados por empresa (por ejemplo con Supabase Vault).
- Conceptos 2 y 3 (servicios), otros tributos (`ImpTrib`), monedas extranjeras y Factura de Crédito Electrónica MiPyME: no contemplados.
- Prueba real contra homologación: **no realizada**.

## Referencias

- WSAA (autenticación): https://www.arca.gob.ar/ws/documentacion/wsaa.asp
- Factura electrónica por web services: https://www.arca.gob.ar/fe/ayuda/webservice.asp
- Manual para el desarrollador WSFEv1 (RG 4291), en la sección de documentación de ARCA.
- Direcciones: homologación `wsaahomo.afip.gov.ar` / `wswhomo.afip.gov.ar/wsfev1`; producción `wsaa.afip.gov.ar` / `servicios1.afip.gov.ar/wsfev1`.
