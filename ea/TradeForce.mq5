//+------------------------------------------------------------------+
//|                                                   TradeForce.mq5 |
//|        Discipline enforcement EA - polls the TradeForce backend, |
//|        enforces the charter in the terminal, reports everything. |
//+------------------------------------------------------------------+
#property copyright "TradeForce"
#property link      "https://trade-force-rouge.vercel.app"
#property version   "1.20"
#property description "Enforces your TradeForce charter: daily loss limit, max trades/day, max open positions, risk per trade, session windows. Blocked states are announced on the chart before you trade; violating pending orders are deleted free; missing or oversized stop-losses are repaired in place; anything else is closed immediately and reported."

#include <Trade/Trade.mqh>
#include <JAson.mqh>

//--- inputs ---------------------------------------------------------
input string ServerUrl            = "https://trade-force-rouge.vercel.app"; // TradeForce server (no trailing slash)
input string ApiKey               = "";   // EA key from Rule Settings (tf_live_...)
input int    PingSeconds          = 5;    // config-version check cadence
input int    FullSyncSeconds      = 60;   // full config re-fetch cadence
input int    AccountReportSeconds = 60;   // equity/balance report cadence
input int    SessionWarnSeconds   = 300;  // chart countdown before the session closes
input int    LossLockGraceSeconds = 30;   // notice after a daily-loss breach before MT5 closes
input int    ReopenGraceSeconds   = 20;   // notice when MT5 is reopened during a loss-locked day
input bool   HardLockOnLossBreach = true; // false = lock the day on-chart only, never close MT5

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

// Why the charter forbids opening anything right now. This one answer drives
// the chart overlay, the pending-order veto and the on-chart status line.
enum ENUM_TF_BLOCK { TF_BLOCK_NONE, TF_BLOCK_SESSION, TF_BLOCK_CAP, TF_BLOCK_LOSS };

datetime g_lastFullSync      = 0;
datetime g_lastAccountReport = 0;
datetime g_lastPing          = 0;    // the timer now ticks at 1s; pings keep their own cadence
int      g_lossBreachDayId   = -1;   // local trading day the daily-loss lock fired
bool     g_webRequestHinted  = false;

ENUM_TF_BLOCK g_blockNow     = TF_BLOCK_NONE;
datetime g_lossLockDeadline  = 0;    // armed = MT5 closes at this time (daily-loss breach only)
bool     g_cfgFromCache      = false; // rules loaded from disk because the dashboard was unreachable
bool     g_connLossAlerted   = false; // one alert per outage, cleared on the next good fetch

// The 1s timer would otherwise rescan deal history every second; these memos
// make ComputeBlocked()/TodayLoss() cheap. A new deal invalidates both.
int      g_cacheDayId           = -1;
int      g_tradesTodayCache     = -1;
datetime g_tradesTodayCacheAt   = 0;
double   g_realizedTodayCache   = 0;
datetime g_realizedTodayCacheAt = 0;

// Failed POSTs are retried on later timer ticks (lost on EA restart - the
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
    Print("TradeForce: retry queue full - dropping POST ", path);
  }
}

