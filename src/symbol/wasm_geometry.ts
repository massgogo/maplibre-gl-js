/**
 * WASM-accelerated geometry functions for symbol placement.
 *
 * This module is intentionally in `symbol/` (not `source/`) to avoid
 * circular chunk dependencies in the rollup shared/worker/index split.
 * It accesses the WASM module via a lazy getter from `vector_tile_wasm.ts`.
 */

import Point from '@mapbox/point-geometry';
import {getWasmModule, type WasmGridIndexInstance} from '../source/vector_tile_wasm';

/** Ring separator constant — must match Rust `RING_SEP = i32::MIN`. */
const RING_SEP = -2147483648;

function flattenToInt32(rings: Point[][]): Int32Array {
    let len = 0;
    for (let i = 0; i < rings.length; i++) {
        if (i > 0) len++;
        len += rings[i].length * 2;
    }
    const arr = new Int32Array(len);
    let offset = 0;
    for (let i = 0; i < rings.length; i++) {
        if (i > 0) arr[offset++] = RING_SEP;
        const ring = rings[i];
        for (let j = 0; j < ring.length; j++) {
            arr[offset++] = ring[j].x;
            arr[offset++] = ring[j].y;
        }
    }
    return arr;
}

function unflattenFromInt32(arr: Int32Array): Point[][] {
    const rings: Point[][] = [];
    let current: Point[] = [];
    let i = 0;
    while (i < arr.length) {
        if (arr[i] === RING_SEP) {
            if (current.length > 0) {
                rings.push(current);
                current = [];
            }
            i++;
        } else if (i + 1 < arr.length) {
            current.push(new Point(arr[i], arr[i + 1]));
            i += 2;
        } else {
            break;
        }
    }
    if (current.length > 0) rings.push(current);
    return rings;
}

export function wasmClipLine(lines: Point[][], x1: number, y1: number, x2: number, y2: number): Point[][] {
    const mod = getWasmModule();
    if (!mod) return [];
    const flat = flattenToInt32(lines);
    const result = mod.clip_line(flat, x1, y1, x2, y2);
    return unflattenFromInt32(result);
}

export function wasmClipGeometry(geometry: Point[][], geomType: 0 | 1 | 2 | 3, x1: number, y1: number, x2: number, y2: number): Point[][] {
    const mod = getWasmModule();
    if (!mod) return [];
    const flat = flattenToInt32(geometry);
    const result = mod.clip_geometry(flat, geomType, x1, y1, x2, y2);
    return unflattenFromInt32(result);
}

export function wasmFindPoleOfInaccessibility(polygonRings: Point[][], precision: number): Point {
    const mod = getWasmModule();
    if (!mod) return new Point(0, 0);
    const flat = flattenToInt32(polygonRings);
    const result = mod.find_pole_of_inaccessibility(flat, precision);
    return new Point(result[0], result[1]);
}

/** Flatten a single line (no ring separators) to Int32Array. */
function flattenLineToInt32(line: Point[]): Int32Array {
    const arr = new Int32Array(line.length * 2);
    for (let i = 0; i < line.length; i++) {
        arr[i * 2] = line[i].x;
        arr[i * 2 + 1] = line[i].y;
    }
    return arr;
}

/**
 * WASM-accelerated getAnchors — replaces get_anchors.ts entirely.
 * Returns Anchor[] (from anchor.ts).
 */
export function wasmGetAnchors(
    line: Point[],
    spacing: number,
    maxAngle: number,
    shapedLabelLength: number,
    angleWindowSize: number,
    boxScale: number,
    overscaling: number,
    tileExtent: number,
    glyphSize: number,
    isLineContinued: boolean,
): {x: number; y: number; angle: number; segment: number}[] {
    const mod = getWasmModule();
    if (!mod) return [];
    const flat = flattenLineToInt32(line);
    const result = mod.get_anchors(
        flat, spacing, maxAngle, shapedLabelLength, angleWindowSize,
        boxScale, overscaling, tileExtent, glyphSize, isLineContinued
    );
    const anchors: {x: number; y: number; angle: number; segment: number}[] = [];
    for (let i = 0; i < result.length; i += 4) {
        anchors.push({
            x: result[i],
            y: result[i + 1],
            angle: result[i + 2],
            segment: result[i + 3]
        });
    }
    return anchors;
}

