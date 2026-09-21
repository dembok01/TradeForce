//+------------------------------------------------------------------+
//|                                                   TradeForce.mq5 |
//|        Discipline enforcement EA - polls the TradeForce backend, |
//|        enforces the charter in the terminal, reports everything. |
//+------------------------------------------------------------------+
#property copyright "TradeForce"
#property link      "https://trade-force-rouge.vercel.app"
#property version   "1.26"
#property description "Enforces your TradeForce charter: daily loss limit, max trades/day, max open positions, risk per trade, session windows. Blocked states are announced on the chart before you trade; violating pending orders are deleted free; missing or oversized stop-losses are repaired in place; anything else is closed immediately and reported."

#include <Trade/Trade.mqh>
#include <JAson.mqh>

//--- inputs ---------------------------------------------------------
input string ServerUrl            = "https://trade-force-rouge.vercel.app"; // TradeForce server (no trailing slash)
input string ApiKey               = "";   // EA key from Rule Settings (tf_live_...)
input int    SyncSeconds          = 60;   // one call: config check + equity report
input int    SessionWarnSeconds   = 300;  // chart countdown before the session closes
input int    LossLockGraceSeconds = 30;   // notice after a daily-loss breach before MT5 closes
input int    ReopenGraceSeconds   = 20;   // notice when MT5 is reopened during a loss-locked day
input bool   HardLockOnLossBreach = true; // false = lock the day on-chart only, never close MT5
input bool   CloudMode            = false; // hosted terminal: no chart drawing, one chart, lean Market Watch
input bool   BridgeMode           = false; // hosted terminal: trade files with the pool agent, no web requests

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
// Seconds to wait before retrying a FAILED full sync. Zero means healthy.
// Without this a failed fetch retries on every 1s timer tick -- 60 requests a
// minute per terminal -- which exhausts the server's request budget and turns a
// brief outage into a permanent one that sustains itself.
int      g_syncBackoff       = 0;
// Ops telemetry. A failure to REACH the server can never be reported when it
// happens, so count locally and ship the totals on the next call that does get
// through. Without this a retry storm is invisible server-side -- which is
// exactly how one ran for six days unnoticed.
int      g_failedFetches     = 0;   // since the last successful account report
int      g_lastHttpStatus    = 0;
int      g_lossBreachDayId   = -1;   // local trading day the daily-loss lock fired
bool     g_webRequestHinted  = false;

ENUM_TF_BLOCK g_blockNow     = TF_BLOCK_NONE;
datetime g_lossLockDeadline  = 0;    // armed = MT5 closes at this time (daily-loss breach only)
bool     g_cfgFromCache      = false; // rules loaded from disk because the dashboard was unreachable
bool     g_connLossAlerted   = false; // one alert per outage, cleared on the next good fetch

// Enforcement that the broker refuses. Before 1.27 a refused close was silent:
// the violation was reported as if enforced, and a daily-loss lockdown then
// closed MT5 with the losing trades still open (21 Sep, a prop-firm trial
// account whose server rejects EA orders).
string   g_closeError        = "";    // broker's reason for the last refused close
string   g_tradeBlock        = "";    // why this EA cannot trade right now, "" = it can
string   g_blockCandidate    = "";    // a change must hold 10s before it is announced
datetime g_blockCandidateAt  = 0;
datetime g_closeAllNextAt    = 0;     // daily-loss close-all retry gate
bool     g_notFlatWarned     = false; // lockdown held open: said once per breach

// The 1s timer would otherwise rescan deal history every second; these memos
// make ComputeBlocked()/TodayLoss() cheap. A new deal invalidates both.
int      g_cacheDayId           = -1;
int      g_tradesTodayCache     = -1;
datetime g_tradesTodayCacheAt   = 0;
double   g_realizedTodayCache   = 0;
datetime g_realizedTodayCacheAt = 0;

// Failed POSTs are retried on later timer ticks (lost on EA restart - the
// server is the durable record, this just smooths transient network drops).
#define EA_VERSION  "1.27"
#define PENDING_MAX 64
string g_pendingPath[PENDING_MAX];
string g_pendingBody[PENDING_MAX];
int    g_pendingCount = 0;
// Retries back off exactly like the sync does. Before 1.26 a report the server
// kept refusing sat at the head of this queue and was resent every second,
// forever: ~86,000 requests a day per terminal, all to be refused again.
datetime g_flushNextAt  = 0;
int      g_flushBackoff = 0;

// Bridge mode (hosted terminals): reports go to files the pool agent relays to
// the database, and rules arrive in a file the agent keeps current. The agent
// stamps each rules file with when it last confirmed them against the database.
#define TF_BRIDGE_OUT           "tf_bridge\\out\\"
#define TF_BRIDGE_INBOX         "tf_bridge\\in\\config.json"
#define TF_BRIDGE_STALE_SECONDS 120   // agent heartbeats every 30s
long     g_inboxMtime = 0;
int      g_bridgeSeq  = 0;

enum ENUM_TF_DELIVERY { TF_DELIVERED, TF_DELIVERY_RETRY, TF_DELIVERY_REJECTED };

//+------------------------------------------------------------------+
//| HTTP                                                              |
//+------------------------------------------------------------------+
// On a hosted terminal nobody sees the window or hears the sound an Alert makes,
// and under Wine each one costs window-system round trips. The journal line is
// the part that matters there.
void Notify(const string message) {
  if (CloudMode) Print(message);
  else Alert(message);
}

// Hosted terminals keep Market Watch to the chart symbol, so a traded symbol may
// need adding before its prices can be read. Wait briefly for the first quote:
// a zero bid would make the stop-loss repair wrongly fall back to closing.
void EnsureSymbol(const string symbol) {
  if (SymbolInfoInteger(symbol, SYMBOL_SELECT)) return;
  SymbolSelect(symbol, true);
  for (int i = 0; i < 20 && SymbolInfoDouble(symbol, SYMBOL_BID) <= 0; i++) Sleep(50);
}

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
  g_lastHttpStatus = res;
  response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
  if (status == 429)
    Print("TradeForce: rate limited by server; backing off until next timer tick.");
  return true;
}

