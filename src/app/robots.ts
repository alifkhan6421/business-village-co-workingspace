import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/href";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/de/admin", "/en/admin", "/de/konto", "/en/account", "/de/buchung/verwalten", "/en/booking/manage", "/api/", "/auth/"],
      },
    ],
    sitemap: appUrl("/sitemap.xml"),
  };
}
