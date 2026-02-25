require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");const registerUsersRoutes = require("./users.routes");const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const snmp = require("net-snmp");
const { execFile } = require("child_process");
const app = express();
app.use((req,res,next)=>{ const o=req.headers.origin; if(o){ res.setHeader("Access-Control-Allow-Origin",o); res.setHeader("Access-Control-Allow-Credentials","true"); res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization"); res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS"); } if(req.method==="OPTIONS") return res.sendStatus(204); next(); });
app.options(/.*/, cors());
app.use(express.json());
if(!process.env.JWT_SECRET){ throw new Error("JWT_SECRET missing"); }
const secret = process.env.JWT_SECRET;


/* ===== Active users (TTL-based, safe) ===== */
const ACTIVE_USERS_TTL_MS = 120000; // 2 minutes
const _activeUsers = new Map(); // userId -> lastSeen

function markActive(user){
  try {
    if (user && user.sub != null) {
      _activeUsers.set(String(user.sub), Date.now());
    }
  } catch {}
}

function countActive(){
  const now = Date.now();
  for (const [k, ts] of _activeUsers.entries()){
    if (!ts || (now - ts) > ACTIVE_USERS_TTL_MS) {
      _activeUsers.delete(k);
    }
  }
  return _activeUsers.size;
}
/* ========================================= */
function snmpToNumber(v){
  try{
    if(v == null) return NaN;
    if(typeof v === "number") return v;
    if(typeof v === "bigint") return Number(v);
    if(Buffer.isBuffer(v)) {
      // net-snmp may return Counter64 as 8-byte buffer (big-endian)
      let n = 0n;
      for(const b of v.values()) n = (n << 8n) + BigInt(b);
      return Number(n);
    }
    // Some net-snmp builds return {high, low} for Counter64
    if(typeof v === "object" && v.high != null && v.low != null){
      const hi = BigInt(v.high >>> 0);
      const lo = BigInt(v.low >>> 0);
      return Number((hi << 32n) + lo);
    }
    const s = String(v);
    const m = s.match(/\d+/g);
    if(!m) return NaN;
    return Number(m.join(""));
  }catch{
    return NaN;
  }
}

function loadUsers() {
  return JSON.parse(fs.readFileSync("data/users.json", "utf8"));
}

function saveUsers(users){
  fs.writeFileSync("data/users.json", JSON.stringify(users, null, 2), "utf8");
}

function requireAdmin(req,res,next){
  if(!req.user || req.user.role !== "admin") return res.status(403).json({ ok:false, message:"Admin only" });
  return next();
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ ok: false, message: "Missing token" });
  try {
    req.user = jwt.verify(h.slice(7), secret);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Bad token" });
  }
}

app.get("/health", (req, res) => res.json({ ok: true, service: "nocomment-isp-backend" }));


app.get("/stats/active-users", auth, (req,res)=>{
  res.json({ ok:true, active_users: countActive() });
});
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const users = loadUsers();
  const u = users.find(x => x.username === username);
  if (!u) return res.status(401).json({ ok: false, message: "Invalid credentials" });

  const ok = await bcrypt.compare(password || "", u.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials" });

  const token = jwt.sign({ sub: u.id, username: u.username, role: u.role }, secret, { expiresIn:"7d" });
  res.json({ ok: true, token, role: u.role, user: { id: u.id, username: u.username, role: u.role } });
});

/* =============== SNMP TRAFFIC (bytes counters) =============== */
app.post("/mikrotik/traffic", auth, (req, res) => {
  const target = "88.88.88.80";
  const community = "public";
  const session = snmp.createSession(target, community);

  const oids = [
    "1.3.6.1.2.1.2.2.1.10.5", // ifInOctets.1
    "1.3.6.1.2.1.2.2.1.16.5"  // ifOutOctets.1
  ];

  session.get(oids, (err, vb) => {
    if (err) { session.close(); return res.status(500).json({ ok: false, error: err.toString() }); }
    const rx = Number(vb[0].value);
    const tx = Number(vb[1].value);
    session.close();
    res.json({ ok: true, rx_bytes: rx, tx_bytes: tx, time: Date.now() });
  });
});

