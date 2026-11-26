import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { expectApiError } from "./harness/assertions.ts";
import { api, type TestResponse } from "./harness/index.ts";
import { redirectTarget } from "./harness/redirect.ts";

const ORIGIN = "https://stt.test";
const APP_NAME = "SimpleTimeTracker";
const PUBLIC_PATHS = ["/", "/ru", "/en", "/privacy", "/terms"];
const PRIVATE_PATHS = ["/login", "/tasks", "/tasks/123", "/archive", "/settings"];
const BODY = /<body(?:\s[^>]*)?>[\s\S]*?<\/body>/i;

const landing = {
  ru: {
    title: "SimpleTimeTracker: бесплатный трекер времени",
    description:
      "Запускай таймеры по задачам и проектам, хоть несколько сразу. С телефона и компьютера, вход через Telegram. Бесплатная интеграция с Notion",
  },
  en: {
    title: "SimpleTimeTracker: free time tracker",
    description:
      "Start timers for tasks and projects, even several at once. From your phone or computer, sign in with Telegram. Free Notion integration",
  },
};

const privacy = {
  ru: {
    title: "Политика конфиденциальности",
    description:
      "SimpleTimeTracker: бесплатный трекер времени. Здесь описано, какие данные он хранит, где они лежат и как их удалить.",
  },
  en: {
    title: "Privacy Policy",
    description:
      "SimpleTimeTracker is a free time tracker. This page describes what data it stores, where it is kept and how to delete it.",
  },
};

const englishTerms = {
  title: "Terms of Use",
  description: "By using SimpleTimeTracker, you agree to these terms.",
};

type Head = {
  lang: string | null;
  title: string;
  meta: Record<string, string | null>;
  openGraph: Record<string, string | null>;
  canonical: string | null;
  alternates: { lang: string | null; href: string | null }[];
};

async function getInProduction(path: string): Promise<TestResponse> {
  const bindings = env as { ENV: string };
  const previous = bindings.ENV;
  bindings.ENV = "production";
  try {
    return await api.get(path);
  } finally {
    bindings.ENV = previous;
  }
}

function readText(response: TestResponse, status: number, contentType: RegExp): string {
  expect(response).toMatchObject({ status, body: expect.any(String) });
  expect(response.headers.get("Content-Type")).toMatch(contentType);
  return response.body as string;
}

async function readHead(html: string): Promise<Head> {
  const head: Head = {
    lang: null,
    title: "",
    meta: {},
    openGraph: {},
    canonical: null,
    alternates: [],
  };
  await new HTMLRewriter()
    .on("html", {
      element(element) {
        head.lang = element.getAttribute("lang");
      },
    })
    .on("head title", {
      text(chunk) {
        head.title += chunk.text;
      },
    })
    .on("head meta", {
      element(element) {
        const name = element.getAttribute("name");
        const property = element.getAttribute("property");
        const content = element.getAttribute("content");
        if (name !== null) head.meta[name] = content;
        if (property?.startsWith("og:")) head.openGraph[property] = content;
      },
    })
    .on("head link", {
      element(element) {
        const rel = element.getAttribute("rel");
        const href = element.getAttribute("href");
        const lang = element.getAttribute("hreflang");
        if (rel === "canonical") head.canonical = href;
        if (rel === "alternate" && lang !== null) head.alternates.push({ lang, href });
      },
    })
    .transform(new Response(html))
    .text();
  return head;
}

async function readPage(response: TestResponse, status = 200) {
  const html = readText(response, status, /^text\/html\b/i);
  return { html, head: await readHead(html) };
}

function getPage(path: string, acceptLanguage?: string): Promise<TestResponse> {
  const headers = acceptLanguage === undefined ? undefined : { "Accept-Language": acceptLanguage };
  return api.get(path, { headers });
}

