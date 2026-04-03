const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const sqlite3 = require('sqlite3');

const app = express();
app.use(express.json());

const sessions = new Map(); // clientId -> { sock, qr, status, authState }

// Usar disco persistente de Render si está disponible, sino usar local
const dbDir = process.env.NODE_ENV === 'production' && fs.existsSync('/data') 
  ? '/data' 
  : path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const sessionsDir = path.join(dbDir, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

// Inicializar SQLite
const dbPath = path.join(dbDir, 'sessions.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error abriendo BD:', err);
  else console.log('✓ Conectado a SQLite en:', dbPath);
});

// Crear tabla de sesiones si no existe
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      clientId TEXT PRIMARY KEY,
      qr TEXT,
      status TEXT,
      createdAt TEXT,
      lastUpdated TEXT
    )
  `);
});

// Helper para ejecutar queries de forma sincrónica en callbacks
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Logger silencioso
const logger = pino({ level: 'silent' });

// Función para restaurar sesiones al iniciar
async function restoreSessions() {
  console.log('🔄 Restaurando sesiones previas...');
  
  return new Promise((resolve, reject) => {
    db.all('SELECT clientId, status FROM sessions WHERE status = ?', ['connected'], async (err, rows) => {
      if (err) {
        console.error('Error restaurando sesiones:', err);
        return resolve();
      }

      if (!rows || rows.length === 0) {
        console.log('✓ No hay sesiones previas para restaurar');
        return resolve();
      }

      console.log(`📦 Encontradas ${rows.length} sesión(es) para restaurar`);

      for (const row of rows) {
        try {
          const { clientId } = row;
          const sessionPath = path.join(sessionsDir, clientId);
          
          // Verificar si existen archivos de sesión
          if (!fs.existsSync(sessionPath)) {
            console.log(`⚠️  No hay archivos para ${clientId}, omitiendo...`);
            continue;
          }

          console.log(`🔌 Reconectando ${clientId}...`);
          await reconnect(clientId);
        } catch (error) {
          console.error(`Error restaurando ${row.clientId}:`, error.message);
        }
      }

      console.log('✓ Restauración completada');
      resolve();
    });
  });
}

// POST /connect/:clientId - Genera conexión y devuelve QR
app.post('/connect/:clientId', async (req, res) => {
  const { clientId } = req.params;
  
  try {
    if (sessions.has(clientId) && sessions.get(clientId).status === 'connected') {
      return res.json({ status: 'already-connected', message: 'Ya está conectado' });
    }

    const sessionPath = path.join(sessionsDir, clientId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['WhatsApp API', 'Chrome', '4.0.0']
    });

    let qrData = null;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrData = await QRCode.toDataURL(qr);
        sessions.set(clientId, { sock, qr: qrData, status: 'needs-scan', authState: { state, saveCreds } });
        // Guardar en SQLite
        await dbRun(
          `INSERT OR REPLACE INTO sessions (clientId, qr, status, createdAt, lastUpdated)
           VALUES (?, ?, ?, ?, ?)`,
          [clientId, qrData, 'needs-scan', new Date().toISOString(), new Date().toISOString()]
        );
      }

      if (connection === 'open') {
        sessions.set(clientId, { sock, qr: null, status: 'connected', authState: { state, saveCreds } });
        // Guardar en SQLite
        await dbRun(
          `INSERT OR REPLACE INTO sessions (clientId, qr, status, createdAt, lastUpdated)
           VALUES (?, ?, ?, ?, ?)`,
          [clientId, null, 'connected', new Date().toISOString(), new Date().toISOString()]
        );
        console.log(`✓ Cliente ${clientId} conectado`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log(`↻ Reconectando ${clientId}...`);
          setTimeout(() => reconnect(clientId), 3000);
        } else {
          sessions.delete(clientId);
          await dbRun('DELETE FROM sessions WHERE clientId = ?', [clientId]);
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`✗ Cliente ${clientId} desconectado (logout)`);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Esperar QR (máximo 10 segundos)
    for (let i = 0; i < 20; i++) {
      if (qrData) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (qrData) {
      res.json({ status: 'needs-scan', qr: qrData, message: 'Escanea el QR' });
    } else {
      res.json({ status: 'connecting', message: 'Conectando...' });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /connect/:clientId - Verifica estado de conexión
app.get('/connect/:clientId', (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  if (!session) {
    return res.json({ status: 'disconnected', message: 'No hay sesión activa' });
  }

  // Construir URL completa del QR (funciona en local y producción)
  const protocol = req.protocol;
  const host = req.get('host');
  const qrUrl = session.qr ? `${protocol}://${host}/qr/${clientId}` : null;

  res.json({
    status: session.status,
    qr: session.qr || null,
    qr_url: qrUrl,
    message: session.status === 'connected' ? 'Conectado' : 'Esperando escaneo'
  });
});

