const TO_EMAIL = 'karinamonterodev@gmail.com';
const FROM_EMAIL = 'Portafolio <onboarding@resend.dev>';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Server misconfigured: missing RESEND_API_KEY.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const name = (payload.name || '').toString().trim();
  const email = (payload.email || '').toString().trim();
  const subject = (payload.subject || '').toString().trim();
  const message = (payload.message || '').toString().trim();
  const honeypot = (payload.website || '').toString().trim();

  if (honeypot) return json({ ok: true });

  if (!name || !email || !message) {
    return json({ error: 'Name, email and message are required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email address.' }, 400);
  }
  if (name.length > 120 || subject.length > 200 || message.length > 5000) {
    return json({ error: 'Field too long.' }, 400);
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject || '(no subject)');
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#00072d;">
      <div style="border-left:3px solid #0e6ba8;padding-left:16px;margin-bottom:24px;">
        <div style="font-size:12px;letter-spacing:0.08em;color:#6b7280;text-transform:uppercase;">New message from portfolio</div>
        <h2 style="margin:6px 0 0;font-size:20px;color:#00072d;">${safeSubject}</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#6b7280;width:80px;">From:</td><td style="padding:8px 0;font-weight:600;">${safeName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Email:</td><td style="padding:8px 0;"><a href="mailto:${safeEmail}" style="color:#0e6ba8;">${safeEmail}</a></td></tr>
      </table>
      <div style="padding:20px;background:#f4fafd;border-radius:12px;line-height:1.6;">${safeMessage}</div>
    </div>
  `;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email,
      subject: `[Portafolio] ${subject || 'New contact message'}`,
      html
    })
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => '');
    return json({ error: 'Email provider failed.', detail: errText.slice(0, 300) }, 502);
  }

  return json({ ok: true });
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed.' }, 405);
}
