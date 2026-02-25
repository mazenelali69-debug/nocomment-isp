import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "../auth";
/**
 * Production-ish Live Traffic dashboard:
 * - parallel fetch, abort on overlap
 * - per-source + total
 * - partial failures tolerated
 * - adaptive polling (backoff on errors)
 * - stale indicator
 */

const BASE_POLL_MS = 1200;
const MAX_POLL_MS = 8000;
const JITTER_MS = 250;
const N = 120;

// The sources you want to SUM
const SOURCES = [
  { key: "sw1", title: "TP-Link Switch 1", ip: "88.88.88.254", ifIndex: 49179 },
  { key: "sw2", title: "TP-Link Switch 2", ip: "10.88.88.254", ifIndex: 49162 },
];

// ---------- utils ----------
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "--";
  const x = Number(n);
  if (!isFinite(x)) return "--";
  if (x >= 1000) return x.toFixed(0);
  if (x >= 100) return x.toFixed(1);
  return x.toFixed(2);
}
function safeNum(v) {
  const x = Number(v);
  return isFinite(x) ? x : null;
}
function avg(values) {
  const xs = (values || []).filter((v) => typeof v === "number" && isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function maxv(values) {
  const xs = (values || []).filter((v) => typeof v === "number" && isFinite(v));
  if (!xs.length) return null;
  return Math.max(...xs);
}
function lastNum(values) {
  for (let i = (values?.length || 0) - 1; i >= 0; i--) {
    const v = values[i];
    if (typeof v === "number" && isFinite(v)) return v;
  }
  return null;
}
function pushN(prev, v, n = N) {
  const next = [...(prev || []), v];
  return next.length > n ? next.slice(next.length - n) : next;
}
function msAgo(ts) {
  if (!ts) return null;
  return Date.now() - ts;
}
function humanMs(ms) {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Spark({ values }) {
  const w = 520;
  const h = 140;
  const pad = 10;

  const ys = (values || []).map((v) => (typeof v === "number" && isFinite(v) ? v : null));
  const vals = ys.filter((v) => v != null);
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1e-6, max - min);

  const points = ys.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, ys.length - 1);
    const vv = v == null ? min : v;
    const y = pad + (h - pad * 2) * (1 - (vv - min) / span);
    return { i, x, y, v };
  });

  const pts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baseY = h - pad;
  const areaPts =
    pts +
    ` ${points[points.length - 1].x.toFixed(1)},${baseY.toFixed(1)} ${points[0].x.toFixed(1)},${baseY.toFixed(1)}`;

  // Hover state
  const [hover, setHover] = useState(null); // { idx, x, y, v }

  function nearestIndex(xSvg) {
    const n = points.length;
    if (n <= 1) return 0;
    const step = (w - pad * 2) / (n - 1);
    const raw = Math.round((xSvg - pad) / Math.max(1e-6, step));
    return Math.max(0, Math.min(n - 1, raw));
  }

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const xSvg = ((e.clientX - r.left) / Math.max(1, r.width)) * w;
    const idx = nearestIndex(xSvg);
    const p = points[idx];
    if (!p) return;
    setHover({ idx, x: p.x, y: p.y, v: p.v });
  }

  function onLeave() {
    setHover(null);
  }

  const hv = hover && typeof hover.v === "number" && isFinite(hover.v) ? hover.v : null;
  const label = hv == null ? "--" : `${fmt(hv)} Mbps`;

  // Tooltip positioning inside SVG
  const tipW = 118;
  const tipH = 28;
  const tipPad = 10;

  let tipX = hover ? hover.x + 14 : pad;
  let tipY = hover ? hover.y - 36 : pad;

  // clamp tooltip
  if (tipX + tipW > w - pad) tipX = (hover ? hover.x : pad) - tipW - 14;
  tipX = Math.max(pad, Math.min(w - pad - tipW, tipX));
  tipY = Math.max(pad, Math.min(h - pad - tipH, tipY));

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ ...s.spark, cursor: "crosshair" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <defs>
        {/* neon glow */}
        <filter id="sparkGlow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="4.2" result="blur1" />
          <feColorMatrix
            in="blur1"
            type="matrix"
            values="
              0 0 0 0 0
              0 0 0 0 0.80
              0 0 0 0 1
              0 0 0 0.95 0"
            result="glowBlue"
          />
          <feGaussianBlur in="glowBlue" stdDeviation="7.5" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="glowBlue" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* gradient stroke */}
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(0,180,255,0.92)" />
          <stop offset="55%" stopColor="rgba(0,255,220,0.95)" />
          <stop offset="100%" stopColor="rgba(90,255,255,0.98)" />
        </linearGradient>

        {/* area fill gradient */}
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,220,255,0.18)" />
          <stop offset="100%" stopColor="rgba(0,220,255,0.00)" />
        </linearGradient>
      </defs>

      {/* area */}
      <polyline points={areaPts} fill="url(#sparkFill)" stroke="none" />

      {/* fat glow base */}
      <polyline
        points={pts}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth="8"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.28"
        filter="url(#sparkGlow)"
      />

      {/* crisp line */}
      <polyline
        points={pts}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth="4.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter="url(#sparkGlow)"
      />

      {/* hover dot + tooltip */}
      {hover ? (
        <g>
          {/* dot glow */}
          <circle cx={hover.x} cy={hover.y} r="8" fill="rgba(0,220,255,0.22)" filter="url(#sparkGlow)" />
          {/* dot core */}
          <circle cx={hover.x} cy={hover.y} r="4.2" fill="rgba(255,255,255,0.92)" />

          {/* tooltip */}
          <g transform={`translate(${tipX},${tipY})`}>
            <rect
              x="0"
              y="0"
              width={tipW}
              height={tipH}
              rx="10"
              ry="10"
              fill="rgba(2,6,23,0.92)"
              stroke="rgba(255,255,255,0.14)"
            />
            <text
              x={tipW / 2}
              y={18}
              textAnchor="middle"
              fontSize="12"
              fontWeight="900"
              fill="rgba(226,232,240,0.95)"
              style={{ userSelect: "none" }}
            >
              {label}
            </text>
          </g>
        </g>
      ) : null}

      {/* frame */}
      <rect
        x="0.5"
        y="0.5"
        width={w - 1}
        height={h - 1}
        rx="18"
        ry="18"
        fill="none"
        stroke="rgba(255,255,255,0.10)"
      />
    </svg>
  );
}// ---------- main ----------
function LiveTrafficAviatInner() {
  const token = getToken();

  const headers = useMemo(() => {
    const h = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  const [authError, setAuthError] = useState(null);
  const [paused, setPaused] = useState(false);

// Dock sidebar toggle (persisted)
const [dock, setDock] = useState(() => {
  try { return localStorage.getItem("lt_dock") === "1"; } catch { return false; }
});
useEffect(() => {
  try { localStorage.setItem("lt_dock", dock ? "1" : "0"); } catch {}
}, [dock]);

  // per source state
  const [byKey, setByKey] = useState(() => {
    const init = {};
    for (const s of SOURCES) {
      init[s.key] = {
        title: s.title,
        ip: s.ip,
        ifIndex: s.ifIndex,
        series: [],
        lastOkAt: null,
        lastErrAt: null,
        lastErr: null,
        lastRx: null,
        lastTx: null,
        lastTotal: null,
        rttMs: null,
      };
    }
    return init;
  });

  // total series (sum of sources)
  const [totalSeries, setTotalSeries] = useState([]);
  const [lastTickAt, setLastTickAt] = useState(null);
  const [lastTickLabel, setLastTickLabel] = useState("");

  // adaptive polling
  const [pollMs, setPollMs] = useState(BASE_POLL_MS);

  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);

  function endpoint() {
    return `${window.location.protocol}//${window.location.hostname}:8080/mikrotik/traffic-rate`;
  }

  async function fetchOne(src, signal) {
    const t0 = performance.now();

    const res = await fetch(endpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({ ip: src.ip, ifIndex: src.ifIndex ?? 5 }),
      signal,
    });

    if (res.status === 401 || res.status === 403) {
      const msg = "Invalid token. Please login again.";
      setAuthError(msg);
      throw new Error(msg);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || `Failed (${res.status})`);

    const rxVal = data.rx_mbps ?? data.rx ?? data.rxMbps ?? data.rx_rate ?? data.RX ?? null;
    const txVal = data.tx_mbps ?? data.tx ?? data.txMbps ?? data.tx_rate ?? data.TX ?? null;

    const rx = safeNum(rxVal) ?? 0;
    const tx = safeNum(txVal) ?? 0;

    const rttMs = Math.round(performance.now() - t0);
    return { ok: true, rx, tx, total: rx + tx, rttMs };
  }

  async function tick() {
    if (paused) return;
    if (inFlightRef.current) return;
    if (authError) return;

    inFlightRef.current = true;

    // abort any previous (extra safety)
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    abortRef.current = new AbortController();

    const now = Date.now();
    const start = performance.now();

    try {
      // settled => partial failures tolerated
      const settled = await Promise.allSettled(SOURCES.map((s) => fetchOne(s, abortRef.current.signal)));

      // update per-source
      setByKey((prev) => {
        const next = { ...prev };
        settled.forEach((r, idx) => {
          const src = SOURCES[idx];
          const cur = next[src.key] || {};
          if (r.status === "fulfilled") {
            const o = r.value;
            next[src.key] = {
              ...cur,
              title: src.title,
              ip: src.ip,
              ifIndex: src.ifIndex,
              series: pushN(cur.series, o.total, N),
              lastOkAt: now,
              lastErr: null,
              lastRx: o.rx,
              lastTx: o.tx,
              lastTotal: o.total,
              rttMs: o.rttMs,
            };
          } else {
            const msg = r.reason?.message || "Error";
            next[src.key] = {
              ...cur,
              title: src.title,
              ip: src.ip,
              ifIndex: src.ifIndex,
              lastErrAt: now,
              lastErr: msg,
            };
          }
        });
        return next;
      });

      // compute total from successful sources only (partial success is fine)
      const totals = settled
        .map((r) => (r.status === "fulfilled" ? r.value.total : null))
        .filter((v) => typeof v === "number" && isFinite(v));
      const total = totals.length ? totals.reduce((a, b) => a + b, 0) : null;

      if (total != null) setTotalSeries((prev) => pushN(prev, total, N));

      setLastTickAt(now);
      setLastTickLabel(new Date(now).toLocaleTimeString());

      // if at least one ok => recover poll
      if (totals.length) {
        setPollMs((p) => clamp(Math.floor(p * 0.85), BASE_POLL_MS, MAX_POLL_MS));
      } else {
        // all failed => backoff
        setPollMs((p) => clamp(Math.floor(p * 1.35) + 250, BASE_POLL_MS, MAX_POLL_MS));
      }

      const elapsed = Math.round(performance.now() - start);
      // optional: could show elapsed somewhere; kept minimal

    } catch (e) {
      // fetch aborted counts as "ignore"
      if (e?.name !== "AbortError") {
        setPollMs((p) => clamp(Math.floor(p * 1.35) + 250, BASE_POLL_MS, MAX_POLL_MS));
      }
      setLastTickAt(now);
      setLastTickLabel(new Date(now).toLocaleTimeString());
    } finally {
      inFlightRef.current = false;
    }
  }

  // timer that respects adaptive poll + jitter
  useEffect(() => {
    setAuthError(null);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    let stopped = false;

    const loop = async () => {
      if (stopped) return;
      await tick();
      if (stopped) return;

      const jitter = Math.floor(Math.random() * JITTER_MS);
      const wait = pollMs + jitter;

      timerRef.current = setTimeout(loop, wait);
    };

    loop();

    return () => {
      stopped = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pollMs, paused]);

  const totalNow = lastNum(totalSeries);
  const totalAvg = avg(totalSeries);
  const totalMax = maxv(totalSeries);

  const staleMs = msAgo(lastTickAt);
  const isStale = staleMs != null && staleMs > Math.max(4000, pollMs * 3);

  const sourceCards = SOURCES.map((src) => {
    const st = byKey[src.key];
    const now = st?.lastTotal;
    const a = avg(st?.series);
    const m = maxv(st?.series);
    const okAgo = msAgo(st?.lastOkAt);
    const down = okAgo != null && okAgo > Math.max(4000, pollMs * 4);

    return (
      <div key={src.key} style={s.smallCard}>
        <div style={s.smallHead}>
          <div>
            <div style={s.smallTitle}>{st?.title || src.title}</div>
            <div style={s.smallSub}>{src.ip} • ifIndex {src.ifIndex}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {down ? <div style={s.badgeDown}>DOWN</div> : <div style={s.badgeUp}>OK</div>}
            <div style={s.rtt}>{st?.rttMs != null ? `${st.rttMs}ms` : "--"}</div>
          </div>
        </div>

        <div style={s.smallMetrics}>
          <div style={s.mm}>
            <div style={s.mk}>Now</div>
            <div style={s.mv}>{now == null ? "--" : `${fmt(now)} Mbps`}</div>
          </div>
          <div style={s.mm}>
            <div style={s.mk}>Avg</div>
            <div style={s.mv}>{a == null ? "--" : `${fmt(a)} Mbps`}</div>
          </div>
          <div style={s.mm}>
            <div style={s.mk}>Peak</div>
            <div style={s.mv}>{m == null ? "--" : `${fmt(m)} Mbps`}</div>
          </div>
          <div style={s.mm2}>
            <div style={s.mk}>RX / TX</div>
            <div style={s.mv2}>
              {st?.lastRx == null ? "--" : fmt(st.lastRx)} / {st?.lastTx == null ? "--" : fmt(st.lastTx)} Mbps
            </div>
          </div>
        </div>

        <div style={s.smallGraph}>
          <Spark values={st?.series || []} />
          {!st?.series?.length ? <div style={s.graphHint}>Waiting…</div> : null}
        </div>

        {st?.lastErr ? <div style={s.errSmall}>API: {st.lastErr}</div> : null}
      </div>
    );
  });

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <div style={s.topBar}>
          <div>
            <div style={s.h1}>Live Traffic Aviat</div>
            <div style={s.h2}>
              Total = sum of sources • adaptive poll {Math.round(pollMs / 100) / 10}s • window N={N}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isStale ? <div style={s.badgeStale}>STALE {humanMs(staleMs)}</div> : null}

            <button
              onClick={() => setPaused((p) => !p)}
              style={paused ? s.btnOff : s.btnOn}
              title="Pause/Resume polling"
            >
              {paused ? "RESUME" : "PAUSE"}
            </button>
<button
  onClick={() => setDock((d) => !d)}
  style={dock ? s.btnDockOn : s.btnDockOff}
  title="Dock the live panel to sidebar"
>
  {dock ? "UNDOCK" : "DOCK"}
</button>

            <div style={s.pill}><span style={s.pillDot} /> LIVE</div>
          </div>
        </div>

        {authError ? (
          <div style={s.banner}>
            <div style={s.bannerTitle}>AUTH REQUIRED</div>
            <div style={s.bannerText}>{authError}</div>
          </div>
        ) : null}

        {/* TOTAL */}
        <div style={s.card}>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>TOTAL TRAFFIC</div>
              <div style={s.cardSub}>RX+TX summed across switches (partial failures tolerated)</div>
            </div>
            <div style={s.metrics}>
              <div style={s.m}>
                <div style={s.mk}>Now</div>
                <div style={s.mv}>{totalNow == null ? "--" : `${fmt(totalNow)} Mbps`}</div>
              </div>
              <div style={s.m}>
                <div style={s.mk}>Avg</div>
                <div style={s.mv}>{totalAvg == null ? "--" : `${fmt(totalAvg)} Mbps`}</div>
              </div>
              <div style={s.m}>
                <div style={s.mk}>Peak</div>
                <div style={s.mv}>{totalMax == null ? "--" : `${fmt(totalMax)} Mbps`}</div>
              </div>
              <div style={s.m2}>
                <div style={s.mk}>Last tick</div>
                <div style={s.mv2}>{lastTickLabel || "-"}</div>
              </div>
            </div>
          </div>

          <div style={s.graphBox}>
            <Spark values={totalSeries} />
            {!totalSeries?.length ? <div style={s.graphHint}>Waiting for samples…</div> : null}
          </div>
        </div>

        {/* PER SOURCE */}
        <div style={s.grid}>
          {sourceCards}
              {/* DOCKED SIDEBAR */}
      {dock ? (
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div>
              <div style={s.sidebarTitle}>DOCKED LIVE</div>
              <div style={s.sidebarSub}>Total Traffic • hover on chart</div>
            </div>
            <div style={s.sidebarPill}><span style={s.sidebarDot} /> LIVE</div>
          </div>

          <div style={s.sidebarCard}>
            <div style={s.sidebarMetrics}>
              <div style={s.sm}>
                <div style={s.mk}>Now</div>
                <div style={s.mv}>{totalNow == null ? "--" : `${fmt(totalNow)} Mbps`}</div>
              </div>
              <div style={s.sm}>
                <div style={s.mk}>Avg</div>
                <div style={s.mv}>{totalAvg == null ? "--" : `${fmt(totalAvg)} Mbps`}</div>
              </div>
              <div style={s.sm}>
                <div style={s.mk}>Peak</div>
                <div style={s.mv}>{totalMax == null ? "--" : `${fmt(totalMax)} Mbps`}</div>
              </div>
              <div style={s.sm2}>
                <div style={s.mk}>Last</div>
                <div style={s.mv2}>{lastTickLabel || "-"}</div>
              </div>
            </div>

            <div style={s.sidebarGraph}>
              <Spark values={totalSeries} />
              {!totalSeries?.length ? <div style={s.graphHint}>Waiting…</div> : null}
            </div>

            <div style={s.sidebarHint}>
              Tip: hover over the line to see Mbps (we can add full tooltip next).
            </div>
          </div>

          <div style={s.sidebarMiniGrid}>
            {SOURCES.map((src) => {
              const st = byKey[src.key];
              const down = st?.lastOkAt && (Date.now() - st.lastOkAt) > Math.max(4000, pollMs * 4);
              return (
                <div key={src.key} style={s.sidebarMini}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 950, fontSize: 12 }}>{src.title}</div>
                    <div style={down ? s.badgeDown : s.badgeUp}>{down ? "DOWN" : "OK"}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(226,232,240,0.85)" }}>
                    {st?.lastTotal == null ? "--" : `${fmt(st.lastTotal)} Mbps`} • {st?.rttMs != null ? `${st.rttMs}ms` : "--"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
</div>
      </div>
    </div>
  );
}

const dock = false;

const s = {
  page: {
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(59,130,246,0.18), transparent 60%)," +
      "radial-gradient(900px 500px at 80% 20%, rgba(34,197,94,0.10), transparent 60%)," +
      "linear-gradient(135deg,#020617,#0b1220)",
    padding: 16, paddingRight: dock ? 392 : 16,
    boxSizing: "border-box",
    fontFamily: "system-ui",
    color: "white",
  },
  inner: {
    height: "100%",
    maxWidth: 1240,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
  },

  topBar: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  h1: { fontSize: 22, fontWeight: 950, letterSpacing: 0.2 },
  h2: { marginTop: 6, fontSize: 12, color: "rgba(226,232,240,0.70)", fontWeight: 800 },

  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    fontWeight: 900,
    letterSpacing: 0.4,
    fontSize: 12,
    backdropFilter: "blur(8px)",
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(34,197,94,1)",
    boxShadow: "0 0 16px rgba(34,197,94,0.9)",
    display: "inline-block",
  },

  btnOn: {
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(59,130,246,0.18)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 950,
    letterSpacing: 0.35,
    fontSize: 12,
  },
  btnOff: {
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(239,68,68,0.18)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 950,
    letterSpacing: 0.35,
    fontSize: 12,
  },

  btnDockOff: {
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,255,220,0.10)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 950,
    letterSpacing: 0.35,
    fontSize: 12,
  },
  btnDockOn: {
    cursor: "pointer",
    borderRadius: 12,
    padding: "8px 12px",
    border: "1px solid rgba(0,255,220,0.28)",
    background: "rgba(0,255,220,0.18)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 950,
    letterSpacing: 0.35,
    fontSize: 12,
    boxShadow: "0 0 18px rgba(0,255,220,0.20)",
  },

  sidebar: {
    position: "fixed",
    top: 16,
    right: 16,
    bottom: 16,
    width: 360,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(15,23,42,0.78), rgba(2,6,23,0.86))",
    boxShadow: "0 18px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
    padding: 14,
    overflow: "auto",
    zIndex: 50,
    backdropFilter: "blur(10px)",
  },
  sidebarHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sidebarTitle: { fontSize: 12, fontWeight: 950, letterSpacing: 0.5, color: "rgba(226,232,240,0.95)" },
  sidebarSub: { marginTop: 4, fontSize: 12, fontWeight: 800, color: "rgba(226,232,240,0.70)" },
  sidebarPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    fontWeight: 900,
    fontSize: 12,
  },
  sidebarDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(34,197,94,1)",
    boxShadow: "0 0 16px rgba(34,197,94,0.9)",
    display: "inline-block",
  },

  sidebarCard: {
    marginTop: 12,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  sidebarMetrics: { display: "flex", gap: 10, flexWrap: "wrap" },
  sm: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    minWidth: 120,
  },
  sm2: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    minWidth: 140,
  },
  sidebarGraph: {
    marginTop: 10,
    borderRadius: 18,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.20)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 170,
    position: "relative",
  },
  sidebarHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 850,
    color: "rgba(226,232,240,0.70)",
  },

  sidebarMiniGrid: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 },
  sidebarMini: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
  },

  badgeStale: {
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(245,158,11,0.35)",
    background: "rgba(245,158,11,0.12)",
    color: "rgba(253,230,138,0.95)",
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.35,
  },

  banner: {
    borderRadius: 16,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.10)",
    padding: "10px 12px",
  },
  bannerTitle: { fontWeight: 950, letterSpacing: 0.4, fontSize: 12, color: "rgba(254,202,202,0.98)" },
  bannerText: { marginTop: 4, fontWeight: 850, fontSize: 12, color: "rgba(254,202,202,0.92)" },

  card: {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(2,6,23,0.82))",
    boxShadow: "0 18px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
    overflow: "hidden",
    padding: 14,
  },
  cardHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: 950, letterSpacing: 0.3 },
  cardSub: { marginTop: 6, fontSize: 12, fontWeight: 800, color: "rgba(226,232,240,0.70)" },

  metrics: { display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" },
  m: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    minWidth: 120,
  },
  m2: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    minWidth: 140,
  },
  mk: { fontSize: 11, fontWeight: 900, color: "rgba(148,163,184,0.95)", letterSpacing: 0.35 },
  mv: { marginTop: 6, fontSize: 16, fontWeight: 950 },
  mv2: { marginTop: 6, fontSize: 13, fontWeight: 950, color: "rgba(226,232,240,0.90)" },

  graphBox: {
    marginTop: 8,
    borderRadius: 20,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 190,
    position: "relative",
  },
  graphHint: {
    position: "absolute",
    bottom: 12,
    left: 16,
    fontSize: 12,
    fontWeight: 850,
    color: "rgba(226,232,240,0.70)",
  },
  spark: { display: "block", opacity: 0.98 },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    minHeight: 0,
  },

  smallCard: {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(180deg, rgba(15,23,42,0.70), rgba(2,6,23,0.70))",
    boxShadow: "0 14px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
    overflow: "hidden",
    padding: 14,
  },
  smallHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  smallTitle: { fontSize: 13, fontWeight: 950, letterSpacing: 0.25 },
  smallSub: { marginTop: 6, fontSize: 12, fontWeight: 800, color: "rgba(226,232,240,0.70)" },

  badgeUp: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(34,197,94,0.30)",
    background: "rgba(34,197,94,0.10)",
    color: "rgba(187,247,208,0.95)",
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.35,
  },
  badgeDown: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(239,68,68,0.30)",
    background: "rgba(239,68,68,0.10)",
    color: "rgba(254,202,202,0.95)",
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.35,
  },
  rtt: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(226,232,240,0.92)",
    fontWeight: 900,
    fontSize: 12,
  },

  smallMetrics: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 },
  mm: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    minWidth: 120,
  },
  mm2: {
    borderRadius: 16,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    minWidth: 210,
    flex: "1 1 auto",
  },

  smallGraph: {
    marginTop: 10,
    borderRadius: 20,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 170,
    position: "relative",
  },

  errSmall: {
    marginTop: 10,
    padding: 10,
    borderRadius: 16,
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.28)",
    color: "rgba(254,202,202,0.95)",
    fontSize: 12,
    fontWeight: 850,
  },
};







export default function LiveTrafficAviatPage(){
  return (
    <>
      <LiveTrafficAviatInner />
    </>
  );
}










