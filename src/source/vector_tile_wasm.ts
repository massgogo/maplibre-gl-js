/**
 * WASM-based MVT decoder — replaces @mapbox/vector-tile + pbf.
 *
 * Uses planetiler-wasm (Rust compiled to WASM) to decode MVT protobuf
 * bytes into VectorTileLike structures compatible with maplibre's pipeline.
 */

import Point from '@mapbox/point-geometry';
import type {VectorTileFeatureLike, VectorTileLayerLike, VectorTileLike} from '@maplibre/vt-pbf';

// ── WASM module state ──────────────────────────────────────────────

let wasmModule: {
    decode_tile: (data: Uint8Array) => string;
    set_generation: (gen: number) => void;
    get_generation: () => number;
    decode_tile_gen: (gen: number, z: number, x: number, y: number, data: Uint8Array) => string;
    clip_line: (coords: Int32Array, x1: number, y1: number, x2: number, y2: number) => Int32Array;
    clip_geometry: (coords: Int32Array, geom_type: number, x1: number, y1: number, x2: number, y2: number) => Int32Array;
    find_pole_of_inaccessibility: (coords: Int32Array, precision: number) => Float64Array;
    get_anchors: (coords: Int32Array, spacing: number, max_angle: number, shaped_label_length: number, angle_window_size: number, box_scale: number, overscaling: number, tile_extent: number, glyph_size: number, is_line_continued: boolean) => Float64Array;
    get_center_anchor: (coords: Int32Array, max_angle: number, label_length: number, angle_window_size: number) => Float64Array;
    polygon_intersects_polygon: (data: Int32Array) => boolean;
    polygon_intersects_buffered_point: (polygon: Int32Array, px: number, py: number, radius: number) => boolean;
    polygon_intersects_multi_polygon: (data: Int32Array) => boolean;
    polygon_intersects_buffered_multi_line: (data: Int32Array, radius: number) => boolean;
    polygon_intersects_box: (ring: Int32Array, x1: number, y1: number, x2: number, y2: number) => boolean;
    wasm_dist_to_segment_squared: (px: number, py: number, vx: number, vy: number, wx: number, wy: number) => number;
    subdivide_vertex_line: (coords: Int32Array, granularity: number, extent: number, is_ring: boolean) => Int32Array;
    find_line_intersection: (a1x: number, a1y: number, a2x: number, a2y: number, b1x: number, b1y: number, b2x: number, b2y: number) => Float64Array;
    mercator_x_from_lng: (lng: number) => number;
    mercator_y_from_lat: (lat: number) => number;
    lng_from_mercator_x: (x: number) => number;
    lat_from_mercator_y: (y: number) => number;
    mercator_z_from_altitude: (altitude: number, lat: number) => number;
    altitude_from_mercator_z: (z: number, y: number) => number;
    mercator_scale: (lat: number) => number;
    project_batch: (mat: Float64Array, points: Float64Array, width: number, height: number, padding: number, cameraToCenterDistance: number) => Float64Array;
    compute_icon_quads: (top: number, right: number, bottom: number, left: number, icon_rotate: number) => Float64Array;
    batch_path_lerp: (points: Float64Array, distances: Float64Array, t_values: Float64Array, padding: number) => Float64Array;
    WasmGridIndex: {
        new(width: number, height: number, cell_size: number): WasmGridIndexInstance;
    };
} | null = null;

/** Instance type for the WASM GridIndex class */
export interface WasmGridIndexInstance {
    insert(overlap_mode: number, group_id: number, x1: number, y1: number, x2: number, y2: number): number;
    insert_circle(overlap_mode: number, group_id: number, x: number, y: number, radius: number): number;
    hit_test(x1: number, y1: number, x2: number, y2: number, overlap_mode: number, filter_group_id: number): boolean;
    hit_test_circle(x: number, y: number, radius: number, overlap_mode: number, filter_group_id: number): boolean;
    query(x1: number, y1: number, x2: number, y2: number): Uint32Array;
    keys_length(): number;
    free(): void;
}

/** Expose WASM module to wasm_geometry.ts without creating circular imports. */
export function getWasmModule() { return wasmModule; }
let wasmInitPromise: Promise<void> | null = null;

/**
 * Initialize the WASM decoder. Safe to call multiple times — only the
 * first invocation actually loads; subsequent calls return the cached promise.
 */
