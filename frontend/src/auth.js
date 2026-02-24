export const TOKEN_KEY = "nc_token";

function normalizeToken(t) {
  if (!t) return "";
  const s = String(t).trim();
  return s.toLowerCase().startsWith("bearer ") ? s.slice(7).trim() : s;
}

export function getToken() {
  const t = localStorage.getItem(TOKEN_KEY);
  return normalizeToken(t) || null;
}

export function setToken(t) {
  const clean = normalizeToken(t);
  if (!clean) return;
  localStorage.setItem(TOKEN_KEY, clean);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

