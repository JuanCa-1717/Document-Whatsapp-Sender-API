// clean-sessions.js - Limpia todas las sesiones guardadas

const fs = require('fs');
const path = require('path');

const sessionsDir = path.join(__dirname, 'sessions');
const tokensDir = path.join(__dirname, 'tokens');

function cleanDirectory(dir, name) {
  if (fs.existsSync(dir)) {
    console.log(`🗑️  Limpiando ${name}...`);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✓ ${name} eliminado`);
  } else {
    console.log(`ℹ️  ${name} no existe`);
  }
}

console.log('🧹 Iniciando limpieza de sesiones...\n');

cleanDirectory(sessionsDir, 'sessions/');
cleanDirectory(tokensDir, 'tokens/');

console.log('\n✅ Limpieza completada');
console.log('Puedes reiniciar el servidor con: npm start');
