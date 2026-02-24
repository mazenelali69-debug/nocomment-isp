import { NavLink, useNavigate } from "react-router-dom";
import { getToken, clearToken } from "../auth";

function getRoleFromToken(token){
  if(!token) return null;
  try{
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload && payload.role ? String(payload.role) : null;
  }catch{
    return null;
  }
}

export default function Layout({ children }) {
  const nav = useNavigate();
  const token = getToken();
  const role = getRoleFromToken(token);

  function logout() { if (!confirm("Logout?")) return; clearToken(); nav("/login", { replace: true }); }

  return (
    <div style={s.app}>
      <aside style={s.sidebar}>
        <div className="sb-brand" style={s.brand}>NoComment ISP</div>

        <nav style={s.nav}>
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
            Dashboard
          </NavLink>

          <NavLink to="/live-ping" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
            Ping Live THGV
          </NavLink>

          <NavLink to="/ping-live-jabal" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
            Ping Live Jabal
          </NavLink>

          <NavLink to="/monitoring-graphying" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
            Monitoring Live Traffic
          </NavLink>


            <NavLink to="/traffic-reseller" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
              Traffic Reseller
            </NavLink>

          {role === "admin" && (
            <NavLink to="/users" className={({ isActive }) => (isActive ? "sb-link sb-active" : "sb-link")} style={({ isActive }) => (isActive ? s.linkActive : s.link)}>
              SystemUser
            </NavLink>
          )}
        </nav>

        <div style={{ flex: 1 }} />


        <button onClick={logout} style={s.logout}>Logout</button>
      </aside>

      <main style={s.main}>{children}</main>
    </div>
  );
}

const s = {
  app: { minHeight: "100vh", display: "flex", background: "#0b1220", color: "white", fontFamily: "system-ui" },
  sidebar: {
    width: 190,
    flexShrink: 0,
    flex: "0 0 190px",
    padding: 16,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    background: "#0a1326",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  brand: { fontSize: 16, fontWeight: 900, letterSpacing: 0.2, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", textAlign: "center", color: "rgba(255,255,255,0.92)" },
  nav: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  link: {
    textDecoration: "none",
    color: "rgba(255,255,255,0.78)",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13, lineHeight: "16px",
  },
  linkActive: {
    textDecoration: "none",
    color: "white",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(59,130,246,0.55)",
    background: "rgba(59,130,246,0.18)",
    fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13, lineHeight: "16px",
  },
  logout: {marginTop: 14,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer", pointerEvents: "none", opacity: 0.6,
    fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13, lineHeight: "16px",
  },
  main: { flex: 1, padding: 18, minWidth: 0 },
};
















