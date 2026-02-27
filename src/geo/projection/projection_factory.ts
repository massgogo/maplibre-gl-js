import {warnOnce} from '../../util/util';
import {MercatorProjection} from './mercator_projection';
import {MercatorTransform} from './mercator_transform';
import {MercatorCameraHelper} from './mercator_camera_helper';

import type {ProjectionSpecification} from '@maplibre/maplibre-gl-style-spec';
import type {Projection} from './projection';
import type {ITransform, TransformConstrainFunction} from '../transform_interface';
import type {ICameraHelper} from './camera_helper';

export function createProjectionFromName(name: ProjectionSpecification['type'], transformConstrain?: TransformConstrainFunction): {
    projection: Projection;
    transform: ITransform;
    cameraHelper: ICameraHelper;
} {
    const transformOptions = {constrainOverride: transformConstrain};
    switch (typeof name === 'string' ? name : 'mercator') {
        case 'mercator':
        default:
        {
            if (typeof name === 'string' && name !== 'mercator') {
                warnOnce(`Unknown or unsupported projection name: ${name}. Falling back to mercator projection.`);
            }
            return {
                projection: new MercatorProjection(),
                transform: new MercatorTransform(transformOptions),
                cameraHelper: new MercatorCameraHelper(),
            };
        }
    }
}
