import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://aimarketinglabs.co.uk";
  return [
    { url: base,               lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/blog`,     lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/blog/generative-engine-optimisation-enterprise-guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/technical-seo-core-web-vitals-2026`,              lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/hatfield-uk-business-digital-strategy-2026`,      lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/dataforseo-api-integration-seo-platforms`,        lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/topical-authority-content-clusters-guide`,        lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/competitor-backlink-gap-analysis-methodology`,    lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/ai-overview-optimisation-schema-markup`,          lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog/rvivme-platform-case-study-organic-growth`,       lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}