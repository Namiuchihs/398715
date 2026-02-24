const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { exec } = require("child_process");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const db = new sqlite3.Database("./database.sqlite");

// Tables
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

// Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "server/uploads/"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Auth
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

// Upload video
app.post("/upload", upload.single("video"), (req, res) => {
  const { title, tags } = req.body;
  const filename = req.file.filename;

  db.run(
    "INSERT INTO videos (title, filename, tags) VALUES (?, ?, ?)",
    [title, filename, tags],
    function(err){
      if (err) return res.status(500).send(err);
      res.json({ id: this.lastID });
    }
  );
});

// Watch history
app.post("/watch", (req, res) => {
  const { user_id, video_id, watch_time } = req.body;

  db.run(
    "INSERT INTO watch_history (user_id, video_id, watch_time) VALUES (?, ?, ?)",
    [user_id, video_id, watch_time]
  );

  db.run("UPDATE videos SET views = views + 1 WHERE id=?", [video_id]);

  res.json({ message: "saved" });
});

// AI recommend
app.get("/recommend-ai/:user_id", (req, res) => {
  const userId = req.params.user_id;

  exec(`python server/ai.py ${userId}`, (err, stdout) => {
    if (err) return res.json([]);

    const ids = stdout.trim();
    if (!ids) return res.json([]);

    db.all(`SELECT * FROM videos WHERE id IN (${ids})`, (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    });
  });
});

// Start
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
