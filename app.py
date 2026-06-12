import logging
import json
import os
import time
import threading
import shutil
from datetime import datetime, timedelta

import pytz
import requests as req
import pandas as pd
import numpy as np
from flask import Flask, jsonify, render_template
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler

# ── LOGGING ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── FLASK ──
app = Flask(__name__)
CORS(app)

# ── CONSTANTS ──
IST      = pytz.timezone("Asia/Kolkata")
DATA_DIR = r"D:\OI-Sentinel\data"
os.makedirs(DATA_DIR, exist_ok=True)

SYMBOLS = {
    "NIFTY":     "NIFTY",
    "BANKNIFTY": "BANKNIFTY",
}

NSE_V3_BASE = "https://www.nseindia.com/api/option-chain-v3"

HEADERS = {
    "User-Agent":        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Accept":            "application/json, text/plain, */*",
    "Accept-Language":   "en-US,en;q=0.9,hi;q=0.8",
    "Referer":           "https://www.nseindia.com/option-chain",
    "Connection":        "keep-alive",
    "sec-ch-ua":         '"Not A(Brand";v="8", "Chromium";v="137", "Google Chrome";v="137"',
    "sec-ch-ua-mobile":  "?0",
    "sec-ch-ua-platform":'"Windows"',
    "Sec-Fetch-Site":    "same-origin",
    "Sec-Fetch-Mode":    "cors",
    "Sec-Fetch-Dest":    "empty",
}
# Note: Accept-Encoding intentionally omitted — requests handles decompression automatically
# Explicitly setting it causes binary garbage in response when session state is partial

# NO global shared session — each fetch creates its own session
# This is the fix for Akamai empty 200 response in threaded context
latest_data   = {"NIFTY": None, "BANKNIFTY": None}
cached_expiry = {"NIFTY": None, "BANKNIFTY": None}

# ── IST HELPERS ──
def ist_now_str():
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")

def ist_dt():
    return datetime.now(IST)

def is_market_hours():
    now = ist_dt()
    if now.weekday() >= 5:
        return False
    o = now.replace(hour=9,  minute=15, second=0, microsecond=0)
    c = now.replace(hour=15, minute=30, second=0, microsecond=0)
    return o <= now <= c

def is_trading_day(dt):
    return dt.weekday() < 5

def is_backfill_safe():
    h = ist_dt().hour
    return 6 <= h <= 23

def last_n_trading_days(n=7):
    days = []
    dt   = ist_dt().replace(hour=0, minute=0, second=0, microsecond=0)
    while len(days) < n:
        if is_trading_day(dt):
            days.append(dt.strftime("%Y-%m-%d"))
        dt -= timedelta(days=1)
    return days

def has_data(symbol, date_str):
    folder = os.path.join(DATA_DIR, symbol, date_str)
    if not os.path.exists(folder):
        return False
    return len([f for f in os.listdir(folder) if f.endswith(".json")]) > 0

# ── NSE FETCH — fresh session per call (Akamai fix) ──
def fetch_oi(symbol):
    """
    Creates a brand new requests.Session() for every fetch.
    This is the critical fix — sharing a session across threads
    causes Akamai to return empty 200 responses (cookie corruption).
    Pattern: visit /option-chain -> wait 2.5s -> hit API.
    """
    global cached_expiry

    s = req.Session()
    try:
        # Step 1: visit option-chain page to get cookies
        log.info(f"{symbol} — initializing fresh session...")
        r0 = s.get("https://www.nseindia.com/option-chain", headers=HEADERS, timeout=15)
        log.info(f"{symbol} — page status:{r0.status_code} cookies:{list(s.cookies.keys())}")
        if r0.status_code != 200:
            log.warning(f"{symbol} — option-chain page returned {r0.status_code}")
            return None
        time.sleep(2.5)

        # Step 2: get expiry if not cached
        if not cached_expiry[symbol]:
            probe = "26-Dec-2030"
            url_p = f"{NSE_V3_BASE}?type=Indices&symbol={symbol}&expiry={probe}"
            log.info(f"{symbol} — probing expiry...")
            rp    = s.get(url_p, headers=HEADERS, timeout=15)
            log.info(f"{symbol} — probe status:{rp.status_code} len:{len(rp.text)} first50:{rp.text[:50]}")
            if rp.status_code == 200 and rp.text.strip():
                expiries = rp.json().get("records", {}).get("expiryDates", [])
                if expiries:
                    cached_expiry[symbol] = expiries[0]
                    log.info(f"{symbol} nearest expiry: {expiries[0]}")
            if not cached_expiry[symbol]:
                log.error(f"{symbol} — could not determine expiry")
                return None
            time.sleep(1)

        expiry = cached_expiry[symbol]

        # Step 3: fetch actual option chain
        url = f"{NSE_V3_BASE}?type=Indices&symbol={symbol}&expiry={expiry}"
        log.info(f"{symbol} — fetching chain for expiry {expiry}...")
        r   = s.get(url, headers=HEADERS, timeout=20)
        log.info(f"{symbol} — chain status:{r.status_code} len:{len(r.text)} first50:{r.text[:50]}")

        if r.status_code == 200 and len(r.text.strip()) == 0:
            log.warning(f"{symbol} — empty 200 detected, resetting expiry cache")
            cached_expiry[symbol] = None
            return None

        if r.status_code != 200:
            log.warning(f"{symbol} — API returned {r.status_code}")
            return None

        r.raise_for_status()
        return r.json()

    except Exception as e:
        log.error(f"fetch_oi failed {symbol}: {e}")
        import traceback
        log.error(traceback.format_exc())
        return None
    finally:
        s.close()

# ── PARSE CHAIN ──
def parse_chain(raw, symbol):
    try:
        records = raw["records"]
        spot    = records["underlyingValue"]
        expiry  = records["expiryDates"][0]
        data    = records["data"]
        ts      = ist_now_str()

        strikes = []
        for rec in data:
            if rec.get("expiryDates") != expiry:
                continue
            strike = rec.get("CE", rec.get("PE", {})).get("strikePrice")
            if strike is None:
                continue
            ce = rec.get("CE", {})
            pe = rec.get("PE", {})
            strikes.append({
                "strike": strike,
                "ce_oi":  ce.get("openInterest", 0),
                "ce_coi": ce.get("changeinOpenInterest", 0),
                "ce_vol": ce.get("totalTradedVolume", 0),
                "ce_iv":  ce.get("impliedVolatility", 0),
                "ce_ltp": ce.get("lastPrice", 0),
                "ce_bid": ce.get("buyPrice1", 0),
                "ce_ask": ce.get("sellPrice1", 0),
                "pe_oi":  pe.get("openInterest", 0),
                "pe_coi": pe.get("changeinOpenInterest", 0),
                "pe_vol": pe.get("totalTradedVolume", 0),
                "pe_iv":  pe.get("impliedVolatility", 0),
                "pe_ltp": pe.get("lastPrice", 0),
                "pe_bid": pe.get("buyPrice1", 0),
                "pe_ask": pe.get("sellPrice1", 0),
            })

        if not strikes:
            log.warning(f"No strikes parsed for {symbol}")
            return None

        df = pd.DataFrame(strikes).sort_values("strike").reset_index(drop=True)

        total_ce = int(df["ce_oi"].sum())
        total_pe = int(df["pe_oi"].sum())
        pcr      = round(total_pe / total_ce, 4) if total_ce else 0

        atm_idx   = (df["strike"] - spot).abs().argsort().iloc[0]
        atm       = df.loc[atm_idx, "strike"]
        atm_range = df.iloc[max(0, atm_idx-5): atm_idx+6]
        pcr_atm   = round(
            atm_range["pe_oi"].sum() / atm_range["ce_oi"].sum(), 4
        ) if atm_range["ce_oi"].sum() else 0

        # Max Pain
        pain = []
        for s in df["strike"]:
            cp = df[df["strike"] <= s]["ce_oi"].mul(s - df[df["strike"] <= s]["strike"]).sum()
            pp = df[df["strike"] >= s]["pe_oi"].mul(df[df["strike"] >= s]["strike"] - s).sum()
            pain.append({"strike": s, "pain": cp + pp})
        max_pain = min(pain, key=lambda x: x["pain"])["strike"]

        top_ce = df.nlargest(3, "ce_oi")[["strike","ce_oi"]].to_dict("records")
        top_pe = df.nlargest(3, "pe_oi")[["strike","pe_oi"]].to_dict("records")

        atm_row   = df[df["strike"] == atm]
        ce_iv     = float(atm_row["ce_iv"].values[0]) if not atm_row.empty else 0
        pe_iv     = float(atm_row["pe_iv"].values[0]) if not atm_row.empty else 0
        iv_skew   = round(pe_iv - ce_iv, 2)

        top_call_wall = top_ce[0]["strike"] if top_ce else atm
        top_put_wall  = top_pe[0]["strike"] if top_pe else atm
        wall_range    = abs(top_call_wall - top_put_wall)

        bull = bear = 0
        if pcr > 1.2:    bull += 2
        if pcr < 0.8:    bear += 2
        if 0.8 <= pcr <= 1.2:
            bull += 1 if pcr > 1.0 else 0
            bear += 1 if pcr <= 1.0 else 0
        if pcr_atm > 1.2: bull += 1
        if pcr_atm < 0.8: bear += 1
        if atm_range["pe_oi"].sum() > atm_range["ce_oi"].sum(): bull += 1
        else: bear += 1
        if iv_skew > 0.5:  bear += 1
        if iv_skew < -0.5: bull += 1
        if spot > max_pain: bull += 1
        if spot < max_pain: bear += 1
        if spot > top_call_wall: bull += 2
        if spot < top_put_wall:  bear += 2

        total    = bull + bear
        bull_pct = round((bull / total * 100) if total else 50, 1)
        sentiment = "BULLISH" if bull_pct >= 60 else "BEARISH" if bull_pct <= 40 else "SIDEWAYS"

        fib = {
            "bull_t1": top_call_wall,
            "bull_t2": round(top_call_wall + wall_range * 0.618),
            "bull_t3": round(top_call_wall + wall_range * 1.0),
            "bear_t1": top_put_wall,
            "bear_t2": round(top_put_wall  - wall_range * 0.618),
            "bear_t3": round(top_put_wall  - wall_range * 1.0),
        }

        return {
            "symbol":         symbol,
            "timestamp":      ts,
            "spot":           spot,
            "expiry":         expiry,
            "atm_strike":     float(atm),
            "pcr_total":      pcr,
            "pcr_atm":        pcr_atm,
            "max_pain":       float(max_pain),
            "top_call_walls": top_ce,
            "top_put_walls":  top_pe,
            "atm_ce_iv":      ce_iv,
            "atm_pe_iv":      pe_iv,
            "iv_skew":        iv_skew,
            "sentiment":      sentiment,
            "bull_pct":       bull_pct,
            "fib_targets":    fib,
            "strikes":        df.to_dict("records"),
            "total_ce_oi":    total_ce,
            "total_pe_oi":    total_pe,
        }
    except Exception as e:
        log.error(f"Parse error {symbol}: {e}")
        return None

# ── SAVE ──
def save_snapshot(data, symbol, date_str=None, time_str=None):
    now      = ist_dt()
    date_str = date_str or now.strftime("%Y-%m-%d")
    time_str = time_str or now.strftime("%H-%M-%S")
    folder   = os.path.join(DATA_DIR, symbol, date_str)
    os.makedirs(folder, exist_ok=True)
    fpath    = os.path.join(folder, f"{time_str}.json")
    if date_str or time_str:
        data = dict(data)
        data["timestamp"] = f"{date_str} {time_str.replace('-', ':')}"
    with open(fpath, "w") as f:
        json.dump(data, f)
    log.info(f"Saved {symbol} → {date_str}/{time_str}.json")
    purge_old(symbol)

def purge_old(symbol):
    base    = os.path.join(DATA_DIR, symbol)
    cutoff  = ist_dt() - timedelta(days=30)
    if not os.path.exists(base):
        return
    for d in os.listdir(base):
        try:
            if datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=IST) < cutoff:
                shutil.rmtree(os.path.join(base, d))
                log.info(f"Purged {symbol}/{d}")
        except:
            pass

# ── LOAD FROM DISK ──
def load_from_disk():
    for sym in SYMBOLS:
        if latest_data[sym] is not None:
            continue
        for date_str in last_n_trading_days(7):
            folder = os.path.join(DATA_DIR, sym, date_str)
            if not os.path.exists(folder):
                continue
            files = sorted([f for f in os.listdir(folder) if f.endswith(".json")], reverse=True)
            if files:
                with open(os.path.join(folder, files[0])) as f:
                    latest_data[sym] = json.load(f)
                log.info(f"Loaded from disk: {sym} {date_str}/{files[0]}")
                break

# ── BACKFILL ──
def backfill():
    if not is_backfill_safe():
        log.info("Backfill skipped — outside 6AM-11PM IST")
        return
    log.info("Backfill check starting...")
    today = ist_dt().strftime("%Y-%m-%d")
    for date_str in last_n_trading_days(7):
        if date_str == today and is_market_hours():
            continue
        missing = [s for s in SYMBOLS if not has_data(s, date_str)]
        if not missing:
            log.info(f"{date_str} — complete")
            continue
        log.info(f"{date_str} — missing {missing}, fetching...")
        for sym in missing:
            raw = fetch_oi(sym)
            if raw:
                parsed = parse_chain(raw, sym)
                if parsed:
                    save_snapshot(parsed, sym, date_str, "15-30-00")
                    if latest_data[sym] is None:
                        latest_data[sym] = parsed
                else:
                    log.warning(f"Parse failed {sym} {date_str}")
            else:
                log.warning(f"Fetch failed {sym} {date_str} — retry next startup")
            time.sleep(3)
    load_from_disk()
    log.info("Backfill complete.")

# ── LIVE POLL ──
def poll_all():
    if not is_market_hours():
        log.info("Market closed — skip poll")
        return
    for sym in SYMBOLS:
        raw = fetch_oi(sym)
        if raw:
            parsed = parse_chain(raw, sym)
            if parsed:
                latest_data[sym] = parsed
                save_snapshot(parsed, sym)
                log.info(f"{sym} | Spot:{parsed['spot']} | {parsed['sentiment']} {parsed['bull_pct']}%")

# ── SNAPSHOTS ──
def load_snaps(symbol, date_str):
    folder = os.path.join(DATA_DIR, symbol, date_str)
    if not os.path.exists(folder):
        return []
    snaps = []
    for fname in sorted(os.listdir(folder)):
        if fname.endswith(".json"):
            with open(os.path.join(folder, fname)) as f:
                snaps.append(json.load(f))
    return snaps

def get_delta(current, minutes_ago, symbol, date_str):
    folder = os.path.join(DATA_DIR, symbol, date_str)
    if not os.path.exists(folder):
        return None
    target = (ist_dt() - timedelta(minutes=minutes_ago)).strftime("%H-%M")
    best   = None
    for fname in sorted(os.listdir(folder)):
        if fname[:5] <= target:
            best = fname
    if not best:
        return None
    with open(os.path.join(folder, best)) as f:
        old = json.load(f)
    old_map = {s["strike"]: s for s in old.get("strikes", [])}
    deltas  = {}
    for s in current.get("strikes", []):
        o = old_map.get(s["strike"], {})
        deltas[s["strike"]] = {
            "ce_oi_chg": s["ce_oi"] - o.get("ce_oi", s["ce_oi"]),
            "pe_oi_chg": s["pe_oi"] - o.get("pe_oi", s["pe_oi"]),
        }
    return deltas

# ── ROUTES ──
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/latest")
def api_latest():
    return jsonify(latest_data)

@app.route("/api/status")
def api_status():
    now = ist_dt()
    return jsonify({
        "market_open":   is_market_hours(),
        "ist_time":      ist_now_str(),
        "is_weekday":    is_trading_day(now),
        "has_nifty":     latest_data["NIFTY"] is not None,
        "has_banknifty": latest_data["BANKNIFTY"] is not None,
        "backfill_safe": is_backfill_safe(),
    })

@app.route("/api/dates/<symbol>")
def api_dates(symbol):
    base = os.path.join(DATA_DIR, symbol)
    if not os.path.exists(base):
        return jsonify([])
    dates = sorted(
        [d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))],
        reverse=True
    )
    return jsonify(dates)

@app.route("/api/snapshots/<symbol>/<date_str>")
def api_snapshots(symbol, date_str):
    return jsonify([{
        "timestamp": s["timestamp"], "spot": s["spot"],
        "sentiment": s["sentiment"], "bull_pct": s["bull_pct"],
        "pcr_total": s["pcr_total"], "max_pain":  s["max_pain"]
    } for s in load_snaps(symbol, date_str)])

@app.route("/api/snapshot_detail/<symbol>/<date_str>/<time_str>")
def api_snapshot_detail(symbol, date_str, time_str):
    fpath = os.path.join(DATA_DIR, symbol, date_str, f"{time_str}.json")
    if not os.path.exists(fpath):
        return jsonify({"error": "not found"}), 404
    with open(fpath) as f:
        return jsonify(json.load(f))

@app.route("/api/delta/<symbol>/<int:minutes>")
def api_delta(symbol, minutes):
    cur = latest_data.get(symbol)
    if not cur:
        return jsonify({})
    deltas = get_delta(cur, minutes, symbol, ist_dt().strftime("%Y-%m-%d"))
    return jsonify(deltas or {})

# ── MAIN ──
if __name__ == "__main__":
    log.info("OI Sentinel starting...")
    load_from_disk()

    if is_market_hours():
        log.info("Market OPEN — polling now")
        poll_all()

    scheduler = BackgroundScheduler(timezone=IST)
    scheduler.add_job(poll_all, "interval", minutes=1, id="poll")
    scheduler.start()

    if is_backfill_safe():
        threading.Thread(target=backfill, daemon=True).start()
        log.info("Backfill thread started")
    else:
        log.info("Backfill skipped (outside 6AM-11PM) — runs next morning")

    log.info("Dashboard → http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
