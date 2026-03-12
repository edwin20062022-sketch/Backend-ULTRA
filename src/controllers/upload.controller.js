const XLSX = require('xlsx');
const { createReporte } = require('../repositories/reportes.repository');
const { insertOrdenes } = require('../repositories/ordenes.repository');
const supabase = require('../utils/db');

function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(sa de cv|sapi de cv|s de rl de cv|sas de cv|s\.a\. de c\.v\.|s\.a|sc|srl|sa)\b/g, '')
    .replace(/[.,\-_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = s => {
    const map = {};
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map[bg] = (map[bg] || 0) + 1;
    }
    return map;
  };
  const ab = bigrams(a), bb = bigrams(b);
  let intersection = 0;
  for (const k in ab) if (bb[k]) intersection += Math.min(ab[k], bb[k]);
  const total = (a.length - 1) + (b.length - 1);
  return total === 0 ? 0 : (2 * intersection) / total;
}

// ── Pre-indexa proveedores por primer token para reducir comparaciones ──
function buildSupplierIndex(suppliers) {
  const index = {};
  for (const sup of suppliers) {
    const norm = normalizeName(sup.nombre_supplier);
    if (!norm) continue;
    sup._norm = norm;
    const token = norm.split(' ')[0];
    if (!index[token]) index[token] = [];
    index[token].push(sup);
  }
  return index;
}

function findBestMatch(coupaName, suppliers, supplierIndex, threshold = 0.72) {
  const norm = normalizeName(coupaName);
  if (!norm) return null;

  const variants = [norm];
  const beforeParen = norm.replace(/\(.*\)/g, '').trim();
  if (beforeParen !== norm && beforeParen.length > 3) variants.push(beforeParen);

  // Primero intenta match exacto
  for (const sup of suppliers) {
    if (sup._norm === norm) return { supplier: sup, score: 1 };
  }

  // Busca candidatos por primer token para reducir comparaciones
  const candidates = new Set();
  for (const variant of variants) {
    const tokens = variant.split(' ').slice(0, 2);
    for (const token of tokens) {
      if (token.length < 3) continue;
      // Busca en index por tokens que empiecen igual
      for (const key of Object.keys(supplierIndex)) {
        if (key.startsWith(token.slice(0, 3))) {
          for (const s of supplierIndex[key]) candidates.add(s);
        }
      }
    }
  }

  // Si no hay candidatos, compara con todos (fallback)
  const pool = candidates.size > 0 ? [...candidates] : suppliers;

  let best = null, bestScore = 0;
  for (const sup of pool) {
    for (const variant of variants) {
      const score = similarity(variant, sup._norm);
      if (score > bestScore) { bestScore = score; best = sup; }
    }
  }
  return bestScore >= threshold ? { supplier: best, score: bestScore } : null;
}

