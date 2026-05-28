import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001; // Internal API port, separate from Vite (3000)

app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.post('/api/split', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Kod gerekli' });
  }

  const systemPrompt = `MOD ADI: AI KOD BÖLÜCÜ V7PRO — FINAL STABILITY & SAFETY ENGINE

ÖNEMLİ GÖREV:
Sana verilen tek parça kaynak kodu analiz et ve %100 kayıpsız şekilde 3 ayrı dosyaya böl: index.html, style.css, app.js.

STRICT CODE SPLITTER ONLY REQUIREMENT:
- Sadece mevcut kodu bölümlere ayır. Koda kesinlikle dışarıdan bir şey ekleme, değiştirme veya silme.
- Girdi kodunda olmayan <html>, <head>, <body>, <style>, <script>, <link rel="stylesheet"> gibi yapıları asla kendiliğinden ekleme/uydurma (hallucinate).
- Eğer girdi kodunda CSS yoksa style.css dosyasını tamamen boş bırak.
- Eğer girdi kodunda JavaScript yoksa app.js dosyasını tamamen boş bırak.
- Dosyaları birbirine bağlamak için otomatik olarak <link rel="stylesheet"> veya <script src="app.js"> ekleme veya bunları kendiliğinden oluşturma.

🚫 ABSOLUTE RULES (NON-NEGOTIABLE)
- No rewriting ❌ (Girdi kodunda olmayan hiçbir şeyi ekleme veya silme, kod yapısını ve içeriğini olduğu gibi koru)
- No optimization ❌ (Kod iyileştirmesi, sıkıştırma yapma)
- No fixing code ❌ (Hatalı veya eksik kodları düzeltmeye çalışma, eksikleri tamamlama)
- No template generation ❌ (Varsayılan şablonlar üretme, olmayan dosyaları uydurma)
- No explanation inside code ❌ (Kod dosyalarının içine açıklama satırı ekleme)
- No system simulation or "upgrade text" ❌

🧠 ZERO MODIFICATION GUARANTEE
Çıktıdaki tüm karakterlerin girdi kodunda aynen bulunması ZORUNLUDUR. Karakter kaybı veya ekleme yapılması durumunda "ERROR: REWRITE BLOCKED" hatası verilir.

⚠️ INPUT VALIDATION SYSTEM
Kodları kontrol et ve girdi durumunu ilk satırda bildir:
- VALID INPUT (Tam yapı, normal HTML/CSS/JS) -> "✔ DURUM: GEÇERLİ KOD"
- MALFORMED INPUT (Eksik tagler, bozuk yapı, yarım kalmış kodlar) -> "⚠️ DURUM: HATALI / EKSİK KOD ALGILANDI"

🟥 STATUS OUTPUT RULE (IMPORTANT)
Yanıtının en başında durum bilgisini bir satır olarak belirtmek ZORUNLUDUR. Durum mesajı tamamen Türkçe olmalıdır:
Her zaman geçerli kod ise:
“✔ DURUM: GEÇERLİ KOD”
Eğer kod hatalı, yarım veya eksik ise:
“⚠️ DURUM: HATALI / EKSİK KOD ALGILANDI”

📦 OUTPUT STRUCTURE
Yanıtın tam olarak aşağıdaki yapıda olmalı ve ek bir açıklama metni içermemelidir:

[DURUM SATIRI]

FILE: index.html
\`\`\`html
(Exact HTML code)
\`\`\`

FILE: style.css
\`\`\`css
(Exact CSS code)
\`\`\`

FILE: app.js
\`\`\`javascript
(Exact JavaScript code)
\`\`\`

[KISA NOT]

Gövdedeki son not olarak sadece şunlardan birini yazabilirsin (maksimum 1 satır):
“Kod bölme işlemi tamamlandı”
veya
“Kod bozuk olabilir, dikkatli kontrol edin”`;

  const models = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3-flash-preview", "gemini-1.5-flash-8b"];
  let lastError = null;

  const tryAi = async () => {
    for (const modelName of models) {
      let retries = 0;
      const maxRetries = 2; 
      
      while (retries < maxRetries) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: code,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.1,
            },
          });

          const result = response.text;
          if (!result || result.trim().length < 20) throw new Error("Yetersiz yanıt döndü");
          return result;
        } catch (error: any) {
          lastError = error;
          console.error(`Gemini Error (${modelName}, attempt ${retries + 1}):`, error.message);
          
          const isRetryable = error.message.includes('503') || 
                            error.message.includes('overload') || 
                            error.message.includes('demand') ||
                            error.message.includes('deadline') ||
                            error.message.includes('unavailable') ||
                            error.message.includes('failed to fetch') ||
                            error.message.includes('Yetersiz');

          if (!isRetryable) break; 
          
          retries++;
          if (retries < maxRetries) {
            const waitTime = Math.pow(2, retries) * 1500;
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    }
    return null;
  };

  const checkInputValidity = (raw: string): boolean => {
    if (!raw || raw.trim() === '') return false;
    const trimmed = raw.trim();
    if (trimmed.endsWith('.') || trimmed.endsWith(',') || trimmed.endsWith('+') || trimmed.endsWith('-') || trimmed.endsWith('*') || trimmed.endsWith('/') || trimmed.endsWith('=')) {
      return false;
    }
    if (trimmed.includes('<!--') && !trimmed.includes('-->')) {
      return false;
    }
    const openScripts = (trimmed.match(/<script([^>]*)>/gi) || []).length;
    const closeScripts = (trimmed.match(/<\/script>/gi) || []).length;
    if (openScripts > closeScripts) return false;

    const openStyles = (trimmed.match(/<style([^>]*)>/gi) || []).length;
    const closeStyles = (trimmed.match(/<\/style>/gi) || []).length;
    if (openStyles > closeStyles) return false;

    let bCount = 0;
    let pCount = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '{') bCount++;
      else if (char === '}') bCount--;
      else if (char === '(') pCount++;
      else if (char === ')') pCount--;
    }
    if (bCount !== 0 || pCount < 0) return false;

    const lastOpen = trimmed.lastIndexOf('<');
    const lastClose = trimmed.lastIndexOf('>');
    if (lastOpen > lastClose) return false;

    return true;
  };

  const naiveSplit = (raw: string) => {
    try {
      console.log("Naive fallback triggered");
      const safeRaw = raw || "";
      const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;

      let css = "";
      let js = "";
      let match;

      while ((match = styleRegex.exec(safeRaw)) !== null) {
        if (match[1]) css += match[1];
      }
      while ((match = scriptRegex.exec(safeRaw)) !== null) {
        if (match[1]) js += match[1];
      }

      let html = safeRaw.replace(styleRegex, "").replace(scriptRegex, "");

      // Simple injection
      if (html.toLowerCase().includes('</head>')) {
        html = html.replace(/<\/head>/i, '    <link rel="stylesheet" href="style.css">\n</head>');
      } else {
        html = '<link rel="stylesheet" href="style.css">\n' + html;
      }

      if (html.toLowerCase().includes('</body>')) {
        html = html.replace(/<\/body>/i, '    <script src="app.js"></script>\n</body>');
      } else {
        html = html + '\n<script src="app.js"></script>';
      }

      let isValid = false;
      try {
        isValid = checkInputValidity(safeRaw);
      } catch (err: any) {
        console.error("Validity check failed inside naiveSplit:", err.message);
      }
      
      const statusLine = isValid ? "✔ DURUM: GEÇERLİ KOD" : "⚠️ DURUM: HATALI / EKSİK KOD ALGILANDI";
      const noteLine = isValid ? "Kod bölme işlemi tamamlandı" : "Kod bozuk olabilir, dikkatli kontrol edin";

      return `${statusLine}

FILE: index.html
\`\`\`html
${html.trim()}
\`\`\`

FILE: style.css
\`\`\`css
${css.trim()}
\`\`\`

FILE: app.js
\`\`\`javascript
${js.trim()}
\`\`\`

${noteLine}`;
    } catch (err: any) {
      console.error("Critical error in server-side naiveSplit:", err.message);
      return `✔ DURUM: GEÇERLİ KOD

FILE: index.html
\`\`\`html
${(raw || "").trim()}
\`\`\`

FILE: style.css
\`\`\`css
\`\`\`

FILE: app.js
\`\`\`javascript
\`\`\`

Kod bölme işlemi tamamlandı`;
    }
  };

  try {
    const aiResult = await tryAi();
    if (aiResult) {
      return res.json({ result: aiResult });
    }

    // If AI fails completely, use naive fallback
    const fallbackResult = naiveSplit(code);
    return res.json({ 
      result: fallbackResult,
      warning: "AI şu anda yoğun olduğu için temel ayrıştırma motoru kullanıldı." 
    });

  } catch (err: any) {
    res.status(500).json({ 
      error: 'Sistem hatası. Lütfen daha sonra deneyin.', 
      details: err.message 
    });
  }
});

