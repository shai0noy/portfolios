// src/lib/xmlParser.ts

/**
 * Parses an XML string into a DOM Document object.
 * @param xmlString The XML string to parse.
 * @returns A DOM Document object representing the parsed XML.
 * @throws Error if the XML string cannot be parsed.
 */
export function parseXmlString(xmlString: string): Document {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Check for parsing errors
    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) {
        throw new Error('Error parsing XML: ' + errorNode.textContent);
    }
    return xmlDoc;
}

/**
 * Extracts data from XML nodes using namespace-aware tag selection and a mapping function.
 * @param xmlDoc The DOM Document object to query.
 * @param namespaceUri The namespace URI of the elements to select.
 * @param localName The local name of the elements to select.
 * @param mapFunction A function that takes an Element and returns the desired data structure, or null to skip.
 * @returns An array of data extracted from the XML.
 */
export function extractDataFromXmlNS<T>(
    xmlDoc: Document, 
    namespaceUri: string,
    localName: string, 
    mapFunction: (element: Element) => T | null
): T[] {
    const elements = xmlDoc.getElementsByTagNameNS(namespaceUri, localName);
    const data: T[] = [];
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        try {
            const result = mapFunction(element);
            if (result !== null) {
                data.push(result);
            }
        } catch (error) {
            console.warn('Error mapping XML element:', element, error);
        }
    }
    return data;
}

/**
 * Fetches XML from a given URL, optionally using a proxy.
 * @param url The URL to fetch.
 * @param signal AbortSignal for canceling the fetch.
 * @param useProxy Whether to use the CORS proxy.
 * @returns The XML string.
 * @throws Error if fetch or proxy fetch fails.
 */
export async function fetchXml(url: string, signal?: AbortSignal, useProxy: boolean = true): Promise<string> {
    const PROXY_URL = 'https://corsproxy.io/?';

    try {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Network response was not ok for ${url}: ${response.statusText}`);
        return await response.text();
    } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw e; // Re-throw AbortError
        }
        console.warn(`Direct fetch failed for ${url}, trying proxy...`, e);
        if (!useProxy) {
            throw new Error(`Direct fetch failed and proxy use is disabled for ${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
        try {
            const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(url)}`, { signal });
            if (!proxyResponse.ok) throw new Error(`Proxy network response was not ok for ${url}: ${proxyResponse.statusText}`);
            return await proxyResponse.text();
        } catch (proxyError: unknown) {
            if (proxyError instanceof Error && proxyError.name === 'AbortError') {
                throw proxyError; // Re-throw AbortError
            }
            throw new Error(`Failed to fetch XML via proxy for ${url}: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`);
        }
    }
}
