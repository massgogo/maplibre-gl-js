/**
 * WASM-based MVT decoder — replaces @mapbox/vector-tile + pbf.
 *
 * Uses planetiler-wasm (Rust compiled to WASM) to decode MVT protobuf
 * bytes into VectorTileLike structures compatible with maplibre's pipeline.
 */

import Point from '@mapbox/point-geometry';
import type {VectorTileFeatureLike, VectorTileLayerLike, VectorTileLike} from '@maplibre/vt-pbf';

// ── WASM module state ──────────────────────────────────────────────

let wasmModule: {decode_tile: (data: Uint8Array) => string} | null = null;
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

    constructor(rawData: ArrayBuffer) {
        if (!wasmModule) {
            throw new Error('WASM decoder not initialized. Call initWasmDecoder() first.');
        }

        const data = new Uint8Array(rawData);
        const jsonStr = wasmModule.decode_tile(data);
        const decoded: DecodedTileJSON = JSON.parse(jsonStr);

        for (const [name, layer] of Object.entries(decoded.layers)) {
            this.layers[name] = new WasmVectorTileLayer(layer);
        }
    }
}
