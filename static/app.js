// ── STATE ──
const STATE = {
  symbol:     'NIFTY',
  liveMode:   true,
  latestData: { NIFTY: null, BANKNIFTY: null },
  deltaCache: {},
  histSnaps:  [],
  histIdx:    0,
  playTimer:  null,
  pollTimer:  null,
  countdown:  60,
};

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  fetchLatest();
  startCountdown();
  loadDates();
});

// ── CLOCK ──
function startClock() {
  function tick() {
    const ist  = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const d    = new Date(ist);
    const hh   = String(d.getHours()).padStart(2,'0');
    const mm   = String(d.getMinutes()).padStart(2,'0');
    const ss   = String(d.getSeconds()).padStart(2,'0');
    document.getElementById('ist-clock').textContent = `IST ${hh}:${mm}:${ss}`;
    const h = d.getHours(), m = d.getMinutes();
    const open = (h > 9 || (h===9 && m>=15)) && (h < 15 || (h===15 && m<=30));
    const ms = document.getElementById('market-status');
    ms.textContent = open ? '● MARKET OPEN' : '● MARKET CLOSED';
    ms.className   = open ? 'mkt-open' : 'mkt-closed';
  }
  tick();
  setInterval(tick, 1000);
}

// ── COUNTDOWN ──
function startCountdown() {
  STATE.countdown = 60;
  clearInterval(STATE.pollTimer);
  STATE.pollTimer = setInterval(() => {
    STATE.countdown--;
    document.getElementById('poll-countdown').textContent =
      STATE.liveMode ? `Next refresh in ${STATE.countdown}s` : 'HISTORICAL MODE';
    if (STATE.countdown <= 0 && STATE.liveMode) {
      fetchLatest();
      STATE.countdown = 60;
    }
  }, 1000);
}

// ── LIVE TOGGLE ──
function toggleLive() {
  STATE.liveMode = !STATE.liveMode;
  const btn = document.getElementById('live-toggle');
  const hp  = document.getElementById('history-panel');
  if (STATE.liveMode) {
    btn.textContent = '● LIVE';
    btn.classList.add('active');
    hp.style.display = 'none';
    fetchLatest();
  } else {
    btn.textContent = '○ HISTORICAL';
    btn.classList.remove('active');
    hp.style.display = 'block';
    loadDates();
  }
}

