// ══ STATE ══
const S = {
  sym:        'NIFTY',
  live:       true,
  chartMode:  'live',      // 'live' | 'compare'
  data:       { NIFTY: null, BANKNIFTY: null },
  snaps:      [],          // snapshots for selected date
  leftIdx:    0,           // left handle index
  rightIdx:   0,           // right handle index (current)
  playTimer:  null,
  countdown:  60,
  pollTimer:  null,
  deltaCache: {},
  dragging:   null,        // 'left' | 'right'
};

// ══ INIT ══
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  fetchLatest();
  loadDates();
  startCountdown();
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup',   stopDrag);
});

// ══ CLOCK ══
function startClock() {
  function tick() {
    const ist  = new Date(new Date().toLocaleString('en-US', { timeZone:'Asia/Kolkata' }));
    const hh   = String(ist.getHours()).padStart(2,'0');
    const mm   = String(ist.getMinutes()).padStart(2,'0');
    const ss   = String(ist.getSeconds()).padStart(2,'0');
    document.getElementById('ist-clock').textContent = `${hh}:${mm}:${ss}`;
    const h = ist.getHours(), m = ist.getMinutes();
    const open = (h > 9 || (h===9&&m>=15)) && (h < 15||(h===15&&m<=30));
    const el   = document.getElementById('mkt-status');
    el.textContent  = open ? '● MARKET OPEN' : '● MARKET CLOSED';
    el.className    = 'mkt-status ' + (open ? 'mkt-open' : 'mkt-closed');
  }
  tick(); setInterval(tick, 1000);
}

// ══ COUNTDOWN ══
function startCountdown() {
  S.countdown = 60;
  clearInterval(S.pollTimer);
  S.pollTimer = setInterval(() => {
    if (!S.live) {
      document.getElementById('countdown-badge').textContent = 'HIST';
      return;
    }
    S.countdown--;
    document.getElementById('countdown-badge').textContent = S.countdown + 's';
    if (S.countdown <= 0) { fetchLatest(); S.countdown = 60; }
  }, 1000);
}

// ══ LIVE TOGGLE ══
function toggleLive() {
  S.live = !S.live;
  const btn = document.getElementById('live-btn');
  const lbl = document.getElementById('live-label');
  if (S.live) {
    btn.className = 'live-btn active';
    lbl.textContent = 'LIVE';
    fetchLatest();
  } else {
    btn.className = 'live-btn historical';
    lbl.textContent = 'HIST';
  }
}

