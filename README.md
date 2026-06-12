# ⚡ OI Sentinel — NSE Option Chain Analysis Dashboard

Real-time **NIFTY + BANKNIFTY** OI analysis. Runs locally on Windows.

---

## First Time Setup

1. Download `setup.bat` from this repo to your Desktop
2. Right-click → **Run as Administrator**
3. First run: ~3-4 min (Python + packages install)
4. Browser opens at `http://localhost:5000`
5. Press **Y** when asked about auto-launch

---

## Auto-Launch (runs on every boot)

Task Scheduler launches OI Sentinel automatically on weekday logins.

**Check if installed:**
```
schtasks /query /tn "OI-Sentinel-AutoLaunch"
```

**Remove:**
```
schtasks /delete /tn "OI-Sentinel-AutoLaunch" /f
```

---

## Startup Log

All output logged to:
```
D:\OI-Sentinel\startup.log
```

Check this file if anything goes wrong.

---

## NSE API

Uses: `https://www.nseindia.com/api/option-chain-v3`
Expiry: auto-detected dynamically (no hardcoding)
Session: refreshed via `/option-chain` page only

---

## Data Storage

```
D:\OI-Sentinel\data\NIFTY\YYYY-MM-DD\HH-MM-SS.json
D:\OI-Sentinel\data\BANKNIFTY\YYYY-MM-DD\HH-MM-SS.json
```

- One snapshot per minute during market hours
- 30 days rolling retention
- Missing trading days auto-backfilled on startup (6AM-11PM IST)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard empty | Check `startup.log` for errors |
| localhost:5000 refused | Flask not running — run setup.bat |
| Autorun not working | Run `install_autorun.bat` as Admin |
| NSE fetch errors | Normal outside market hours |

**Diagnostic:** `http://localhost:5000/api/status`
