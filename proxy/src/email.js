import { decryptData } from './utils.js';

export async function handleScheduled(event, env, ctx) {
  const secretKey = env.KV_ENCRYPTION_KEY || 'default_secret_key_change_me';
  const brevoApiKey = env.BREVO_API_KEY;

  if (!brevoApiKey) {
    console.error("BREVO_API_KEY not set");
    return;
  }

  const list = await env.SUBSCRIPTIONS.list();
  const now = new Date();
  const isSunday = now.getDay() === 0;
  const isFirstOfMonth = now.getDate() === 1;

  for (const key of list.keys) {
    try {
      const encryptedData = await env.SUBSCRIPTIONS.get(key.name);
      if (!encryptedData) continue;

      const sub = await decryptData(encryptedData, secretKey);
      const { frequency, spreadsheetId, refreshToken, email } = sub;

      const shouldSend =
        frequency === 'daily' ||
        (frequency === 'weekly' && isSunday) ||
        (frequency === 'monthly' && isFirstOfMonth);

      if (!shouldSend) continue;

      console.log(`Processing subscription for ${email} (${frequency})`);

      // 1. Get Access Token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = await tokenRes.json();
      if (tokens.error) {
        console.error(`Failed to refresh token for ${email}:`, tokens.error);
        continue;
      }

      // 2. Fetch Spreadsheet Data
      const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const [holdingsRes, ratesRes] = await Promise.all([
        fetch(`${baseUrl}/values/Holdings!A2:J`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }),
        fetch(`${baseUrl}/values/Currency_Conversions!A2:B`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
      ]);

      if (!holdingsRes.ok || !ratesRes.ok) {
        console.error(`Failed to fetch sheets for ${email}`);
        continue;
      }

      const holdingsData = await holdingsRes.json();
      const ratesData = await ratesRes.json();

      // 3. Process Data
      const holdings = holdingsData.values || [];
      const ratesRows = ratesData.values || [];

      const rates = { USD: 1 }; // Default
      ratesRows.forEach(r => {
        const pair = String(r[0]).trim().toUpperCase();
        if (pair.length === 6) {
          const from = pair.substring(0, 3);
          const to = pair.substring(3, 6);
          const val = parseFloat(r[1]);
          if (!isNaN(val) && val > 0) {
            if (!rates[from]) rates[from] = {};
            rates[from][to] = val;
          }
        }
      });

      const getRateToUSD = (curr) => {
        if (curr === 'USD') return 1;
        if (rates[curr]?.['USD']) return rates[curr]['USD'];
        if (rates['USD']?.[curr]) return 1 / rates['USD'][curr];
        return 1;
      };

      const getRateToILS = (curr) => {
        if (curr === 'ILS') return 1;
        if (rates[curr]?.['ILS']) return rates[curr]['ILS'];
        const toUsd = getRateToUSD(curr);
        const usdToIls = rates['USD']?.['ILS'] || 3.6;
        return toUsd * usdToIls;
      };

      let totalValueILS = 0;
      let totalValueUSD = 0;
      const topHoldings = [];

      holdings.forEach(h => {
        const ticker = h[0];
        const val = parseFloat(h[4]);
        const curr = h[3] || 'USD';

        if (!isNaN(val)) {
          totalValueILS += val * getRateToILS(curr);
          totalValueUSD += val * getRateToUSD(curr);
          topHoldings.push({ ticker, val, curr });
        }
      });

      topHoldings.sort((a, b) => b.val - a.val);

      // 4. Format Email
      const emailSubject = `Your Portfolio Summary - ${frequency.charAt(0).toUpperCase() + frequency.slice(1)}`;
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Portfolio Summary</h2>
          <p>Here is your ${frequency} summary for portfolio sheet: <strong>${spreadsheetId}</strong></p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="font-size: 18px; margin: 5px 0;">Total Value (ILS): <strong>₪${totalValueILS.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></p>
            <p style="font-size: 18px; margin: 5px 0;">Total Value (USD): <strong>$${totalValueUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></p>
          </div>

          <h3>Top Holdings</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #e4e4e4;">
                <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Ticker</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${topHoldings.slice(0, 5).map(th => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">${th.ticker}</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${th.val.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${th.curr}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            This is an automated email. To unsubscribe, visit the dashboard.
          </p>
        </div>
      `;

      // 5. Send Email via Brevo
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Portfolios App', email: 'notifications@yourdomain.com' }, // Replace with your verified Brevo sender
          to: [{ email: email }],
          subject: emailSubject,
          htmlContent: emailHtml
        })
      });

      if (brevoRes.ok) {
        console.log(`Email sent to ${email}`);
      } else {
        const errText = await brevoRes.text();
        console.error(`Failed to send email to ${email}:`, errText);
      }

    } catch (e) {
      console.error(`Error processing subscription for key ${key.name}:`, e);
    }
  }
}