void FlushPending() {
  int flushed = 0;
  while (g_pendingCount > 0 && flushed < 4) {   // a few per tick, keep the timer snappy
    int status;
    string response;
    bool sent = Http("POST", g_pendingPath[0], g_pendingBody[0], status, response);
    if (!sent || status < 200 || status >= 300) return; // still failing - try next tick
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
//| a tz database. NY gets the standard US DST rule (2nd Sun Mar -    |
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

// Identity of the trader's current local calendar day - counters "reset" at
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
//| Sessions - mirrors src/lib/trading-sessions.ts (UTC windows)      |
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

string FormatUtcHour(double h) {
  int hh = (int)MathFloor(h);
  int mm = (int)MathRound((h - hh) * 60.0);
  if (mm == 60) { hh += 1; mm = 0; }
  return StringFormat("%02d:%02d", hh % 24, mm);
}

// When exactly one session window is enabled, hand its bounds to the violation
// so the web app can say "outside your London window (08:00-16:30 UTC)". With
// several enabled the bounds are ambiguous, so we leave them off and the web
// explainer falls back to the timestamp.
bool SingleEnabledWindow(double &startOut, double &endOut) {
  int enabled = 0;
  double s = 0, e = 0;
  if (g_cfg.sesLondon)  { enabled++; s = 8.0;  e = 16.5; }
  if (g_cfg.sesNewYork) { enabled++; s = 13.0; e = 22.0; }
  if (g_cfg.sesAsian)   { enabled++; s = 0.0;  e = 9.0; }
  if (g_cfg.sesOverlap) { enabled++; s = 13.0; e = 16.5; }
  if (StringLen(g_cfg.customStart) > 0 && StringLen(g_cfg.customEnd) > 0) {
    double cs = ParseHourString(g_cfg.customStart);
    double ce = ParseHourString(g_cfg.customEnd);
    if (cs >= 0 && ce >= 0) { enabled++; s = cs; e = ce; }
  }
  if (enabled != 1) return false;
  startOut = s;
  endOut = e;
  return true;
}

bool SessionAllowedAt(const double hourUtc) {
  if (!AnySessionRestriction()) return true; // nothing restricted = trade anytime
  if (g_cfg.sesLondon  && InUtcWindow(8.0, 16.5, hourUtc))  return true;
  if (g_cfg.sesNewYork && InUtcWindow(13.0, 22.0, hourUtc)) return true;
  if (g_cfg.sesAsian   && InUtcWindow(0.0, 9.0, hourUtc))   return true;
  if (g_cfg.sesOverlap && InUtcWindow(13.0, 16.5, hourUtc)) return true;
  if (StringLen(g_cfg.customStart) > 0 && StringLen(g_cfg.customEnd) > 0) {
    double s = ParseHourString(g_cfg.customStart);
    double e = ParseHourString(g_cfg.customEnd);
    if (s >= 0 && e >= 0 && InUtcWindow(s, e, hourUtc)) return true;
  }
  return false;
}

bool SessionAllowedNow() {
  MqlDateTime dt;
  TimeToStruct(TimeGMT(), dt);
  return SessionAllowedAt(dt.hour + dt.min / 60.0);
}

// Seconds until the currently-open session flips to blocked; -1 when
// unrestricted or already blocked. A dumb forward scan in one-minute steps
// stays exactly consistent with SessionAllowedAt across overlapping and
// midnight-wrapping windows, which interval algebra would have to re-derive.
int SecondsUntilSessionClose() {
  if (!g_cfg.configured || !g_cfg.isActive) return -1;
  if (!AnySessionRestriction() || !SessionAllowedNow()) return -1;
  datetime gmtNow = TimeGMT();
  datetime minuteStart = (gmtNow / 60) * 60;
  for (int i = 1; i <= 1441; i++) {          // windows repeat daily; 24h scan is enough
    datetime probe = minuteStart + i * 60;
    MqlDateTime dt;
    TimeToStruct(probe, dt);
    if (!SessionAllowedAt(dt.hour + dt.min / 60.0))
      return (int)(probe - gmtNow);          // sessions flip on minute boundaries
  }
  return -1;
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

// Memoized views of the two history scans above. Both only change when a
// deal lands (invalidated in OnTradeTransaction) or the local day rolls
// over (invalidated in OnTimer); the 5s TTL is a safety net for history
// arriving by other means (e.g. a terminal-side resync).
void InvalidateDayCaches() {
  g_tradesTodayCacheAt   = 0;
  g_realizedTodayCacheAt = 0;
}

int CachedTradesToday() {
  datetime now = TimeCurrent();
  if (g_tradesTodayCacheAt == 0 || now - g_tradesTodayCacheAt >= 5) {
    g_tradesTodayCache   = TradesOpenedToday();
    g_tradesTodayCacheAt = now;
  }
  return g_tradesTodayCache;
}

double CachedRealizedToday() {
  datetime now = TimeCurrent();
  if (g_realizedTodayCacheAt == 0 || now - g_realizedTodayCacheAt >= 5) {
    g_realizedTodayCache   = RealizedPnlToday();
    g_realizedTodayCacheAt = now;
  }
  return g_realizedTodayCache;
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
// Runs every timer second, hence the cached realized leg.
double TodayLoss() {
  double total = CachedRealizedToday() + FloatingPnl();
  return total < 0 ? -total : 0;
}

//+------------------------------------------------------------------+
//| Reporting                                                         |
//+------------------------------------------------------------------+
// eventId makes a report idempotent: the server dedupes on (account, eventId),
// so a retried POST after a network drop can't log the same breach twice.
// Callers derive it deterministically from the triggering event (position id,
// or the local day for the once-daily loss lock).
void ReportViolation(const string type, const string eventId, CJAVal &details) {
  CJAVal v;
  v["type"] = type;
  if (StringLen(eventId) > 0) v["eventId"] = eventId;
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

// Lifecycle events (EA removed from the chart). Direct synchronous POST, not
// queued: the caller is OnDeinit, which never gets another timer tick to
// flush a queue. Best-effort by design - if the terminal is dying, it dies.
void ReportEaEvent(const string eventType) {
  CJAVal e;
  e["type"]       = eventType;
  e["occurredAt"] = IsoFromServerTime(TimeCurrent());
  int status;
  string response;
  Http("POST", "/api/ea/events", e.Serialize(), status, response);
  Print("TradeForce: EA event ", eventType, " (status ", status, ")");
}

// A position (or part of one) closed - report the completed round trip.
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
  // The closing deal ticket is unique per round-trip; the server dedupes on
  // (account, brokerDealId) so a retried report can't double-count P/L.
  t["brokerDealId"] = IntegerToString(closingDeal);
  PostJsonQueued("/api/ea/trades", t.Serialize());
}

//+------------------------------------------------------------------+
//| Config sync                                                       |
//+------------------------------------------------------------------+
// Fail-closed on connection loss (founder brief): the last good config is
// persisted to MQL5/Files and reloaded when the dashboard is unreachable, so
// enforcement never switches off with the network. The cache is only used
// when the FETCH fails - a server that answers "not configured" is
// authoritative and must not be overridden by yesterday's rules.
#define TF_CFG_FILE "TradeForce_cfg.json"

void SaveConfigToDisk() {
  if (!g_cfg.configured) return;
  CJAVal j;
  j["configured"]          = true;
  j["configVersion"]       = g_cfg.configVersion;
  j["isActive"]            = g_cfg.isActive;
  j["dailyLossLimit"]      = g_cfg.dailyLossLimit;
  j["maxTradesPerDay"]     = g_cfg.maxTradesPerDay;
  j["maxOpenPositions"]    = g_cfg.maxOpenPositions;
  j["riskPerTradePercent"] = g_cfg.riskPerTradePercent;
  j["sesLondon"]           = g_cfg.sesLondon;
  j["sesNewYork"]          = g_cfg.sesNewYork;
  j["sesAsian"]            = g_cfg.sesAsian;
  j["sesOverlap"]          = g_cfg.sesOverlap;
  j["customStart"]         = g_cfg.customStart;
  j["customEnd"]           = g_cfg.customEnd;
  j["timezone"]            = g_cfg.timezone;
  int h = FileOpen(TF_CFG_FILE, FILE_WRITE | FILE_TXT | FILE_ANSI);
  if (h == INVALID_HANDLE) return;
  FileWriteString(h, j.Serialize());
  FileClose(h);
}

bool LoadConfigFromDisk() {
  if (!FileIsExist(TF_CFG_FILE)) return false;
  int h = FileOpen(TF_CFG_FILE, FILE_READ | FILE_TXT | FILE_ANSI);
  if (h == INVALID_HANDLE) return false;
  string body = "";
  while (!FileIsEnding(h)) body += FileReadString(h);
  FileClose(h);
  CJAVal j;
  if (!j.Deserialize(body)) return false;
  if (!j["configured"].ToBool()) return false;
  g_cfg.configured          = true;
  g_cfg.configVersion       = j["configVersion"].ToInt();
  g_cfg.isActive            = j["isActive"].ToBool();
  g_cfg.dailyLossLimit      = j["dailyLossLimit"].ToDbl();
  g_cfg.maxTradesPerDay     = (int)j["maxTradesPerDay"].ToInt();
  g_cfg.maxOpenPositions    = (int)j["maxOpenPositions"].ToInt();
  g_cfg.riskPerTradePercent = j["riskPerTradePercent"].ToDbl();
  g_cfg.sesLondon           = j["sesLondon"].ToBool();
  g_cfg.sesNewYork          = j["sesNewYork"].ToBool();
  g_cfg.sesAsian            = j["sesAsian"].ToBool();
  g_cfg.sesOverlap          = j["sesOverlap"].ToBool();
  g_cfg.customStart         = j["customStart"].ToStr();
  g_cfg.customEnd           = j["customEnd"].ToStr();
  g_cfg.timezone            = j["timezone"].ToStr();
  g_cfgFromCache = true;
  return true;
}

bool FetchConfig() {
  int status;
  string body;
  if (!Http("GET", "/api/ea/config", "", status, body) || status != 200) {
    Print("TradeForce: config fetch failed (status ", status, ")");
    if (g_cfg.configured && !g_connLossAlerted) {
      g_connLossAlerted = true;
      Alert("TradeForce: dashboard unreachable - enforcing last-known rules until it reconnects.");
    }
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
    Print("TradeForce: no charter configured yet - set rules on the dashboard.");
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
  g_cfgFromCache = false;
  if (g_connLossAlerted) {
    g_connLossAlerted = false;
    Print("TradeForce: dashboard connection restored.");
  }
  SaveConfigToDisk();
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
    FetchConfig(); // something changed on the dashboard - apply within seconds
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

//+------------------------------------------------------------------+
//| Block state - is opening anything right now against the charter?  |
//+------------------------------------------------------------------+
// Priority mirrors the founder brief: a dead day trumps the cap, the cap
// trumps the session window. TF_BLOCK_NONE also covers "charter paused" -
// the trader withdrew consent, so nothing is enforced.
ENUM_TF_BLOCK ComputeBlocked() {
  if (!g_cfg.configured || !g_cfg.isActive) return TF_BLOCK_NONE;
  if (g_lossBreachDayId == LocalDayId(TimeGMT())) return TF_BLOCK_LOSS;
  if (g_cfg.maxTradesPerDay > 0 && CachedTradesToday() >= g_cfg.maxTradesPerDay) return TF_BLOCK_CAP;
  if (!SessionAllowedNow()) return TF_BLOCK_SESSION;
  return TF_BLOCK_NONE;
}

bool IsPendingOrderType(const ENUM_ORDER_TYPE t) {
  return t == ORDER_TYPE_BUY_LIMIT      || t == ORDER_TYPE_SELL_LIMIT ||
         t == ORDER_TYPE_BUY_STOP       || t == ORDER_TYPE_SELL_STOP  ||
         t == ORDER_TYPE_BUY_STOP_LIMIT || t == ORDER_TYPE_SELL_STOP_LIMIT;
}

// Untriggered pending orders are the one thing MT5 lets us veto for free -
// deleting one costs nothing because it never paid the spread. Market order
// types are never touched here: in the order list they are already in
// transit and fighting the broker over them is pointless.
int DeleteAllPendingOrders() {
  int deleted = 0;
  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    ulong ticket = OrderGetTicket(i);
    if (ticket == 0) continue;
    if (!IsPendingOrderType((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE))) continue;
    if (g_trade.OrderDelete(ticket)) deleted++;
    else Print("TradeForce: could not delete pending #", ticket, " - if it fills, enforcement closes it.");
  }
  return deleted;
}

// A pending order placed while the charter forbids trading: delete it before
// it can trigger and report the attempt. This is genuine prevention - the
// order never reaches the market, so the block costs the trader $0.
void BlockPendingOrder(const ulong ticket, const string symbol, const ENUM_TF_BLOCK cause) {
  double volume = 0;
  if (OrderSelect(ticket)) volume = OrderGetDouble(ORDER_VOLUME_CURRENT);
  if (!g_trade.OrderDelete(ticket)) {
    // Mid-fill or already gone - the resulting deal lands in EnforceOnOpen.
    Print("TradeForce: could not delete blocked pending #", ticket);
    return;
  }
  CJAVal d;
  d["blockedPendingOrder"] = true;
  d["orderTicket"] = IntegerToString(ticket);
  d["symbol"]      = symbol;
  d["volume"]      = volume;
  string type = "OUTSIDE_SESSION";
  if (cause == TF_BLOCK_CAP) {
    type = "OVERTRADING";
    d["tradesToday"] = CachedTradesToday() + 1; // the trade it would have been
    d["cap"]         = g_cfg.maxTradesPerDay;
    d["ruleValue"]   = CachedTradesToday() + 1;
    d["ruleLimit"]   = g_cfg.maxTradesPerDay;
  } else if (cause == TF_BLOCK_LOSS) {
    type = "DAILY_LOSS_BREACH";
    d["reason"] = "account locked for the day after daily loss breach";
  } else {
    d["timeUtc"] = IsoFromServerTime(TimeCurrent());
    double ws, we;
    if (SingleEnabledWindow(ws, we)) {
      d["windowStart"] = FormatUtcHour(ws);
      d["windowEnd"]   = FormatUtcHour(we);
    }
  }
  ReportViolation(type, "PO-" + IntegerToString(ticket), d);
}

//+------------------------------------------------------------------+
//| Daily-loss lockdown - the only path that ever closes the terminal |
//+------------------------------------------------------------------+
// Safe to be this aggressive precisely because the account is flat by the
// time it fires: CheckDailyLoss already closed everything, so the only
// trade a dead terminal prevents is the revenge trade.
void ArmLossLockdown(const int graceSeconds) {
  if (!HardLockOnLossBreach) return;
  if (g_lossLockDeadline > 0) return; // already counting down
  g_lossLockDeadline = TimeCurrent() + MathMax(5, graceSeconds);
  Alert(StringFormat("TradeForce: daily loss limit hit - MT5 closes in %d seconds. Locked until your local midnight.",
                     MathMax(5, graceSeconds)));
}

// Best-effort final drain before TerminalClose: the retry queue lives in
// memory and dies with the terminal. Bounded to a few seconds.
void FlushPendingHard(const int passes) {
  for (int p = 0; p < passes && g_pendingCount > 0; p++) {
    FlushPending();
    if (g_pendingCount > 0) Sleep(500);
  }
}

void ExecuteLossLockdown() {
  DeleteAllPendingOrders(); // GTC pendings would fill server-side while MT5 is closed
  ReportAccount();          // final equity snapshot for the dashboard
  FlushPendingHard(3);
  Alert("TradeForce: closing MT5 - daily loss limit. Trading resumes after your local midnight.");
  Print("TradeForce: TerminalClose() on daily-loss lockdown.");
  if (!TerminalClose(0))
    Print("TradeForce: TerminalClose failed - retrying next tick.");
  // Deadline stays armed on purpose: a failed close retries next second.
  return;
}

// The daily-loss kill switch runs on every timer tick too - floating losses
// can breach the limit without any new deal happening. `startup=true` (from
// OnInit, after a restart into an already-breached day) shortens the lockdown
// notice to ReopenGraceSeconds - the trader already had the full notice once.
void CheckDailyLoss(const bool startup = false) {
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
    d["ruleValue"] = loss;
    d["ruleLimit"] = g_cfg.dailyLossLimit;
    ReportViolation("DAILY_LOSS_BREACH", "DLB-" + IntegerToString(today), d);
  }
  ArmLossLockdown(startup ? ReopenGraceSeconds : LossLockGraceSeconds);
}

// Scenarios 4 & 6: a missing or oversized stop-loss is repaired in place.
// PositionModify costs nothing, PositionClose costs the spread - so the trade
// survives, pinned to exactly the trader's own risk cap. Falls back to the
// old close-on-violation only when the broker won't accept the compliant SL
// (stops level too wide) or the modify itself fails (e.g. AutoTrading off).
// The caller must have the position selected (PositionSelectByTicket).
void AutoFixStopLoss(const ulong ticket, const long posId, const string symbol,
                     const double openPrice, const double volume, const double riskPct) {
  double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
  double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
  double tickVal  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
  long   posType  = PositionGetInteger(POSITION_TYPE);
  double tp       = PositionGetDouble(POSITION_TP);

  double newSl   = 0;
  bool   fixable = (balance > 0 && tickSize > 0 && tickVal > 0 && volume > 0);
  if (fixable) {
    double riskMoney = balance * g_cfg.riskPerTradePercent / 100.0;
    double offset    = riskMoney / (tickVal / tickSize * volume); // price distance worth exactly the cap
    int    digits    = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
    newSl = (posType == POSITION_TYPE_BUY) ? openPrice - offset : openPrice + offset;
    newSl = NormalizeDouble(newSl, digits);

    // The broker's minimum stop distance can make the compliant SL illegal.
    double minDist = SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * SymbolInfoDouble(symbol, SYMBOL_POINT);
    double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
    double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
    if (posType == POSITION_TYPE_BUY  && newSl > bid - minDist) fixable = false;
    if (posType == POSITION_TYPE_SELL && newSl < ask + minDist) fixable = false;
  }

  bool fixed = fixable && g_trade.PositionModify(ticket, newSl, tp);

  CJAVal d;
  d["symbol"]    = symbol;
  d["volume"]    = volume;
  d["cap"]       = g_cfg.riskPerTradePercent;
  d["ruleLimit"] = g_cfg.riskPerTradePercent;
  if (riskPct < 0) d["reason"] = "no stop loss attached";
  else {
    d["riskPercent"] = NormalizeDouble(riskPct, 2);
    d["ruleValue"]   = NormalizeDouble(riskPct, 2);
  }
  if (fixed) {
    d["autoFixed"] = true;
    d["newSl"]     = newSl;
    Print("TradeForce: auto-fixed stop-loss on position ", posId, " to ", DoubleToString(newSl, 8));
  } else {
    g_trade.PositionClose(ticket);
  }
  ReportViolation("RISK_PER_TRADE_BREACH", "RPT-" + IntegerToString(posId), d);
}

// A new position just opened - check it against every rule, close it if it
// breaks the charter. "Blocking" in MT5 means closing within the same second.
void EnforceOnOpen(const ulong openingDeal) {
  if (!g_cfg.configured || !g_cfg.isActive) return;
  long   posId      = HistoryDealGetInteger(openingDeal, DEAL_POSITION_ID);
  string dealSymbol = HistoryDealGetString(openingDeal, DEAL_SYMBOL);
  double dealVolume = HistoryDealGetDouble(openingDeal, DEAL_VOLUME);

  // 1. Locked day: after a daily-loss breach, nothing new stays open today.
  if (g_lossBreachDayId == LocalDayId(TimeGMT())) {
    ClosePositionById(posId);
    CJAVal d;
    d["reason"] = "account locked for the day after daily loss breach";
    d["symbol"] = dealSymbol;
    d["volume"] = dealVolume;
    ReportViolation("DAILY_LOSS_BREACH", "LOCK-" + IntegerToString(posId), d);
    return;
  }

  // 2. Session gate.
  if (!SessionAllowedNow()) {
    ClosePositionById(posId);
    CJAVal d;
    d["timeUtc"] = IsoFromServerTime(TimeCurrent());
    d["symbol"]  = dealSymbol;
    d["volume"]  = dealVolume;
    double ws, we;
    if (SingleEnabledWindow(ws, we)) {
      d["windowStart"] = FormatUtcHour(ws);
      d["windowEnd"]   = FormatUtcHour(we);
    }
    ReportViolation("OUTSIDE_SESSION", "SESS-" + IntegerToString(posId), d);
    return;
  }

  // 3. Max open positions (founder-brief priority: positions before trades;
  //    a news gate is reserved between the session and this check).
  if (g_cfg.maxOpenPositions > 0 && PositionsTotal() > g_cfg.maxOpenPositions) {
    ClosePositionById(posId);
    CJAVal d;
    d["open"]      = PositionsTotal();
    d["cap"]       = g_cfg.maxOpenPositions;
    d["ruleValue"] = PositionsTotal();
    d["ruleLimit"] = g_cfg.maxOpenPositions;
    d["symbol"]    = dealSymbol;
    d["volume"]    = dealVolume;
    ReportViolation("OPEN_POSITIONS_BREACH", "OPB-" + IntegerToString(posId), d);
    return;
  }

  // 4. Daily trade cap (this deal is already included in the count).
  if (g_cfg.maxTradesPerDay > 0) {
    int today = TradesOpenedToday();
    if (today > g_cfg.maxTradesPerDay) {
      ClosePositionById(posId);
      CJAVal d;
      d["tradesToday"] = today;
      d["cap"]         = g_cfg.maxTradesPerDay;
      d["ruleValue"]   = today;
      d["ruleLimit"]   = g_cfg.maxTradesPerDay;
      d["symbol"]      = dealSymbol;
      d["volume"]      = dealVolume;
      ReportViolation("OVERTRADING", "OT-" + IntegerToString(posId), d);
      return;
    }
  }

  // 5. Risk per trade. A position without a stop loss is unbounded risk, which
  //    a percentage cap cannot approve - attach the SL to the order itself.
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
      if (riskPct < 0 || riskPct > g_cfg.riskPerTradePercent)
        AutoFixStopLoss(ticket, posId, symbol, open, volume, riskPct);
      break;
    }
  }

  // Anything opened may also tip the daily loss over.
  CheckDailyLoss();
}

//+------------------------------------------------------------------+
//| Chart overlay - banner + watermark, never an opaque cover         |
//+------------------------------------------------------------------+
// The candles (and any riding position) must stay visible: the overlay's job
// is to make the blocked state impossible to miss, not to hide the market.
// MQL5 objects have no alpha channel, so "translucent" = watermark text
// drawn behind the candles rather than a tinted rectangle over them.
#define TF_OBJ_BANNER     "TF_OVERLAY_BANNER"
#define TF_OBJ_BANNER_TXT "TF_OVERLAY_BANNER_TEXT"
#define TF_OBJ_WATERMARK  "TF_OVERLAY_WATERMARK"

void RemoveOverlay() {
  if (ObjectFind(0, TF_OBJ_BANNER) < 0 && ObjectFind(0, TF_OBJ_WATERMARK) < 0) return;
  ObjectDelete(0, TF_OBJ_BANNER);
  ObjectDelete(0, TF_OBJ_BANNER_TXT);
  ObjectDelete(0, TF_OBJ_WATERMARK);
  ChartRedraw(0);
}

void ShowOverlay(const string bannerText, const string watermarkText, const color accent) {
  long w = ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
  long h = ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);

  if (ObjectFind(0, TF_OBJ_BANNER) < 0) {
    ObjectCreate(0, TF_OBJ_BANNER, OBJ_RECTANGLE_LABEL, 0, 0, 0);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_CORNER, CORNER_LEFT_UPPER);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_XDISTANCE, 0);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_YDISTANCE, 0);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_BORDER_TYPE, BORDER_FLAT);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_SELECTABLE, false);
    ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_HIDDEN, true);
  }
  ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_XSIZE, w);
  ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_YSIZE, 32);
  ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_BGCOLOR, accent);
  ObjectSetInteger(0, TF_OBJ_BANNER, OBJPROP_COLOR, accent);

  if (ObjectFind(0, TF_OBJ_BANNER_TXT) < 0) {
    ObjectCreate(0, TF_OBJ_BANNER_TXT, OBJ_LABEL, 0, 0, 0);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_CORNER, CORNER_LEFT_UPPER);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_XDISTANCE, 8);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_YDISTANCE, 8);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_SELECTABLE, false);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_HIDDEN, true);
    ObjectSetString(0, TF_OBJ_BANNER_TXT, OBJPROP_FONT, "Arial Bold");
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_FONTSIZE, 9);
    ObjectSetInteger(0, TF_OBJ_BANNER_TXT, OBJPROP_COLOR, clrWhite);
  }
  ObjectSetString(0, TF_OBJ_BANNER_TXT, OBJPROP_TEXT, bannerText);

  if (StringLen(watermarkText) == 0) {
    ObjectDelete(0, TF_OBJ_WATERMARK);
  } else {
    if (ObjectFind(0, TF_OBJ_WATERMARK) < 0) {
      ObjectCreate(0, TF_OBJ_WATERMARK, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_BACK, true); // draw behind the candles
      ObjectSetString(0, TF_OBJ_WATERMARK, OBJPROP_FONT, "Arial Black");
      ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_FONTSIZE, 30);
    }
    ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_XDISTANCE, w / 2);
    ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_YDISTANCE, h / 2);
    ObjectSetInteger(0, TF_OBJ_WATERMARK, OBJPROP_COLOR, accent);
    ObjectSetString(0, TF_OBJ_WATERMARK, OBJPROP_TEXT, watermarkText);
  }
  ChartRedraw(0);
}

