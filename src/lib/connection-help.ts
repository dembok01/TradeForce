// The next step for a trader whose terminal did not sign in, from the reason
// the broker (or the pool agent) gave. The agent's status_detail carries MT5's
// words, e.g. "Your broker refused the sign-in (Invalid account)."; generic
// advice there is wrong for an expired account, so match the reason first.

export function signInHelp(detail: string | null | undefined): string | null {
  const d = (detail ?? "").toLowerCase();
  if (!d) return null;
  if (d.includes("investor") || d.includes("can't trade"))
    return "You signed in with the investor (read-only) password. Connect again with the main trading password from your broker's account email.";
  if (d.includes("account disabled") || d.includes("disabled"))
    return "Your broker has disabled this account - usually an expired demo or a closed account. Open a new account (or ask your broker to re-enable it) and connect again.";
  if (d.includes("invalid account") || d.includes("invalid password"))
    return "The account number, password and server don't match an account at your broker. Use the trading (master) password, and pick the exact server your account is on - demo and real accounts are on different servers.";
  if (d.includes("not answered") || d.includes("no connection"))
    return "We can't reach that server. Pick your broker and the exact server again from the list; if your broker isn't listed, ask their support for the MT5 server address.";
  if (d.includes("old version"))
    return "Your broker requires a newer MetaTrader version than ours. Our team has been alerted.";
  return null;
}
