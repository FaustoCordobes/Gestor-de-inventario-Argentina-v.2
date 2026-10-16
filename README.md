# Mostrador

Gestión de inventario y punto de venta para comercios de Argentina: almacenes, kioscos, ferreterías, dietéticas, librerías. Hecho por **F-C Web Studio** (San Martín de los Andes).

**Demostración:** https://faustocordobes.github.io/Gestor-de-inventario-Argentina/

## Qué hace

- **Vender** rápido con teclado y lectora de códigos (también etiquetas de balanza), pago dividido, vuelto, fiado, ticket 58/80 mm o por WhatsApp.
- **Mercadería**: productos, lo que llegó del proveedor, pedidos, qué falta reponer, kardex con cada movimiento, conteos y mermas, aumentos masivos de precio.
- **Caja**: apertura, retiros, gastos y cierre con arqueo por medio de pago.
- **Proveedores y clientes**: cuentas corrientes, vencimientos, pagos y cobros.
- **Informes** por día, semana, mes y año; inventario valorizado, márgenes, diferencias, pendientes y libros para el contador, en Excel y PDF.
- **Usuarios** con roles (dueño, encargado, vendedor, depósito) y PIN.
- Funciona **sin internet** y se puede instalar como app.

## Estado real

| Parte | Estado |
|---|---|
| Uso en un dispositivo (modo local) | Funciona. Los datos quedan en ese navegador: descargá copias de seguridad. |
| Modo sin conexión (PWA) | Funciona (probado en Chromium). |
| Modo empresa en la nube (varios dispositivos) | Base de datos lista y probada; **la app todavía no está conectada**. Ver `docs/SUPABASE.md`. |
| Factura electrónica ARCA | Módulo preparado y probado sin conexión; **no operativo**. Los comprobantes actuales son internos y sin CAE. Ver `docs/ARCA.md`. |

## Probarlo en tu computadora

```bash
python3 -m http.server 8080      # y abrir http://localhost:8080
```

También se puede abrir `index.html` directamente (sin modo sin conexión).

## Pruebas

```bash
npm install
npm test
```

## Documentación

- `docs/ARQUITECTURA.md`: cómo está organizado el código y cómo agregar funciones.
- `docs/SUPABASE.md`: modo empresa en la nube.
- `docs/ARCA.md`: factura electrónica.
- `CHANGELOG.md`: cambios y cómo volver a la versión anterior.
