/** The rows of a JSONL text: blank lines dropped, a line that does not parse (a torn one) skipped. */
export declare function jsonl<T>(text: string): T[];
/** The line that started the turn now ending, as typed, from a transcript's text; `null` when no typed line started it. */
export declare function turnStartLine(transcript: string): string | null;
