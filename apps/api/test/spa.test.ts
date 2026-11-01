import { describe, expect, it } from "vitest";
import { api } from "./harness/index.ts";

describe("страница SPA", () => {
  it.each(["/", "/some/client/route", "/tasks/123"])(
    "8. GET %s отвечает 200 с content-type text/html",
    async (path) => {
      const response = await api.get(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toMatch(/^text\/html/);
    },
  );

  it("8. клиентский маршрут отдаёт ту же страницу, что и /", async () => {
    const root = await api.get("/");
    const clientRoute = await api.get("/some/client/route");

    expect(clientRoute.body).toBe(root.body);
  });
});
