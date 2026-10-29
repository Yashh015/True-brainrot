-- Emails collected while True Brainrot is free. The app can add a row and never read one back; the
-- owner reads the list in the dashboard. A repeat from one PC fails on the primary key, and a second
-- email from one PC on one day fails on one_signup_a_day, so a script holding the public key can
-- still add rows but slowly, and never malformed ones.
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
create policy "anyone can sign up" on public.signups for insert to anon with check (true);

revoke all on public.signups from anon, authenticated;
grant insert on public.signups to anon;
