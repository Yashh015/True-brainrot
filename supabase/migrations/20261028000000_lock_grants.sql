-- Supabase grants anon and authenticated every privilege on new public tables, so until now RLS was
-- the only thing between the app's key and writes. Take the privileges away too: signed-in users may
-- only read (still just their own rows, by the policies), anon may do nothing. Writes stay with the
-- security definer functions, the trigger and the service role.
-- Run once in the Supabase dashboard → SQL Editor.
revoke all on public.subscriptions, public.devices from anon, authenticated;
grant select on public.subscriptions, public.devices to authenticated;
