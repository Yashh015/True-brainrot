-- Accounts for True Brainrot: subscription status and up to 2 PCs per account.
-- Run once in the Supabase dashboard → SQL Editor. Safe to read: it only creates these objects.

create table public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,                 -- e.g. 'paddle'; null during the free trial
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);

create table public.devices (
  user_id uuid not null references auth.users on delete cascade,
  device_id uuid not null,
  name text not null,            -- Windows computer name, so you know which PC to sign out
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- Users may read their own rows and nothing else. No write policies: subscriptions are written
-- only by the payment webhook (service role) and the trigger below, devices only by the functions.
alter table public.subscriptions enable row level security;
alter table public.devices enable row level security;
create policy "read own subscription" on public.subscriptions for select using (user_id = auth.uid());
create policy "read own devices" on public.devices for select using (user_id = auth.uid());

-- Every new account starts a 7-day free trial, no card needed.
create function public.start_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions (user_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '7 days');
  return new;
end $$;

create trigger start_trial after insert on auth.users
  for each row execute function public.start_trial();

-- Signing in on a PC registers it; a third PC is refused until another is signed out.
create function public.register_device(p_device_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- One account at a time, so two PCs racing for the last slot can't both get in.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if not exists (select 1 from public.devices where user_id = auth.uid() and device_id = p_device_id)
     and (select count(*) from public.devices where user_id = auth.uid()) >= 2 then
    raise exception 'device_limit';
  end if;
  insert into public.devices (user_id, device_id, name) values (auth.uid(), p_device_id, left(p_name, 100))
  on conflict (user_id, device_id) do update set name = excluded.name, last_seen = now();
end $$;

create function public.remove_device(p_device_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.devices where user_id = auth.uid() and device_id = p_device_id;
$$;

-- Only signed-in users may call the device functions.
revoke execute on function public.register_device(uuid, text) from public, anon;
revoke execute on function public.remove_device(uuid) from public, anon;
grant execute on function public.register_device(uuid, text) to authenticated;
grant execute on function public.remove_device(uuid) to authenticated;
-- The trigger function is never called directly.
revoke execute on function public.start_trial() from public, anon, authenticated;