/* =============== SNMP TRAFFIC RATE (Mbps) =============== */
app.post("/mikrotik/traffic-rate", (req,res,next)=>{ const ra=String((req.socket && req.socket.remoteAddress) || ""); console.log("[traffic-rate] remoteAddress=", ra); if(ra.includes("127.0.0.1") || ra.includes("::1")) return next(); return auth(req,res,next); }, (req, res) => {
  const target = (req.body && req.body.ip ? String(req.body.ip).trim() : "");
  if (!target) return res.status(400).json({ ok: false, message: "Missing ip" });

  
  if(!isAllowedTrafficTarget(target)) return res.status(403).json({ ok:false, message:"Target IP not allowed" });
// OPTIONAL: change default ifIndex if your WAN interface is not 5
  const ifIndex = Number(req.body && req.body.ifIndex != null ? req.body.ifIndex : 5);
  if (!Number.isFinite(ifIndex) || ifIndex <= 0) return res.status(400).json({ ok: false, message: "Bad ifIndex" });

  const community = "public";
  const session = snmp.createSession(target, community);

    // 64-bit counters (preferred) + 32-bit fallback
  const oids64 = [
    `1.3.6.1.2.1.31.1.1.1.6.${ifIndex}`,   // ifHCInOctets
    `1.3.6.1.2.1.31.1.1.1.10.${ifIndex}`   // ifHCOutOctets
  ];

  const oids32 = [
    `1.3.6.1.2.1.2.2.1.10.${ifIndex}`,     // ifInOctets
    `1.3.6.1.2.1.2.2.1.16.${ifIndex}`      // ifOutOctets
  ];

  const getOnce = (oids) => new Promise((resolve, reject) => {
    session.get(oids, (err, vb) => {
      if (err) return reject(err);
      if (!vb || vb.length < 2) return reject(new Error("SNMP: missing varbinds"));

      const v0 = vb[0];
      const v1 = vb[1];

      // IMPORTANT: net-snmp may return "varbind errors" without err
      if (snmp.isVarbindError(v0) || snmp.isVarbindError(v1)) {
        return resolve({ rx: NaN, tx: NaN, ts: Date.now(), _vbErr: { v0: String(v0 && v0.value), v1: String(v1 && v1.value) } });
      }

      const rx = snmpToNumber(v0.value);
      const tx = snmpToNumber(v1.value);
      resolve({ rx, tx, ts: Date.now() });
    });
  });

  const readOnce = async () => {
    const a64 = await getOnce(oids64);
    if (Number.isFinite(a64.rx) && Number.isFinite(a64.tx)) return a64;
    const a32 = await getOnce(oids32);
    return a32;
  };
  (async () => {
    try {
      const a = await readOnce();
await new Promise(r => setTimeout(r, 1000));
const b = await readOnce();

const _dbg = (req.body && req.body.debug) ? {
  a_rx: a.rx, a_tx: a.tx, a_ts: a.ts, a_vbErr: a._vbErr || null,
  b_rx: b.rx, b_tx: b.tx, b_ts: b.ts, b_vbErr: b._vbErr || null
} : null;
      const dt = Math.max(0.2, (b.ts - a.ts) / 1000);

      const rx_bps = ((b.rx - a.rx) * 8) / dt;
      const tx_bps = ((b.tx - a.tx) * 8) / dt;

      res.json({ ok:true, rx_mbps: Number.isFinite(rx_bps) ? Math.max(0, rx_bps/1e6) : null, tx_mbps: Number.isFinite(tx_bps) ? Math.max(0, tx_bps/1e6) : null, sample_seconds: dt, target, ifIndex, ...( _dbg ? { _debug2: _dbg } : {} ) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.toString() });
    } finally {
      session.close();
    }
  })();
});
  /* ===================== LIVE PING (Windows ping) ===================== */
const PING_ALLOWLIST_FILE = path.join(__dirname,"data","ping_allowlist.json");
let _pingAllowCache = { mtime: 0, ips: new Set(), cidr: [] };

  /* ===== TRAFFIC allowlist (target IPs) ===== */
  const TRAFFIC_ALLOWLIST_FILE = path.join(__dirname,"data","traffic_allowlist.json");
  let _trafficAllowCache = { mtime: 0, ips: new Set(), cidr: [] };

  function _loadTrafficAllowlist(){
    try{
      const st = fs.statSync(TRAFFIC_ALLOWLIST_FILE);
      const mt = Number(st.mtimeMs||0);
      if(mt && mt === _trafficAllowCache.mtime) return _trafficAllowCache;

      const raw = fs.readFileSync(TRAFFIC_ALLOWLIST_FILE, "utf8");
      const j = JSON.parse((raw||"{}").replace(/^\uFEFF/,""));
      const ips = new Set(Array.isArray(j.ips) ? j.ips.map(x=>String(x).trim()).filter(Boolean) : []);
      const cidr = Array.isArray(j.cidr) ? j.cidr.map(_parseCidr).filter(Boolean) : [];
      _trafficAllowCache = { mtime: mt||Date.now(), ips, cidr };
      return _trafficAllowCache;
    } catch {
      return _trafficAllowCache;
    }
  }

  function isAllowedTrafficTarget(ip){
    const v = String(ip||"").trim();
    const al = _loadTrafficAllowlist();

    // SAFETY DEFAULT:
    // If allowlist is empty, only allow localhost targets
    if(al.ips.size === 0 && (!al.cidr || al.cidr.length === 0)){
      return (v === "127.0.0.1" || v === "::1" || v === "localhost");
    }

    if(al.ips.has(v)) return true;
    const n = _ipToInt(v);
    if(n==null) return false;
    for(const r of al.cidr){
      if(((n & r.mask)>>>0) === r.net) return true;
    }
    return false;
  }
  /* ========================================= */