/**
 * WASM-accelerated getCenterAnchor.
 * Returns {x, y, angle, segment} or null if check fails.
 */
export function wasmGetCenterAnchor(
    line: Point[],
    maxAngle: number,
    labelLength: number,
    angleWindowSize: number,
): {x: number; y: number; angle: number; segment: number} | null {
    const mod = getWasmModule();
    if (!mod) return null;
    const flat = flattenLineToInt32(line);
    const result = mod.get_center_anchor(flat, maxAngle, labelLength, angleWindowSize);
    if (result.length === 0) return null;
    return {
        x: result[0],
        y: result[1],
        angle: result[2],
        segment: result[3]
    };
}

// ── Intersection test wrappers ──────────────────────────────────────

/**
 * Pack polygonA + polygonB into `[lenA, ...A, ...B]` format for WASM.
 */
function packTwoPolygons(a: Point[], b: Point[]): Int32Array {
    const arr = new Int32Array(1 + a.length * 2 + b.length * 2);
    arr[0] = a.length * 2;
    let off = 1;
    for (let i = 0; i < a.length; i++) {
        arr[off++] = a[i].x;
        arr[off++] = a[i].y;
    }
    for (let i = 0; i < b.length; i++) {
        arr[off++] = b[i].x;
        arr[off++] = b[i].y;
    }
    return arr;
}

/**
 * Pack polygon + multi-ring data into `[lenPolygon, ...polygon, RING_SEP-separated rings...]`
 */
function packPolygonAndRings(polygon: Point[], rings: Point[][]): Int32Array {
    let ringsLen = 0;
    for (let i = 0; i < rings.length; i++) {
        if (i > 0) ringsLen++;
        ringsLen += rings[i].length * 2;
    }
    const arr = new Int32Array(1 + polygon.length * 2 + ringsLen);
    arr[0] = polygon.length * 2;
    let off = 1;
    for (let i = 0; i < polygon.length; i++) {
        arr[off++] = polygon[i].x;
        arr[off++] = polygon[i].y;
    }
    for (let i = 0; i < rings.length; i++) {
        if (i > 0) arr[off++] = RING_SEP;
        const ring = rings[i];
        for (let j = 0; j < ring.length; j++) {
            arr[off++] = ring[j].x;
            arr[off++] = ring[j].y;
        }
    }
    return arr;
}

export function wasmPolygonIntersectsPolygon(polygonA: Point[], polygonB: Point[]): boolean {
    const mod = getWasmModule();
    if (!mod) return false;
    return mod.polygon_intersects_polygon(packTwoPolygons(polygonA, polygonB));
}

export function wasmPolygonIntersectsBufferedPoint(polygon: Point[], point: Point, radius: number): boolean {
    const mod = getWasmModule();
    if (!mod) return false;
    return mod.polygon_intersects_buffered_point(flattenLineToInt32(polygon), point.x, point.y, radius);
}

export function wasmPolygonIntersectsMultiPolygon(polygon: Point[], multiPolygon: Point[][]): boolean {
    const mod = getWasmModule();
    if (!mod) return false;
    return mod.polygon_intersects_multi_polygon(packPolygonAndRings(polygon, multiPolygon));
}

export function wasmPolygonIntersectsBufferedMultiLine(polygon: Point[], multiLine: Point[][], radius: number): boolean {
    const mod = getWasmModule();
    if (!mod) return false;
    return mod.polygon_intersects_buffered_multi_line(packPolygonAndRings(polygon, multiLine), radius);
}

export function wasmPolygonIntersectsBox(ring: Point[], x1: number, y1: number, x2: number, y2: number): boolean {
    const mod = getWasmModule();
    if (!mod) return false;
    return mod.polygon_intersects_box(flattenLineToInt32(ring), x1, y1, x2, y2);
}