export function initWasmDecoder(baseUrl: string): Promise<void> {
    if (wasmInitPromise) return wasmInitPromise;
    wasmInitPromise = (async () => {
        const mod = await import(/* webpackIgnore: true */ `${baseUrl}/planetiler_wasm.js`);
        await mod.default(`${baseUrl}/planetiler_wasm_bg.wasm`);
        wasmModule = mod;
    })();
    return wasmInitPromise;
}

/**
 * Returns true if the WASM module has been loaded and is ready to use.
 */
export function isWasmReady(): boolean {
    return wasmModule !== null;
}

/**
 * Set the current generation in the WASM scheduler.
 * When generation changes, all cached decoded tiles are dropped instantly.
 */
export function setGeneration(gen: number): void {
    if (wasmModule) wasmModule.set_generation(gen);
}

/**
 * Get the current generation from the WASM scheduler.
 */
export function getGeneration(): number {
    if (!wasmModule) return 0;
    return wasmModule.get_generation();
}

// ── Decoded tile JSON shape (matches Rust decode_tile output) ──────

interface DecodedFeatureJSON {
    type: number;
    id?: number;
    properties: Record<string, number | string | boolean>;
    geometry: number[][][];  // rings of [x, y] pairs
}

interface DecodedLayerJSON {
    version: number;
    name: string;
    extent: number;
    length: number;
    features: DecodedFeatureJSON[];
}

interface DecodedTileJSON {
    layers: Record<string, DecodedLayerJSON>;
}

// ── VectorTileFeatureLike implementation ───────────────────────────

class WasmVectorTileFeature implements VectorTileFeatureLike {
    type: 0 | 1 | 2 | 3;
    properties: Record<string, number | string | boolean>;
    id: number | undefined;
    extent: number;
    private _geometry: number[][][];

    constructor(feat: DecodedFeatureJSON, extent: number) {
        this.type = feat.type as 0 | 1 | 2 | 3;
        this.properties = feat.properties || {};
        this.id = feat.id;
        this.extent = extent;
        this._geometry = feat.geometry;
    }

    loadGeometry(): Point[][] {
        return this._geometry.map(ring =>
            ring.map(coord => new Point(coord[0], coord[1]))
        );
    }
}

// ── VectorTileLayerLike implementation ─────────────────────────────

class WasmVectorTileLayer implements VectorTileLayerLike {
    version: number;
    name: string;
    extent: number;
    length: number;
    private _features: DecodedFeatureJSON[];

    constructor(layer: DecodedLayerJSON) {
        this.version = layer.version;
        this.name = layer.name;
        this.extent = layer.extent;
        this.length = layer.length;
        this._features = layer.features;
    }

    feature(i: number): VectorTileFeatureLike {
        return new WasmVectorTileFeature(this._features[i], this.extent);
    }
}

// ── VectorTileLike implementation ──────────────────────────────────

export class WasmVectorTile implements VectorTileLike {
    layers: Record<string, VectorTileLayerLike> = {};
    private _stale: boolean = false;

    /**
     * Decode an MVT tile from raw protobuf bytes.
     *
     * When `generation`, `z`, `x`, `y` are provided, uses the generation-aware
     * scheduler: if the generation is stale, returns an empty (stale) tile
     * without doing any decode work.
     */
    constructor(rawData: ArrayBuffer, generation?: number, z?: number, x?: number, y?: number) {
        if (!wasmModule) {
            throw new Error('WASM decoder not initialized. Call initWasmDecoder() first.');
        }

        const data = new Uint8Array(rawData);
        let jsonStr: string;

        if (generation !== undefined && z !== undefined && x !== undefined && y !== undefined) {
            jsonStr = wasmModule.decode_tile_gen(generation, z, x, y, data);
            if (!jsonStr || jsonStr.length === 0) {
                this._stale = true;
                return;
            }
        } else {
            jsonStr = wasmModule.decode_tile(data);
        }

        const decoded: DecodedTileJSON = JSON.parse(jsonStr);
        for (const [name, layer] of Object.entries(decoded.layers)) {
            this.layers[name] = new WasmVectorTileLayer(layer);
        }
    }

    /**
     * Returns true if this tile was decoded for a stale generation
     * and should be skipped by the parse pipeline.
     */
    isEmpty(): boolean {
        return this._stale;
    }
}

