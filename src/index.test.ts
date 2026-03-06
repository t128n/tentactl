import { describe, expect, it } from "vitest";
import { defineConfig } from "./index";

describe("src/index", () => {
    it("re-exports defineConfig", () => {
        const config = { org: "acme", repo: "platform" };

        expect(defineConfig(config)).toBe(config);
    });
});
