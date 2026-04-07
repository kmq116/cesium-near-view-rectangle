/**
 * 射线与 WGS84 椭球体求交（Cesium 1.107+ 兼容）
 * @param {object} Cesium  Cesium 命名空间对象
 * @param {object} ray
 * @returns {object | null}
 */
function rayEllipsoidIntersect(Cesium, ray) {
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const intersection = Cesium.IntersectionTests.rayEllipsoid(ray, ellipsoid);
  if (!intersection) return null;
  const t = intersection.start >= 0 ? intersection.start : intersection.stop;
  if (t < 0) return null;
  return Cesium.Ray.getPoint(ray, t);
}

/**
 * 从屏幕坐标拾取地面交点
 * 优先 globe.pick（含地形），失败则退回椭球体求交
 * @param {object} Cesium
 * @param {object} screenPos
 * @param {object} camera
 * @param {object} globe
 * @param {object} scene
 * @returns {object | null}
 */
function pickGroundPoint(Cesium, screenPos, camera, globe, scene) {
  const ray = camera.getPickRay(screenPos);
  if (!ray) return null;
  const cart3 = globe.pick(ray, scene);
  if (cart3) return cart3;
  return rayEllipsoidIntersect(Cesium, ray);
}

/**
 * 生成屏幕采样点网格
 * nearRatio：只采样屏幕 [nearRatio*H, H] 高度范围（下方 = 近端地面）
 * @param {object} Cesium
 * @param {number} rows
 * @param {number} cols
 * @param {number} nearRatio
 * @param {HTMLCanvasElement} canvas
 * @returns {object[]}
 */
function buildSamplePoints(Cesium, rows, cols, nearRatio, canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const yStart = Math.floor(H * nearRatio);
  const points = [];

  for (let r = 0; r <= rows; r++) {
    const y = yStart + (H - yStart) * (r / rows);
    for (let c = 0; c <= cols; c++) {
      points.push(new Cesium.Cartesian2(W * (c / cols), y));
    }
  }
  // 强制补四角和中心点
  points.push(new Cesium.Cartesian2(0, 0));
  points.push(new Cesium.Cartesian2(W, 0));
  points.push(new Cesium.Cartesian2(0, H));
  points.push(new Cesium.Cartesian2(W, H));
  points.push(new Cesium.Cartesian2(W / 2, H / 2));
  return points;
}

/**
 * 根据相机高度自动推算合理的最大距离（km）
 *
 * @param {object} Cesium  Cesium 命名空间对象（window.Cesium 或 import * as Cesium）
 * @param {object} viewer  Cesium Viewer 实例
 * @returns {number}
 */
export function computeAutoMaxDistKm(Cesium, viewer) {
  const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(
    viewer.camera.position,
  );
  if (!carto) return 200;
  return Math.max((carto.height / 1000) * 3, 200);
}

/**
 * 计算相机近端可视矩形区域
 *
 * @param {object} Cesium  Cesium 命名空间对象（window.Cesium 或 import * as Cesium）
 * @param {object} viewer  Cesium Viewer 实例
 * @param {object}   [options]
 * @param {number}   [options.rows=12]           采样行数
 * @param {number}   [options.cols=12]           采样列数
 * @param {number}   [options.nearRatio=0.35]    采样起始行比例（0=顶部，1=底部），
 *                                              值越大越靠近相机近端
 * @param {number|null} [options.maxDistKm=null] 距离过滤阈值（km），null 表示不过滤；
 *                                              推荐使用 computeAutoMaxDistKm(Cesium, viewer)
 * @returns {{ rect: object, hitCount: number, missCount: number, total: number } | null}
 *   成功时返回矩形结果，视角朝向天空等无效情况返回 null
 */
export function computeNearViewRectangle(Cesium, viewer, options) {
  options = options || {};
  const rows = options.rows !== undefined ? options.rows : 12;
  const cols = options.cols !== undefined ? options.cols : 12;
  const nearRatio = options.nearRatio !== undefined ? options.nearRatio : 0.35;
  const maxDistKm = options.maxDistKm !== undefined ? options.maxDistKm : null;

  const camera = viewer.camera;
  const scene = viewer.scene;
  const globe = scene.globe;
  const canvas = viewer.canvas;

  const samplePts = buildSamplePoints(Cesium, rows, cols, nearRatio, canvas);
  const cartoList = [];
  let hitCount = 0;
  let missCount = 0;

  for (const sp of samplePts) {
    const cart3 = pickGroundPoint(Cesium, sp, camera, globe, scene);
    if (!cart3) {
      missCount++;
      continue;
    }

    const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cart3);
    if (!carto) {
      missCount++;
      continue;
    }

    // 距离过滤：剔除地平线附近的远端点
    if (maxDistKm !== null) {
      const distM = Math.sqrt(
        Math.pow(cart3.x - camera.position.x, 2) +
          Math.pow(cart3.y - camera.position.y, 2) +
          Math.pow(cart3.z - camera.position.z, 2),
      );
      if (distM > maxDistKm * 1000) {
        missCount++;
        continue;
      }
    }

    // 高度合理性过滤
    if (carto.height > 15000 || carto.height < -500) {
      missCount++;
      continue;
    }

    cartoList.push(carto);
    hitCount++;
  }

  if (cartoList.length < 3) return null;

  const rect = Cesium.Rectangle.fromCartographicArray(cartoList);
  return { rect, hitCount, missCount, total: samplePts.length };
}
