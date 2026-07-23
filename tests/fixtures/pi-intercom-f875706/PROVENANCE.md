# pi-skills Intercom f875706 compatibility fixture

These files pin the committed Intercom behavior at clean repository revision `f875706770b8202af5d35846f3911b0aeeb48e5b`:

- `broker/server.mjs`: Git blob `aad0ce8c96fce635e869772f41e73b87e4a49ef6`, SHA-256 `2a3ba4ebfaea90f7630cecdc23f4755ac640b01ceca69ae3930865359165219e`
- `broker/paths.ts`: Git blob `35d3cbf26a5b6d65bad19f6d8dd1e42cf11bc23d`, SHA-256 `535a0df0ab0e8f30d84bd898cadd64ca2a270057b5b330fb2df1c101a5c7a709`
- `client.ts`: Git blob `5cd72d542c7eb9f0915a386bc735336d393a94d0`, SHA-256 `10eca554287fc7a42464314a9729d7c486f05bfe60ce47503346c236e248f7d4`

The fixture captures the rolling-upgrade boundary: this broker advertises `pi-session-tail-v1` but cannot filter private presence by recipient. The pinned client therefore publishes `piSession` when connected to that broker and does not declare recipient capabilities.

`client-driver.mjs` is a local JSON-lines adapter, not committed source from that revision. The fixture is outside the shipped extension surface.
