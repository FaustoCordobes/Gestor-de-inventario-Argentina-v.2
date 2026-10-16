# Arquitectura de Mostrador

Sitio estático (HTML + CSS + JavaScript sin frameworks ni compilación) que funciona en GitHub Pages, abriendo el archivo directamente o instalado como app (PWA).

## Capas

```
index.html ── css/app.css
   │
   ├─ js/util.js       Formatos ($, fechas), CUIT, redondeo, SHA-256, protección de celdas de Excel
   ├─ js/domain.js     REGLAS DEL NEGOCIO. Sin pantalla ni guardado.
   ├─ js/reports.js    Cálculos de informes (solo lectura)
   ├─ js/storage.js    Guardado: IndexedDB → localStorage → memoria; copias, migración
   ├─ js/seed.js       Datos de la demostración (generados con las mismas funciones del dominio)
   ├─ js/ui/*.js       Pantallas: inicio, vender, mercadería, caja, contactos, informes, configuración, ticket
   └─ js/app.js        Arranque, menú, usuarios, eventos, service worker
sw.js                  Modo sin conexión
supabase/              Base de datos del modo empresa y función de ARCA (separadas)
```

Cada archivo es un script clásico que se registra en `window.M` (`M.U`, `M.D`, `M.Storage`, `M.R`, `M.UI`). Así funciona con `file://`, en el navegador y en Node para las pruebas.

## Cómo se hace una operación

1. La pantalla llama a `UI.run((s, u) => D.registrarVenta(s, u, datos))`.
2. `D.tx` trabaja sobre una copia del estado (copia por escritura: las listas que solo crecen se copian superficialmente, el resto se clona). Si la función lanza `DomainError`, no cambia nada.
3. Toda modificación de stock pasa por `D.moverStock`, que valida, actualiza y escribe el kardex (antes, después, usuario, motivo, referencia).
4. Se guarda **antes** de mostrar el cambio, con control de versión: si otra pestaña guardó antes, aparece "Hay cambios de otra pestaña" y no se pisa nada.
5. Si el guardado falla, la operación no se aplica y se avisa (nunca en silencio).
6. Un bloqueo evita el doble clic, y cada venta lleva un `opId` que impide registrarla dos veces.

Los permisos (`D.PERMS`) se verifican dentro del dominio, no solo en la pantalla. En modo local **no** son una barrera de seguridad (quien controla el navegador controla los datos); en el modo nube los verifica la base con RLS.

## Datos (esquema 4)

Un objeto por espacio de trabajo (`demo` o `local`) con: `config`, `usuarios`, `productos`, `ventas` (con `pagos`, `fiscal.estado`), `devoluciones`, `compras`, `pedidos`, `devprov`, `pagos` y `cobros`, `gastos` (anulables), `cajas`, `cajaMovs`, `movimientos` (kardex), `auditoria`.

- La demostración y los datos reales están separados y nunca se mezclan.
- Copia automática diaria (se guardan las últimas 7) y copia descargable `.json` con SHA-256 para verificar integridad.
- Los datos de versiones anteriores (`mostrador-demo-v1..v3`) se migran solo si la persona lo pide, y el kardex se reconstruye hacia atrás desde el stock actual.
- Si los datos no se pueden leer, la app muestra una pantalla de recuperación y **no** los reemplaza por la demostración.

## Agregar una función nueva

1. Regla en `js/domain.js` (con su permiso en `PERMS`) y prueba en `tests/domain.test.js`.
2. Pantalla en `js/ui/<sección>.js` usando `UI.run`.
3. Si es un archivo nuevo: agregarlo a `index.html` **y** a `APP_SHELL` en `sw.js` (la prueba `tests/pwa.test.js` avisa si falta), y cambiar `VERSION` en `sw.js`.
4. Si cambia la forma de los datos: subir `SCHEMA`, escribir la migración en `storage.js` y probarla con una copia vieja.
5. Para el modo nube: la función equivalente en `supabase/schema.sql` con su prueba en `tests/db.test.js`.

## Pruebas

`npm install` y `npm test`. Cubren dominio (ventas, devoluciones, caja, compras, permisos, stock), guardado (recarga, errores de escritura, conflicto entre pestañas, copias, migración), interfaz en jsdom, base de datos en PostgreSQL (aislamiento entre empresas, roles, atomicidad), ARCA sin conexión y PWA.