// ══ SYMBOL SWITCH ══
function switchSymbol(sym, el) {
  S.sym = sym;
  S.deltaCache = {};
  document.querySelectorAll('.sym-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (S.live) renderAll(S.data[sym]);
  else renderFromHandles();
  loadDates();
}

// ══ CHART MODE ══
function setChartMode(mode) {
  S.chartMode = mode;
  document.getElementById('btn-live-oi').classList.toggle('active', mode === 'live');
  document.getElementById('btn-compare').classList.toggle('active', mode === 'compare');
  document.getElementById('compare-label-group').style.display = mode === 'compare' ? 'flex' : 'none';
  redrawChart();
}

// ══ FETCH LATEST ══
async function fetchLatest() {
  try {
    setStatus('Fetching NSE data...', true);
    const res  = await fetch('/api/latest');
    const data = await res.json();
    S.data = data;
    updateTickers(data);
    if (S.live) renderAll(data[S.sym]);
    setStatus('Live · ' + (data[S.sym]?.timestamp || ''), false);
  } catch(e) { setStatus('Fetch error — retrying', false); }
}

// ══ TICKER BAR ══
function updateTickers(data) {
  ['NIFTY','BANKNIFTY'].forEach(sym => {
    const d = data[sym]; if (!d) return;
    document.getElementById('spot-' + sym).textContent =
      Number(d.spot).toLocaleString('en-IN', {maximumFractionDigits:2});
    const b = document.getElementById('badge-' + sym);
    b.textContent = d.sentiment;
    b.className   = 'tick-badge badge-' + d.sentiment;
  });
}

// ══ RENDER ALL ══
function renderAll(d) {
  if (!d) { setStatus('Waiting for data...', false); return; }
  renderSigCard(d);
  renderConviction(d);
  renderMetrics(d);
  redrawChart();
  renderPCRSpark();
}

// ══ SIGNAL CARD ══
function renderSigCard(d) {
  const sym = d.symbol;
  const card = document.getElementById('sigcard-' + sym);
  card.className = 'sig-card ' + d.sentiment;

  document.getElementById('sc-spot-'   + sym).textContent = fmtN(d.spot);
  document.getElementById('sc-expiry-' + sym).textContent = 'Expiry ' + (d.expiry || '──');

  const v = document.getElementById('sc-verdict-' + sym);
  v.textContent = d.sentiment; v.className = 'sig-verdict ' + d.sentiment;

  const bar = document.getElementById('sc-bar-' + sym);
  const pct = d.bull_pct;
  bar.style.width      = pct + '%';
  bar.style.background = pct >= 60 ? 'var(--green)' : pct <= 40 ? 'var(--red)' : 'var(--neutral)';
  document.getElementById('sc-pct-' + sym).textContent = 'Bull Score ' + pct + '%';

  document.getElementById('sm-mp-'    + sym).textContent = fmtN(d.max_pain);
  document.getElementById('sm-pcr-'   + sym).textContent = d.pcr_total;
  document.getElementById('sm-pcratm-'+ sym).textContent = d.pcr_atm;

  const sk = d.iv_skew;
  const skEl = document.getElementById('sm-ivs-' + sym);
  skEl.textContent = (sk > 0 ? '+' : '') + sk + '%';
  skEl.style.color  = sk > 0.5 ? 'var(--red)' : sk < -0.5 ? 'var(--green)' : 'var(--text)';

  document.getElementById('sm-ceiv-' + sym).textContent = d.atm_ce_iv + '%';
  document.getElementById('sm-peiv-' + sym).textContent = d.atm_pe_iv + '%';

  const f = d.fib_targets;
  document.getElementById('bt1-' + sym).textContent = fmtN(f.bear_t1);
  document.getElementById('bt2-' + sym).textContent = fmtN(f.bear_t2);
  document.getElementById('bt3-' + sym).textContent = fmtN(f.bear_t3);
  document.getElementById('ut1-' + sym).textContent = fmtN(f.bull_t1);
  document.getElementById('ut2-' + sym).textContent = fmtN(f.bull_t2);
  document.getElementById('ut3-' + sym).textContent = fmtN(f.bull_t3);

  const cw = d.top_call_walls[0], pw = d.top_put_walls[0];
  document.getElementById('wc-' + sym).textContent = 'C:' + (cw ? fmtN(cw.strike) : '──');
  document.getElementById('wp-' + sym).textContent = 'P:' + (pw ? fmtN(pw.strike) : '──');

  document.getElementById('update-time').textContent   = d.timestamp || '──';
  document.getElementById('update-expiry').textContent = d.expiry    || '──';
}

// ══ CONVICTION GAUGE ══
function renderConviction(d) {
  const pct   = d.bull_pct;
  const score = Math.abs(pct - 50) / 50; // 0=neutral 1=extreme
  const canvas = document.getElementById('conviction-gauge');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W/2, cy = H - 18, r = H - 28;

  // bg arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#161E2E';
  ctx.stroke();

  // colored arc zones
  const zones = [
    { from: 0,    to: 0.33, color: '#607898' },
    { from: 0.33, to: 0.66, color: '#FFB830' },
    { from: 0.66, to: 1.0,  color: pct >= 50 ? '#00FF88' : '#FF4466' },
  ];
  zones.forEach(z => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI + z.from * Math.PI, Math.PI + z.to * Math.PI);
    ctx.lineWidth = 12; ctx.strokeStyle = z.color; ctx.stroke();
  });

  // needle
  const angle  = Math.PI + score * Math.PI;
  const nx     = cx + (r - 6) * Math.cos(angle);
  const ny     = cy + (r - 6) * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.lineWidth   = 2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur  = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI*2);
  ctx.fillStyle = '#FFFFFF'; ctx.fill();

  // conviction level
  const levels  = ['LOW','MODERATE','HIGH','EXTREME'];
  const lvl     = score < 0.25 ? 0 : score < 0.5 ? 1 : score < 0.75 ? 2 : 3;
  const colors  = ['#607898','#FFB830', pct>=50?'#00FF88':'#FF4466', pct>=50?'#00FF88':'#FF4466'];
  const lbl     = document.getElementById('conv-label');
  lbl.textContent = levels[lvl];
  lbl.style.color = colors[lvl];

  // aligned signals
  const sigs = [];
  if (d.pcr_total > 1.2 || d.pcr_total < 0.8) sigs.push('PCR');
  if (Math.abs(d.iv_skew) > 0.5) sigs.push('IV SKEW');
  if (Math.abs(d.spot - d.max_pain) < 100) sigs.push('MAX PAIN');
  if (d.top_call_walls[0] && Math.abs(d.spot - d.top_call_walls[0].strike) < 150) sigs.push('CALL WALL');
  if (d.top_put_walls[0]  && Math.abs(d.spot - d.top_put_walls[0].strike)  < 150) sigs.push('PUT WALL');
  document.getElementById('conv-signals').textContent = sigs.length
    ? sigs.join(' + ') + ' aligned'
    : 'No strong signal alignment';
}