//+------------------------------------------------------------------+
//| Bridge files (BridgeMode)                                         |
//+------------------------------------------------------------------+
// One report = one file. Written under a .tmp name and renamed into place, so
// the agent (which only picks up *.json) never reads half a report. Names start
// with the time so the agent replays a backlog in the order it happened.
bool BridgeWrite(const string kind, const string body) {
  const datetime now = TimeGMT();
  const string envelope = "{\"v\":1,\"kind\":\"" + kind + "\",\"writtenAt\":" + IntegerToString((long)now) +
                          ",\"body\":" + body + "}";
  const string base = StringFormat("%010I64d-%010I64u-%04d-%s", (long)now, GetTickCount64() % 10000000000,
                                   g_bridgeSeq++ % 10000, kind);
  const string tmp = TF_BRIDGE_OUT + base + ".tmp";
  uchar bytes[];
  const int n = StringToCharArray(envelope, bytes, 0, WHOLE_ARRAY, CP_UTF8) - 1; // minus the NUL
  ResetLastError();
  int h = FileOpen(tmp, FILE_WRITE | FILE_BIN);
  if (h == INVALID_HANDLE) {
    // The folder may have been removed under us; recreate once and retry.
    FolderCreate("tf_bridge");
    FolderCreate("tf_bridge\\out");
    h = FileOpen(tmp, FILE_WRITE | FILE_BIN);
  }
  if (h == INVALID_HANDLE) {
    Print("TradeForce: bridge write failed for ", kind, " (error ", GetLastError(), ")");
    return false;
  }
  const uint written = FileWriteArray(h, bytes, 0, n);
  FileClose(h);
  if ((int)written != n || !FileMove(tmp, 0, TF_BRIDGE_OUT + base + ".json", FILE_REWRITE)) {
    Print("TradeForce: bridge write incomplete for ", kind, " (error ", GetLastError(), ")");
    FileDelete(tmp);
    return false;
  }
  return true;
}

