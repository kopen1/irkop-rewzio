const base = (process.env.STAGING_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

async function expect(name, path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`);
  console.log(`PASS ${name}: ${response.status}`);
  return response;
}

await expect('staging API health', '/api/v1/health');
await expect('staging API readiness', '/api/v1/ready');
console.log('LOCAL STAGING E2E PASS');
