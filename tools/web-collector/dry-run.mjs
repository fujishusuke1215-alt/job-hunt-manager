import { createHash } from 'node:crypto'
const fingerprint = createHash('sha256').update('https://example.invalid/recruit\n<main>sample recruitment page</main>').digest('hex')
console.log(JSON.stringify({ dryRun: true, fingerprintExample: fingerprint }, null, 2))
