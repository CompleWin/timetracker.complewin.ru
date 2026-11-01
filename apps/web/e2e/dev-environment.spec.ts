import { expect, test } from "@playwright/test";

test('2. в dev GET /api/health отвечает 200 { status: "ok", env: "dev" }', async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", env: "dev" });
});

test("7. в dev POST /__test/cron отвечает 404", async ({ request }) => {
  const response = await request.post("/__test/cron");

  expect(response.status()).toBe(404);
});
