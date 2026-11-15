-- Widen the profile guard to cover email.
--
-- Same hole as plan/plan_expires_at, one column over. profiles_update_own lets
-- the owner write their row and `authenticated` holds table-level UPDATE, so
-- until now a trader could PATCH their own profiles.email to any address.
--
-- Two things went wrong with that:
--
--   1. The payment emails looked the recipient up in profiles, so a trader
--      could aim "we're checking your payment" at any address they liked and
--      have it arrive from our verified domain. One email per payment cycle is
--      not a spam cannon, but it is our sending reputation paying for it.
--
--   2. The operator console shows profiles.email beside each claim. A forged
--      address means the person approving a payment is reading a name the
--      payer chose, while deciding whether the money is theirs.
--
-- Nothing legitimate writes this column after signup: handle_new_user() sets
-- it, and a real email change belongs to Supabase auth, which verifies the new
-- address before it means anything. So the owner has no business writing it.
--
-- The function keeps its original name because the trigger refers to it and
-- renaming would mean dropping and recreating both; its remit is now the set
-- of profile columns the account holder does not own.

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

  return new;
end;
$$;

comment on function public.profiles_block_self_granted_plan() is
  'Refuses writes by authenticated/anon to the profile columns the account holder does not own: plan, plan_expires_at and email. Service role and postgres pass through.';
