import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, '../public/policka-data.json');

// Bounding box for Polička historical center & immediate surroundings
const BBOX = '49.7095,16.2580,49.7195,16.2735';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const OVERPASS_QUERY = `
[out:json][timeout:45];
(
  way["building"](${BBOX});
  relation["building"](${BBOX});
  way["historic"="citywalls"](${BBOX});
  way["barrier"="city_wall"](${BBOX});
  way["barrier"="wall"]["historic"](${BBOX});
  way["historic"="fortification"](${BBOX});
  relation["historic"="citywalls"](${BBOX});
  way["highway"](${BBOX});
  way["leisure"="park"](${BBOX});
  way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green)$"](${BBOX});
  way["natural"="water"](${BBOX});
  relation["natural"="water"](${BBOX});
  way["place"="square"](${BBOX});
  node["historic"~"^(monument|memorial|column|wayside_shrine|city_gate|tower)$"](${BBOX});
  way["historic"~"^(monument|memorial|column|city_gate|tower)$"](${BBOX});
);
(._;>;);
out body;
`;

async function fetchOverpass() {
  let lastErr = null;
  for (const url of OVERPASS_ENDPOINTS) {
    console.log(`Querying Overpass: ${url} ...`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 22_000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'TheTowerKeeper-PolickaPrototype/1.0',
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      if (!json.elements || json.elements.length === 0) {
        throw new Error('Empty elements array returned');
      }
      console.log(`Fetched ${json.elements.length} OSM elements from ${url}`);
      return json;
    } catch (err) {
      console.warn(`Endpoint failed (${url}):`, err.message);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed');
}

/** Round to 2 decimal places for compact JSON */
const r2 = (n) => Math.round(n * 100) / 100;

/** Simple Douglas-Peucker simplification for 2D polylines */
function simplifyPoints(pts, tolerance = 0.4) {
  if (pts.length <= 3) return pts;
  const sqTol = tolerance * tolerance;

  function sqSegDist(p, a, b) {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function step(points, first, last, out) {
    let maxDist = sqTol;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxDist) {
        index = i;
        maxDist = d;
      }
    }
    if (index !== -1) {
      if (index - first > 1) step(points, first, index, out);
      out.push(points[index]);
      if (last - index > 1) step(points, index, last, out);
    }
  }

  const out = [pts[0]];
  step(pts, 0, pts.length - 1, out);
  out.push(pts[pts.length - 1]);
  return out;
}

function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    area += x1 * z2 - x2 * z1;
  }
  return Math.abs(area) / 2;
}

function polygonCentroid(pts) {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of pts) {
    sx += x;
    sz += z;
  }
  return [sx / pts.length, sz / pts.length];
}

