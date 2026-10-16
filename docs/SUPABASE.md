# Modo empresa en la nube (Supabase)

> **Estado: base de datos lista y probada; la app todavía NO está conectada.**
> `supabase/schema.sql` se probó en PostgreSQL (PGlite) con `tests/db.test.js`,
> simulando el entorno de Supabase. No se probó en un proyecto real de Supabase.
> Mientras tanto, la app guarda los datos en el dispositivo (modo local) y la
> pantalla "Configuración → Nube y ARCA" lo dice.

## Qué resuelve la base

- **Empresas aisladas**: cada tabla tiene `empresa_id` y políticas RLS. Un usuario solo ve las empresas de las que es miembro (`miembros`).
- **Roles verificados en la base**: `admin`, `encargado`, `vendedor`, `deposito`, con las mismas reglas que la app (por ejemplo, el vendedor no ve costos ni gastos; depósito recibe mercadería pero no cambia costos).
- **El stock no se toca directo**: no hay permiso de `update` sobre `productos.stock` ni de escritura en `movimientos_stock`. Solo cambia mediante funciones (`registrar_venta`, `devolver_venta`, `ajustar_stock`, `recibir_compra`) que dejan el kardex con antes, después, usuario, motivo y referencia.
- **Ventas atómicas e idempotentes**: `registrar_venta` toma los precios de la base (no del navegador), valida pagos, stock y caja abierta, y si llega dos veces el mismo `op_id` devuelve la misma venta (no cobra dos veces).
- **Nada se borra**: devoluciones, anulaciones de gastos y diferencias de caja son registros nuevos y auditados.
- **Caja**: una sola abierta por empresa; el cierre con diferencia exige motivo.

## Cómo crear el proyecto

1. Crear un proyecto en https://supabase.com (región São Paulo es la más cercana).
2. En **SQL Editor**, ejecutar `supabase/schema.sql` completo. (Opcional, para factura electrónica: `supabase/arca.sql`, ver `docs/ARCA.md`.)
3. En **Authentication**, habilitar el ingreso por correo.
4. El dueño se registra y ejecuta, ya con sesión iniciada: `select crear_empresa('Mi Almacén', 'MONO', 'Marta');` (o `'RI'`). Queda como `admin`.
5. Para sumar empleados: que cada uno se registre, y el admin agrega su `user_id` en `miembros` con el rol que corresponda.

### Claves

- La **URL** y la **anon key** (o "publishable key") son públicas: pueden ir en el frontend, porque la seguridad la dan RLS y los permisos.
- La **service_role key** (o "secret key") **nunca** va en el frontend ni en el repositorio. Solo la usa la función de servidor de ARCA, como secreto de Supabase.
- `schema.sql` y `arca.sql` quitan los permisos que Supabase da por defecto a las tablas nuevas y dan solo los necesarios. Si se agregan tablas, hay que hacer lo mismo.

## Qué falta para usarlo desde la app

1. Un adaptador en `js/storage.js` (modo `nube`) que: inicie sesión con Supabase Auth, lea los datos de la empresa y llame a las funciones (`rpc`) en lugar de modificar el estado local.
2. Cola de operaciones sin conexión: guardar las ventas hechas sin internet con su `op_id` y enviarlas al volver la conexión (la idempotencia de `registrar_venta` evita duplicados).
3. Resolver conflictos de stock cuando dos dispositivos venden lo mismo sin conexión (la base rechaza la venta que dejaría stock negativo; hay que mostrarlo y permitir corregirla).
4. Migración de los datos locales: subir una copia de seguridad (`mostrador-backup`, esquema 4) a la empresa nueva.
5. Probar con dos empresas y cuatro roles en un proyecto real antes de activar la opción en la app.

Mientras eso no esté hecho y probado, la app **no** ofrece el modo en la nube como disponible.
