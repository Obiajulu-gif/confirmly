import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const identities = [
  { storeCode: "ADASTYLES", slug: "ada-styles" },
  { storeCode: "CHAINMOVE", slug: "chainmove-store" },
  { storeCode: "TECHCORNER", slug: "tech-corner" },
];

try {
  for (const identity of identities) {
    const [byCode, bySlug] = await Promise.all([
      prisma.merchant.findUnique({
        where: { storeCode: identity.storeCode },
        select: { id: true, slug: true },
      }),
      prisma.merchant.findUnique({
        where: { slug: identity.slug },
        select: { id: true, storeCode: true },
      }),
    ]);

    if (byCode && !bySlug && byCode.slug !== identity.slug) {
      await prisma.merchant.update({
        where: { id: byCode.id },
        data: { slug: identity.slug },
      });
      console.log(
        `Reconciled existing ${identity.storeCode} store to slug ${identity.slug}.`
      );
      continue;
    }

    if (byCode && bySlug && byCode.id !== bySlug.id) {
      throw new Error(
        `Cannot seed ${identity.storeCode}: its store code and expected slug belong to different merchants.`
      );
    }
  }

  // Test fixtures should never appear in the public WhatsApp store directory.
  const hidden = await prisma.merchant.updateMany({
    where: {
      OR: [
        { name: { startsWith: "Engine Test" } },
        { storeCode: { startsWith: "ENGINE" } },
      ],
    },
    data: { active: false },
  });
  if (hidden.count) {
    console.log(`Paused ${hidden.count} internal test store fixture(s).`);
  }
} finally {
  await prisma.$disconnect();
}
