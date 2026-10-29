-- Emails collected while True Brainrot is free. The app can add a row and never read one back; the
-- owner reads the list in the dashboard. The format check is what keeps the list clean. A repeat
-- from one PC fails on the primary key, and a second address from one PC on one day fails on
-- one_signup_a_day, which the app treats as "try again tomorrow", never as an error.
--
-- What this does NOT stop: anyone holding the app's public key can still add rows, one per request,
-- by inventing a fresh device_id. That key ships in every installer, so treat the list as public
-- input and read it, never trust it.
create table public.signups (
  email text not null check (length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  device_id uuid not null,
  created_at timestamptz not null default now(),
  signed_up_on date not null default current_date,
  primary key (email, device_id)
);

create unique index one_signup_a_day on public.signups (device_id, signed_up_on);

alter table public.signups enable row level security;
-- The day can only ever be today: a row cannot be backdated to dodge one_signup_a_day.
create policy "anyone can sign up" on public.signups for insert to anon
  with check (signed_up_on = current_date);

revoke all on public.signups from anon, authenticated;
grant insert on public.signups to anon;