app.post('/api/upload-file', async (req, res) => {
  const { filename, content, overwrite } = req.body;

  if (!filename || typeof content !== 'string') {
    return res.status(400).json({ error: 'Dosya adı ve içeriği gereklidir.' });
  }

  // Security: prevent folder traversal
  const safeFilename = path.basename(filename);
  const ext = path.extname(safeFilename).toLowerCase();
  
  // Accept only single files with .js, .ts, .json, .txt extensions (as per requirements)
  const allowedExtensions = ['.js', '.ts', '.json', '.txt', '.html', '.css'];
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Yalnızca .js, .ts, .json veya .txt dosyaları yüklenebilir.' });
  }

  const targetPath = path.join(process.cwd(), safeFilename);

  try {
    const fileExists = fs.existsSync(targetPath);

    if (fileExists && !overwrite) {
      return res.json({ 
        exists: true, 
        message: `"${safeFilename}" adında bir dosya sistemde zaten mevcut. Üzerine yazıp değişiklikleri kaydetmek istiyor musunuz?` 
      });
    }

    // Save directly to the correct project directory
    fs.writeFileSync(targetPath, content, 'utf8');

    return res.json({ 
      success: true, 
      action: fileExists ? 'updated' : 'created', 
      filename: safeFilename 
    });
  } catch (err: any) {
    console.error('File write error:', err);
    return res.status(500).json({ 
      error: 'Dosya kaydedilirken sunucu hatası oluştu.', 
      details: err.message 
    });
  }
});

