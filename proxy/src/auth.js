
export async function handleAuth(request, env, corsHeaders) {
  const url = new URL(request.url);

  // Auth Flow: Exchange Authorization Code for Refresh Token
  if (request.method === 'POST' && url.pathname === '/auth/google') {
    try {
      const { code } = await request.json();

      // 1. Exchange code for tokens with Google
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
      
      // 2. Set the Refresh Token in a Secure, HttpOnly cookie
      const cookie = `auth_refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          ...corsHeaders,
          'Set-Cookie': cookie,
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  // Auth Flow: Get Access Token using Refresh Token from Cookie
  if (request.method === 'GET' && url.pathname === '/auth/token') {
    const cookieHeader = request.headers.get('Cookie');
    const refreshToken = cookieHeader?.match(/auth_refresh_token=([^;]+)/)?.[1];

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: 'No refresh token found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
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
      
      if (tokens.error) {
           // If refresh token is invalid, maybe clear cookie?
           return new Response(JSON.stringify(tokens), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify(tokens), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  return null;
}