function expectPublicHead(
  head: Head,
  path: string,
  locale: "ru" | "en",
  { title, description }: { title: string; description: string },
) {
  const canonical = `${ORIGIN}${path}`;
  expect(head).toMatchObject({
    lang: locale,
    title,
    meta: { description },
    canonical,
    openGraph: {
      "og:type": "website",
      "og:site_name": APP_NAME,
      "og:title": title,
      "og:description": description,
      "og:url": canonical,
      "og:locale": locale === "ru" ? "ru_RU" : "en_US",
    },
  });
}

function expectLandingAlternates(head: Head) {
  expect(head.alternates).toHaveLength(3);
  expect(head.alternates).toEqual(
    expect.arrayContaining([
      { lang: "ru", href: `${ORIGIN}/ru` },
      { lang: "en", href: `${ORIGIN}/en` },
      { lang: "x-default", href: `${ORIGIN}/` },
    ]),
  );
}

describe("файлы для поисковиков", () => {
  it("1. в production robots.txt закрывает /auth/ и указывает на sitemap.xml", async () => {
    const response = await getInProduction("/robots.txt");
    const body = readText(response, 200, /^text\/plain;\s*charset=utf-8$/i);

    expect(body.trimEnd().split(/\r?\n/)).toEqual([
      "User-agent: *",
      "Disallow: /auth/",
      "",
      `Sitemap: ${ORIGIN}/sitemap.xml`,
    ]);
  });

  it("2. в test robots.txt закрывает весь сайт", async () => {
    const response = await api.get("/robots.txt");
    const body = readText(response, 200, /^text\/plain;\s*charset=utf-8$/i);

    expect(body.trimEnd().split(/\r?\n/)).toEqual(["User-agent: *", "Disallow: /"]);
  });

  it("3. sitemap.xml перечисляет пять публичных адресов в заданном порядке", async () => {
    const response = await api.get("/sitemap.xml");
    const body = readText(response, 200, /^application\/xml;\s*charset=utf-8$/i);
    const urlset = body.match(
      /^\s*(?:<\?xml\s[^?]*\?>\s*)?<urlset\s+xmlns\s*=\s*(["'])http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9\1\s*>([\s\S]*?)<\/urlset>\s*$/,
    );

    expect(urlset?.[2]?.trim().replaceAll(/>\s+</g, "><")).toBe(
      PUBLIC_PATHS.map((path) => `<url><loc>${ORIGIN}${path}</loc></url>`).join(""),
    );
  });
});

describe("страница SPA", () => {
  it("4. /ru отдаёт русские метаданные при английском Accept-Language", async () => {
    const { head } = await readPage(await getPage("/ru", "en-US"));

    expectPublicHead(head, "/ru", "ru", landing.ru);
    expectLandingAlternates(head);
  });

  it("5. /en отдаёт английские метаданные при русском Accept-Language", async () => {
    const { head } = await readPage(await getPage("/en", "ru-RU"));

    expectPublicHead(head, "/en", "en", landing.en);
    expectLandingAlternates(head);
  });

  it.each([
    { header: "ru-RU,ru;q=0.9", locale: "ru" },
    { header: "en-US", locale: "en" },
    { header: undefined, locale: "en" },
  ] as const)("6. / выбирает $locale при Accept-Language $header", async ({ header, locale }) => {
    const { head } = await readPage(await getPage("/", header));

    expectPublicHead(head, "/", locale, landing[locale]);
    expectLandingAlternates(head);
  });

  it("7. /privacy и /terms отдают метаданные документов без hreflang", async () => {
    const russian = await readPage(await getPage("/privacy", "ru-RU"));
    const english = await readPage(await getPage("/terms", "en-US"));

    expectPublicHead(russian.head, "/privacy", "ru", privacy.ru);
    expect(russian.head.alternates).toEqual([]);
    expectPublicHead(english.head, "/terms", "en", englishTerms);
    expect(english.head.alternates).toEqual([]);
  });

  it.each(PRIVATE_PATHS)("8. GET %s отвечает 200 без метаданных для поисковиков", async (path) => {
    const { head } = await readPage(await api.get(path));

    expect(head).toMatchObject({ title: APP_NAME, canonical: null });
    expect(head.meta).not.toHaveProperty("description");
    expect(head.openGraph).toEqual({});
    expect(head.alternates).toEqual([]);
  });

  it("9. неизвестный адрес отдаёт 404, а body совпадает с / и /tasks/123", async () => {
    const root = await readPage(await api.get("/"));
    const task = await readPage(await api.get("/tasks/123"));
    const missing = await readPage(await api.get("/some/client/route"), 404);

    expect(root.html).toMatch(BODY);
    expect(task.html.match(BODY)?.[0]).toBe(root.html.match(BODY)?.[0]);
    expect(missing.html.match(BODY)?.[0]).toBe(root.html.match(BODY)?.[0]);
    expect(task.head).not.toEqual(root.head);
  });

  it.each([...PUBLIC_PATHS, ...PRIVATE_PATHS])("10. в test на %s есть noindex", async (path) => {
    const { head } = await readPage(await api.get(path));

    expect(head.meta.robots).toBe("noindex");
  });

  it("10. GET /index.html отвечает 307 с переходом на /", async () => {
    const response = await api.get("/index.html");

    expect({ status: response.status, target: redirectTarget(response) }).toMatchObject({
      status: 307,
      target: "/",
    });
  });

  it.each(PRIVATE_PATHS)("11. в production на %s есть noindex", async (path) => {
    const { head } = await readPage(await getInProduction(path));

    expect(head.meta.robots).toBe("noindex");
  });

  it.each(PUBLIC_PATHS)("11. в production на %s нет meta robots", async (path) => {
    const { head } = await readPage(await getInProduction(path));

    expect(head.meta).not.toHaveProperty("robots");
  });

  it("18. /privacy с параметрами меняет язык между запросами и сохраняет canonical без query", async () => {
    const first = await readPage(await getPage("/privacy?from=footer", "en-US"));
    const second = await readPage(await getPage("/privacy?from=footer", "ru-RU"));

    expectPublicHead(first.head, "/privacy", "en", privacy.en);
    expectPublicHead(second.head, "/privacy", "ru", privacy.ru);
  });

  it("19. в production /tasks/123/extra отдаёт HTML с 404 и noindex", async () => {
    const root = await readPage(await getInProduction("/"));
    const { html, head } = await readPage(await getInProduction("/tasks/123/extra"), 404);

    expect(root.html).toMatch(BODY);
    expect(html.match(BODY)?.[0]).toBe(root.html.match(BODY)?.[0]);
    expect(head.meta.robots).toBe("noindex");
  });

  it("19. в production /auth/unknown отдаёт ошибку 404 в JSON", async () => {
    const response = await getInProduction("/auth/unknown");

    expect(response.headers.get("Content-Type")).toMatch(/^application\/json\b/i);
    expectApiError(response, "not_found");
  });

  it.each([
    { path: "/ru", header: "en-US", image: "og-ru.png" },
    { path: "/en", header: "ru-RU", image: "og-en.png" },
    { path: "/", header: "ru-RU", image: "og-ru.png" },
    { path: "/", header: "en-US", image: "og-en.png" },
    { path: "/", header: undefined, image: "og-en.png" },
  ])("23. $path с Accept-Language $header указывает на $image", async ({ path, header, image }) => {
    const { head } = await readPage(await getPage(path, header));

    expect(head.openGraph).toMatchObject({ "og:image": `${ORIGIN}/og-image/${image}` });
  });

  it.each(["/privacy", "/terms"])("23. на %s нет og:image", async (path) => {
    const { head } = await readPage(await getPage(path));

    expect(head.openGraph).not.toHaveProperty("og:image");
  });
});