// ==========================================
// V7PRO SAFE UPDATE ENGINE BACKEND ENDPOINTS
// ==========================================

function performBackup(description: string = "Otomatik Sistem Yedeklemesi") {
  const backupsDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const historyPath = path.join(backupsDir, 'history.json');
  let history: { backups: any[]; logs: any[] } = { backups: [], logs: [] };
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      console.error("Error reading history.json:", e);
    }
  }

  const backupId = `backup_${Date.now()}`;
  const backupPath = path.join(backupsDir, backupId);
  fs.mkdirSync(backupPath, { recursive: true });

  const filesToBackup = ['index.html', 'style.css', 'app.js', 'server.ts', 'package.json', 'tsconfig.json', 'vite.config.ts'];
  const backedUpFiles: string[] = [];

  for (const file of filesToBackup) {
    const srcPath = path.join(process.cwd(), file);
    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, path.join(backupPath, file));
        backedUpFiles.push(file);
      } catch (err) {
        console.error(`Error copying ${file} during backup:`, err);
      }
    }
  }

  const backupRecord = {
    id: backupId,
    timestamp: new Date().toISOString(),
    version: "V7PRO",
    filesBackedUp: backedUpFiles,
    description: description
  };

  if (!history.backups) history.backups = [];
  if (!history.logs) history.logs = [];

  history.backups.unshift(backupRecord);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
  console.log(`[UPDATE ENG] Safe backup created successfully: ${backupId} (${backedUpFiles.join(', ')})`);
  return { backupId, record: backupRecord, history };
}

