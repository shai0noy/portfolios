import { handleAuth } from './auth.js';
import { handleProxy } from './proxy.js';
import { handleSubscription } from './subscription.js';
import { handleScheduled } from './email.js';

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, apiKey", 
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname === '/subscribe') {
      return handleSubscription(request, env, corsHeaders);
    }

    // Try handling Auth first
    const authResponse = await handleAuth(request, env, corsHeaders);
    if (authResponse) {
      return authResponse;
    }

    // Fallback to Proxy logic
    return handleProxy(request, env, ctx, corsHeaders);
  },

  async scheduled(event, env, ctx) {
    return handleScheduled(event, env, ctx);
  }
};

