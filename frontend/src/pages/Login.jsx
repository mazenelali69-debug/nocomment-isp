import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../auth";

function codeToText(code){
  const c = Number(code);
  if(!Number.isFinite(c)) return "";
  if(c === 0) return "Clear";
  if([1,2,3].includes(c)) return "Partly cloudy";
  if([45,48].includes(c)) return "Fog";
  if([51,53,55].includes(c)) return "Drizzle";
  if([61,63,65].includes(c)) return "Rain";
  if([66,67].includes(c)) return "Freezing rain";
  if([71,73,75,77].includes(c)) return "Snow";
  if([80,81,82].includes(c)) return "Showers";
  if([95,96,99].includes(c)) return "Thunderstorm";
  return "Weather";
}
function codeToIcon(code){
  const c = Number(code);
  if(c === 0) return "";
  if([1,2,3].includes(c)) return "";
  if([45,48].includes(c)) return "";
  if([51,53,55].includes(c)) return "";
  if([61,63,65].includes(c)) return "";
  if([66,67].includes(c)) return "";
  if([71,73,75,77].includes(c)) return "";
  if([80,81,82].includes(c)) return "";
  if([95,96,99].includes(c)) return "";
  return "";
}

function WeatherChip(){
  const [now, setNow] = useState(() => new Date());
  const [wx, setWx] = useState({ ok:false, t:null, w:null });

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load(){
      try{
        const url =
          "https://api.open-meteo.com/v1/forecast" +
          "?latitude=34.4333&longitude=35.85" +
          "&current_weather=true" +
          "&timezone=Asia%2FBeirut";
        const r = await fetch(url);
        const j = await r.json();
        const cw = j && j.current_weather;
        const t = cw && cw.temperature;
        const w = cw && cw.weathercode;
        if(!cancelled) setWx({ ok:true, t, w });
      }catch{
        if(!cancelled) setWx((x) => ({ ...x, ok:false }));
      }
    }
    load();
    const ref = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(ref); };
  }, []);

  const time12 = useMemo(() => {
    try{
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true
      }).format(now);
    }catch{
      return now.toLocaleTimeString();
    }
  }, [now]);

  const icon = codeToIcon(wx.w);
  const text = codeToText(wx.w);

  return (
    <div style={s.wxPill} title="Tripoli, Lebanon">
      <span style={s.wxDot} />
      <span style={s.wxCity}>Tripoli</span>
      <span style={s.wxSep}></span>
      <span style={s.wxTime}>{time12}</span>
      <span style={s.wxSep}></span>
      <span style={s.wxIcon}>{icon}</span>
      <span style={s.wxTemp}>{wx.ok && wx.t != null ? `${Math.round(wx.t)}C` : ""}</span>
      <span style={s.wxDesc}>{wx.ok ? text : "Offline"}</span>
    </div>
  );
}

