"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSessionToken,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

const storeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().max(60).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  stateRegion: z.string().trim().max(80).optional().or(z.literal("")),
});

export interface StoreFormState {
  ok: boolean;
  error: string | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "store";
}

function codeFrom(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toUpperCase()
      .slice(0, 18) || "STORE"
  );
}

async function uniqueStoreIdentity(name: string) {
  const baseSlug = slugify(name);
  const baseCode = codeFrom(name);

  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const codeSuffix = attempt === 0 ? "" : String(attempt + 1);
    const slug = `${baseSlug}${suffix}`.slice(0, 64);
    const storeCode = `${baseCode}${codeSuffix}`.slice(0, 24);
    const existing = await prisma.merchant.findFirst({
      where: { OR: [{ slug }, { storeCode }] },
      select: { id: true },
    });
    if (!existing) return { slug, storeCode };
  }

  throw new Error("Could not generate a unique store identity");
}

async function setActiveStore(input: {
  userId: string;
  email: string;
  merchantId: string;
}) {
  const token = await createSessionToken(input);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function createStoreAction(
  _prev: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in again." };

  const parsed = storeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the store details.",
    };
  }

  const data = parsed.data;
  const identity = await uniqueStoreIdentity(data.name);

  const merchant = await prisma.$transaction(async (tx) => {
    const created = await tx.merchant.create({
      data: {
        name: data.name,
        slug: identity.slug,
        storeCode: identity.storeCode,
        email: session.email,
        category: data.category || null,
        description: data.description || null,
        supportEmail: data.supportEmail || session.email,
        phoneNumber: data.phoneNumber || null,
        address: data.address || null,
        stateRegion: data.stateRegion || null,
        country: "Nigeria",
        currency: "NGN",
        active: true,
        onboardedAt: new Date(),
      },
    });
    await tx.merchantMembership.create({
      data: {
        userId: session.userId,
        merchantId: created.id,
        role: "OWNER",
      },
    });
    return created;
  });

  await setActiveStore({
    userId: session.userId,
    email: session.email,
    merchantId: merchant.id,
  });
  revalidatePath("/dashboard");
  redirect("/dashboard/products");
}

export async function switchStoreAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const merchantId = String(formData.get("merchantId") ?? "");
  const membership = await prisma.merchantMembership.findUnique({
    where: {
      userId_merchantId: {
        userId: session.userId,
        merchantId,
      },
    },
    include: { merchant: { select: { active: true } } },
  });

  if (!membership || !membership.merchant.active) redirect("/dashboard/stores");

  await setActiveStore({
    userId: session.userId,
    email: session.email,
    merchantId,
  });
  redirect("/dashboard");
}

export async function toggleStoreAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const merchantId = String(formData.get("merchantId") ?? "");
  const membership = await prisma.merchantMembership.findUnique({
    where: {
      userId_merchantId: {
        userId: session.userId,
        merchantId,
      },
    },
    include: { merchant: true },
  });
  if (!membership || membership.role !== "OWNER") return;

  await prisma.merchant.update({
    where: { id: merchantId },
    data: { active: !membership.merchant.active },
  });
  revalidatePath("/dashboard/stores");
}
