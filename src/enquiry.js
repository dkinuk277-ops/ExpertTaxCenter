// POST /api/enquiry handler (called from src/worker.js)
//
// Environment variables (Cloudflare > Workers & Pages > experttaxcenter > Settings > Variables and Secrets):
//   RESEND_API_KEY    (secret, required)  Resend API key
//   TO_EMAIL          (optional) inbox(es) for enquiries, comma-separated. Default: hellocompsilon@gmail.com
//   FROM_EMAIL        (optional) sender on a Resend-verified domain, e.g. Expert Tax Center <enquiry@experttaxcenter.com>
//                     Required for the thank-you email to clients (Resend's test sender can't email other people)
//   CALLMEBOT_APIKEY  (secret, optional) enables WhatsApp alerts via CallMeBot
//   WHATSAPP_PHONE    (optional) number that receives WhatsApp alerts. Default: +919686776664
//   SITE_URL          (optional) default https://www.experttaxcenter.com

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sendEmail(env, payload, label) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch {}
    console.error(`Resend error (${label})`, r.status, detail); // Cloudflare > experttaxcenter > Observability > Logs
  }
  return r.ok;
}

async function sendWhatsApp(env, text) {
  if (!env.CALLMEBOT_APIKEY) return;
  const phone = env.WHATSAPP_PHONE || '+919686776664';
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) console.error('CallMeBot error', r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error('CallMeBot failed', String(e)); }
}

function ackEmailHtml(name, service, site) {
  const link = (hash, label, sub) => `<tr><td style="padding:8px 0"><a href="${site}/#${hash}" style="color:#1d3f9e;font-weight:bold;text-decoration:none">${label} →</a><br><span style="color:#5a6478;font-size:13px">${sub}</span></td></tr>`;
  return `<div style="background:#f2f4fa;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e6f2">
    <tr><td style="background:#0f2160;padding:22px 26px;color:#ffffff">
      <div style="font-size:20px;font-weight:bold">Expert Tax <span style="color:#f2c14e">Center</span></div>
      <div style="font-size:11px;letter-spacing:2px;color:#c9d3ee;margin-top:4px">TAX &amp; FINANCE ADVISORY · INDIA</div>
    </td></tr>
    <tr><td style="padding:26px;color:#1b2236;font-size:15px;line-height:1.6">
      <p style="margin:0 0 14px">Hi ${esc(name)},</p>
      <p style="margin:0 0 14px">Thank you for your submission. We have received your details safely and securely.</p>
      <p style="margin:0 0 14px">Our tax expert, <b>Ravi Kumar</b>, will get in touch with you shortly${service ? ` about <b>${esc(service)}</b>` : ''}.</p>
      <p style="margin:22px 0 6px;font-weight:bold;color:#0f2160">In the meantime, explore our website</p>
      <table role="presentation" width="100%">
        ${link('itr', 'Which ITR form should you file?', 'ITR-1 to ITR-7 explained, plus a quick form finder')}
        ${link('itr', 'Documents checklist &amp; key dates', 'What to keep ready and the usual filing deadlines')}
        ${link('services', 'How we work &amp; our tax services', 'ITR filing, tax planning, GST, TDS, notices and more')}
        ${link('planner', 'Free savings &amp; tax planner', 'Answer 10 quick questions and get 2–3 suggestions')}
        ${link('investments', 'Investment options compared', 'PPF, ELSS, Post Office schemes, FDs, mutual funds and NPS')}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#5a6478">Official Income Tax e-Filing portal: <a href="https://www.incometax.gov.in/iec/foportal/" style="color:#1d3f9e">incometax.gov.in</a> (check your AIS and Form 26AS before filing).</p>
      <div style="margin:24px 0 0;padding:14px 16px;background:#fff7e0;border:1px solid #f0dc9c;border-radius:8px;font-size:14px">
        Need us sooner? Call or WhatsApp <a href="tel:+919686776664" style="color:#0f2160;font-weight:bold">+91 96867 76664</a>
      </div>
    </td></tr>
    <tr><td style="padding:16px 26px;background:#f7f8fc;color:#7a8499;font-size:12px;line-height:1.5">
      You're receiving this because you sent an enquiry at ${esc(site.replace(/^https?:\/\//, ''))}. We will never ask for your passwords, OTPs or bank PINs by email or phone.
    </td></tr>
  </table></div>`;
}

export async function handleEnquiry(request, env, ctx) {
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
  if (!env.RESEND_API_KEY) return json({ ok: false, error: 'Email not configured' }, 500);

  const TO = env.TO_EMAIL || 'hellocompsilon@gmail.com';
  const FROM = env.FROM_EMAIL || 'Expert Tax Center <onboarding@resend.dev>';
  const SITE = (env.SITE_URL || 'https://www.experttaxcenter.com').replace(/\/$/, '');

  const fields = [
    ['Name', name], ['Mobile', phone], ['Email', email || '—'], ['City', d.city],
    ['Client type', d.client_type], ['Service', d.service], ['Income / turnover', d.income || 'Not given'],
    ['Preferred contact', d.contact_pref],
  ];
  const rows = fields.map(([k, v]) => `<tr><td style="padding:6px 12px;color:#555">${esc(k)}</td><td style="padding:6px 12px"><b>${esc(v)}</b></td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px">
    <h2 style="color:#1d3f9e">New enquiry — Expert Tax Center</h2>
    <table style="border-collapse:collapse">${rows}</table>
    <p style="margin-top:14px"><b>Query:</b><br>${esc(message).replace(/\n/g, '<br>')}</p>
    <p style="color:#888;font-size:12px">Sent from the experttaxcenter.com enquiry form. Client consented to be contacted.</p></div>`;

  // 1) Enquiry to the inbox (must succeed)
  const owner = { from: FROM, to: TO.split(',').map((s) => s.trim()).filter(Boolean), subject: `New enquiry: ${name} — ${d.service || 'General'}`, html };
  if (email) owner.reply_to = email;
  const ok = await sendEmail(env, owner, 'enquiry');
  if (!ok) return json({ ok: false, error: 'could not send right now' }, 502);

  // 2) Best-effort extras: thank-you email to the client + WhatsApp alert to Ravi
  const extras = [];
  if (email && env.FROM_EMAIL) {
    extras.push(sendEmail(env, {
      from: FROM,
      to: [email],
      reply_to: TO.split(',')[0].trim(),
      subject: 'We have received your enquiry — Expert Tax Center',
      html: ackEmailHtml(name, d.service, SITE),
    }, 'acknowledgement'));
  }
  const wa = ['🔔 New enquiry — Expert Tax Center', ...fields.map(([k, v]) => `${k}: ${v ?? '—'}`), `Query: ${message.slice(0, 600)}`].join('\n');
  extras.push(sendWhatsApp(env, wa));
  const all = Promise.allSettled(extras);
  if (ctx && ctx.waitUntil) ctx.waitUntil(all); else await all;

  return json({ ok: true });
}
