// Prague's obec (municipality) code in RÚIAN.
const PRAGUE_OBEC_CODE = 554782;

export const SOURCES = {
  zps: "https://hub.arcgis.com/api/v3/datasets/8e3420ecc539468489101958689a3cd9_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
  letni:
    "https://hub.arcgis.com/api/v3/datasets/98b5292d85404383a6b5d526fa0e752c_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
  // ČÚZK's RÚIAN "Ulice" layer: nationwide street centerlines, filtered to Prague and to
  // segments that actually carry a name (unnamed service ways aren't useful to show).
  streets: `https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/4/query?f=geojson&outFields=nazev&returnGeometry=true&where=${encodeURIComponent(`obec=${PRAGUE_OBEC_CODE} AND nazev IS NOT NULL`)}`,
} as const;

export type SourceName = keyof typeof SOURCES;
