const express = require("express");

module.exports = function registerUsersRoutes(app, deps) {
  const { auth, requireAdmin, loadUsers, saveUsers, bcrypt } = deps;

  const r = express.Router();

  // Current user info (from token)
  r.get("/me", auth, (req, res) => {
    res.json({ ok: true, user: { id: req.user.sub, username: req.user.username, role: req.user.role } });
  });

  // List users (admin)
  r.get("/users", auth, requireAdmin, (req, res) => {
    const users = loadUsers().map(u => ({ id: u.id, username: u.username, role: u.role }));
    res.json({ ok: true, users });
  });

  // Create user (admin)
  r.post("/users", auth, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body || {};
    const un = String(username || "").trim();
    const pw = String(password || "");
    const rl = String(role || "user").trim() || "user";

    if (!un || un.length < 3) return res.status(400).json({ ok: false, message: "Bad username" });
    if (!pw || pw.length < 4) return res.status(400).json({ ok: false, message: "Bad password" });
    if (!["admin", "user"].includes(rl)) return res.status(400).json({ ok: false, message: "Bad role" });

    const users = loadUsers();
    if (users.some(u => String(u.username).toLowerCase() === un.toLowerCase())) {
      return res.status(409).json({ ok: false, message: "Username exists" });
    }

    const id = users.length ? Math.max(...users.map(x => x.id)) + 1 : 1;
    const passwordHash = await bcrypt.hash(pw, 10);
    users.push({ id, username: un, passwordHash, role: rl });
    saveUsers(users);

    res.json({ ok: true, user: { id, username: un, role: rl } });
  });

  // Update user (admin)
  r.put("/users/:id", auth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "Bad id" });

    const { username, password, role } = req.body || {};
    const users = loadUsers();
    const u = users.find(x => x.id === id);
    if (!u) return res.status(404).json({ ok: false, message: "Not found" });

    if (username != null) {
      const un = String(username || "").trim();
      if (!un || un.length < 3) return res.status(400).json({ ok: false, message: "Bad username" });
      if (users.some(x => x.id !== id && String(x.username).toLowerCase() === un.toLowerCase())) {
        return res.status(409).json({ ok: false, message: "Username exists" });
      }
      u.username = un;
    }

    if (role != null) {
      const rl = String(role || "").trim();
      if (!["admin", "user"].includes(rl)) return res.status(400).json({ ok: false, message: "Bad role" });

      // Safety: prevent removing last admin
      if (u.role === "admin" && rl !== "admin") {
        const admins = users.filter(x => x.role === "admin");
        if (admins.length <= 1) return res.status(400).json({ ok: false, message: "Cannot remove last admin" });
      }

      u.role = rl;
    }

    if (password != null) {
      const pw = String(password || "");
      if (!pw || pw.length < 4) return res.status(400).json({ ok: false, message: "Bad password" });
      u.passwordHash = await bcrypt.hash(pw, 10);
    }

    saveUsers(users);
    res.json({ ok: true, user: { id: u.id, username: u.username, role: u.role } });
  });

  // Delete user (admin)
  r.delete("/users/:id", auth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "Bad id" });

    const users = loadUsers();
    const idx = users.findIndex(x => x.id === id);
    if (idx < 0) return res.status(404).json({ ok: false, message: "Not found" });

    const target = users[idx];

    // Safety: prevent deleting last admin
    if (target.role === "admin") {
      const admins = users.filter(x => x.role === "admin");
      if (admins.length <= 1) return res.status(400).json({ ok: false, message: "Cannot delete last admin" });
    }

    users.splice(idx, 1);
    saveUsers(users);
    res.json({ ok: true });
  });

  // Mount at root (keeps URLs: /users, /me)
  app.use(r);
};