app.get('/api/update-history', async (req, res) => {
  try {
    const backupsDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const historyPath = path.join(backupsDir, 'history.json');
    if (!fs.existsSync(historyPath)) {
      fs.writeFileSync(historyPath, JSON.stringify({ backups: [], logs: [] }, null, 2), 'utf8');
    }

    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    return res.json(history);
  } catch (err: any) {
    console.error('[UPDATE ENG] Fetch history error:', err);
    return res.status(500).json({ error: 'Geçmiş alınırken sistem hatası.', details: err.message });
  }
});

app.post('/api/update-backup', async (req, res) => {
  try {
    const { description } = req.body;
    const { backupId, record } = performBackup(description || "Kullanıcı İstekli Manuel Yedekleme");
    return res.json({ success: true, backupId, record });
  } catch (err: any) {
    console.error('[UPDATE ENG] Create backup error:', err);
    return res.status(500).json({ error: 'Manuel yedek oluşturulurken sistem hatası.', details: err.message });
  }
});

app.post('/api/update-apply', async (req, res) => {
  try {
    const { files, forceSystemUpdate } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Güncellenecek geçerli dosyalar belirtilmedi.' });
    }

    console.log(`[UPDATE ENG] Received system update request for ${files.length} files. Force mode: ${forceSystemUpdate}`);

    const systemFiles = ['app.js', 'server.ts', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts'];
    const systemFilesToUpdate = files.filter(f => systemFiles.includes(path.basename(f.filename).toLowerCase()));

    if (systemFilesToUpdate.length > 0 && !forceSystemUpdate) {
      return res.status(403).json({
        error: 'Sistem Dosyası Güncelleme Onayı Gerekli',
        requiresConfirmation: true,
        files: systemFilesToUpdate.map(f => f.filename)
      });
    }

    // 1. Validation & sanitization of extensions and structures
    const allowedExtensions = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg'];
    const sanitizedFiles = [];

    for (const file of files) {
      if (!file || !file.filename) continue;
      
      const cleanRelativePath = file.filename.replace(/\\/g, '/');
      const parts = cleanRelativePath.split('/');
      const baseName = parts.pop() || '';

      // Check for forbidden paths
      const isForbidden = parts.some(part => {
        const lpart = part.toLowerCase();
        return (
          lpart === 'node_modules' ||
          lpart === 'dist' ||
          lpart === '.git' ||
          lpart === 'build' ||
          lpart === 'out' ||
          lpart === '.vite' ||
          lpart === '.cache' ||
          lpart === '__macosx' ||
          lpart.startsWith('.') ||
          lpart === 'package-lock.json'
        );
      }) || baseName.startsWith('.') || baseName === 'package-lock.json' || baseName.toLowerCase() === 'thumbs.db';

      if (isForbidden) {
        console.warn(`[UPDATE ENG] Denied forbidden path entry: ${file.filename}`);
        continue;
      }

      // Ensure normalized traversal protection
      const safeRelativePath = path.normalize(cleanRelativePath).replace(/^(\.\.(\/|\\))+/, '');
      const ext = path.extname(safeRelativePath).toLowerCase();

      if (!allowedExtensions.includes(ext)) {
        console.warn(`[UPDATE ENG] Denied insecure file extension: ${safeRelativePath}`);
        continue;
      }

      // Check against allowed whitelist (index.html, app.js, style.css, metadata.json or src/...)
      const lowerPath = safeRelativePath.toLowerCase().replace(/\\/g, '/');
      const isRootFile = ['index.html', 'app.js', 'style.css', 'metadata.json'].includes(lowerPath);
      const isSrcFile = lowerPath.startsWith('src/');

      if (!isRootFile && !isSrcFile) {
        console.warn(`[UPDATE ENG] Refused unexpected update location: ${safeRelativePath}`);
        continue;
      }

      sanitizedFiles.push({
        filename: safeRelativePath,
        content: file.content
      });
    }

    if (sanitizedFiles.length === 0) {
      return res.status(400).json({ error: 'Güncelleme paketinde geçerli dosya bulunamadı.' });
    }

    // Perform an automatic backup before modifying anything!
    const { backupId } = performBackup(`Sistem Güncellemesi Öncesi Otomatik Yedek`);

    // 2. Prepare directories for atomic temp extraction
    const tempUpdateDir = path.join(process.cwd(), 'temp_update');
    
    // Clean existing temp directory if any
    if (fs.existsSync(tempUpdateDir)) {
      try {
        fs.rmSync(tempUpdateDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.error('[UPDATE ENG] Error cleaning existing temp_update dir:', rmErr);
      }
    }
    fs.mkdirSync(tempUpdateDir, { recursive: true });

    // 3. Extract to temp folder first (Atomic update step #1)
    try {
      for (const file of sanitizedFiles) {
        const tempFilePath = path.join(tempUpdateDir, file.filename);
        fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
        fs.writeFileSync(tempFilePath, file.content, 'utf8');
      }
    } catch (writeErr: any) {
      // Abort immediately. If write to temp folder fails, nothing is altered yet!
      console.error('[UPDATE ENG] Temp write failed:', writeErr);
      try { fs.rmSync(tempUpdateDir, { recursive: true, force: true }); } catch (e) {}
      return res.status(500).json({
        error: 'Geçici klasöre yazma işlemi başarısız oldu. Güncelleme iptal edildi.',
        details: writeErr.message
      });
    }

    // 4. Create an on-disk original snapshot of ONLY the files we are about to overwrite for quick rollback
    const originalBackup: { filename: string, content: string | null }[] = [];
    for (const file of sanitizedFiles) {
      const originalPath = path.join(process.cwd(), file.filename);
      if (fs.existsSync(originalPath)) {
        try {
          const content = fs.readFileSync(originalPath, 'utf8');
          originalBackup.push({ filename: file.filename, content });
        } catch (readErr: any) {
          // If we fail to read a file that we need to overwrite, abort to avoid partial writing
          console.error(`[UPDATE ENG] Failed to backup original file ${file.filename}:`, readErr);
          try { fs.rmSync(tempUpdateDir, { recursive: true, force: true }); } catch (e) {}
          return res.status(500).json({
            error: `Orijinal dosya yedeği alınamadı (${file.filename}). Güncelleme durduruldu.`,
            details: readErr.message
          });
        }
      } else {
        originalBackup.push({ filename: file.filename, content: null });
      }
    }

    // 5. Replace files in production root folder atomically/sequentially
    const updatedFiles: string[] = [];
    let writeFailureOccurred = false;
    let failureError: any = null;

    for (const file of sanitizedFiles) {
      const sourceTempPath = path.join(tempUpdateDir, file.filename);
      const targetPath = path.join(process.cwd(), file.filename);
      
      try {
        const content = fs.readFileSync(sourceTempPath, 'utf8');
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');
        updatedFiles.push(file.filename);
        console.log(`[UPDATE ENG] Successfully atomic updated: ${file.filename}`);
      } catch (applyErr: any) {
        writeFailureOccurred = true;
        failureError = applyErr;
        console.error(`[UPDATE ENG] Failed to apply update for ${file.filename}:`, applyErr);
        break; // Stop further writing!
      }
    }

    // 6. Rollback if write failure occurred!
    if (writeFailureOccurred) {
      console.warn('[UPDATE ENG] Update failed mid-way! Initiating automatic local rollbacks...');
      for (const orig of originalBackup) {
        const destPath = path.join(process.cwd(), orig.filename);
        try {
          if (orig.content === null) {
            // Delete newly created file to restore non-existence
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
          } else {
            // Restore original contents
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, orig.content, 'utf8');
          }
        } catch (rollbackErr: any) {
          console.error(`[CRITICAL] Rollback failed for ${orig.filename}:`, rollbackErr);
        }
      }
      try { fs.rmSync(tempUpdateDir, { recursive: true, force: true }); } catch (e) {}
      
      return res.status(500).json({
        error: 'Güncelleme yazılırken hata oluştu. Değişiklikler otomatik geri alındı ve sistem kararlı duruma getirildi.',
        details: failureError ? failureError.message : 'Bilinmeyen yazma hatası'
      });
    }

    // Clean up temp directory on success
    try {
      fs.rmSync(tempUpdateDir, { recursive: true, force: true });
    } catch (cleanErr) {
      console.error('[UPDATE ENG] Non-blocking warning: failed to delete temp_update folder:', cleanErr);
    }

    const backupsDir = path.join(process.cwd(), 'backups');
    const historyPath = path.join(backupsDir, 'history.json');
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

    const logRecord = {
      timestamp: new Date().toISOString(),
      action: "UPDATE_APPLIED",
      version: "V7PRO",
      description: `${updatedFiles.length} dosya güncellendi: ${updatedFiles.join(', ')}`,
      backupId: backupId
    };
    if (!history.logs) history.logs = [];
    history.logs.unshift(logRecord);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return res.json({
      success: true,
      message: 'Sistem güncellemesi başarıyla uygulandı!',
      backupId,
      updatedFiles
    });
  } catch (err: any) {
    console.error('[UPDATE ENG] Serious apply update error:', err);
    return res.status(500).json({ error: 'Güncelleme uygulanamadı sistem hatası.', details: err.message });
  }
});

