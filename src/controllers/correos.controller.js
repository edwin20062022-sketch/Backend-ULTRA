const nodemailer = require('nodemailer');
const { logCorreo, getAllCorreos } = require('../repositories/correos.repository');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function enviar(req, res, next) {
  try {
    const { ordenes, asunto_custom, cuerpo_custom } = req.body;
    if (!ordenes || !Array.isArray(ordenes) || ordenes.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una orden' });
    }

    const resultados = [];

    for (const orden of ordenes) {
      if (!orden.sup_email) {
        resultados.push({ po_id: orden.po_id, status: 'sin_email' });
        continue;
      }

      const asunto = asunto_custom ||
        `Seguimiento Orden de Compra PO-${orden.po_id} — GCC México`;
      const cuerpo = cuerpo_custom || buildCuerpo(orden);

      try {
        const info = await transporter.sendMail({
          from: `"GCC México — Compras" <${process.env.SMTP_USER}>`,
          to: orden.sup_email,
          subject: asunto,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#192b8d;padding:20px;text-align:center">
              <h2 style="color:#fff;margin:0;letter-spacing:2px">GCC MÉXICO</h2>
              <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px">Departamento de Compras — Expeditación</p>
            </div>
            <div style="padding:28px;background:#f8f9fc;border:1px solid #e0e4ef">
              <pre style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;color:#1a1a2e">${cuerpo}</pre>
            </div>
            <div style="background:#192b8d;padding:12px;text-align:center">
              <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0">GCC México · expeditacion@gcc.com.mx</p>
            </div>
          </div>`,
          text: cuerpo,
        });

        await logCorreo({
          orden_id:            orden.id || null,
          po_id:               orden.po_id,
          destinatario_email:  orden.sup_email,
          destinatario_nombre: orden.sup_name || orden.supplier,
          asunto,
          cuerpo,
          enviado_por:         req.user.id,
          resend_id:           info.messageId || null,
          estado:              'enviado',
        });

        resultados.push({ po_id: orden.po_id, status: 'enviado', email: orden.sup_email });
      } catch (mailErr) {
        console.error(`❌ Error enviando a ${orden.sup_email}:`, mailErr.message);

        await logCorreo({
          orden_id:            orden.id || null,
          po_id:               orden.po_id,
          destinatario_email:  orden.sup_email,
          destinatario_nombre: orden.sup_name || orden.supplier,
          asunto,
          cuerpo,
          enviado_por:         req.user.id,
          resend_id:           null,
          estado:              'error',
        }).catch(() => {});

        resultados.push({ po_id: orden.po_id, status: 'error', error: mailErr.message });
      }
    }

    const enviados = resultados.filter(r => r.status === 'enviado').length;
    res.json({ ok: true, enviados, resultados });

  } catch (err) {
    next(err);
  }
}

async function historial(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getAllCorreos({ page: Number(page), limit: Number(limit) });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

function buildCuerpo(orden) {
  const dias = Math.abs(orden.days_diff);
  return `Estimado equipo de ${orden.sup_name || orden.supplier},

Por medio del presente correo, el Departamento de Compras de GCC México da seguimiento a la siguiente orden de compra:

  PO ID:              ${orden.po_id}
  Artículo:           ${orden.item}
  Cantidad:           ${orden.qty}
  Planta destino:     ${orden.planta}
  Fecha comprometida: ${orden.need_by}
  Días de atraso:     ${dias} día(s)

La fecha de entrega acordada ha sido superada, lo cual está generando impacto en nuestras operaciones. Le solicitamos nos confirme a la brevedad:

  1. Estado actual del pedido
  2. Nueva fecha estimada de entrega
  3. Causa del retraso y acciones tomadas

Agradecemos su atención y quedamos en espera de su respuesta.

Atentamente,
Departamento de Compras
GCC México`;
}

module.exports = { enviar, historial };