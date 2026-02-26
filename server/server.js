const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Upload folder =====
const uploadDir = path.join(__dirname, "uploads");

// フォルダがなければ作成（Render対応）
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// アップロード動画公開
app.use("/uploads", express.static(uploadDir));

// ===== Front公開 =====
app.use(express.static(path.join(__dirname, "../client")));

// ===== Database =====
const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    filename TEXT,
    tags TEXT,
    views INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    video_id INTEGER,
    watch_time INTEGER
  )`);
});

// ===== Upload設定 =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ===== Auth =====

// 新規登録
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, password],
    err => {
      if (err) return res.status(400).json({ message: "User exists" });
      res.json({ message: "Registered" });
    }
  );
});

// ログイン
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, user) => {
      if (!user) return res.status(401).json({ message: "Login failed" });
      res.json({ username });
    }
  );
});

// ===== Video Upload =====
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file" });

  const { title, tags } = req.body;
  const filename = req.file.filename;

  db.run(
    "INSERT INTO videos (title, filename, tags) VALUES (?, ?, ?)",
    [title, filename, tags],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

// ===== Video List =====
app.get("/videos", (req, res) => {
  db.all("SELECT * FROM videos ORDER BY id DESC", (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

// ===== Watch History =====
app.post("/watch", (req, res) => {
  const { user_id, video_id, watch_time } = req.body;

  db.run(
    "INSERT INTO watch_history (user_id, video_id, watch_time) VALUES (?, ?, ?)",
    [user_id, video_id, watch_time]
  );

  db.run("UPDATE videos SET views = views + 1 WHERE id=?", [video_id]);

  res.json({ message: "saved" });
});

// ===== AI Recommend =====
app.get("/recommend-ai/:user_id", (req, res) => {
  const userId = req.params.user_id;
  const aiPath = path.join(__dirname, "ai.py");

  exec(`python ${aiPath} ${userId}`, (err, stdout) => {
    if (err) {
      console.log("AI error:", err);
      return res.json([]);
    }

    const ids = stdout.trim();
    if (!ids) return res.json([]);

    db.all(`SELECT * FROM videos WHERE id IN (${ids})`, (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    });
  });
});

// ===== SPA Fallback（Node22対応・重要）=====
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ===== Start =====
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
