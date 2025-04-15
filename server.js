require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const os = require("os");
const cloudinary = require("cloudinary").v2;

const app = express();
const PORT = process.env.PORT || 3000;

const FILES_DIR = path.join(os.tmpdir(), "files");
const EXPIRATION_TIME = 10 * 60 * 1000;

!fs.existsSync(FILES_DIR) && fs.mkdirSync(FILES_DIR);

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
app.use("/public", express.static(path.join(__dirname, "public")));

const generateSessionId = () => crypto.randomBytes(8).toString("hex");

app.use((req, res, next) => {
  try {
    const sessionIdFromUrl = req.path.split("/")[1];
    const isSessionRoute = /^[a-f0-9]{16}$/.test(sessionIdFromUrl);

    req.sessionId =
      isSessionRoute
        ? sessionIdFromUrl
        : (req.cookies.sessionId || generateSessionId());

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
    const filesList = path.join(userDir, "files.json");
    if (!fs.existsSync(filesList)) return;

    const files = JSON.parse(fs.readFileSync(filesList));
    const expirationTime = Date.now() + EXPIRATION_TIME;

    const fileItems = files.map(file => {
      let preview = "";
      if (file.resource_type === "image") {
        preview = `<img src="${file.url}" alt="${file.name}" />`;
      } else if (file.resource_type === "pdf") {
        preview = `<embed src="${file.url}" type="application/pdf" width="100%" height="200px" />`;
      } else if (file.resource_type === "video") {
        preview = `<video controls><source src="${file.url}" type="${file.format}"></video>`;
      } else {
        preview = `<div class="icon">📄</div>`;
      }

      return `
        <div class="file-card">
          <div class="preview">${preview}</div>
          <div class="info">
            <span class="name" title="${file.name}">${file.name}</span>
            <a href="${file.url}" download class="download-btn">⬇ Baixar</a>
          </div>
        </div>
      `;
    }).join("");

    const template = fs.readFileSync(path.join(__dirname, "template.html"), "utf-8")
      .replace("{{fileItems}}", fileItems)
      .replace("{{timerScript}}", `
        let timer = ${EXPIRATION_TIME / 1000};
        const timerElement = document.getElementById('timer');
        const interval = setInterval(() => {
          let minutes = Math.floor(timer / 60);
          let seconds = timer % 60;
          timerElement.innerText = \`\${minutes}m\${seconds < 10 ? '0' : ''}\${seconds}s\`;
          if (timer <= 0) {
            clearInterval(interval);
            alert('O tempo da sessão expirou!');
          }
          timer--;
        }, 1000);
      `);

    fs.writeFileSync(path.join(userDir, "index.html"), template);
  } catch (error) {
    console.error("HTML Generation Error:", error);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: req.sessionId,
          resource_type: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const userDir = path.join(FILES_DIR, req.sessionId);
    const filesList = path.join(userDir, "files.json");
    let files = [];
    
    if (fs.existsSync(filesList)) {
      files = JSON.parse(fs.readFileSync(filesList));
    }
    
    files.push({
      url: result.secure_url,
      name: req.file.originalname,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format
    });
    
    fs.writeFileSync(filesList, JSON.stringify(files));

    generateHTML(userDir, req.sessionId);
    res.json({ status: "success", file: req.file.originalname });
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

app.get("/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const userDir = path.join(FILES_DIR, sessionId);
  const indexPath = path.join(userDir, "index.html");

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Sessão não encontrada ou expirada.");
  }
});

setInterval(async () => {
  try {
    fs.readdirSync(FILES_DIR).forEach(async (folder) => {
      const dirPath = path.join(FILES_DIR, folder);
      const filesList = path.join(dirPath, "files.json");
      
      if (fs.existsSync(filesList)) {
        const stats = fs.statSync(filesList);
        if (Date.now() - stats.mtimeMs > EXPIRATION_TIME) {
          const files = JSON.parse(fs.readFileSync(filesList));
          for (const file of files) {
            await cloudinary.uploader.destroy(file.public_id);
          }
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } else {
        // Caso não haja arquivos, deleta após 10min da criação da pasta
        const stats = fs.statSync(dirPath);
        if (Date.now() - stats.ctimeMs > EXPIRATION_TIME) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
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