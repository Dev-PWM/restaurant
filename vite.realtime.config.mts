import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
const repo = import.meta.dirname;
const ports: Record<string, number> = {
  "client-web": 5173,
  "business-pos": 5174,
  analytics: 5175,
};
export default defineConfig(({ mode, command }) => {
  if (!(mode in ports)) throw new Error("Choose a MasaFlow workspace mode.");
  const root = path.join(repo, "apps", mode);
  const publicEnv = loadEnv(mode, repo, "VITE_");
  const bankFields = [
    "VITE_BANK_NAME",
    "VITE_BANK_CLABE",
    "VITE_BANK_BENEFICIARY",
  ];
  if (
    bankFields.some((key) => publicEnv[key]) &&
    !bankFields.every((key) => publicEnv[key]?.trim())
  )
    throw new Error(
      "Configura juntos VITE_BANK_NAME, VITE_BANK_CLABE y VITE_BANK_BENEFICIARY para no mezclar cuentas bancarias.",
    );
  const clabe = publicEnv.VITE_BANK_CLABE?.trim();
  if (clabe && !/^\d{18}$/.test(clabe))
    throw new Error("VITE_BANK_CLABE debe contener exactamente 18 dígitos.");
  const dataDirectory =
    process.env.MASAFLOW_DATA_DIR ||
    loadEnv(mode, repo, "MASAFLOW_").MASAFLOW_DATA_DIR;
  return {
    root,
    envDir: repo,
    define: clabe
      ? { "import.meta.env.VITE_BANK_CLABE": JSON.stringify(clabe) }
      : {},
    publicDir: path.join(repo, "shared/pwa"),
    plugins: [tailwindcss()],
    base:
      command === "build"
        ? `/${mode === "client-web" ? "order" : mode === "business-pos" ? "pos" : "analytics"}/`
        : "/",
    resolve: { dedupe: ["react", "react-dom", "socket.io-client"] },
    server: {
      host: "0.0.0.0",
      port: ports[mode],
      strictPort: true,
      fs: {
        strict: true,
        allow: [
          root,
          path.join(repo, "shared/ui"),
          path.join(repo, "shared/types"),
          path.join(repo, "node_modules"),
        ],
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem,key,p12,pfx,cer,der}",
          ".npmrc",
          ".yarnrc.yml",
          "**/.git/**",
          "**/.masaflow*/**",
          "**/data.json",
          "**/state.json",
          "**/archive_*.json",
          ...(dataDirectory
            ? [`${path.resolve(repo, dataDirectory).replaceAll("\\", "/")}/**`]
            : []),
        ],
      },
      proxy: {
        "/socket.io": {
          target: `http://127.0.0.1:${process.env.PORT && process.env.PORT !== "8080" ? process.env.PORT : 3000}`,
          ws: true,
          xfwd: true,
        },
        "/api": `http://127.0.0.1:${process.env.PORT && process.env.PORT !== "8080" ? process.env.PORT : 3000}`,
      },
    },
    build: {
      outDir: process.env.MASAFLOW_OUTPUT_ROOT
        ? path.join(process.env.MASAFLOW_OUTPUT_ROOT, mode === "client-web" ? "order" : mode === "business-pos" ? "pos" : "analytics")
        : "dist-realtime",
      emptyOutDir: true,
      rollupOptions: { input: path.join(root, "realtime.html") },
    },
  };
});