// ══ METRICS ══
function renderMetrics(d) {
  document.getElementById('total-ce').textContent  = fmtOI(d.total_ce_oi);
  document.getElementById('total-pe').textContent  = fmtOI(d.total_pe_oi);
  document.getElementById('pcr-display').textContent = d.pcr_total;

  let cH = '', pH = '';
  (d.top_call_walls||[]).forEach(w => {
    cH += `<div class="wall-item"><span class="wi-strike wi-call">${fmtN(w.strike)}</span><span class="wi-oi">${fmtOI(w.ce_oi)}</span></div>`;
  });
  (d.top_put_walls||[]).forEach(w => {
    pH += `<div class="wall-item"><span class="wi-strike wi-put">${fmtN(w.strike)}</span><span class="wi-oi">${fmtOI(w.pe_oi)}</span></div>`;
  });
  document.getElementById('top-calls-list').innerHTML = cH || '──';
  document.getElementById('top-puts-list').innerHTML  = pH || '──';
  fetchTrends(d);
}

// ══ TRENDS ══
async function fetchTrends(d) {
  for (const mins of [5,15,30,60]) {
    try {
      const res   = await fetch(`/api/delta/${S.sym}/${mins}`);
      const delta = await res.json();
      S.deltaCache[mins] = delta;
      const keys = Object.keys(delta);
      if (!keys.length) { setTrend(mins,'flat','no data'); continue; }
      let nCE=0, nPE=0;
      keys.forEach(k => { nCE += delta[k].ce_oi_chg; nPE += delta[k].pe_oi_chg; });
      const dir = (nPE>0&&nCE<0)?'up':(nCE>0&&nPE<0)?'down':(nPE>nCE)?'up':'flat';
      setTrend(mins, dir, `PE${nPE>=0?'+':''}${fmtOI(nPE)} CE${nCE>=0?'+':''}${fmtOI(nCE)}`);
    } catch(e) { setTrend(mins,'flat','──'); }
  }
}
function setTrend(mins, dir, detail) {
  const row  = document.getElementById('tr-' + mins);
  if (!row) return;
  const arrow = dir==='up'?'▲':dir==='down'?'▼':'→';
  row.className = 'oi-trend-row tr-' + (dir==='up'?'up':dir==='down'?'down':'flat');
  row.querySelector('.tr-arrow').textContent  = arrow;
  row.querySelector('.tr-detail').textContent = detail;
}

