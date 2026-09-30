import type { Metadata } from "next";
import { LandingNav } from "@/components/landing-nav";
import { LandingFooter } from "@/components/landing-footer";
import { StoreDirectory } from "@/components/store-directory";
import { getPublicStoresSafe } from "@/lib/stores";
import { ScrollMotion } from "@/components/scroll-motion";

export const metadata: Metadata = {
  title: "Stores",
  description:
    "Browse every business selling on Confirmly — search by name or niche and order from any store straight inside WhatsApp.",
};

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [stores, params] = await Promise.all([getPublicStoresSafe(), searchParams]);

  return (
    <div className="flex min-h-screen flex-col bg-[#fcfcfc] text-[#111827]">
      <LandingNav />
      <ScrollMotion />
      <main className="flex-1">
        <StoreDirectory
          stores={stores}
          initial={{
            q: first(params.q),
            category: first(params.category),
            location: first(params.location),
            sort: first(params.sort),
          }}
        />
      </main>
      <LandingFooter />
    </div>
  );
}
