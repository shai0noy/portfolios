import { handleAuth } from './auth.js';
import { handleAgent } from './agent.js';
import { handleProxy } from './proxy.js';

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apiKey, X-Agent-Key", 
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

    // Try handling Auth first
    const authResponse = await handleAuth(request, env, corsHeaders);
    if (authResponse) {
      return authResponse;
    }

    // Try handling Agent API routes (/agent/*)
    const agentResponse = await handleAgent(request, env, ctx, corsHeaders);
    if (agentResponse) {
      return agentResponse;
    }

    // Fallback to Proxy logic
    return handleProxy(request, env, ctx, corsHeaders);
  }
};
