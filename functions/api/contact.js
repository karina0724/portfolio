const TO_EMAIL = 'karinamonterodev@gmail.com';
const FROM_EMAIL = 'Portafolio <onboarding@resend.dev>';
const ALLOWED_ORIGINS = [
  'https://portfolio-5bw.pages.dev',
  'https://karinamontero.dev'
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') return true;
    if (u.hostname.endsWith('.pages.dev') && u.protocol === 'https:') return true;
  } catch {}
  return false;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function sanitizeLine(str) {
  return String(str).replace(/[\r\n\0]+/g, ' ').trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 60;

async function checkRateLimit(request) {
  if (typeof caches === 'undefined' || !caches.default) return { ok: true };
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'anon';
  const key = `https://rl.local/contact/${encodeURIComponent(ip)}`;
  const cacheKey = new Request(key);
  const cached = await caches.default.match(cacheKey);
  let count = 0;
  if (cached) {
    const txt = await cached.text();
    count = parseInt(txt, 10) || 0;
  }
  if (count >= RATE_LIMIT_MAX) return { ok: false, retryAfter: RATE_LIMIT_WINDOW_SEC };
  const resp = new Response(String(count + 1), {
    headers: { 'Cache-Control': `max-age=${RATE_LIMIT_WINDOW_SEC}` }
  });
  await caches.default.put(cacheKey, resp);
  return { ok: true };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Server misconfigured.' }, 500);
  }

  const origin = request.headers.get('Origin') || '';
  if (!isOriginAllowed(origin)) {
    return json({ error: 'Origin not allowed.' }, 403);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ error: 'Invalid content type.' }, 415);
  }

  const rl = await checkRateLimit(request);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rl.retryAfter)
      }
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const name = sanitizeLine(payload.name || '');
  const email = sanitizeLine(payload.email || '');
  const subject = sanitizeLine(payload.subject || '');
  const message = String(payload.message || '').replace(/\0/g, '').trim();
  const honeypot = (payload.website || '').toString().trim();

  if (honeypot) return json({ ok: true });

  if (!name || !email || !message) {
    return json({ error: 'Name, email and message are required.' }, 400);
  }
  if (name.length > 120 || subject.length > 200 || message.length > 5000) {
    return json({ error: 'Field too long.' }, 400);
  }
  if (email.length > 254) {
    return json({ error: 'Email too long.' }, 400);
  }
  if (!/^[^\s@<>"'`;,]+@[^\s@<>"'`;,]+\.[^\s@<>"'`;,]+$/.test(email)) {
    return json({ error: 'Invalid email address.' }, 400);
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
    return json({ error: 'Email provider failed.' }, 502);
  }

  return json({ ok: true });
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed.' }, 405);
}
