const express = require("express");
const db = require("../db");
const { verifyPassword } = require("../passwords");
const { hashPassword } = require("../passwords");
const {
  requireCsrf,
  loginUser,
  logoutUser,
  tooManyAttempts,
  recordFailure,
  clearFailures,
} = require("../session");

const router = express.Router();

const postSelect = `
  SELECT posts.*, users.username, topics.name AS topic_name
  FROM posts
  JOIN users ON users.id = posts.user_id
  LEFT JOIN topics ON topics.id = posts.topic_id
`;

function publishedPosts(topicId, query) {
  const where = ["posts.published = 1"];
  const params = [];
  if (topicId) {
    where.push("posts.topic_id = ?");
    params.push(topicId);
  }
  if (query) {
    where.push("(posts.title LIKE ? OR posts.body LIKE ?)");
    const like = `%${query.replace(/[%_]/g, "")}%`;
    params.push(like, like);
  }
  return db
    .prepare(`${postSelect} WHERE ${where.join(" AND ")} ORDER BY posts.created_at DESC`)
    .all(...params);
}

router.get("/", (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  const topicId = Number(req.query.topic) || 0;
  const topic = topicId ? db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) : null;
  const posts = publishedPosts(topic ? topic.id : 0, q);
  res.render("home", {
    pageTitle: "Blog",
    slider: posts.length > 0 && !q && !topic,
    posts,
    trending: posts.slice(0, 5),
    topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
    q,
    topic,
  });
});

router.get("/about", (req, res) => {
  res.render("about", { pageTitle: "About Us" });
});

router.get("/services", (req, res) => {
  res.render("services", { pageTitle: "Services" });
});

router.get("/post/:slug", (req, res) => {
  const post = db.prepare(`${postSelect} WHERE posts.slug = ? AND posts.published = 1`).get(req.params.slug);
  if (!post) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That post is not available." });
  }
  const popular = db
    .prepare(`${postSelect} WHERE posts.published = 1 AND posts.id != ? ORDER BY posts.created_at DESC LIMIT 5`)
    .all(post.id);
  const topics = db.prepare("SELECT * FROM topics ORDER BY name").all();
  res.render("post", { pageTitle: post.title, post, popular, topics });
});

router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/admin/posts");
  res.render("login", { pageTitle: "Login", error: "" });
});

router.post("/login", requireCsrf, (req, res) => {
  const ip = req.ip || "local";
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (tooManyAttempts(ip)) {
    return res.status(429).render("login", {
      pageTitle: "Login",
      error: "Too many attempts. Wait 15 minutes and try again.",
    });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(ip);
    return res.status(401).render("login", {
      pageTitle: "Login",
      error: "That username and password do not match.",
    });
  }
  clearFailures(ip);
  loginUser(req, res, user.id);
  res.redirect("/admin/posts");
});

router.get("/register", (req, res) => {
  if (req.user) return res.redirect("/admin/posts");
  res.render("register", { pageTitle: "Register", errors: [], values: { username: "", email: "" } });
});

router.post("/register", requireCsrf, (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirm = String(req.body.password_confirmation || "");
  const errors = [];
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
    errors.push("Username must be 3–30 letters, numbers, or underscores.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Enter a valid email address.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (password !== confirm) errors.push("Password and confirmation do not match.");
  if (!errors.length && db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    errors.push("That username is already taken.");
  }
  if (!errors.length && db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    errors.push("That email is already registered.");
  }
  if (errors.length) {
    return res.status(400).render("register", { pageTitle: "Register", errors, values: { username, email } });
  }
  const result = db
    .prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'author')")
    .run(username, email, hashPassword(password));
  loginUser(req, res, result.lastInsertRowid);
  req.flash("success", "Account created. You can write a post from the dashboard.");
  res.redirect("/admin/posts");
});

router.post("/contact", requireCsrf, (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const message = String(req.body.message || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5 || message.length > 2000) {
    req.flash("error", "Enter a valid email and a message of at least 5 characters.");
    return res.redirect("/#contact");
  }
  db.prepare("INSERT INTO messages (email, body) VALUES (?, ?)").run(email, message);
  req.flash("success", "Message sent.");
  res.redirect("/");
});

router.post("/logout", requireCsrf, (req, res) => {
  logoutUser(req, res);
  res.redirect("/");
});

module.exports = router;
