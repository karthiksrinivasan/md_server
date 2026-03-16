import { describe, it, expect } from "vitest";
import path from "path";
import { scanDirectory } from "../tree";
import type { TreeNode } from "../tree";
import { resolveFilters } from "../config";

const FIXTURES_DIR = path.resolve(__dirname, "../../../tests/fixtures/docs");

describe("scanDirectory()", () => {
  const defaultFilters = resolveFilters({});

  it("should return .md files from root directory", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    const fileNames = tree.filter((n) => n.type === "file").map((n) => n.name);
    expect(fileNames).toContain("README.md");
    expect(fileNames).toContain("guide.md");
  });

  it("should include nested directories with .md files", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    const specsDir = tree.find((n) => n.name === "specs" && n.type === "directory");
    expect(specsDir).toBeDefined();
    expect(specsDir!.children!.length).toBeGreaterThan(0);
  });

  it("should exclude non-.md files", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    const allFiles = flattenFiles(tree);
    const nonMd = allFiles.filter((f) => !f.name.endsWith(".md"));
    expect(nonMd).toHaveLength(0);
  });

  it("should exclude directories with no .md descendants", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    expect(tree.find((n) => n.name === "images")).toBeUndefined();
  });

  it("should exclude hidden directories by default", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    expect(tree.find((n) => n.name === ".hidden")).toBeUndefined();
  });

  it("should exclude node_modules by default", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    expect(tree.find((n) => n.name === "node_modules")).toBeUndefined();
  });

  it("should sort directories first, then alphabetically", async () => {
    const tree = await scanDirectory(FIXTURES_DIR, defaultFilters);
    const dirs = tree.filter((n) => n.type === "directory");
    const files = tree.filter((n) => n.type === "file");
    if (dirs.length > 0 && files.length > 0) {
      const lastDirIdx = tree.lastIndexOf(dirs[dirs.length - 1]);
      const firstFileIdx = tree.indexOf(files[0]);
      expect(lastDirIdx).toBeLessThan(firstFileIdx);
    }
  });

  it("should apply include glob filter", async () => {
    const filters = resolveFilters({ include: ["specs/**/*.md"] });
    const tree = await scanDirectory(FIXTURES_DIR, filters);
    const allFiles = flattenFiles(tree);
    expect(allFiles.length).toBeGreaterThan(0);
    allFiles.forEach((f) => expect(f.path).toMatch(/^specs\//));
  });

  it("should apply regex filter on relative path", async () => {
    const filters = resolveFilters({ filter: "draft" });
    const tree = await scanDirectory(FIXTURES_DIR, filters);
    const allFiles = flattenFiles(tree);
    expect(allFiles.length).toBeGreaterThan(0);
    allFiles.forEach((f) => expect(f.path).toMatch(/draft/));
  });
});

function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  const files: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") files.push(node);
    else if (node.children) files.push(...flattenFiles(node.children));
  }
  return files;
}
