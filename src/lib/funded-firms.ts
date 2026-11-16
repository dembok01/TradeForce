/**
 * Prop firms that issue MetaTrader 5 accounts the EA can attach to, as the
 * client listed them on 15 Nov 2026. Shown in full only to paying traders, on
 * the funded setup page; the landing page names three (RUNS_ON in content.ts).
 *
 * This is a platform fact about each firm, not a ruling on its contract. Each
 * firm sets its own EA, VPS and third party access rules, so every place this
 * list appears also sends the trader to their own firm's rules. What we have
 * actually read lives in mt5_brokers.ea_policy (20261105000000_broker_ea_policy.sql),
 * and the dashboard shows it next to the name where we have it.
 */
export const FUNDED_FIRMS = [
  "FTMO",
  "Funding Pips",
  "The 5%ers",
  "Blueberry Funded",
  "Funded Trading Plus",
  "City Traders Imperium",
  "E8 Markets",
  "Blue Guardian",
  "AquaFunded",
  "Fintokei",
  "Lux Trading Firm",
  "Fidelcrest",
  "BrightFunded",
  "FX2 Funding",
  "Traders With Edge",
  "The Trading Pit",
  "Funding Frontier",
  "Audacity Capital",
  "FunderPro",
  "Instant Funding",
  "Crypto Fund Trader",
  "Funding Traders",
] as const;
