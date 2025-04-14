const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const FILES_DIR = path.join(__dirname, "files");
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
    allowedHeaders: ["Content-Type"]
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.static(FILES_DIR));

// Geração de Session ID
const generateSessionId = () => crypto.randomBytes(8).toString("hex");

// Middleware principal
app.use((req, res, next) => {
  try {
    req.sessionId = req.cookies.sessionId || generateSessionId();
    res.cookie("sessionId", req.sessionId, {
      maxAge: 3600000,
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });

    const userDir = path.join(FILES_DIR, req.sessionId);
    !fs.existsSync(userDir) && fs.mkdirSync(userDir);
    next();
  } catch (error) {
    console.error("Middleware Error:", error);
    res.status(500).send("Server Error");
  }
});

// Rotas
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
    const files = fs.readdirSync(userDir);
    const expirationTime = Date.now() + EXPIRATION_TIME;

    const fileItems = files
      .filter((f) => f !== "index.html")
      .map((file) => {
        const fileUrl = `/${sessionId}/${file}`;
        const ext = path.extname(file).toLowerCase();

        let preview = "";
        if ([".jpg", ".jpeg", ".png", ".gif", "webp", "pdf"].includes(ext)) {
          preview = `<img src="${fileUrl}" alt="${file}" />`;
        } else if ([".mp4", ".webm"].includes(ext)) {
          preview = `<video controls><source src="${fileUrl}" type="video/${ext.slice(
            1
          )}"></video>`;
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
      })
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Transferência de Arquivos</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container">
    <h1>📁 Seus Arquivos</h1>
    <p>Link expira em <span id="timer">10m00s</span></p>
    <div class="grid">${fileItems}</div>
  </div>
  <script>${getScript(expirationTime)}</script>
</body>
</html>`;

    fs.writeFileSync(path.join(userDir, "index.html"), html);
  } catch (error) {
    console.error("HTML Generation Error:", error);
  }
};

const getStyles = () => `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Segoe UI', sans-serif;
    padding: 2rem;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: #58a6ff;
  }

  p {
    margin-bottom: 2rem;
    color: #8b949e;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.5rem;
  }

  .file-card {
    background: #161b22;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s;
  }

  .file-card:hover {
    transform: translateY(-5px);
  }

  .preview {
    height: 200px;
    background: #0d1117;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .preview img, .preview video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview .icon {
    font-size: 3rem;
  }

  .info {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.5rem;
    background: #161b22;
  }

  .name {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .download-btn {
    background-color: #238636;
    color: white;
    padding: 0.5rem;
    border-radius: 6px;
    text-decoration: none;
    font-weight: bold;
    transition: background 0.2s;
  }

  .download-btn:hover {
    background-color: #2ea043;
  }

  @media (max-width: 600px) {
    .preview {
      height: 160px;
    }
  }
`;

const getScript = (expTime) => `
  function updateTimer() {
    const diff = ${expTime} - Date.now();
    if (diff <= 0) return location.reload();
    const m = Math.floor(diff/60000);
    const s = Math.floor((diff%60000)/1000).toString().padStart(2,'0');
    document.getElementById('timer').textContent = m + 'm' + s + 's';
    setTimeout(updateTimer, 1000);
  }
  updateTimer();
`;

// Upload Handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(FILES_DIR, req.sessionId)),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
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

// Rotas restantes
app.get("/", (req, res) => {
  try {
    const indexPath = path.join(FILES_DIR, req.sessionId, "index.html");
    fs.existsSync(indexPath)
      ? res.sendFile(indexPath)
      : res.send(
          '<div style="text-align:center; padding:2rem;">Nenhum arquivo enviado.</div>'
        );
  } catch (error) {
    console.error("Root Route Error:", error);
    res.status(500).send("Server Error");
  }
});

// Limpeza automática
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

// Inicialização
app.listen(PORT, () => {
  console.log(`✅ Servidor operacional na porta ${PORT}`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});
