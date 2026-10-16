-- Mostrador · factura electrónica con ARCA (WSFEv1)
-- Ejecutar DESPUÉS de schema.sql. Es independiente: si no se ejecuta, el resto
-- del sistema funciona igual y las ventas quedan "sin autorizar".
--
-- Reglas:
--  * El CAE solo lo escribe la función de servidor (functions/arca-wsfe) con la
--    clave service_role. Ningún usuario puede marcar una venta como autorizada.
--  * Un CAE de HOMOLOGACIÓN es de prueba: se guarda en comprobantes_arca pero
--    nunca convierte la venta en un comprobante fiscal.
--  * Nada se borra: cada intento queda registrado con su respuesta.

create table arca_config (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  ambiente text not null default 'homologacion' check (ambiente in ('homologacion', 'produccion')),
  punto_venta int not null check (punto_venta between 1 and 99998),
  habilitado boolean not null default false,
  verificado_en timestamptz,          -- lo completa el servidor tras un CAE aprobado en homologación
  actualizado_en timestamptz not null default now()
);

-- Ticket de acceso del WSAA (dura unas 12 horas). Solo lo lee el servidor.
create table arca_tokens (
  cuit text not null, ambiente text not null, servicio text not null,
  token text not null, sign text not null, expira timestamptz not null,
  primary key (cuit, ambiente, servicio)
);

-- Turno para numerar: ARCA exige números correlativos por punto de venta y
-- tipo, así que solo un pedido por vez puede estar en curso.
create table arca_numeracion (
  empresa_id uuid not null references empresas(id) on delete cascade,
  punto_venta int not null, cbte_tipo int not null,
  tomado_por uuid, tomado_en timestamptz,
  primary key (empresa_id, punto_venta, cbte_tipo)
);

create table comprobantes_arca (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas(id),
  venta_id uuid not null references ventas(id),
  ambiente text not null check (ambiente in ('homologacion', 'produccion')),
  punto_venta int not null, cbte_tipo int not null, numero bigint,
  estado text not null check (estado in ('enviando', 'aprobado', 'rechazado', 'incierto', 'error')),
  cae text check (cae is null or cae ~ '^[0-9]{14}$'),
  cae_vto date,
  errores jsonb not null default '[]', observaciones jsonb not null default '[]',
  pedido jsonb,
  creado_en timestamptz not null default now(), actualizado_en timestamptz,
  check ((estado = 'aprobado') = (cae is not null))
);
create unique index comprobante_numero_unico on comprobantes_arca (empresa_id, ambiente, punto_venta, cbte_tipo, numero) where estado = 'aprobado';
create unique index una_autorizacion_por_venta on comprobantes_arca (venta_id, ambiente) where estado = 'aprobado';
create index on comprobantes_arca (empresa_id, creado_en);

alter table arca_config enable row level security;
alter table arca_tokens enable row level security;
alter table arca_numeracion enable row level security;
alter table comprobantes_arca enable row level security;
create policy ver_arca_config on arca_config for select using (tengo_rol(empresa_id, '{admin,encargado}'));
create policy editar_arca_config on arca_config for all using (tengo_rol(empresa_id, '{admin}')) with check (tengo_rol(empresa_id, '{admin}'));
create policy ver_comprobantes_arca on comprobantes_arca for select using (tengo_rol(empresa_id, '{admin,encargado,vendedor}'));

-- Supabase da permisos por defecto a las tablas nuevas: se quitan y se dan solo los necesarios.
revoke all on arca_config, arca_tokens, arca_numeracion, comprobantes_arca from anon, authenticated;
grant select on arca_config, comprobantes_arca to authenticated;
grant insert (empresa_id, ambiente, punto_venta, habilitado) on arca_config to authenticated;
grant update (ambiente, punto_venta, habilitado) on arca_config to authenticated;

-- Funciones que usa el servidor (service_role). No se pueden llamar desde la app.
create or replace function arca_tomar_turno(p_empresa uuid, p_pto int, p_tipo int, p_turno uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ok uuid;
begin
  insert into arca_numeracion (empresa_id, punto_venta, cbte_tipo, tomado_por, tomado_en)
  values (p_empresa, p_pto, p_tipo, p_turno, now())
  on conflict (empresa_id, punto_venta, cbte_tipo) do update set tomado_por = excluded.tomado_por, tomado_en = excluded.tomado_en
    where arca_numeracion.tomado_por is null or arca_numeracion.tomado_en < now() - interval '2 minutes'
  returning tomado_por into v_ok;
  return v_ok is not null;
end $$;

create or replace function arca_soltar_turno(p_empresa uuid, p_pto int, p_tipo int, p_turno uuid) returns void
language sql security definer set search_path = public as $$
  update arca_numeracion set tomado_por = null, tomado_en = null
  where empresa_id = p_empresa and punto_venta = p_pto and cbte_tipo = p_tipo and tomado_por = p_turno;
$$;

-- Aplica el resultado de un comprobante a su venta. Solo un CAE de producción
-- vuelve fiscal a la venta; un rechazo la deja "rechazada" para corregir y reintentar.
create or replace function arca_aplicar(p_comprobante bigint) returns text
language plpgsql security definer set search_path = public as $$
declare c comprobantes_arca%rowtype;
begin
  select * into c from comprobantes_arca where id = p_comprobante;
  if not found then raise exception 'invalido: comprobante inexistente'; end if;
  if c.ambiente <> 'produccion' then return 'prueba'; end if;
  if c.estado = 'aprobado' then
    update ventas set fiscal_estado = 'autorizado', cae = c.cae, cae_vto = c.cae_vto, nro_fiscal = c.numero
    where id = c.venta_id and fiscal_estado in ('sin_autorizar', 'rechazado');
    insert into auditoria (empresa_id, usuario, accion, detalle)
    values (c.empresa_id, null, 'arca.cae', format('Venta %s autorizada: comprobante %s-%s, CAE %s', c.venta_id, c.punto_venta, c.numero, c.cae));
    return 'autorizado';
  elsif c.estado = 'rechazado' then
    update ventas set fiscal_estado = 'rechazado' where id = c.venta_id and fiscal_estado = 'sin_autorizar';
    return 'rechazado';
  end if;
  return c.estado;
end $$;

revoke execute on function arca_tomar_turno(uuid, int, int, uuid), arca_soltar_turno(uuid, int, int, uuid), arca_aplicar(bigint) from public, anon, authenticated;
grant execute on function arca_tomar_turno(uuid, int, int, uuid), arca_soltar_turno(uuid, int, int, uuid), arca_aplicar(bigint) to service_role;
