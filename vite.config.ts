import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendor libraries change rarely; separate chunks stay cached across app releases.
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|cookie|set-cookie-parser)[\\/]/,
            },
            {
              name: "viem",
              test: /node_modules[\\/](viem|ox|abitype|@noble|@scure|@adraffy)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