function _ipToInt(ip){
  const parts = String(ip).trim().split(".").map(n=>Number(n));
  if(parts.length!==4 || parts.some(x=>!Number.isFinite(x)||x<0||x>255)) return null;
  return ((parts[0]<<24)>>>0) + (parts[1]<<16) + (parts[2]<<8) + (parts[3]>>>0);
}

function _parseCidr(c){
  const s = String(c||"").trim();
  const m = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if(!m) return null;
  const base = _ipToInt(m[1]);
  const bits = Number(m[2]);
  if(base==null || !Number.isFinite(bits) || bits<0 || bits>32) return null;
  const mask = bits===0 ? 0 : ((0xFFFFFFFF << (32-bits))>>>0);
  const net = (base & mask)>>>0;
  return { net, mask };
}

function _loadPingAllowlist(){
  try{
    const st = fs.statSync(PING_ALLOWLIST_FILE);
    const mt = Number(st.mtimeMs||0);
    if(mt && mt === _pingAllowCache.mtime) return _pingAllowCache;

    const raw = fs.readFileSync(PING_ALLOWLIST_FILE, "utf8");
    const j = JSON.parse((raw||"{}").replace(/^\uFEFF/,""));
    const ips = new Set(Array.isArray(j.ips) ? j.ips.map(x=>String(x).trim()).filter(Boolean) : []);
    const cidr = Array.isArray(j.cidr) ? j.cidr.map(_parseCidr).filter(Boolean) : [];
    _pingAllowCache = { mtime: mt||Date.now(), ips, cidr };
    return _pingAllowCache;
  } catch {
    return _pingAllowCache;
  }
}

function isAllowedPingIp(ip){
  const v = String(ip||"").trim();
  const al = _loadPingAllowlist();
  if(al.ips.has(v)) return true;
  const n = _ipToInt(v);
  if(n==null) return false;
  for(const r of al.cidr){
    if(((n & r.mask)>>>0) === r.net) return true;
  }
  return false;
}

function parsePingMs(out){
  // Windows ping line example: "time=12ms" or "time<1ms"
  const m = String(out).match(/time[=<]\s*(\d+)\s*ms/i);
  if(m) return Number(m[1]);
  if(/time<\s*1ms/i.test(String(out))) return 1;
  return null;
}

app.post("/ping", auth, (req,res)=>{
  const ip = (req.body && req.body.ip ? String(req.body.ip).trim() : "");
  if(!ip) return res.status(400).json({ ok:false, message:"Missing ip" });
  if(!isAllowedPingIp(ip)) return res.status(403).json({ ok:false, message:"IP not allowed" });// Windows ping: -n 1 (one packet), -w 1000 (timeout ms)
  execFile("ping", ["-n","1","-w","1000", ip], { windowsHide:true }, (err, stdout, stderr)=>{
    const ms = parsePingMs(stdout);
    if(err || ms == null){
      return res.json({ ok:true, up:false, ms:null, raw:String(stdout||stderr||"") });
    }
    return res.json({ ok:true, up:true, ms });
  });
});
/* =============== SNMP INTERFACES LIST =============== */
app.post("/mikrotik/interfaces", auth, (req,res)=>{
  const ip = String((req.body && req.body.ip) ? req.body.ip : "").trim();
  if(!ip) return res.status(400).json({ok:false,message:"Missing ip"});

  const community = "public";
  const session = snmp.createSession(ip, community);

  const baseOid = "1.3.6.1.2.1.31.1.1.1.1"; // ifName
  const list = [];

  session.subtree(baseOid,
    (varbinds) => {
      if (!varbinds) return;
      for (const vb of varbinds) {
        if (!vb) continue;
        if (snmp.isVarbindError(vb)) continue;
        const oid = String(vb.oid || "");
        const idx = Number(oid.split(".").pop());
        const name = String(vb.value);
        if (Number.isFinite(idx) && idx > 0) list.push({ ifIndex: idx, name });
      }
    },
    (err)=>{
      session.close();
      if(err) return res.status(500).json({ok:false,error:err.toString()});
      list.sort((a,b)=>a.ifIndex-b.ifIndex);
      res.json({ ok:true, ip, count:list.length, interfaces:list });
    }
  );
});
registerUsersRoutes(app, { auth, requireAdmin, loadUsers, saveUsers, bcrypt });

app.listen(8080, "0.0.0.0", () => console.log("Backend running on http://0.0.0.0:8080 (LAN/VPN ready)"));
















































