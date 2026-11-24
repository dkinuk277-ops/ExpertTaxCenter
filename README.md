# experttaxcenter.com

Website for Expert Tax Center (Ravi Kumar) — income tax, GST and financial guidance, India.

- Static site in `public/` (`index.html`, single page, tabbed)
- `src/worker.js` serves the site and handles `POST /api/enquiry` (sends enquiries via Resend, `src/enquiry.js`)
- Hosting: Cloudflare Workers project `experttaxcenter`, connected to this repo. Every push to `main` builds and deploys (`wrangler.jsonc`)
- Settings (Cloudflare > experttaxcenter > Settings > Variables and Secrets): `RESEND_API_KEY` (secret, required); `TO_EMAIL`, `FROM_EMAIL` (needed for client thank-you emails); `SITE_URL` (optional)