export function wasmDistToSegmentSquared(p: Point, v: Point, w: Point): number {
    const mod = getWasmModule();
    if (!mod) return Infinity;
    return mod.wasm_dist_to_segment_squared(p.x, p.y, v.x, v.y, w.x, w.y);
}

// ── subdivideVertexLine wrapper ─────────────────────────────────────

export function wasmSubdivideVertexLine(line: Point[], granularity: number, extent: number, isRing: boolean): Point[] {
    const mod = getWasmModule();
    if (!mod) return [];
    const flat = flattenLineToInt32(line);
    const result = mod.subdivide_vertex_line(flat, granularity, extent, isRing);
    const points: Point[] = [];
    for (let i = 0; i < result.length; i += 2) {
        points.push(new Point(result[i], result[i + 1]));
    }
    return points;
}

// ── findLineIntersection wrapper ────────────────────────────────────

export function wasmFindLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
    const mod = getWasmModule();
    if (!mod) return null;
    const result = mod.find_line_intersection(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
    if (result.length === 0) return null;
    return new Point(result[0], result[1]);
}

// ── Mercator coordinate wrappers ────────────────────────────────────

export function wasmMercatorXfromLng(lng: number): number {
    const mod = getWasmModule();
    return mod ? mod.mercator_x_from_lng(lng) : (180 + lng) / 360;
}

