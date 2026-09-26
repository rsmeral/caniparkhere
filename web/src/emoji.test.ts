import { describe, expect, it } from "vitest";
import { emojiUrl } from "./emoji";

describe("emojiUrl", () => {
  it("names the file by the emoji's code point in hex", () => {
    expect(emojiUrl("🧭")).toBe("/emoji/1f9ed.svg");
    expect(emojiUrl("⏳")).toBe("/emoji/23f3.svg");
  });

  it("leaves out the variation selector", () => {
    expect(emojiUrl("🛰️")).toBe("/emoji/1f6f0.svg");
  });

  it("joins the code points of a zero-width-joiner sequence, keeping its selectors", () => {
    expect(emojiUrl("🏳️‍🌈")).toBe("/emoji/1f3f3-fe0f-200d-1f308.svg");
  });
});
