import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, resolveFilters } from "../config";
import type { FilterConfig, ServerConfig } from "../config";

describe("FilterConfig type", () => {
  it("should accept valid filter config with all fields", () => {
    const filter: FilterConfig = {
      include: ["docs/**/*.md"],
      exclude: ["drafts/**"],
      filter: /meeting/i,
    };
    expect(filter.include).toEqual(["docs/**/*.md"]);
    expect(filter.exclude).toEqual(["drafts/**"]);
    expect(filter.filter).toBeInstanceOf(RegExp);
  });

  it("should accept null filter regex", () => {
    const filter: FilterConfig = {
      include: [],
      exclude: [],
      filter: null,
    };
    expect(filter.filter).toBeNull();
  });
});

describe("getConfig()", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return defaults when no env vars are set", () => {
    delete process.env.MD_SERVE_ROOT;
    delete process.env.MD_SERVE_PORT;
    delete process.env.MD_SERVE_FILTERS;
    delete process.env.MD_SERVE_HOST;
    delete process.env.MD_SERVE_WATCH;
    delete process.env.MD_SERVE_OPEN;

    const config = getConfig();
    expect(config.port).toBe(3030);
    expect(config.host).toBe("localhost");
    expect(config.watch).toBe(true);
    expect(config.open).toBe(false);
    expect(config.rootDir).toBe(process.cwd());
  });

  it("should read port from MD_SERVE_PORT", () => {
    process.env.MD_SERVE_PORT = "8080";
    const config = getConfig();
    expect(config.port).toBe(8080);
  });

  it("should read rootDir from MD_SERVE_ROOT", () => {
    process.env.MD_SERVE_ROOT = "/tmp/my-docs";
    const config = getConfig();
    expect(config.rootDir).toBe("/tmp/my-docs");
  });

  it("should parse MD_SERVE_FILTERS JSON", () => {
    process.env.MD_SERVE_FILTERS = JSON.stringify({
      include: ["docs/**/*.md"],
      exclude: ["drafts/**"],
      filter: "meeting",
    });
    const config = getConfig();
    expect(config.filters.include).toEqual(["docs/**/*.md"]);
    expect(config.filters.exclude).toContain("drafts/**");
    expect(config.filters.filter).toBeInstanceOf(RegExp);
  });
});

describe("resolveFilters()", () => {
  it("should apply default excludes when none provided", () => {
    const filters = resolveFilters({});
    expect(filters.exclude).toContain("node_modules/**");
    expect(filters.exclude).toContain(".git/**");
    expect(filters.exclude).toContain(".*/**");
  });

  it("should merge user excludes with defaults", () => {
    const filters = resolveFilters({ exclude: ["drafts/**"] });
    expect(filters.exclude).toContain("drafts/**");
    expect(filters.exclude).toContain("node_modules/**");
  });

  it("should parse /pattern/flags string as regex with flags", () => {
    const filters = resolveFilters({ filter: "/API/i" });
    expect(filters.filter).toBeInstanceOf(RegExp);
    expect(filters.filter!.test("api-docs.md")).toBe(true);
    expect(filters.filter!.flags).toBe("i");
  });

  it("should set filter to null when not provided", () => {
    const filters = resolveFilters({});
    expect(filters.filter).toBeNull();
  });
});
