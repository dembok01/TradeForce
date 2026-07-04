//+------------------------------------------------------------------+
//|                                                   TradeForce.mq5 |
//|        Discipline enforcement EA — polls the TradeForce backend, |
//|        enforces the charter in the terminal, reports everything. |
//+------------------------------------------------------------------+
#property copyright "TradeForce"
#property link      "https://trade-force-rouge.vercel.app"
#property version   "1.00"
#property description "Enforces your TradeForce charter: daily loss limit, max trades/day, max open positions, risk per trade, session windows. Violating trades are closed immediately and reported."

#include <Trade/Trade.mqh>
#include <JAson.mqh>

//--- inputs ---------------------------------------------------------
input string ServerUrl            = "https://trade-force-rouge.vercel.app"; // TradeForce server (no trailing slash)
input string ApiKey               = "";   // EA key from Rule Settings (tf_live_...)
input int    PingSeconds          = 5;    // config-version check cadence
input int    FullSyncSeconds      = 60;   // full config re-fetch cadence
input int    AccountReportSeconds = 60;   // equity/balance report cadence

//--- config mirrored from GET /api/ea/config ------------------------
struct TfConfig {
  bool   configured;
  bool   isActive;
  long   configVersion;
  double dailyLossLimit;       // 0 = unset
  int    maxTradesPerDay;      // 0 = unset
  int    maxOpenPositions;     // 0 = unset
  double riskPerTradePercent;  // 0 = unset
  bool   sesLondon;
  bool   sesNewYork;
  bool   sesAsian;
  bool   sesOverlap;
  string customStart;          // "HH:MM[:SS]" or ""
  string customEnd;
  string timezone;             // IANA name (Asia/Kolkata | UTC | America/New_York)
};

TfConfig g_cfg;
CTrade   g_trade;

datetime g_lastFullSync      = 0;
datetime g_lastAccountReport = 0;
int      g_lossBreachDayId   = -1;   // local trading day the daily-loss lock fired
bool     g_webRequestHinted  = false;

// Failed POSTs are retried on later timer ticks (lost on EA restart — the
// server is the durable record, this just smooths transient network drops).
#define PENDING_MAX 64
string g_pendingPath[PENDING_MAX];
string g_pendingBody[PENDING_MAX];
int    g_pendingCount = 0;

//+------------------------------------------------------------------+
//| HTTP                                                              |
//+------------------------------------------------------------------+
bool Http(const string method, const string path, const string body, int &status, string &response) {
  status = 0;
  response = "";
  string url = ServerUrl + path;
  string headers = "Authorization: Bearer " + ApiKey + "\r\nContent-Type: application/json\r\n";
  char data[];
  if (StringLen(body) > 0)
    StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
  char result[];
  string resultHeaders;
  ResetLastError();
  int res = WebRequest(method, url, headers, 5000, data, result, resultHeaders);
  if (res == -1) {
    int err = GetLastError();
    if (!g_webRequestHinted) {
      g_webRequestHinted = true;
      Print("TradeForce: WebRequest failed (error ", err, "). If this is 4014, add ",
            ServerUrl, " under Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.");
    }
    return false;
  }
  status = res;
  response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
  if (status == 429)
    Print("TradeForce: rate limited by server; backing off until next timer tick.");
  return true;
}

void PostJsonQueued(const string path, const string body) {
  int status;
  string response;
  bool sent = Http("POST", path, body, status, response);
  if (sent && status >= 200 && status < 300) return;
  if (g_pendingCount < PENDING_MAX) {
    g_pendingPath[g_pendingCount] = path;
    g_pendingBody[g_pendingCount] = body;
    g_pendingCount++;
    Print("TradeForce: queued failed POST ", path, " (status ", status, ", queue ", g_pendingCount, ")");
  } else {
    Print("TradeForce: retry queue full — dropping POST ", path);
  }
}

void FlushPending() {
  int flushed = 0;
  while (g_pendingCount > 0 && flushed < 4) {   // a few per tick, keep the timer snappy
    int status;
    string response;
    bool sent = Http("POST", g_pendingPath[0], g_pendingBody[0], status, response);
    if (!sent || status < 200 || status >= 300) return; // still failing — try next tick
    for (int i = 1; i < g_pendingCount; i++) {
      g_pendingPath[i - 1] = g_pendingPath[i];
      g_pendingBody[i - 1] = g_pendingBody[i];
    }
    g_pendingCount--;
    flushed++;
  }
}

