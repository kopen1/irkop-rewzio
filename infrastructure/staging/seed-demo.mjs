import { PrismaClient, AppStatus, Environment, FeatureMode, RewardStatus, ContentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const app = await prisma.apps.upsert({
    where: { slug: 'rewzio-staging' },
    update: {
      name: 'Rewzio Staging Demo',
      packageName: 'com.servicebusiness.rewzio.staging',
      status: AppStatus.ACTIVE,
      environment: Environment.STAGING
    },
    create: {
      name: 'Rewzio Staging Demo',
      slug: 'rewzio-staging',
      packageName: 'com.servicebusiness.rewzio.staging',
      status: AppStatus.ACTIVE,
      environment: Environment.STAGING
    }
  });

  const settings = [
    ['environment', 'staging'],
    ['is_demo', true],
    ['social_proof_is_demo', true],
    ['payout_mode', 'MOCK']
  ];

  for (const [key, value] of settings) {
    await prisma.appSettings.upsert({
      where: { appId_key: { appId: app.id, key } },
      update: { value, version: 1 },
      create: { appId: app.id, key, value, version: 1 }
    });
  }

  await prisma.featureFlags.upsert({
    where: { appId_key: { appId: app.id, key: 'social_proof' } },
    update: { enabled: true, mode: FeatureMode.APP },
    create: { appId: app.id, key: 'social_proof', enabled: true, mode: FeatureMode.APP }
  });

  const reward = await prisma.rewards.upsert({
    where: { id: `${app.id}-demo-reward` },
    update: { name: 'STAGING DEMO — Daily Check-in', amount: 100n, sourceType: 'daily_checkin', sourceId: `${app.id}-demo-daily`, status: RewardStatus.CONFIRMED, metadata: { is_demo: true, environment: 'staging' } },
    create: { id: `${app.id}-demo-reward`, appId: app.id, name: 'STAGING DEMO — Daily Check-in', amount: 100n, sourceType: 'daily_checkin', sourceId: `${app.id}-demo-daily`, status: RewardStatus.CONFIRMED, metadata: { is_demo: true, environment: 'staging' } }
  });

  await prisma.dailyRewards.upsert({
    where: { id: `${app.id}-demo-daily` },
    update: { name: 'STAGING DEMO — Daily Check-in', rewardAmount: 100n, status: 'ACTIVE', cooldownSeconds: 86400, dailyLimit: 1 },
    create: { id: `${app.id}-demo-daily`, appId: app.id, name: 'STAGING DEMO — Daily Check-in', rewardAmount: 100n, status: 'ACTIVE', cooldownSeconds: 86400, dailyLimit: 1 }
  });

  await prisma.watchContents.upsert({
    where: { id: `${app.id}-demo-watch` },
    update: { title: 'STAGING DEMO — Authorized Test Video', description: 'Demo content for staging only.', sourceUrl: 'https://example.com/staging-demo.mp4', durationSeconds: 30, minimumWatchSeconds: 15, rewardAmount: 50n, status: ContentStatus.ACTIVE },
    create: { id: `${app.id}-demo-watch`, appId: app.id, title: 'STAGING DEMO — Authorized Test Video', description: 'Demo content for staging only.', sourceUrl: 'https://example.com/staging-demo.mp4', durationSeconds: 30, minimumWatchSeconds: 15, rewardAmount: 50n, status: ContentStatus.ACTIVE }
  });

  console.log(`STAGING DEMO seed PASS: ${app.slug} (${app.id}), reward=${reward.id}`);
}

main().catch((error) => {
  console.error('STAGING DEMO seed ERROR:', error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
