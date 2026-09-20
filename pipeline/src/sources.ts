export const SOURCES = {
  zps: "https://hub.arcgis.com/api/v3/datasets/8e3420ecc539468489101958689a3cd9_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
  letni:
    "https://hub.arcgis.com/api/v3/datasets/98b5292d85404383a6b5d526fa0e752c_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
  zimni:
    "https://hub.arcgis.com/api/v3/datasets/e7f57fda3ad341199f1b254abd1d1b13_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
} as const;

export type SourceName = keyof typeof SOURCES;
