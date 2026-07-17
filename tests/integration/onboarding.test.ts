import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  buildWaLink,
  normalizeWhatsAppNumber,
  saveCustomerProfile,
} from "@/lib/orders/onboarding";

const testPhone = `0803${String(Date.now()).slice(-7)}`;
const expectedWaId = `234803${String(Date.now()).slice(-7)}`;

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { waId: expectedWaId } });
  await prisma.waSession.deleteMany({ where: { waId: expectedWaId } });
});

describe("normalizeWhatsAppNumber", () => {
  it("converts Nigerian local formats to 234…", () => {
    expect(normalizeWhatsAppNumber("0803 123 4567")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("+234 803 123 4567")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("803-123-4567")).toBe("2348031234567");
  });

  it("keeps international numbers as digits", () => {
    expect(normalizeWhatsAppNumber("+1 (555) 183-4600")).toBe("15551834600");
  });

  it("rejects garbage", () => {
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(normalizeWhatsAppNumber("not a number")).toBeNull();
    expect(normalizeWhatsAppNumber("1".repeat(20))).toBeNull();
  });
});

describe("saveCustomerProfile", () => {
  it("creates the customer with a zone-validated default address", async () => {
    const result = await saveCustomerProfile({
      name: "Onboarding Tester",
      phone: testPhone,
      area: "Yaba",
      address: "5 Test Close",
    });
    expect(result.waId).toBe(expectedWaId);
    expect(result.knownZone).toBe("Yaba");
    expect(result.waLink).toMatch(/^https:\/\/wa\.me\/\d{7,15}\?text=/);

    const customer = await prisma.customer.findFirstOrThrow({
      where: { waId: expectedWaId },
    });
    expect(customer.name).toBe("Onboarding Tester");
    expect(customer.defaultAddress).toContain("5 Test Close");
    expect(customer.defaultAddress).toContain("Yaba");
  });

  it("updates (not duplicates) the same number on repeat onboarding", async () => {
    await saveCustomerProfile({
      name: "Renamed Tester",
      phone: `+${expectedWaId}`,
    });
    const rows = await prisma.customer.findMany({
      where: { waId: expectedWaId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Renamed Tester");
    // Address survives when the update omits it.
    expect(rows[0]?.defaultAddress).toContain("Yaba");
  });

  it("ignores areas the shop doesn't deliver to (DB decides)", async () => {
    const result = await saveCustomerProfile({
      name: "Renamed Tester",
      phone: expectedWaId,
      area: "Atlantis",
    });
    expect(result.knownZone).toBeNull();
  });

  it("rejects invalid numbers", async () => {
    await expect(
      saveCustomerProfile({ name: "X Y", phone: "123" })
    ).rejects.toThrow(/valid WhatsApp number/);
  });
});

describe("buildWaLink", () => {
  it("prefills the deterministic store-selection command", () => {
    const link = buildWaLink("ADASTYLES");
    if (link === null) {
      // No public number configured in this environment — acceptable.
      expect(link).toBeNull();
      return;
    }
    expect(link).toMatch(/^https:\/\/wa\.me\/\d{7,15}\?text=/);
    expect(decodeURIComponent(link)).toContain("START ADASTYLES");
  });
});
