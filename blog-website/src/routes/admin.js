const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const { hashPassword } = require("../passwords");
const { sanitizeHtml, uniqueSlug } = require("../text");
const { requireLogin, requireAdmin, requireCsrf } = require("../session");

const router = express.Router();

router.use((req, res, next) => {
  res.locals.adminPage = true;
  next();
});
const uploadDir = path.join(__dirname, "..", "..", "images", "uploads");

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
      callback(null, name);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    if (!allowed.includes(ext) || !String(file.mimetype).startsWith("image/")) {
      callback(new Error("IMAGE_TYPE"));
      return;
    }
    callback(null, true);
  },
});

function withUpload(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (error) => {
      if (!error) return next();
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 2 MB or smaller."
          : "Upload a JPG, PNG, GIF, or WebP image.";
      req.flash("error", message);
      const back = req.get("referer") && req.get("referer").startsWith(`${req.protocol}://${req.get("host")}`)
        ? req.get("referer")
        : "/admin/posts";
      res.redirect(back);
    });
  };
}

function removeUpload(image) {
  if (!image || !image.startsWith("images/uploads/")) return;
  fs.unlink(path.join(__dirname, "..", "..", image), () => {});
}

function canEditPost(user, post) {
  return user.role === "admin" || post.user_id === user.id;
}

const postSelect = `
  SELECT posts.*, users.username, topics.name AS topic_name
  FROM posts
  JOIN users ON users.id = posts.user_id
  LEFT JOIN topics ON topics.id = posts.topic_id
`;

router.use(requireLogin);

router.get("/", (req, res) => {
  res.redirect("/admin/posts");
});

router.get("/posts", (req, res) => {
  const posts =
    req.user.role === "admin"
      ? db.prepare(`${postSelect} ORDER BY posts.created_at DESC`).all()
      : db.prepare(`${postSelect} WHERE posts.user_id = ? ORDER BY posts.created_at DESC`).all(req.user.id);
  res.render("admin/posts", { pageTitle: "Manage Posts", posts });
});

router.get("/posts/new", (req, res) => {
  res.render("admin/post-form", {
    pageTitle: "Add Post",
    editor: true,
    mode: "create",
    post: { title: "", body: "", topic_id: "", published: 0, image: "" },
    topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
    error: "",
  });
});

router.post("/posts", withUpload("image"), requireCsrf, (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = sanitizeHtml(req.body.body || "");
  const topicId = Number(req.body.topic_id) || null;
  const published = req.body.published ? 1 : 0;
  if (title.length < 3 || title.length > 150 || body.replace(/<[^>]+>/g, "").trim().length < 1) {
    removeUpload(req.file && `images/uploads/${req.file.filename}`);
    return res.status(400).render("admin/post-form", {
      pageTitle: "Add Post",
      editor: true,
      mode: "create",
      post: { title, body, topic_id: topicId || "", published, image: "" },
      topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
      error: "Add a title (3–150 characters) and a body.",
    });
  }
  const topic = topicId ? db.prepare("SELECT id FROM topics WHERE id = ?").get(topicId) : null;
  const image = req.file ? `images/uploads/${req.file.filename}` : "images/post-1.svg";
  db.prepare(
    `INSERT INTO posts (user_id, topic_id, title, slug, body, image, published)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(req.user.id, topic ? topic.id : null, title, uniqueSlug(db, title), body, image, published);
  req.flash("success", published ? "Post published." : "Draft saved.");
  res.redirect("/admin/posts");
});

router.get("/posts/:id/edit", (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (!post || !canEditPost(req.user, post)) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That post is not available." });
  }
  res.render("admin/post-form", {
    pageTitle: "Edit Post",
    editor: true,
    mode: "edit",
    post,
    topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
    error: "",
  });
});

router.post("/posts/:id", withUpload("image"), requireCsrf, (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (!post || !canEditPost(req.user, post)) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That post is not available." });
  }
  const title = String(req.body.title || "").trim();
  const body = sanitizeHtml(req.body.body || "");
  const topicId = Number(req.body.topic_id) || null;
  const published = req.body.published ? 1 : 0;
  if (title.length < 3 || title.length > 150) {
    removeUpload(req.file && `images/uploads/${req.file.filename}`);
    return res.status(400).render("admin/post-form", {
      pageTitle: "Edit Post",
      editor: true,
      mode: "edit",
      post: { ...post, title, body, topic_id: topicId || "", published },
      topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
      error: "Title must be 3–150 characters.",
    });
  }
  const topic = topicId ? db.prepare("SELECT id FROM topics WHERE id = ?").get(topicId) : null;
  let image = post.image;
  if (req.file) {
    removeUpload(post.image);
    image = `images/uploads/${req.file.filename}`;
  }
  db.prepare(
    `UPDATE posts
     SET title = ?, slug = ?, body = ?, topic_id = ?, image = ?, published = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(title, uniqueSlug(db, title, post.id), body, topic ? topic.id : null, image, published, post.id);
  req.flash("success", "Post updated.");
  res.redirect("/admin/posts");
});

router.post("/posts/:id/delete", requireCsrf, (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (post && canEditPost(req.user, post)) {
    removeUpload(post.image);
    db.prepare("DELETE FROM posts WHERE id = ?").run(post.id);
    req.flash("success", "Post deleted.");
  }
  res.redirect("/admin/posts");
});

router.post("/posts/:id/publish", requireCsrf, (req, res) => {
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);
  if (post && canEditPost(req.user, post)) {
    db.prepare("UPDATE posts SET published = ?, updated_at = datetime('now') WHERE id = ?").run(
      post.published ? 0 : 1,
      post.id,
    );
    req.flash("success", post.published ? "Post unpublished." : "Post published.");
  }
  res.redirect("/admin/posts");
});

