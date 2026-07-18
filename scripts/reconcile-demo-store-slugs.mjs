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
} finally {
  await prisma.$disconnect();
}