// ══ OI CHART ══
async function redrawChart() {
  let d;
  if (S.live) {
    d = S.data[S.sym];
  } else {
    if (S.snaps.length && S.rightIdx < S.snaps.length) {
      d = await loadSnapDetail(S.rightIdx);
    }
  }
  if (!d || !d.strikes) return;

  const strikeCnt = parseInt(document.getElementById('strikes-select').value);
  const showDelta = document.getElementById('show-delta').checked;
  const atm       = d.atm_strike;
  let strikes     = d.strikes;

  if (strikeCnt < 999) {
    const step = strikes.length > 1 ? strikes[1].strike - strikes[0].strike : 50;
    strikes    = strikes.filter(s => Math.abs(s.strike - atm) <= (strikeCnt/2)*step);
  }

  const xl   = strikes.map(s => s.strike);
  const ceOI = strikes.map(s => s.ce_oi);
  const peOI = strikes.map(s => s.pe_oi);

  const traces = [
    { x:xl, y:ceOI, name:'Call OI', type:'bar',
      marker:{ color: xl.map(x => x >= d.spot ? 'rgba(255,68,102,0.85)' : 'rgba(255,68,102,0.4)') },
      hovertemplate:'Strike: %{x}<br>Call OI: %{y:,.0f}<extra></extra>' },
    { x:xl, y:peOI, name:'Put OI',  type:'bar',
      marker:{ color: xl.map(x => x <= d.spot ? 'rgba(0,255,136,0.85)' : 'rgba(0,255,136,0.4)') },
      hovertemplate:'Strike: %{x}<br>Put OI: %{y:,.0f}<extra></extra>' },
  ];

  // Compare mode — animated delta bars
  if (S.chartMode === 'compare' && S.snaps.length > 1 && !S.live) {
    const leftSnap  = await loadSnapDetail(S.leftIdx);
    if (leftSnap && leftSnap.strikes) {
      const leftMap = {};
      leftSnap.strikes.forEach(s => leftMap[s.strike] = s);
      const dCE = strikes.map(s => (s.ce_oi - (leftMap[s.strike]?.ce_oi || s.ce_oi)));
      const dPE = strikes.map(s => (s.pe_oi - (leftMap[s.strike]?.pe_oi || s.pe_oi)));

      // Update compare label
      const lt = S.snaps[S.leftIdx]?.timestamp?.slice(11,16) || '──';
      const rt = S.snaps[S.rightIdx]?.timestamp?.slice(11,16) || '──';
      document.getElementById('compare-range-label').textContent = `${lt} → ${rt}`;

      traces.push({
        x:xl, y:dCE, name:'CE Δ', type:'bar',
        marker:{ color: dCE.map(v => v > 0 ? 'rgba(255,68,102,0.6)':'rgba(255,68,102,0.2)'),
                 line:{ color:'#FF4466', width:1 } },
        yaxis:'y2',
        hovertemplate:'Strike: %{x}<br>CE Change: %{y:+,.0f}<extra></extra>'
      });
      traces.push({
        x:xl, y:dPE, name:'PE Δ', type:'bar',
        marker:{ color: dPE.map(v => v > 0 ? 'rgba(0,255,136,0.6)':'rgba(0,255,136,0.2)'),
                 line:{ color:'#00FF88', width:1 } },
        yaxis:'y2',
        hovertemplate:'Strike: %{x}<br>PE Change: %{y:+,.0f}<extra></extra>'
      });
    }
  } else if (showDelta && S.live) {
    const deltaMin = 15;
    let delta = S.deltaCache[deltaMin] || {};
    if (!Object.keys(delta).length) {
      try {
        const r = await fetch(`/api/delta/${S.sym}/${deltaMin}`);
        delta = await r.json(); S.deltaCache[deltaMin] = delta;
      } catch(e) {}
    }
    const dCE = strikes.map(s => (delta[s.strike]||{}).ce_oi_chg||0);
    const dPE = strikes.map(s => (delta[s.strike]||{}).pe_oi_chg||0);
    if (dCE.some(v=>v!==0) || dPE.some(v=>v!==0)) {
      traces.push({ x:xl,y:dCE,name:'CE Δ15m',type:'bar',
        marker:{color:'rgba(255,68,102,0.4)',line:{color:'#FF4466',width:1}},yaxis:'y2'});
      traces.push({ x:xl,y:dPE,name:'PE Δ15m',type:'bar',
        marker:{color:'rgba(0,255,136,0.4)',line:{color:'#00FF88',width:1}},yaxis:'y2'});
    }
  }

  const layout = {
    paper_bgcolor:'#080C14', plot_bgcolor:'#0D1220',
    font:{ color:'#C8D8F0', family:'JetBrains Mono,monospace', size:10 },
    margin:{ t:8, b:50, l:55, r:55 },
    barmode:'group',
    legend:{ orientation:'h', y:-0.18, font:{size:9} },
    xaxis:{ title:'Strike', tickfont:{size:9}, gridcolor:'#1E2D45', tickangle:-45, color:'#607898' },
    yaxis:{ title:'OI', gridcolor:'#1E2D45', color:'#607898' },
    yaxis2:{ title:'Δ OI', overlaying:'y', side:'right', gridcolor:'rgba(30,45,69,0.3)',
             zeroline:true, zerolinecolor:'#243550', color:'#607898' },
    shapes:[
      { type:'line',x0:d.spot,x1:d.spot,y0:0,y1:1,yref:'paper',
        line:{color:'#FFB830',width:1.5,dash:'dash'} },
      { type:'line',x0:d.max_pain,x1:d.max_pain,y0:0,y1:1,yref:'paper',
        line:{color:'#00D4FF',width:1.5,dash:'dot'} },
    ],
    annotations:[
      { x:d.spot,y:1,yref:'paper',text:'SPOT',showarrow:false,
        font:{color:'#FFB830',size:9},yanchor:'bottom',bgcolor:'#080C14',borderpad:2 },
      { x:d.max_pain,y:0.93,yref:'paper',text:'MAX PAIN',showarrow:false,
        font:{color:'#00D4FF',size:9},yanchor:'bottom',bgcolor:'#080C14',borderpad:2 },
    ],
    transition:{ duration:400, easing:'cubic-in-out' },
  };

  Plotly.react('oi-chart', traces, layout, { responsive:true, displayModeBar:false });
}

