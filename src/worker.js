import { handleEnquiry, json } from './enquiry.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/enquiry') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
      return handleEnquiry(request, env);
    }
    // Everything else: serve the static site from /public
    return env.ASSETS.fetch(request);
  },
};
