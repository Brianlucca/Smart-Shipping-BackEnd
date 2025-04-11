const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const multer = require("multer");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;
const FILES_DIR = path.join(__dirname, "files");
const EXPIRATION_TIME = 10 * 60 * 1000;

if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR);
}

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(FILES_DIR));

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (let iface of Object.values(interfaces)) {
    for (let config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "127.0.0.1";
};

app.use((req, res, next) => {
  req.sessionId = getLocalIP();
  res.cookie("sessionId", req.sessionId, { maxAge: 3600000, httpOnly: true });

  const userDir = path.join(FILES_DIR, req.sessionId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir);
  }
  next();
});

app.get("/ip", (req, res) => {
  res.json({ ip: getLocalIP() });
});

const generateIndexHTML = (userDir, sessionId) => {
  fs.readdir(userDir, (err, files) => {
    if (err) return;

    const expirationTime = Date.now() + EXPIRATION_TIME;
    const fileItems = files
      .filter((f) => f !== "index.html")
      .map((file) => {
        const fileUrl = `/${sessionId}/${file}`;
        const ext = path.extname(file).toLowerCase();
        let preview = "";

        if ([".jpg", ".jpeg", ".png", ".gif", ".webp", "avif"].includes(ext)) {
          preview = `
            <div class="preview-container image">
                <img src="${fileUrl}" alt="${file}" class="preview-content">
            </div>`;
        } else if ([".mp4", ".webm", ".ogg"].includes(ext)) {
          preview = `
            <div class="preview-container video">
                <video controls class="preview-content">
                    <source src="${fileUrl}" type="video/${ext.replace(".", "")}">
                </video>
            </div>`;
        } else {
          preview = `
            <div class="preview-container document">
                <div class="file-icon">
                    <svg viewBox="0 0 24 24">
                        <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M13,13V18H10V13H13M14,11H9V18H15V11H14Z"/>
                    </svg>
                </div>
            </div>`;
        }

        return `
            <div class="file-card">
                ${preview}
                <div class="file-info">
                    <div class="filename">${file}</div>
                    <a href="${fileUrl}" download class="download-btn">
                        <span class="btn-text">Download</span>
                        <svg class="download-icon" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                        </svg>
                    </a>
                </div>
            </div>`;
      })
      .join("");

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Transferência de Arquivos</title>
            <style>
                :root {
                    --primary: #2962ff;
                    --background: #f8f9fa;
                    --surface: #ffffff;
                    --text-primary: #212529;
                    --text-secondary: #6c757d;
                    --border: #dee2e6;
                    --shadow: 0 1px 3px rgba(0,0,0,0.12);
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', system-ui, sans-serif;
                }

                body {
                    background: var(--background);
                    color: var(--text-primary);
                    line-height: 1.6;
                    min-height: 100vh;
                }

                .container {
                    max-width: 1200px;
                    margin: 2rem auto;
                    padding: 0 1rem;
                }

                .header {
                    text-align: center;
                    margin-bottom: 2rem;
                }

                .title {
                    font-size: 2.5rem;
                    color: var(--primary);
                    margin-bottom: 0.5rem;
                }

                .countdown {
                    color: var(--text-secondary);
                    font-size: 1.1rem;
                }

                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 1.5rem;
                    padding: 1rem 0;
                }

                .file-card {
                    background: var(--surface);
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: var(--shadow);
                    transition: transform 0.2s, box-shadow 0.2s;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }

                .file-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.15);
                }

                .preview-container {
                    position: relative;
                    background: #f1f3f5;
                    height: 200px;
                    overflow: hidden;
                    flex-shrink: 0;
                }

                .preview-content {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .file-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 48px;
                    height: 48px;
                    color: var(--text-secondary);
                }

                .file-info {
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-height: 130px;
                }

                .filename {
                    font-weight: 500;
                    margin-bottom: 0.75rem;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    flex-grow: 1;
                }

                .download-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    width: 100%;
                    padding: 0.75rem;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    text-decoration: none;
                    transition: opacity 0.2s;
                    margin-top: auto;
                }

                .download-btn:hover {
                    opacity: 0.9;
                }

                .download-icon {
                    width: 20px;
                    height: 20px;
                }

                @media (max-width: 768px) {
                    .container {
                        margin: 1rem auto;
                    }
                    
                    .title {
                        font-size: 2rem;
                    }
                    
                    .grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header class="header">
                    <h1 class="title">Smart Shipping</h1>
                    <p class="countdown">Expira em: <span id="timer"></span></p>
                </header>
                
                <div class="grid">
                    ${fileItems}
                </div>
            </div>

            <script>
                function startCountdown(expiration) {
                    const timer = document.getElementById('timer');
                    
                    const update = () => {
                        const now = Date.now();
                        const diff = expiration - now;
                        
                        if (diff <= 0) {
                            timer.textContent = 'Tempo esgotado!';
                            location.reload();
                            return;
                        }
                        
                        const minutes = Math.floor(diff / 60000);
                        const seconds = Math.floor((diff % 60000) / 1000);
                        timer.textContent = \`\${minutes}m \${seconds.toString().padStart(2, '0')}s\`;
                        
                        setTimeout(update, 1000);
                    }
                    
                    update();
                }
                
                startCountdown(${expirationTime});
            </script>
        </body>
        </html>
    `;

    fs.writeFileSync(path.join(userDir, "index.html"), htmlContent);
  });
};

app.get("/", (req, res) => {
  const userDir = path.join(FILES_DIR, req.sessionId);
  const indexPath = path.join(userDir, "index.html");

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(
      '<div style="text-align:center; padding:2rem">📭 Nenhum arquivo encontrado</div>'
    );
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(FILES_DIR, req.sessionId);
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  generateIndexHTML(path.join(FILES_DIR, req.sessionId), req.sessionId);
  res.json({
    message: "Arquivo enviado com sucesso!",
    file: req.file.filename,
  });
});

setInterval(() => {
  fs.readdir(FILES_DIR, (err, folders) => {
    if (err) return;
    folders.forEach((folder) => {
      const userDir = path.join(FILES_DIR, folder);
      fs.rm(userDir, { recursive: true, force: true }, () => {});
    });
  });
}, EXPIRATION_TIME);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://${getLocalIP()}:${PORT}`);
});