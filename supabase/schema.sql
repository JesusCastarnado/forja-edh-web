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
