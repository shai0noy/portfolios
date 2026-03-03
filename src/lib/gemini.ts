import { getMetadataValue } from './sheets';
import { decryptSecret } from './crypto';

export async function checkGeminiKey(sheetId: string): Promise<string | null> {
    const encrypted = await getMetadataValue(sheetId, 'aistudio_apikey');
    if (!encrypted) return null;
    return await decryptSecret(encrypted, sheetId);
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface GeminiModel {
    name: string;
    version: string;
    displayName: string;
    description: string;
    supportedGenerationMethods: string[];
}

export async function fetchModels(apiKey: string): Promise<GeminiModel[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).filter((m: GeminiModel) =>
        m.supportedGenerationMethods.includes('generateContent')
    );
}

export async function askGemini(
    apiKey: string,
    history: ChatMessage[],
    newPrompt: string,
    model: string = 'models/gemini-1.5-flash',
    systemInstruction?: string
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

    const contents: ChatMessage[] = [
        ...history,
        { role: 'user', parts: [{ text: newPrompt }] }
    ];

    const body: any = { contents };
    if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
