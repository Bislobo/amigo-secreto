-- Amigo Secreto — esquema da base de dados (Supabase / Postgres)
-- Corre este ficheiro inteiro no "SQL Editor" do Supabase. Pode ser corrido mais do que uma vez.
--
-- Segurança: as tabelas têm RLS ligado e nenhuma política, por isso a chave pública
-- não consegue ler nada diretamente. Tudo passa por funções que só devolvem o que
-- cada link pode ver (o participante só vê o seu próprio par).

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  budget          integer not null default 60,
  admin_key       uuid not null unique default gen_random_uuid(),
  status          text not null default 'setup' check (status in ('setup', 'open', 'drawn')),
  invites_sent_at timestamptz,
  deadline        timestamptz,
  drawn_at        timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.participants (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  house       text not null,
  token       uuid not null unique default gen_random_uuid(),
  wish1       text,
  wish2       text,
  wish3       text,
  wishes_at   timestamptz,
  receiver_id uuid references public.participants(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists participants_event_idx on public.participants(event_id);

-- Opções de cada amigo secreto.
alter table public.events add column if not exists use_houses     boolean not null default true; -- false: todos podem calhar a todos
alter table public.events add column if not exists wishes_enabled boolean not null default true; -- false: sem desejos, sorteio logo ao começar
alter table public.events add column if not exists draw_hours     integer not null default 72;   -- horas até ao sorteio automático
alter table public.participants alter column house set default '';

alter table public.events       enable row level security;
alter table public.participants enable row level security;
revoke all on public.events, public.participants from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções internas (não acessíveis pela chave pública)
-- ---------------------------------------------------------------------------

-- Grupo de cada pessoa para a regra das casas. Sem casas (ou casa vazia),
-- cada pessoa é o seu próprio grupo, por isso só não se pode tirar a si própria.
create or replace function public._group_of(p_use_houses boolean, p_house text, p_id uuid)
returns text language sql immutable as $$
  select case when p_use_houses and coalesce(p_house, '') <> '' then 'h:' || p_house else 'p:' || p_id::text end
$$;

-- Verifica se é possível sortear: ninguém pode tirar alguém da mesma casa,
-- o que só é possível se nenhuma casa tiver mais de metade das pessoas.
create or replace function public._draw_problem(p_event uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_max   int;
  v_house text;
begin
  select count(*) into v_total from participants where event_id = p_event;
  if v_total < 2 then
    return 'São precisas pelo menos 2 pessoas.';
  end if;
  select min(p.house), count(*) into v_house, v_max
    from participants p join events e on e.id = p.event_id
    where p.event_id = p_event
    group by _group_of(e.use_houses, p.house, p.id) order by count(*) desc limit 1;
  if v_max * 2 > v_total then
    return format('A casa "%s" tem %s de %s pessoas: assim não há sorteio possível.', v_house, v_max, v_total);
  end if;
  return null;
end $$;

-- Faz o sorteio: baralha até encontrar uma distribuição em que ninguém
-- tira alguém da própria casa (o que também exclui tirar-se a si próprio).
create or replace function public._do_draw(p_event uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_ids    uuid[];
  v_houses text[];
  v_perm   int[];
  v_n      int;
  v_ok     boolean;
  i        int;
  attempt  int;
begin
  select status into v_status from events where id = p_event for update;
  if v_status is distinct from 'open' then
    return false;
  end if;
  if _draw_problem(p_event) is not null then
    return false;
  end if;

  select array_agg(p.id order by p.id), array_agg(_group_of(e.use_houses, p.house, p.id) order by p.id)
    into v_ids, v_houses
    from participants p join events e on e.id = p.event_id
    where p.event_id = p_event;
  v_n := array_length(v_ids, 1);

  for attempt in 1..20000 loop
    select array_agg(g order by random()) into v_perm from generate_series(1, v_n) g;
    v_ok := true;
    for i in 1..v_n loop
      if v_houses[i] = v_houses[v_perm[i]] then
        v_ok := false;
        exit;
      end if;
    end loop;
    if v_ok then
      for i in 1..v_n loop
        update participants set receiver_id = v_ids[v_perm[i]] where id = v_ids[i];
      end loop;
      update events set status = 'drawn', drawn_at = now() where id = p_event;
      return true;
    end if;
  end loop;
  raise exception 'Não foi possível encontrar um sorteio válido.';
end $$;

-- Sorteia se já passou o prazo ou se todos já escolheram os 3 desejos.
create or replace function public._maybe_draw(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event   events;
  v_missing int;
begin
  select * into v_event from events where id = p_event;
  if v_event.status <> 'open' then
    return;
  end if;
  select count(*) into v_missing from participants
    where event_id = p_event and wishes_at is null;
  if not v_event.wishes_enabled or now() >= v_event.deadline or v_missing = 0 then
    perform _do_draw(p_event);
  end if;
end $$;

-- Chamada pelo agendamento (pg_cron) de 5 em 5 minutos.
create or replace function public._cron_check()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select id from events where status = 'open' and deadline <= now() loop
    perform _maybe_draw(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funções do organizador (protegidas pela chave de administração do evento)
-- ---------------------------------------------------------------------------

create or replace function public._event_by_key(p_admin_key uuid)
returns events language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  select * into v_event from events where admin_key = p_admin_key;
  if not found then
    raise exception 'Chave de organizador inválida.';
  end if;
  return v_event;
end $$;

create or replace function public.create_event(p_name text, p_budget integer default 60)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Dá um nome ao amigo secreto.';
  end if;
  insert into events(name, budget) values (left(trim(p_name), 80), coalesce(p_budget, 60))
    returning * into v_event;
  return json_build_object('admin_key', v_event.admin_key);
end $$;

create or replace function public.admin_get(p_admin_key uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  v_event := _event_by_key(p_admin_key);
  perform _maybe_draw(v_event.id);
  select * into v_event from events where id = v_event.id;
  -- Os pares (receiver_id) e os desejos nunca são devolvidos ao organizador.
  return json_build_object(
    'name', v_event.name,
    'budget', v_event.budget,
    'use_houses', v_event.use_houses,
    'wishes_enabled', v_event.wishes_enabled,
    'draw_hours', v_event.draw_hours,
    'status', v_event.status,
    'deadline', v_event.deadline,
    'drawn_at', v_event.drawn_at,
    'problem', _draw_problem(v_event.id),
    'participants', coalesce((
      select json_agg(json_build_object(
        'id', id, 'name', name, 'phone', phone, 'house', house,
        'token', token, 'has_wishes', wishes_at is not null
      ) order by house, created_at)
      from participants where event_id = v_event.id), '[]'::json)
  );
end $$;

create or replace function public.admin_save_participant(
  p_admin_key uuid, p_id uuid, p_name text, p_phone text, p_house text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  v_event := _event_by_key(p_admin_key);
  if v_event.status = 'drawn' then
    raise exception 'O sorteio já foi feito.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'O nome é obrigatório.';
  end if;
  if v_event.use_houses and coalesce(trim(p_house), '') = '' then
    raise exception 'Indica a casa de %.', trim(p_name);
  end if;
  if p_id is null then
    insert into participants(event_id, name, phone, house)
      values (v_event.id, left(trim(p_name), 60), left(coalesce(trim(p_phone), ''), 30), left(coalesce(trim(p_house), ''), 40));
  else
    update participants
       set name = left(trim(p_name), 60), phone = left(coalesce(trim(p_phone), ''), 30), house = left(coalesce(trim(p_house), ''), 40)
     where id = p_id and event_id = v_event.id;
  end if;
end $$;

create or replace function public.admin_remove_participant(p_admin_key uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  v_event := _event_by_key(p_admin_key);
  if v_event.status = 'drawn' then
    raise exception 'O sorteio já foi feito.';
  end if;
  delete from participants where id = p_id and event_id = v_event.id;
end $$;

-- Muda as definições. As opções de casas, desejos e budget só mudam antes do sorteio;
-- os desejos só podem ser ligados/desligados antes de começar.
drop function if exists public.admin_update_event(uuid, text, integer);
create or replace function public.admin_update_event(
  p_admin_key uuid, p_name text, p_budget integer,
  p_use_houses boolean default null, p_wishes_enabled boolean default null, p_draw_hours integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event events;
  v_hours int;
begin
  v_event := _event_by_key(p_admin_key);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Dá um nome ao amigo secreto.';
  end if;
  if p_budget is null or p_budget < 1 then
    raise exception 'O budget tem de ser pelo menos 1 €.';
  end if;
  v_hours := coalesce(p_draw_hours, v_event.draw_hours);
  if v_hours < 1 or v_hours > 24 * 60 then
    raise exception 'O tempo até ao sorteio tem de estar entre 1 hora e 60 dias.';
  end if;
  if v_event.status = 'drawn' and (p_budget <> v_event.budget
       or coalesce(p_use_houses, v_event.use_houses) <> v_event.use_houses
       or v_hours <> v_event.draw_hours) then
    raise exception 'O sorteio já foi feito: só o nome pode mudar.';
  end if;
  if v_event.status <> 'setup' and coalesce(p_wishes_enabled, v_event.wishes_enabled) <> v_event.wishes_enabled then
    raise exception 'Os desejos só podem ser ligados ou desligados antes de começar.';
  end if;
  update events
     set name = left(trim(p_name), 80), budget = p_budget,
         use_houses = coalesce(p_use_houses, use_houses),
         wishes_enabled = coalesce(p_wishes_enabled, wishes_enabled),
         draw_hours = v_hours,
         deadline = case when invites_sent_at is not null then invites_sent_at + make_interval(hours => v_hours) else deadline end
   where id = v_event.id;
  perform _maybe_draw(v_event.id);
end $$;

-- Abre o amigo secreto: começa a contagem de 72 horas.
create or replace function public.admin_start(p_admin_key uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event   events;
  v_problem text;
begin
  v_event := _event_by_key(p_admin_key);
  if v_event.status <> 'setup' then
    return;
  end if;
  v_problem := _draw_problem(v_event.id);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;
  update events
     set status = 'open', invites_sent_at = now(), deadline = now() + make_interval(hours => v_event.draw_hours)
   where id = v_event.id;
  -- Sem desejos não há primeira fase: o sorteio é feito logo.
  if not v_event.wishes_enabled then
    perform _do_draw(v_event.id);
  end if;
end $$;

-- Sortear já, sem esperar pelo fim do prazo.
create or replace function public.admin_draw_now(p_admin_key uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  v_event := _event_by_key(p_admin_key);
  if v_event.status <> 'open' then
    raise exception 'O amigo secreto ainda não foi aberto ou já foi sorteado.';
  end if;
  perform _do_draw(v_event.id);
end $$;

-- ---------------------------------------------------------------------------
-- Funções do participante (protegidas pelo link pessoal)
-- ---------------------------------------------------------------------------

create or replace function public.get_me(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me    participants;
  v_event events;
  v_rec   participants;
begin
  select * into v_me from participants where token = p_token;
  if not found then
    raise exception 'Link inválido.';
  end if;
  perform _maybe_draw(v_me.event_id);
  select * into v_me from participants where id = v_me.id;
  select * into v_event from events where id = v_me.event_id;

  if v_event.status = 'drawn' and v_me.receiver_id is not null then
    select * into v_rec from participants where id = v_me.receiver_id;
  end if;

  return json_build_object(
    'event', json_build_object('name', v_event.name, 'budget', v_event.budget,
                               'status', v_event.status, 'deadline', v_event.deadline,
                               'use_houses', v_event.use_houses, 'wishes_enabled', v_event.wishes_enabled),
    'me', json_build_object('name', v_me.name, 'phone', v_me.phone, 'house', v_me.house,
                            'wishes', json_build_array(v_me.wish1, v_me.wish2, v_me.wish3),
                            'has_wishes', v_me.wishes_at is not null),
    'receiver', case when v_rec.id is null then null else json_build_object(
                  'name', v_rec.name,
                  'wishes', json_build_array(v_rec.wish1, v_rec.wish2, v_rec.wish3),
                  'has_wishes', v_rec.wishes_at is not null) end,
    -- Para a animação: os outros nomes e quem é da mesma casa (excluído).
    'others', case when v_event.status = 'drawn' then coalesce((
                select json_agg(json_build_object('name', name,
                                  'excluded', _group_of(v_event.use_houses, house, id) = _group_of(v_event.use_houses, v_me.house, v_me.id))
                                order by random())
                from participants where event_id = v_me.event_id and id <> v_me.id), '[]'::json)
              else null end
  );
end $$;

create or replace function public.submit_wishes(p_token uuid, p_wish1 text, p_wish2 text, p_wish3 text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me     participants;
  v_status text;
begin
  select * into v_me from participants where token = p_token;
  if not found then
    raise exception 'Link inválido.';
  end if;
  select status into v_status from events where id = v_me.event_id;
  if not (select wishes_enabled from events where id = v_me.event_id) then
    raise exception 'Este amigo secreto não tem desejos.';
  end if;
  if v_status = 'drawn' then
    raise exception 'O sorteio já foi feito, já não é possível mudar os desejos.';
  end if;
  if coalesce(trim(p_wish1), '') = '' or coalesce(trim(p_wish2), '') = '' or coalesce(trim(p_wish3), '') = '' then
    raise exception 'Escreve as 3 coisas que gostavas de receber.';
  end if;
  update participants
     set wish1 = left(trim(p_wish1), 200), wish2 = left(trim(p_wish2), 200), wish3 = left(trim(p_wish3), 200),
         wishes_at = now()
   where id = v_me.id;
  perform _maybe_draw(v_me.event_id);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões: a chave pública só pode chamar as funções acima sem "_".
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_event(text, integer)                         to anon, authenticated;
grant execute on function public.admin_get(uuid)                                     to anon, authenticated;
grant execute on function public.admin_save_participant(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_remove_participant(uuid, uuid)                to anon, authenticated;
grant execute on function public.admin_update_event(uuid, text, integer, boolean, boolean, integer) to anon, authenticated;
grant execute on function public.admin_start(uuid)                                   to anon, authenticated;
grant execute on function public.admin_draw_now(uuid)                                to anon, authenticated;
grant execute on function public.get_me(uuid)                                        to anon, authenticated;
grant execute on function public.submit_wishes(uuid, text, text, text)               to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendamento: de 5 em 5 minutos verifica se algum prazo de 72 h acabou.
-- (Mesmo sem isto, o sorteio acontece assim que alguém abre um link depois do prazo.)
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'amigo-secreto-sorteio';
  perform cron.schedule('amigo-secreto-sorteio', '*/5 * * * *', 'select public._cron_check()');
exception when others then
  raise notice 'pg_cron indisponível (%). O sorteio continua a acontecer quando alguém abre um link depois do prazo.', sqlerrm;
end $$;