// ══ PCR SPARKLINE ══
async function renderPCRSpark() {
  try {
    const ist  = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    const ds   = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
    const res  = await fetch(`/api/snapshots/${S.sym}/${ds}`);
    const snaps = await res.json();
    if (!snaps.length) return;
    const canvas = document.getElementById('pcr-spark-canvas');
    drawSparkline(canvas, snaps.map(s=>s.pcr_total), snaps.map(s=>s.timestamp.slice(11,16)), '#00D4FF');
  } catch(e) {}
}

function drawSparkline(canvas, values, labels, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 220, H = canvas.height;
  canvas.width = W;
  ctx.clearRect(0,0,W,H);
  if (!values.length) return;
  const mn = Math.min(...values)*0.98, mx = Math.max(...values)*1.02;
  const sx = v => (v / (values.length-1)) * W;
  const sy = v => H - ((v-mn)/(mx-mn||1)) * (H-8) - 4;
  ctx.beginPath();
  values.forEach((v,i) => i===0 ? ctx.moveTo(sx(i),sy(v)) : ctx.lineTo(sx(i),sy(v)));
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  // fill
  ctx.lineTo(sx(values.length-1), H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = color.replace(')',',0.1)').replace('rgb','rgba'); ctx.fill();
}

// ══ DATE / SNAPSHOTS ══
async function loadDates() {
  try {
    const res   = await fetch(`/api/dates/${S.sym}`);
    const dates = await res.json();
    const sel   = document.getElementById('date-select');
    sel.innerHTML = dates.map((d,i) =>
      `<option value="${d}"${i===0?' selected':''}>${d}</option>`
    ).join('');
    if (dates.length) await onDateChange();
  } catch(e) {}
}

async function onDateChange() {
  const date = document.getElementById('date-select').value;
  if (!date) return;
  try {
    const res = await fetch(`/api/snapshots/${S.sym}/${date}`);
    S.snaps   = await res.json();
    S.leftIdx  = 0;
    S.rightIdx = S.snaps.length - 1;
    document.getElementById('snap-count').textContent = S.snaps.length + ' snapshots';
    updateHandles();
    drawMinimap();
    if (!S.live) renderFromHandles();
  } catch(e) {}
}

// ══ RANGE HANDLES ══
function updateHandles() {
  const n     = S.snaps.length;
  if (!n) return;
  const track = document.getElementById('range-track');
  const W     = track.offsetWidth;
  const lp    = n > 1 ? (S.leftIdx  / (n-1)) * 100 : 0;
  const rp    = n > 1 ? (S.rightIdx / (n-1)) * 100 : 100;

  document.getElementById('handle-left').style.left  = lp + '%';
  document.getElementById('handle-right').style.left = rp + '%';
  document.getElementById('range-fill').style.left   = lp + '%';
  document.getElementById('range-fill').style.width  = (rp-lp) + '%';

  const lt = S.snaps[S.leftIdx]?.timestamp?.slice(11,16)  || '──:──';
  const rt = S.snaps[S.rightIdx]?.timestamp?.slice(11,16) || '──:──';
  const ft = S.snaps[0]?.timestamp?.slice(11,16)           || '──:──';
  const et = S.snaps[n-1]?.timestamp?.slice(11,16)         || '──:──';

  document.getElementById('ht-left').textContent   = lt;
  document.getElementById('ht-right').textContent  = rt;
  document.getElementById('tl-start').textContent  = ft;
  document.getElementById('tl-end').textContent    = et;
  document.getElementById('tl-current').textContent= rt;
}

function startDrag(side, e) {
  S.dragging = side;
  document.getElementById('handle-' + side).classList.add('dragging');
  e.preventDefault();
}
function stopDrag() {
  if (!S.dragging) return;
  document.getElementById('handle-' + S.dragging)?.classList.remove('dragging');
  S.dragging = null;
  if (!S.live) renderFromHandles();
}
function onDrag(e) {
  if (!S.dragging || !S.snaps.length) return;
  const track  = document.getElementById('range-track');
  const rect   = track.getBoundingClientRect();
  const ratio  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const idx    = Math.round(ratio * (S.snaps.length - 1));
  if (S.dragging === 'left'  && idx < S.rightIdx) S.leftIdx  = idx;
  if (S.dragging === 'right' && idx > S.leftIdx)  S.rightIdx = idx;
  updateHandles();
}

// ══ MINIMAP ══
function drawMinimap() {
  if (!S.snaps.length) return;
  const canvas = document.getElementById('pcr-minimap');
  drawSparkline(canvas, S.snaps.map(s=>s.pcr_total), [], '#00D4FF');
}

// ══ RENDER FROM HANDLES ══
async function renderFromHandles() {
  const snap = await loadSnapDetail(S.rightIdx);
  if (snap) renderAll(snap);
}

async function loadSnapDetail(idx) {
  const snap = S.snaps[idx]; if (!snap) return null;
  const date = document.getElementById('date-select').value;
  const ts   = snap.timestamp?.slice(11,19).replace(/:/g,'-');
  try {
    const res = await fetch(`/api/snapshot_detail/${S.sym}/${date}/${ts}.json`);
    return await res.json();
  } catch(e) { return null; }
}

// ══ PLAY ══
function togglePlay() {
  const btn = document.getElementById('play-btn');
  if (S.playTimer) {
    clearInterval(S.playTimer); S.playTimer = null;
    btn.textContent = '▶'; btn.classList.remove('playing');
  } else {
    const speed = parseInt(document.getElementById('play-speed').value);
    btn.textContent = '⏸'; btn.classList.add('playing');
    S.playTimer = setInterval(async () => {
      if (S.rightIdx >= S.snaps.length - 1) {
        clearInterval(S.playTimer); S.playTimer = null;
        btn.textContent='▶'; btn.classList.remove('playing');
        return;
      }
      S.rightIdx++;
      updateHandles();
      await renderFromHandles();
    }, speed);
  }
}

// ══ UTILS ══
function fmtN(n) { return Number(n).toLocaleString('en-IN',{maximumFractionDigits:0}); }
function fmtOI(n) {
  if (!n && n!==0) return '──';
  const a = Math.abs(n);
  if (a>=10000000) return (n/10000000).toFixed(2)+'Cr';
  if (a>=100000)   return (n/100000).toFixed(2)+'L';
  if (a>=1000)     return (n/1000).toFixed(1)+'K';
  return String(n);
}
function setStatus(msg, loading) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className   = 'status-msg' + (loading ? ' pulsing' : '');
}

// ══ KEYBOARD ══
document.addEventListener('keydown', e => {
  if (S.live) return;
  if (e.key==='ArrowRight' && S.rightIdx < S.snaps.length-1) { S.rightIdx++; updateHandles(); renderFromHandles(); }
  if (e.key==='ArrowLeft'  && S.rightIdx > S.leftIdx)        { S.rightIdx--; updateHandles(); renderFromHandles(); }
  if (e.key===' ')          togglePlay();
});