// Copy rule (design review): state the consequence, not just the state - a
// trade closed seconds after filling must read as enforcement, not a bug.
string BlockBannerText(const ENUM_TF_BLOCK reason) {
  switch (reason) {
    case TF_BLOCK_LOSS:
      return "DAY LOCKED - daily loss limit hit. Anything opened today is closed instantly at your cost.";
    case TF_BLOCK_CAP:
      return StringFormat("DAILY CAP REACHED (%d/%d) - another trade will be auto-closed at your cost.",
                          CachedTradesToday(), g_cfg.maxTradesPerDay);
    case TF_BLOCK_SESSION: {
      double ws, we;
      if (SingleEnabledWindow(ws, we))
        return StringFormat("OUTSIDE SESSION (%s-%s UTC) - a trade placed now will be auto-closed at a loss (you pay the spread).",
                            FormatUtcHour(ws), FormatUtcHour(we));
      return "OUTSIDE SESSION - a trade placed now will be auto-closed at a loss (you pay the spread).";
    }
  }
  return "";
}

string BlockWatermarkText(const ENUM_TF_BLOCK reason) {
  if (reason == TF_BLOCK_LOSS)    return "DAY LOCKED";
  if (reason == TF_BLOCK_CAP)     return "CAP REACHED";
  if (reason == TF_BLOCK_SESSION) return "OUTSIDE SESSION";
  return "";
}

