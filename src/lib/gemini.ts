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

/**
 * Selects the best available default model based on the following priority:
 * 1. Exact match for "Gemini Pro Latest" or "Gemini Flash Latest" (case-insensitive)
 * 2. Latest "Pro" model
 * 3. Latest "Flash" or standard model (filtering out specific keywords like large/thinking/xl if possible)
 */
/**
 * Finds the best model matching specific capability criteria
 */
export function getModelByCapability(models: GeminiModel[], type: 'fast' | 'thinking'): string {
    const getVersion = (name: string) => {
        const match = name.match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[0]) : 0;
    };

    const findBestModel = (mustMatch: RegExp, mustNotMatch: RegExp = /(?!)/) => {
        const candidates = models.filter(m =>
            mustMatch.test(m.name) && !mustNotMatch.test(m.name)
        );

        // Prefer "latest" in display name
        const latest = candidates.find(m => /latest/i.test(m.displayName));
        if (latest) return latest.name;

        // Sort by version descending
        return candidates.sort((a, b) => getVersion(b.name) - getVersion(a.name))[0]?.name;
    };

    if (type === 'thinking') {
        // High capability -> Pro
        const bestPro = findBestModel(/gemini.*pro/i);
        if (bestPro) return bestPro;
    }

    // Default or 'fast' -> Flash (excluding 8b if possible)
    const bestFlash = findBestModel(/gemini.*flash/i, /8b/i);
    if (bestFlash) return bestFlash;

    // Fallback to any Flash if no standard Flash is found
    const anyFlash = findBestModel(/gemini.*flash/i);
    if (anyFlash) return anyFlash;

    // Fallback: Best Gemini (avoiding weird variants if possible)
    return findBestModel(/gemini/i, /(large|expert|thinking|xl)/i)
        || findBestModel(/gemini/i)
        || 'models/gemini-3-flash';
}

/**
 * Selects the best available default model (General purpose Pro)
 */
export function getBestDefaultModel(models: GeminiModel[]): string {
    return getModelByCapability(models, 'thinking');
}

export async function askGemini(
    apiKey: string,
    history: ChatMessage[],
    newPrompt: string,
    selectedModel: string,
    systemInstruction?: string
): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`;

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
