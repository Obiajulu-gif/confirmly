import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { saveStoreLogo, removeStoreLogo, StoreLogoError } from "@/lib/store-logo";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Uploads (POST multipart) or removes (DELETE) the signed-in merchant's store logo. */
export async function POST(request: NextRequest) {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const { logoUrl } = await saveStoreLogo({ merchantId: session.merchantId, bytes });
    return NextResponse.json({ ok: true, logoUrl });
  } catch (err) {
    if (err instanceof StoreLogoError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await removeStoreLogo(session.merchantId);
  return NextResponse.json({ ok: true });
}