// ── SYMBOL SWITCH ──
function switchSymbol(sym, e) {
  STATE.symbol = sym;
  document.querySelectorAll('.sym-tab').forEach(t => t.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  STATE.deltaCache = {};
  if (STATE.liveMode) {
    renderAll(STATE.latestData[sym]);
  } else {
    if (STATE.histSnaps.length) scrubTo(STATE.histIdx);
    loadDates();
  }
}

// ── FETCH LATEST ──
async function fetchLatest() {
  try {
    setStatus('Fetching NSE data...', true);
    const res  = await fetch('/api/latest');
    const data = await res.json();
    STATE.latestData = data;
    updateTickerBar(data);
    if (STATE.liveMode) renderAll(data[STATE.symbol]);

    // Check mode label
    const d = data[STATE.symbol];
    if (d) {
      const ts = d.timestamp || '';
      const isEOD = ts.includes('15-30') || ts.includes('15:30');
      document.getElementById('data-mode').textContent = isEOD ? 'EOD Snapshot' : 'Live';
    }
    setStatus('Data updated ✓', false);
  } catch(e) {
    setStatus('Fetch error — retrying next cycle', false);
  }
}

// ── TICKER BAR ──
function updateTickerBar(data) {
  ['NIFTY','BANKNIFTY'].forEach(sym => {
    const d = data[sym];
    if (!d) return;
    document.getElementById(`spot-${sym}`).textContent =
      Number(d.spot).toLocaleString('en-IN', {maximumFractionDigits:2});
    const sigEl = document.getElementById(`sig-${sym}`);
    sigEl.textContent = d.sentiment;
    sigEl.className   = `t-sig sig-${d.sentiment}`;
  });
}

// ── RENDER ALL ──
function renderAll(d) {
  if (!d) {
    setStatus('No data yet — app is checking for missing days or waiting for 9:15 AM', false);
    return;
  }
  renderSignalCard(d);
  renderTargets(d);
  renderMetrics(d);
  redrawChart();
  renderPCRSpark();
}

// ── SIGNAL CARD ──
function renderSignalCard(d) {
  document.getElementById('sc-symbol').textContent =  d.symbol;
  document.getElementById('sc-spot').textContent   =
    Number(d.spot).toLocaleString('en-IN', {maximumFractionDigits:2});
  document.getElementById('sc-expiry').textContent = `Expiry: ${d.expiry}`;

  const sentEl = document.getElementById('sc-sentiment');
  sentEl.textContent = d.sentiment;
  sentEl.className   = `sent-${d.sentiment}`;

  const bar = document.getElementById('sc-bar');
  const pct = d.bull_pct;
  bar.style.width      = `${pct}%`;
  bar.style.background = pct>=60 ? 'var(--green)' : pct<=40 ? 'var(--red)' : 'var(--neutral)';
  document.getElementById('sc-pct').textContent = `Bull Score: ${pct}%`;

  document.getElementById('sc-maxpain').textContent  = fmt(d.max_pain);
  document.getElementById('sc-pcr').textContent      = d.pcr_total;
  document.getElementById('sc-pcratm').textContent   = d.pcr_atm;

  const skew   = d.iv_skew;
  const skewEl = document.getElementById('sc-ivskew');
  skewEl.textContent = `${skew>0?'+':''}${skew}%`;
  skewEl.className   = skew>0.5 ? 'red bold' : skew<-0.5 ? 'green bold' : 'neutral bold';

  document.getElementById('sc-ceiv').textContent = `${d.atm_ce_iv}%`;
  document.getElementById('sc-peiv').textContent = `${d.atm_pe_iv}%`;
  document.getElementById('last-update-time').textContent = d.timestamp;
}

// ── TARGETS ──
function renderTargets(d) {
  const f = d.fib_targets;
  document.getElementById('tgt-u1').textContent = `T1: ${fmt(f.bull_t1)}`;
  document.getElementById('tgt-u2').textContent = `T2: ${fmt(f.bull_t2)}`;
  document.getElementById('tgt-u3').textContent = `T3: ${fmt(f.bull_t3)}`;
  document.getElementById('tgt-b1').textContent = `T1: ${fmt(f.bear_t1)}`;
  document.getElementById('tgt-b2').textContent = `T2: ${fmt(f.bear_t2)}`;
  document.getElementById('tgt-b3').textContent = `T3: ${fmt(f.bear_t3)}`;
  const cw = d.top_call_walls[0];
  const pw = d.top_put_walls[0];
  document.getElementById('wall-c').textContent = `Call: ${cw ? fmt(cw.strike) : '—'}`;
  document.getElementById('wall-p').textContent = `Put:  ${pw ? fmt(pw.strike) : '—'}`;
}

// ── METRICS ──
function renderMetrics(d) {
  document.getElementById('total-ce').textContent    = fmtOI(d.total_ce_oi);
  document.getElementById('total-pe').textContent    = fmtOI(d.total_pe_oi);
  document.getElementById('pcr-total-2').textContent = d.pcr_total;

  let cHtml = '', pHtml = '';
  (d.top_call_walls||[]).forEach(w => {
    cHtml += `<div class="wall-row"><span class="wall-strike red">${fmt(w.strike)}</span><span class="wall-oi">${fmtOI(w.ce_oi)} lots</span></div>`;
  });
  (d.top_put_walls||[]).forEach(w => {
    pHtml += `<div class="wall-row"><span class="wall-strike green">${fmt(w.strike)}</span><span class="wall-oi">${fmtOI(w.pe_oi)} lots</span></div>`;
  });
  document.getElementById('top-calls').innerHTML = cHtml || '—';
  document.getElementById('top-puts').innerHTML  = pHtml || '—';
  fetchTrends(d);
}

// ── TRENDS ──
async function fetchTrends(d) {
  for (const mins of [5,15,30,60]) {
    try {
      const res   = await fetch(`/api/delta/${STATE.symbol}/${mins}`);
      const delta = await res.json();
      STATE.deltaCache[mins] = delta;
      const keys = Object.keys(delta);
      if (!keys.length) { setTrend(mins,'flat','— no data'); continue; }
      let netCE=0, netPE=0;
      keys.forEach(k => { netCE += delta[k].ce_oi_chg; netPE += delta[k].pe_oi_chg; });
      let dir, label;
      if (netPE>0 && netCE<0)      { dir='up';   label=`PE +${fmtOI(netPE)} CE ${fmtOI(netCE)}`; }
      else if (netCE>0 && netPE<0) { dir='down'; label=`CE +${fmtOI(netCE)} PE ${fmtOI(netPE)}`; }
      else if (netPE>0 && netCE>0) { dir=netPE>netCE?'up':'down'; label=`PE +${fmtOI(netPE)} CE +${fmtOI(netCE)}`; }
      else { dir='flat'; label='minimal change'; }
      setTrend(mins, dir, label);
    } catch(e) { setTrend(mins,'flat','error'); }
  }
}

function setTrend(mins, dir, label) {
  const el = document.getElementById(`trend-${mins}`);
  if (!el) return;
  const arrow = dir==='up' ? '▲' : dir==='down' ? '▼' : '→';
  const cls   = dir==='up' ? 'trend-up' : dir==='down' ? 'trend-down' : 'trend-flat';
  el.innerHTML = `<span class="${cls}">${arrow} ${label}</span>`;
}

// ── OI CHART ──
async function redrawChart() {
  const d = STATE.liveMode
    ? STATE.latestData[STATE.symbol]
    : (STATE.histSnaps[STATE.histIdx] || null);
  if (!d || !d.strikes) return;

  const deltaMin  = parseInt(document.getElementById('delta-select').value);
  const strikeCnt = parseInt(document.getElementById('strikes-select').value);
  const showDelta = document.getElementById('show-delta').checked;

  const atm  = d.atm_strike;
  let strikes = d.strikes;
  if (strikeCnt < 999) {
    const step = strikes.length>1 ? (strikes[1].strike - strikes[0].strike) : 50;
    const half = (strikeCnt/2) * step;
    strikes = strikes.filter(s => Math.abs(s.strike - atm) <= half);
  }

  const xLabels = strikes.map(s => s.strike);
  const ceOI    = strikes.map(s => s.ce_oi);
  const peOI    = strikes.map(s => s.pe_oi);

  let dCE=[], dPE=[];
  if (showDelta && deltaMin>0) {
    let delta = STATE.deltaCache[deltaMin] || {};
    if (STATE.liveMode && !Object.keys(delta).length) {
      try {
        const res = await fetch(`/api/delta/${STATE.symbol}/${deltaMin}`);
        delta = await res.json();
        STATE.deltaCache[deltaMin] = delta;
      } catch(e) {}
    }
    dCE = strikes.map(s => (delta[s.strike]||{}).ce_oi_chg||0);
    dPE = strikes.map(s => (delta[s.strike]||{}).pe_oi_chg||0);
  }

  const traces = [
    { x:xLabels, y:ceOI, name:'Call OI', type:'bar', marker:{color:'rgba(255,23,68,0.75)'} },
    { x:xLabels, y:peOI, name:'Put OI',  type:'bar', marker:{color:'rgba(0,200,83,0.75)'} },
  ];

  if (showDelta && deltaMin>0 && dCE.length) {
    traces.push({ x:xLabels, y:dCE, name:`CE Δ ${deltaMin}m`, type:'bar',
      marker:{color:'rgba(255,100,100,0.45)',line:{color:'#FF1744',width:1}}, yaxis:'y2' });
    traces.push({ x:xLabels, y:dPE, name:`PE Δ ${deltaMin}m`, type:'bar',
      marker:{color:'rgba(100,255,150,0.45)',line:{color:'#00C853',width:1}}, yaxis:'y2' });
  }

  const layout = {
    paper_bgcolor:'#0D1117', plot_bgcolor:'#161B22',
    font:{color:'#E6EDF3', family:'Courier New', size:11},
    margin:{t:10, b:60, l:60, r:60},
    barmode:'group',
    legend:{orientation:'h', y:-0.18},
    xaxis:{title:'Strike Price', tickfont:{size:10}, gridcolor:'#30363D', tickangle:-45},
    yaxis:{title:'Open Interest', gridcolor:'#30363D'},
    yaxis2:{title:'OI Change', overlaying:'y', side:'right', gridcolor:'rgba(48,54,61,0.3)', zeroline:true, zerolinecolor:'#607D8B'},
    shapes:[
      {type:'line', x0:d.spot, x1:d.spot, y0:0, y1:1, yref:'paper', line:{color:'#FFD600',width:2,dash:'dash'}},
      {type:'line', x0:d.max_pain, x1:d.max_pain, y0:0, y1:1, yref:'paper', line:{color:'#7C3AED',width:2,dash:'dot'}},
    ],
    annotations:[
      {x:d.spot,     y:1, yref:'paper', text:'SPOT',     showarrow:false, font:{color:'#FFD600',size:10}, yanchor:'bottom'},
      {x:d.max_pain, y:0.92, yref:'paper', text:'MAX PAIN', showarrow:false, font:{color:'#7C3AED',size:10}, yanchor:'bottom'},
    ],
  };

  Plotly.react('oi-chart', traces, layout, {responsive:true, displayModeBar:false});
}

// ── PCR SPARKLINE ──
async function renderPCRSpark() {
  try {
    const ist  = new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'});
    const d    = new Date(ist);
    const ds   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const res  = await fetch(`/api/snapshots/${STATE.symbol}/${ds}`);
    const snaps = await res.json();
    if (!snaps.length) return;
    const times = snaps.map(s => s.timestamp.slice(11,16));
    const pcrs  = snaps.map(s => s.pcr_total);
    Plotly.react('pcr-spark',
      [{x:times, y:pcrs, type:'scatter', mode:'lines',
        line:{color:'#2196F3',width:1.5}, fill:'tozeroy', fillcolor:'rgba(33,150,243,0.1)'}],
      {paper_bgcolor:'transparent', plot_bgcolor:'transparent',
       margin:{t:2,b:18,l:30,r:5}, height:50,
       xaxis:{showgrid:false, tickfont:{size:9}, color:'#8B949E'},
       yaxis:{showgrid:false, tickfont:{size:9}, color:'#8B949E'},
       font:{color:'#8B949E',size:9}},
      {responsive:true, displayModeBar:false});
  } catch(e) {}
}

// ── HISTORICAL ──
async function loadDates() {
  try {
    const res   = await fetch(`/api/dates/${STATE.symbol}`);
    const dates = await res.json();
    const sel   = document.getElementById('date-select');
    sel.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
    if (dates.length) loadDateSnapshots();
  } catch(e) {}
}

async function loadDateSnapshots() {
  const date = document.getElementById('date-select').value;
  if (!date) return;
  try {
    const res = await fetch(`/api/snapshots/${STATE.symbol}/${date}`);
    STATE.histSnaps = await res.json();
    const scrub = document.getElementById('scrubber');
    scrub.max   = Math.max(0, STATE.histSnaps.length-1);
    scrub.value = 0;
    STATE.histIdx = 0;
    const cnt = document.getElementById('hist-snap-count');
    if (cnt) cnt.textContent = `${STATE.histSnaps.length} snapshots`;
    drawScrubberSparkline();
    if (!STATE.liveMode && STATE.histSnaps.length) scrubTo(0);
  } catch(e) {}
}

function drawScrubberSparkline() {
  const snaps = STATE.histSnaps;
  if (!snaps.length) return;
  Plotly.react('pcr-sparkline-bg',
    [{x:snaps.map(s=>s.timestamp.slice(11,16)), y:snaps.map(s=>s.pcr_total),
      type:'scatter', mode:'lines', line:{color:'rgba(33,150,243,0.6)',width:1},
      fill:'tozeroy', fillcolor:'rgba(33,150,243,0.08)'}],
    {paper_bgcolor:'transparent', plot_bgcolor:'transparent',
     margin:{t:0,b:0,l:0,r:0}, height:30,
     xaxis:{visible:false}, yaxis:{visible:false}, showlegend:false},
    {responsive:true, displayModeBar:false, staticPlot:true});
}

async function scrubTo(idx) {
  STATE.histIdx = parseInt(idx);
  document.getElementById('scrubber').value = idx;
  const snap = STATE.histSnaps[STATE.histIdx];
  if (!snap) return;
  document.getElementById('scrub-time-label').textContent =
    snap.timestamp ? snap.timestamp.slice(11,16) : '—';

  try {
    const date    = document.getElementById('date-select').value;
    const timeStr = snap.timestamp.slice(11,19).replace(/:/g,'-');
    const res     = await fetch(`/api/snapshot_detail/${STATE.symbol}/${date}/${timeStr}.json`);
    const detail  = await res.json();
    if (!detail.error) {
      renderSignalCard(detail);
      renderTargets(detail);
      renderMetrics(detail);
      const orig = STATE.latestData[STATE.symbol];
      STATE.latestData[STATE.symbol] = detail;
      await redrawChart();
      STATE.latestData[STATE.symbol] = orig;
    }
  } catch(e) {}
}

function playHistory() {
  if (STATE.playTimer) return;
  const speed = parseInt(document.getElementById('play-speed').value);
  STATE.playTimer = setInterval(() => {
    if (STATE.histIdx >= STATE.histSnaps.length-1) { stopHistory(); return; }
    scrubTo(STATE.histIdx+1);
  }, speed);
  document.getElementById('play-btn').textContent = '⏸ Playing';
}

function stopHistory() {
  clearInterval(STATE.playTimer);
  STATE.playTimer = null;
  document.getElementById('play-btn').textContent = '▶ Play';
}

// ── KEYBOARD SHORTCUTS ──
document.addEventListener('keydown', e => {
  if (STATE.liveMode) return;
  if (e.key==='ArrowRight') scrubTo(Math.min(STATE.histIdx+1, STATE.histSnaps.length-1));
  if (e.key==='ArrowLeft')  scrubTo(Math.max(STATE.histIdx-1, 0));
  if (e.key===' ')          STATE.playTimer ? stopHistory() : playHistory();
});

// ── UTILS ──
function fmt(n) { return Number(n).toLocaleString('en-IN',{maximumFractionDigits:0}); }
function fmtOI(n) {
  if (n>=10000000) return (n/10000000).toFixed(2)+'Cr';
  if (n>=100000)   return (n/100000).toFixed(2)+'L';
  if (n>=1000)     return (n/1000).toFixed(1)+'K';
  return String(n);
}
function setStatus(msg, loading) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className   = loading ? 'pulsing' : '';
}
