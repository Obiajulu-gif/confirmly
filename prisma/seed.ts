import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Prisma CLI only loads .env — pull in .env.local too (never committed).
for (const file of [".env.local"]) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && m[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

const prisma = new PrismaClient();

const naira = (n: number) => n * 100; // NGN → kobo

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { slug: "ada-styles" },
    update: {},
    create: {
      name: "Ada Styles",
      slug: "ada-styles",
      email: "hello@adastyles.example",
      phoneNumber: "+2348000000000",
      currency: "NGN",
    },
  });

  // --- Demo merchant login (credentials come from env, never hardcoded) ---
  const email = process.env.DEMO_MERCHANT_EMAIL;
  const password = process.env.DEMO_MERCHANT_PASSWORD;
  if (email && password) {
    await prisma.merchantUser.upsert({
      where: { email },
      update: { passwordHash: hashSync(password, 12) },
      create: {
        merchantId: merchant.id,
        email,
        passwordHash: hashSync(password, 12),
        role: "OWNER",
      },
    });
    console.log(`Seeded merchant user: ${email}`);
  } else {
    console.warn(
      "DEMO_MERCHANT_EMAIL / DEMO_MERCHANT_PASSWORD not set — no login user seeded."
    );
  }

  // --- Products -----------------------------------------------------------
  const products: Array<{
    name: string;
    priceKobo: number;
    aliases: string[];
    category: string;
    description: string;
    colours: string[];
    sizes: string[];
  }> = [
    {
      name: "Classic Polo Shirt",
      priceKobo: naira(12_000),
      aliases: ["polo", "polo shirt", "classic polo"],
      category: "Tops",
      description: "Breathable cotton polo with a clean classic fit.",
      colours: ["Black", "White", "Navy"],
      sizes: ["S", "M", "L", "XL"],
    },
    {
      name: "Premium Hoodie",
      priceKobo: naira(25_000),
      aliases: ["hoodie", "sweater"],
      category: "Tops",
      description: "Heavyweight fleece hoodie for cool evenings.",
      colours: ["Black", "Grey"],
      sizes: ["M", "L", "XL"],
    },
    {
      name: "Canvas Tote Bag",
      priceKobo: naira(8_500),
      aliases: ["tote", "tote bag", "canvas bag"],
      category: "Accessories",
      description: "Durable everyday canvas tote.",
      colours: [],
      sizes: [],
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({
      where: { merchantId: merchant.id, name: p.name },
    });
    const product =
      existing ??
      (await prisma.product.create({
        data: {
          merchantId: merchant.id,
          name: p.name,
          description: p.description,
          category: p.category,
          priceKobo: p.priceKobo,
          aliases: p.aliases,
          stockQuantity: 100,
          active: true,
        },
      }));

    for (const colour of p.colours.length ? p.colours : [null]) {
      for (const size of p.sizes.length ? p.sizes : [null]) {
        if (colour === null && size === null) continue;
        await prisma.productVariant.upsert({
          where: {
            productId_size_colour: {
              productId: product.id,
              size: size as string,
              colour: colour as string,
            },
          },
          update: {},
          create: {
            productId: product.id,
            size,
            colour,
            stockQuantity: 25,
          },
        });
      }
    }
  }

  // --- Delivery zones -------------------------------------------------------
  const zones: Array<{ name: string; feeKobo: number; aliases: string[] }> = [
    { name: "Yaba", feeKobo: naira(2_500), aliases: ["yaba", "yaba lagos", "unilag", "akoka"] },
    { name: "Surulere", feeKobo: naira(3_000), aliases: ["surulere", "shitta", "ojuelegba"] },
    { name: "Ikeja", feeKobo: naira(3_500), aliases: ["ikeja", "allen", "computer village"] },
    { name: "Lekki", feeKobo: naira(5_000), aliases: ["lekki", "lekki phase 1", "ajah", "chevron"] },
    { name: "Pickup", feeKobo: 0, aliases: ["pickup", "pick up", "store pickup", "i will come"] },
  ];
  for (const z of zones) {
    await prisma.deliveryZone.upsert({
      where: { merchantId_name: { merchantId: merchant.id, name: z.name } },
      update: { feeKobo: z.feeKobo, aliases: z.aliases },
      create: {
        merchantId: merchant.id,
        name: z.name,
        feeKobo: z.feeKobo,
        aliases: z.aliases,
        active: true,
      },
    });
  }

  console.log("Seeded Ada Styles catalogue (3 products, 5 delivery zones).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
