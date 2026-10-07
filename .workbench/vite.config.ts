import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front end only issues GET requests for data/, files/ and thumbs/.
// `vault.py serve` answers them live; `vault.py export` writes them to disk.
// During `npm run dev`, forward them to a running `vault.py serve --no-open`.
const backend = "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: { "/data": backend, "/files": backend, "/thumbs": backend }
  }
});
