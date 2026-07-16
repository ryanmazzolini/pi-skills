# pi-intercom 0.6.0 executable compatibility fixture

These files are pinned from the published npm package [`pi-intercom@0.6.0`](https://www.npmjs.com/package/pi-intercom/v/0.6.0), by Nico Bailon:

- npm tarball SHA-1: `7c19f6acd53a5c7a3e5a04f3dc1f7156d2376dd5`
- npm integrity: `sha512-OFPh/DXfPhUUSDLTRJiFPEvw00fOA/spjsxUcXiuCHvb2ZkRL02G8Q91mTd+3d42A9AK8BSmbD0+8imFPuHGoQ==`
- downloaded tarball SHA-256: `76c0d5284661aac437248bb6c7a32879fe863296bd15cb533751b27cafc44818`

Copied source:

- `types.ts`
- `broker/broker.ts`
- `broker/client.ts`
- `broker/framing.ts`
- `broker/paths.ts`
- `upstream-package.json` (published package metadata)

The source adaptations change `.js` import specifiers in `broker.ts` and `client.ts` to `.ts`, allowing Node 24's built-in TypeScript type stripping to execute the published source without adding upstream's `tsx` runtime dependency, and remove trailing horizontal whitespace. Tests set an isolated `HOME`, so the unmodified legacy path function resolves an isolated copy of the exact legacy socket path.

`client-driver.mjs` is a local JSON-lines test adapter, not upstream source. The fixture is outside the shipped extension surface.

The copied files remain under the adjacent upstream MIT license in `LICENSE` (Copyright (c) 2026 Nico Bailon).
