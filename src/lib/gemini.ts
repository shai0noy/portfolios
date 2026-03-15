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

export const MODEL_PATTERN_PRO = /gemini.*pro/i;
export const MODEL_PATTERN_FOR_SEARCH = /gemini-2\.5-flash/i;
export const MODEL_PATTERN_FLASH = /gemini.*flash/i;
export const MODEL_PATTERN_EXCLUDE_8B = /8b/i;
export const FALLBACK_MODEL_PRO = 'models/gemini-3-pro';
export const FALLBACK_MODEL_FLASH = 'models/gemini-2.5-flash';

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
 * @param models The list of available models
 * @param type The desired performance profile
 * @param requiresSearch Whether the model must support web search (forces 2.5 Flash if needed)
 */
export function getModelByCapability(models: GeminiModel[], type: 'fast' | 'thinking', requiresSearch: boolean = false): string {
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
        return findBestModel(MODEL_PATTERN_PRO) || FALLBACK_MODEL_PRO;
    } else if (requiresSearch) {
        return findBestModel(MODEL_PATTERN_FOR_SEARCH) || findBestModel(MODEL_PATTERN_FLASH, MODEL_PATTERN_EXCLUDE_8B) || FALLBACK_MODEL_SEARCH;
    } else {
        return findBestModel(MODEL_PATTERN_FLASH, MODEL_PATTERN_EXCLUDE_8B) || FALLBACK_MODEL_FLASH;
    }
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
    systemInstruction?: string,
    enableSearch: boolean = false
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

    if (enableSearch) {
        // Enable Google Search Grounding for up-to-date info
        body.tools = [
            { googleSearch: {} }
        ];
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
    const candidate = data.candidates?.[0];
    let text = candidate?.content?.parts?.[0]?.text || '';

    const grounding = candidate?.groundingMetadata;
    const supports = grounding?.groundingSupports || [];
    const chunks = grounding?.groundingChunks || [];

    if (supports.length > 0 && chunks.length > 0) {
        // Sort in reverse order so we don't mess up string indices when mutating from the end backwards
        const sortedSupports = [...supports].sort((a: any, b: any) =>
            (b.segment?.endIndex || 0) - (a.segment?.endIndex || 0)
        );

        for (const support of sortedSupports) {
            const indices = support.groundingChunkIndices || [];
            if (indices.length > 0) {
                const end = support.segment?.endIndex || 0;
                if (end > 0 && end <= text.length) {
                    const citations = indices.map((idx: number) => {
                        const uri = chunks[idx]?.web?.uri;
                        return uri ? `[[${idx + 1}]](${uri})` : '';
                    }).filter(Boolean).join('');

                    if (citations) {
                        text = text.substring(0, end) + citations + text.substring(end);
                    }
                }
            }
        }
    }

    return text;
}
