-- Stop a trader granting themselves a paid plan.
--
-- public.profiles is writable by its owner — profiles_update_own, plus a
-- table-level UPDATE grant to `authenticated` — which was fine while every
-- column on it was the trader's own description of themselves. Putting
-- entitlement on that row turned it into a till: a logged-in trader could
-- PATCH {"plan":"paid","plan_expires_at":"2099-01-01"} straight at PostgREST
-- with the public anon key and never pay. Confirmed exploitable against the
-- live project before this ran, on a throwaway account.
--
-- A column-level REVOKE does not close it. `authenticated` holds table-level
-- UPDATE, and in Postgres a table-level privilege already permits every
-- column, so revoking the column adds nothing. The other way round — revoke
-- the table grant, then re-grant the dozen harmless columns one by one —
-- does close it, but silently breaks the next column anyone adds here.
--
-- So the guard is a trigger. It protects exactly these two columns, leaves
-- every other profile write alone, and keeps working as the table grows.
--
-- current_user rather than auth.role(): PostgREST issues SET ROLE per
-- request, so a trader arrives as `authenticated`, the service key as
-- `service_role`, and a migration or psql session as `postgres`. Only the
-- first is refused, which is why approving a payment still works.
--
-- INSERT is covered too. There is no INSERT policy on profiles today, so that
-- path is unreachable and the rows are made by handle_new_user(); adding a
-- policy later should not quietly reopen this.

create or replace function public.profiles_block_self_granted_plan()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan is not null or new.plan_expires_at is not null then
      raise exception
        'plan and plan_expires_at are granted by payment approval, not by the account holder'
        using errcode = '42501';
    end if;
  elsif new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at then
    raise exception
      'plan and plan_expires_at are granted by payment approval, not by the account holder'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger profiles_block_self_granted_plan
  before insert or update on public.profiles
  for each row
  execute function public.profiles_block_self_granted_plan();
