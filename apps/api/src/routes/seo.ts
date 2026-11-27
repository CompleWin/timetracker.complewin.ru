import { t, type Locale, type MessageKey } from "@stt/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env.ts";
import { localeFromAcceptLanguage } from "../http/accept-language.ts";

type PublicPage = {
  title: MessageKey;
  description: MessageKey;
  locale?: Locale;
  landing?: boolean;
};

const landing = { title: "guest.title", description: "guest.subtitle", landing: true } as const;
const publicPages = new Map<string, PublicPage>([
  ["/", landing],
  ["/ru", { ...landing, locale: "ru" }],
  ["/en", { ...landing, locale: "en" }],
  ["/privacy", { title: "privacy.title", description: "privacy.intro" }],
  ["/terms", { title: "terms.title", description: "terms.intro" }],
]);
const appPaths = new Set(["/login", "/tasks", "/archive", "/settings"]);

export function isAppPage(path: string): boolean {
  return publicPages.has(path) || appPaths.has(path) || /^\/tasks\/[^/]+$/.test(path);
}

export function robots(c: Context<AppEnv>): Response {
  const body =
    c.env.ENV === "production"
      ? `User-agent: *\nDisallow: /auth/\n\nSitemap: ${appOrigin(c)}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n";
  return c.body(body, 200, { "Content-Type": "text/plain; charset=utf-8" });
}

export function sitemap(c: Context<AppEnv>): Response {
  const origin = appOrigin(c);
  const urls = Array.from(publicPages.keys(), (path) => `  <url><loc>${origin}${path}</loc></url>`);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
  return c.body(body, 200, { "Content-Type": "application/xml; charset=utf-8" });
}

export function renderAppPage(
  c: Context<AppEnv>,
  asset: Response,
  path: string,
  status: 200 | 404,
): Response {
  const page = publicPages.get(path);
  const locale = page?.locale ?? localeFromAcceptLanguage(c.req.header("Accept-Language"));
  const title = t(locale, page?.title ?? "app.name");
  const head = page === undefined ? [] : publicTags(page, path, appOrigin(c), locale, title);
  if (c.env.ENV !== "production" || page === undefined) {
    head.push('<meta name="robots" content="noindex">');
  }

  const headers = new Headers(asset.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.set("Cache-Control", "no-store");
  headers.append("Vary", "Accept-Language");

  return new HTMLRewriter()
    .on("html", {
      element(element) {
        element.setAttribute("lang", locale);
      },
    })
    .on("title", {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on("head", {
      element(element) {
        element.append(head.join("\n"), { html: true });
      },
    })
    .transform(new Response(asset.body, { status, headers }));
}

function publicTags(
  page: PublicPage,
  path: string,
  origin: string,
  locale: Locale,
  title: string,
): string[] {
  const url = attribute(origin + path);
  const description = attribute(t(locale, page.description));
  const head = [
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${attribute(t(locale, "app.name"))}">`,
    `<meta property="og:title" content="${attribute(title)}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${locale === "ru" ? "ru_RU" : "en_US"}">`,
  ];
  if (page.landing) {
    head.push(
      `<meta property="og:image" content="${attribute(`${origin}/og-image/og-${locale}.png`)}">`,
      `<link rel="alternate" hreflang="ru" href="${attribute(origin + "/ru")}">`,
      `<link rel="alternate" hreflang="en" href="${attribute(origin + "/en")}">`,
      `<link rel="alternate" hreflang="x-default" href="${attribute(origin + "/")}">`,
    );
  }
  return head;
}

function appOrigin(c: Context<AppEnv>): string {
  return new URL(c.env.APP_URL).origin;
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
