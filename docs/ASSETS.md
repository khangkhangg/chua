# Asset list and budgets

Everything in the temple is drawn from code: there are no model or image files to download. This list is the inventory of what the code builds, with the budget each part must stay inside. The numbers in "Measured" come from Chromium (software rendering, 1280 × 720, pixel size 3) on 4 November 2026, using `?debug` and `window.__temple.renderInfo()`.

## Measured

| View | Draw calls | Triangles | Notes |
|---|---:|---:|---|
| Overview before entering | 781 | 766k | Whole courtyard in view, shadows on |
| Courtyard, third person | 437 | 488k | Typical walking view |
| Inside the main hall, eye view | 99 | 343k | Most of the scene is behind walls |
| Courtyard, graphics Low | 473 | 453k | No shadows, pixel size 4, silhouettes from 24 m |

Shared by all views: 1,572 geometries, 32 textures, about 50 shader programs, 58 MB JavaScript heap.

| Download | Raw | Gzipped |
|---|---:|---:|
| `js/temple.js` | 164 KB | 56 KB |
| `js/net.js` + `js/i18n.js` | 18 KB | 7 KB |
| `css/temple.css` + page | 23 KB | 7 KB |
| three.js 0.165 (CDN) | 1.28 MB | 258 KB |
| BufferGeometryUtils (CDN) | 32 KB | 7 KB |
| qrcode-generator (CDN) | 20 KB | 7 KB |
| **First visit total** | **1.54 MB** | **about 340 KB** plus Google Fonts |

## Budgets

| Part | Budget | Now | How it is kept down |
|---|---|---|---|
| Draw calls, walking view | ≤ 500 desktop, ≤ 250 phone | 437 | Static buildings merged per material; trees and cards instanced |
| Triangles, walking view | ≤ 600k desktop, ≤ 300k phone | 488k | Pixel pass renders at 1/3 resolution, so triangle detail is cheap to shade |
| Textures | ≤ 40, all drawn on canvas | 32 | No image downloads |
| First download (gzipped) | ≤ 500 KB | ≈ 340 KB | three.js from CDN cache; no assets |
| People drawn in full | ≤ 60 within 36 m (24 m on Low) | ✓ | Farther people become one-piece silhouettes in a single draw call |
| Smoke particles | ≤ 2,400 | ✓ | "A little" emits about a third and keeps puffs small |

## Inventory

| Group | Pieces | Built by | Notes |
|---|---|---|---|
| Terrain and mountains | 1 mesh (230 × 230 grid), up to 12,000 instanced trees, 20 mist sprites | `terrain()` | Vertex colours, one grass detail texture |
| Courtyard | brick and slab planes, walls, terrace balustrade, 4 lotus ponds (instanced pads and flowers), benches | world section | Merged into a few meshes |
| Halls | 7 buildings: platform, stairs and rails, walls with real door openings, round windows, columns, beams, lanterns, ceilings, curved roofs with trims, ridges, dragons and corner tips, plaques | `building()` | Each hall merged per material; roof and ceiling in a separate group for the cutaway view |
| Statues | Thích Ca, Quan Âm, A Di Đà, Địa Tạng, Di Lặc, Dược Sư, Đản Sanh, lotus seats, halos | `STATUE` | Merged with their hall |
| Altars | altar tiers, offering table, candles, vases, fruit, incense burner, tall lamps; drum and bell in the main hall | `building()` | Merged |
| Gate, urn, bell, stone lanterns, candle stand, fortune table | | world section | Merged; the bell and fortune cup stay separate because they move |
| Vegetation | Bodhi, frangipani, palms, areca, cloud pines, bonsai, blossom trees, flower beds, bougainvillea | vegetation section | Trunks, foliage and leaf/flower cards are instanced (one draw call per kind) |
| People | 5 monks, 30 visitors, 5 kids, the player, every live visitor | `buildPerson()` | About 40 small meshes each; this is the largest share of draw calls |
| Dog | 1 | `buildDog()` | |
| Effects | incense smoke, fireflies, light shafts, candle flames, wish tags | effects sections | Points and instanced meshes |
| Sky | canvas sky cylinder, cloud cylinder, sun and moon sprites | sky section | Redrawn only when the light changes |

## Next optimisation if phones need it

People are the biggest cost: about 40 meshes each. Merging each person into one skinned mesh would cut a full courtyard by roughly 300 draw calls. That is the next step if phone frame rates are low after launch. The silhouette crowd and the Low setting already cover most phones in the meantime.
