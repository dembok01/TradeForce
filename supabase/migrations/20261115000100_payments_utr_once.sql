-- One UPI transaction ID can be live on one payment at a time.
--
-- The payments table left `utr` deliberately non-unique, on the argument that
-- a duplicate is something the operator should SEE rather than something the
-- database hides behind a 23505. That was half an argument: the admin queue
-- never surfaced duplicates, so in practice nobody saw anything, and a trader
-- who pasted a transaction ID already used on another payment could get a
-- second plan out of one movement of money.
--
-- A UPI transaction ID identifies one payment, so two live rows can never
-- legitimately share one. Rejected and abandoned rows stay outside the index,
-- so a trader whose claim was wrongly rejected can resubmit the same, correct
-- ID once it is sorted out — which is the case the original comment was
-- really protecting, and it survives.
--
-- claimPaymentAction turns the resulting 23505 into a sentence the trader can
-- act on, and logs a warning so a deliberate reuse is still visible to us.
create unique index if not exists payments_utr_live_idx
  on public.payments (utr)
  where utr is not null and status in ('claimed', 'approved');
