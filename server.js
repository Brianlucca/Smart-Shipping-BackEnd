require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

const app = express();
app.set("trust proxy", 1);
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

const generateSessionId = () => crypto.randomBytes(12).toString("hex");

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

app.post("/upload/:sessionId", upload.array("files"), async (req, res) => {
  const { sessionId } = req.params;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }

  try {
    const uploadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: sessionId,
            resource_type: "auto",
          },
          (err, result) => {
            if (err) return reject(err);
            resolve({
              url: cloudinary.url(result.public_id, {
                flags: 'attachment',
                secure: true,
                resource_type: result.resource_type
              }),
              downloadUrl: cloudinary.url(result.public_id, {
                flags: 'attachment',
                secure: true,
                resource_type: result.resource_type
              }),
              name: file.originalname,
              public_id: result.public_id,
              resource_type: result.resource_type,
              format: result.format,
              bytes: result.bytes,
              createdAt: Date.now()
            });
          }
        ).end(file.buffer);
      });
    });

    const results = await Promise.all(uploadPromises);
    
    if (!sessionData[sessionId]) sessionData[sessionId] = [];
    sessionData[sessionId].push(...results);

    res.json({ status: "success", count: files.length });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Falha ao enviar arquivos." });
  }
});

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]);
};

app.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const files = sessionData[sessionId];

  if (!files || files.length === 0) {
    return res.status(404).send(`
      <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
        <h1 style="font-size: 24px; color: #d32f2f;">Sessão não encontrada</h1>
        <p style="font-size: 16px; color: #555;">
          O link da sessão pode ter expirado ou ainda não recebeu arquivos.
        </p>
        <p style="font-size: 16px; color: #555; margin-top: 10px;">
          Caso os arquivos já tenham sido enviados, tente atualizar a página ou verificar se o código da sessão está correto.
        </p>
      </div>
    `);
    
  }

  const now = Date.now();
  const sessionStart = parseInt(req.cookies.sessionStart || now);

  const fileItems = files
    .map((file) => {
      let preview = "";
      if (file.resource_type === "image") {
        preview = `<img src="${file.url}" alt="${file.name}" class="preview-img" />`;
      } else if (file.resource_type === "video") {
        preview = `<video controls class="preview-video"><source src="${file.url}" type="video/${file.format}"></video>`;
      } else if (file.resource_type === "raw" && file.format === "pdf") {
        preview = `<div class="preview-icon">
          <embed src="${file.url}#toolbar=0&navpanes=0" type="application/pdf" class="preview-pdf" />
        </div>`;
      } else {
        preview = `<div class="preview-icon">📄</div>`;
      }

      const remaining = Math.max(0, EXPIRATION_TIME - (now - file.createdAt));
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      return `
      <div class="file-card">
        ${preview}
        <div class="file-info">
          <p class="file-name">${file.name}</p>
          <p class="file-size">${formatFileSize(file.bytes)} bytes</p>
          <div class="timer" data-created="${file.createdAt}">
            Expira em: ${minutes}m${seconds.toString().padStart(2, '0')}s
          </div>
        </div>
        <a class="download-btn" href="${file.downloadUrl}" download="${file.name}">⬇ Baixar</a>
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
        font-size: 1.5rem;
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
    .file-info {
        width: 100%;
        margin-bottom: 1rem;
    }
    .file-name {
        font-weight: 500;
        text-align: center;
        margin-bottom: 0.5rem;
        font-size: 1rem;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .file-size {
        font-size: 0.875rem;
        color: var(--text-light);
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .timer {
        font-size: 1rem;
        color: #ef4444;
        font-weight: 500;
        text-align: center;
        margin-bottom: 1rem;
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
  <div class="file-container">${fileItems}</div>
  <script>
    document.querySelectorAll('.timer').forEach(timerElement => {
      const createdAt = parseInt(timerElement.dataset.created);
      
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, ${EXPIRATION_TIME} - (now - createdAt));
        
        if (remaining <= 0) {
          timerElement.innerHTML = 'Expirado';
          timerElement.closest('.file-card').style.opacity = '0.5';
          return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        timerElement.innerHTML = \`Expira em: \${minutes}m\${seconds.toString().padStart(2, '0')}s\`;
      };
      
      updateTimer();
      setInterval(updateTimer, 1000);
    });
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
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});