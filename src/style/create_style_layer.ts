import {CircleStyleLayer} from './style_layer/circle_style_layer';
import {FillStyleLayer} from './style_layer/fill_style_layer';
import {LineStyleLayer} from './style_layer/line_style_layer';
import {SymbolStyleLayer} from './style_layer/symbol_style_layer';
import {BackgroundStyleLayer} from './style_layer/background_style_layer';

import type {LayerSpecification} from '@maplibre/maplibre-gl-style-spec';

export function createStyleLayer(layer: LayerSpecification, globalState: Record<string, any>) {
    switch (layer.type) {
        case 'background':
            return new BackgroundStyleLayer(layer, globalState);
        case 'circle':
            return new CircleStyleLayer(layer, globalState);
        case 'fill':
            return new FillStyleLayer(layer, globalState);
        case 'line':
            return new LineStyleLayer(layer, globalState);
        case 'symbol':
            return new SymbolStyleLayer(layer, globalState);
    }
}
