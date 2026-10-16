# Cambios

## 4.0.0 — octubre 2026

Reescritura por etapas siguiendo el "Prompt maestro" y el plan de punto de venta. La versión anterior queda en `legacy/index-v3.html`.

### Etapa 1 · Datos seguros
- Guardado en IndexedDB (con respaldo en localStorage y aviso si solo queda la memoria).
- Cada operación se guarda antes de mostrarse; si falla, se avisa y no queda a medias.
- Control de versión entre pestañas: no se pisan datos.
- Datos ilegibles: pantalla de recuperación, nunca se reemplazan por la demo.
- Copia automática diaria (últimas 7) y antes de operaciones delicadas; copia descargable con verificación SHA-256; restaurar exige escribir RESTAURAR.
- Demostración y datos del negocio separados. Migración de datos de la v3 solo a pedido, sin perder ventas y descartando los CAE inventados.

### Etapa 2 · Operación del mostrador
- Punto de venta con teclado (F2 buscar, F4 cliente, F6 descuento, F7 comprobante, F8 medio de pago, F9/Ctrl+Enter cobrar, F10 caja, Supr, +/−, Esc, ?) y lectora de códigos de barras (incluye etiquetas de balanza EAN-13 con dígito verificador).
- Pago dividido, vuelto, borrador que no se pierde al recargar.
- Ticket térmico 58/80 mm y envío por WhatsApp/correo; siempre dice "sin CAE / no válido como factura".
- Kardex completo: entradas, salidas, conteos, mermas y ajustes con motivo, usuario y referencia; sin stock negativo (configurable).
- Devoluciones parciales o totales y anulación de gastos por reversión, nunca borrando.
- Pedidos a proveedores, recepción parcial, sugerencias de reposición (no se ejecutan solas), devolución de mercadería al proveedor.
- Caja: apertura, retiros e ingresos, cierre con arqueo por medio de pago y motivo obligatorio si hay diferencia.
- Aumento masivo de precios por porcentaje con confirmación y copia previa; margen sobre costo de reposición.
- Usuarios con rol y PIN: dueño, encargado, vendedor, depósito.

### Etapa 3 · Modo empresa y ARCA (preparados, no activos)
- `supabase/schema.sql`: base multiempresa con RLS por empresa y rol, stock solo mediante funciones atómicas, ventas idempotentes. Probada en PostgreSQL (PGlite).
- `supabase/arca.sql` y `supabase/functions/arca-wsfe`: integración separada con WSAA/WSFEv1. Probada sin conexión. **No operativa** (falta certificado y prueba en homologación).

### Etapa 4 · Informes
- Historial por día, semana, mes y año; inventario valorizado, rotación, sin movimiento, márgenes, diferencias de stock, pendientes, libros para el contador. Excel y PDF.
- Ventas, cobros, gastos y ganancia se calculan y se muestran por separado, con su definición.

### Etapa 5 · PWA
- `sw.js` y `manifest.webmanifest`: se instala y abre sin conexión (probado en Chromium). Aviso de versión nueva sin interrumpir una venta.

### Etapa 6 · Pruebas y seguridad
- 46 pruebas automáticas (`npm test`).
- Sin claves en el código; protección contra fórmulas en Excel exportado; textos escapados en pantalla; la base no deja escribir CAE desde la app.

## Cómo volver atrás

- **Toda la versión**: `git revert <commit>` (o `git checkout <commit-anterior> -- .`) y publicar. Los datos guardados por la v4 quedan en IndexedDB (`mostrador`) y no los borra la v3.
- **Sin git**: abrir `legacy/index-v3.html`. La v3 usa sus propias claves (`mostrador-demo-v3`), que la v4 nunca modifica.
- **Datos**: Configuración → Datos y copias → restaurar una copia automática o un archivo `.json` descargado.
- **Service worker**: si quedó una versión vieja en el navegador, recargar con Ctrl+Shift+R o borrar los datos del sitio (antes, descargar una copia).

Al publicar una versión nueva: cambiar `VERSION` en `sw.js`.
