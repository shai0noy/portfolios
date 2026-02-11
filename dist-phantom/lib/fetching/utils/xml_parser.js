"use strict";
// src/lib/fetching/utils/xml_parser.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseXmlString = parseXmlString;
exports.extractDataFromXmlNS = extractDataFromXmlNS;
exports.getTextContent = getTextContent;
exports.fetchXml = fetchXml;
/**
 * Parses an XML string into a DOM Document object.
 * @param xmlString The XML string to parse.
 * @returns A DOM Document object representing the parsed XML.
 * @throws Error if the XML string cannot be parsed.
 */
function parseXmlString(xmlString) {
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
function extractDataFromXmlNS(xmlDoc, namespaceUri, localName, mapFunction) {
    const elements = xmlDoc.getElementsByTagNameNS(namespaceUri, localName);
    const data = [];
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        try {
            const result = mapFunction(element);
            if (result !== null) {
                data.push(result);
            }
        }
        catch (error) {
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
function getTextContent(element, tagName, namespace = null) {
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
async function fetchXml(url, signal) {
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Fetch failed for ${url} with status ${response.status}:`, errorBody);
            throw new Error(`Network response was not ok for ${url}: ${response.statusText}`);
        }
        return await response.text();
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            console.log(`Fetch aborted for ${url}`);
        }
        else {
            console.error(`Fetch failed for ${url}:`, e);
        }
        throw e;
    }
}
