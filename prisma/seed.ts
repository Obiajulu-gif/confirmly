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
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = (match[2] ?? "")
        .trim()
        .replace(/^"(.*)"$/, "$1");
    }
  }
}

const prisma = new PrismaClient();
const naira = (amount: number) => amount * 100;

type SeedProduct = {
  name: string;
  priceNaira: number;
  aliases: string[];
  category: string;
  description: string;
  stock?: number;
  imageUrl?: string;
  colours?: string[];
  sizes?: string[];
};

type SeedZone = {
  name: string;
  feeNaira: number;
  aliases: string[];
};

type SeedStore = {
  name: string;
  slug: string;
  storeCode: string;
  email: string;
  category: string;
  description: string;
  stateRegion: string;
  products: SeedProduct[];
  zones: SeedZone[];
};

const sharedLagosZones: SeedZone[] = [
  {
    name: "Yaba",
    feeNaira: 2_500,
    aliases: ["yaba", "yaba lagos", "unilag", "akoka", "sabo yaba"],
  },
  {
    name: "Surulere",
    feeNaira: 3_000,
    aliases: ["surulere", "shitta", "ojuelegba", "bode thomas"],
  },
  {
    name: "Ikeja",
    feeNaira: 3_500,
    aliases: ["ikeja", "allen", "computer village", "alausa"],
  },
  {
    name: "Lekki",
    feeNaira: 5_000,
    aliases: ["lekki", "lekki phase 1", "ajah", "chevron"],
  },
  {
    name: "Pickup",
    feeNaira: 0,
    aliases: ["pickup", "pick up", "store pickup", "i will come"],
  },
];

const stores: SeedStore[] = [
  {
    name: "Ada Styles",
    slug: "ada-styles",
    storeCode: "ADASTYLES",
    email: "hello@adastyles.example",
    category: "Fashion",
    description: "Everyday fashion staples, delivered across Lagos.",
    stateRegion: "Lagos",
    products: [
      {
        name: "Classic Polo Shirt",
        priceNaira: 12_000,
        aliases: ["polo", "polo shirt", "classic polo"],
        category: "Shirts",
        description: "Breathable cotton polo with a clean classic fit.",
        colours: ["Black", "White", "Navy"],
        sizes: ["S", "M", "L", "XL"],
      },
      {
        name: "Graphic T-Shirt",
        priceNaira: 9_500,
        aliases: ["t shirt", "tee", "graphic tee"],
        category: "Shirts",
        description: "Soft cotton tee with a durable printed design.",
        colours: ["Black", "White"],
        sizes: ["S", "M", "L", "XL"],
      },
      {
        name: "Premium Hoodie",
        priceNaira: 25_000,
        aliases: ["hoodie", "sweater", "hooded top"],
        category: "Hoodies",
        description: "Heavyweight fleece hoodie for cool evenings.",
        colours: ["Black", "Grey"],
        sizes: ["M", "L", "XL"],
      },
      {
        name: "Canvas Tote Bag",
        priceNaira: 8_500,
        aliases: ["tote", "tote bag", "canvas bag"],
        category: "Accessories",
        description: "Durable everyday canvas tote.",
        colours: ["Natural", "Black"],
        sizes: ["Standard"],
      },
      {
        name: "Chino Trousers",
        priceNaira: 18_000,
        aliases: ["chino", "trousers", "pants"],
        category: "Trousers",
        description: "Smart-casual stretch chinos for work and weekends.",
        colours: ["Black", "Khaki", "Navy"],
        sizes: ["30", "32", "34", "36"],
      },
    ],
    zones: sharedLagosZones,
  },
  {
    name: "ChainMove Store",
    slug: "chainmove-store",
    storeCode: "CHAINMOVE",
    email: "store@chainmove.xyz",
    category: "Travel and vehicle accessories",
    description: "Useful travel, driver and vehicle essentials for safer trips.",
    stateRegion: "Lagos",
    products: [
      {
        name: "Reflective Safety Vest",
        priceNaira: 7_500,
        aliases: ["safety vest", "reflective vest", "driver vest"],
        category: "Driver Essentials",
        description: "High-visibility vest for roadside and night-time safety.",
        colours: ["Yellow", "Orange"],
        sizes: ["M", "L", "XL"],
      },
      {
        name: "Dashboard Phone Mount",
        priceNaira: 10_000,
        aliases: ["phone mount", "car phone holder", "dashboard holder"],
        category: "Vehicle Accessories",
        description: "Adjustable dashboard mount for safer navigation.",
        colours: ["Black"],
        sizes: ["Standard"],
      },
      {
        name: "Compact First Aid Kit",
        priceNaira: 15_000,
        aliases: ["first aid", "medical kit", "emergency kit"],
        category: "Travel Essentials",
        description: "Compact emergency kit for vehicles and road trips.",
        sizes: ["Standard"],
      },
      {
        name: "Dual Port Car Charger",
        priceNaira: 8_000,
        aliases: ["car charger", "vehicle charger", "usb car charger"],
        category: "Vehicle Accessories",
        description: "Fast dual-port charger for phones and travel devices.",
        colours: ["Black", "White"],
        sizes: ["Standard"],
      },
      {
        name: "Waterproof Rain Cover",
        priceNaira: 6_500,
        aliases: ["rain cover", "waterproof cover", "bag cover"],
        category: "Travel Essentials",
        description: "Lightweight waterproof cover for bags and equipment.",
        colours: ["Black", "Blue"],
        sizes: ["Medium", "Large"],
      },
      {
        name: "Insulated Travel Bottle",
        priceNaira: 9_000,
        aliases: ["water bottle", "travel flask", "insulated bottle"],
        category: "Travel Essentials",
        description: "Reusable insulated bottle that keeps drinks cool.",
        colours: ["Black", "Silver", "Blue"],
        sizes: ["500ml", "750ml"],
      },
    ],
    zones: sharedLagosZones,
  },
  {
    name: "Tech Corner",
    slug: "tech-corner",
    storeCode: "TECHCORNER",
    email: "hello@techcorner.example",
    category: "Electronics and accessories",
    description: "Everyday charging, audio and laptop accessories.",
    stateRegion: "Lagos",
    products: [
      {
        name: "USB-C Fast Charger",
        priceNaira: 14_000,
        aliases: ["type c charger", "fast charger", "usb c adapter"],
        category: "Chargers",
        description: "Compact fast charger for supported phones and tablets.",
        colours: ["White", "Black"],
        sizes: ["20W", "30W"],
      },
      {
        name: "Wireless Earbuds",
        priceNaira: 28_000,
        aliases: ["earbuds", "wireless earpiece", "bluetooth earphones"],
        category: "Audio",
        description: "Portable wireless earbuds with charging case.",
        colours: ["Black", "White"],
        sizes: ["Standard"],
      },
      {
        name: "Twenty Thousand mAh Power Bank",
        priceNaira: 32_000,
        aliases: ["power bank", "portable charger", "20000mah"],
        category: "Chargers",
        description: "High-capacity power bank with multiple output ports.",
        colours: ["Black"],
        sizes: ["20000mAh"],
      },
      {
        name: "Protective Laptop Sleeve",
        priceNaira: 16_500,
        aliases: ["laptop sleeve", "laptop pouch", "computer bag"],
        category: "Accessories",
        description: "Padded sleeve for daily laptop protection.",
        colours: ["Black", "Grey"],
        sizes: ["13 inch", "15 inch"],
      },
      {
        name: "Braided USB-C Cable",
        priceNaira: 5_500,
        aliases: ["type c cable", "usb c cable", "charging cable"],
        category: "Chargers",
        description: "Durable braided cable for charging and data transfer.",
        colours: ["Black", "Red"],
        sizes: ["1 metre", "2 metres"],
      },
    ],
    zones: sharedLagosZones,
  },
];

