// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2023  kurgm
// Rendered stroke geometry: either the legacy Polygons (polyline fallback)
// or bezier path data from the kage-cpp WASM engine.

import { Polygons } from '@kurgm/kage-engine';

import { StrokePaths } from '../kageCpp';

export interface StrokeComponentProps {
  polygons?: Polygons;
  strokePaths?: StrokePaths;
  className?: string;
}

const StrokeComponent = (props: StrokeComponentProps) => (
  props.strokePaths
    ? (
      <>
        {props.strokePaths.map((contour, i) => (
          <path
            key={i}
            d={contour.d}
            fillRule="nonzero"
            className={props.className}
          />
        ))}
      </>
    )
    : (
      <>
        {props.polygons!.array.map((polygon, i) => (
          <polygon
            key={i}
            className={props.className}
            points={polygon.array.map(({ x, y }) => `${x},${y} `).join("")}
          />
        ))}
      </>
    )
);

export default StrokeComponent;