function SpiderWebBackground(){
  const ref = useRef(null);
  const mouse = useRef({ x: 0, y: 0, pulse: 0, px: 0, py: 0 });
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    const points = [];
    const links = [];
    const rand = (a,b) => a + Math.random()*(b-a);

    function resize(){
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      points.length = 0;
      links.length = 0;

      const W = window.innerWidth;
      const H = window.innerHeight;

      const n = Math.floor(Math.max(42, Math.min(90, (W*H)/22000)));
      for(let i=0;i<n;i++){
        points.push({
          x: rand(0, W), y: rand(0, H),
          vx: rand(-0.18, 0.18), vy: rand(-0.18, 0.18),
          r: rand(1.2, 2.1),
        });
      }

      for(let i=0;i<points.length;i++){
        for(let k=i+1;k<points.length;k++){
          const a = points[i], b = points[k];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy;
          if(d2 < 170*170 && Math.random() < 0.22) links.push([i,k]);
        }
      }
    }

    function onMove(e){ mouse.current.x = e.clientX; mouse.current.y = e.clientY; }
    function onDown(e){ mouse.current.pulse = 1.0; mouse.current.px = e.clientX; mouse.current.py = e.clientY; }

    function step(){
      const W = window.innerWidth;
      const H = window.innerHeight;

      ctx.clearRect(0, 0, W, H);

      const g = ctx.createRadialGradient(W*0.5, H*0.7, 0, W*0.5, H*0.7, Math.max(W,H)*0.75);
      g.addColorStop(0, "rgba(99,102,241,0.10)");
      g.addColorStop(0.35, "rgba(59,130,246,0.06)");
      g.addColorStop(1, "rgba(2,6,23,0.0)");
      ctx.fillStyle = g;
      ctx.fillRect(0,0,W,H);

      for(const p of points){
        p.x += p.vx; p.y += p.vy;
        if(p.x < -30) p.x = W+30;
        if(p.x > W+30) p.x = -30;
        if(p.y < -30) p.y = H+30;
        if(p.y > H+30) p.y = -30;
      }

      const mx = mouse.current.x || 0;
      const my = mouse.current.y || 0;

      ctx.lineWidth = 1;

      for(const [i,k] of links){
        const a = points[i], b = points[k];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx*dx + dy*dy);

        const dm = Math.min(
          Math.hypot(a.x - mx, a.y - my),
          Math.hypot(b.x - mx, b.y - my)
        );

        let alpha = 0.08;
        if(d < 120) alpha += 0.06;
        if(dm < 180) alpha += (180 - dm) / 180 * 0.14;

        ctx.strokeStyle = `rgba(226,232,240,${Math.min(0.28, alpha)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      for(const p of points){
        const dm = Math.hypot(p.x - mx, p.y - my);
        const a = dm < 160 ? 0.35 : 0.16;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      }

      if(mouse.current.pulse > 0){
        mouse.current.pulse = Math.max(0, mouse.current.pulse - 0.016);
        const t = 1 - mouse.current.pulse;
        const r = 30 + t*260;
        const a = 0.22 * (1 - t);

        ctx.strokeStyle = `rgba(59,130,246,${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mouse.current.px, mouse.current.py, r, 0, Math.PI*2); ctx.stroke();
      }

      raf.current = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    raf.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  return <canvas ref={ref} style={s.canvas} />;
}

function WifiMark(){
  // True-ish WiFi symbol SVG
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" fill="none" style={{ display:"block" }}>
      <path d="M10 26C23 14 41 14 54 26" stroke="rgba(255,255,255,0.85)" strokeWidth="4.5" strokeLinecap="round"/>
      <path d="M18 34C27 25 37 25 46 34" stroke="rgba(255,255,255,0.75)" strokeWidth="4.5" strokeLinecap="round"/>
      <path d="M26 42C31 38 33 38 38 42" stroke="rgba(255,255,255,0.65)" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="32" cy="49" r="4.2" fill="rgba(255,255,255,0.92)"/>
    </svg>
  );
}

