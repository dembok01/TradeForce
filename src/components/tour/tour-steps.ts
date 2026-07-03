export type TourStep = {
  id: string;
  /** data-tour-id of the spotlight target; null renders a centered card. */
  targetId: string | null;
  /** Fallback target below lg, where the sidebar (and its nav items) is hidden. */
  mobileTargetId?: string;
  title: string;
  body: string;
};

// Copy teaches the product's vocabulary — charter, enforcement, discipline
// score — in the order a new trader will meet it.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    targetId: null,
    title: "Your charter is signed.",
    body: "This dashboard is where TradeForce enforces it. Six quick stops — here's how to read the ledger.",
  },
  {
    id: "status",
    targetId: "status-badge",
    title: "Account status",
    body: "Safe, warning, or locked — judged live against your charter's limits. The first thing to check each session.",
  },
  {
    id: "stats",
    targetId: "stat-grid",
    title: "Today against the charter",
    body: "Daily loss remaining is the line TradeForce holds. The other tiles fill in as you log trades — automatically once your EA reports.",
  },
  {
    id: "discipline",
    targetId: "discipline-gauge",
    title: "Your discipline score",
    body: "How consistently you follow your own rules, out of 100. Until the EA feeds it daily, it's estimated from your violation record.",
  },
  {
    id: "plan",
    targetId: "nav-trading-plan",
    mobileTargetId: "nav-mobile",
    title: "Trading plan & sessions",
    body: "The charter's provisions measured live, and the session windows you're allowed to trade in.",
  },
  {
    id: "journal",
    targetId: "nav-journal",
    mobileTargetId: "nav-mobile",
    title: "Journal & analytics",
    body: "The record your discipline produces. Log trades with notes, then let the P/L charts tell you whether the charter is working.",
  },
  {
    id: "settings",
    targetId: "nav-settings",
    mobileTargetId: "nav-mobile",
    title: "Amend the charter",
    body: "Rule Settings is where limits change and EA keys are issued. The ? button in the corner replays this tour anytime.",
  },
];