bool ReadSmallFile(const string name, string &text) {
  int h = FileOpen(name, FILE_READ | FILE_BIN | FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (h == INVALID_HANDLE) return false;
  const ulong size = FileSize(h);
  uchar bytes[];
  uint got = 0;
  if (size > 0 && size <= 65536) got = FileReadArray(h, bytes, 0, (int)size);
  FileClose(h);
  if (got == 0) return false;
  text = CharArrayToString(bytes, 0, (int)got, CP_UTF8);
  return true;
}

// "/api/ea/violations" -> "violations": the agent routes on the same names.
string BridgeKind(const string path) {
  return StringSubstr(path, StringLen("/api/ea/"));
}

//+------------------------------------------------------------------+
//| Delivery + retry queue                                            |
//+------------------------------------------------------------------+
ENUM_TF_DELIVERY Deliver(const string path, const string body) {
  if (BridgeMode) return BridgeWrite(BridgeKind(path), body) ? TF_DELIVERED : TF_DELIVERY_RETRY;
  int status;
  string response;
  if (!Http("POST", path, body, status, response)) return TF_DELIVERY_RETRY;
  if (status >= 200 && status < 300) return TF_DELIVERED;
  // The server read this report and refused it. The same bytes will be refused
  // every time, so retrying only blocks the reports queued behind it.
  if (status == 400 || status == 413 || status == 422) {
    Print("TradeForce: server refused POST ", path, " (status ", status, "): ", StringSubstr(response, 0, 300),
          " | body: ", StringSubstr(body, 0, 300));
    return TF_DELIVERY_REJECTED;
  }
  return TF_DELIVERY_RETRY; // 401/403/429/5xx: nothing wrong with the report itself
}

void RemovePending(const int index) {
  for (int i = index + 1; i < g_pendingCount; i++) {
    g_pendingPath[i - 1] = g_pendingPath[i];
    g_pendingBody[i - 1] = g_pendingBody[i];
  }
  g_pendingCount--;
}

void Enqueue(const string path, const string body) {
  // Only the newest equity report is worth keeping: a replay is recorded at the
  // time it finally lands, so older ones add traffic and no history.
  if (path == "/api/ea/account") {
    for (int i = 0; i < g_pendingCount; i++)
      if (g_pendingPath[i] == path) { g_pendingBody[i] = body; return; }
  }
  if (g_pendingCount >= PENDING_MAX) {
    // Full: an equity report gives way to a trade or violation, never the reverse.
    int victim = -1;
    for (int i = 0; i < g_pendingCount && victim < 0; i++)
      if (g_pendingPath[i] == "/api/ea/account") victim = i;
    if (victim < 0 || path == "/api/ea/account") {
      Print("TradeForce: retry queue full - dropping POST ", path);
      return;
    }
    RemovePending(victim);
  }
  g_pendingPath[g_pendingCount] = path;
  g_pendingBody[g_pendingCount] = body;
  g_pendingCount++;
}

void PostJsonQueued(const string path, const string body) {
  if (Deliver(path, body) != TF_DELIVERY_RETRY) return;
  Enqueue(path, body);
  Print("TradeForce: queued ", path, " for retry (queue ", g_pendingCount, ")");
}

// force = the lockdown's last drain before TerminalClose, which ignores backoff.
void FlushPending(const bool force = false) {
  if (g_pendingCount == 0) return;
  if (!force && TimeGMT() < g_flushNextAt) return;
  int flushed = 0;
  while (g_pendingCount > 0 && flushed < 4) {   // a few per tick, keep the timer snappy
    if (Deliver(g_pendingPath[0], g_pendingBody[0]) == TF_DELIVERY_RETRY) {
      g_flushBackoff = (g_flushBackoff == 0) ? 5 : (int)MathMin(g_flushBackoff * 2, 300);
      g_flushNextAt  = TimeGMT() + g_flushBackoff;
      return;
    }
    RemovePending(0);   // delivered, or refused for good
    flushed++;
  }
  g_flushBackoff = 0;
  g_flushNextAt  = 0;
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

// Broker-server clock minus GMT, e.g. +7200 on a GMT+2 server.
//
// Cached rather than computed on demand, because TimeCurrent() is the time of
// the last TICK, not the wall clock: it freezes whenever the market is closed.
// A live (TimeCurrent() - TimeGMT()) would then read as the length of the
// outage - about -48h over a weekend - instead of the broker's timezone, which
// would move the day boundary below and mis-stamp every reported event. The
// real value only changes on a DST switch, so the last tick-backed reading
// stays correct across any outage.
int g_serverGmtOffset = 0;

void RefreshServerOffset() {
  static datetime lastTick = 0;
  const datetime cur = TimeCurrent();
  if (cur == lastTick) return; // no new tick - keep the last trustworthy offset
  lastTick = cur;
  const int offset = (int)(cur - TimeGMT());
  if (MathAbs(offset) <= 14 * 3600) // no real broker sits outside +/-14h of GMT
    g_serverGmtOffset = offset;
}

// Server-clock datetime of the trader's local midnight (deal times are server time).
datetime DayStartServerTime() {
  datetime gmtNow = TimeGMT();
  int offsetSec = TimezoneOffsetMinutes(gmtNow) * 60;
  datetime localNow = gmtNow + offsetSec;
  datetime localMidnightAsGmt = (localNow / 86400) * 86400 - offsetSec;
  return localMidnightAsGmt + g_serverGmtOffset;
}

string IsoFromGmt(const datetime gmt) {
  MqlDateTime dt;
  TimeToStruct(gmt, dt);
  return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

// For timestamps that come out of deal history, which are on the server clock.
string IsoFromServerTime(const datetime serverTime) {
  return IsoFromGmt(serverTime - g_serverGmtOffset);
}

// "Now" for stamping an event we are raising ourselves. Straight off the wall
// clock, so it can't inherit TimeCurrent()'s freeze while the market is shut.
string IsoNow() { return IsoFromGmt(TimeGMT()); }

// Server-clock "now", projected from the wall clock rather than read from the
// last tick - safe to use as the upper bound of a history query at any hour.
datetime ServerNow() { return TimeGMT() + g_serverGmtOffset; }

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
  if (!HistorySelect(from, ServerNow() + 60)) return 0;
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
  if (!HistorySelect(from, ServerNow() + 60)) return 0;
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
  datetime now = TimeGMT();
  // Event-driven: InvalidateDayCaches() runs on every deal, so the count is
  // fresh the moment a trade lands. 60s only catches history that arrives
  // without a trade event (a reconnect). It was 5s: 24 history reloads a
  // minute per terminal for numbers that had not changed.
  if (g_tradesTodayCacheAt == 0 || now - g_tradesTodayCacheAt >= 60) {
    g_tradesTodayCache   = TradesOpenedToday();
    g_tradesTodayCacheAt = now;
  }
  return g_tradesTodayCache;
}

double CachedRealizedToday() {
  datetime now = TimeGMT();
  if (g_realizedTodayCacheAt == 0 || now - g_realizedTodayCacheAt >= 60) { // see CachedTradesToday
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
  v["occurredAt"] = IsoNow();
  PostJsonQueued("/api/ea/violations", v.Serialize());
  Print("TradeForce: VIOLATION ", type);
}

// The equity + ops-telemetry body, shared by the periodic sync and the
// one-shot final report taken just before a lockdown closes the terminal.
void BuildReport(CJAVal &a) {
  a["equity"]  = AccountInfoDouble(ACCOUNT_EQUITY);
  a["balance"] = AccountInfoDouble(ACCOUNT_BALANCE);
  // Ops fields: what the server cannot observe for itself.
  a["failedFetches"]   = g_failedFetches;
  if (!BridgeMode) a["lastHttpStatus"] = g_lastHttpStatus; // no HTTP to report on
  a["queuedPosts"]     = g_pendingCount;
  a["fromCache"]       = g_cfgFromCache;
  a["backoffSeconds"]  = g_syncBackoff;
  a["eaVersion"]       = EA_VERSION;
  a["tradeBlock"]      = g_tradeBlock; // "" clears the dashboard warning
}

// A report on its own, with no config round trip: used for the final snapshot
// on lockdown. The periodic path goes through SyncWithServer() instead.
void ReportAccount() {
  CJAVal a;
  BuildReport(a);
  const string body = a.Serialize();

  const ENUM_TF_DELIVERY r = Deliver("/api/ea/account", body);
  if (r == TF_DELIVERED) {
    g_failedFetches = 0;   // only reset once the count has actually landed
    return;
  }
  // Fall back to the retry queue, but keep the counter: it must survive until
  // a report gets through, or the storm erases its own evidence.
  if (r == TF_DELIVERY_RETRY) Enqueue("/api/ea/account", body);
}

// Lifecycle events (EA removed from the chart). Direct synchronous POST, not
// queued: the caller is OnDeinit, which never gets another timer tick to
// flush a queue. Best-effort by design - if the terminal is dying, it dies.
// (In bridge mode it is a local file and survives the terminal closing.)
void ReportEaEvent(const string eventType) {
  CJAVal e;
  e["type"]       = eventType;
  e["occurredAt"] = IsoNow();
  const ENUM_TF_DELIVERY r = Deliver("/api/ea/events", e.Serialize());
  Print("TradeForce: EA event ", eventType, (r == TF_DELIVERED ? " delivered" : " not delivered"));
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

// Copy a config object into g_cfg and persist it. The object has the same
// shape whether it arrived nested under "config" from /api/ea/sync or at the
// top level from the older /api/ea/config, because the server builds both with
// one shapeConfig().
// c is a CJAVal* because JAson's operator[] returns a pointer; MQL5 applies
// operator[] straight through it, which is what json["sessions"]["london"]
// has always relied on.
void ApplyConfig(CJAVal *c) {
  g_cfg.configVersion       = c["configVersion"].ToInt();
  g_cfg.isActive            = c["isActive"].ToBool();
  g_cfg.dailyLossLimit      = c["dailyLossLimit"].ToDbl();
  g_cfg.maxTradesPerDay     = (int)c["maxTradesPerDay"].ToInt();
  g_cfg.maxOpenPositions    = (int)c["maxOpenPositions"].ToInt();
  g_cfg.riskPerTradePercent = c["riskPerTradePercent"].ToDbl();
  g_cfg.sesLondon           = c["sessions"]["london"].ToBool();
  g_cfg.sesNewYork          = c["sessions"]["newYork"].ToBool();
  g_cfg.sesAsian            = c["sessions"]["asian"].ToBool();
  g_cfg.sesOverlap          = c["sessions"]["londonNyOverlap"].ToBool();
  g_cfg.customStart         = c["sessions"]["customStart"].ToStr();
  g_cfg.customEnd           = c["sessions"]["customEnd"].ToStr();
  g_cfg.timezone            = c["sessions"]["timezone"].ToStr();
  g_cfgFromCache = false;
  SaveConfigToDisk();
  Print("TradeForce: config loaded (v", g_cfg.configVersion, ", active=", g_cfg.isActive, ")");
}

// The pool agent's rules file has the same shape as a /api/ea/sync response,
// plus bridgeAt: when the agent last confirmed these rules against the database.
// Returns true when that confirmation is recent.
bool ReadBridgeInbox() {
  g_inboxMtime = FileGetInteger(TF_BRIDGE_INBOX, FILE_MODIFY_DATE);
  string text;
  if (!ReadSmallFile(TF_BRIDGE_INBOX, text)) return false;
  CJAVal j;
  if (!j.Deserialize(text) || j["v"].ToInt() != 1) {
    Print("TradeForce: bridge rules file unreadable - keeping current rules.");
    return false;
  }
  const bool fresh = (long)TimeGMT() - j["bridgeAt"].ToInt() <= TF_BRIDGE_STALE_SECONDS;
  const bool configured = j["configured"].ToBool();
  const long remoteVersion = j["configVersion"].ToInt();

  if (fresh && !configured) {
    // Authoritative, exactly like the server answering "not configured".
    if (g_cfg.configured) Print("TradeForce: no charter configured yet - set rules on the dashboard.");
    g_cfg.configured = false;
    g_cfg.isActive   = false;
  } else if (configured && (!g_cfg.configured || (fresh && remoteVersion != g_cfg.configVersion))) {
    // A stale file is good enough to START from - it is the newest copy there
    // is while the agent is down - but it never replaces rules already running.
    if (j["config"]["configVersion"].ToInt() == remoteVersion) {
      g_cfg.configured = true;
      ApplyConfig(j["config"]);
    } else {
      Print("TradeForce: bridge announced v", remoteVersion, " but sent no config - keeping current rules.");
    }
  }
  if (g_cfg.configured) g_cfgFromCache = !fresh;
  return fresh;
}

void NoteBridgeFreshness(const bool fresh) {
  if (!fresh) {
    if (g_cfg.configured && !g_connLossAlerted) {
      g_connLossAlerted = true;
      Notify("TradeForce: dashboard unreachable - enforcing last-known rules until it reconnects.");
    }
  } else if (g_connLossAlerted) {
    g_connLossAlerted = false;
    Print("TradeForce: dashboard connection restored.");
  }
}

// Every timer second, but only a stat() unless the agent rewrote the file: a
// dashboard rule change lands here within a few seconds.
void PollBridgeInbox() {
  const long mtime = FileGetInteger(TF_BRIDGE_INBOX, FILE_MODIFY_DATE);
  if (mtime <= 0 || mtime == g_inboxMtime) return;
  NoteBridgeFreshness(ReadBridgeInbox());
}

// Bridge-mode sync: the equity report becomes a file, and the rules file is
// re-read regardless of whether it changed, which is what notices an agent that
// has stopped heartbeating.
bool BridgeSync() {
  CJAVal a;
  BuildReport(a);
  a["knownConfigVersion"] = g_cfg.configured ? g_cfg.configVersion : -1;
  const bool wrote = BridgeWrite("sync", a.Serialize());
  const bool fresh = ReadBridgeInbox();
  g_lastFullSync = TimeGMT(); // fixed cadence: a local file has nothing to back off from
  if (wrote) g_failedFetches = 0;
  else g_failedFetches++;
  NoteBridgeFreshness(fresh);
  return wrote && fresh;
}

// One request replaces the old ping + config + account trio.
//
// Those three were 360 requests an hour per terminal, and two of them read the
// same rules row. The equity report was already going out every 60s, so it now
// carries the version we hold and the server replies with the full config only
// when ours is stale. 60 requests an hour, same enforcement: the daily-loss
// check runs locally on every tick and never waited on the network.
bool SyncWithServer() {
  if (BridgeMode) return BridgeSync();
  CJAVal a;
  BuildReport(a);
  a["knownConfigVersion"] = g_cfg.configured ? g_cfg.configVersion : -1;

  int status;
  string body;
  if (!Http("POST", "/api/ea/sync", a.Serialize(), status, body) || status != 200) {
    g_failedFetches++;
    Print("TradeForce: sync failed (status ", status, ")");
    if (g_cfg.configured && !g_connLossAlerted) {
      g_connLossAlerted = true;
      Notify("TradeForce: dashboard unreachable - enforcing last-known rules until it reconnects.");
    }
    // The equity reading still matters even when the config half failed. Queue
    // it against the report-only endpoint so a replay days later cannot drag a
    // stale config back over live rules. Enqueue keeps only the newest one.
    CJAVal r;
    BuildReport(r);
    Enqueue("/api/ea/account", r.Serialize());
    return false;
  }

  CJAVal json;
  if (!json.Deserialize(body)) {
    Print("TradeForce: sync parse failed: ", body);
    return false;
  }

  g_failedFetches = 0;   // the report landed, so the count has been delivered
  g_lastFullSync  = TimeGMT();
  g_syncBackoff   = 0;   // healthy again
  g_flushNextAt   = 0;   // and so is the server: drain the retry queue now
  g_flushBackoff  = 0;
  if (g_connLossAlerted) {
    g_connLossAlerted = false;
    Print("TradeForce: dashboard connection restored.");
  }

  if (!json["configured"].ToBool()) {
    g_cfg.configured = false;
    g_cfg.isActive   = false;
    Print("TradeForce: no charter configured yet - set rules on the dashboard.");
    return true;
  }

  const long remoteVersion = json["configVersion"].ToInt();
  if (!g_cfg.configured || remoteVersion != g_cfg.configVersion) {
    // The server sends "config" exactly when our version is stale. Confirm it
    // really arrived before overwriting live rules: applying an absent object
    // would zero every limit and silently disable enforcement.
    if (json["config"]["configVersion"].ToInt() == remoteVersion) {
      g_cfg.configured = true;
      ApplyConfig(json["config"]);
    } else {
      Print("TradeForce: sync announced v", remoteVersion,
            " but sent no config - keeping current rules.");
    }
  }
  // Rules loaded from the disk cache at startup are confirmed current now.
  if (g_cfg.configured && g_cfg.configVersion == remoteVersion) g_cfgFromCache = false;
  return true;
}

//+------------------------------------------------------------------+
//| Trade permission - can this EA close anything at all?             |
//+------------------------------------------------------------------+
// Each code has a plain-language fix on the dashboard (src/lib/ea-trade-block.ts);
// keep the two lists in step. Order matters: account flags read as "not allowed"
// while the terminal is disconnected, so connection is checked first.
string TradeBlockNow() {
  if (!TerminalInfoInteger(TERMINAL_CONNECTED))    return "NO_CONNECTION";
  if (!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))  return "ACCOUNT_READ_ONLY";
  if (!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))   return "BROKER_BLOCKS_EA";
  if (!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return "ALGO_TRADING_OFF";
  if (!MQLInfoInteger(MQL_TRADE_ALLOWED))          return "EA_TRADING_OFF";
  return "";
}

string TradeBlockText(const string code) {
  if (code == "NO_CONNECTION")     return "MetaTrader has no connection to your broker";
  if (code == "ACCOUNT_READ_ONLY") return "This login cannot trade - it is the investor (read-only) password, or your broker has disabled trading on the account";
  if (code == "BROKER_BLOCKS_EA")  return "Your broker does not allow Expert Advisors to trade on this account, so TradeForce cannot close trades";
  if (code == "ALGO_TRADING_OFF")  return "Algo Trading is switched off - click the Algo Trading button in the MetaTrader toolbar so it turns green";
  if (code == "EA_TRADING_OFF")    return "Allow Algo Trading is unticked for TradeForce - open the EA's settings (Common tab) and tick it";
  return code;
}

// Called every timer second. A change has to hold for 10s before it is
// announced, so a brief reconnect does not pop an alert or flap the dashboard.
void CheckTradePermission() {
  const string now = TradeBlockNow();
  if (now == g_tradeBlock) { g_blockCandidate = now; return; }
  if (now != g_blockCandidate) { g_blockCandidate = now; g_blockCandidateAt = TimeGMT(); return; }
  if (TimeGMT() - g_blockCandidateAt < 10) return;
  const string was = g_tradeBlock;
  g_tradeBlock = now;
  if (now == "") Print("TradeForce: trading permission restored (was ", was, ").");
  else if (now == "NO_CONNECTION") Print("TradeForce: ", TradeBlockText(now), ".");
  else Notify("TradeForce: " + TradeBlockText(now) + ".");
  ReportAccount(); // the dashboard hears now, not at the next minute's sync
}

//+------------------------------------------------------------------+
//| Enforcement                                                       |
//+------------------------------------------------------------------+
// The broker's own words for a refused request, e.g. "Autotrading disabled by
// server (10026)". When the request never left the terminal there is no
// retcode, only the MQL error.
string CloseErrorText() {
  const uint rc = g_trade.ResultRetcode();
  if (rc != 0) return StringFormat("%s (%u)", g_trade.ResultRetcodeDescription(), rc);
  return StringFormat("error %d", GetLastError());
}

bool CloseAccepted() {
  const uint rc = g_trade.ResultRetcode();
  return rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED;
}

// true = the position is gone (closed now, or already closed by SL/TP).
// false = the broker refused; g_closeError says why.
bool ClosePositionById(const long posId) {
  g_closeError = "";
  for (int i = 0; i < PositionsTotal(); i++) {
    ulong ticket = PositionGetTicket(i);
    if (ticket != 0 && PositionSelectByTicket(ticket) &&
        PositionGetInteger(POSITION_IDENTIFIER) == posId) {
      EnsureSymbol(PositionGetString(POSITION_SYMBOL));
      if (g_trade.PositionClose(ticket) && CloseAccepted()) return true;
      g_closeError = CloseErrorText();
      return false;
    }
  }
  return true;
}

// Refused closes are retried every 10s until the position is gone: the cause
// is often something the trader fixes in a click (AutoTrading off), and the
// moment they do, the breach is closed without them having to remember it.
#define CLOSE_RETRY_MAX 32
long     g_retryPos[CLOSE_RETRY_MAX];
datetime g_retryAt[CLOSE_RETRY_MAX];
int      g_retryCount = 0;

void QueueCloseRetry(const long posId) {
  for (int i = 0; i < g_retryCount; i++)
    if (g_retryPos[i] == posId) return;
  if (g_retryCount >= CLOSE_RETRY_MAX) return; // the daily-loss sweep still covers these
  g_retryPos[g_retryCount] = posId;
  g_retryAt[g_retryCount]  = TimeGMT() + 10;
  g_retryCount++;
}

void ProcessCloseRetries() {
  const datetime now = TimeGMT();
  for (int i = g_retryCount - 1; i >= 0; i--) {
    if (now < g_retryAt[i]) continue;
    if (!ClosePositionById(g_retryPos[i])) { g_retryAt[i] = now + 10; continue; }
    Print("TradeForce: position ", g_retryPos[i], " closed on retry.");
    for (int j = i + 1; j < g_retryCount; j++) {
      g_retryPos[j - 1] = g_retryPos[j];
      g_retryAt[j - 1]  = g_retryAt[j];
    }
    g_retryCount--;
  }
}

// Close a position that breaks the charter and record the outcome on the
// violation: a breach we could not close is a different thing from one we did,
// and the dashboard must not show the first as enforced.
void CloseAndNote(const long posId, CJAVal &d) {
  if (ClosePositionById(posId)) { d["closed"] = true; return; }
  d["closed"]     = false;
  d["closeError"] = g_closeError;
  if (g_tradeBlock != "") d["tradeBlock"] = g_tradeBlock;
  QueueCloseRetry(posId);
  Notify("TradeForce: could not close position #" + IntegerToString(posId) + " - " + g_closeError +
         (g_tradeBlock != "" ? ". " + TradeBlockText(g_tradeBlock) : "") +
         ". Close it yourself; TradeForce keeps retrying every 10 seconds.");
}

// Daily-loss breach: every position is closed at once instead of one broker
// round trip after another. OrderSendAsync is no faster per order - the gain is
// not waiting for position 1's reply before sending position 2's close. Then
// confirm, and close anything still open the ordinary way.
void CloseAllPositions() {
  if (PositionsTotal() == 0) return;
  g_closeError = "";
  int sent = 0;
  g_trade.SetAsyncMode(true);
  for (int i = PositionsTotal() - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    EnsureSymbol(PositionGetString(POSITION_SYMBOL));
    if (g_trade.PositionClose(ticket)) sent++;
  }
  g_trade.SetAsyncMode(false);
  // Nothing was accepted for sending (AutoTrading off, EA trading disabled):
  // waiting for fills that cannot come would only stall the timer.
  if (sent > 0) {
    ulong until = GetTickCount64() + 5000;
    while (PositionsTotal() > 0 && GetTickCount64() < until) Sleep(25);
  }
  for (int i = PositionsTotal() - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket != 0 && !(g_trade.PositionClose(ticket) && CloseAccepted()))
      g_closeError = CloseErrorText();
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
bool BlockPendingOrder(const ulong ticket, const string symbol, const ENUM_TF_BLOCK cause) {
  double volume = 0;
  if (OrderSelect(ticket)) volume = OrderGetDouble(ORDER_VOLUME_CURRENT);
  if (!g_trade.OrderDelete(ticket)) {
    // Mid-fill or already gone - the resulting deal lands in EnforceOnOpen.
    Print("TradeForce: could not delete blocked pending #", ticket);
    return false;
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
    d["timeUtc"] = IsoNow();
    double ws, we;
    if (SingleEnabledWindow(ws, we)) {
      d["windowStart"] = FormatUtcHour(ws);
      d["windowEnd"]   = FormatUtcHour(we);
    }
  }
  ReportViolation(type, "PO-" + IntegerToString(ticket), d);
  return true;
}

// Pending orders placed while blocked, waiting to go live on the broker's
// server. TRADE_TRANSACTION_ORDER_ADD fires as the terminal SENDS the order,
// before the broker has accepted it, and a cancel sent in that gap is refused
// as "invalid request". Before 1.26 that was the end of it: on the bridge proof
// (remote demo server) the order was accepted 2ms after the failed cancel and
// stayed live. So a veto now waits for ORDER_STATE_PLACED, re-checked on every
// order update and every timer second, for up to 30 seconds.
#define VETO_MAX 32
ulong    g_vetoTicket[VETO_MAX];
datetime g_vetoSince[VETO_MAX];
int      g_vetoCount = 0;

void RemoveVeto(const int index) {
  for (int i = index + 1; i < g_vetoCount; i++) {
    g_vetoTicket[i - 1] = g_vetoTicket[i];
    g_vetoSince[i - 1]  = g_vetoSince[i];
  }
  g_vetoCount--;
}

void QueueVeto(const ulong ticket, const datetime since) {
  for (int i = 0; i < g_vetoCount; i++)
    if (g_vetoTicket[i] == ticket) return;
  if (g_vetoCount >= VETO_MAX) RemoveVeto(0);
  g_vetoTicket[g_vetoCount] = ticket;
  g_vetoSince[g_vetoCount]  = since;
  g_vetoCount++;
}

void ProcessVetoes() {
  const datetime now = TimeGMT();
  for (int i = g_vetoCount - 1; i >= 0; i--) {
    const ulong ticket = g_vetoTicket[i];
    const datetime since = g_vetoSince[i];
    const bool expired = now - since > 30;
    // Not in the live order list: not accepted yet, or already filled
    // (EnforceOnOpen's job), rejected or cancelled.
    if (!OrderSelect(ticket)) { if (expired) RemoveVeto(i); continue; }
    const ENUM_ORDER_STATE state = (ENUM_ORDER_STATE)OrderGetInteger(ORDER_STATE);
    if (state != ORDER_STATE_PLACED && state != ORDER_STATE_PARTIAL) { if (expired) RemoveVeto(i); continue; }
    const string symbol = OrderGetString(ORDER_SYMBOL);
    RemoveVeto(i);
    const ENUM_TF_BLOCK blocked = ComputeBlocked();
    if (blocked == TF_BLOCK_NONE) continue; // the block ended while it was in flight
    if (!BlockPendingOrder(ticket, symbol, blocked) && !expired) QueueVeto(ticket, since);
  }
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
  // GMT, not TimeCurrent(): a grace countdown is real seconds for the trader,
  // and must keep running even if the market goes quiet mid-countdown.
  g_lossLockDeadline = TimeGMT() + MathMax(5, graceSeconds);
  g_notFlatWarned = false;
  Notify(StringFormat("TradeForce: daily loss limit hit - MT5 closes in %d seconds. Locked until your local midnight.",
                     MathMax(5, graceSeconds)));
}

// Best-effort final drain before TerminalClose: the retry queue lives in
// memory and dies with the terminal. Bounded to a few seconds.
void FlushPendingHard(const int passes) {
  for (int p = 0; p < passes && g_pendingCount > 0; p++) {
    FlushPending(true);
    if (g_pendingCount > 0) Sleep(500);
  }
}

// Returns true when MT5 is being closed. Held while positions are still open:
// the header above assumes a flat account, and when the broker refuses the
// closes, closing MT5 would leave the losing trades running with nothing
// watching them and the trader locked out of the terminal that can close them.
bool ExecuteLossLockdown() {
  if (PositionsTotal() > 0) {
    if (!g_notFlatWarned) {
      g_notFlatWarned = true;
      Notify("TradeForce: " + IntegerToString(PositionsTotal()) + " trade(s) are still open - " +
             (g_closeError != "" ? g_closeError : "the close has not gone through") +
             ". MT5 stays open so you can close them; it closes once the account is flat.");
      ReportAccount();
    }
    return false;
  }
  DeleteAllPendingOrders(); // GTC pendings would fill server-side while MT5 is closed
  ReportAccount();          // final equity snapshot for the dashboard
  FlushPendingHard(3);
  Notify("TradeForce: closing MT5 - daily loss limit. Trading resumes after your local midnight.");
  Print("TradeForce: TerminalClose() on daily-loss lockdown.");
  if (!TerminalClose(0))
    Print("TradeForce: TerminalClose failed - retrying next tick.");
  // Deadline stays armed on purpose: a failed close retries next second.
  return true;
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
  // Runs every second while breached. Refused closes retry every 10s, not
  // every tick: each attempt can wait up to 5s for fills that never come.
  if (PositionsTotal() > 0 && TimeGMT() >= g_closeAllNextAt) {
    CloseAllPositions();
    if (PositionsTotal() > 0) g_closeAllNextAt = TimeGMT() + 10;
  }
  if (firstBreachToday) {
    g_lossBreachDayId = today;
    CJAVal d;
    d["lossToday"] = loss;
    d["limit"]     = g_cfg.dailyLossLimit;
    d["ruleValue"] = loss;
    d["ruleLimit"] = g_cfg.dailyLossLimit;
    d["closed"]    = (PositionsTotal() == 0);
    if (PositionsTotal() > 0) {
      d["stillOpen"]  = PositionsTotal();
      d["closeError"] = g_closeError;
      if (g_tradeBlock != "") d["tradeBlock"] = g_tradeBlock;
      Notify("TradeForce: daily loss limit hit but " + IntegerToString(PositionsTotal()) +
             " trade(s) could not be closed - " + g_closeError +
             (g_tradeBlock != "" ? ". " + TradeBlockText(g_tradeBlock) : "") + ". Close them yourself now.");
    }
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
  EnsureSymbol(symbol);
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
    CloseAndNote(posId, d);
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
  EnsureSymbol(dealSymbol);

  // 1. Locked day: after a daily-loss breach, nothing new stays open today.
  if (g_lossBreachDayId == LocalDayId(TimeGMT())) {
    CJAVal d;
    CloseAndNote(posId, d);
    d["reason"] = "account locked for the day after daily loss breach";
    d["symbol"] = dealSymbol;
    d["volume"] = dealVolume;
    ReportViolation("DAILY_LOSS_BREACH", "LOCK-" + IntegerToString(posId), d);
    return;
  }

  // 2. Session gate.
  if (!SessionAllowedNow()) {
    CJAVal d;
    CloseAndNote(posId, d);
    d["timeUtc"] = IsoNow();
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
    CJAVal d;
    CloseAndNote(posId, d);
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
      CJAVal d;
      CloseAndNote(posId, d);
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

// Every ObjectSet* in ShowOverlay repaints the chart, and the 1s timer would
// re-render an unchanged banner 60x a minute while a block is active. Both
// overlay and comment are pushed only when they actually change.
string g_lastOverlayKey = "";

void RemoveOverlay() {
  g_lastOverlayKey = ""; // next ShowOverlay must repaint from scratch
  if (ObjectFind(0, TF_OBJ_BANNER) < 0 && ObjectFind(0, TF_OBJ_WATERMARK) < 0) return;
  ObjectDelete(0, TF_OBJ_BANNER);
  ObjectDelete(0, TF_OBJ_BANNER_TXT);
  ObjectDelete(0, TF_OBJ_WATERMARK);
  ChartRedraw(0);
}

void ShowOverlay(const string bannerText, const string watermarkText, const color accent) {
  long w = ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
  long h = ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);

  // Chart size is in the key: a resized window has to re-lay-out the banner.
  string key = StringFormat("%s|%s|%d|%I64d|%I64d", bannerText, watermarkText, (int)accent, w, h);
  if (key == g_lastOverlayKey) return;
  g_lastOverlayKey = key;

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

  if (now != TF_BLOCK_NONE) Notify("TradeForce: " + BlockBannerText(now));
  else Print("TradeForce: trading unblocked.");
}

// Blocked -> banner + watermark. Unblocked near session end -> countdown.
void UpdateOverlay() {
  if (CloudMode) return; // nobody looks at a hosted chart
  if (g_lossLockDeadline > 0) {
    int left = (int)(g_lossLockDeadline - TimeGMT());
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
// Comment() repaints the chart on every call, and the 1s timer would otherwise
// repaint 60x a minute to write the same string. Only push real changes.
string g_lastComment = "\x01"; // sentinel: never equal to a real line

void SetComment(const string line) {
  if (line == g_lastComment) return;
  g_lastComment = line;
  Comment(line);
}

void UpdateComment() {
  if (CloudMode) return;
  if (!g_cfg.configured) {
    SetComment("TradeForce: no charter configured - set rules on the dashboard.");
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
  if (g_tradeBlock != "")
    line += " | CANNOT CLOSE TRADES: " + TradeBlockText(g_tradeBlock);
  if (g_retryCount > 0)
    line += StringFormat(" | %d close(s) refused, retrying", g_retryCount);
  SetComment(line);
}

//+------------------------------------------------------------------+
//| MT5 entry points                                                  |
//+------------------------------------------------------------------+
// A hosted terminal needs one chart - the EA's - and the chart symbol in Market
// Watch. [StartUp] opens a fresh chart on every launch and MT5 saves the old ones,
// so a container restarted ten times was processing prices for eleven charts.
// Symbols with open positions or orders cannot be hidden, which is what we want;
// anything traded later is added back by EnsureSymbol().
void CloudTrim() {
  long me = ChartID(), ids[];
  for (long id = ChartFirst(); id >= 0; id = ChartNext(id))
    if (id != me) { int n = ArraySize(ids); ArrayResize(ids, n + 1); ids[n] = id; }
  for (int i = 0; i < ArraySize(ids); i++) ChartClose(ids[i]);
  int hidden = 0;
  for (int i = SymbolsTotal(true) - 1; i >= 0; i--) {
    string sym = SymbolName(i, true);
    if (sym != _Symbol && SymbolSelect(sym, false)) hidden++;
  }
  if (ArraySize(ids) > 0 || hidden > 0)
    PrintFormat("TradeForce: cloud mode - closed %d extra chart(s), hid %d symbol(s).", ArraySize(ids), hidden);
}

int OnInit() {
  if (StringLen(ApiKey) == 0 || StringFind(ApiKey, "tf_live_") != 0) {
    Notify("TradeForce: set the ApiKey input to a key generated on the Rule Settings page.");
    return INIT_PARAMETERS_INCORRECT;
  }
  RefreshServerOffset(); // seed before anything stamps a time or reads history
  // Known before the first report, so the dashboard hears about a blocked
  // account at attach time rather than after the 10s debounce.
  g_tradeBlock = TradeBlockNow();
  g_blockCandidate = g_tradeBlock;
  if (g_tradeBlock != "" && g_tradeBlock != "NO_CONNECTION")
    Notify("TradeForce: " + TradeBlockText(g_tradeBlock) + ".");
  g_cfg.configured = false;
  g_cfg.configVersion = -1;
  if (BridgeMode) {
    FolderCreate("tf_bridge");
    FolderCreate("tf_bridge\\out");
    FolderCreate("tf_bridge\\in");
    Print("TradeForce: bridge mode - reports and rules go through the pool agent, no web requests.");
  }
  // A failed bridge sync may still have started us on the agent's last rules
  // file, which is newer than the disk cache; only fall back when it didn't.
  if (!SyncWithServer() && !g_cfg.configured && LoadConfigFromDisk())
    Print("TradeForce: dashboard unreachable - enforcing last-known rules from the disk cache (cfg v",
          g_cfg.configVersion, ").");
  g_cacheDayId = LocalDayId(TimeGMT());
  if (CloudMode) CloudTrim();
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
  RefreshServerOffset();

  // Local-day rollover: yesterday's counters (and loss lock) expire here.
  int today = LocalDayId(TimeGMT());
  if (today != g_cacheDayId) {
    g_cacheDayId = today;
    InvalidateDayCaches();
  }

  // New rules first, so everything below this tick already enforces them.
  if (BridgeMode) PollBridgeInbox();

  // Wall clock, never TimeCurrent(): the latter is the last TICK time and
  // stops advancing when the market closes, which silently suspended every
  // network call below from Friday's close until Monday's open.
  const datetime nowGmt = TimeGMT();
  // One call does the config check and the equity report. Retry a failed sync
  // with exponential backoff (5s -> 5min), not every tick.
  const int syncDue = (g_syncBackoff > 0) ? g_syncBackoff : SyncSeconds;
  if (nowGmt - g_lastFullSync >= syncDue) {
    if (!SyncWithServer() && !BridgeMode) {
      g_syncBackoff  = (g_syncBackoff == 0) ? 5 : (int)MathMin(g_syncBackoff * 2, 300);
      g_lastFullSync = nowGmt; // SyncWithServer only stamps this on success
    }
  }

  CheckTradePermission();
  CheckDailyLoss();
  if (g_retryCount > 0) ProcessCloseRetries();
  if (g_vetoCount > 0) ProcessVetoes();
  FlushPending();

  if (g_lossLockDeadline > 0) {
    if (!g_cfg.configured || !g_cfg.isActive) {
      g_lossLockDeadline = 0; // charter paused on the dashboard - consent withdrawn
      Print("TradeForce: loss lockdown cancelled - charter paused.");
    } else if (TimeGMT() >= g_lossLockDeadline && ExecuteLossLockdown()) {
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
  if (trans.type == TRADE_TRANSACTION_ORDER_ADD || trans.type == TRADE_TRANSACTION_ORDER_UPDATE) {
    if (trans.type == TRADE_TRANSACTION_ORDER_ADD && IsPendingOrderType(trans.order_type) &&
        ComputeBlocked() != TF_BLOCK_NONE)
      QueueVeto(trans.order, TimeGMT());
    if (g_vetoCount > 0) ProcessVetoes();
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