//+------------------------------------------------------------------+
//| Time & timezone                                                   |
//| The product offers three timezones; a tiny table beats shipping   |
//| a tz database. NY gets the standard US DST rule (2nd Sun Mar –    |
//| 1st Sun Nov).                                                     |
//+------------------------------------------------------------------+
int FirstSundayOfMonth(const int year, const int month) {
  MqlDateTime dt;
  datetime first = StringToTime(StringFormat("%04d.%02d.01 00:00", year, month));
  TimeToStruct(first, dt);
  return 1 + ((7 - dt.day_of_week) % 7);
}

bool IsUsDst(const datetime gmtNow) {
  MqlDateTime dt;
  TimeToStruct(gmtNow, dt);
  if (dt.mon < 3 || dt.mon > 11) return false;
  if (dt.mon > 3 && dt.mon < 11) return true;
  if (dt.mon == 3) {
    int secondSunday = FirstSundayOfMonth(dt.year, 3) + 7;
    return dt.day > secondSunday || (dt.day == secondSunday && dt.hour >= 7); // ~2am ET
  }
  int firstSunday = FirstSundayOfMonth(dt.year, 11);
  return dt.day < firstSunday || (dt.day == firstSunday && dt.hour < 6);
}

int TimezoneOffsetMinutes(const datetime gmtNow) {
  if (g_cfg.timezone == "Asia/Kolkata") return 330;
  if (g_cfg.timezone == "America/New_York") return IsUsDst(gmtNow) ? -240 : -300;
  return 0; // UTC and anything unrecognised
}

// Identity of the trader's current local calendar day — counters "reset" at
// the trader's midnight simply because this window slides.
int LocalDayId(const datetime gmtNow) {
  return (int)((gmtNow + TimezoneOffsetMinutes(gmtNow) * 60) / 86400);
}

// Server-clock datetime of the trader's local midnight (deal times are server time).
datetime DayStartServerTime() {
  datetime gmtNow = TimeGMT();
  int offsetSec = TimezoneOffsetMinutes(gmtNow) * 60;
  datetime localNow = gmtNow + offsetSec;
  datetime localMidnightAsGmt = (localNow / 86400) * 86400 - offsetSec;
  return localMidnightAsGmt + (TimeCurrent() - TimeGMT());
}

