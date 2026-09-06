const base = 'http://127.0.0.1:3001';

async function expect(name, path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`);
  console.log(`PASS ${name}: ${response.status}`);
}

await expect('staging API health', '/health');
await expect('staging API v1', '/api/v1');
console.log('LOCAL STAGING E2E PASS');
