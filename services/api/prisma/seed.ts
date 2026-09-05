import { PrismaClient, AppStatus, Environment, FeatureMode } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const app = await prisma.apps.upsert({
    where: { slug: 'rewzio' },
    update: { name: 'Rewzio', packageName: 'com.servicebusiness.rewzio', status: AppStatus.ACTIVE, environment: Environment.LOCAL },
    create: { name: 'Rewzio', slug: 'rewzio', packageName: 'com.servicebusiness.rewzio', status: AppStatus.ACTIVE, environment: Environment.LOCAL }
  });

  await prisma.appSettings.upsert({
    where: { appId_key: { appId: app.id, key: 'coin_rate_idr' } },
    update: { value: 10, version: 1 },
    create: { appId: app.id, key: 'coin_rate_idr', value: 10, version: 1 }
  });

  for (const [key, enabled] of [
    ['watch', true], ['reward', true], ['withdrawal', true], ['referral', true],
    ['survey', true], ['offerwall', true], ['spin', true], ['game', true], ['ads', true]
  ] as const) {
    await prisma.featureFlags.upsert({
      where: { appId_key: { appId: app.id, key } },
      update: { enabled, mode: FeatureMode.APP },
      create: { appId: app.id, key, enabled, mode: FeatureMode.APP }
    });
  }

  console.log(`Seeded development app: ${app.slug} (${app.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
