-- Forja EDH: tabla de «Mis mazos» en la nube (Supabase).
-- Pégalo en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.

create table if not exists public.decks (
  user_id  uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id       text    not null,                 -- el id que genera la web para cada mazo
  name     text    not null,
  cmds     jsonb   not null default '[]',    -- nombres de los comandantes
  text     text    not null,                 -- la lista del mazo en texto
  stats    jsonb   not null default '{}',    -- foto de estadísticas para la galería
  created  bigint,
  updated  bigint  not null,                 -- milisegundos; gana la versión más reciente
  deleted  boolean not null default false,   -- borrado sincronizado entre dispositivos
  primary key (user_id, id)
);

-- Cada usuario solo ve y toca sus propios mazos.
alter table public.decks enable row level security;

drop policy if exists "Cada uno sus mazos" on public.decks;
create policy "Cada uno sus mazos" on public.decks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Compartir un mazo y recibir sugerencias de amigos (sin que ellos necesiten cuenta).

-- Enlace de compartir: si un mazo tiene share_id, cualquiera con el enlace puede verlo.
alter table public.decks add column if not exists share_id uuid unique;

-- Comunidad: un mazo publicado (published) sale en la lista de la comunidad con el nombre de autor que eligió su dueño.
alter table public.decks add column if not exists published boolean not null default false;
alter table public.decks add column if not exists author text not null default '';
alter table public.decks add column if not exists published_at timestamptz;
create index if not exists decks_public_idx on public.decks (published_at desc) where published and not deleted;

create table if not exists public.suggestions (
  id        uuid primary key default gen_random_uuid(),
  owner     uuid not null references auth.users (id) on delete cascade,  -- dueño del mazo
  deck_id   text not null,
  share_id  uuid not null,
  author    text not null default '',
  message   text not null default '',
  cuts      jsonb not null default '[]',   -- [{ "name": "...", "why": "..." }]
  adds      jsonb not null default '[]',
  status    text not null default 'new',   -- new | applied | dismissed
  created   timestamptz not null default now()
);
create index if not exists suggestions_owner_idx on public.suggestions (owner, created desc);

-- Solo el dueño ve y gestiona las sugerencias de sus mazos. Nadie las inserta directamente:
-- se envían con la función suggest(), que comprueba el enlace.
alter table public.suggestions enable row level security;
drop policy if exists "Ver sugerencias de mis mazos" on public.suggestions;
create policy "Ver sugerencias de mis mazos" on public.suggestions for select to authenticated using (owner = auth.uid());
drop policy if exists "Gestionar sugerencias de mis mazos" on public.suggestions;
create policy "Gestionar sugerencias de mis mazos" on public.suggestions for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "Borrar sugerencias de mis mazos" on public.suggestions;
create policy "Borrar sugerencias de mis mazos" on public.suggestions for delete to authenticated using (owner = auth.uid());

-- Guía del mazo escrita con IA ({ text, at, forText }); se ve en el enlace compartido.
alter table public.decks add column if not exists guide jsonb;

-- Leer un mazo compartido (nombre, comandantes, lista, estadísticas, guía y, si está en la comunidad, el autor;
-- nada de la cuenta del dueño). Se borra y se crea de nuevo porque lo que devuelve ha cambiado con el tiempo.
drop function if exists public.shared_deck(uuid);
create function public.shared_deck(p_share uuid)
returns table (name text, cmds jsonb, text text, stats jsonb, updated bigint, author text, published boolean, guide jsonb)
language sql stable security definer set search_path = public as $$
  select d.name, d.cmds, d.text, d.stats, d.updated, d.author, d.published, d.guide
  from public.decks d where d.share_id = p_share and not d.deleted limit 1;
$$;

