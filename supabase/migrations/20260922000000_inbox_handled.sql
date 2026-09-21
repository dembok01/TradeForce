-- Admin inbox: when support dealt with a contact message or broker request, so
-- two people on support don't both answer it. Written through the service role
-- by the admin console only; contact_messages still has no read policy for
-- ordinary users.
alter table public.contact_messages add column if not exists handled_at timestamptz;
