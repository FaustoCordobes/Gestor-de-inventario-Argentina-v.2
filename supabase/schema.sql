-- =====================================================================
-- Mostrador · Base de datos para el modo empresa (Supabase / PostgreSQL)
--
-- Principios:
--  * Cada empresa ve y modifica SOLO sus datos (RLS por empresa_id).
--  * Los permisos por rol se verifican en la base, no en la pantalla.
--  * Las operaciones críticas (venta, recepción, ajuste, devolución, caja)
--    se hacen con funciones atómicas: o se graba todo o no se graba nada.
--  * El stock solo cambia por esas funciones y cada cambio queda en el
--    kardex (cantidad anterior, resultante, usuario, motivo, referencia).
--  * Nada se borra: las correcciones son nuevos registros (devoluciones,
--    anulaciones, conteos).
--  * Los precios de venta los toma la base (el navegador no puede mandarlos).
--
-- Requisitos: Supabase (provee el esquema auth, auth.uid() y el rol
-- "authenticated"). Para probar fuera de Supabase, ver tests/db.test.js.
-- =====================================================================

create type rol_usuario as enum ('admin', 'encargado', 'vendedor', 'deposito');

-- ---------- Empresas y miembros ----------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 80),
  cuit text,
  cond_iva text not null default 'MONO' check (cond_iva in ('RI', 'MONO')),
  punto_venta int not null default 1 check (punto_venta between 1 and 99998),
  desc_max_vendedor numeric(5,2) not null default 10 check (desc_max_vendedor between 0 and 100),
  stock_negativo boolean not null default false,
  seq_interno bigint not null default 0,
  seq_devolucion bigint not null default 0,
  creado timestamptz not null default now()
);

create table miembros (
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null,
  rol rol_usuario not null,
  nombre text not null default '',
  activo boolean not null default true,
  primary key (empresa_id, user_id)
);

-- Rol del usuario actual en una empresa (null si no es miembro activo)
create or replace function mi_rol(p_empresa uuid) returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from miembros where empresa_id = p_empresa and user_id = auth.uid() and activo
$$;
create or replace function tengo_rol(p_empresa uuid, p_roles rol_usuario[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol(p_empresa) = any(p_roles), false)
$$;
-- Lanza un error de permiso si el usuario no tiene alguno de los roles
create or replace function exigir_rol(p_empresa uuid, p_roles rol_usuario[]) returns rol_usuario
language plpgsql stable security definer set search_path = public as $$
declare r rol_usuario;
begin
  r := mi_rol(p_empresa);
  if r is null or not (r = any(p_roles)) then
    raise exception 'permiso: tu usuario no tiene permiso para esta acción' using errcode = '42501';
  end if;
  return r;
end $$;

-- ---------- Catálogos ----------
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  cuit text, rubro text, contacto text, tel text,
  plazo int not null default 0 check (plazo between 0 and 365),
  entrega int not null default 0 check (entrega between 0 and 120)
);
create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  cond_iva text not null default 'CF' check (cond_iva in ('CF', 'RI', 'MONO', 'EX')),
  cuit text, tel text
);
create table productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null check (length(codigo) between 1 and 32),
  plu text,
  nombre text not null check (length(nombre) between 1 and 120),
  categoria text not null default 'Varios',
  proveedor_id uuid references proveedores(id),
  unidad text not null default 'u' check (unidad in ('u', 'kg')),
  costo numeric(14,2) not null default 0 check (costo >= 0),
  margen numeric(8,2) not null default 0,
  iva numeric(5,2) not null default 21 check (iva in (0, 10.5, 21, 27)),
  precio numeric(14,2) not null check (precio > 0),
  stock numeric(14,3) not null default 0,
  stock_min numeric(14,3) not null default 0 check (stock_min >= 0),
  activo boolean not null default true,
  unique (empresa_id, codigo)
);

