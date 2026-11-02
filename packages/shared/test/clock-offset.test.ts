import { describe, expect, it } from "vitest";
import { estimateClockOffset } from "@stt/shared";

describe("estimateClockOffset", () => {
  it("1. отправлен в 1000, получен в 1200, сервер прислал 5100: поправка 4000", () => {
    expect(estimateClockOffset({ sentAtMs: 1000, receivedAtMs: 1200, serverNowMs: 5100 })).toBe(
      4000,
    );
  });

  it("2. отправлен в 1000, получен в 1001, сервер прислал 2000: 999,5 округляется вверх до 1000", () => {
    expect(estimateClockOffset({ sentAtMs: 1000, receivedAtMs: 1001, serverNowMs: 2000 })).toBe(
      1000,
    );
  });

  it("3. сервер отстаёт: отправлен в 1000, получен в 1200, сервер прислал 100, поправка -1000", () => {
    expect(estimateClockOffset({ sentAtMs: 1000, receivedAtMs: 1200, serverNowMs: 100 })).toBe(
      -1000,
    );
  });
});
