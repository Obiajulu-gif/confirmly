import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { getDashboardScope, scopedBranchIds } from "@/lib/business/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Masks a phone number for export (country + last 3 digits). */
function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Scoped orders export (CSV). A Merchant exports all branches (or the selected
 * one); a Branch Agent exports only their assigned branch. Revenue reflects the
 * order total; customer numbers are masked.
 */
export async function GET() {
  const scope = await getDashboardScope();
  if (!scope) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const branchIds = scopedBranchIds(scope);
  const orders = await prisma.order.findMany({
    where: { merchantId: { in: branchIds } },
    include: {
      merchant: { select: { name: true } },
      customer: { select: { name: true, phoneNumber: true } },
      payment: { select: { state: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = [
    "Reference",
    "Branch",
    "Customer",
    "Customer number",
    "Amount",
    "Order state",
    "Payment state",
    "Created",
  ];
  const rows = orders.map((o) =>
    [
      o.reference,
      o.merchant.name,
      o.customer.name ?? "",
      maskNumber(o.customer.phoneNumber),
      formatNaira(o.totalKobo),
      o.state,
      o.payment?.state ?? "",
      o.createdAt.toISOString(),
    ]
      .map((c) => csvCell(String(c)))
      .join(",")
  );
  const csv = [header.map(csvCell).join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="confirmly-orders-${Date.now()}.csv"`,
    },
  });
}
