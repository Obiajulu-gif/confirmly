import type { MetadataRoute } from "next";

const siteUrl = "https://www.confirmliy.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/start"],
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard/",
        "/login",
        "/signup",
        "/onboarding",
        "/pay/",
        "/receipt/",
        "/verify/receipt/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
