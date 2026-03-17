let cachedCookie = null;
let cachedCrumb = null;

export async function getYahooCrumb() {
  if (cachedCookie && cachedCrumb) return { cookie: cachedCookie, crumb: cachedCrumb };

  const res = await fetch('https://fc.yahoo.com', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    redirect: 'manual'
  });

  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error("Failed to get Yahoo cookie");

  // Find A3 or B cookie
  const cookies = setCookie.split(',').map(s => s.trim());
  let targetCookie = null;
  for (const c of cookies) {
    const p = c.split(';')[0];
    if (p.startsWith('A3=') || p.startsWith('B=')) {
      targetCookie = p;
      break;
    }
  }

  if (!targetCookie) throw new Error("Failed to parse A3/B cookie: " + setCookie);
  cachedCookie = targetCookie;

  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cachedCookie
    }
  });

  cachedCrumb = await crumbRes.text();
  return { cookie: cachedCookie, crumb: cachedCrumb };
}

export function clearYahooCache() {
  cachedCookie = null;
  cachedCrumb = null;
}