string IsoFromServerTime(const datetime serverTime) {
  datetime gmt = serverTime - (TimeCurrent() - TimeGMT());
  MqlDateTime dt;
  TimeToStruct(gmt, dt);
  return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

//+------------------------------------------------------------------+
//| Sessions — mirrors src/lib/trading-sessions.ts (UTC windows)      |
//+------------------------------------------------------------------+
bool InUtcWindow(const double startH, const double endH, const double hourNow) {
  if (startH <= endH) return hourNow >= startH && hourNow < endH;
  return hourNow >= startH || hourNow < endH; // wraps past midnight
}

double ParseHourString(const string hhmm) {
  string parts[];
  if (StringSplit(hhmm, ':', parts) < 2) return -1;
  return StringToInteger(parts[0]) + StringToInteger(parts[1]) / 60.0;
}

bool AnySessionRestriction() {
  return g_cfg.sesLondon || g_cfg.sesNewYork || g_cfg.sesAsian || g_cfg.sesOverlap ||
         (StringLen(g_cfg.customStart) > 0 && StringLen(g_cfg.customEnd) > 0);
}

bool SessionAllowedNow() {
  if (!AnySessionRestriction()) return true; // nothing restricted = trade anytime
  MqlDateTime dt;
  TimeToStruct(TimeGMT(), dt);
  double hourNow = dt.hour + dt.min / 60.0;
  if (g_cfg.sesLondon  && InUtcWindow(8.0, 16.5, hourNow))  return true;
  if (g_cfg.sesNewYork && InUtcWindow(13.0, 22.0, hourNow)) return true;
  if (g_cfg.sesAsian   && InUtcWindow(0.0, 9.0, hourNow))   return true;
  if (g_cfg.sesOverlap && InUtcWindow(13.0, 16.5, hourNow)) return true;
  if (StringLen(g_cfg.customStart) > 0 && StringLen(g_cfg.customEnd) > 0) {
    double s = ParseHourString(g_cfg.customStart);
    double e = ParseHourString(g_cfg.customEnd);
    if (s >= 0 && e >= 0 && InUtcWindow(s, e, hourNow)) return true;
  }
  return false;
}

//+------------------------------------------------------------------+
//| Today's stats, recomputed from deal history (survives restarts)   |
//+------------------------------------------------------------------+
int TradesOpenedToday() {
  datetime from = DayStartServerTime();
  if (!HistorySelect(from, TimeCurrent() + 60)) return 0;
  int count = 0;
  for (int i = 0; i < HistoryDealsTotal(); i++) {
    ulong ticket = HistoryDealGetTicket(i);
    if (ticket == 0) continue;
    long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
    long type  = HistoryDealGetInteger(ticket, DEAL_TYPE);
    if ((entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) &&
        (type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL))
      count++;
  }
  return count;
}

double RealizedPnlToday() {
  datetime from = DayStartServerTime();
  if (!HistorySelect(from, TimeCurrent() + 60)) return 0;
  double pnl = 0;
  for (int i = 0; i < HistoryDealsTotal(); i++) {
    ulong ticket = HistoryDealGetTicket(i);
    if (ticket == 0) continue;
    long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
    if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
      pnl += HistoryDealGetDouble(ticket, DEAL_PROFIT)
           + HistoryDealGetDouble(ticket, DEAL_SWAP)
           + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
  }
  return pnl;
}

double FloatingPnl() {
  double pnl = 0;
  for (int i = 0; i < PositionsTotal(); i++) {
    ulong ticket = PositionGetTicket(i);
    if (ticket != 0 && PositionSelectByTicket(ticket))
      pnl += PositionGetDouble(POSITION_PROFIT);
  }
  return pnl;
}

// Loss counts realized + floating, matching "if everything closed right now".
double TodayLoss() {
  double total = RealizedPnlToday() + FloatingPnl();
  return total < 0 ? -total : 0;
}

//+------------------------------------------------------------------+
//| Reporting                                                         |
//+------------------------------------------------------------------+
void ReportViolation(const string type, CJAVal &details) {
  CJAVal v;
  v["type"] = type;
  v["details"].Set(details);
  v["occurredAt"] = IsoFromServerTime(TimeCurrent());
  PostJsonQueued("/api/ea/violations", v.Serialize());
  Print("TradeForce: VIOLATION ", type);
}

void ReportAccount() {
  CJAVal a;
  a["equity"]  = AccountInfoDouble(ACCOUNT_EQUITY);
  a["balance"] = AccountInfoDouble(ACCOUNT_BALANCE);
  PostJsonQueued("/api/ea/account", a.Serialize());
}

// A position (or part of one) closed — report the completed round trip.
void ReportClosedDeal(const ulong closingDeal) {
  long posId = HistoryDealGetInteger(closingDeal, DEAL_POSITION_ID);
  double exitPrice = HistoryDealGetDouble(closingDeal, DEAL_PRICE);
  double volume    = HistoryDealGetDouble(closingDeal, DEAL_VOLUME);
  double pnl       = HistoryDealGetDouble(closingDeal, DEAL_PROFIT)
                   + HistoryDealGetDouble(closingDeal, DEAL_SWAP)
                   + HistoryDealGetDouble(closingDeal, DEAL_COMMISSION);
  string symbol    = HistoryDealGetString(closingDeal, DEAL_SYMBOL);
  datetime exitTime = (datetime)HistoryDealGetInteger(closingDeal, DEAL_TIME);

  // Find the opening deal of this position for direction/entry.
  string direction = "LONG";
  double entryPrice = 0;
  datetime entryTime = exitTime;
  if (HistorySelectByPosition(posId)) {
    for (int i = 0; i < HistoryDealsTotal(); i++) {
      ulong ticket = HistoryDealGetTicket(i);
      if (ticket == 0) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) {
        direction  = (HistoryDealGetInteger(ticket, DEAL_TYPE) == DEAL_TYPE_BUY) ? "LONG" : "SHORT";
        entryPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
        entryTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
        break;
      }
    }
  }

  CJAVal t;
  t["symbol"]     = symbol;
  t["direction"]  = direction;
  t["entryPrice"] = entryPrice;
  t["exitPrice"]  = exitPrice;
  t["quantity"]   = volume;
  t["pnl"]        = pnl;
  t["entryTime"]  = IsoFromServerTime(entryTime);
  t["exitTime"]   = IsoFromServerTime(exitTime);
  PostJsonQueued("/api/ea/trades", t.Serialize());
}

