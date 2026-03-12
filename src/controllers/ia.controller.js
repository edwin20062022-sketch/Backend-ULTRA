const OpenAI = require('openai');
const { getEstadisticas, getUltimoReporteId } = require('../repositories/ordenes.repository');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function ask(prompt) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });
  return res.choices[0].message.content;
}

// ── 1. Redactar correo ──
async function redactarCorreo(req, res, next) {
  try {
    const { ordenes } = req.body;
    if (!ordenes?.length) return res.status(400).json({ error: 'Se requieren órdenes' });

    const lista = ordenes.map(o =>
      `- PO ${o.po_id}: ${o.item} | Proveedor: ${o.sup_name || o.supplier} | Atraso: ${Math.abs(o.days_diff)} días | Planta: ${o.planta}`
    ).join('\n');

    const prompt = `Eres el asistente de expeditación del Departamento de Compras de GCC México (empresa cementera).
Redacta un correo profesional en español para dar seguimiento a estas órdenes atrasadas:
${lista}
Requisitos:
- Primera línea: "Asunto: ..."
- Tono profesional pero urgente
- Menciona días de atraso y artículos específicos
- Pide confirmación de nueva fecha y causa del retraso
- Firma: "Departamento de Compras — GCC México"
- Sin saludos genéricos, ve directo al punto`;

    const correo = await ask(prompt);
    res.json({ correo });
  } catch (err) {
    next(err);
  }
}

// ── 2. Resumen ejecutivo ──
async function resumenEjecutivo(req, res, next) {
  try {
    const { opciones = {} } = req.body;
    const reporte_id = await getUltimoReporteId();
    const ordenes = await getEstadisticas(reporte_id);

    const at  = ordenes.filter(o => o.status === 'atrasado').length;
    const ex  = ordenes.filter(o => o.status === 'expeditacion').length;
    const ti  = ordenes.filter(o => o.status === 'atiempo').length;
    const tot = ordenes.length;

    const supCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      const n = o.sup_name || o.supplier;
      supCount[n] = (supCount[n] || 0) + 1;
    });
    const topSup = Object.entries(supCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const plantCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      plantCount[o.planta] = (plantCount[o.planta] || 0) + 1;
    });
    const topPlant = Object.entries(plantCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const fecha = new Date().toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const prompt = `Eres el asistente ejecutivo de Compras de GCC México. Genera un resumen ejecutivo para: ${fecha}.
Datos:
- Total: ${tot} órdenes | Atrasadas: ${at} (${Math.round(at / tot * 100)}%) | Expeditación: ${ex} | A tiempo: ${ti}
- Top proveedores con atrasos: ${topSup.map(([n, c]) => `${n}(${c})`).join(', ')}
- Top plantas afectadas: ${topPlant.map(([n, c]) => `${n}(${c})`).join(', ')}
Secciones a incluir:
${opciones.atrasadas !== false ? '✓ Estado general' : ''}
${opciones.proveedores !== false ? '✓ Proveedores críticos' : ''}
${opciones.plantas !== false ? '✓ Plantas afectadas' : ''}
${opciones.compradores !== false ? '✓ Compradores' : ''}
${opciones.recomendaciones ? '✓ Recomendaciones de acción' : ''}
Formato: secciones con títulos en MAYÚSCULAS. Sin markdown. Tono ejecutivo y directo.`;

    const resumen = await ask(prompt);
    res.json({ resumen });
  } catch (err) {
    next(err);
  }
}

// ── 3. Analizar comentarios ──
async function analizarComentarios(req, res, next) {
  try {
    const { comentarios } = req.body;
    if (!comentarios?.length) return res.status(400).json({ error: 'Se requieren comentarios' });

    const lista = comentarios.slice(0, 30).map((c, i) =>
      `${i + 1}. PO ${c.po_id} [${c.supplier}]: "${c.comment}"`
    ).join('\n');

    const prompt = `Clasifica estos comentarios de órdenes de compra de GCC México en:
- confirmado: proveedor confirmó entrega
- logistica: problema de transporte o aduana
- sin_respuesta: sin respuesta del proveedor
- pendiente: en proceso
- sin_clasificar: no determinable
Responde SOLO con JSON array sin markdown:
[{"index":1,"po_id":"...","categoria":"...","razon":"breve explicación"}]
Comentarios:
${lista}`;

    const text = await ask(prompt);
    let clasificaciones;
    try {
      clasificaciones = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      clasificaciones = comentarios.map((c, i) => ({
        index: i + 1, po_id: c.po_id, categoria: 'sin_clasificar', razon: 'No se pudo procesar',
      }));
    }
    res.json({ clasificaciones });
  } catch (err) {
    next(err);
  }
}

