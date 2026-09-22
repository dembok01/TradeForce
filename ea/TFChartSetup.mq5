// One-off, run in a throwaway terminal: creates the custom symbol hosted
// terminals open their EA chart on. A custom symbol lives in the terminal, not
// at the broker, so the chart exists whatever the broker names its symbols -
// "EURUSD" does not exist on Alpari's MT5 demo server, nor on Exness Standard
// accounts (EURUSDm), and an EA whose chart symbol never syncs never starts.
void OnStart() {
  const string s = "TFCHART";
  bool custom = false;
  if (!SymbolExist(s, custom) && !CustomSymbolCreate(s, "TradeForce")) {
    PrintFormat("TFChartSetup: create failed, error %d", GetLastError());
    return;
  }
  CustomSymbolSetInteger(s, SYMBOL_DIGITS, 5);
  CustomSymbolSetString(s, SYMBOL_DESCRIPTION, "TradeForce - broker-independent EA chart");
  MqlRates r[];
  ArrayResize(r, 600);
  const datetime t0 = (datetime)((long)TimeGMT() / 60 * 60) - 600 * 60;
  for (int i = 0; i < 600; i++) {
    r[i].time = t0 + i * 60;
    r[i].open = 1.0; r[i].high = 1.0; r[i].low = 1.0; r[i].close = 1.0;
    r[i].tick_volume = 1; r[i].spread = 0; r[i].real_volume = 0;
  }
  const int n = CustomRatesUpdate(s, r);
  SymbolSelect(s, true);
  PrintFormat("TFChartSetup: %s ready, %d bars, custom=%d", s, n, (int)SymbolInfoInteger(s, SYMBOL_CUSTOM));
  // The definition is only written to disk when MT5 exits normally; a killed
  // container keeps the history file but loses the symbol.
  Sleep(3000);
  TerminalClose(0);
}