export function wasmMercatorYfromLat(lat: number): number {
    const mod = getWasmModule();
    return mod ? mod.mercator_y_from_lat(lat) : (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
}

export function wasmLngFromMercatorX(x: number): number {
    const mod = getWasmModule();
    return mod ? mod.lng_from_mercator_x(x) : x * 360 - 180;
}

export function wasmLatFromMercatorY(y: number): number {
    const mod = getWasmModule();
    return mod ? mod.lat_from_mercator_y(y) : 360 / Math.PI * Math.atan(Math.exp((180 - y * 360) * Math.PI / 180)) - 90;
}

export function wasmMercatorZfromAltitude(altitude: number, lat: number): number {
    const mod = getWasmModule();
    return mod ? mod.mercator_z_from_altitude(altitude, lat) : altitude / (2 * Math.PI * 6371008.8 * Math.cos(lat * Math.PI / 180));
}

export function wasmAltitudeFromMercatorZ(z: number, y: number): number {
    const mod = getWasmModule();
    if (!mod) {
        const lat = 360 / Math.PI * Math.atan(Math.exp((180 - y * 360) * Math.PI / 180)) - 90;
        return z * 2 * Math.PI * 6371008.8 * Math.cos(lat * Math.PI / 180);
    }
    return mod.altitude_from_mercator_z(z, y);
}

export function wasmMercatorScale(lat: number): number {
    const mod = getWasmModule();
    return mod ? mod.mercator_scale(lat) : 1 / Math.cos(lat * Math.PI / 180);
}

// ── Batch projection ─────────────────────────────────────────────

/**
 * Batch-project N points through xyTransformMat4 + viewport transform.
 *
 * Replaces N individual `projectAndGetPerspectiveRatio` calls with one
 * WASM call — amortizes FFI overhead and eliminates JS allocations.
 *
 * @param mat Column-major 4×4 matrix (16 numbers)
 * @param points Flat array [x0,y0, x1,y1, ...] (N points)
 * @param width Viewport width
 * @param height Viewport height
 * @param padding Viewport padding
 * @param cameraToCenterDistance For perspectiveRatio computation
 * @returns Array of {x, y, perspectiveRatio, signedDistanceFromCamera} per point
 */
export function wasmProjectBatch(
    mat: Float64Array | number[],
    points: Float64Array | number[],
    width: number,
    height: number,
    padding: number,
    cameraToCenterDistance: number,
): Array<{x: number; y: number; perspectiveRatio: number; isOccluded: boolean; signedDistanceFromCamera: number}> {
    const mod = getWasmModule();
    if (!mod) return [];

    const matArr = mat instanceof Float64Array ? mat : new Float64Array(mat);
    const ptsArr = points instanceof Float64Array ? points : new Float64Array(points);
    const result = mod.project_batch(matArr, ptsArr, width, height, padding, cameraToCenterDistance);

    const out: Array<{x: number; y: number; perspectiveRatio: number; isOccluded: boolean; signedDistanceFromCamera: number}> = [];
    for (let i = 0; i < result.length; i += 4) {
        out.push({
            x: result[i],
            y: result[i + 1],
            perspectiveRatio: result[i + 2],
            isOccluded: false,
            signedDistanceFromCamera: result[i + 3]
        });
    }
    return out;
}

// ── WASM GridIndex wrapper ──────────────────────────────────────────

import type {OverlapMode} from '../style/style_layer/overlap_mode';

function overlapToU8(mode: OverlapMode): number {
    if (mode === 'never') return 0;
    if (mode === 'always') return 1;
    return 2; // cooperative
}

export type WasmGridKey = {
    bucketInstanceId: number;
    featureIndex: number;
    collisionGroupID: number;
    overlapMode: OverlapMode;
};

type WasmGridQueryResult = {
    key: WasmGridKey;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

/**
 * WASM-backed GridIndex that mirrors the JS GridIndex<FeatureKey> interface
 * used by CollisionIndex. Stores collision geometry in WASM for fast hit testing,
 * while keeping a JS-side key map for queryRenderedSymbols.
 */
export class WasmCollisionGrid {
    private _inner: WasmGridIndexInstance;
    private _boxKeys: WasmGridKey[] = [];
    private _circleKeys: WasmGridKey[] = [];

    constructor(width: number, height: number, cellSize: number) {
        const mod = getWasmModule();
        this._inner = new mod.WasmGridIndex(width, height, cellSize);
    }

    keysLength(): number {
        return this._inner.keys_length();
    }

    insert(key: WasmGridKey, x1: number, y1: number, x2: number, y2: number) {
        this._inner.insert(overlapToU8(key.overlapMode), key.collisionGroupID, x1, y1, x2, y2);
        this._boxKeys.push(key);
    }

    insertCircle(key: WasmGridKey, x: number, y: number, radius: number) {
        this._inner.insert_circle(overlapToU8(key.overlapMode), key.collisionGroupID, x, y, radius);
        this._circleKeys.push(key);
    }

    hitTest(x1: number, y1: number, x2: number, y2: number, overlapMode: OverlapMode, predicate?: (key: WasmGridKey) => boolean): boolean {
        // If there's a predicate, extract the group ID it filters on
        const filterGroupId = predicate ? this.extractGroupId(predicate) : -1;
        return this._inner.hit_test(x1, y1, x2, y2, overlapToU8(overlapMode), filterGroupId);
    }

    hitTestCircle(x: number, y: number, radius: number, overlapMode: OverlapMode, predicate?: (key: WasmGridKey) => boolean): boolean {
        const filterGroupId = predicate ? this.extractGroupId(predicate) : -1;
        return this._inner.hit_test_circle(x, y, radius, overlapToU8(overlapMode), filterGroupId);
    }

    placeCollisionBox(
        anchorX: number, anchorY: number,
        boxX1: number, boxY1: number, boxX2: number, boxY2: number,
        shiftX: number, shiftY: number,
        posMatrix: Float64Array,
        textPixelRatio: number,
        viewportWidth: number, viewportHeight: number,
        viewportPadding: number,
        cameraToCenterDist: number,
        perspectiveRatioCutoff: number,
        screenRightBoundary: number, screenBottomBoundary: number,
        gridRightBoundary: number, gridBottomBoundary: number,
        overlapMode: OverlapMode, filterGroupId: number,
    ): Float64Array {
        return this._inner.place_collision_box(
            anchorX, anchorY,
            boxX1, boxY1, boxX2, boxY2,
            shiftX, shiftY,
            posMatrix,
            textPixelRatio,
            viewportWidth, viewportHeight,
            viewportPadding, cameraToCenterDist, perspectiveRatioCutoff,
            screenRightBoundary, screenBottomBoundary,
            gridRightBoundary, gridBottomBoundary,
            overlapToU8(overlapMode), filterGroupId,
        );
    }

    query(x1: number, y1: number, x2: number, y2: number): WasmGridQueryResult[] {
        const keyIds = this._inner.query(x1, y1, x2, y2);
        const numBoxes = this._boxKeys.length;
        const results: WasmGridQueryResult[] = [];
        for (let i = 0; i < keyIds.length; i++) {
            const id = keyIds[i];
            if (id < numBoxes) {
                const key = this._boxKeys[id];
                results.push({key, x1: 0, y1: 0, x2: 0, y2: 0}); // bbox not needed for queryRenderedSymbols
            } else {
                const key = this._circleKeys[id - numBoxes];
                results.push({key, x1: 0, y1: 0, x2: 0, y2: 0});
            }
        }
        return results;
    }

    /**
     * The predicate in collision detection is always
     * `(key) => key.collisionGroupID === expectedGroupID`.
     * We can't pass a JS closure to WASM, but we CAN call it once
     * with a probe key to discover the expected group ID.
     */
    extractGroupId(predicate: (key: WasmGridKey) => boolean): number {
        // Try common group IDs
        for (let id = 0; id < 256; id++) {
            const probeKey: WasmGridKey = {
                bucketInstanceId: 0,
                featureIndex: 0,
                collisionGroupID: id,
                overlapMode: 'never'
            };
            if (predicate(probeKey)) return id;
        }
        return -1; // No filter if we can't determine it
    }
}

// ── compute_icon_quads ──────────────────────────────────────────────

export function wasmComputeIconQuads(
    top: number, right: number, bottom: number, left: number,
    iconRotate: number
): {tl: Point; tr: Point; bl: Point; br: Point} {
    const mod = getWasmModule();
    if (!mod) {
        return {
            tl: new Point(left, top),
            tr: new Point(right, top),
            bl: new Point(left, bottom),
            br: new Point(right, bottom)
        };
    }
    const result = mod.compute_icon_quads(top, right, bottom, left, iconRotate);
    return {
        tl: new Point(result[0], result[1]),
        tr: new Point(result[2], result[3]),
        bl: new Point(result[4], result[5]),
        br: new Point(result[6], result[7])
    };
}

// ── batch_path_lerp ─────────────────────────────────────────────────

export function wasmBatchPathLerp(
    points: Point[],
    distances: number[],
    tValues: number[],
    padding: number
): Point[] {
    const mod = getWasmModule();
    if (!mod) return [];

    const flatPoints = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
        flatPoints[i * 2] = points[i].x;
        flatPoints[i * 2 + 1] = points[i].y;
    }

    const result = mod.batch_path_lerp(
        flatPoints,
        new Float64Array(distances),
        new Float64Array(tValues),
        padding
    );

    const out: Point[] = [];
    for (let i = 0; i < result.length; i += 2) {
        out.push(new Point(result[i], result[i + 1]));
    }
    return out;
}

// ── Generate collision circles (raw WASM call) ─────────────────────

/**
 * WASM-accelerated collision circle generation.
 * Replaces the geometry computation in placeCollisionCircles (steps 1-6).
 *
 * Returns { perspectiveRatio, circles: [cx, cy, r, ...] } or null if WASM
 * is unavailable or placement fails.
 */
export function wasmGenerateCollisionCircles(
    symbolData: Float64Array,
    lineVertices: Float64Array,
    glyphOffsets: Float64Array,
    labelPlaneMatrix: Float64Array,
    labelPlaneMatrixInverse: Float64Array,
    posMatrix: Float64Array,
    fontSize: number,
    cameraToCenterDist: number,
    pitchWithMap: boolean,
    viewportWidth: number,
    viewportHeight: number,
    circlePixelDiameter: number,
    textPixelPadding: number,
    translationX: number,
    translationY: number,
    screenRightBoundary: number,
    screenBottomBoundary: number,
    viewportPadding: number,
): {perspectiveRatio: number; circles: number[]} | null {
    const mod = getWasmModule();
    if (!mod) return null;

    const result = mod.generate_collision_circles(
        symbolData, lineVertices, glyphOffsets,
        labelPlaneMatrix, labelPlaneMatrixInverse, posMatrix,
        fontSize, cameraToCenterDist, pitchWithMap,
        viewportWidth, viewportHeight,
        circlePixelDiameter, textPixelPadding,
        translationX, translationY,
        screenRightBoundary, screenBottomBoundary, viewportPadding,
    );

    if (result.length === 0) {
        return null; // Placement failed
    }

    if (result.length === 1 && result[0] < 0) {
        return null; // Behind camera
    }

    const perspectiveRatio = result[0];
    const numCircles = result[1];
    // Circles are packed as [cx, cy, r, ...] starting at index 2
    // We need to output them as [cx, cy, r, 0, ...] (4 values per circle)
    // to match the format expected by the collision detection loop
    const circles: number[] = [];
    for (let i = 0; i < numCircles; i++) {
        const base = 2 + i * 3;
        circles.push(result[base], result[base + 1], result[base + 2], 0);
    }

    return {perspectiveRatio, circles};
}

// ── Batch update line labels (raw WASM call) ────────────────────────

/**
 * Raw WASM call for batch line label update.
 * Returns Float64Array of [x, y, angle, ...] per glyph (3 values per glyph),
 * or null if WASM is not available.
 * Hidden glyphs have [-Infinity, -Infinity, 0].
 */
export function wasmBatchUpdateLineLabelsRaw(
    symbolData: Float64Array,
    lineVertices: Float64Array,
    glyphOffsets: Float64Array,
    projMatrix: Float64Array,
    projMatrixInverse: Float64Array,
    posMatrix: Float64Array,
    sizeData: Float64Array,
    cameraToCenterDist: number,
    pitchWithMap: boolean,
    keepUpright: boolean,
    rotateToLine: boolean,
    viewportWidth: number,
    viewportHeight: number,
    aspectRatio: number,
    translationX: number,
    translationY: number,
    clipX: number,
    clipY: number,
): Float64Array | null {
    const mod = getWasmModule();
    if (!mod) return null;
    return mod.batch_update_line_labels(
        symbolData, lineVertices, glyphOffsets,
        projMatrix, projMatrixInverse, posMatrix, sizeData,
        cameraToCenterDist, pitchWithMap, keepUpright, rotateToLine,
        viewportWidth, viewportHeight, aspectRatio,
        translationX, translationY, clipX, clipY,
    );
}

// ── Batch variable anchor update (raw WASM call) ────────────────────

/**
 * Raw WASM call for batch variable anchor update.
 * Returns Float64Array of [shiftedX, shiftedY, angle, ...] per symbol,
 * or null if WASM is not available.
 */
export function wasmBatchVariableAnchorUpdateRaw(
    symbolData: Float64Array,
    offsetData: Float64Array,
    posMatArr: Float64Array,
    labelMatArr: Float64Array,
    sizeArr: Float64Array,
    cameraToCenterDistance: number,
    pitchWithMap: boolean,
    rotateWithMap: boolean,
    bearing: number,
    tilePixelRatio: number,
    tileScale: number,
    viewportWidth: number,
    viewportHeight: number,
    oneEm: number,
    allowVerticalPlacement: boolean,
): Float64Array | null {
    const mod = getWasmModule();
    if (!mod) return null;
    return mod.batch_variable_anchor_update(
        symbolData, offsetData, posMatArr, labelMatArr, sizeArr,
        cameraToCenterDistance, pitchWithMap, rotateWithMap, bearing,
        tilePixelRatio, tileScale, viewportWidth, viewportHeight,
        oneEm, allowVerticalPlacement,
    );
}