function EyeIcon({ on }){
  return on ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{display:"block"}}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{display:"block"}}>
      <path d="M3 12s3.5-7 9-7c2.1 0 3.9.7 5.4 1.7" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M21 12s-3.5 7-9 7c-2.1 0-3.9-.7-5.4-1.7" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M10.6 10.6a3 3 0 0 0 2.8 2.8" stroke="rgba(255,255,255,0.9)" strokeWidth="2"/>
      <path d="M3 3l18 18" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function BrandText({ onBoom }){
  // Split/glitch text effect with CSS vars
  return (
    <div style={s.brandRowText} className={onBoom ? "boom" : ""}>
      <span className="t main">NoComment</span>
      <span className="t ghost g1" aria-hidden="true">NoComment</span>
      <span className="t ghost g2" aria-hidden="true">NoComment</span>
      <span className="sub">ISP</span>
    </div>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 35, hover: false });
  const [phonePulse, setPhonePulse] = useState(0);
  const [boom, setBoom] = useState(0);

  const canSubmit = useMemo(() => {
    return !!String(u || "").trim() && !!String(p || "").trim() && !loading;
  }, [u, p, loading]);

  function onCardMove(e){
    const el = cardRef.current;
    if(!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const ry = (x - 0.5) * 10;
    const rx = -(y - 0.5) * 8;
    setTilt({ rx, ry, gx: Math.round(x*100), gy: Math.round(y*100), hover: true });
  }
  function onCardLeave(){
    setTilt((t) => ({ ...t, rx: 0, ry: 0, gx: 50, gy: 35, hover: false }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const username = String(u || "").trim();
    const password = String(p || "").trim();

    if (!username || !password) {
      setErr("Please enter username and password.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`${window.location.protocol}//${window.location.hostname}:8080/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const text = await r.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      if (!r.ok) {
        const msg = (data && (data.message || data.error)) || text || ("HTTP " + r.status);
        throw new Error(msg);
      }

      if (!data?.token) throw new Error("No token returned");
      setToken(data.token);
      try {
        const role = String(data.role || data.user?.role || "");
        if (role) localStorage.setItem("role", role);
      } catch {}
      nav("/dashboard", { replace: true });
    } catch (e2) {
      console.log("LOGIN ERROR:", e2);
      setErr(String(e2?.message || e2));
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    ...s.cardWrap,
    transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(${tilt.hover ? -4 : 0}px)`,
    boxShadow: tilt.hover ? "0 40px 120px rgba(0,0,0,.72)" : s.cardWrap.boxShadow,
    border: tilt.hover ? "1px solid rgba(255,255,255,0.14)" : s.cardWrap.border,
    background: `radial-gradient(600px 320px at ${tilt.gx}% ${tilt.gy}%, rgba(59,130,246,0.14), transparent 60%),
                 radial-gradient(520px 300px at ${Math.max(0,tilt.gx-15)}% ${Math.min(100,tilt.gy+10)}%, rgba(16,185,129,0.10), transparent 60%),
                 rgba(2, 6, 23, 0.72)`,
  };

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Outfit:wght@600;700;800&display=swap');

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes floaty { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        @keyframes glow { 0%,100% { opacity: .55; } 50% { opacity: .95; } }
        @keyframes pop { 0% { transform: translateY(0) scale(1); } 40% { transform: translateY(-2px) scale(1.06); } 100% { transform: translateY(0) scale(1); } }
        @keyframes neon { 0%,100% { filter: drop-shadow(0 0 0 rgba(16,185,129,0)); } 50% { filter: drop-shadow(0 0 12px rgba(16,185,129,0.45)); } }

        .phonePulse { animation: pop .55s ease, neon .9s ease; }
        .phoneHover:hover { transform: translateY(-1px); filter: drop-shadow(0 0 10px rgba(59,130,246,0.35)); }

        .brandBoom { cursor: pointer; user-select: none; }
        .brandBoom .t.main { position: relative; z-index: 2; }
        .brandBoom .t.ghost { position: absolute; left: 0; top: 0; z-index: 1; opacity: .55; }
        .brandBoom .g1 { transform: translate(1px, -1px); color: rgba(59,130,246,0.75); }
        .brandBoom .g2 { transform: translate(-1px, 1px); color: rgba(16,185,129,0.70); }
        .brandBoom.boom .g1 { animation: shatter1 .55s ease both; }
        .brandBoom.boom .g2 { animation: shatter2 .55s ease both; }
        .brandBoom.boom .main { animation: shatterM .55s ease both; }

        @keyframes shatterM { 0%{ transform: translate(0,0) skewX(0deg); } 30%{ transform: translate(0,-2px) skewX(-6deg); } 100%{ transform: translate(0,0) skewX(0deg); } }
        @keyframes shatter1 { 0%{ transform: translate(1px,-1px) scale(1); } 45%{ transform: translate(10px,-6px) scale(1.02) rotate(-2deg); opacity:.35; } 100%{ transform: translate(1px,-1px) scale(1); opacity:.55; } }
        @keyframes shatter2 { 0%{ transform: translate(-1px,1px) scale(1); } 45%{ transform: translate(-10px,6px) scale(1.02) rotate(2deg); opacity:.35; } 100%{ transform: translate(-1px,1px) scale(1); opacity:.55; } }
      `}</style>

      <SpiderWebBackground />

      <div style={s.topBar}>
        <div style={s.leftTop}>
          <div style={s.wifiWrap}>
            <div style={s.wifiGlow} />
            <div style={s.wifiFloat}>
              <WifiMark />
            </div>
          </div>

          <div
            className={`brandBoom ${boom ? "boom" : ""}`}
            onClick={() => { setBoom(0); setTimeout(() => setBoom(1), 0); setTimeout(() => setBoom(0), 650); }}
            style={{ pointerEvents: "auto" }}
            title="NoComment"
          >
            <BrandText onBoom={boom} />
            <div style={s.tag}>Secure console access</div>
          </div>
        </div>

        <WeatherChip />
      </div>

      <div ref={cardRef} style={cardStyle} onMouseMove={onCardMove} onMouseLeave={onCardLeave}>
        <div style={s.hero}>
          <div style={s.heroTitle}>Welcome back</div>
          <div style={s.heroSub}>Sign in to continue</div>
        </div>

        <form onSubmit={submit} style={s.form}>
          <label style={s.label}>Username</label>
          <div style={s.field}>
            <input
              style={s.input}
              placeholder="Enter your username"
              value={u}
              autoFocus
              onChange={(e) => setU(e.target.value)}
              autoComplete="username"
            />
          </div>

          <label style={{ ...s.label, marginTop: 12 }}>Password</label>
          <div style={s.field}>
            <input
              style={{ ...s.input, paddingRight: 56 }}
              type={show ? "text" : "password"}
              placeholder="Enter your password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((x) => !x)}
              style={s.eyeBtn}
              aria-label={show ? "Hide password" : "Show password"}
              title={show ? "Hide" : "Show"}
            >
              <EyeIcon on={show} />
            </button>
          </div>

          {err && <div style={s.err}>{err}</div>}

          <button style={{ ...s.btn, ...(canSubmit ? {} : s.btnDisabled) }} disabled={!canSubmit}>
            {loading ? (
              <span style={s.btnRow}>
                <span style={s.spinner} />
                Signing in...
              </span>
            ) : (
              "Login"
            )}
          </button>

          <div style={s.footerBlock}>
            <div style={s.copyright}> 2026 NoComment ISP. All rights reserved.</div>

            <a
              href="tel:+96170411518"
              className={`phoneHover ${phonePulse ? "phonePulse" : ""}`}
              onClick={() => { setPhonePulse(0); setTimeout(() => setPhonePulse(1), 0); setTimeout(() => setPhonePulse(0), 900); }}
              style={s.phone}
              title="Call 70411518"
            >
              70411518
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: 18,
    boxSizing: "border-box",
    color: "white",
    fontFamily: "Outfit, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    background:
      "radial-gradient(1100px 650px at 20% 12%, rgba(59,130,246,0.14), transparent 60%)," +
      "radial-gradient(900px 600px at 82% 18%, rgba(16,185,129,0.10), transparent 60%)," +
      "linear-gradient(135deg, #020617, #0b1220 55%, #070b14)",
  },

  canvas: { position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0 },

  topBar: {
    position: "fixed",
    top: 14, left: 14, right: 14,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    pointerEvents: "none",
  },

  leftTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(2, 6, 23, 0.40)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 18px 60px rgba(0,0,0,.35)",
    pointerEvents: "none",
  },

  wifiWrap: {
    width: 46, height: 46, borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(16,185,129,0.12))",
    position: "relative",
    overflow: "hidden",
    animation: "floaty 4.2s ease-in-out infinite",
    display: "grid",
    placeItems: "center",
  },
  wifiGlow: {
    position: "absolute",
    inset: -40,
    background: "radial-gradient(circle at 30% 25%, rgba(59,130,246,0.40), transparent 55%)",
    opacity: 0.55,
    filter: "blur(10px)",
    animation: "glow 2.6s ease-in-out infinite",
  },
  wifiFloat: {
    position: "relative",
    transform: "translateY(1px)",
    filter: "drop-shadow(0 10px 22px rgba(0,0,0,.45))",
  },

  brandRowText: { position: "relative", lineHeight: 1.02 },
  // BrandText uses classes
  // but keep spacing via font sizes:
  // main big text
  // sub "ISP"
  // and tagline below in top bar
  brandStack: { display: "flex", flexDirection: "column", gap: 2 },
  brand: { fontSize: 18, fontWeight: 900, letterSpacing: 0.2 },

  tag: { fontSize: 11, fontWeight: 850, color: "rgba(148,163,184,0.95)" },

  wxPill: {
    pointerEvents: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(2, 6, 23, 0.40)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 18px 60px rgba(0,0,0,.35)",
    fontSize: 12,
    fontWeight: 900,
    color: "rgba(226,232,240,0.95)",
    whiteSpace: "nowrap",
  },
  wxDot: { width: 8, height: 8, borderRadius: 999, background: "rgba(16,185,129,0.95)", boxShadow: "0 0 0 6px rgba(16,185,129,0.12)" },
  wxCity: { color: "rgba(255,255,255,0.92)" },
  wxSep: { color: "rgba(148,163,184,0.85)" },
  wxTime: { color: "rgba(255,255,255,0.92)" },
  wxIcon: { fontSize: 14, transform: "translateY(1px)" },
  wxTemp: { color: "rgba(255,255,255,0.92)" },
  wxDesc: { color: "rgba(148,163,184,0.95)", fontWeight: 850 },

  cardWrap: {
    width: "min(440px, 92vw)",
    zIndex: 2,
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 30px 90px rgba(0,0,0,.62)",
    backdropFilter: "blur(12px)",
    transition: "transform .12s ease, box-shadow .12s ease, border .12s ease, background .12s ease",
    transformStyle: "preserve-3d",
    willChange: "transform",
  },

  hero: { marginBottom: 10 },
  heroTitle: { fontSize: 26, fontWeight: 980, letterSpacing: 0.2 },
  heroSub: { marginTop: 4, fontSize: 12, fontWeight: 900, color: "rgba(148,163,184,0.95)" },

  form: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  label: { fontSize: 12, fontWeight: 900, color: "rgba(226,232,240,0.85)" },
  field: { position: "relative" },

  input: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "white",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },

  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 12,
    padding: "7px 10px",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  },

  err: {
    marginTop: 6,
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.28)",
    color: "rgba(254,202,202,0.95)",
    padding: 10,
    borderRadius: 14,
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "pre-wrap",
  },

  btn: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(59,130,246,0.55)",
    background: "linear-gradient(135deg, rgba(59,130,246,0.26), rgba(16,185,129,0.14))",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    transition: "transform .08s ease",
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },

  btnRow: { display: "inline-flex", alignItems: "center", gap: 10, justifyContent: "center" },
  spinner: {
    width: 14, height: 14,
    borderRadius: 999,
    border: "2px solid rgba(255,255,255,0.25)",
    borderTopColor: "rgba(255,255,255,0.9)",
    display: "inline-block",
    animation: "spin 1s linear infinite",
  },

  footerBlock: { marginTop: 14, display: "grid", gap: 6, justifyItems: "center" },

  copyright: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 850,
    color: "rgba(148,163,184,0.92)",
  },

  phone: {
    textDecoration: "none",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: 0.6,
    color: "rgba(226,232,240,0.92)",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    transition: "transform .12s ease, filter .12s ease, background .12s ease",
    userSelect: "none",
  },
};





