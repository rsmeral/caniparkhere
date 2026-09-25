import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResult } from "./query";
import { createQueryClient } from "./queryClient";
import type { QueryRequest, QueryResponse } from "./queryProtocol";

type Listener = (event: unknown) => void;

class FakeWorker {
  static latest: FakeWorker;
  sent: QueryRequest[] = [];
  terminated = false;
  private listeners = new Map<string, Listener[]>();

  constructor() {
    FakeWorker.latest = this;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(request: QueryRequest) {
    this.sent.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  reply(response: QueryResponse) {
    for (const listener of this.listeners.get("message") ?? []) listener({ data: response });
  }

  fail(message: string) {
    for (const listener of this.listeners.get("error") ?? []) listener({ message });
  }
}

const resultFor = (streetName: string): QueryResult => ({
  status: { kind: "clear", streetName },
  upcomingClosure: null,
});

describe("createQueryClient", () => {
  beforeEach(() => {
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pairs each answer with its own request, whatever order they arrive in", async () => {
    const client = createQueryClient();
    const first = client.query(14.42, 50.08, 20);
    const second = client.query(14.5, 50.1, 30);

    const [a, b] = FakeWorker.latest.sent;
    expect(a).toMatchObject({ lon: 14.42, lat: 50.08, accuracyMeters: 20 });
    expect(b).toMatchObject({ lon: 14.5, lat: 50.1, accuracyMeters: 30 });

    FakeWorker.latest.reply({ id: b.id, ok: true, result: resultFor("second") });
    FakeWorker.latest.reply({ id: a.id, ok: true, result: resultFor("first") });

    await expect(first).resolves.toEqual(resultFor("first"));
    await expect(second).resolves.toEqual(resultFor("second"));
  });

  it("sends the moment to answer for, or null for the time of answering", () => {
    const client = createQueryClient();
    client.query(14.42, 50.08, 20, { at: new Date("2026-09-25T10:00:00Z") });
    client.query(14.42, 50.08, 20);

    const [at, now] = FakeWorker.latest.sent;
    expect(at.at).toBe(Date.parse("2026-09-25T10:00:00Z"));
    expect(now.at).toBeNull();
  });

  it("leaves street cleaning to the data unless asked to clean everywhere today", () => {
    const client = createQueryClient();
    client.query(14.42, 50.08, 20);
    client.query(14.42, 50.08, 20, { cleaningEverywhereToday: true });

    const [real, simulated] = FakeWorker.latest.sent;
    expect(real.cleaningEverywhereToday).toBe(false);
    expect(simulated.cleaningEverywhereToday).toBe(true);
  });

  it("rejects only the request an error response names", async () => {
    const client = createQueryClient();
    const failing = client.query(14.42, 50.08, 20);
    const fine = client.query(14.5, 50.1, 30);
    const [a, b] = FakeWorker.latest.sent;

    FakeWorker.latest.reply({ id: a.id, ok: false, message: "Failed to fetch zps.json: 404" });
    FakeWorker.latest.reply({ id: b.id, ok: true, result: resultFor("fine") });

    await expect(failing).rejects.toThrow("Failed to fetch zps.json: 404");
    await expect(fine).resolves.toEqual(resultFor("fine"));
  });

  it("rejects everything outstanding when the worker itself fails", async () => {
    const client = createQueryClient();
    const pending = client.query(14.42, 50.08, 20);

    FakeWorker.latest.fail("boom");

    await expect(pending).rejects.toThrow("boom");
  });

  it("rejects everything outstanding on terminate, rather than hanging", async () => {
    const client = createQueryClient();
    const pending = client.query(14.42, 50.08, 20);

    client.terminate();

    expect(FakeWorker.latest.terminated).toBe(true);
    await expect(pending).rejects.toThrow("shut down");
  });

  it("ignores an answer to a request it has already settled", async () => {
    const client = createQueryClient();
    const pending = client.query(14.42, 50.08, 20);
    const [a] = FakeWorker.latest.sent;

    FakeWorker.latest.reply({ id: a.id, ok: true, result: resultFor("first") });
    FakeWorker.latest.reply({ id: a.id, ok: false, message: "late failure" });

    await expect(pending).resolves.toEqual(resultFor("first"));
  });
});