router.get("/topics", requireAdmin, (req, res) => {
  res.render("admin/topics", {
    pageTitle: "Manage Topics",
    topics: db.prepare("SELECT * FROM topics ORDER BY name").all(),
  });
});

router.get("/topics/new", requireAdmin, (req, res) => {
  res.render("admin/topic-form", {
    pageTitle: "Add Topic",
    editor: true,
    mode: "create",
    topic: { name: "", description: "" },
    error: "",
  });
});

router.post("/topics", requireAdmin, requireCsrf, (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = sanitizeHtml(req.body.description || "");
  if (name.length < 2 || name.length > 40) {
    return res.status(400).render("admin/topic-form", {
      pageTitle: "Add Topic",
      editor: true,
      mode: "create",
      topic: { name, description },
      error: "Topic name must be 2–40 characters.",
    });
  }
  try {
    db.prepare("INSERT INTO topics (name, description) VALUES (?, ?)").run(name, description);
  } catch (error) {
    return res.status(400).render("admin/topic-form", {
      pageTitle: "Add Topic",
      editor: true,
      mode: "create",
      topic: { name, description },
      error: "That topic already exists.",
    });
  }
  req.flash("success", "Topic added.");
  res.redirect("/admin/topics");
});

router.get("/topics/:id/edit", requireAdmin, (req, res) => {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id);
  if (!topic) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That topic is not available." });
  }
  res.render("admin/topic-form", { pageTitle: "Edit Topic", editor: true, mode: "edit", topic, error: "" });
});

router.post("/topics/:id", requireAdmin, requireCsrf, (req, res) => {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id);
  if (!topic) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That topic is not available." });
  }
  const name = String(req.body.name || "").trim();
  const description = sanitizeHtml(req.body.description || "");
  if (name.length < 2 || name.length > 40) {
    return res.status(400).render("admin/topic-form", {
      pageTitle: "Edit Topic",
      editor: true,
      mode: "edit",
      topic: { ...topic, name, description },
      error: "Topic name must be 2–40 characters.",
    });
  }
  try {
    db.prepare("UPDATE topics SET name = ?, description = ? WHERE id = ?").run(name, description, topic.id);
  } catch (error) {
    return res.status(400).render("admin/topic-form", {
      pageTitle: "Edit Topic",
      editor: true,
      mode: "edit",
      topic: { ...topic, name, description },
      error: "That topic already exists.",
    });
  }
  req.flash("success", "Topic updated.");
  res.redirect("/admin/topics");
});

