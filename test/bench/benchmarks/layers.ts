
import Benchmark from '../lib/benchmark';
import createMap from '../lib/create_map';
import style from '../data/empty.json' with {type: 'json'};

const width = 1024;
const height = 768;
const layerCount = 50;

function generateLayers(layer) {
    const generated = [];
    for (let i = 0; i < layerCount; i++) {
        const id = layer.id + i;
        generated.push(Object.assign({}, layer, {id}));
    }
    return generated;
}

export class LayerBenchmark extends Benchmark {

    layerStyle: any;
    map: any;

    async setup() {
        try {
            this.map = await createMap({
                zoom: 16,
                width,
                height,
                center: [-77.032194, 38.912753],
                style: this.layerStyle
            });
        } catch (error) {
            console.error(error);
        }
    }

    bench() {
        this.map._render();
    }

    teardown() {
        this.map.remove();
    }
}

export class LayerBackground extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                id: 'backgroundlayer',
                type: 'background'
            })
        });
    }
}

export class LayerCircle extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'circlelayer',
                'type': 'circle',
                'source': 'openmaptiles',
                'source-layer': 'poi'
            })
        });
    }
}

export class LayerFill extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'filllayer',
                'type': 'fill',
                'source': 'openmaptiles',
                'source-layer': 'building',
                'paint': {
                    'fill-color': 'black',
                    'fill-outline-color': 'red'
                }
            })
        });
    }
}

export class LayerLine extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'linelayer',
                'type': 'line',
                'source': 'openmaptiles',
                'source-layer': 'transportation'
            })
        });
    }
}

export class LayerSymbol extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'symbollayer',
                'type': 'symbol',
                'source': 'openmaptiles',
                'source-layer': 'poi',
                'layout': {
                    'icon-image': 'dot_11',
                    'text-field': '{name_en}'
                }
            })
        });
    }
}

export class LayerSymbolWithIcons extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'symbollayer',
                'type': 'symbol',
                'source': 'openmaptiles',
                'source-layer': 'poi',
                'layout': {
                    'icon-image': 'dot_11',
                    'text-field': ['format', ['get', 'name_en'], ['image', 'dot_11']]
                }
            })
        });
    }
}

export class LayerSymbolWithSortKey extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: this.generateSortKeyLayers()
        });
    }

    generateSortKeyLayers() {
        const generated = [];
        for (let i = 0; i < layerCount; i++) {
            generated.push({
                'id': `symbollayer${i}`,
                'type': 'symbol',
                'source': 'openmaptiles',
                'source-layer': 'poi',
                'layout': {
                    'symbol-sort-key': i,
                    'text-field': '{name_en}'
                }
            });
        }
        return generated;
    }
}

export class LayerTextWithVariableAnchor extends LayerBenchmark {
    constructor() {
        super();

        this.layerStyle = Object.assign({}, style, {
            layers: generateLayers({
                'id': 'symbollayer',
                'type': 'symbol',
                'source': 'openmaptiles',
                'source-layer': 'poi',
                'layout': {
                    'text-field': 'Test Test Test',
                    'text-justify': 'auto',
                    'text-variable-anchor': [
                        'center',
                        'top',
                        'bottom',
                        'left',
                        'right',
                        'top-left',
                        'top-right',
                        'bottom-left',
                        'bottom-right'
                    ]
                }
            })
        });
    }
}
