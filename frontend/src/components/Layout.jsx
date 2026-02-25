import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("token") || "";

const role = (() => {
  const r = (localStorage.getItem("role") || "").toLowerCase();
  if (r) return r;

  try {
    const parts = token.split(".");
    if (parts.length < 2) return "";
    const payload = JSON.parse(atob(parts[1]));
    return String(payload?.role || "").toLowerCase();
  } catch {
    return "";
  }
})();

  const logout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
    } catch {}
    navigate("/login");
  };

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div style={s.brand}>NoComment ISP</div>

        <nav style={s.nav}>
          <NavLink to="/dashboard" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Dashboard</NavLink>
          <NavLink to="/live-ping" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Ping Live THGV</NavLink>
          <NavLink to="/ping-live-jabal" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Ping Live Jabal</NavLink>
          <NavLink to="/monitoring-graphying" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Monitoring Live Traffic</NavLink>
          <NavLink to="/live-traffic-aviat" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Live Traffic Aviat</NavLink>
          <NavLink to="/traffic-reseller" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>Traffic Reseller</NavLink>

          {role === "admin" && (
            <NavLink to="/users" style={({ isActive }) => (isActive ? s.linkActive : s.link)}>SystemUser</NavLink>
          )}
        </nav>

        <div style={{ flex: 1 }} />

        <button onClick={logout} style={s.logout}>Logout</button>
      </aside>

      <main style={s.main}>
        <div style={s.container}>{children}</div>
      </main>
    </div>
  );
}

const s = {
  app: { minHeight: "100vh", display: "flex", background: "#0b1220", color: "white", fontFamily: "system-ui" },

  sidebar: {
    width: 210,
    flex: "0 0 210px",
    padding: 16,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    background: "#0a1326",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },

  brand: { fontSize: 16, fontWeight: 900, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.05)", textAlign: "center" },

  nav: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },

  link: {
    textDecoration: "none",
    color: "rgba(255,255,255,0.78)",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    fontWeight: 800,
    fontSize: 13
  },

  linkActive: {
    textDecoration: "none",
    color: "white",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(16,185,129,0.45)",
    background: "rgba(16,185,129,0.16)",
    fontWeight: 900,
    fontSize: 13
  },

  logout: { marginTop: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "white", cursor: "pointer", fontWeight: 900, fontSize: 13 },

  main: { flex: 1, display: "flex", justifyContent: "flex-start", padding: 24 },

  container: { width: "100%", maxWidth: 1800, margin: "0" }
};




