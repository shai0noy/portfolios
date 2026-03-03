import { getMetadataValue } from './sheets';
import { decryptSecret } from './crypto';

export async function checkGeminiKey(sheetId: string): Promise<string | null> {
    const encrypted = await getMetadataValue(sheetId, 'aistudio_apikey');
    if (!encrypted) return null;
    return await decryptSecret(encrypted, sheetId);
}

export async function askGemini(prompt: string, apiKey: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