//+------------------------------------------------------------------+
//| Config sync                                                       |
//+------------------------------------------------------------------+
bool FetchConfig() {
  int status;
  string body;
  if (!Http("GET", "/api/ea/config", "", status, body) || status != 200) {
    Print("TradeForce: config fetch failed (status ", status, ")");
    return false;
  }
  CJAVal json;
  if (!json.Deserialize(body)) {
    Print("TradeForce: config parse failed: ", body);
    return false;
  }
  g_cfg.configured = json["configured"].ToBool();
  if (!g_cfg.configured) {
    g_cfg.isActive = false;
    Print("TradeForce: no charter configured yet — set rules on the dashboard.");
    return true;
  }
  g_cfg.configVersion       = json["configVersion"].ToInt();
  g_cfg.isActive            = json["isActive"].ToBool();
  g_cfg.dailyLossLimit      = json["dailyLossLimit"].ToDbl();
  g_cfg.maxTradesPerDay     = (int)json["maxTradesPerDay"].ToInt();
  g_cfg.maxOpenPositions    = (int)json["maxOpenPositions"].ToInt();
  g_cfg.riskPerTradePercent = json["riskPerTradePercent"].ToDbl();
  g_cfg.sesLondon           = json["sessions"]["london"].ToBool();
  g_cfg.sesNewYork          = json["sessions"]["newYork"].ToBool();
  g_cfg.sesAsian            = json["sessions"]["asian"].ToBool();
  g_cfg.sesOverlap          = json["sessions"]["londonNyOverlap"].ToBool();
  g_cfg.customStart         = json["sessions"]["customStart"].ToStr();
  g_cfg.customEnd           = json["sessions"]["customEnd"].ToStr();
  g_cfg.timezone            = json["sessions"]["timezone"].ToStr();
  g_lastFullSync = TimeCurrent();
  Print("TradeForce: config loaded (v", g_cfg.configVersion, ", active=", g_cfg.isActive, ")");
  return true;
}

void PingForChanges() {
  int status;
  string body;
  if (!Http("GET", "/api/ea/ping", "", status, body) || status != 200) return;
  CJAVal json;
  if (!json.Deserialize(body)) return;
  long remoteVersion = json["configVersion"].ToInt();
  bool remoteConfigured = json["configured"].ToBool();
  if (remoteConfigured != g_cfg.configured || remoteVersion != g_cfg.configVersion)
    FetchConfig(); // something changed on the dashboard — apply within seconds
}

//+------------------------------------------------------------------+
//| Enforcement                                                       |
//+------------------------------------------------------------------+
bool ClosePositionById(const long posId) {
  for (int i = 0; i < PositionsTotal(); i++) {
    ulong ticket = PositionGetTicket(i);
    if (ticket != 0 && PositionSelectByTicket(ticket) &&
        PositionGetInteger(POSITION_IDENTIFIER) == posId)
      return g_trade.PositionClose(ticket);
  }
  return false; // already gone (closed/SL/TP)
}

void CloseAllPositions() {
  for (int i = PositionsTotal() - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket != 0) g_trade.PositionClose(ticket);
  }
}

// The daily-loss kill switch runs on every timer tick too — floating losses
// can breach the limit without any new deal happening.
void CheckDailyLoss() {
  if (!g_cfg.configured || !g_cfg.isActive || g_cfg.dailyLossLimit <= 0) return;
  double loss = TodayLoss();
  if (loss < g_cfg.dailyLossLimit) return;
  int today = LocalDayId(TimeGMT());
  bool firstBreachToday = (g_lossBreachDayId != today);
  if (PositionsTotal() > 0) CloseAllPositions();
  if (firstBreachToday) {
    g_lossBreachDayId = today;
    CJAVal d;
    d["lossToday"] = loss;
    d["limit"]     = g_cfg.dailyLossLimit;
    ReportViolation("DAILY_LOSS_BREACH", d);
  }
}

