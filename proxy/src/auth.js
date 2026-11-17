import { sealJson, unsealJson, encodeJsonBase64Url, sha256Hex } from './crypto.js';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

// Short-lived in-memory cache of refreshed Google access tokens per Worker isolate
const accessTokenCache = new Map();

function isAllowedReturnTo(returnToStr, env) {
  try {
    const u = new URL(returnToStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.protocol === 'https:' && (u.hostname === 'shai0noy.github.io' || u.hostname.endsWith('.github.io'))) {
      return true;
    }
    if (env.ALLOWED_AUTH_ORIGIN) {
      const allowed = env.ALLOWED_AUTH_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
      if (allowed.includes(u.origin)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildRedirectWithHash(returnToStr, hashKey, hashValue) {
  const u = new URL(returnToStr);
  u.hash = `${hashKey}=${encodeURIComponent(hashValue)}`;
  return u.toString();
}

export async function extractRefreshToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && !bearer.startsWith('ptf_')) {
      try {
        const payload = await unsealJson(bearer, env.GOOGLE_CLIENT_SECRET);
        if (payload?.rt && typeof payload.rt === 'string') {
          return payload.rt;
        }
      } catch {
        // Fall back to cookie if bearer token cannot be unsealed
      }
    }
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const refreshToken = cookieHeader.match(/auth_refresh_token=([^;]+)/)?.[1];
    if (refreshToken && refreshToken !== 'undefined') {
      return refreshToken;
    }
  }

  return null;
}

export async function getAccessTokenFromRefreshToken(refreshToken, env, useCache = true) {
  const cacheKey = await sha256Hex(refreshToken);
  if (useCache) {
    const cached = accessTokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { access_token: cached.access_token, expires_in: Math.max(60, Math.floor((cached.expiresAt - Date.now()) / 1000)) };
    }
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await tokenResponse.json();
  if (tokens.error || !tokens.access_token) {
    accessTokenCache.delete(cacheKey);
    const err = new Error(tokens.error_description || tokens.error || 'Failed to refresh Google access token');
    err.oauthError = tokens;
    throw err;
  }

  const expiresIn = Number(tokens.expires_in) || 3600;
  accessTokenCache.set(cacheKey, {
    access_token: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000,
  });

  return tokens;
}

export async function handleAuth(request, env, corsHeaders) {
  const url = new URL(request.url);

  // 1. Top-level OAuth Redirect Login Initiation
  if (request.method === 'GET' && url.pathname === '/auth/login') {
    const returnTo = url.searchParams.get('returnTo') || request.headers.get('Referer') || 'https://shai0noy.github.io/portfolios/';
    if (!isAllowedReturnTo(returnTo, env)) {
      return new Response(JSON.stringify({ error: 'Invalid or disallowed returnTo URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const state = await sealJson(
      { returnTo, iat: Date.now(), nonce: crypto.randomUUID() },
      env.GOOGLE_CLIENT_SECRET
    );

    const redirectUri = `${url.origin}/auth/callback`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', SCOPES);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('include_granted_scopes', 'true');
    googleAuthUrl.searchParams.set('prompt', 'select_account consent');
    googleAuthUrl.searchParams.set('state', state);

    return Response.redirect(googleAuthUrl.toString(), 302);
  }

  // 2. Top-level OAuth Redirect Callback
  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const stateParam = url.searchParams.get('state');
    if (!stateParam) {
      return new Response('Missing OAuth state parameter.', { status: 400 });
    }

    let stateData;
    try {
      stateData = await unsealJson(stateParam, env.GOOGLE_CLIENT_SECRET);
    } catch {
      return new Response('Invalid or tampered OAuth state parameter.', { status: 400 });
    }

    if (!stateData?.returnTo || !isAllowedReturnTo(stateData.returnTo, env)) {
      return new Response('Invalid returnTo in OAuth state.', { status: 400 });
    }

    if (!stateData.iat || Date.now() - stateData.iat > STATE_MAX_AGE_MS) {
      return Response.redirect(
        buildRedirectWithHash(stateData.returnTo, 'oauth_error', 'Login session timed out. Please try signing in again.'),
        302
      );
    }

    const oauthErr = url.searchParams.get('error');
    if (oauthErr) {
      const desc = url.searchParams.get('error_description') || oauthErr;
      return Response.redirect(buildRedirectWithHash(stateData.returnTo, 'oauth_error', desc), 302);
    }

    const code = url.searchParams.get('code');
    if (!code) {
      return Response.redirect(
        buildRedirectWithHash(stateData.returnTo, 'oauth_error', 'Missing authorization code from Google.'),
        302
      );
    }

    try {
      const redirectUri = `${url.origin}/auth/callback`;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();
      if (tokens.error || !tokens.access_token) {
        const msg = tokens.error_description || tokens.error || 'Failed to exchange authorization code';
        return Response.redirect(buildRedirectWithHash(stateData.returnTo, 'oauth_error', msg), 302);
      }

      let sessionToken = null;
      const headers = new Headers({
        Location: stateData.returnTo,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      });

      if (tokens.refresh_token) {
        sessionToken = await sealJson(
          { rt: tokens.refresh_token, iat: Date.now() },
          env.GOOGLE_CLIENT_SECRET
        );
        headers.append(
          'Set-Cookie',
          `auth_refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=31536000`
        );
      }

      const callbackPayload = encodeJsonBase64Url({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        ...(sessionToken ? { session_token: sessionToken } : {}),
      });

      headers.set('Location', buildRedirectWithHash(stateData.returnTo, 'oauth_callback', callbackPayload));
      return new Response(null, { status: 302, headers });
    } catch (e) {
      return Response.redirect(
        buildRedirectWithHash(stateData.returnTo, 'oauth_error', e.message || 'Unexpected authentication error'),
        302
      );
    }
  }

  // 3. Legacy Popup Auth Flow: Exchange Authorization Code for Refresh Token
  if (request.method === 'POST' && url.pathname === '/auth/google') {
    try {
      const { code } = await request.json();

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: 'postmessage',
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        return new Response(JSON.stringify(tokens), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const responseHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/json',
      };

      let sessionToken = undefined;
      if (tokens.refresh_token) {
        responseHeaders['Set-Cookie'] = `auth_refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=31536000`;
        sessionToken = await sealJson({ rt: tokens.refresh_token, iat: Date.now() }, env.GOOGLE_CLIENT_SECRET);
      }

      return new Response(
        JSON.stringify({
          success: true,
          access_token: tokens.access_token,
          expires_in: tokens.expires_in,
          ...(sessionToken ? { session_token: sessionToken } : {}),
        }),
        { headers: responseHeaders }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // 4. Auth Flow: Get Access Token using Encrypted Session Token or Refresh Token Cookie
  if (request.method === 'GET' && url.pathname === '/auth/token') {
    const refreshToken = await extractRefreshToken(request, env);
    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: 'No valid session credentials received. Please sign in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const tokens = await getAccessTokenFromRefreshToken(refreshToken, env, false);
      return new Response(JSON.stringify(tokens), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      const payload = e.oauthError || { error: e.message };
      const status = e.oauthError ? 401 : 500;
      return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
