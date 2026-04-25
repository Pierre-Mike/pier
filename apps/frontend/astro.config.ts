import { defineConfig } from "astro/config";

export default defineConfig({
	output: "static",
	server: { port: 5274, host: "127.0.0.1" },
});