// GET /qr/:clientId - Muestra el QR directamente como imagen PNG
app.get('/qr/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  if (!session || !session.qr) {
    return res.status(404).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>❌ No hay QR disponible</h2>
          <p>Primero conecta con: POST /connect/${clientId}</p>
        </body>
      </html>
    `);
  }

  // Convertir base64 a buffer
  const base64Data = session.qr.replace(/^data:image\/png;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');

  // Devolver imagen PNG directamente
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': imgBuffer.length
  });
  res.end(imgBuffer);
});

// POST /send/:clientId - Envía documento o mensaje de texto
app.post('/send/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { telefono, url_documento, caption = '' } = req.body;

  if (!telefono) {
    return res.status(400).json({ error: 'Falta parámetro requerido: telefono' });
  }

  const session = sessions.get(clientId);
  if (!session || session.status !== 'connected') {
    return res.status(400).json({ estado: 'fallido', mensaje: 'Cliente no conectado' });
  }

  try {
    // Formatear número
    let jid = telefono.replace(/[^0-9]/g, '');
    if (!jid.includes('@')) jid += '@s.whatsapp.net';

    let result;

    // Si hay documento, enviarlo
    if (url_documento) {
      const response = await axios.get(url_documento, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const fileName = path.basename(new URL(url_documento).pathname) || 'documento.pdf';
      const mimeType = response.headers['content-type'] || 'application/pdf';

      result = await session.sock.sendMessage(jid, {
        document: buffer,
        fileName: fileName,
        mimetype: mimeType,
        caption: caption
      });

      console.log(`✓ Documento enviado a ${telefono} (${clientId})`);
    } else {
      // Si no hay documento, enviar solo mensaje de texto
      const messageText = caption || ' '; // Si caption está vacío, enviar espacio
      result = await session.sock.sendMessage(jid, {
        text: messageText
      });

      console.log(`✓ Mensaje enviado a ${telefono} (${clientId})`);
    }
    
    res.json({
      estado: 'enviado',
      mensaje: url_documento ? 'Documento enviado correctamente' : 'Mensaje enviado correctamente',
      id_mensaje: result.key.id,
      destinatario: telefono
    });
    
  } catch (error) {
    console.error('Error enviando:', error.message);
    res.status(500).json({
      estado: 'fallido',
      mensaje: error.message
    });
  }
});

// GET /status/:clientId - Estado de la conexión
app.get('/status/:clientId', (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  res.json({
    clientId,
    status: session ? session.status : 'disconnected',
    connected: session?.status === 'connected'
  });
});

// Función de reconexión automática
async function reconnect(clientId) {
  try {
    const sessionPath = path.join(sessionsDir, clientId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        sessions.set(clientId, { sock, qr: null, status: 'connected', authState: { state, saveCreds } });
        // Guardar en SQLite
        await dbRun(
          `INSERT OR REPLACE INTO sessions (clientId, qr, status, createdAt, lastUpdated)
           VALUES (?, ?, ?, ?, ?)`,
          [clientId, null, 'connected', new Date().toISOString(), new Date().toISOString()]
        );
        console.log(`✓ Cliente ${clientId} reconectado`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) setTimeout(() => reconnect(clientId), 5000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error(`Error reconectando ${clientId}:`, error.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 API WhatsApp escuchando en puerto ${PORT}`);
  console.log(`💾 Base de datos SQLite: ${dbPath}`);
  console.log(`📡 Endpoints:`);
  console.log(`   POST /connect/:clientId  - Conectar y obtener QR`);
  console.log(`   GET  /qr/:clientId       - Ver QR en navegador`);
  console.log(`   GET  /connect/:clientId  - Verificar estado`);
  console.log(`   POST /send/:clientId     - Enviar documento`);
  console.log(`   GET  /status/:clientId   - Estado conexión`);
  
  // Restaurar sesiones después de iniciar el servidor
  try {
    await restoreSessions();
  } catch (error) {
    console.error('Error en restauración de sesiones:', error);
  }
});

// Cerrar BD al terminar
process.on('SIGINT', () => {
  db.close(() => {
    console.log('\n📊 Base de datos cerrada');
    process.exit(0);
  });
});