async function seedStore(input: SeedStore) {
  const merchant = await prisma.merchant.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      storeCode: input.storeCode,
      category: input.category,
      description: input.description,
      active: true,
    },
    create: {
      name: input.name,
      slug: input.slug,
      storeCode: input.storeCode,
      email: input.email,
      category: input.category,
      description: input.description,
      phoneNumber: "+2348000000000",
      stateRegion: input.stateRegion,
      country: "Nigeria",
      currency: "NGN",
      active: true,
      onboardedAt: new Date(),
    },
  });

  for (const seedProduct of input.products) {
    const existing = await prisma.product.findFirst({
      where: { merchantId: merchant.id, name: seedProduct.name },
    });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            description: seedProduct.description,
            category: seedProduct.category,
            priceKobo: naira(seedProduct.priceNaira),
            aliases: seedProduct.aliases,
            stockQuantity: seedProduct.stock ?? 100,
            active: true,
            ...(seedProduct.imageUrl ? { imageUrl: seedProduct.imageUrl } : {}),
          },
        })
      : await prisma.product.create({
          data: {
            merchantId: merchant.id,
            name: seedProduct.name,
            description: seedProduct.description,
            category: seedProduct.category,
            priceKobo: naira(seedProduct.priceNaira),
            aliases: seedProduct.aliases,
            stockQuantity: seedProduct.stock ?? 100,
            active: true,
            imageUrl: seedProduct.imageUrl ?? null,
          },
        });

    const colours = seedProduct.colours ?? [];
    const sizes = seedProduct.sizes ?? [];
    if (colours.length || sizes.length) {
      const colourValues = colours.length ? colours : ["Standard"];
      const sizeValues = sizes.length ? sizes : ["Standard"];
      for (const colour of colourValues) {
        for (const size of sizeValues) {
          await prisma.productVariant.upsert({
            where: {
              productId_size_colour: {
                productId: product.id,
                size,
                colour,
              },
            },
            update: { stockQuantity: 25 },
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
  }

  for (const zone of input.zones) {
    await prisma.deliveryZone.upsert({
      where: {
        merchantId_name: { merchantId: merchant.id, name: zone.name },
      },
      update: {
        feeKobo: naira(zone.feeNaira),
        aliases: zone.aliases,
        active: true,
      },
      create: {
        merchantId: merchant.id,
        name: zone.name,
        feeKobo: naira(zone.feeNaira),
        aliases: zone.aliases,
        active: true,
      },
    });
  }

  return merchant;
}

async function main() {
  const merchants = [];
  for (const store of stores) merchants.push(await seedStore(store));

  const email = process.env.DEMO_MERCHANT_EMAIL;
  const password = process.env.DEMO_MERCHANT_PASSWORD;
  if (email && password) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hashSync(password, 12) },
      create: {
        name: "Demo Owner",
        email,
        passwordHash: hashSync(password, 12),
      },
    });
    for (const merchant of merchants) {
      await prisma.merchantMembership.upsert({
        where: {
          userId_merchantId: { userId: user.id, merchantId: merchant.id },
        },
        update: {},
        create: { userId: user.id, merchantId: merchant.id, role: "OWNER" },
      });
    }
    console.log(`Seeded demo owner membership for ${merchants.length} stores: ${email}`);
  } else {
    console.warn(
      "DEMO_MERCHANT_EMAIL / DEMO_MERCHANT_PASSWORD not set — no demo login user seeded."
    );
  }

  console.log(
    `Seeded ${stores.length} stores and ${stores.reduce((total, store) => total + store.products.length, 0)} products.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
