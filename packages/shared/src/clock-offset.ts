export type ClockSample = {
  sentAtMs: number;
  receivedAtMs: number;
  serverNowMs: number;
};

export function estimateClockOffset({ sentAtMs, receivedAtMs, serverNowMs }: ClockSample): number {
  return Math.round(serverNowMs - (sentAtMs + receivedAtMs) / 2);
}
