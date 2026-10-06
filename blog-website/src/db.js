const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { hashPassword } = require("./passwords");

const dataDir = path.join(__dirname, "..", "data");
const uploadsDir = path.join(__dirname, "..", "images", "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "blog.sqlite"));
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'author')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,
    image TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    flash TEXT,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_published_created
    ON posts (published, created_at DESC);
`);

db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

function seed() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (existing.count > 0) return;

  const adminId = db
    .prepare(
      "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
    )
    .run("admin", "admin@latestnews.test", hashPassword("LatestNews1!")).lastInsertRowid;

  const topicNames = [
    ["Fiction", "Stories and imagined worlds."],
    ["Politics", "What is happening in public life."],
    ["Sports", "Matches, athletes, and the numbers behind them."],
    ["Life Lessons", "Notes on living with a little more care."],
    ["Entertainment", "Film, music, and everything in between."],
    ["Technology", "Tools, products, and how they change the work."],
    ["Motivation", "Reasons to start again tomorrow."],
  ];
  const insertTopic = db.prepare("INSERT INTO topics (name, description) VALUES (?, ?)");
  const topicIds = topicNames.map((topic) => insertTopic.run(topic[0], topic[1]).lastInsertRowid);

  const posts = [
    ["One day your life will flash before your eyes", "one-day-your-life-will-flash", "images/post-1.svg", topicIds[3], "2024-08-15 12:00:00"],
    ["How to overcome your fears", "how-to-overcome-your-fears", "images/post-2.svg", topicIds[6], "2024-08-12 12:00:00"],
    ["The strongest and sweetest songs yet remain to be sung", "the-strongest-and-sweetest-songs", "images/post-3.svg", topicIds[4], "2024-08-09 12:00:00"],
    ["Notes from the city after midnight", "notes-from-the-city-after-midnight", "images/post-4.svg", topicIds[0], "2024-08-04 12:00:00"],
    ["What the scoreboard never shows", "what-the-scoreboard-never-shows", "images/post-5.svg", topicIds[2], "2024-07-28 12:00:00"],
  ];
  const body =
    "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. This sample post is stored in the database so the home page, the article page, and the admin dashboard all read the same record.</p><p>Sign in as the demo admin to edit it, unpublish it, or replace this text with your own.</p>";
  const insertPost = db.prepare(
    `INSERT INTO posts (user_id, topic_id, title, slug, body, image, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  for (const post of posts) {
    insertPost.run(adminId, post[3], post[0], post[1], body, post[2], post[4], post[4]);
  }
}

seed();

module.exports = db;
