import { isVpa } from "./upi";

/**
 * Where the money goes. Read from the environment, never the repo: a UPI handle
 * and a bank account number are the client's, they change without a deploy, and
 * one of them in git history is one of them in git history forever.
 *
 * Returns null rather than throwing when it is not configured, so a fresh
 * deployment shows "payments are not set up yet" on the billing page instead of
 * a 500 — and, more to the point, instead of a QR with an empty payee that
 * scans to nothing.
 */
export type BankDetails = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
};

export type Payee = {
  vpa: string;
  name: string;
  /** Null unless every bank field is present. */
  bank: BankDetails | null;
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

export function parsePayee(env: Env): Payee | null {
  const vpa = clean(env.UPI_VPA);
  const name = clean(env.UPI_PAYEE_NAME);
  if (!isVpa(vpa) || !name) return null;

  const accountName = clean(env.BANK_ACCOUNT_NAME);
  const accountNumber = clean(env.BANK_ACCOUNT_NUMBER);
  const ifsc = clean(env.BANK_IFSC);
  const bankName = clean(env.BANK_NAME);

  // All four or none. A trader who copies three correct fields and one blank
  // one has sent money nowhere, and that is not a form validation error — it is
  // their money gone.
  const bank =
    accountName && accountNumber && ifsc && bankName
      ? { accountName, accountNumber, ifsc, bankName }
      : null;

  return { vpa, name, bank };
}

export function payee(): Payee | null {
  // Referenced by literal name: these are server-only vars, but the habit in
  // this codebase (see lib/env.ts) is to never build an env key by computation.
  return parsePayee({
    UPI_VPA: process.env.UPI_VPA,
    UPI_PAYEE_NAME: process.env.UPI_PAYEE_NAME,
    BANK_ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME,
    BANK_ACCOUNT_NUMBER: process.env.BANK_ACCOUNT_NUMBER,
    BANK_IFSC: process.env.BANK_IFSC,
    BANK_NAME: process.env.BANK_NAME,
  });
}
