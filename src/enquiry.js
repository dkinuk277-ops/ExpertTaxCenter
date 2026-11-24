// POST /api/enquiry handler (called from src/worker.js) -> sends the enquiry to Ravi via Resend.
// Required environment variables (Cloudflare > Workers & Pages > experttaxcenter > Settings > Variables and Secrets):
//   RESEND_API_KEY  (secret)  e.g. re_xxx
//   TO_EMAIL      (optional) defaults to hellocompsilon@gmail.com
//   FROM_EMAIL    (optional) defaults to onboarding@resend.dev, e.g. Expert Tax Center <enquiry@experttaxcenter.com>  (domain must be verified in Resend)

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function handleEnquiry(request, env) {
  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400); }

  // Honeypot: real users never fill this hidden field
  if (d.website) return json({ ok: true });

  const name = String(d.name || '').trim().slice(0, 100);
  const phone = String(d.phone || '').replace(/\s/g, '').slice(0, 20);
  const email = String(d.email || '').trim().slice(0, 150);
  const message = String(d.message || '').trim().slice(0, 3000);
  if (name.length < 2 || !/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(phone) || message.length < 5) {
    return json({ ok: false, error: 'Please check your name, mobile number and message.' }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Invalid email' }, 400);

  // Defaults until Ravi's own inbox and the experttaxcenter.com Resend domain are set up
  const TO = env.TO_EMAIL || 'hellocompsilon@gmail.com';
  const FROM = env.FROM_EMAIL || 'Expert Tax Center <onboarding@resend.dev>';
  if (!env.RESEND_API_KEY) return json({ ok: false, error: 'Email not configured' }, 500);

  const rows = [
    ['Name', name], ['Mobile', phone], ['Email', email || '—'], ['City', d.city],
    ['Client type', d.client_type], ['Service', d.service], ['Income / turnover', d.income || 'Not given'],
    ['Preferred contact', d.contact_pref],
  ].map(([k, v]) => `<tr><td style="padding:6px 12px;color:#555">${esc(k)}</td><td style="padding:6px 12px"><b>${esc(v)}</b></td></tr>`).join('');

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
    <h2 style="color:#1d3f9e">New enquiry — Expert Tax Center</h2>
    <table style="border-collapse:collapse">${rows}</table>
    <p style="margin-top:14px"><b>Query:</b><br>${esc(message).replace(/\n/g, '<br>')}</p>
    <p style="color:#888;font-size:12px">Sent from experttaxcenter.com enquiry form. Client consented to be contacted.</p></div>`;

  const payload = {
    from: FROM,
    to: TO.split(',').map((s) => s.trim()),
    subject: `New enquiry: ${name} — ${d.service || 'General'}`,
    html,
  };
  if (email) payload.reply_to = email;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch {}
    console.error('Resend error', r.status, detail); // visible in Cloudflare > experttaxcenter > Observability > Logs
    return json({ ok: false, error: 'could not send right now' }, 502);
  }
  return json({ ok: true });
}

export { json };
