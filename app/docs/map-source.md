# Saudi map source inspection

The exact Saudi outline is pending an approved vector source. It has not been approximated in the interface.

## Reference

The agreed [GEOSA source page](https://geoportal.geosa.gov.sa/Geoportal/GeospatialOpenData/OfficialSaudiMap) links to [GEOSA_2m_Arabic.zip](https://apps.geoportal.sa/PDFs/saudi_map/GEOSA_2m_Arabic.zip).

## Recorded inspection — 2026-10-04

The archive contained `2_Million_AR.pdf`, a one-page map with two raster images, two non-geographic drawing paths, and no usable vector boundary or text layers. The printed map includes terrain, roads, labels, and neighboring countries. Extracting a clean country outline would require interpretation and would not meet the requested 1:1 source fidelity.

PDF SHA-256: `249c2c5765a4d4be2d1983348d92f103e23073a55703adec0abb999437c36cbe`.

## Completion requirements

Provide an approved SVG outline or an authoritative vector boundary dataset with its projection. Preserve the original geometry and represented islands, validate against the official reference, and pass the resulting local asset into `MapPlaceholder` using its `outlineSrc` prop.