/** Merge relation outer ways into ordered rings */
function assembleRelationRings(rel, waysById, nodesById) {
  const outerSegments = [];
  for (const member of rel.members ?? []) {
    if (member.type === 'way' && (member.role === 'outer' || member.role === '')) {
      const w = waysById.get(member.ref);
      if (w && w.nodes && w.nodes.length >= 2) {
        outerSegments.push([...w.nodes]);
      }
    }
  }
  const rings = [];
  while (outerSegments.length > 0) {
    const ring = outerSegments.shift();
    let changed = true;
    while (changed && ring[0] !== ring[ring.length - 1]) {
      changed = false;
      const tail = ring[ring.length - 1];
      for (let i = 0; i < outerSegments.length; i++) {
        const seg = outerSegments[i];
        if (seg[0] === tail) {
          ring.push(...seg.slice(1));
          outerSegments.splice(i, 1);
          changed = true;
          break;
        } else if (seg[seg.length - 1] === tail) {
          ring.push(...seg.slice(0, -1).reverse());
          outerSegments.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    const coords = ring
      .map((id) => nodesById.get(id))
      .filter(Boolean)
      .map((n) => [n.lat, n.lon]);
    if (coords.length >= 3) rings.push(coords);
  }
  return rings;
}

async function main() {
  const raw = await fetchOverpass();

  const nodesById = new Map();
  const waysById = new Map();
  const ways = [];
  const relations = [];
  const taggedNodes = [];

  for (const el of raw.elements) {
    if (el.type === 'node') {
      nodesById.set(el.id, el);
      if (el.tags && Object.keys(el.tags).length > 0) {
        taggedNodes.push(el);
      }
    } else if (el.type === 'way') {
      waysById.set(el.id, el);
      ways.push(el);
    } else if (el.type === 'relation') {
      relations.push(el);
    }
  }

  // 1. Locate St. James Church (Kostel sv. Jakuba) in OSM data
  let churchWay = null;
  for (const w of ways) {
    const t = w.tags ?? {};
    const name = (t.name ?? '').toLowerCase();
    if (
      (t.building === 'church' || t.amenity === 'place_of_worship') &&
      (name.includes('jakub') || name.includes('james'))
    ) {
      churchWay = w;
      break;
    }
  }

  // Fallback: largest church building near Polička historic core (49.7140, 16.2665)
  if (!churchWay) {
    let bestScore = Infinity;
    for (const w of ways) {
      const t = w.tags ?? {};
      if (t.building === 'church' || t.amenity === 'place_of_worship') {
        const pts = (w.nodes ?? []).map((id) => nodesById.get(id)).filter(Boolean);
        if (pts.length < 3) continue;
        const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const avgLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
        const d = Math.hypot(avgLat - 49.7138, avgLon - 16.2666);
        if (d < bestScore) {
          bestScore = d;
          churchWay = w;
        }
      }
    }
  }

  if (!churchWay) {
    throw new Error('Could not locate St. James Church in OSM data');
  }

  const churchLatLons = churchWay.nodes
    .map((id) => nodesById.get(id))
    .filter(Boolean)
    .map((n) => [n.lat, n.lon]);

  // Equirectangular projection helper around tentative church centroid
  const refLat =
    churchLatLons.reduce((s, p) => s + p[0], 0) / churchLatLons.length;
  const refLon =
    churchLatLons.reduce((s, p) => s + p[1], 0) / churchLatLons.length;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((refLat * Math.PI) / 180);

  // Convert church vertices into local meters relative to centroid to find tower end
  const churchLocalTemp = churchLatLons.map(([lat, lon]) => [
    (lon - refLon) * metersPerDegLon,
    -(lat - refLat) * metersPerDegLat,
  ]);

  // Find longest axis of church footprint (PCA / farthest pair)
  let maxDist = 0;
  let endA = churchLocalTemp[0];
  let endB = churchLocalTemp[0];
  for (let i = 0; i < churchLocalTemp.length; i++) {
    for (let j = i + 1; j < churchLocalTemp.length; j++) {
      const d = Math.hypot(
        churchLocalTemp[j][0] - churchLocalTemp[i][0],
        churchLocalTemp[j][1] - churchLocalTemp[i][1],
      );
      if (d > maxDist) {
        maxDist = d;
        endA = churchLocalTemp[i];
        endB = churchLocalTemp[j];
      }
    }
  }

  // In Polička, St. James Church tower is at the EAST-SOUTHEAST end (Wait: let's check both ends!)
  // Actually let's check which end is West vs East:
  const westEnd = endA[0] < endB[0] ? endA : endB;
  const eastEnd = endA[0] < endB[0] ? endB : endA;
  console.log('St. James Church OSM way id:', churchWay.id, 'tags:', churchWay.tags);
  console.log('Church length (m):', r2(maxDist), 'westEnd:', westEnd.map(r2), 'eastEnd:', eastEnd.map(r2));

  // Use the west end (inset 3.5m toward centroid so origin is at the tower center) as origin (0, 0)
  // Wait: let's check if tower is at west end or east end! We'll log both & use westEnd + 4m toward eastEnd
  const dxCh = eastEnd[0] - westEnd[0];
  const dzCh = eastEnd[1] - westEnd[1];
  const chLen = Math.hypot(dxCh, dzCh) || 1;
  const towerOffsetX = westEnd[0] + (dxCh / chLen) * 4.5;
  const towerOffsetZ = westEnd[1] + (dzCh / chLen) * 4.5;

  const originLat = refLat - towerOffsetZ / metersPerDegLat;
  const originLon = refLon + towerOffsetX / metersPerDegLon;

  const project = (lat, lon) => [
    r2((lon - originLon) * metersPerDegLon),
    r2(-(lat - originLat) * metersPerDegLat),
  ];

  // Re-project church polygon around the chosen origin
  const churchPoly = churchLatLons.map(([lat, lon]) => project(lat, lon));
  const churchCentroid = polygonCentroid(churchPoly);

  // 2. Collect buildings, walls, streets, parks, water, landmarks
  const buildings = [];
  const walls = [];
  const streets = [];
  const parks = [];
  const water = [];
  const squares = [];

  let townHall = null;
  let plagueColumn = null;

  const addBuilding = (id, latLons, tags) => {
    let pts = latLons.map(([lat, lon]) => project(lat, lon));
    // Remove closing duplicate vertex for ExtrudeGeometry cleanliness
    if (
      pts.length > 1 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    ) {
      pts.pop();
    }
    if (pts.length < 3) return;
    pts = simplifyPoints(pts, 0.35);
    if (pts.length < 3) return;

    const area = polygonArea(pts);
    if (area < 8) return;

    const centroid = polygonCentroid(pts);
    const levelsRaw = parseFloat(tags['building:levels'] ?? tags.levels ?? '');
    const heightRaw = parseFloat(tags.height ?? '');
    let height;
    if (!Number.isNaN(heightRaw) && heightRaw > 2 && heightRaw < 60) {
      height = r2(heightRaw);
    } else if (!Number.isNaN(levelsRaw) && levelsRaw >= 1 && levelsRaw <= 15) {
      height = r2(levelsRaw * 3.2);
    } else {
      // Deterministic estimate 6.5m - 9.5m based on footprint area
      const areaFactor = Math.min(1, Math.max(0, (area - 40) / 360));
      height = r2(6.5 + areaFactor * 3.0);
    }

    const name = tags.name ?? '';
    const isChurch =
      id === churchWay.id ||
      (tags.building === 'church' &&
        Math.hypot(centroid[0] - churchCentroid[0], centroid[1] - churchCentroid[1]) < 35);

    const isTownHall =
      id === 66888562 ||
      tags.amenity === 'townhall' ||
      /radnice/i.test(name);

    if (isTownHall && !townHall) {
      townHall = {
        id,
        name: name || 'Barokní radnice',
        centroid: [r2(centroid[0]), r2(centroid[1])],
        area: r2(area),
        points: pts,
      };
    }

    if (isChurch) {
      return; // Exclude St. James Church from raw OSM extrusion
    }

    buildings.push({
      id,
      points: pts,
      height,
      area: r2(area),
      kind: isTownHall ? 'townhall' : (tags.building ?? 'yes'),
      ...(name ? { name } : {}),
    });
  };

  for (const w of ways) {
    const t = w.tags ?? {};
    const latLons = (w.nodes ?? [])
      .map((id) => nodesById.get(id))
      .filter(Boolean)
      .map((n) => [n.lat, n.lon]);
    if (latLons.length < 2) continue;

    if (t.building) {
      addBuilding(w.id, latLons, t);
    } else if (
      t.historic === 'citywalls' ||
      t.barrier === 'city_wall' ||
      t.historic === 'fortification' ||
      (t.barrier === 'wall' && t.historic)
    ) {
      const pts = simplifyPoints(
        latLons.map(([lat, lon]) => project(lat, lon)),
        0.5,
      );
      if (pts.length >= 2) {
        walls.push({ id: w.id, points: pts });
      }
    } else if (t.place === 'square' || (t.highway === 'pedestrian' && t.area === 'yes')) {
      const pts = simplifyPoints(
        latLons.map(([lat, lon]) => project(lat, lon)),
        0.5,
      );
      if (pts.length >= 3) {
        squares.push({ id: w.id, name: t.name ?? '', points: pts });
      }
    } else if (t.highway) {
      const pts = simplifyPoints(
        latLons.map(([lat, lon]) => project(lat, lon)),
        0.8,
      );
      if (pts.length >= 2) {
        const width =
          t.highway === 'primary' || t.highway === 'secondary'
            ? 8
            : t.highway === 'tertiary' || t.highway === 'residential' || t.highway === 'unclassified'
              ? 6
              : t.highway === 'pedestrian' || t.highway === 'living_street'
                ? 5
                : 3;
        streets.push({
          id: w.id,
          kind: t.highway,
          width,
          points: pts,
        });
      }
    } else if (
      t.leisure === 'park' ||
      t.landuse === 'grass' ||
      t.landuse === 'forest' ||
      t.landuse === 'meadow' ||
      t.landuse === 'recreation_ground' ||
      t.landuse === 'village_green'
    ) {
      const pts = simplifyPoints(
        latLons.map(([lat, lon]) => project(lat, lon)),
        1.0,
      );
      if (pts.length >= 3 && polygonArea(pts) >= 40) {
        parks.push({ id: w.id, kind: t.leisure ?? t.landuse, points: pts });
      }
    } else if (t.natural === 'water') {
      const pts = simplifyPoints(
        latLons.map(([lat, lon]) => project(lat, lon)),
        1.0,
      );
      if (pts.length >= 3 && polygonArea(pts) >= 30) {
        water.push({ id: w.id, name: t.name ?? '', points: pts });
      }
    } else if (
      (t.historic === 'monument' || t.historic === 'memorial' || t.historic === 'column') &&
      /morov|marián|marian|sloup/i.test(t.name ?? '')
    ) {
      const pts = latLons.map(([lat, lon]) => project(lat, lon));
      const c = polygonCentroid(pts);
      plagueColumn = { name: t.name, position: [r2(c[0]), r2(c[1])] };
    }
  }

  for (const rel of relations) {
    const t = rel.tags ?? {};
    const rings = assembleRelationRings(rel, waysById, nodesById);
    if (t.building) {
      for (const ring of rings) {
        addBuilding(rel.id, ring, t);
      }
    } else if (t.historic === 'citywalls' || t.historic === 'fortification') {
      for (const ring of rings) {
        const pts = simplifyPoints(
          ring.map(([lat, lon]) => project(lat, lon)),
          0.6,
        );
        if (pts.length >= 2) {
          walls.push({ id: rel.id, points: pts });
        }
      }
    } else if (t.natural === 'water') {
      for (const ring of rings) {
        const pts = simplifyPoints(
          ring.map(([lat, lon]) => project(lat, lon)),
          1.0,
        );
        if (pts.length >= 3 && polygonArea(pts) >= 30) {
          water.push({ id: rel.id, name: t.name ?? '', points: pts });
        }
      }
    }
  }

  // Check tagged nodes for Plague Column (Morový sloup)
  for (const n of taggedNodes) {
    const t = n.tags ?? {};
    const name = t.name ?? '';
    if (/morov|marián|marian|sloup/i.test(name)) {
      plagueColumn = { name, position: project(n.lat, n.lon) };
      break;
    }
  }

  // If Town Hall wasn't tagged with amenity=townhall, find the central building on Palackého náměstí
  if (!townHall) {
    // Palackého náměstí is roughly ~140m NW of St. James Church
    let best = null;
    let bestDist = Infinity;
    for (const b of buildings) {
      const c = polygonCentroid(b.points);
      const d = Math.hypot(c[0] + 125, c[1] + 55);
      if (b.area > 300 && d < bestDist) {
        bestDist = d;
        best = { b, c };
      }
    }
    if (best && bestDist < 80) {
      best.b.kind = 'townhall';
      townHall = {
        id: best.b.id,
        name: best.b.name || 'Barokní radnice',
        centroid: [r2(best.c[0]), r2(best.c[1])],
        area: best.b.area,
        points: best.b.points,
      };
    }
  }

  // Compute exact OBB transforms from longest exterior wall edges
  const computePolyTransform = (pts, perpendicularToLongest = false) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let bestLen = 0;
    let bestDx = 1;
    let bestDz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len > bestLen) {
        bestLen = len;
        bestDx = dx;
        bestDz = dz;
      }
    }
    let rotY = Math.atan2(-bestDz, bestDx);
    if (perpendicularToLongest) {
      rotY -= Math.PI / 2;
    }
    const ux = Math.cos(rotY);
    const uz = -Math.sin(rotY);
    const vx = Math.sin(rotY);
    const vz = Math.cos(rotY);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of pts) {
      const u = (x - cx) * ux + (z - cz) * uz;
      const v = (x - cx) * vx + (z - cz) * vz;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    return {
      x: r2(cx),
      z: r2(cz),
      rotationY: Math.round(rotY * 100000) / 100000,
      length: r2(maxU - minU),
      width: r2(maxV - minV),
      westTowerX: r2(cx + (minU + 3.5) * ux + ((minV + maxV) / 2) * vx),
      westTowerZ: r2(cz + (minU + 3.5) * uz + ((minV + maxV) / 2) * vz),
    };
  };

  const chT = computePolyTransform(churchPoly, true);
  const thT = townHall ? computePolyTransform(townHall.points, false) : null;

  const output = {
    meta: {
      originLat: r2(originLat * 10000) / 10000,
      originLon: r2(originLon * 10000) / 10000,
      churchLength: r2(maxDist),
      churchAngleRad: r2(Math.atan2(dzCh, dxCh)),
      churchCentroid: [r2(churchCentroid[0]), r2(churchCentroid[1])],
      churchPolygon: churchPoly,
    },
    churchTransform: {
      x: chT.westTowerX,
      z: chT.westTowerZ,
      centroidX: chT.x,
      centroidZ: chT.z,
      rotationY: chT.rotationY,
      length: chT.length,
      width: chT.width,
    },
    townHallTransform: thT
      ? {
          x: thT.x,
          z: thT.z,
          rotationY: thT.rotationY,
          length: thT.length,
          width: thT.width,
        }
      : null,
    landmarks: {
      townHall: townHall
        ? {
            id: townHall.id,
            name: townHall.name,
            position: townHall.centroid,
          }
        : null,
      plagueColumn,
    },
    buildings,
    walls,
    streets,
    squares,
    parks,
    water,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output), 'utf8');

  console.log('\nSaved public/policka-data.json successfully!');
  console.log('Summary:', {
    churchLength: output.meta.churchLength,
    churchAngleDeg: r2((output.meta.churchAngleRad * 180) / Math.PI),
    churchCentroid: output.meta.churchCentroid,
    townHall: output.landmarks.townHall,
    plagueColumn: output.landmarks.plagueColumn,
    counts: {
      buildings: buildings.length,
      walls: walls.length,
      streets: streets.length,
      squares: squares.length,
      parks: parks.length,
      water: water.length,
    },
  });
}

main().catch((err) => {
  console.error('Failed to fetch Polička OSM data:', err);
  process.exit(1);
});
