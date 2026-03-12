const { google } = require('googleapis');
const { logCorreo, getAllCorreos } = require('../repositories/correos.repository');

function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function buildEmailRaw({ to, from, subject, html, text }) {
  const boundary = 'gcc_boundary_001';
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function enviar(req, res, next) {
  try {
    const { ordenes, asunto_custom, cuerpo_custom } = req.body;
    if (!ordenes || !Array.isArray(ordenes) || ordenes.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una orden' });
    }

    const gmail = getGmailClient();
    const resultados = [];

    for (const orden of ordenes) {
      if (!orden.sup_email) {
        resultados.push({ po_id: orden.po_id, status: 'sin_email' });
        continue;
      }

      const asunto = asunto_custom ||
        `Seguimiento Orden de Compra PO-${orden.po_id} — GCC México`;
      const cuerpo = cuerpo_custom || buildCuerpo(orden);
      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
      </div>`;

      try {
        const raw = buildEmailRaw({
          to: orden.sup_email,
          from: `"GCC México — Compras" <${process.env.SMTP_USER}>`,
          subject: asunto,
          html: htmlBody,
          text: cuerpo,
        });

        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });

        await logCorreo({
          orden_id:            orden.id || null,
          po_id:               orden.po_id,
          destinatario_email:  orden.sup_email,
          destinatario_nombre: orden.sup_name || orden.supplier,
          asunto,
          cuerpo,
          enviado_por:         req.user.id,
          resend_id:           response.data.id || null,
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
