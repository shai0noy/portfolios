// src/lib/fetching/utils/xml_parser.ts

/**
 * Parses an XML string into a DOM Document object.
 * @param xmlString The XML string to parse.
 * @returns A DOM Document object representing the parsed XML.
 * @throws Error if the XML string cannot be parsed.
 */
export function parseXmlString(xmlString: string): Document {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

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
 * Helper function to get the text content of the first element matching the tag and namespace.
 * @param element The parent element to search within.
 * @param tagName The local name of the tag.
 * @param namespace The namespace URI.
 * @returns The text content or null if not found.
 */
export function getTextContent(element: Element | Document, tagName: string, namespace: string | null = null): string | null {
    const els = namespace ? element.getElementsByTagNameNS(namespace, tagName) : element.getElementsByTagName(tagName);
    return els && els.length > 0 ? els[0].textContent : null;
}

/**
 * Fetches XML from a given URL.
 * @param url The URL to fetch.
 * @param signal AbortSignal for canceling the fetch.
 * @returns The XML string.
 * @throws Error if fetch fails.
 */
export async function fetchXml(url: string, signal?: AbortSignal, options?: RequestInit): Promise<string> {
    try {
        const response = await fetch(url, { signal, ...options });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Fetch failed for ${url} with status ${response.status}:`, errorBody);
            throw new Error(`Network response was not ok for ${url}: ${response.statusText}`);
        }
        return await response.text();
    } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
            console.log(`Fetch aborted for ${url}`);
        } else {
            console.error(`Fetch failed for ${url}:`, e);
        }
        throw e;
    }
}
