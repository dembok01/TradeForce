// v1.29 proof only, DEMO accounts: open a buy and a sell of the same size on a
// real broker symbol (the EA's own chart is the custom TFCHART symbol, which
// cannot be traded). Hedged, so the floating result is minus the spread.
#include <Trade/Trade.mqh>
input string TradeSymbol = "EURUSD";

void OnStart() {
  Print("V129Trader: waiting for go file");
  while (!IsStopped() && !FileIsExist("v129_go.txt")) Sleep(1000);
  if (IsStopped()) return;
  if (AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
    Print("V129Trader: refusing - not a demo account");
    return;
  }
  SymbolSelect(TradeSymbol, true);
  CTrade t;
  t.SetTypeFillingBySymbol(TradeSymbol);
  bool b = t.Buy(0.01, TradeSymbol);
  PrintFormat("V129Trader: buy %s retcode=%u", b ? "sent" : "failed", t.ResultRetcode());
  bool s = t.Sell(0.01, TradeSymbol);
  PrintFormat("V129Trader: sell %s retcode=%u", s ? "sent" : "failed", t.ResultRetcode());
  Sleep(3000);
  PrintFormat("V129Trader: done, positions=%d", PositionsTotal());
}