-- Lista de la comunidad: los mazos publicados, con buscador por nombre, comandante o autor.
create or replace function public.community_decks(p_search text default '', p_limit int default 30, p_offset int default 0)
returns table (share_id uuid, name text, cmds jsonb, stats jsonb, author text, updated bigint, published_at timestamptz, mine boolean, suggestions bigint)
language sql stable security definer set search_path = public as $$
  select d.share_id, d.name, d.cmds, d.stats, d.author, d.updated, d.published_at,
         coalesce(d.user_id = auth.uid(), false),
         (select count(*) from public.suggestions s where s.share_id = d.share_id)
  from public.decks d
  where d.published and not d.deleted and d.share_id is not null
    and (coalesce(p_search, '') = ''
         or d.name ilike '%' || p_search || '%'
         or d.cmds::text ilike '%' || p_search || '%'
         or d.author ilike '%' || p_search || '%')
  order by d.published_at desc nulls last
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Enviar una sugerencia a un mazo compartido, con límites de tamaño.
create or replace function public.suggest(p_share uuid, p_author text, p_message text, p_cuts jsonb, p_adds jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare d record; new_id uuid;
begin
  select user_id, id into d from public.decks where share_id = p_share and not deleted limit 1;
  if not found then raise exception 'Este mazo ya no se comparte'; end if;
  if jsonb_typeof(p_cuts) <> 'array' or jsonb_typeof(p_adds) <> 'array'
     or jsonb_array_length(p_cuts) > 60 or jsonb_array_length(p_adds) > 60
     or pg_column_size(p_cuts) + pg_column_size(p_adds) > 30000 then
    raise exception 'Sugerencia demasiado grande';
  end if;
  if jsonb_array_length(p_cuts) + jsonb_array_length(p_adds) = 0 then raise exception 'La sugerencia está vacía'; end if;
  insert into public.suggestions (owner, deck_id, share_id, author, message, cuts, adds)
  values (d.user_id, d.id, p_share, left(coalesce(p_author, ''), 60), left(coalesce(p_message, ''), 1000), p_cuts, p_adds)
  returning id into new_id;
  return new_id;
end $$;

grant execute on function public.shared_deck(uuid) to anon, authenticated;
grant execute on function public.community_decks(text, int, int) to anon, authenticated;
grant execute on function public.suggest(uuid, text, text, jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Colección y lista de deseos: una fila por usuario con todas sus cartas
-- ({ clave: { n: nombre, q: copias, w: en la lista de deseos, u: ms de la última modificación } }).

create table if not exists public.collections (
  user_id  uuid   primary key default auth.uid() references auth.users (id) on delete cascade,
  items    jsonb  not null default '{}',
  updated  bigint not null default 0
);

alter table public.collections enable row level security;
drop policy if exists "Cada uno su colección" on public.collections;
create policy "Cada uno su colección" on public.collections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Para que la API vea al momento las tablas y funciones nuevas.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Panel de administración: quién tiene IA en la web publicada y cuánto se gasta.
-- Los administradores se dan de alta a mano aquí (insert into public.admins …) y además
-- deben estar en ALLOWED_EMAILS de Vercel. Nadie más puede ver ni tocar estas tablas.

create table if not exists public.admins (
  email text primary key  -- en minúsculas
);
alter table public.admins enable row level security;  -- sin políticas: solo se lee desde las funciones

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Personas con acceso a la IA (además de los administradores).
create table if not exists public.ai_access (
  email    text primary key,              -- en minúsculas
  note     text not null default '',
  enabled  boolean not null default true,
  added_at timestamptz not null default now()
);
alter table public.ai_access enable row level security;
drop policy if exists "Admins gestionan el acceso a la IA" on public.ai_access;
create policy "Admins gestionan el acceso a la IA" on public.ai_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ¿Puede la sesión actual usar la IA? Lo pregunta api/claude.js con el token de quien llama.
create or replace function public.ai_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.ai_access where enabled and email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Registro de consumo: una fila por cada respuesta de la IA en la web publicada.
create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  user_id       uuid,
  email         text not null default '',
  action        text not null default '',
  model         text not null default '',
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(10, 6) not null default 0
);
create index if not exists ai_usage_at_idx on public.ai_usage (at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "Admins ven el consumo" on public.ai_usage;
create policy "Admins ven el consumo" on public.ai_usage for select to authenticated using (public.is_admin());

-- Lo llama api/claude.js al terminar cada respuesta, con el token de quien usó la IA.
create or replace function public.log_ai_usage(p_action text, p_model text, p_in int, p_out int, p_cost numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_allowed() then return; end if;
  insert into public.ai_usage (user_id, email, action, model, input_tokens, output_tokens, cost_usd)
  values (auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), left(coalesce(p_action, ''), 40), left(coalesce(p_model, ''), 60),
          greatest(0, coalesce(p_in, 0)), greatest(0, coalesce(p_out, 0)), greatest(0, coalesce(p_cost, 0)));
end $$;

-- Para el panel: cuentas que han entrado en la web (para darles IA con un clic).
drop function if exists public.admin_users();
create or replace function public.admin_users()
returns table (email text, created_at timestamptz, last_sign_in_at timestamptz, is_admin boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Solo para administradores'; end if;
  return query select lower(u.email)::text, u.created_at, u.last_sign_in_at,
    exists (select 1 from public.admins a where a.email = lower(u.email))
    from auth.users u where u.email is not null order by u.last_sign_in_at desc nulls last;
end $$;

revoke execute on function public.admin_users() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.ai_allowed() to authenticated;
grant execute on function public.log_ai_usage(text, text, int, int, numeric) to authenticated;
grant execute on function public.admin_users() to authenticated;

-- ---------------------------------------------------------------------------
-- Historial de versiones de cada mazo (las últimas 20), sincronizado con el mazo.
alter table public.decks add column if not exists history jsonb not null default '[]';
