-- ---------------------------------------------------------------------------
-- Sugerencias para la web (pestaña «Sugerencias»). Cualquiera puede enviar una, con o sin cuenta;
-- quien tiene cuenta ve las suyas y la respuesta. Solo los administradores las leen todas y las gestionan.
create table if not exists public.feedback (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid default auth.uid(),
  email   text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  author  text not null default '' check (char_length(author) <= 40),
  kind    text not null default 'idea' check (kind in ('idea', 'fallo', 'otro')),
  text    text not null check (char_length(text) between 3 and 2000),
  page    text not null default '' check (char_length(page) <= 40),
  status  text not null default 'nueva' check (status in ('nueva', 'vista', 'hecha', 'descartada')),
  reply   text not null default '' check (char_length(reply) <= 1000)
);
create index if not exists feedback_at_idx on public.feedback (at desc);
alter table public.feedback enable row level security;
drop policy if exists "Enviar sugerencias" on public.feedback;
create policy "Enviar sugerencias" on public.feedback for insert to anon, authenticated
  with check (status = 'nueva' and reply = '' and user_id is not distinct from auth.uid()
              and email = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "Ver mis sugerencias" on public.feedback;
create policy "Ver mis sugerencias" on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Admins gestionan sugerencias" on public.feedback;
create policy "Admins gestionan sugerencias" on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins borran sugerencias" on public.feedback;
create policy "Admins borran sugerencias" on public.feedback for delete to authenticated using (public.is_admin());
grant insert on public.feedback to anon, authenticated;
grant select, update, delete on public.feedback to authenticated;

notify pgrst, 'reload schema';
