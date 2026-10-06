const crypto = require("crypto");
const db = require("./db");

const WEEK = 7 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map();

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function cookieHeader(sid, expires) {
  const maxAge = Math.max(0, Math.floor((expires - Date.now()) / 1000));
  return `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function createSession(userId) {
  const sid = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + WEEK;
  db.prepare(
    "INSERT INTO sessions (id, user_id, csrf, flash, expires_at) VALUES (?, ?, ?, NULL, ?)",
  ).run(sid, userId, csrf, expires);
  return { sid, expires };
}

function sessionMiddleware(req, res, next) {
  let sid = readCookie(req, "sid");
  let row = sid ? db.prepare("SELECT * FROM sessions WHERE id = ?").get(sid) : undefined;
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
    const created = createSession(null);
    sid = created.sid;
    res.append("Set-Cookie", cookieHeader(sid, created.expires));
    row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sid);
  }

  req.sessionId = sid;
  req.csrfToken = row.csrf;
  req.user = row.user_id
    ? db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(row.user_id)
    : null;

  res.locals.user = req.user;
  res.locals.csrf = row.csrf;
  res.locals.flashes = row.flash ? JSON.parse(row.flash) : [];
  res.locals.slider = false;
  res.locals.editor = false;
  res.locals.formatDate = require("./text").formatDate;
  if (row.flash) db.prepare("UPDATE sessions SET flash = NULL WHERE id = ?").run(sid);

  req.flash = (type, message) => {
    const current = db.prepare("SELECT flash FROM sessions WHERE id = ?").get(req.sessionId);
    const list = current && current.flash ? JSON.parse(current.flash) : [];
    list.push({ type, message });
    db.prepare("UPDATE sessions SET flash = ? WHERE id = ?").run(JSON.stringify(list), req.sessionId);
  };

  next();
}

function loginUser(req, res, userId) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.sessionId);
  const created = createSession(userId);
  req.sessionId = created.sid;
  res.append("Set-Cookie", cookieHeader(created.sid, created.expires));
}

function logoutUser(req, res) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.sessionId);
  res.append("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function requireCsrf(req, res, next) {
  const sent = req.body && req.body.csrf;
  if (!sent || sent !== req.csrfToken) {
    res.status(403);
    return res.render("error", {
      pageTitle: "Form expired",
      message: "That form expired. Go back, refresh the page, and try again.",
    });
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) {
    req.flash("error", "Log in to open the dashboard.");
    return res.redirect("/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    req.flash("error", "Log in to open the dashboard.");
    return res.redirect("/login");
  }
  if (req.user.role !== "admin") {
    res.status(403);
    return res.render("error", {
      pageTitle: "Not allowed",
      message: "Only an admin can open that page.",
    });
  }
  next();
}

function tooManyAttempts(ip) {
  const now = Date.now();
  const row = loginAttempts.get(ip);
  if (!row || row.reset < now) return false;
  return row.count >= 8;
}

function recordFailure(ip) {
  const now = Date.now();
  const row = loginAttempts.get(ip);
  if (!row || row.reset < now) {
    loginAttempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
    return;
  }
  row.count += 1;
}

function clearFailures(ip) {
  loginAttempts.delete(ip);
}

module.exports = {
  sessionMiddleware,
  loginUser,
  logoutUser,
  requireCsrf,
  requireLogin,
  requireAdmin,
  tooManyAttempts,
  recordFailure,
  clearFailures,
};
