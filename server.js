require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

const app = express();
const PORT = process.env.PORT || 3000;
const EXPIRATION_TIME = 5 * 60 * 1000;

const sessionData = {};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

const generateSessionId = () => crypto.randomBytes(8).toString("hex");

app.use((req, res, next) => {
  const sessionIdFromUrl = req.path.split("/")[1];
  const isSessionRoute = /^[a-f0-9]{16}$/.test(sessionIdFromUrl);

  req.sessionId = isSessionRoute
    ? sessionIdFromUrl
    : req.cookies.sessionId || generateSessionId();

  res.cookie("sessionId", req.sessionId, {
    maxAge: 3600000,
    httpOnly: true,
    sameSite: "none",
    secure: process.env.NODE_ENV === "production" && req.protocol === "https",
  });

  if (!req.cookies.sessionStart && isSessionRoute) {
    const now = Date.now();
    res.cookie("sessionStart", now.toString(), {
      maxAge: 3600000,
      sameSite: "none",
      secure: process.env.NODE_ENV === "production" && req.protocol === "https",
    });
  }

  next();
});

app.get("/session-url", (req, res) => {
  const url = `${req.protocol}://${req.get("host")}/${req.sessionId}`;
  res.status(200).json({ url });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.post("/upload/:sessionId", upload.single("file"), async (req, res) => {
  const { sessionId } = req.params;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: sessionId,
            resource_type: "auto",
          },
          (err, result) => (err ? reject(err) : resolve(result))
        )
        .end(file.buffer);
    });

    if (!sessionData[sessionId]) sessionData[sessionId] = [];

    sessionData[sessionId].push({
      url: result.secure_url,
      name: file.originalname,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      createdAt: Date.now(),
    });

    res.json({ status: "success", file: file.originalname });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Falha ao enviar o arquivo." });
  }
});

app.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const files = sessionData[sessionId];

  if (!files || files.length === 0) {
    return res
      .status(404)
      .send(
        "Sessão não encontrada ou sem arquivos. Caso o arquivo foi enviado, Atualize a pagina!"
      );
  }

  const now = Date.now();
  const sessionStart = parseInt(req.cookies.sessionStart || now);
  const remaining = Math.max(0, EXPIRATION_TIME - (now - sessionStart));

  const fileItems = files
    .map((file) => {
      let preview = "";
      if (file.resource_type === "image") {
        preview = `<img src="${file.url}" alt="${file.name}" class="preview-img" />`;
      } else if (file.resource_type === "video") {
        preview = `<video controls class="preview-video"><source src="${file.url}" type="video/${file.format}"></video>`;
      } else if (file.resource_type === "raw" && file.format === "pdf") {
        preview = `<embed src="${file.url}" type="application/pdf" class="preview-pdf" />`;
      } else {
        preview = `<div class="preview-icon">📄</div>`;
      }

      return `
      <div class="file-card">
        ${preview}
        <p class="file-name">${file.name}</p>
        <a class="download-btn" href="${file.url}" download>⬇ Baixar</a>
      </div>
    `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Arquivos da Sessão</title>
<style>
    :root {
        --bg: #f8f9ff;
        --card-bg: #ffffff;
        --primary: #2A5EE8;
        --primary-hover: #1E4ECF;
        --text: #2d3748;
        --text-light: #718096;
        --border: #e2e8f0;
        --radius: 16px;
        --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
        --shadow-hover: 0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
    }
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    body {
        background: var(--bg);
        color: var(--text);
        line-height: 1.6;
        min-height: 100vh;
        padding: 2rem 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    h2 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
        text-align: center;
        color: var(--text);
        position: relative;
        padding-bottom: 0.5rem;
    }
    h2::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 3px;
        background: var(--primary);
        border-radius: 2px;
    }
    #timer {
        font-weight: 600;
        color: #ef4444;
        margin-bottom: 2rem;
        padding: 0.5rem 1.25rem;
        background: rgba(239, 68, 68, 0.1);
        border-radius: 8px;
        display: inline-flex;
        gap: 0.5rem;
        align-items: center;
    }
    .file-container {
        width: 100%;
        max-width: 1280px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
        padding: 1rem;
    }
    .file-card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: all 0.25s;
        overflow: hidden;
        position: relative;
    }
    .file-card:hover {
        transform: translateY(-5px);
        box-shadow: var(--shadow-hover);
        border-color: var(--primary);
    }
    .preview-img,
    .preview-video,
    .preview-pdf {
        width: 100%;
        height: 400px;
        border-radius: 8px;
        object-fit: cover;
        margin-bottom: 1.5rem;
        background: #f8fafc;
        border: 1px solid var(--border);
    }
    .preview-icon {
        width: 100%;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary);
        background: #f8fafc;
        border-radius: 8px;
        margin-bottom: 1.5rem;
        border: 1px solid var(--border);
    }
    .file-name {
        font-weight: 500;
        text-align: center;
        margin-bottom: 1rem;
        font-size: 1rem;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
    }
    .download-btn {
        background: linear-gradient(135deg, var(--primary) 0%, #1E4ECF 100%);
        color: white;
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        transition: all 0.2s ease;
        width: 100%;
        text-align: center;
        border: 2px solid transparent;
    }
    .download-btn:hover {
        background: linear-gradient(135deg, var(--primary-hover) 0%, #183D9F 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
</style>
</head>
<body>
  <h2>Arquivos da Sessão: ${sessionId}</h2>
  <p id="timer"></p>
  <div class="file-container">${fileItems}</div>
  <script>
    let timer = ${Math.floor(remaining / 1000)};
    const timerElement = document.getElementById("timer");
    const interval = setInterval(() => {
      let minutes = Math.floor(timer / 60);
      let seconds = timer % 60;
      timerElement.innerText = \`Tempo restante: \${minutes}m\${seconds < 10 ? '0' : ''}\${seconds}s\`;
      if (timer <= 0) {
        clearInterval(interval);
        alert("O tempo da sessão expirou!");
        location.reload();
      }
      timer--;
    }, 1000);
  </script>
</body>
</html>
  `;

  res.send(html);
});

setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, files] of Object.entries(sessionData)) {
    const expiredFiles = files.filter(
      (file) => now - file.createdAt > EXPIRATION_TIME
    );
    const validFiles = files.filter(
      (file) => now - file.createdAt <= EXPIRATION_TIME
    );
    const publicIds = expiredFiles.map((f) => f.public_id);
    if (publicIds.length) {
      try {
        await cloudinary.api.delete_resources(publicIds);
      } catch (e) {
        console.error("Erro ao deletar arquivos:", e);
      }
    }
    if (validFiles.length === 0) {
      delete sessionData[sessionId];
    } else {
      sessionData[sessionId] = validFiles;
    }
  }
}, 60 * 1000);

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
