import { handleAuth } from './auth.js';
import { handleProxy } from './proxy.js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Try handling Auth first
    const authResponse = await handleAuth(request, env, corsHeaders);
    if (authResponse) {
      return authResponse;
    }

    // Fallback to Proxy logic
    return handleProxy(request, env, ctx, corsHeaders);
  }
};
