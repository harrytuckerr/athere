/**
 * @here - Cloudflare Worker
 * 
 * Provides:
 *   /proxy?url=...  — CORS proxy for article fetching (GET)
 *   /api/claude      — Anthropic API proxy (POST) — requires ANTHROPIC_API_KEY secret
 * 
 * DEPLOYMENT:
 * 1. In Cloudflare Workers/Pages dashboard, create/update your worker
 * 2. Paste this file as the worker script (or put in functions/ for Pages)
 * 3. Add secret: ANTHROPIC_API_KEY (your Anthropic API key)
 *    - Workers: Settings > Variables > Secrets > Add
 *    - Pages: Settings > Environment Variables > Add (Production + Preview)
 * 4. If using Workers Sites, add KV namespace binding: ASSETS
 * 
 * CLOUDFLARE PAGES ALTERNATIVE:
 * Place as functions/api/claude.js and functions/proxy.js
 * (see comments at bottom for Pages function format)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS preflight for ANY route
    if (request.method === 'OPTIONS') {
      return corsResponse(null, { status: 204 });
    }
    
    // ─── /api/claude — Anthropic API Proxy (POST) ───────────────
    if (url.pathname === '/api/claude' && request.method === 'POST') {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return corsResponse(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      try {
        const body = await request.text();
        
        const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body,
        });
        
        const responseBody = await apiResponse.text();
        return corsResponse(responseBody, {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return corsResponse(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // ─── /proxy?url=... — CORS Proxy for articles (GET) ─────────
    if (url.pathname === '/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return corsResponse('Missing url parameter', { status: 400 });
      }
      
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AtHereBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-AU,en;q=0.9',
          },
          redirect: 'follow',
        });
        
        const body = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        headers.delete('Content-Security-Policy');
        headers.delete('X-Frame-Options');
        
        return corsResponse(body, {
          status: response.status,
          headers,
        });
      } catch (err) {
        return corsResponse(`Proxy error: ${err.message}`, { status: 502 });
      }
    }
    
    // ─── Static assets fallthrough ──────────────────────────────
    return env.ASSETS 
      ? env.ASSETS.fetch(request) 
      : new Response('Not found', { status: 404 });
  }
};

/*
 * ═══════════════════════════════════════════════════════════════
 * CLOUDFLARE PAGES FUNCTIONS FORMAT
 * ═══════════════════════════════════════════════════════════════
 * 
 * If using Cloudflare Pages instead of Workers, create these files:
 * 
 * --- functions/api/claude.js ---
 * export async function onRequestPost(context) {
 *   const apiKey = context.env.ANTHROPIC_API_KEY;
 *   if (!apiKey) return new Response('API key not set', { status: 500 });
 *   const body = await context.request.text();
 *   const r = await fetch('https://api.anthropic.com/v1/messages', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
 *     body,
 *   });
 *   const data = await r.text();
 *   return new Response(data, {
 *     status: r.status,
 *     headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
 *   });
 * }
 * export async function onRequestOptions() {
 *   return new Response(null, { status: 204, headers: {
 *     'Access-Control-Allow-Origin': '*',
 *     'Access-Control-Allow-Methods': 'POST, OPTIONS',
 *     'Access-Control-Allow-Headers': 'Content-Type',
 *   }});
 * }
 * 
 * --- functions/proxy.js ---
 * export async function onRequestGet(context) {
 *   const url = new URL(context.request.url);
 *   const target = url.searchParams.get('url');
 *   if (!target) return new Response('Missing url', { status: 400 });
 *   const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
 *   const body = await r.arrayBuffer();
 *   return new Response(body, { headers: {
 *     'Access-Control-Allow-Origin': '*', 'Content-Type': r.headers.get('Content-Type') || 'text/html',
 *   }});
 * }
 */
