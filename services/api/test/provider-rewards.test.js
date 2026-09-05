import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.ADS_PROVIDER_SECRET = 'a'.repeat(32);
process.env.SURVEY_PROVIDER_SECRET = 'b'.repeat(32);
process.env.OFFERWALL_PROVIDER_SECRET = 'c'.repeat(32);

const { HmacAdsProvider, AdsService } = await import('../dist/modules/ads/service.js');
const { HmacSurveyProvider, SurveyService } = await import('../dist/modules/survey/service.js');
const { HmacOfferwallProvider, OfferwallService } = await import('../dist/modules/offerwall/service.js');
const { withProviderTimeout } = await import('../dist/modules/offerwall/provider.js');

function signed(secret, body) { return createHmac('sha256', secret).update(body).digest('hex'); }
const headers = (signature) => ({ 'x-provider-signature': signature });

const body = JSON.stringify({ eventId: 'evt-1234', userId: 'u1', appId: 'a1', placementId: 'p1', status: 'COMPLETED', rewardAmount: 999999, sessionId: 's1' });
const adsProvider = new HmacAdsProvider();
assert.equal(await adsProvider.verifyCallback({ headers: headers(signed(process.env.ADS_PROVIDER_SECRET, body)), rawBody: body }), true);
assert.equal(await adsProvider.verifyCallback({ headers: headers('00'), rawBody: body }), false);
assert.equal((await adsProvider.normalizeCallback(JSON.parse(body))).eventId, 'evt-1234');

const duplicateRedis = {
  async incrementWithExpiry() { return 1; },
  async set() {},
  async get(key) { return key.includes('processed') ? 'already-processed' : null; },
};
const duplicateDb = { surveyCompletions: { async findFirst() { return { id: 'existing' }; } } };
const surveyService = new SurveyService(duplicateDb, duplicateRedis, {
  name: 'generic',
  async verifyCallback() { return true; },
  async normalizeCallback() { return { provider: 'generic', eventId: 'evt-1', userId: 'u1', appId: 'a1', surveyExternalId: 'survey-1', status: 'COMPLETED', payload: {} }; },
});
const duplicate = await surveyService.callback({}, '{}', {});
assert.equal(duplicate.status, 'DUPLICATE');

const replayRedis = {
  async incrementWithExpiry() { return 1; },
  async set() {},
  async get(key) { return key.includes('processed') ? 'reward-1' : null; },
};
const replayDb = { rewards: { async findFirst() { throw new Error('must not reach reward grant'); } } };
const adsService = new AdsService(replayDb, replayRedis, {
  name: 'generic',
  async verifyCallback() { return true; },
  async normalizeCallback() { return { provider: 'generic', eventId: 'evt-replay', userId: 'u1', appId: 'a1', placementId: 'p1', status: 'COMPLETED', payload: {} }; },
});
const replay = await adsService.callback({}, '{}', {});
assert.equal(replay.status, 'DUPLICATE');
assert.equal(replay.replayed, true);

const offerProvider = new HmacOfferwallProvider();
const offerBody = JSON.stringify({ eventId: 'ow-1', appId: 'a1', offerwallId: 'ow', eventType: 'completed', userId: 'u1' });
assert.equal(await offerProvider.verifyCallback({ headers: headers(signed(process.env.OFFERWALL_PROVIDER_SECRET, offerBody)), rawBody: offerBody }), true);
assert.equal(await offerProvider.verifyCallback({ headers: headers(signed('wrong', offerBody)), rawBody: offerBody }), false);

await assert.rejects(() => withProviderTimeout(new Promise((resolve) => setTimeout(resolve, 30)), 5), /Provider request timed out/);

const invalidOfferwallDb = { offerwalls: { async findFirst() { return null; } } };
const invalidOfferwall = new OfferwallService(invalidOfferwallDb, duplicateRedis, {
  name: 'generic', async verifyCallback() { return false; }, async normalizeCallback() { throw new Error('must not normalize'); },
});
await assert.rejects(() => invalidOfferwall.callback({}, '{}', {}), /signature is invalid/);

console.log('PASS provider callback security/idempotency/timeout tests');
