import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { requireBranchAccess, BusinessAccessError } from "@/lib/authz/business-access";
import { saveStoreLogo, removeStoreLogo, StoreLogoError } from "@/lib/store-logo";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Resolves and authorizes the target store. When a `merchantId` (branch) is
 * given, the caller must have access to that branch; otherwise the signed-in
 * merchant's own store is used.
 */
async function resolveTarget(
  merchantId: string | null
): Promise<{ merchantId: string } | { status: number; error: string }> {
  if (merchantId) {
    try {
      await requireBranchAccess(merchantId);
      return { merchantId };
    } catch (err) {
      const status = err instanceof BusinessAccessError ? err.status : 401;
      return { status, error: "No access to this store." };
    }
  }
  const session = await getMerchantSession();
  if (!session) return { status: 401, error: "unauthorized" };
  return { merchantId: session.merchantId };
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const target = await resolveTarget(
    typeof form?.get("merchantId") === "string" ? (form!.get("merchantId") as string) : null
  );
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const { logoUrl } = await saveStoreLogo({ merchantId: target.merchantId, bytes });
    return NextResponse.json({ ok: true, logoUrl });
  } catch (err) {
    if (err instanceof StoreLogoError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const target = await resolveTarget(request.nextUrl.searchParams.get("merchantId"));
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }
  await removeStoreLogo(target.merchantId);
  return NextResponse.json({ ok: true });
}
