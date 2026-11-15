-- What we collect at signup, and the record that they agreed to the terms.
--
-- Three columns on profiles and one on payments:
--
--   phone              -- asked for at signup; theirs to change in settings
--   terms_accepted_at  -- when they ticked the box, stamped by the server
--   terms_version      -- WHICH terms they ticked. Without this the timestamp
--                         is worthless: the document will change, and "they
--                         agreed on 15 Nov" does not say to what.
--   disclaimer_accepted_at on payments -- the payment-specific disclaimer, per
--                         payment rather than per account, because it is about
--                         THIS transfer: no gateway, no automatic refund, a
--                         person checking it by hand.
--
-- handle_new_user() still only writes id and email. The signup action fills
-- these in afterwards with the service role, which means a row with
-- terms_accepted_at null is visible evidence that the account was made some
-- other way than through our form — better than a column anyone holding the
-- public anon key could set to whatever they liked.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

alter table public.payments add column if not exists disclaimer_accepted_at timestamptz;

-- The guard grows again, for the same reason both times: profiles is a row the
-- account holder can write, so anything we put there is theirs to set unless
-- it is named here. Acceptance of the terms is evidence; the person it is
-- evidence against does not get to edit it. phone is deliberately NOT in the
-- list — it is their contact detail and settings lets them change it.
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
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at then
    raise exception
      'plan and plan_expires_at are granted by payment approval, not by the account holder'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception
      'email is set from your verified sign-in address, not from this row'
      using errcode = '42501';
  end if;

  if new.terms_accepted_at is distinct from old.terms_accepted_at
     or new.terms_version is distinct from old.terms_version then
    raise exception
      'terms acceptance is recorded when you agree to them and is not editable afterwards'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_block_self_granted_plan() is
  'Refuses writes by authenticated/anon to the profile columns the account holder does not own: plan, plan_expires_at, email, terms_accepted_at and terms_version. Service role and postgres pass through.';
