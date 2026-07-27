/**
 * test-usb.js - Herramienta de diagnostico USB para sucursales
 * Uso: node test-usb.js
 * 
 * Muestra todos los dispositivos USB conectados con su VID/PID
 * para identificar la impresora antes de configurarla.
 */
const usb    = require('usb');
const fs     = require('fs');
const path   = require('path');

console.log('=== DIAGNOSTICO USB - POS Printer EscalaNET ===\n');
console.log('Version usb:', require('usb/package.json').version);

// --- 1. Todos los dispositivos USB conectados ---
console.log('\n=== DISPOSITIVOS USB CONECTADOS ===');
try {
  const devices = usb.getDeviceList();
  if (devices.length === 0) {
    console.log('No se detectaron dispositivos USB. Verificar permisos.');
  } else {
    console.log(`Encontrados ${devices.length} dispositivos:\n`);
    devices.forEach((d, i) => {
      console.log(
        `  [${i + 1}] VID: ${d.deviceDescriptor.idVendor.toString().padStart(5)} ` +
        `| PID: ${d.deviceDescriptor.idProduct.toString().padStart(5)} ` +
        `| Clase: ${d.deviceDescriptor.bDeviceClass}`
      );
    });
  }
} catch (e) {
  console.error('Error al obtener lista USB:', e.message);
}

// --- 2. Impresoras detectadas por clase USB (clase 7 = PRINTER) ---
console.log('\n=== IMPRESORAS DETECTADAS (clase USB 7) ===');
try {
  const adapter  = require('@node-escpos/usb-adapter');
  const printers = adapter.findPrinter();
  if (!printers || printers.length === 0) {
    console.log('Ninguna impresora detectada por clase USB.');
    console.log('-> Asegurate de que el driver WinUSB este instalado (Zadig).');
  } else {
    printers.forEach((p, i) => {
      console.log(
        `  [${i + 1}] VID: ${p.deviceDescriptor.idVendor} ` +
        `| PID: ${p.deviceDescriptor.idProduct}`
      );
    });
  }
} catch (e) {
  console.error('Error en findPrinter():', e.message);
}

// --- 3. Config guardada en esta PC ---
console.log('\n=== CONFIGURACION GUARDADA (config.json) ===');
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log('  VID:', config.vid);
  console.log('  PID:', config.pid);
  console.log('  Encoding:', config.encoding || 'CP858 (default)');
} else {
  console.log('  Sin configuracion. Usa /api/configurar-impresora para guardar VID/PID.');
}

console.log('\n=== FIN DEL DIAGNOSTICO ===');
