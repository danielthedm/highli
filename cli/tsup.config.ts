import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  platform: "node",
  shims: true,
  clean: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __highliCreateRequire } from 'module';",
      "const require = __highliCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  // Native bindings + libraries that don't bundle cleanly stay external.
  external: ["react", "ink", "yoga-wasm-web", "better-sqlite3"],
  // Workspace packages get bundled into the CLI binary.
  noExternal: ["@highli/core", "@highli/sources"],
});
