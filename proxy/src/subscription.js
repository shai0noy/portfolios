import { hashEmail, encryptData, decryptData } from './utils.js';

export async function handleSubscription(request, env, corsHeaders) {
  const url = new URL(request.url);
  const secretKey = env.KV_ENCRYPTION_KEY || 'default_secret_key_change_me';

  if (request.method === 'GET') {
    const spreadsheetId = url.searchParams.get('spreadsheetId');
    if (!spreadsheetId) {
      return new Response(JSON.stringify({ error: 'Missing spreadsheetId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const kvKey = await hashEmail(spreadsheetId);
    const encryptedData = await env.SUBSCRIPTIONS.get(kvKey);

    if (!encryptedData) {
      return new Response(JSON.stringify({ frequency: 'none' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    try {
      const sub = await decryptData(encryptedData, secretKey);
      return new Response(JSON.stringify({ frequency: sub.frequency, email: sub.email }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to decrypt status' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }


  const cookieHeader = request.headers.get('Cookie');
  const refreshToken = cookieHeader?.match(/auth_refresh_token=([^;]+)/)?.[1];

  if (!refreshToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized: No refresh token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { frequency, spreadsheetId, email: targetEmail } = await request.json();

    if (!['daily', 'weekly', 'monthly', 'unsubscribe'].includes(frequency)) {
      return new Response(JSON.stringify({ error: 'Invalid frequency' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (frequency !== 'unsubscribe' && !spreadsheetId) {
      return new Response(JSON.stringify({ error: 'Missing spreadsheetId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    if (tokens.error) {
      return new Response(JSON.stringify({ error: 'Failed to refresh token: ' + tokens.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userResponse.json();
    if (!userInfo.email) {
      return new Response(JSON.stringify({ error: 'Failed to fetch user email. Ensure email scope is granted.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!userInfo.email && !targetEmail) {
      return new Response(JSON.stringify({ error: 'Failed to fetch user email. Ensure email scope is granted.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailToStore = targetEmail || userInfo.email;
    const kvKey = await hashEmail(spreadsheetId);

    if (frequency === 'unsubscribe') {
      await env.SUBSCRIPTIONS.delete(kvKey);
    } else {
      const dataToStore = {
        frequency,
        spreadsheetId,
        refreshToken,
        email: emailToStore,
        updatedAt: new Date().toISOString()
      };

      const encryptedData = await encryptData(dataToStore, secretKey);
      await env.SUBSCRIPTIONS.put(kvKey, encryptedData);
    }

    return new Response(JSON.stringify({ success: true, email: emailToStore, frequency }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });


  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}