-- ---------- Operaciones ----------
create table cajas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  abre_fecha timestamptz not null default now(), abre_usuario uuid not null, abre_monto numeric(14,2) not null check (abre_monto >= 0),
  cierra_fecha timestamptz, cierra_usuario uuid, contado numeric(14,2), esperado numeric(14,2), dif numeric(14,2), motivo text
);
create unique index una_caja_abierta on cajas (empresa_id) where cierra_fecha is null;

create table ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  op_id uuid not null,
  nro bigint not null,
  fecha timestamptz not null default now(),
  usuario uuid not null,
  cliente_id uuid references clientes(id),
  tipo text not null check (tipo in ('FA', 'FB', 'FC', 'TK')),
  descuento numeric(5,2) not null default 0 check (descuento between 0 and 100),
  total numeric(14,2) not null, neto numeric(14,2) not null, iva numeric(14,2) not null, costo numeric(14,2) not null,
  estado text not null default 'ok' check (estado in ('ok', 'devuelta_parcial', 'anulada')),
  fiscal_estado text not null default 'sin_autorizar' check (fiscal_estado in ('no_fiscal', 'sin_autorizar', 'autorizado', 'rechazado')),
  cae text, cae_vto date, nro_fiscal bigint,
  unique (empresa_id, op_id), unique (empresa_id, nro)
);
create table venta_items (
  venta_id uuid not null references ventas(id) on delete cascade,
  idx int not null,
  producto_id uuid not null references productos(id),
  nombre text not null, cant numeric(14,3) not null check (cant > 0),
  precio numeric(14,2) not null, costo numeric(14,2) not null, iva numeric(5,2) not null,
  devuelto numeric(14,3) not null default 0 check (devuelto >= 0 and devuelto <= cant),
  primary key (venta_id, idx)
);
create table venta_pagos (
  venta_id uuid not null references ventas(id) on delete cascade,
  medio text not null check (medio in ('Efectivo', 'Débito', 'Crédito', 'Mercado Pago', 'Transferencia', 'Cuenta corriente')),
  monto numeric(14,2) not null check (monto > 0)
);
create table devoluciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  venta_id uuid not null references ventas(id),
  nro bigint not null, fecha timestamptz not null default now(), usuario uuid not null,
  total numeric(14,2) not null check (total > 0), motivo text not null check (length(motivo) > 0),
  medio text not null, items jsonb not null
);
create table movimientos_stock (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha timestamptz not null default now(), usuario uuid,
  producto_id uuid not null references productos(id),
  tipo text not null check (tipo in ('inicial', 'venta', 'devolucion', 'compra', 'devprov', 'conteo', 'merma', 'ajuste')),
  cant numeric(14,3) not null check (cant <> 0), antes numeric(14,3) not null, despues numeric(14,3) not null,
  motivo text, ref_tipo text, ref_id uuid,
  check (despues = antes + cant)
);
create table compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  fecha timestamptz not null default now(), usuario uuid not null,
  tipo text not null, nro_comp text, cond text not null check (cond in ('cc', 'contado')), medio text,
  neto numeric(14,2) not null, iva numeric(14,2) not null, total numeric(14,2) not null, items jsonb not null
);
create table pagos_proveedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  fecha timestamptz not null default now(), usuario uuid not null,
  monto numeric(14,2) not null check (monto > 0), medio text not null
);
create table cobros_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  fecha timestamptz not null default now(), usuario uuid not null,
  monto numeric(14,2) not null check (monto > 0), medio text not null
);
create table gastos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha timestamptz not null default now(), usuario uuid not null,
  categoria text not null, detalle text not null check (length(detalle) > 0),
  monto numeric(14,2) not null check (monto > 0), medio text not null,
  anulado_fecha timestamptz, anulado_usuario uuid, anulado_motivo text
);
create table auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas(id) on delete cascade,
  fecha timestamptz not null default now(), usuario uuid, accion text not null, detalle text
);

create index on ventas (empresa_id, fecha);
create index on movimientos_stock (empresa_id, producto_id, fecha);
create index on gastos (empresa_id, fecha);
create index on compras (empresa_id, fecha);