// A new position just opened — check it against every rule, close it if it
// breaks the charter. "Blocking" in MT5 means closing within the same second.
void EnforceOnOpen(const ulong openingDeal) {
  if (!g_cfg.configured || !g_cfg.isActive) return;
  long posId = HistoryDealGetInteger(openingDeal, DEAL_POSITION_ID);

  // 1. Locked day: after a daily-loss breach, nothing new stays open today.
  if (g_lossBreachDayId == LocalDayId(TimeGMT())) {
    ClosePositionById(posId);
    CJAVal d;
    d["reason"] = "account locked for the day after daily loss breach";
    ReportViolation("DAILY_LOSS_BREACH", d);
    return;
  }

  // 2. Session gate.
  if (!SessionAllowedNow()) {
    ClosePositionById(posId);
    CJAVal d;
    d["timeUtc"] = IsoFromServerTime(TimeCurrent());
    ReportViolation("OUTSIDE_SESSION", d);
    return;
  }

  // 3. Daily trade cap (this deal is already included in the count).
  if (g_cfg.maxTradesPerDay > 0) {
    int today = TradesOpenedToday();
    if (today > g_cfg.maxTradesPerDay) {
      ClosePositionById(posId);
      CJAVal d;
      d["tradesToday"] = today;
      d["cap"]         = g_cfg.maxTradesPerDay;
      ReportViolation("OVERTRADING", d);
      return;
    }
  }

  // 4. Max open positions.
  if (g_cfg.maxOpenPositions > 0 && PositionsTotal() > g_cfg.maxOpenPositions) {
    ClosePositionById(posId);
    CJAVal d;
    d["open"] = PositionsTotal();
    d["cap"]  = g_cfg.maxOpenPositions;
    ReportViolation("OPEN_POSITIONS_BREACH", d);
    return;
  }

  // 5. Risk per trade. A position without a stop loss is unbounded risk, which
  //    a percentage cap cannot approve — attach the SL to the order itself.
  if (g_cfg.riskPerTradePercent > 0) {
    for (int i = 0; i < PositionsTotal(); i++) {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if (PositionGetInteger(POSITION_IDENTIFIER) != posId) continue;

      string symbol   = PositionGetString(POSITION_SYMBOL);
      double sl       = PositionGetDouble(POSITION_SL);
      double open     = PositionGetDouble(POSITION_PRICE_OPEN);
      double volume   = PositionGetDouble(POSITION_VOLUME);
      double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickVal  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);

      double riskPct = -1; // -1 = no stop loss
      if (sl > 0 && tickSize > 0 && balance > 0) {
        double riskMoney = MathAbs(open - sl) / tickSize * tickVal * volume;
        riskPct = riskMoney / balance * 100.0;
      }
      if (riskPct < 0 || riskPct > g_cfg.riskPerTradePercent) {
        g_trade.PositionClose(ticket);
        CJAVal d;
        if (riskPct < 0) d["reason"] = "no stop loss attached";
        else             d["riskPercent"] = NormalizeDouble(riskPct, 2);
        d["cap"] = g_cfg.riskPerTradePercent;
        ReportViolation("RISK_PER_TRADE_BREACH", d);
      }
      break;
    }
  }

  // Anything opened may also tip the daily loss over.
  CheckDailyLoss();
}

//+------------------------------------------------------------------+
//| Chart status line                                                 |
//+------------------------------------------------------------------+
void UpdateComment() {
  if (!g_cfg.configured) {
    Comment("TradeForce: no charter configured — set rules on the dashboard.");
    return;
  }
  string status = !g_cfg.isActive ? "INACTIVE"
                : (g_lossBreachDayId == LocalDayId(TimeGMT())) ? "LOCKED (daily loss)"
                : "ACTIVE";
  string line = StringFormat("TradeForce %s | cfg v%I64d | trades today %d%s | loss today %.2f%s",
    status, g_cfg.configVersion, TradesOpenedToday(),
    g_cfg.maxTradesPerDay > 0 ? StringFormat("/%d", g_cfg.maxTradesPerDay) : "",
    TodayLoss(),
    g_cfg.dailyLossLimit > 0 ? StringFormat("/%.2f", g_cfg.dailyLossLimit) : "");
  Comment(line);
}

//+------------------------------------------------------------------+
//| MT5 entry points                                                  |
//+------------------------------------------------------------------+
int OnInit() {
  if (StringLen(ApiKey) == 0 || StringFind(ApiKey, "tf_live_") != 0) {
    Alert("TradeForce: set the ApiKey input to a key generated on the Rule Settings page.");
    return INIT_PARAMETERS_INCORRECT;
  }
  g_cfg.configured = false;
  g_cfg.configVersion = -1;
  FetchConfig();
  ReportAccount();
  EventSetTimer(MathMax(1, PingSeconds));
  UpdateComment();
  return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
  EventKillTimer();
  Comment("");
}

void OnTimer() {
  PingForChanges();
  if (TimeCurrent() - g_lastFullSync >= FullSyncSeconds) FetchConfig();
  if (TimeCurrent() - g_lastAccountReport >= AccountReportSeconds) {
    ReportAccount();
    g_lastAccountReport = TimeCurrent();
  }
  CheckDailyLoss();
  FlushPending();
  UpdateComment();
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result) {
  if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
  if (!HistoryDealSelect(trans.deal)) return;

  long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
  long type  = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
  if (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) return; // balance ops etc.

  if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
    EnforceOnOpen(trans.deal);
  if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
    ReportClosedDeal(trans.deal);

  UpdateComment();
}
