# Third-party notices

Mothbot Classify's own source code is released under the MIT License (see `LICENSE`).
The built app includes the open-source packages below, each under its own license. Their
full license texts are in `node_modules/<package>/LICENSE` after `bun install`.

All runtime dependencies use permissive licenses; none of them is copyleft.

| Package | License |
|---|---|
| react, react-dom, react-compiler-runtime | MIT |
| @tanstack/react-query, @tanstack/react-router, @tanstack/react-virtual | MIT |
| @radix-ui/* (colors, avatar, context-menu, dialog, dropdown-menu, progress, slider, slot, switch, tooltip) | MIT |
| nanostores, @nanostores/react | MIT |
| tailwindcss, @tailwindcss/typography, tailwindcss-animate, tailwind-merge, autoprefixer, postcss | MIT |
| windy-radix-palette, react-twc, clsx | MIT |
| class-variance-authority | Apache-2.0 |
| cmdk, sonner, next-themes, react-hotkeys-hook | MIT |
| fflate, fuzzysort, papaparse, hyparquet | MIT |
| chroma-js | BSD-3-Clause and Apache-2.0 |
| lucide-react (icons) | ISC |
| vite-plugin-pwa | MIT |
| baseline-browser-mapping | Apache-2.0 |
| @fontsource-variable/jetbrains-mono (JetBrains Mono font) | SIL Open Font License 1.1 |

## Data used at runtime

Classify reads species lists that you choose, usually GBIF downloads. Those lists keep the
license printed on their GBIF download page (often CC BY 4.0 or CC BY-NC 4.0); cite the
download DOI when you publish results identified against one.