-- ---------- Seguridad: RLS ----------
alter table empresas enable row level security;
alter table miembros enable row level security;
alter table proveedores enable row level security;
alter table clientes enable row level security;
alter table productos enable row level security;
alter table cajas enable row level security;
alter table ventas enable row level security;
alter table venta_items enable row level security;
alter table venta_pagos enable row level security;
alter table devoluciones enable row level security;
alter table movimientos_stock enable row level security;
alter table compras enable row level security;
alter table pagos_proveedor enable row level security;
alter table cobros_cliente enable row level security;
alter table gastos enable row level security;
alter table auditoria enable row level security;

-- Lectura: solo miembros de la empresa (y según rol en datos sensibles)
create policy ver_empresa on empresas for select using (mi_rol(id) is not null);
create policy editar_empresa on empresas for update using (tengo_rol(id, '{admin}')) with check (tengo_rol(id, '{admin}'));
create policy ver_miembros on miembros for select using (mi_rol(empresa_id) is not null);
create policy admin_miembros on miembros for all using (tengo_rol(empresa_id, '{admin}')) with check (tengo_rol(empresa_id, '{admin}'));
create policy ver_productos on productos for select using (mi_rol(empresa_id) is not null);
create policy alta_productos on productos for insert with check (tengo_rol(empresa_id, '{admin}'));
create policy editar_productos on productos for update using (tengo_rol(empresa_id, '{admin}')) with check (tengo_rol(empresa_id, '{admin}'));
create policy ver_proveedores on proveedores for select using (tengo_rol(empresa_id, '{admin,encargado,deposito}'));
create policy editar_proveedores on proveedores for insert with check (tengo_rol(empresa_id, '{admin,encargado}'));
create policy editar_proveedores2 on proveedores for update using (tengo_rol(empresa_id, '{admin,encargado}')) with check (tengo_rol(empresa_id, '{admin,encargado}'));
create policy ver_clientes on clientes for select using (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy editar_clientes on clientes for insert with check (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy editar_clientes2 on clientes for update using (tengo_rol(empresa_id, '{admin,encargado,vendedor}')) with check (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy ver_cajas on cajas for select using (mi_rol(empresa_id) is not null);
create policy ver_ventas on ventas for select using (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy ver_items on venta_items for select using (exists (select 1 from ventas v where v.id = venta_id and tengo_rol(v.empresa_id, '{admin,encargado,vendedor}')));
create policy ver_pagos_venta on venta_pagos for select using (exists (select 1 from ventas v where v.id = venta_id and tengo_rol(v.empresa_id, '{admin,encargado,vendedor}')));
create policy ver_devoluciones on devoluciones for select using (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy ver_kardex on movimientos_stock for select using (tengo_rol(empresa_id, '{admin,encargado,deposito}'));
create policy ver_compras on compras for select using (tengo_rol(empresa_id, '{admin,encargado,deposito}'));
create policy ver_pagos_prov on pagos_proveedor for select using (tengo_rol(empresa_id, '{admin,encargado}'));
create policy ver_cobros on cobros_cliente for select using (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));
create policy ver_gastos on gastos for select using (tengo_rol(empresa_id, '{admin,encargado}'));
create policy ver_auditoria on auditoria for select using (tengo_rol(empresa_id, '{admin}'));

-- Privilegios: el stock y las operaciones solo se modifican con las funciones de abajo
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (nombre, cuit, cond_iva, punto_venta, desc_max_vendedor, stock_negativo) on empresas to authenticated;
grant insert, update, delete on miembros to authenticated;
grant insert (id, empresa_id, codigo, plu, nombre, categoria, proveedor_id, unidad, costo, margen, iva, precio, stock_min, activo) on productos to authenticated;
grant update (codigo, plu, nombre, categoria, proveedor_id, unidad, costo, margen, iva, precio, stock_min, activo) on productos to authenticated;
grant insert, update on proveedores, clientes to authenticated;

-- Auditoría de cambios de precio
create or replace function auditar_precio() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio is distinct from old.precio or new.costo is distinct from old.costo then
    insert into auditoria (empresa_id, usuario, accion, detalle)
    values (new.empresa_id, auth.uid(), 'producto.precio', format('%s: costo %s → %s, precio %s → %s', new.nombre, old.costo, new.costo, old.precio, new.precio));
  end if;
  return new;
end $$;
create trigger trg_auditar_precio after update on productos for each row execute function auditar_precio();

-- ---------- Funciones de negocio (atómicas) ----------
create or replace function _mover_stock(p_empresa uuid, p_producto uuid, p_cant numeric, p_tipo text, p_motivo text, p_ref_tipo text, p_ref uuid, p_permitir_neg boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes numeric; v_neg boolean; v_nombre text;
begin
  select stock, nombre into v_antes, v_nombre from productos where id = p_producto and empresa_id = p_empresa for update;
  if not found then raise exception 'invalido: el producto no existe'; end if;
  select stock_negativo into v_neg from empresas where id = p_empresa;
  if v_antes + p_cant < 0 and not p_permitir_neg and not v_neg then
    raise exception 'stock: no hay stock suficiente de "%": quedan %', v_nombre, v_antes using errcode = 'P0001';
  end if;
  update productos set stock = v_antes + p_cant where id = p_producto;
  insert into movimientos_stock (empresa_id, usuario, producto_id, tipo, cant, antes, despues, motivo, ref_tipo, ref_id)
  values (p_empresa, auth.uid(), p_producto, p_tipo, p_cant, v_antes, v_antes + p_cant, p_motivo, p_ref_tipo, p_ref);
end $$;

-- Efectivo que tiene que haber en una caja
create or replace function caja_esperado(p_caja uuid, p_hasta timestamptz default now()) returns numeric
language sql stable security definer set search_path = public as $$
  with c as (select * from cajas where id = p_caja)
  select c.abre_monto
    + coalesce((select sum(vp.monto) from venta_pagos vp join ventas v on v.id = vp.venta_id where v.empresa_id = c.empresa_id and vp.medio = 'Efectivo' and v.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
    + coalesce((select sum(monto) from cobros_cliente x where x.empresa_id = c.empresa_id and x.medio = 'Efectivo' and x.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
    - coalesce((select sum(monto) from gastos x where x.empresa_id = c.empresa_id and x.medio = 'Efectivo' and x.anulado_fecha is null and x.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
    - coalesce((select sum(monto) from pagos_proveedor x where x.empresa_id = c.empresa_id and x.medio = 'Efectivo' and x.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
    - coalesce((select sum(total) from compras x where x.empresa_id = c.empresa_id and x.cond = 'contado' and x.medio = 'Efectivo' and x.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
    - coalesce((select sum(total) from devoluciones x where x.empresa_id = c.empresa_id and x.medio = 'Efectivo' and x.fecha between c.abre_fecha and coalesce(c.cierra_fecha, p_hasta)), 0)
  from c
$$;

create or replace function abrir_caja(p_empresa uuid, p_monto numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_rol(p_empresa, '{admin,encargado,vendedor}');
  if p_monto is null or p_monto < 0 then raise exception 'invalido: el cambio inicial no puede ser negativo'; end if;
  if exists (select 1 from cajas where empresa_id = p_empresa and cierra_fecha is null) then raise exception 'caja: ya hay una caja abierta'; end if;
  insert into cajas (empresa_id, abre_usuario, abre_monto) values (p_empresa, auth.uid(), p_monto) returning id into v_id;
  return v_id;
end $$;

create or replace function cerrar_caja(p_empresa uuid, p_contado numeric, p_motivo text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_caja cajas%rowtype; v_esp numeric; v_dif numeric;
begin
  perform exigir_rol(p_empresa, '{admin,encargado,vendedor}');
  select * into v_caja from cajas where empresa_id = p_empresa and cierra_fecha is null for update;
  if not found then raise exception 'caja: no hay ninguna caja abierta'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'invalido: el efectivo contado no puede ser negativo'; end if;
  v_esp := caja_esperado(v_caja.id, now());
  v_dif := p_contado - v_esp;
  if abs(v_dif) >= 1 and coalesce(trim(p_motivo), '') = '' then raise exception 'motivo: la caja no cierra justa, indicá el motivo'; end if;
  update cajas set cierra_fecha = now(), cierra_usuario = auth.uid(), contado = p_contado, esperado = v_esp, dif = v_dif, motivo = nullif(trim(p_motivo), '') where id = v_caja.id;
  if abs(v_dif) >= 1 then insert into auditoria (empresa_id, usuario, accion, detalle) values (p_empresa, auth.uid(), 'caja.diferencia', format('%s: %s', v_dif, p_motivo)); end if;
  return v_dif;
end $$;

/*
 * registrar_venta: venta completa en una sola transacción.
 * - Idempotente: si llega dos veces el mismo p_op_id (doble clic o reintento por
 *   corte de conexión), devuelve la venta ya registrada y no cobra dos veces.
 * - Los precios, costos e IVA se toman de la base, no del navegador.
 * p_items: [{"producto_id": uuid, "cant": n}], p_pagos: [{"medio": text, "monto": n}]
 */
create or replace function registrar_venta(p_empresa uuid, p_op_id uuid, p_cliente uuid, p_tipo text, p_descuento numeric, p_items jsonb, p_pagos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rol rol_usuario; v_emp empresas%rowtype; v_id uuid; v_nro bigint; v_cli clientes%rowtype;
  it record; p productos%rowtype; v_idx int := 0; v_f numeric; v_sub numeric;
  v_total numeric := 0; v_iva numeric := 0; v_costo numeric := 0; v_pagado numeric; v_tipo text;
begin
  v_rol := exigir_rol(p_empresa, '{admin,encargado,vendedor}');
  select id into v_id from ventas where empresa_id = p_empresa and op_id = p_op_id;
  if found then return v_id; end if;
  select * into v_emp from empresas where id = p_empresa for update;
  if not exists (select 1 from cajas where empresa_id = p_empresa and cierra_fecha is null) then raise exception 'caja: la caja está cerrada'; end if;
  p_descuento := coalesce(p_descuento, 0);
  if p_descuento < 0 or p_descuento > 100 then raise exception 'invalido: el descuento tiene que estar entre 0 y 100'; end if;
  if p_descuento > v_emp.desc_max_vendedor and v_rol = 'vendedor' then raise exception 'permiso: como vendedor podés hacer hasta % de descuento', v_emp.desc_max_vendedor; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'invalido: la venta no tiene productos'; end if;
  if p_cliente is not null then
    select * into v_cli from clientes where id = p_cliente and empresa_id = p_empresa;
    if not found then raise exception 'invalido: el cliente no existe'; end if;
  end if;
  -- Tipo de comprobante según condición del emisor y del cliente
  if v_emp.cond_iva = 'MONO' then v_tipo := 'FC'; elsif v_cli.cond_iva = 'RI' then v_tipo := 'FA'; else v_tipo := 'FB'; end if;
  if p_tipo = 'TK' then v_tipo := 'TK'; elsif p_tipo is not null and p_tipo <> v_tipo then raise exception 'invalido: para este cliente corresponde %', v_tipo; end if;
  if v_tipo = 'FA' and coalesce(v_cli.cuit, '') = '' then raise exception 'invalido: para Factura A el cliente tiene que tener CUIT'; end if;

  v_emp.seq_interno := v_emp.seq_interno + 1; v_nro := v_emp.seq_interno;
  update empresas set seq_interno = v_nro where id = p_empresa;
  v_id := gen_random_uuid(); v_f := 1 - p_descuento / 100;
  insert into ventas (id, empresa_id, op_id, nro, usuario, cliente_id, tipo, descuento, total, neto, iva, costo, fiscal_estado)
  values (v_id, p_empresa, p_op_id, v_nro, auth.uid(), p_cliente, v_tipo, p_descuento, 0, 0, 0, 0, case when v_tipo = 'TK' then 'no_fiscal' else 'sin_autorizar' end);
  -- Se bloquean los productos en orden para evitar bloqueos cruzados entre cajas
  for it in select (x->>'producto_id')::uuid as pid, sum((x->>'cant')::numeric) as cant from jsonb_array_elements(p_items) x group by 1 order by 1 loop
    select * into p from productos where id = it.pid and empresa_id = p_empresa for update;
    if not found then raise exception 'invalido: uno de los productos no existe'; end if;
    if not p.activo then raise exception 'invalido: "%" está archivado', p.nombre; end if;
    if it.cant is null or it.cant <= 0 then raise exception 'invalido: cantidad inválida para "%"', p.nombre; end if;
    if p.unidad = 'u' and it.cant <> trunc(it.cant) then raise exception 'invalido: "%" se vende por unidad', p.nombre; end if;
    v_sub := round(p.precio * it.cant * v_f, 2);
    v_total := v_total + v_sub; v_costo := v_costo + p.costo * it.cant;
    v_iva := v_iva + case when v_emp.cond_iva = 'RI' then v_sub - v_sub / (1 + p.iva / 100) else 0 end;
    insert into venta_items (venta_id, idx, producto_id, nombre, cant, precio, costo, iva) values (v_id, v_idx, p.id, p.nombre, it.cant, p.precio, p.costo, p.iva);
    v_idx := v_idx + 1;
    perform _mover_stock(p_empresa, p.id, -it.cant, 'venta', 'Venta N° ' || v_nro, 'venta', v_id, false);
  end loop;
  v_total := round(v_total, 2);
  -- Pagos
  if jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then raise exception 'invalido: indicá cómo paga el cliente'; end if;
  insert into venta_pagos (venta_id, medio, monto) select v_id, x->>'medio', round((x->>'monto')::numeric, 2) from jsonb_array_elements(p_pagos) x;
  select sum(monto) into v_pagado from venta_pagos where venta_id = v_id;
  if abs(v_pagado - v_total) > 0.01 then raise exception 'invalido: los pagos (%) no coinciden con el total (%)', v_pagado, v_total; end if;
  if exists (select 1 from venta_pagos where venta_id = v_id and medio = 'Cuenta corriente') and p_cliente is null then raise exception 'invalido: para vender fiado elegí el cliente'; end if;
  update ventas set total = v_total, iva = round(v_iva, 2), neto = round(v_total - v_iva, 2), costo = round(v_costo, 2) where id = v_id;
  return v_id;
end $$;

/* Devolución parcial o total. No borra la venta. p_items: [{"idx": n, "cant": n}] */
create or replace function devolver_venta(p_empresa uuid, p_venta uuid, p_items jsonb, p_motivo text, p_medio text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; it record; vi venta_items%rowtype; v_total numeric := 0; v_id uuid; v_nro bigint; v_lineas jsonb := '[]';
begin
  perform exigir_rol(p_empresa, '{admin,encargado}');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo: indicá el motivo de la devolución'; end if;
  select * into v from ventas where id = p_venta and empresa_id = p_empresa for update;
  if not found then raise exception 'invalido: la venta no existe'; end if;
  if p_medio = 'Efectivo' and not exists (select 1 from cajas where empresa_id = p_empresa and cierra_fecha is null) then raise exception 'caja: la caja está cerrada'; end if;
  update empresas set seq_devolucion = seq_devolucion + 1 where id = p_empresa returning seq_devolucion into v_nro;
  v_id := gen_random_uuid();
  for it in select (x->>'idx')::int as idx, (x->>'cant')::numeric as cant from jsonb_array_elements(p_items) x loop
    select * into vi from venta_items where venta_id = p_venta and idx = it.idx for update;
    if not found then raise exception 'invalido: producto inválido en la devolución'; end if;
    if it.cant <= 0 or it.cant > vi.cant - vi.devuelto then raise exception 'invalido: de "%" se pueden devolver como máximo %', vi.nombre, vi.cant - vi.devuelto; end if;
    update venta_items set devuelto = devuelto + it.cant where venta_id = p_venta and idx = it.idx;
    v_total := v_total + round(vi.precio * it.cant * (1 - v.descuento / 100), 2);
    v_lineas := v_lineas || jsonb_build_object('idx', it.idx, 'producto_id', vi.producto_id, 'cant', it.cant);
    perform _mover_stock(p_empresa, vi.producto_id, it.cant, 'devolucion', p_motivo, 'devolucion', v_id, false);
  end loop;
  if v_total <= 0 then raise exception 'invalido: elegí qué productos se devuelven'; end if;
  insert into devoluciones (id, empresa_id, venta_id, nro, usuario, total, motivo, medio, items) values (v_id, p_empresa, p_venta, v_nro, auth.uid(), v_total, p_motivo, p_medio, v_lineas);
  update ventas set estado = case when (select bool_and(devuelto >= cant) from venta_items where venta_id = p_venta) then 'anulada' else 'devuelta_parcial' end where id = p_venta;
  insert into auditoria (empresa_id, usuario, accion, detalle) values (p_empresa, auth.uid(), 'venta.devolucion', format('Venta %s: %s · %s', v.nro, v_total, p_motivo));
  return v_id;
end $$;

/* Ajuste de stock: conteo (fija la cantidad), merma (resta) o ajuste (suma). */
create or replace function ajustar_stock(p_empresa uuid, p_producto uuid, p_tipo text, p_cant numeric, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_stock numeric;
begin
  perform exigir_rol(p_empresa, '{admin,encargado,deposito}');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo: indicá el motivo del ajuste'; end if;
  if p_cant is null or p_cant < 0 then raise exception 'invalido: la cantidad no puede ser negativa'; end if;
  select stock into v_stock from productos where id = p_producto and empresa_id = p_empresa for update;
  if not found then raise exception 'invalido: el producto no existe'; end if;
  if p_tipo = 'conteo' then
    if p_cant <> v_stock then perform _mover_stock(p_empresa, p_producto, p_cant - v_stock, 'conteo', p_motivo, null, null, true); end if;
  elsif p_tipo = 'merma' then perform _mover_stock(p_empresa, p_producto, -p_cant, 'merma', p_motivo, null, null, false);
  elsif p_tipo = 'ajuste' then perform _mover_stock(p_empresa, p_producto, p_cant, 'ajuste', p_motivo, null, null, false);
  else raise exception 'invalido: tipo de ajuste desconocido'; end if;
end $$;

/* Recepción de mercadería. El rol depósito no puede cambiar costos. p_items: [{"producto_id","cant","costo"}] */
create or replace function recibir_compra(p_empresa uuid, p_proveedor uuid, p_items jsonb, p_tipo text, p_nro text, p_cond text, p_medio text, p_actualizar_precio boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rol rol_usuario; v_id uuid := gen_random_uuid(); it record; p productos%rowtype; v_costo numeric; v_neto numeric := 0; v_iva numeric := 0; v_items jsonb := '[]';
begin
  v_rol := exigir_rol(p_empresa, '{admin,encargado,deposito}');
  if not exists (select 1 from proveedores where id = p_proveedor and empresa_id = p_empresa) then raise exception 'invalido: elegí el proveedor'; end if;
  if p_cond not in ('cc', 'contado') then raise exception 'invalido: condición de pago inválida'; end if;
  for it in select (x->>'producto_id')::uuid as pid, (x->>'cant')::numeric as cant, (x->>'costo')::numeric as costo from jsonb_array_elements(p_items) x order by 1 loop
    select * into p from productos where id = it.pid and empresa_id = p_empresa for update;
    if not found then raise exception 'invalido: uno de los productos no existe'; end if;
    if it.cant is null or it.cant <= 0 then raise exception 'invalido: cantidad inválida para "%"', p.nombre; end if;
    v_costo := case when v_rol = 'deposito' or it.costo is null then p.costo else it.costo end;
    if v_costo < 0 then raise exception 'invalido: el precio de compra no puede ser negativo'; end if;
    v_neto := v_neto + v_costo * it.cant; if p_tipo = 'Factura A' then v_iva := v_iva + v_costo * it.cant * p.iva / 100; end if;
    v_items := v_items || jsonb_build_object('producto_id', p.id, 'nombre', p.nombre, 'cant', it.cant, 'costo', v_costo);
    perform _mover_stock(p_empresa, p.id, it.cant, 'compra', coalesce(p_tipo, '') || ' ' || coalesce(p_nro, ''), 'compra', v_id, false);
    if v_rol <> 'deposito' and v_costo <> p.costo then
      update productos set costo = v_costo, precio = case when p_actualizar_precio then round(v_costo * (1 + margen / 100) * (1 + iva / 100), 2) else precio end where id = p.id;
    end if;
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'invalido: escribí cuánto llegó de al menos un producto'; end if;
  insert into compras (id, empresa_id, proveedor_id, usuario, tipo, nro_comp, cond, medio, neto, iva, total, items)
  values (v_id, p_empresa, p_proveedor, auth.uid(), p_tipo, p_nro, p_cond, case when p_cond = 'contado' then p_medio end, round(v_neto, 2), round(v_iva, 2), round(v_neto + v_iva, 2), v_items);
  return v_id;
end $$;

create or replace function saldo_proveedor(p_empresa uuid, p_proveedor uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(total) from compras where empresa_id = p_empresa and proveedor_id = p_proveedor and cond = 'cc'), 0)
       - coalesce((select sum(monto) from pagos_proveedor where empresa_id = p_empresa and proveedor_id = p_proveedor), 0)
$$;
create or replace function pagar_proveedor(p_empresa uuid, p_proveedor uuid, p_monto numeric, p_medio text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_rol(p_empresa, '{admin,encargado}');
  if p_monto is null or p_monto <= 0 then raise exception 'invalido: el monto tiene que ser mayor a cero'; end if;
  perform 1 from proveedores where id = p_proveedor and empresa_id = p_empresa for update;
  if not found then raise exception 'invalido: el proveedor no existe'; end if;
  if p_monto > saldo_proveedor(p_empresa, p_proveedor) + 0.01 then raise exception 'invalido: no podés pagar más de lo que le debés'; end if;
  insert into pagos_proveedor (empresa_id, proveedor_id, usuario, monto, medio) values (p_empresa, p_proveedor, auth.uid(), p_monto, p_medio) returning id into v_id;
  return v_id;
end $$;

create or replace function registrar_gasto(p_empresa uuid, p_categoria text, p_detalle text, p_monto numeric, p_medio text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_rol(p_empresa, '{admin,encargado}');
  if p_monto is null or p_monto <= 0 then raise exception 'invalido: el monto tiene que ser mayor a cero'; end if;
  insert into gastos (empresa_id, usuario, categoria, detalle, monto, medio) values (p_empresa, auth.uid(), p_categoria, p_detalle, p_monto, p_medio) returning id into v_id;
  return v_id;
end $$;
create or replace function anular_gasto(p_empresa uuid, p_gasto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_rol(p_empresa, '{admin,encargado}');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'motivo: indicá por qué se anula'; end if;
  update gastos set anulado_fecha = now(), anulado_usuario = auth.uid(), anulado_motivo = p_motivo where id = p_gasto and empresa_id = p_empresa and anulado_fecha is null;
  if not found then raise exception 'invalido: el gasto no existe o ya estaba anulado'; end if;
end $$;

/* Alta de empresa: quien la crea queda como administrador. */
create or replace function crear_empresa(p_nombre text, p_cond_iva text, p_nombre_usuario text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'permiso: iniciá sesión'; end if;
  insert into empresas (nombre, cond_iva) values (p_nombre, p_cond_iva) returning id into v_id;
  insert into miembros (empresa_id, user_id, rol, nombre) values (v_id, auth.uid(), 'admin', coalesce(p_nombre_usuario, ''));
  return v_id;
end $$;

-- Solo usuarios con sesión iniciada pueden ejecutar las funciones (y cada una verifica el rol)
revoke execute on all functions in schema public from public, anon;
grant execute on function registrar_venta, devolver_venta, ajustar_stock, recibir_compra, pagar_proveedor, registrar_gasto, anular_gasto,
  abrir_caja, cerrar_caja, caja_esperado, saldo_proveedor, crear_empresa, mi_rol, tengo_rol to authenticated;