function toDateStr(val) {
  if (!val) return null;
  try {
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    if (typeof val === 'number') {
      const d = new Date((val - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    if (val instanceof Date) return val.toISOString().slice(0, 10);
  } catch { return null; }
  return null;
}

function calcStatus(needBy, orderDate) {
  if (!needBy) return { status: 'atiempo', days_diff: 0 };
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const need  = new Date(needBy);
    const order = orderDate ? new Date(orderDate) : null;
    const daysDiff = Math.round((need - today) / 86400000);
    if (need < today) return { status: 'atrasado', days_diff: daysDiff };
    if (order && !isNaN(order)) {
      const totalDays   = (need - order) / 86400000;
      const elapsedDays = (today - order) / 86400000;
      if (totalDays > 0 && elapsedDays >= totalDays * 0.6)
        return { status: 'expeditacion', days_diff: daysDiff };
    }
    return { status: 'atiempo', days_diff: daysDiff };
  } catch { return { status: 'atiempo', days_diff: 0 }; }
}

async function insertarEnLotes(ordenes, tamanoLote = 200) {
  for (let i = 0; i < ordenes.length; i += tamanoLote) {
    const lote = ordenes.slice(i, i + tamanoLote);
    await insertOrdenes(lote);
    if (i + tamanoLote < ordenes.length)
      await new Promise(r => setTimeout(r, 50));
  }
}

async function uploadArchivos(req, res, next) {
  try {
    if (!req.files?.coupa?.[0] || !req.files?.suppliers?.[0]) {
      return res.status(400).json({ error: 'Se requieren ambos archivos: coupa y suppliers' });
    }

    console.log('📂 Procesando archivos...');

    const coupaWb   = XLSX.read(req.files.coupa[0].buffer,     { type: 'buffer', cellDates: true });
    const coupaRows = XLSX.utils.sheet_to_json(coupaWb.Sheets[coupaWb.SheetNames[0]], { defval: '' });
    console.log(`📋 Coupa: ${coupaRows.length} filas`);

    const supWb   = XLSX.read(req.files.suppliers[0].buffer, { type: 'buffer', cellDates: true });
    const supRows = XLSX.utils.sheet_to_json(supWb.Sheets[supWb.SheetNames[0]], { defval: '' });
    console.log(`🏭 Suppliers: ${supRows.length} filas`);

    const suppliers = supRows
      .map(r => ({
        nombre_coupa:    String(r['Name 1'] || '').trim(),
        nombre_supplier: String(r['Name 1'] || '').trim(),
        ciudad:   String(r['City']           || '').trim(),
        telefono: String(r['Telephone 1']    || r['Telephone'] || '').trim(),
        email:    String(r['E-Mail Address'] || r['E-Mail Address_7'] || '').trim(),
        calle:    String(r['Street']         || '').trim(),
      }))
      .filter(s => s.nombre_coupa.length > 1);

    console.log(`✅ Proveedores válidos: ${suppliers.length}`);

    if (coupaRows.length === 0)
      return res.status(422).json({ error: 'El archivo Coupa está vacío o no tiene el formato esperado' });

    // Pre-indexar proveedores
    console.log('🔍 Indexando proveedores...');
    const supplierIndex = buildSupplierIndex(suppliers);
    console.log(`✅ Índice construido con ${Object.keys(supplierIndex).length} tokens`);

    // Limpiar datos anteriores
    console.log('🧹 Limpiando datos anteriores...');
    await supabase.from('correos_enviados').delete().neq('id', 0);
    await supabase.from('ordenes').delete().neq('id', 0);
    await supabase.from('proveedores').delete().neq('id', 0);
    await supabase.from('reportes').delete().neq('id', 0);
    console.log('✅ Datos anteriores eliminados');

    const reporte = await createReporte({
      nombre_archivo: req.files.coupa[0].originalname,
      total_ordenes: 0, atrasadas: 0, expeditacion: 0, a_tiempo: 0,
      cargado_por: req.user.id,
    });

    // Procesar órdenes con matching optimizado
    console.log('⚙️ Procesando órdenes y fuzzy matching...');
    const ordenes = [];
    let sinSupplier = 0;

    // Caché de matches para evitar comparar el mismo proveedor dos veces
    const matchCache = {};

    for (const row of coupaRows) {
      const supplier = String(row['Supplier'] || row['supplier'] || '').trim();
      if (!supplier) { sinSupplier++; continue; }

      const needBy    = toDateStr(row['Need By']             || row['need_by']);
      const orderDate = toDateStr(row['Order Date (Header)'] || row['order_date']);
      const { status, days_diff } = calcStatus(needBy, orderDate);

      // Usar caché para proveedores repetidos
      if (!(supplier in matchCache)) {
        matchCache[supplier] = findBestMatch(supplier, suppliers, supplierIndex);
      }
      const match = matchCache[supplier];

      ordenes.push({
        po_id:      String(row['PO ID']     || row['po_id']  || '').trim(),
        sap_id:     String(row['SAP ID PO'] || row['sap_id'] || '').trim(),
        supplier,
        buyer:      String(row['Buyer']     || row['buyer']  || '').trim(),
        planta:     String(row['Planta']    || row['planta'] || '').trim(),
        item:       String(row['Item']      || row['item']   || '').trim(),
        qty:        String(row['Qty']       || row['qty']    || '').trim(),
        need_by:    needBy,
        order_date: orderDate,
        comments:   String(row['Comments']  || row['comments'] || '').trim(),
        days_diff,
        status,
        sup_name:   match?.supplier?.nombre_supplier || null,
        sup_city:   match?.supplier?.ciudad          || null,
        sup_phone:  match?.supplier?.telefono        || null,
        sup_email:  match?.supplier?.email           || null,
        sup_street: match?.supplier?.calle           || null,
        matched:    !!match,
        reporte_id: reporte.id,
      });
    }

    console.log(`📦 Órdenes procesadas: ${ordenes.length} (${sinSupplier} omitidas, ${Object.keys(matchCache).length} proveedores únicos)`);

    if (ordenes.length === 0)
      return res.status(422).json({ error: 'No se encontraron órdenes válidas.' });

    console.log('💾 Insertando en base de datos...');
    await insertarEnLotes(ordenes, 200);
    console.log('✅ Órdenes insertadas');

    const atrasadas    = ordenes.filter(o => o.status === 'atrasado').length;
    const expeditacion = ordenes.filter(o => o.status === 'expeditacion').length;
    const a_tiempo     = ordenes.filter(o => o.status === 'atiempo').length;
    const con_contacto = ordenes.filter(o => o.matched).length;

    await supabase
      .from('reportes')
      .update({ total_ordenes: ordenes.length, atrasadas, expeditacion, a_tiempo })
      .eq('id', reporte.id);

    console.log('✅ Reporte actualizado — LISTO');

    res.json({
      ok: true,
      reporte_id: reporte.id,
      stats: {
        total: ordenes.length, atrasadas, expeditacion,
        a_tiempo, con_contacto,
        sin_contacto: ordenes.length - con_contacto,
      },
    });

  } catch (err) {
    console.error('❌ Error en upload:', err.message);
    next(err);
  }
}

module.exports = { uploadArchivos };