import type { MetadataRoute } from "next";

const siteUrl = "https://confirmliy.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/start`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
