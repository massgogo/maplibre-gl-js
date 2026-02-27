import {
    wasmPolygonIntersectsPolygon,
    wasmPolygonIntersectsBufferedPoint,
    wasmPolygonIntersectsMultiPolygon,
    wasmPolygonIntersectsBufferedMultiLine,
    wasmPolygonIntersectsBox,
    wasmDistToSegmentSquared
} from '../symbol/wasm_geometry';

import Point from '@mapbox/point-geometry';

export {polygonIntersectsBufferedPoint, polygonIntersectsMultiPolygon, polygonIntersectsBufferedMultiLine, polygonIntersectsPolygon, distToSegmentSquared, polygonIntersectsBox};

type Ring = Array<Point>;
type Polygon = Array<Point>;

function polygonIntersectsPolygon(polygonA: Polygon, polygonB: Polygon) {
    return wasmPolygonIntersectsPolygon(polygonA, polygonB);
}

function polygonIntersectsBufferedPoint(polygon: Polygon, point: Point, radius: number) {
    return wasmPolygonIntersectsBufferedPoint(polygon, point, radius);
}

function polygonIntersectsMultiPolygon(polygon: Polygon, multiPolygon: Array<Polygon>) {
    return wasmPolygonIntersectsMultiPolygon(polygon, multiPolygon);
}

function polygonIntersectsBufferedMultiLine(polygon: Polygon, multiLine: Array<Array<Point>>, radius: number) {
    return wasmPolygonIntersectsBufferedMultiLine(polygon, multiLine, radius);
}

// Code from https://stackoverflow.com/a/1501725/331379.
function distToSegmentSquared(p: Point, v: Point, w: Point) {
    return wasmDistToSegmentSquared(p, v, w);
}

function polygonIntersectsBox(ring: Ring, boxX1: number, boxY1: number, boxX2: number, boxY2: number) {
    return wasmPolygonIntersectsBox(ring, boxX1, boxY1, boxX2, boxY2);
}