// ── 4. Predicción de riesgo ──
async function predecirRiesgo(req, res, next) {
  try {
    const { ordenes } = req.body;
    if (!ordenes?.length) return res.status(400).json({ error: 'Se requieren órdenes' });

    const reporte_id = await getUltimoReporteId();
    const todas = await getEstadisticas(reporte_id);
    const historial = {};
    todas.filter(o => o.status === 'atrasado').forEach(o => {
      const n = o.sup_name || o.supplier;
      historial[n] = (historial[n] || 0) + 1;
    });

    const lista = ordenes.slice(0, 20).map((o, i) => {
      const supName = o.sup_name || o.supplier;
      return `${i + 1}. PO ${o.po_id} | Proveedor: ${supName} | Días restantes: ${o.days_diff} | Atrasos históricos: ${historial[supName] || 0}`;
    }).join('\n');

    const prompt = `Analiza estas órdenes "a tiempo" de GCC México y predice riesgo de atraso.
Factores: días restantes (menos = más riesgo), historial de atrasos del proveedor.
Responde SOLO con JSON array sin markdown:
[{"index":1,"po_id":"...","riesgo":"alto|medio|bajo","porcentaje":85,"razon":"explicación concisa"}]
Órdenes:
${lista}`;

    const text = await ask(prompt);
    let predicciones;
    try {
      predicciones = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      predicciones = ordenes.slice(0, 20).map((o, i) => ({
        index: i + 1, po_id: o.po_id, riesgo: 'medio', porcentaje: 50, razon: 'No se pudo procesar',
      }));
    }
    res.json({ predicciones });
  } catch (err) {
    next(err);
  }
}

// ── 5. Chat ──
async function chat(req, res, next) {
  try {
    const { mensaje, historial = [] } = req.body;
    if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

    const reporte_id = await getUltimoReporteId();
    const ordenes = await getEstadisticas(reporte_id);

    const at = ordenes.filter(o => o.status === 'atrasado').length;
    const ex = ordenes.filter(o => o.status === 'expeditacion').length;
    const ti = ordenes.filter(o => o.status === 'atiempo').length;

    const supCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      const n = o.sup_name || o.supplier;
      supCount[n] = (supCount[n] || 0) + 1;
    });
    const topSup = Object.entries(supCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const plantCount = {};
    ordenes.filter(o => o.status === 'atrasado').forEach(o => {
      plantCount[o.planta] = (plantCount[o.planta] || 0) + 1;
    });
    const topPlant = Object.entries(plantCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const contexto = `Datos GCC México — Sistema de Expeditación:
Total: ${ordenes.length} órdenes | Atrasadas: ${at} | Expeditación: ${ex} | A tiempo: ${ti}
Top proveedores con atrasos: ${topSup.map(([n, c]) => `${n}(${c})`).join(', ')}
Top plantas: ${topPlant.map(([n, c]) => `${n}(${c})`).join(', ')}`;

    const messages = [
      {
        role: 'system',
        content: `Eres el asistente de expeditación de GCC México. Responde en español de forma concisa y profesional. Usa estos datos del reporte actual: ${contexto}`,
      },
      ...historial.slice(-8).map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content,
      })),
      { role: 'user', content: mensaje },
    ];

    const res2 = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
    });

    res.json({ respuesta: res2.choices[0].message.content });
  } catch (err) {
    next(err);
  }
}

module.exports = { redactarCorreo, resumenEjecutivo, analizarComentarios, predecirRiesgo, chat };