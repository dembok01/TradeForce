-- Onboarding: wizard completion flag, tour flag, and the "about you" answers.
-- Typed columns over jsonb: three known fields with a stable 1:1 UI mapping,
-- queryable later for segmentation. Vocabulary is constrained in zod, not DB
-- CHECKs, to avoid enum-migration churn.

alter table public.profiles
  add column if not exists onboarded_at timestamptz,
  add column if not exists tour_completed_at timestamptz,
  add column if not exists experience_level text,
  add column if not exists markets_traded text[],
  add column if not exists prop_firm text;

-- Existing users who already configured rules have effectively onboarded —
-- don't make them re-draft a charter they already have.
update public.profiles p
set onboarded_at = now()
where p.onboarded_at is null
  and exists (select 1 from public.trading_rules r where r.user_id = p.id);