// Reconcile g_blockNow with reality; transition side-effects fire exactly once.
void RefreshBlockState() {
  ENUM_TF_BLOCK now = ComputeBlocked();
  if (now == g_blockNow) return;
  g_blockNow = now;

  // Entering session-blocked or a loss-locked day: sweep untriggered pending
  // orders. They were legally placed, but they'd fill while the charter says
  // no trading - deleting them now is free, closing them after a fill is not.
  // Journal only, no violation: the trader broke no rule placing them.
  if (now == TF_BLOCK_SESSION || now == TF_BLOCK_LOSS) {
    int swept = DeleteAllPendingOrders();
    if (swept > 0) Print("TradeForce: swept ", swept, " pending order(s) on entering a blocked state.");
  }

  if (now != TF_BLOCK_NONE) Alert("TradeForce: " + BlockBannerText(now));
  else Print("TradeForce: trading unblocked.");
}

// Blocked -> banner + watermark. Unblocked near session end -> countdown.
void UpdateOverlay() {
  if (g_lossLockDeadline > 0) {
    int left = (int)(g_lossLockDeadline - TimeCurrent());
    if (left < 0) left = 0;
    ShowOverlay(StringFormat("DAILY LOSS LIMIT HIT - MT5 CLOSES IN %02d:%02d. Locked until your local midnight.",
                             left / 60, left % 60),
                "DAY LOCKED", clrFireBrick);
    return;
  }
  if (g_blockNow != TF_BLOCK_NONE) {
    ShowOverlay(BlockBannerText(g_blockNow), BlockWatermarkText(g_blockNow),
                g_blockNow == TF_BLOCK_SESSION ? clrChocolate : clrFireBrick);
    return;
  }
  int s = SecondsUntilSessionClose();
  if (s >= 0 && s <= SessionWarnSeconds) {
    ShowOverlay(StringFormat("SESSION ENDS IN %02d:%02d - new trades are blocked after that.", s / 60, s % 60),
                "", clrChocolate);
    return;
  }
  RemoveOverlay();
}

