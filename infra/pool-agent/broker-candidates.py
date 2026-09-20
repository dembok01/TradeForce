import socket, ipaddress, concurrent.futures as cf
BROKERS = {
 "IC Markets":"icmarkets.com","Pepperstone":"pepperstone.com","XM":"xm.com","XM Global":"xmglobal.com",
 "Exness":"exness.com","FTMO":"ftmo.com","FundedNext":"fundednext.com","Vantage":"vantagemarkets.com",
 "Eightcap":"eightcap.com","Tickmill":"tickmill.com","FP Markets":"fpmarkets.com","Admirals":"admiralmarkets.com",
 "HFM":"hfm.com","AvaTrade":"avatrade.com","Axi":"axi.com","Fusion Markets":"fusionmarkets.com",
 "Blueberry":"blueberrymarkets.com","RoboForex":"roboforex.com","FBS":"fbs.com","OctaFX":"octafx.com",
 "ThinkMarkets":"thinkmarkets.com","Deriv":"deriv.com","JustMarkets":"justmarkets.com","Alpari":"alpari.com",
 "FXPro":"fxpro.com","The5ers":"the5ers.com","E8 Markets":"e8markets.com","FundingPips":"fundingpips.com",
 "Swissquote":"swissquote.com","Dukascopy":"dukascopy.com","InstaForex":"instaforex.com","FXTM":"fxtm.com",
 "Oanda":"oanda.com","Forex.com":"forex.com","IG":"ig.com","Saxo":"saxobank.com","CMC Markets":"cmcmarkets.com",
 "Darwinex":"darwinex.com","Purple Trading":"purple-trading.com","Skilling":"skilling.com",
 "Titan FX":"titanfx.com","Global Prime":"globalprime.com","Hantec":"hantecmarkets.com",
 "Errante":"errante.com","Scandinavian Capital":"scandinavianmarkets.com","MultiBank":"multibankfx.com",
 "Equiti":"equiti.com","Windsor":"windsorbrokers.com","NordFX":"nordfx.com","Weltrade":"weltrade.com",
 "MyFundedFX":"myfundedfx.com","Alpha Capital":"alphacapitalgroup.uk","Goat Funded":"goatfundedtrader.com",
 "Blue Guardian":"blueguardian.com","City Traders Imperial":"citytradersimperium.com","Funded Trading Plus":"fundedtradingplus.com",
 "Instant Funding":"instantfunding.io","Maven":"maventrading.com","Lark Funding":"larkfunding.com",
}
PREFIXES = ["mt5","mt5-live","mt5-live1","mt5-live2","mt5-real","mt5-real1","mt5-demo","mt5-demo1",
            "live","live1","real","real1","demo","demo1","trade","server","access","mt5trade",
            "mt5.live","mt5.demo","mt5-server","meta5","metatrader5","mt5gw"]
CF = [ipaddress.ip_network(n) for n in
      ("104.16.0.0/12","172.64.0.0/13","162.158.0.0/15","188.114.96.0/20","190.93.240.0/20","197.234.240.0/22","198.41.128.0/17")]
def cloudflare(ip):
    a = ipaddress.ip_address(ip)
    return any(a in n for n in CF)
def probe(host):
    try:
        ip = socket.gethostbyname(host)
    except OSError:
        return None
    if cloudflare(ip):
        return ("cf", host, ip)
    s = socket.socket(); s.settimeout(3)
    try:
        s.connect((ip, 443)); ok = True
    except OSError:
        ok = False
    finally:
        s.close()
    return ("open", host, ip) if ok else None
cands = [(b, f"{p}.{d}") for b, d in BROKERS.items() for p in PREFIXES]
hits, skipped = [], 0
with cf.ThreadPoolExecutor(96) as ex:
    for (b, host), r in zip(cands, ex.map(lambda c: probe(c[1]), cands)):
        if not r: continue
        if r[0] == "cf": skipped += 1; continue
        hits.append((b, r[1], r[2]))
seen = set()
with open("candidates2.tsv", "w") as f:
    for b, host, ip in sorted(hits):
        if host in seen: continue
        seen.add(host)
        f.write(f"{b}\t{host}:443\n")
print(f"{len(cands)} hostnames tested · {skipped} skipped as Cloudflare websites · {len(seen)} candidates to verify")
for b, host, ip in sorted(hits)[:40]:
    print(f"  {b:22} {host:40} {ip}")
