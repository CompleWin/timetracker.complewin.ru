import { expect, test, type APIRequestContext } from "@playwright/test";

type ManifestIcon = {
  src: string;
  sizes?: string;
  purpose?: string;
};

type Manifest = {
  icons?: ManifestIcon[];
};

type LoadedManifest = {
  url: string;
  manifest: Manifest;
};

const MANIFEST_PATH = "/manifest.webmanifest";
const REQUIRED_ICON_SIZES = ["192x192", "512x512"];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JAVASCRIPT_CONTENT_TYPE = /^(text|application)\/javascript\b/;

async function loadManifest(request: APIRequestContext): Promise<LoadedManifest> {
  const response = await request.get(MANIFEST_PATH);
  expect(response.status(), `GET ${MANIFEST_PATH}`).toBe(200);
  return { url: response.url(), manifest: (await response.json()) as Manifest };
}

function iconsOfRequiredSizes(manifest: Manifest): ManifestIcon[] {
  return (manifest.icons ?? []).filter((icon) => REQUIRED_ICON_SIZES.includes(icon.sizes ?? ""));
}

function pngSize(bytes: Buffer): string | null {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

test(`4. GET ${MANIFEST_PATH} содержит name, short_name, start_url, display, background_color и theme_color`, async ({
  request,
}) => {
  const { manifest } = await loadManifest(request);

  expect(manifest).toMatchObject({
    name: "SimpleTimeTracker",
    short_name: "Трекер",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F2F2",
    theme_color: "#125B3A",
  });
});

test(`4. в ${MANIFEST_PATH} есть иконки 192x192 и 512x512, одна из них с purpose maskable`, async ({
  request,
}) => {
  const { manifest } = await loadManifest(request);
  const icons = iconsOfRequiredSizes(manifest);

  expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(REQUIRED_ICON_SIZES));
  expect(icons.map((icon) => icon.purpose)).toContain("maskable");
});

test(`4. иконки 192x192 и 512x512 из ${MANIFEST_PATH} отдаются как PNG своего размера`, async ({
  request,
}) => {
  const { url, manifest } = await loadManifest(request);

  for (const icon of iconsOfRequiredSizes(manifest)) {
    const response = await request.get(new URL(icon.src, url).href);
    expect(response.status(), `GET ${icon.src}`).toBe(200);
    expect(pngSize(await response.body()), icon.src).toBe(icon.sizes);
  }
});

test("5. GET /sw.js отвечает 200 с content-type JavaScript", async ({ request }) => {
  const response = await request.get("/sw.js");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(JAVASCRIPT_CONTENT_TYPE);
});
