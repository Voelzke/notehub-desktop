const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { pathToFileURL } = require('url');

let mainWindow;
let watcher = null;
const isDev = process.argv.includes('--dev');
const savingFiles = new Set();

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Register custom protocol for local image serving (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([{
  scheme: 'notehub',
  privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true }
}]);

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match) {
    try {
      const frontmatter = yaml.load(match[1]) || {};
      return { frontmatter, body: match[2] };
    } catch (e) {
      return { frontmatter: {}, body: content };
    }
  }
  return { frontmatter: {}, body: content };
}

function buildFrontmatter(frontmatter) {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return '';
  return '---\n' + yaml.dump(frontmatter, { lineWidth: -1, quotingType: "'", forceQuotes: false }).trim() + '\n---\n';
}

function readNotesFromFolder(notesPath) {
  if (!notesPath || !fs.existsSync(notesPath)) return [];
  const files = fs.readdirSync(notesPath).filter(f => f.endsWith('.md'));
  return files.map(filename => {
    try {
      const filePath = path.join(notesPath, filename);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const stats = fs.statSync(filePath);
      return {
        filename,
        title: filename.replace(/\.md$/, ''),
        frontmatter,
        body,
        modified: stats.mtimeMs,
        created: stats.birthtimeMs
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function startWatcher(notesPath) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (!notesPath || !fs.existsSync(notesPath)) return;

  try {
    const chokidar = require('chokidar');
    watcher = chokidar.watch(path.join(notesPath, '*.md'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 }
    });
    watcher.on('all', (event, filePath) => {
      const fname = path.basename(filePath);
      if (savingFiles.has(fname)) {
        console.log('[Watcher] Ignoring own save for:', fname);
        savingFiles.delete(fname);
        return;
      }
      console.log('[Watcher] External change:', event, fname);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('files-changed', { event, filename: fname });
      }
    });
  } catch (e) {
    console.error('Watcher error:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'NoteHub Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Protocol handler for local images
  protocol.handle('notehub', (request) => {
    const settings = loadSettings();
    if (!settings.notesPath) return new Response('Not found', { status: 404 });
    const url = new URL(request.url);
    const filePath = path.join(settings.notesPath, decodeURIComponent(url.pathname));
    return net.fetch(pathToFileURL(filePath).href);
  });

  createWindow();

  // IPC Handlers
  ipcMain.handle('get-notes-path', () => {
    const settings = loadSettings();
    return settings.notesPath || null;
  });

  ipcMain.handle('set-notes-path', (event, notesPath) => {
    const settings = loadSettings();
    settings.notesPath = notesPath;
    saveSettings(settings);
    startWatcher(notesPath);
    return true;
  });

  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Notizen-Ordner auswählen'
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('read-notes', (event) => {
    const settings = loadSettings();
    if (!settings.notesPath) return [];
    return readNotesFromFolder(settings.notesPath);
  });

  ipcMain.handle('read-note', (event, filename) => {
    const settings = loadSettings();
    if (!settings.notesPath) return null;
    const filePath = path.join(settings.notesPath, filename);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    return { filename, title: filename.replace(/\.md$/, ''), frontmatter, body };
  });

  ipcMain.handle('save-note', (event, { filename, newFilename, frontmatter, body }) => {
    console.log('[IPC:save-note] Saving:', filename, newFilename ? '-> ' + newFilename : '');
    const settings = loadSettings();
    if (!settings.notesPath) {
      console.log('[IPC:save-note] ERROR: No notes path configured');
      return { success: false, error: 'No notes path' };
    }

    try {
      const content = buildFrontmatter(frontmatter) + body;
      const targetFilename = newFilename || filename;
      const filePath = path.join(settings.notesPath, targetFilename);

      // If filename changed, delete old file
      if (newFilename && newFilename !== filename) {
        const oldPath = path.join(settings.notesPath, filename);
        if (fs.existsSync(oldPath)) {
          savingFiles.add(filename);
          fs.unlinkSync(oldPath);
        }
      }

      savingFiles.add(targetFilename);
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('[IPC:save-note] OK:', targetFilename, '(' + content.length + ' bytes)');
      return { success: true, filename: targetFilename };
    } catch (e) {
      console.log('[IPC:save-note] ERROR:', e.message);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-note', (event, filename) => {
    const settings = loadSettings();
    if (!settings.notesPath) return { success: false };
    try {
      const filePath = path.join(settings.notesPath, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('save-image', (event, { buffer, filename }) => {
    const settings = loadSettings();
    if (!settings.notesPath) return { success: false, error: 'No notes path' };
    try {
      const imagesDir = path.join(settings.notesPath, 'images');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, filename), Buffer.from(buffer));
      return { success: true, path: `images/${filename}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('pick-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const srcPath = result.filePaths[0];
      const ext = path.extname(srcPath);
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const filename = `img_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ext}`;
      const settings = loadSettings();
      if (!settings.notesPath) return { success: false };
      const imagesDir = path.join(settings.notesPath, 'images');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(imagesDir, filename));
      return { success: true, path: `images/${filename}` };
    }
    return { success: false };
  });

  // Startup: verify file system write access
  const settings = loadSettings();
  console.log('[main] Settings loaded:', JSON.stringify(settings));
  if (settings.notesPath) {
    try {
      const testFile = path.join(settings.notesPath, '.notehub-write-test');
      fs.writeFileSync(testFile, 'test', 'utf-8');
      fs.unlinkSync(testFile);
      console.log('[main] File system write test: OK');
    } catch (e) {
      console.error('[main] File system write test: FAILED', e.message);
    }
    startWatcher(settings.notesPath);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (watcher) watcher.close();
  if (process.platform !== 'darwin') app.quit();
});
