// Why the EA cannot place or close trades, and what the trader does about it.
// The codes come from TradeBlockNow() in ea/TradeForce.mq5 (v1.27+) and are
// stored in accounts.ea_trade_block; keep the two lists in step.

export type TradeBlockHelp = { title: string; fix: string };

const HELP: Record<string, TradeBlockHelp> = {
  ALGO_TRADING_OFF: {
    title: "Algo Trading is switched off in MetaTrader",
    fix: "TradeForce can see your trades but cannot close them. Click the Algo Trading button in the MetaTrader toolbar so it turns green.",
  },
  EA_TRADING_OFF: {
    title: "TradeForce isn't allowed to trade on its chart",
    fix: "Double-click TradeForce under Expert Advisors in the Navigator, open the Common tab, tick “Allow Algo Trading” and press OK.",
  },
  BROKER_BLOCKS_EA: {
    title: "Your broker doesn't allow Expert Advisors on this account",
    fix: "Your broker or prop firm has switched off EA trading for this account, so TradeForce cannot close trades that break your rules. Ask them to enable algorithmic trading, or connect an account that allows it.",
  },
  ACCOUNT_READ_ONLY: {
    title: "This login can't trade",
    fix: "MetaTrader is signed in with the investor (read-only) password, or your broker has disabled trading on the account. Sign in again with your main trading password.",
  },
  NO_CONNECTION: {
    title: "MetaTrader has lost its connection to your broker",
    fix: "Nothing can be closed until it reconnects, which usually happens on its own within a minute. If it lasts longer, check the internet connection or your broker's status.",
  },
};

export function tradeBlockHelp(code: string | null | undefined): TradeBlockHelp | null {
  if (!code) return null;
  return (
    HELP[code] ?? {
      title: "TradeForce can't trade on this account",
      fix: `MetaTrader reported “${code}”. Contact support and quote that code.`,
    }
  );
}