router.post("/topics/:id/delete", requireAdmin, requireCsrf, (req, res) => {
  db.prepare("DELETE FROM topics WHERE id = ?").run(req.params.id);
  req.flash("success", "Topic deleted. Posts in that topic are now uncategorized.");
  res.redirect("/admin/topics");
});

router.get("/messages", requireAdmin, (req, res) => {
  res.render("admin/messages", {
    pageTitle: "Messages",
    messages: db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all(),
  });
});

router.post("/messages/:id/delete", requireAdmin, requireCsrf, (req, res) => {
  db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
  req.flash("success", "Message deleted.");
  res.redirect("/admin/messages");
});

router.get("/users", requireAdmin, (req, res) => {
  res.render("admin/users", {
    pageTitle: "Manage Users",
    users: db.prepare("SELECT id, username, email, role, created_at FROM users ORDER BY id").all(),
  });
});

router.get("/users/new", requireAdmin, (req, res) => {
  res.render("admin/user-form", {
    pageTitle: "Add User",
    mode: "create",
    account: { username: "", email: "", role: "author" },
    error: "",
  });
});

router.post("/users", requireAdmin, requireCsrf, (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirm = String(req.body.password_confirmation || "");
  const role = req.body.role === "admin" ? "admin" : "author";
  const account = { username, email, role };
  let error = "";
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) error = "Username must be 3–30 letters, numbers, or underscores.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Enter a valid email address.";
  else if (password.length < 8) error = "Password must be at least 8 characters.";
  else if (password !== confirm) error = "Password and confirmation do not match.";
  if (error) {
    return res.status(400).render("admin/user-form", { pageTitle: "Add User", mode: "create", account, error });
  }
  try {
    db.prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)").run(
      username,
      email,
      hashPassword(password),
      role,
    );
  } catch (insertError) {
    return res.status(400).render("admin/user-form", {
      pageTitle: "Add User",
      mode: "create",
      account,
      error: "That username or email is already used.",
    });
  }
  req.flash("success", "User added.");
  res.redirect("/admin/users");
});

router.get("/users/:id/edit", requireAdmin, (req, res) => {
  const account = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(req.params.id);
  if (!account) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That user is not available." });
  }
  res.render("admin/user-form", { pageTitle: "Edit User", mode: "edit", account, error: "" });
});

router.post("/users/:id", requireAdmin, requireCsrf, (req, res) => {
  const account = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!account) {
    res.status(404);
    return res.render("error", { pageTitle: "Not found", message: "That user is not available." });
  }
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirm = String(req.body.password_confirmation || "");
  let role = req.body.role === "admin" ? "admin" : "author";
  if (account.id === req.user.id) role = "admin";
  let error = "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Enter a valid email address.";
  else if (password && password.length < 8) error = "Password must be at least 8 characters.";
  else if (password !== confirm) error = "Password and confirmation do not match.";
  if (error) {
    return res.status(400).render("admin/user-form", {
      pageTitle: "Edit User",
      mode: "edit",
      account: { ...account, email, role },
      error,
    });
  }
  try {
    if (password) {
      db.prepare("UPDATE users SET email = ?, role = ?, password_hash = ? WHERE id = ?").run(
        email,
        role,
        hashPassword(password),
        account.id,
      );
    } else {
      db.prepare("UPDATE users SET email = ?, role = ? WHERE id = ?").run(email, role, account.id);
    }
  } catch (updateError) {
    return res.status(400).render("admin/user-form", {
      pageTitle: "Edit User",
      mode: "edit",
      account: { ...account, email, role },
      error: "That email is already used.",
    });
  }
  req.flash("success", "User updated.");
  res.redirect("/admin/users");
});

router.post("/users/:id/delete", requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    req.flash("error", "You cannot delete the account you are using.");
    return res.redirect("/admin/users");
  }
  const posts = db.prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id = ?").get(id);
  if (posts.count > 0) {
    req.flash("error", "Delete or reassign that user's posts before deleting the account.");
    return res.redirect("/admin/users");
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  req.flash("success", "User deleted.");
  res.redirect("/admin/users");
});

module.exports = router;
