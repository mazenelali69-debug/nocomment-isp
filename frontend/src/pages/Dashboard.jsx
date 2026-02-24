import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { clearToken } from "../auth";

const INTERVAL_MS = 5000;
const HISTORY_MAX = 60;
const WINDOW_STATS = 20;

function fmtMs(ms){ return (ms == null || !Number.isFinite(ms)) ? "" : String(Math.round(ms)); }
function stddev(arr){
  const xs = arr.filter(n => Number.isFinite(n));
  if(xs.length < 2) return 0;
  const mean = xs.reduce((a,b)=>a+b,0)/xs.length;
  const v = xs.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(xs.length-1);
  return Math.sqrt(v);
}
function lossPct(samples){
  if(!samples.length) return 0;
  const downs = samples.filter(s => s && s.up === false).length;
  return (downs / samples.length) * 100;
}

function Sparkline({ points, height=26 }) {
  const w = 140, h = height, pad = 2;
  const vals = points.map(v => (Number.isFinite(v) ? v : null));
  const finite = vals.filter(v => v != null);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const span = Math.max(1, max - min);
  const step = w / Math.max(1, points.length - 1);

  let d = "";
  for(let i=0;i<vals.length;i++){
    const v = vals[i];
    if(v == null) continue;
    const x = i * step;
    const y = pad + (h - pad*2) * (1 - ((v - min) / span));
    d += (d ? " L " : "M ") + x.toFixed(2) + " " + y.toFixed(2);
  }
  const baseY = h - pad;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:"block" }}>
      <path d={`M 0 ${baseY} L ${w} ${baseY}`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" fill="none" />
      {d ? (
        <path d={d} stroke="rgba(59,130,246,0.95)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}


function DotSpark({ points, height=44, labelLast=true }) {
  const w = 520, h = height, pad = 8;
  const vals = points.map(v => (Number.isFinite(v) ? v : null));
  const finite = vals.filter(v => v != null);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const span = Math.max(1, max - min);
  const step = w / Math.max(1, points.length - 1);

  let d = "";
  let lastIdx = -1;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) continue;
    lastIdx = i;
    const x = i * step;
    const y = pad + (h - pad * 2) * (1 - ((v - min) / span));
    d += (d ? " L " : "M ") + x.toFixed(2) + " " + y.toFixed(2);
  }

  const lastV = (lastIdx >= 0) ? vals[lastIdx] : null;
  const lastX = (lastIdx >= 0) ? lastIdx * step : 0;
  const lastY = (lastIdx >= 0 && lastV != null)
    ? (pad + (h - pad * 2) * (1 - ((lastV - min) / span)))
    : (h - pad);

  // limit dots to last ~18 points to keep it clean
  const start = Math.max(0, vals.length - 18);

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={`M 0 ${h - pad} L ${w} ${h - pad}`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" fill="none" />
      {d ? (
        <>
          <path
            d={d}
            stroke="rgba(34,211,238,0.95)"
            strokeWidth="2"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="6 7"
          />
          {vals.slice(start).map((v, j) => {
            const i = start + j;
            if (v == null) return null;
            const x = i * step;
            const y = pad + (h - pad * 2) * (1 - ((v - min) / span));
            return (
              <circle key={i} cx={x} cy={y} r="2.6" fill="rgba(168,85,247,0.95)" opacity="0.95" />
            );
          })}
          {labelLast && lastV != null ? (
            <>
              <circle cx={lastX} cy={lastY} r="4.2" fill="rgba(34,211,238,0.95)" />
              <text
                x={Math.min(w - 6, lastX + 10)}
                y={Math.max(12, lastY - 10)}
                fill="rgba(229,246,255,0.95)"
                fontSize="12"
                fontWeight="900"
              >
                {Math.round(lastV)} ms
              </text>
            </>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

function Badge({ children, tone="neutral" }) {
  const bg = tone==="good" ? "rgba(34,197,94,0.14)"
          : tone==="bad" ? "rgba(239,68,68,0.14)"
          : tone==="warn" ? "rgba(245,158,11,0.14)"
          : "rgba(255,255,255,0.08)";
  const bd = tone==="good" ? "rgba(34,197,94,0.28)"
          : tone==="bad" ? "rgba(239,68,68,0.28)"
          : tone==="warn" ? "rgba(245,158,11,0.28)"
          : "rgba(255,255,255,0.14)";
  return <span style={{ ...s.badge, background:bg, borderColor:bd }}>{children}</span>;
}


function Dial({ label, value, sub, tone="neutral" }) {
  const c =
    tone==="good" ? "rgba(34,197,94,0.95)" :
    tone==="bad"  ? "rgba(239,68,68,0.95)" :
    tone==="warn" ? "rgba(245,158,11,0.95)" :
    "rgba(34,211,238,0.95)";

  const id = label.replace(/\s+/g, "_").toLowerCase();

  return (
    <div style={s.dial}>
      <svg width="144" height="144" viewBox="0 0 144 144" style={s.dialSvg} aria-hidden="true">
        <defs>
          <linearGradient id={`grad_${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(34,211,238,0.95)" />
            <stop offset="1" stopColor="rgba(168,85,247,0.95)" />
          </linearGradient>
          <filter id={`glow_${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <circle cx="72" cy="72" r="54" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" />

        {/* rotating turbo segment */}
        <circle
          cx="72"
          cy="72"
          r="54"
          fill="none"
          stroke={`url(#grad_${id})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="46 294"
          filter={`url(#glow_${id})`}
          opacity="0.95"
        >
          <animate attributeName="stroke-dashoffset" values="0;340" dur="1.9s" repeatCount="indefinite" />
        </circle>

        {/* status ring tint */}
        <circle cx="72" cy="72" r="54" fill="none" stroke={c} strokeWidth="2" opacity="0.35" />
      </svg>

      <div style={s.dialInner}>
        <div style={s.dialLabel}>{label}</div>
        <div style={s.dialValue}>{value}</div>
        <div style={s.dialSub}>{sub}</div>
      </div>
    </div>
  );
}
export default function Dashboard() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const targets = useMemo(() => ([
    { key: "ggc", name: "Google Cache (GGC)", ip: "185.89.85.162" },
    { key: "fna", name: "Facebook CDN (FNA)", ip: "185.22.34.15" },
    { key: "tt",  name: "TikTok CDN", ip: "185.89.87.89" },
    { key: "aka", name: "Akamai CDN", ip: "185.89.87.74" },
  ]), []);

  const [hist, setHist] = useState(() => {
    const o = {};
    for (const t of targets) o[t.key] = [];
    return o;
  });

  const [pinging, setPinging] = useState(false);
  const timerRef = useRef(null);

  async function loadMe() {
    setErr("");
    setLoading(true);
    try {
      const data = await apiFetch("/me");
      setMe(data.user);
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function pingOnce(t) {
    try {
      const out = await apiFetch("/ping", { method: "POST", body: JSON.stringify({ ip: t.ip }) });
      return { ts: Date.now(), up: !!out?.up, ms: (typeof out?.ms === "number" ? out.ms : null) };
    } catch (e) {
      return { ts: Date.now(), up: false, ms: null };
    }
  }

  async function tick() {
    setPinging(true);
    const results = await Promise.all(targets.map(async (t) => ({ key: t.key, r: await pingOnce(t) })));
    setHist(prev => {
      const n = { ...prev };
      for (const { key, r } of results) {
        const arr = Array.isArray(n[key]) ? n[key].slice() : [];
        arr.push(r);
        while (arr.length > HISTORY_MAX) arr.shift();
        n[key] = arr;
      }
      return n;
    });
    setPinging(false);
  }

  function startAuto() {
    if (timerRef.current) return;
    timerRef.current = setInterval(tick, INTERVAL_MS);
  }
  function stopAuto() {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function logout() {
    clearToken();
    nav("/login", { replace: true });
  }

  useEffect(() => { loadMe(); }, []);
  useEffect(() => {
    tick();
    startAuto();
    return () => stopAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={s.page}>
<div style={s.top}>
        <div>
          <div style={s.title}>NOC Dashboard</div>
          <div style={s.sub}>NoComment  2026</div>
        </div>

        <div style={s.topRight}>
          <button onClick={() => nav("/users")} style={s.btnGhost}>Users</button>
          <button onClick={() => nav("/live-ping")} style={s.btnGhost}>Live Ping</button>
          <button onClick={logout} style={s.btnDanger}>Logout</button>
        </div>
      </div>

      <div style={s.grid}>
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <div style={s.panelTitle}>Session</div>
            <div style={s.panelActions}>
              <button onClick={loadMe} style={s.btnSoft}>Refresh User</button>
              <button onClick={tick} style={s.btnPrimary}>{pinging ? "Refreshing" : "Refresh Now"}</button>
              <Badge tone={timerRef.current ? "good" : "warn"}>{timerRef.current ? "AUTO ON" : "AUTO OFF"}</Badge>
              <button onClick={() => (timerRef.current ? stopAuto() : startAuto())} style={s.btnSoft}>
                {timerRef.current ? "Stop Auto" : "Start Auto"}
              </button>
            </div>
          </div>

          <div style={s.panelBody}>
  {loading && <div style={s.dim}>Loading user</div>}
  {err && <div style={s.err}>{err}</div>}
  {!loading && !err && (
    <>
      <div style={s.sessionGrid}>
  <Dial label="USER" value={me?.username ?? "-"} sub="Authenticated session" />
  <Dial label="ROLE" value={me?.role ?? "-"} sub="Access level" />
  <Dial label="USER ID" value={me?.id ?? "-"} sub="Internal identifier" />
  <Dial label="AUTO" value={timerRef.current ? "ON" : "OFF"} sub="Scheduler state" tone={timerRef.current ? "good" : "warn"} />
  <Dial label="INTERVAL" value={`${INTERVAL_MS/1000}s`} sub="Refresh cadence" />
  <Dial label="WINDOW" value={WINDOW_STATS} sub="Samples per calc" />
</div>
<div style={s.sessionPulse}>
        <div style={s.sessionPulseTop}>
          <div>
            <div style={s.sessionPulseTitle}>PULSE</div>
            <div style={s.sessionPulseSub}>Sparkline (GGC latency)</div>
          </div>
          <div style={s.sessionPulseChip}>{(hist?.ggc?.length ?? 0)}/{HISTORY_MAX}</div>
        </div>
        <div style={s.sessionPulseGraph}>
          <DotSpark points={(hist.ggc || []).map(x => (x && x.up ? x.ms : null))} height={44} />
        </div>
      </div>
    </>
  )}

  <div style={s.panelHint}>
    Loss/Jitter are computed from last {WINDOW_STATS} frontend samples (no backend changes).
  </div>
</div>
        </div>

        <div style={s.panelWide}>
          <div style={s.panelHeader}>
            <div>
              <div style={s.panelTitle}>CDN Health</div>
              <div style={s.panelSub}>Loss + Jitter + sparkline history</div>
            </div>
          </div>

          <div style={s.tiles}>
            {targets.map(t => {
              const h = hist[t.key] || [];
              const last = h.length ? h[h.length - 1] : null;

              const win = h.slice(-WINDOW_STATS);
              const msWin = win.filter(x => x && x.up && Number.isFinite(x.ms)).map(x => x.ms);
              const jitter = stddev(msWin);
              const loss = lossPct(win);

              const tone =
                last == null ? "neutral" :
                last.up ? (loss > 10 ? "warn" : "good") : "bad";

              const big = last?.up ? `${fmtMs(last?.ms)} ms` : (last ? "DOWN" : "");
              const sparkPoints = h.map(x => (x && x.up ? x.ms : null));

              return (
                <div key={t.key} style={s.tile} onClick={() => nav("/live-ping")}>
                  <div style={s.tileTop}>
                    <div>
                      <div style={s.tileName}>{t.name}</div>
                      <div style={s.tileIp}>{t.ip}</div>
                    </div>
                    <Badge tone={tone}>{last == null ? "NO DATA" : (last.up ? "UP" : "DOWN")}</Badge>
                  </div>

                  <div style={s.big}>{big}</div>

                  <div style={s.metaRow}>
                    <div style={s.metaBox}><div style={s.metaK}>Loss</div><div style={s.metaV}>{loss.toFixed(1)}%</div></div>
                    <div style={s.metaBox}><div style={s.metaK}>Jitter</div><div style={s.metaV}>{Math.round(jitter)} ms</div></div>
                    <div style={s.metaBox}><div style={s.metaK}>Samples</div><div style={s.metaV}>{win.length}/{WINDOW_STATS}</div></div>
                  </div>

                  <div style={s.sparkWrap}><Sparkline points={sparkPoints} /></div>

                  <div style={s.timeRow}>
                    <span style={s.timeDim}>Last:</span>{" "}
                    <span style={s.timeVal}>{last?.ts ? new Date(last.ts).toLocaleTimeString() : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    padding: 22,
    color: "#e5f6ff",
    background: `
      radial-gradient(1200px 600px at 10% -10%, rgba(0,255,255,0.25), transparent 60%),
      radial-gradient(900px 500px at 90% 0%, rgba(168,85,247,0.25), transparent 60%),
      linear-gradient(180deg, #05060a, #02030a)
    `,
    fontFamily: "Inter, ui-sans-serif, system-ui, Segoe UI, Roboto"
  },

  top: { maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" },
  topRight: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },

  title: {
    fontSize: 34,
    fontWeight: 1000,
    letterSpacing: 1,
    background: "linear-gradient(90deg,#22d3ee,#a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  sub: { marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.55)" },

  grid: { maxWidth: 1280, margin: "20px auto 0", display: "grid", gap: 18 },

  panel: {
    borderRadius: 22,
    background: "rgba(8,12,24,0.65)",
    border: "1px solid rgba(0,255,255,0.25)",
    boxShadow: "0 0 0 1px rgba(168,85,247,0.15), 0 0 60px rgba(0,255,255,0.12)",
    backdropFilter: "blur(14px)",
    overflow: "hidden"
  },
  panelWide: { },

  panelHeader: {
    padding: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  panelTitle: { fontSize: 12, letterSpacing: 1.2, fontWeight: 900, color: "#67e8f9" },
  panelSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 },
  panelActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  panelBody: { padding: 16 },

  sessionGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 0 },
  dial: { height: 150, borderRadius: 18, background: "rgba(0,0,0,0.32)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 0 0 1px rgba(34,211,238,0.10), 0 0 28px rgba(0,255,255,0.08)", position: "relative", display: "grid", placeItems: "center", overflow: "hidden" },
  dialSvg: { position: "absolute", inset: 0, margin: "auto", opacity: 0.95 },
  dialInner: { position: "relative", textAlign: "center", padding: 10 },
  dialLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: 1000, color: "rgba(103,232,249,0.95)" },
  dialValue: { marginTop: 8, fontSize: 16, fontWeight: 1000, color: "rgba(229,246,255,0.98)", textShadow: "0 0 14px rgba(34,211,238,0.22)" },
  dialSub: { marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.50)" },


  sessionPulse: { marginTop: 12, padding: 12, borderRadius: 18, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 0 40px rgba(0,255,255,0.08)" },
  sessionPulseTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sessionPulseTitle: { fontSize: 12, letterSpacing: 1.3, fontWeight: 1000, color: "rgba(103,232,249,0.95)" },
  sessionPulseSub: { marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" },
  sessionPulseChip: { padding: "6px 10px", borderRadius: 999, background: "rgba(0,255,255,0.10)", border: "1px solid rgba(0,255,255,0.28)", color: "rgba(103,232,249,0.95)", fontSize: 12, fontWeight: 900, letterSpacing: 0.3 },
  sessionPulseGraph: { marginTop: 8, padding: 8, borderRadius: 16, background: "rgba(0,0,0,0.38)", border: "1px solid rgba(0,255,255,0.16)" },

  tiles: {
    padding: 18,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))",
    gap: 16
  },

  tile: {
    padding: 18,
    borderRadius: 20,
    background: "linear-gradient(180deg, rgba(0,255,255,0.10), rgba(168,85,247,0.06))",
    border: "1px solid rgba(0,255,255,0.35)",
    boxShadow: "0 0 0 1px rgba(168,85,247,0.25), 0 0 45px rgba(0,255,255,0.25)",
    transition: "all .2s ease",
    cursor: "pointer"
  },

  tileName: { fontSize: 14, fontWeight: 900, color: "#e0f2fe" },
  tileIp: { marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.5)" },
  big: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: 1000,
    color: "#22d3ee",
    textShadow: "0 0 18px rgba(34,211,238,0.6)"
  },

  metaRow: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 },
  metaBox: {
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  metaK: { fontSize: 11, letterSpacing: 0.8, color: "rgba(255,255,255,0.55)" },
  metaV: { marginTop: 6, fontSize: 14, fontWeight: 900, color: "#e0f2fe" },

  sparkWrap: {
    marginTop: 12,
    padding: 8,
    borderRadius: 14,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(0,255,255,0.18)"
  },

  badge: {
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.6,
    background: "rgba(0,255,255,0.18)",
    border: "1px solid rgba(0,255,255,0.45)",
    color: "#67e8f9"
  },

  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(90deg,#22d3ee,#3b82f6)",
    border: "none",
    color: "#020617",
    fontWeight: 1000,
    boxShadow: "0 0 25px rgba(34,211,238,0.6)",
    cursor: "pointer"
  },
  btnSoft: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#e5f6ff",
    fontWeight: 900
  },
  btnGhost: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "rgba(0,255,255,0.08)",
    border: "1px solid rgba(0,255,255,0.35)",
    color: "#67e8f9",
    fontWeight: 900
  },
  btnDanger: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(90deg,#ef4444,#dc2626)",
    border: "none",
    color: "white",
    fontWeight: 1000,
    boxShadow: "0 0 25px rgba(239,68,68,0.6)"
  },

  dim: { color: "rgba(255,255,255,0.6)" },
  err: {
    padding: 14,
    borderRadius: 14,
    background: "rgba(239,68,68,0.18)",
    border: "1px solid rgba(239,68,68,0.45)",
    color: "#fecaca"
  }
};