//+------------------------------------------------------------------+
//| Chart status line                                                 |
//+------------------------------------------------------------------+
void UpdateComment() {
  if (!g_cfg.configured) {
    Comment("TradeForce: no charter configured - set rules on the dashboard.");
    return;
  }
  string status = !g_cfg.isActive ? "INACTIVE"
                : (g_lossBreachDayId == LocalDayId(TimeGMT())) ? "LOCKED (daily loss)"
                : "ACTIVE";
  string line = StringFormat("TradeForce %s | cfg v%I64d | trades today %d%s | loss today %.2f%s",
    status, g_cfg.configVersion, CachedTradesToday(),
    g_cfg.maxTradesPerDay > 0 ? StringFormat("/%d", g_cfg.maxTradesPerDay) : "",
    TodayLoss(),
    g_cfg.dailyLossLimit > 0 ? StringFormat("/%.2f", g_cfg.dailyLossLimit) : "");
  if (g_blockNow == TF_BLOCK_SESSION)  line += " | BLOCKED: outside session";
  else if (g_blockNow == TF_BLOCK_CAP) line += " | BLOCKED: daily cap reached";
  if (g_cfgFromCache)
    line += " | LAST-KNOWN RULES (dashboard offline)";
  if (TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) == 0)
    line += " | AUTOTRADING OFF - enforcement degraded";
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
  if (!FetchConfig() && LoadConfigFromDisk())
    Print("TradeForce: dashboard unreachable - enforcing last-known rules from the disk cache (cfg v",
          g_cfg.configVersion, ").");
  ReportAccount();
  g_cacheDayId = LocalDayId(TimeGMT());
  // 1s timer: overlay countdowns and the loss check need it; network calls
  // keep their own cadence via the g_last* gates.
  EventSetTimer(1);
  CheckDailyLoss(true); // restarting into an already-breached day re-arms the lockdown
  RefreshBlockState();
  UpdateOverlay();
  UpdateComment();
  return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
  EventKillTimer();
  RemoveOverlay();
  Comment("");
  // Removal from the chart is the one deinit reason that means "enforcement
  // is gone". Chart close, terminal shutdown, parameter changes and our own
  // TerminalClose are routine and stay silent.
  if (reason == REASON_REMOVE)
    ReportEaEvent("EA_REMOVED");
}

