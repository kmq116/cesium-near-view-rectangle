# cesium-near-view-rectangle

Compute the **near-end visible rectangle** of a Cesium camera by screen-space ray sampling.

When the camera is tilted (e.g. pitched at −30°), the built-in `camera.computeViewRectangle()` often returns an oversized rectangle that includes the far horizon. This package focuses the rectangle on the **near-end ground** that is actually close to the camera, giving a much tighter and more useful bounding box.

## Installation

```bash
npm install cesium-near-view-rectangle
```

## Usage

```js
import { computeNearViewRectangle, computeAutoMaxDistKm } from 'cesium-near-view-rectangle';

// Cesium is whatever you already have — window.Cesium (CDN) or `import * as Cesium from 'cesium'`

// Basic usage
const result = computeNearViewRectangle(Cesium, viewer);

if (result) {
  const { rect, hitCount, missCount, total } = result;
  console.log('west:',  Cesium.Math.toDegrees(rect.west));
  console.log('east:',  Cesium.Math.toDegrees(rect.east));
  console.log('south:', Cesium.Math.toDegrees(rect.south));
  console.log('north:', Cesium.Math.toDegrees(rect.north));
} else {
  console.warn('Camera may be pointing at the sky — no valid ground found.');
}

// Recommended: auto distance filter based on camera height
const result2 = computeNearViewRectangle(Cesium, viewer, {
  rows: 14,
  cols: 14,
  nearRatio: 0.3,
  maxDistKm: computeAutoMaxDistKm(Cesium, viewer),
});
```

## API

### `computeNearViewRectangle(Cesium, viewer, options?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `Cesium` | `object` | — | Cesium namespace (`window.Cesium` or `import * as Cesium from 'cesium'`) |
| `viewer` | `Cesium.Viewer` | — | Cesium Viewer instance |
| `options.rows` | `number` | `12` | Number of sample rows |
| `options.cols` | `number` | `12` | Number of sample columns |
| `options.nearRatio` | `number` | `0.35` | Start row as a fraction of screen height (0 = top, 1 = bottom). Higher values sample closer to the camera. |
| `options.maxDistKm` | `number \| null` | `null` | Distance filter threshold in km. Points farther than this are discarded. Use `computeAutoMaxDistKm(Cesium, viewer)` for automatic tuning. |

**Returns** `{ rect, hitCount, missCount, total } | null`

| Field | Type | Description |
|---|---|---|
| `rect` | `Cesium.Rectangle` | Computed bounding rectangle (radians) |
| `hitCount` | `number` | Number of screen samples that hit the ground |
| `missCount` | `number` | Number of samples that missed (sky, too far, etc.) |
| `total` | `number` | Total number of sample points tried |

Returns `null` when fewer than 3 valid ground hits were found (e.g. camera pointing at sky).

---

### `computeAutoMaxDistKm(Cesium, viewer)`

Returns a recommended `maxDistKm` value derived from the current camera height:

```
maxDistKm = max(cameraHeightKm × 3, 200)
```

## How it works

1. A grid of screen-space points is generated covering the lower portion of the viewport (controlled by `nearRatio`).
2. For each point, a ray is cast from the camera through that pixel:
   - First tries `globe.pick()` (terrain-aware).
   - Falls back to ray–ellipsoid intersection if terrain pick fails.
3. Ground positions are filtered by distance and elevation sanity checks.
4. `Cesium.Rectangle.fromCartographicArray()` wraps all valid hits into the final rectangle.

## Compatibility

- Works with any CesiumJS version that provides `IntersectionTests.rayEllipsoid` (≥ 1.107)
- No runtime dependencies — bring your own Cesium
- ESM only

## License

MIT
