const express = require('express');
const cors = require('cors');

// Importamos los nuevos módulos modernos de ESC/POS (@node-escpos/core y usb-adapter)
const { Printer, Image } = require('@node-escpos/core');
// Importamos el adaptador USB. Usualmente en CommonJS requerimos el .default
const USB = require('@node-escpos/usb-adapter');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// Acceso de bajo nivel a USB: lista TODOS los dispositivos sin filtrar por marca
const usbRaw = require('usb');

// Adaptador para escribir directamente a una ruta de red o impresora compartida en Windows
class WindowsSMBAdapter {
  constructor(printerShareName) {
    if (printerShareName.startsWith('\\\\')) {
      this.path = printerShareName;
    } else {
      this.path = `\\\\127.0.0.1\\${printerShareName}`;
    }
  }
  open(cb) {
    try {
      this.stream = fs.createWriteStream(this.path);
      this.stream.on('open', () => cb && cb(null));
      this.stream.on('error', (err) => cb && cb(err));
    } catch (e) {
      if (cb) cb(e);
    }
  }
  write(data, cb) {
    if (this.stream) this.stream.write(data, cb);
    else if (cb) cb(new Error('Stream no abierto'));
  }
  close(cb) {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    if (cb) cb(null);
  }
}

const app = express();
const PUERTO = 5000;

// Cambia esto por el dominio real de tu sistema en Hostinger
const ORIGENES_PERMITIDOS = [
  'https://zapinet.escalanet.com.bo', // Tu dominio real
  'http://localhost:8080', // para cuando pruebes en desarrollo
];

// Configuramos CORS para permitir peticiones desde tu frontend
app.use(cors({ origin: ORIGENES_PERMITIDOS }));
app.use(express.json());

// IMPORTANTE: header necesario para que Chrome permita que una página HTTPS
// llame a un servidor local HTTP (Private Network Access). Sin esto,
// el fetch/axios desde tu Vue puede fallar de forma intermitente.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

// ---------------------------------------------------------------
// Configuración persistente por PC (se setea una sola vez por sucursal)
// ---------------------------------------------------------------
const appDataPath = process.env.APPDATA 
  ? path.join(process.env.APPDATA, 'POSPrinterEscalaNET') 
  : path.join(process.pkg ? path.dirname(process.execPath) : __dirname, 'data');

if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}

const CONFIG_PATH = path.join(appDataPath, 'config.json');

function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function guardarConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * GET /api/detectar
 * Lista TODOS los dispositivos USB conectados (sin filtrar por marca),
 * para que en la primera configuración de la sucursal se elija cuál es la impresora.
 * También devuelve cuál está configurada actualmente en config.json.
 */
const KNOWN_VENDORS = {
  1208: 'Epson',
  4070: 'Impresora Térmica (Knup/Generica)',
  1046: 'Impresora Térmica (Zjiang/Generica)',
  5380: 'Bixolon',
  1409: 'Logic Controls',
  2954: 'Bematech',
  1529: 'Star Micronics',
  10032: 'Citizen',
  2655: 'Zebra',
  8137: 'Xprinter (NXP)',
  1155: 'Xprinter/Rongta (STM)',
  3322: 'Sam4s'
};

