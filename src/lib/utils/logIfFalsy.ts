
export function logIfFalsy<T>(value: T, message: string, details?: any): T {
    if (!value) {
        console.warn(`FALSY value detected: ${message}`, { value, details });
    }
    return value;
}
