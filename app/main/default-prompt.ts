import { readFileSync } from 'node:fs';

// The build embeds this Markdown verbatim; source execution reads the same file.
export const defaultPrompt = readFileSync(new URL('../../chihaya_prompt.md', import.meta.url), 'utf8');