app.get('/api/detectar', (req, res) => {
  let listado = [];
  try {
    // getDeviceList() lista absolutamente todo lo conectado por USB (impresora, mouse, hub...)
    // sin depender de listas internas de VID conocidos — funciona con cualquier marca
    const dispositivos = usbRaw.getDeviceList();
    listado = dispositivos.map((d) => {
      const vendorName = KNOWN_VENDORS[d.deviceDescriptor.idVendor] || 'Dispositivo USB';
      return {
        vid: d.deviceDescriptor.idVendor,
        pid: d.deviceDescriptor.idProduct,
        name: `${vendorName} (VID: ${d.deviceDescriptor.idVendor} | PID: ${d.deviceDescriptor.idProduct})`,
      };
    });
  } catch (error) {
    console.error('Error listando dispositivos USB:', error.message || error);
  }

  // --- NUEVO: Buscar impresoras compartidas en Windows (SMB) ---
  try {
    const stdout = execSync('wmic printer get Name,ShareName /format:csv', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lineas = stdout.trim().split('\n');
    for (let i = 1; i < lineas.length; i++) {
      const partes = lineas[i].trim().split(',');
      if (partes.length >= 3) {
        const shareName = partes[2].trim();
        if (shareName) {
           listado.push({
             vid: 'smb',
             pid: shareName,
             name: `Red Compartida (Windows): ${shareName}`
           });
        }
      }
    }
  } catch (error) {
    console.error('Error listando impresoras de red:', error.message);
  }
  // -------------------------------------------------------------

  // Impresora virtual siempre disponible para pruebas sin gastar papel
  listado.push({
    name: 'Impresora Virtual (Simulador Terminal)',
    vid: 'simulador',
    pid: 'simulador',
  });

  res.json({
    conectado: true,
    dispositivos: listado,
    configuradaActualmente: leerConfig(), // muestra cuál ya está guardada en esta PC
  });
});

/**
 * POST /api/configurar-impresora
 * Guarda de forma persistente cuál es la impresora de esta PC (vid/pid/encoding).
 * Se llama UNA sola vez por sucursal, desde el panel de configuración de Vue.
 * Body: { "vid": 1046, "pid": 20497, "encoding": "CP858" }
 */
app.post('/api/configurar-impresora', (req, res) => {
  const { vid, pid, encoding } = req.body;
  if (!vid || !pid) {
    return res.status(400).json({ ok: false, mensaje: 'Faltan vid/pid en la petición.' });
  }
  guardarConfig({ vid, pid, encoding: encoding || 'CP858' });
  res.json({ ok: true, mensaje: 'Impresora configurada correctamente para esta PC.' });
});

/**
 * GET /estado
 * Chequeo rápido de que el puente esté corriendo y ver si hay impresora configurada.
 */
app.get('/estado', (req, res) => {
  const config = leerConfig();
  res.json({
    ok: true,
    mensaje: 'Puente activo',
    impresoraConfigurada: !!config,
    config,
  });
});

/**
 * POST /imprimir-ticket
 * Body esperado:
 * {
 *   "empresa": "Mi Negocio S.A.",
 *   "ventaId": 123,
 *   "cliente": "Juan Perez",
 *   "items": [{ "cantidad": 2, "nombre": "Coca Cola", "subtotal": 20.00 }],
 *   "total": 20.00,
 *   "abrirCajon": false
 * }
 */
app.post('/imprimir-ticket', async (req, res) => {
  const datos = req.body;

  // --- MODO SIMULADOR (Imprime en la consola para no gastar papel) ---
  if (datos.vid === 'simulador' || datos.pid === 'simulador') {
    console.log('\n====================================');
    console.log('🖨️  IMPRESIÓN SIMULADA (TICKET)');
    console.log('====================================');
    console.log(`Empresa: ${datos.empresa || 'MI NEGOCIO'}`);
    console.log(`Venta #${datos.ventaId}`);
    console.log(`Fecha: ${new Date().toLocaleString()}`);
    console.log('------------------------------------');
    (datos.items || []).forEach((item) => {
      console.log(`${item.cantidad}x ${item.nombre} | $${Number(item.subtotal).toFixed(2)}`);
    });
    console.log('------------------------------------');
    console.log(`TOTAL: $${Number(datos.total_general || datos.total).toFixed(2)}`);
    console.log('====================================\n');
    return res.json({ ok: true, mensaje: 'Ticket impreso en el SIMULADOR correctamente' });
  }
  // -------------------------------------------------------------------

  // Resolver qué impresora usar:
  // 1. Primero lo que mande Vue explícitamente en el body (vid/pid)
  // 2. Si no viene, usar lo guardado en config.json de esta PC (configurado una sola vez)
  let vid = datos.vid;
  let pid = datos.pid;
  let encoding = datos.encoding;

  if (!vid || !pid) {
    const config = leerConfig();
    if (config) {
      vid = config.vid;
      pid = config.pid;
      encoding = encoding || config.encoding;
    }
  }

  if (!vid || !pid) {
    return res.status(400).json({
      ok: false,
      mensaje: 'No hay ninguna impresora configurada en esta PC. Ve a Configuración e indicá cuál usar.',
    });
  }

  let device;
  try {
    if (vid === 'smb') {
      device = new WindowsSMBAdapter(pid); // pid almacena el shareName
    } else {
      device = new USB(parseInt(vid), parseInt(pid));
    }
  } catch (error) {
    return res.status(503).json({ ok: false, mensaje: 'No se encontró la impresora configurada. Revisá que esté conectada y encendida.' });
  }

  try {
    // 1. ABRIR CONEXIÓN A LA IMPRESORA
    // La versión nueva permite manejar la apertura con Promesas
    await new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 2. CONFIGURAR LA IMPRESORA
    // encoding: 'GB18030' o 'cp858' permite imprimir tildes y caracteres especiales (ñ, á, etc.)
    // CP858 cubre tildes y ñ en térmicas genéricas (Knup, Bematech, Logic Controls, Epson)
    // Agregamos width: 32 que es el estándar para impresoras genéricas de 58mm.
    const printer = new Printer(device, { encoding: encoding || 'CP858', width: 32 });

    // 3. ENVIAR COMANDOS DE IMPRESIÓN
    
    // a. Logotipo (si existe)
    if (datos.logo) {
      try {
        // Obtenemos el tipo de imagen (ej. image/png o image/jpeg), por defecto png
        const mimeTypeMatch = datos.logo.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
        
        const base64Data = datos.logo.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Pasamos el mimeType para evitar el error "Invalid file type"
        const img = await Image.load(buffer, mimeType);
        
        // raster() suele ser mucho más compatible que image() en impresoras genéricas
        printer.align('ct').raster(img); 
      } catch (err) {
        console.error("Error cargando logo en impresora:", err.message);
      }
    }

    // b. Cabecera
    printer
      .font('a')
      .align('ct')
      .style('b')
      .size(1, 1)
      .text(datos.titulo_impresion || 'NOTA DE VENTA')
      .style('normal')
      .text('(SIN DERECHO A CRÉDITO FISCAL)')
      .text(datos.sucursal_nombre || '')
      .text(datos.sucursal_direccion || '')
      .style('b')
      .text(datos.sucursal_ciudad || '')
      .style('normal')
      .text('--------------------------------');

    // c. Datos del cliente y venta
    printer
      .align('lt')
      .tableCustom([
        { text: 'NRO.:', align: 'LEFT', width: 0.35, style: 'b' },
        { text: String(datos.ventaId || ''), align: 'LEFT', width: 0.65 }
      ])
      .tableCustom([
        { text: 'SEÑOR(ES):', align: 'LEFT', width: 0.35, style: 'b' },
        { text: String(datos.cliente || ''), align: 'LEFT', width: 0.65 }
      ])
      .tableCustom([
        { text: 'NIT/CI:', align: 'LEFT', width: 0.35, style: 'b' },
        { text: String(datos.nit || ''), align: 'LEFT', width: 0.65 }
      ])
      .text('--------------------------------');

    // d. Cabecera de la tabla de productos (4 columnas ajustadas a porcentajes exactos)
    printer
      .style('b')
      .tableCustom([
        { text: 'CANT', align: 'LEFT', width: 0.16 },
        { text: 'DETALLE', align: 'LEFT', width: 0.42 },
        { text: 'P.UNI', align: 'RIGHT', width: 0.21 },
        { text: 'TOTAL', align: 'RIGHT', width: 0.21 }
      ])
      .style('normal');

    // e. Filas de productos
    (datos.items || []).forEach(item => {
      // Calculamos el precio unitario (si no viene explícito)
      let pUnit = item.precio !== undefined ? item.precio : (item.cantidad > 0 ? (item.subtotal / item.cantidad) : 0);
      
      // Aseguramos que la cantidad tenga 2 decimales si el diseño lo pide, sino lo dejamos como viene. 
      // Por seguridad y parecido a la imagen, usamos Number(item.cantidad).toFixed(2).replace('.', ',')
      let cantStr = Number(item.cantidad).toFixed(2).replace('.', ',');
      
      if (item.subtotal > 0) {
        printer.tableCustom([
          { text: cantStr, align: 'LEFT', width: 0.16 },
          { text: String(item.nombre).substring(0, 13), align: 'LEFT', width: 0.42 },
          { text: Number(pUnit).toFixed(2).replace('.', ','), align: 'RIGHT', width: 0.21 },
          { text: Number(item.subtotal).toFixed(2).replace('.', ','), align: 'RIGHT', width: 0.21 }
        ]);
      } else {
        // Es un borde o extra sin costo: ocultar cantidad y precio, añadir sangría
        printer.tableCustom([
          { text: '', align: 'LEFT', width: 0.16 },
          { text: `  ${String(item.nombre)}`, align: 'LEFT', width: 0.84 }
        ]);
      }
    });

    // f. Totales (Alineados a la derecha)
    printer
      .text('--------------------------------')
      .tableCustom([
        { text: 'SUBTOTAL:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.subtotal || 0).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
      
    if (datos.descuento > 0) {
      printer.tableCustom([
        { text: 'DESC.:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.descuento).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
    }
    
    // Si no es al contado, mostrar A Cuenta y Saldo
    if (datos.tipo_pago_id && datos.tipo_pago_id !== 1) {
      printer.tableCustom([
        { text: 'A CUENTA:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.a_cuenta || 0).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
      printer.tableCustom([
        { text: 'SALDO:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.saldo || 0).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
      printer.tableCustom([
        { text: 'TOTAL DEBE:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.total_general || 0).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
    } else {
      printer.tableCustom([
        { text: 'TOTAL:', align: 'RIGHT', width: 0.65, style: 'b' },
        { text: Number(datos.total_general || 0).toFixed(2), align: 'RIGHT', width: 0.35 }
      ]);
    }

    // g. Pie de ticket (Letras y metadata)
    printer
      .text('')
      .align('lt')
      .text(`SON: ${datos.total_letras || ''}`)
      .text('--------------------------------')
      .text(`IMPRESO POR: ${datos.cajero || ''}`)
      .text(`EN FECHA: ${new Date().toLocaleString()}`);
      
    if (datos.personal) {
      printer.text(`PERSONAL: ${datos.personal}`);
    }
    if (datos.glosa) {
      printer.text(`GLOSA: ${datos.glosa}`);
    }
    if (datos.canal_venta) {
      printer.text(`CANAL DE VENTA: ${datos.canal_venta}`);
    }
    if (datos.metodo_pago) {
      printer.text(`METODO DE PAGO: ${datos.metodo_pago}`);
    }

    printer
      .text('--------------------------------')
      .align('ct')
      .style('b')
      .text('!GRACIAS POR SU COMPRA!')
      .style('normal')
      .text('')
      .text('')      
      .text('');

    // 6. ABRIR CAJÓN MONEDERO
    if (datos.abrirCajon) {
      // pin 2 o pin 5, usualmente es el 2.
      printer.cashdraw(2);
    }

    // 7. CORTAR PAPEL Y CERRAR CONEXIÓN
    printer.cut();
    printer.close(); // Cerramos la conexión para que otra app o impresión pueda usarla después

    res.json({ ok: true, mensaje: 'Ticket impreso correctamente' });
  } catch (err) {
    console.error("Error imprimiendo:", err);
    res.status(500).json({ ok: false, mensaje: 'Error al enviar el ticket: ' + err.message });
  }
});

// Iniciamos el servidor
app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`✅ Puente de impresión corriendo en http://localhost:${PUERTO}`);
  console.log(`🔒 El servidor solo acepta peticiones de: ${ORIGENES_PERMITIDOS.join(', ')}`);
  const config = leerConfig();
  if (config) {
    console.log(`🖨️  Impresora configurada: VID=${config.vid} PID=${config.pid} (encoding: ${config.encoding})`);
  } else {
    console.log('⚠️  Sin impresora configurada. Visita /api/detectar y luego /api/configurar-impresora.');
  }
});

// Hack para evitar que Windows cierre el proceso de Node.js prematuramente si se deja abierto
setInterval(() => {}, 1000 * 60 * 60);