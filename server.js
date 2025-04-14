const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

const FILES_DIR = path.join(os.tmpdir(), "files");
const EXPIRATION_TIME = 10 * 60 * 1000;

!fs.existsSync(FILES_DIR) && fs.mkdirSync(FILES_DIR);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://smart-shipping.vercel.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

const generateSessionId = () => crypto.randomBytes(8).toString("hex");

app.use((req, res, next) => {
  try {
    req.sessionId = req.cookies.sessionId || generateSessionId();

    res.cookie("sessionId", req.sessionId, {
      maxAge: 3600000,
      httpOnly: true,
      sameSite: "none",
      secure: process.env.NODE_ENV === "production" && req.protocol === "https",
    });

    const userDir = path.join(FILES_DIR, req.sessionId);
    !fs.existsSync(userDir) && fs.mkdirSync(userDir);
    next();
  } catch (error) {
    console.error("Middleware Error:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/session-url", (req, res) => {
  try {
    const url = `${req.protocol}://${req.get("host")}/${req.sessionId}`;
    res.status(200).json({ url });
  } catch (error) {
    console.error("Session URL Error:", error);
    res.status(500).json({ error: "Failed to generate URL" });
  }
});

const generateHTML = (userDir, sessionId) => {
  try {
    const files = fs.readdirSync(userDir).filter(f => f !== "index.html");
    const expirationTime = Date.now() + EXPIRATION_TIME;

    const fileItems = files.map(file => {
      const fileUrl = `/${sessionId}/${file}`;
      const ext = path.extname(file).toLowerCase();

      let preview = "";
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        preview = `<img src="${fileUrl}" alt="${file}" />`;
      } else if (ext === ".pdf") {
        preview = `<embed src="${fileUrl}" type="application/pdf" width="100%" height="200px" />`;
      } else if ([".mp4", ".webm"].includes(ext)) {
        preview = `<video controls><source src="${fileUrl}" type="video/${ext.slice(1)}"></video>`;
      } else {
        preview = `<div class="icon">📄</div>`;
      }

      return `
        <div class="file-card">
          <div class="preview">${preview}</div>
          <div class="info">
            <span class="name" title="${file}">${file}</span>
            <a href="${fileUrl}" download class="download-btn">⬇ Baixar</a>
          </div>
        </div>
      `;
    }).join("");

    const template = fs.readFileSync(path.join(__dirname, "template.html"), "utf-8")
      .replace("{{FILES}}", fileItems)
      .replace("{{EXPIRATION}}", expirationTime);

    fs.writeFileSync(path.join(userDir, "index.html"), template);
  } catch (error) {
    console.error("HTML Generation Error:", error);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(FILES_DIR, req.sessionId)),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    generateHTML(path.join(FILES_DIR, req.sessionId), req.sessionId);
    res.json({ status: "success", file: req.file.filename });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/", (req, res) => {
  try {
    const indexPath = path.join(FILES_DIR, req.sessionId, "index.html");
    fs.existsSync(indexPath)
      ? res.sendFile(indexPath)
      : res.send('<div style="text-align:center; padding:2rem;">Nenhum arquivo enviado.</div>');
  } catch (error) {
    console.error("Root Route Error:", error);
    res.status(500).send("Server Error");
  }
});

app.use("/:sessionId", (req, res, next) => {
  const sessionDir = path.join(FILES_DIR, req.params.sessionId);
  if (fs.existsSync(sessionDir)) {
    express.static(sessionDir)(req, res, next);
  } else {
    res.status(404).send("Sessão não encontrada ou expirada.");
  }
});

setInterval(() => {
  try {
    fs.readdirSync(FILES_DIR).forEach((folder) => {
      const dirPath = path.join(FILES_DIR, folder);
      const stats = fs.statSync(dirPath);
      if (Date.now() - stats.ctimeMs > EXPIRATION_TIME) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    });
  } catch (error) {
    console.error("Cleanup Error:", error);
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`✅ Servidor operacional na porta ${PORT}`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});
