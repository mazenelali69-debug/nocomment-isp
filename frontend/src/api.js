import { getToken } from "./auth";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  headers["Content-Type"] = headers["Content-Type"] || "application/json";

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}