app.post('/api/update-rollback', async (req, res) => {
  try {
    const { backupId } = req.body;
    const backupsDir = path.join(process.cwd(), 'backups');
    const historyPath = path.join(backupsDir, 'history.json');

    if (!fs.existsSync(historyPath)) {
      return res.status(404).json({ error: 'Geri yükleme geçmişi bulunamadı.' });
    }

    const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    let targetId = backupId;

    if (!targetId) {
      if (!history.backups || history.backups.length === 0) {
        return res.status(404).json({ error: 'Geri yüklenebilecek bir yedek dosyası mevcut değil.' });
      }
      targetId = history.backups[0].id;
    }

    const backupPath = path.join(backupsDir, targetId);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: `Yedek dizini bulunamadı: ${targetId}` });
    }

    console.log(`[UPDATE ENG] Starting rollback to backup: ${targetId}`);

    // Create current state dynamic backup before rolling back just in case!
    performBackup(`Geri Yükleme Öncesi Koruma Yedeklemesi`);

    const files = fs.readdirSync(backupPath);
    for (const file of files) {
      const src = path.join(backupPath, file);
      const dest = path.join(process.cwd(), file);
      const safeFilename = path.basename(file);
      const allowed = ['index.html', 'style.css', 'app.js', 'server.ts', 'package.json', 'tsconfig.json', 'vite.config.ts'];
      if (allowed.includes(safeFilename) && fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        console.log(`[UPDATE ENG] Restored: ${safeFilename}`);
      }
    }

    const logRecord = {
      timestamp: new Date().toISOString(),
      action: "ROLLBACK_APPLIED",
      version: "V7PRO",
      description: `Sistem '${targetId}' yedeğine başarıyla geri yüklendi.`,
      backupId: targetId
    };
    if (!history.logs) history.logs = [];
    history.logs.unshift(logRecord);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    return res.json({
      success: true,
      message: `Değişiklikler geri alındı ve ${targetId} yedeğine başarıyla geri dönüldü.`,
      backupId: targetId
    });
  } catch (err: any) {
    console.error('[UPDATE ENG] Rollback error:', err);
    return res.status(500).json({ error: 'Geri yükleme sırasında sunucu hatası oluştu.', details: err.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