void OnTimer() {
  // Local-day rollover: yesterday's counters (and loss lock) expire here.
  int today = LocalDayId(TimeGMT());
  if (today != g_cacheDayId) {
    g_cacheDayId = today;
    InvalidateDayCaches();
  }

  if (TimeCurrent() - g_lastPing >= PingSeconds) {
    g_lastPing = TimeCurrent();
    PingForChanges();
  }
  if (TimeCurrent() - g_lastFullSync >= FullSyncSeconds) FetchConfig();
  if (TimeCurrent() - g_lastAccountReport >= AccountReportSeconds) {
    ReportAccount();
    g_lastAccountReport = TimeCurrent();
  }

  CheckDailyLoss();
  FlushPending();

  if (g_lossLockDeadline > 0) {
    if (!g_cfg.configured || !g_cfg.isActive) {
      g_lossLockDeadline = 0; // charter paused on the dashboard - consent withdrawn
      Print("TradeForce: loss lockdown cancelled - charter paused.");
    } else if (TimeCurrent() >= g_lossLockDeadline) {
      ExecuteLossLockdown();
      return;
    }
  }

  RefreshBlockState();
  UpdateOverlay();
  UpdateComment();
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result) {
  // Pending orders are vetoed at placement - the one free prevention MT5
  // allows. Market order types appear here already in transit; those are
  // EnforceOnOpen's problem once the deal lands.
  if (trans.type == TRADE_TRANSACTION_ORDER_ADD) {
    if (IsPendingOrderType(trans.order_type)) {
      ENUM_TF_BLOCK blocked = ComputeBlocked();
      if (blocked != TF_BLOCK_NONE)
        BlockPendingOrder(trans.order, trans.symbol, blocked);
    }
    return;
  }

  if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
  if (!HistoryDealSelect(trans.deal)) return;

  InvalidateDayCaches(); // this deal changes trades-today / realized PnL

  long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
  long type  = HistoryDealGetInteger(trans.deal, DEAL_TYPE);
  if (type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) return; // balance ops etc.

  if (entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
    EnforceOnOpen(trans.deal);
  if (entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
    ReportClosedDeal(trans.deal);

  RefreshBlockState(); // the cap overlay appears the moment trade #N opens
  UpdateOverlay();
  UpdateComment();
}
