const apiBase = (process.env.STAGING_API_URL ?? 'https://api.servicebusiness.eu.org').replace(/\/$/, '');
const adminBase = (process.env.STAGING_ADMIN_URL ?? 'https://admin.servicebusiness.eu.org').replace(/\/$/, '');
const websiteBase = (process.env.STAGING_WEBSITE_URL ?? 'https://rewzio.servicebusiness.eu.org').replace(/\/$/, '');
const cdnBase = (process.env.STAGING_CDN_URL ?? 'https://cdn.servicebusiness.eu.org').replace(/\/$/, '');

async function check(name, url, allowed = [200]) {
  const response = await fetch(url, { redirect: 'manual' });
  if (!allowed.includes(response.status)) {
    throw new Error(`${name} expected ${allowed.join('/')} but received ${response.status} (${url})`);
  }
  console.log(`PASS ${name}: ${response.status}`);
}

await check('API health', `${apiBase}/health`);
await check('API v1', `${apiBase}/api/v1`);
await check('Admin', adminBase, [200, 301, 302, 307, 308]);
await check('Website', websiteBase, [200, 301, 302, 307, 308]);
await check('CDN', cdnBase, [200, 301, 302, 307, 308, 404]);
console.log('PUBLIC STAGING E2E SMOKE PASS');
