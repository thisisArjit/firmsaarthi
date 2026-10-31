import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url)),'cloudflare:workers':fileURLToPath(new URL('./tests/mocks/cloudflare.ts',import.meta.url))}},test:{include:['tests/**/*.test.ts','tests/**/*.test.tsx','tests/**/*.test.mjs'],testTimeout:120000,coverage:{provider:'v8',include:['lib/**/*.{ts,tsx}','app/**/*.{ts,tsx}'],reporter:['text','html','json-summary','lcov'],reportsDirectory:'outputs/coverage'}}});
