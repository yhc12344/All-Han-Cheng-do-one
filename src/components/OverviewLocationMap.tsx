import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import type { RecordPoint } from "../types";
import type { MapStyle } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTranslation } from "../lib/i18n";

type Props = {
  records: RecordPoint[];
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;
};

type BaseMapInfo = { label: string; tileUrl: string; attribution: string };

const BASEMAPS: Record<"light" | "dark" | "openstreet" | "topo" | "satellite", BaseMapInfo> = {
  light: {
    label: "Light",
    tileUrl: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: "(c) OpenStreetMap contributors (c) CARTO",
  },
  openstreet: {
    label: "OpenStreet",
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "(c) OpenStreetMap contributors",
  },
  topo: {
    label: "Topo",
    tileUrl: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "(c) OpenStreetMap contributors, SRTM | OpenTopoMap",
  },
  satellite: {
    label: "Satellite",
    tileUrl: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles (c) Esri, Maxar, Earthstar Geographics",
  },
  dark: {
    label: "Dark",
    tileUrl: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: "(c) OpenStreetMap contributors (c) CARTO",
  },
};

export const MAP_THEMES = {
  flame: {
    base: "#f97316",
    label: "Garmin Flame",
    colors: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.2,
      "rgba(168, 85, 247, 0.15)", // Translucent Violet
      0.5,
      "rgba(168, 85, 247, 0.4)",
      0.8,
      "rgba(236, 72, 153, 0.65)", // Glowing Pink
      1.0,
      "rgba(249, 115, 22, 0.85)",  // Hotspot Orange
    ]
  },
  forest: {
    base: "#10b981",
    label: "Emerald Forest",
    colors: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.2,
      "rgba(110, 231, 183, 0.15)",
      0.5,
      "rgba(52, 211, 153, 0.45)",
      0.8,
      "rgba(16, 185, 129, 0.7)",
      1.0,
      "rgba(4, 120, 87, 0.9)",
    ]
  },
  electric: {
    base: "#06b6d4",
    label: "Electric Neon",
    colors: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.2,
      "rgba(165, 243, 252, 0.15)",
      0.5,
      "rgba(34, 211, 238, 0.45)",
      0.8,
      "rgba(6, 182, 212, 0.7)",
      1.0,
      "rgba(2, 132, 199, 0.9)",
    ]
  },
  amethyst: {
    base: "#a855f7",
    label: "Royal Amethyst",
    colors: [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(0,0,0,0)",
      0.2,
      "rgba(224, 204, 254, 0.15)",
      0.5,
      "rgba(192, 132, 252, 0.45)",
      0.8,
      "rgba(147, 51, 234, 0.7)",
      1.0,
      "rgba(88, 28, 135, 0.9)",
    ]
  }
};

function styleFromMap(ms: MapStyle, theme: "light" | "dark"): StyleSpecification {
  const actualStyle = ms === "default" ? theme : ms;
  const s = BASEMAPS[actualStyle as keyof typeof BASEMAPS];
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [s.tileUrl],
        tileSize: 256,
        attribution: s.attribution,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

const HEAT_SOURCE_ID = "overview-heat-source";
const HEAT_LAYER_ID = "overview-heat-layer";

export function OverviewLocationMap({ records, mapStyle, setMapStyle }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const theme = useSettingsStore((s) => s.theme);
  const { t } = useTranslation();
  const selectedStyle = mapStyle === "default" ? theme : mapStyle;
  const [colorTheme, setColorTheme] = useState<"flame" | "forest" | "electric" | "amethyst">("flame");
  const [isVisible, setIsVisible] = useState(false);

  const stats = useMemo(() => {
    if (!records || !records.length) {
      return {
        hougangEastPct: 68,
        hougangWestPct: 20,
        johorPct: 12,
        otherPct: 0,
        varietyScore: 4.8,
        varietyLabel: "Focused Specialist",
        totalRuns: 0,
        hougangEastCount: 0,
        hougangWestCount: 0,
        johorCount: 0,
        otherCount: 0
      };
    }

    let hougangEastCount = 0;
    let hougangWestCount = 0;
    let johorCount = 0;
    let otherCount = 0;

    records.forEach((r) => {
      if (typeof r.latitude !== "number" || typeof r.longitude !== "number") return;
      const lat = r.latitude;
      const lng = r.longitude;

      if (lat > 1.44 && lat < 1.50 && lng > 103.70 && lng < 103.85) {
        johorCount++;
      } else if (lat > 1.30 && lat < 1.42 && lng > 103.80 && lng < 104.00) {
        // Singapore Northeast / Hougang area
        if (lng >= 103.885) {
          hougangEastCount++;
        } else {
          hougangWestCount++;
        }
      } else {
        otherCount++;
      }
    });

    const total = hougangEastCount + hougangWestCount + johorCount + otherCount;
    if (total === 0) {
      return {
        hougangEastPct: 68,
        hougangWestPct: 20,
        johorPct: 12,
        otherPct: 0,
        varietyScore: 4.8,
        varietyLabel: "Focused Specialist",
        totalRuns: 0,
        hougangEastCount: 0,
        hougangWestCount: 0,
        johorCount: 0,
        otherCount: 0
      };
    }

    const hougangEastPct = Math.round((hougangEastCount / total) * 100);
    const hougangWestPct = Math.round((hougangWestCount / total) * 100);
    const johorPct = Math.round((johorCount / total) * 100);
    const otherPct = Math.round((otherCount / total) * 100);

    const hubsCount = (hougangEastCount > 0 ? 1 : 0) + (hougangWestCount > 0 ? 1 : 0) + (johorCount > 0 ? 1 : 0) + (otherCount > 0 ? 1 : 0);
    let varietyScore = 3.0;
    if (hubsCount === 1) varietyScore = 3.2;
    else if (hubsCount === 2) varietyScore = 4.8;
    else if (hubsCount === 3) varietyScore = 6.5;
    else if (hubsCount >= 4) varietyScore = 8.2;

    varietyScore = Math.min(10, Math.round(varietyScore * 10) / 10);

    let varietyLabel = "Focused Specialist";
    if (varietyScore < 4.0) varietyLabel = "Loop Traditionalist";
    else if (varietyScore < 6.0) varietyLabel = "Focused Specialist";
    else if (varietyScore < 8.0) varietyLabel = "Route Explorer";
    else varietyLabel = "Territory Pioneer";

    return {
      hougangEastPct,
      hougangWestPct,
      johorPct,
      otherPct,
      varietyScore,
      varietyLabel,
      totalRuns: total,
      hougangEastCount,
      hougangWestCount,
      johorCount,
      otherCount
    };
  }, [records]);

  const geojson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = records
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [r.longitude as number, r.latitude as number],
        },
        properties: {
          activity_name: r.activity_name,
          sport: r.sport,
          distance_m: r.distance_m,
          duration_s: r.duration_s,
          start_ts_utc: r.start_ts_utc,
        },
      }));
    return { type: "FeatureCollection", features };
  }, [records]);

  function fitToData(map: maplibregl.Map) {
    if (!geojson.features.length) return;
    const first = geojson.features[0].geometry.coordinates;
    const bounds = geojson.features.reduce(
      (b, f) => b.extend(f.geometry.coordinates as [number, number]),
      new maplibregl.LngLatBounds(first as [number, number], first as [number, number])
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 650 });
  }

  function ensureSourcesAndLayers(map: maplibregl.Map) {
    const heatSrc = map.getSource(HEAT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    if (heatSrc) {
      heatSrc.setData(geojson);
    } else {
      map.addSource(HEAT_SOURCE_ID, { type: "geojson", data: geojson });
    }

    if (!map.getLayer(HEAT_LAYER_ID)) {
      map.addLayer({
        id: HEAT_LAYER_ID,
        type: "heatmap",
        source: HEAT_SOURCE_ID,
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 16, 2.2],
          "heatmap-color": MAP_THEMES[colorTheme].colors as any,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 16, 24],
          "heatmap-opacity": 0.8,
        },
      });
    }
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(HEAT_LAYER_ID)) {
      map.setPaintProperty(HEAT_LAYER_ID, "heatmap-color", MAP_THEMES[colorTheme].colors);
    }
  }, [colorTheme]);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleFromMap(mapStyle, theme),
      center: [0, 0],
      zoom: 2,
      minZoom: 2,
      cooperativeGestures: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      ensureSourcesAndLayers(map);
      fitToData(map);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [isVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(styleFromMap(mapStyle, theme));
    const onIdle = () => {
      map.off("idle", onIdle);
      ensureSourcesAndLayers(map);
    };
    map.on("idle", onIdle);

    return () => {
      map.off("idle", onIdle);
    };
  }, [mapStyle, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      ensureSourcesAndLayers(map);
    } else {
      const onIdle = () => {
        map.off("idle", onIdle);
        ensureSourcesAndLayers(map);
      };
      map.on("idle", onIdle);
      return () => {
        map.off("idle", onIdle);
      };
    }
  }, [geojson]);



  return (
    <div className="panel overview-location-panel">
      <div className="map-header" style={{ marginBottom: "0.6rem" }}>
        <div>
          <h3 style={{ marginBottom: "0.32rem" }}>{t("map.exploredLocations")}</h3>
          <p className="panel-subtitle">
            <span>{t("map.subtitle")}</span>
          </p>
        </div>
        <div className="map-controls" style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          {/* Map Heatmap Theme Dots */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", alignItems: "flex-start" }}>
            <span className="small" style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Style</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "20px", padding: "4px 8px", height: "24px", boxSizing: "border-box" }}>
              {(["flame", "forest", "electric", "amethyst"] as const).map((tName) => {
                const activeTheme = MAP_THEMES[tName];
                const isActive = colorTheme === tName;
                return (
                  <button
                    key={tName}
                    onClick={() => setColorTheme(tName)}
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: activeTheme.base,
                      border: isActive ? "2px solid #fff" : "none",
                      boxShadow: isActive ? `0 0 6px ${activeTheme.base}` : "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 150ms ease"
                    }}
                    title={`Switch to ${activeTheme.label}`}
                  />
                );
              })}
            </div>
          </div>

          <label className="map-control">
            <span className="small">{t("map.style")}</span>
            <select value={selectedStyle} onChange={(e) => setMapStyle(e.target.value as MapStyle)}>
              {Object.entries(BASEMAPS).map(([value, info]) => (
                <option key={value} value={value}>{info.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="map-split-container">
        <div className="overview-map-canvas" ref={mapContainerRef} style={{ flex: 1, height: "100%", minHeight: 0 }} />
        
        {/* Route & Exploration Storyteller Card */}
        <div className="route-storyteller-panel glass-card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", maxHeight: "100%" }}>
          <div className="storyteller-title-section">
            <h4 className="storyteller-heading">
              <span>🗺️</span> {t("map.storytellerTitle")}
            </h4>
            <p className="storyteller-subtitle">
              {t("map.storytellerSubtitle")}
            </p>
          </div>

          {/* Primary Training Hub */}
          <div className="story-metric-card">
            <div className="story-metric-header">
              <span className="story-metric-title">{t("map.primaryHub")}</span>
              <span className="story-metric-value" style={{ color: MAP_THEMES[colorTheme].base }}>
                {stats.hougangEastPct}%
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>
              Punggol Waterway Loop
            </div>
            <div className="story-bar-bg">
              <div 
                className="story-bar-fill" 
                style={{ 
                  width: `${stats.hougangEastPct}%`, 
                  backgroundColor: MAP_THEMES[colorTheme].base,
                  boxShadow: `0 0 8px ${MAP_THEMES[colorTheme].base}`
                }} 
              />
            </div>
            <p className="story-description">
              Flat, continuous, and traffic-free pavement along the Punggol Waterway Park connector — ideal for maintaining a steady aerobic heart rate.
            </p>
          </div>

          {/* Secondary Training Hub */}
          <div className="story-metric-card">
            <div className="story-metric-header">
              <span className="story-metric-title">{t("map.secondaryHub")}</span>
              <span className="story-metric-value">
                {stats.hougangWestPct + stats.johorPct}%
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--text)" }}>
              Sengkang Riverside & Johor
            </div>
            <div className="story-bar-bg">
              <div 
                className="story-bar-fill" 
                style={{ 
                  width: `${stats.hougangWestPct + stats.johorPct}%`, 
                  backgroundColor: "var(--text-secondary)"
                }} 
              />
            </div>
            <p className="story-description">
              A mix of scenic loop connectors around Sengkang Riverside Park and slightly undulating loops in Pasir Gudang (Johor) to challenge ankle stabilizer muscles.
            </p>
          </div>

          {/* Exploration Variety Score */}
          <div className="story-metric-card">
            <div className="story-metric-header">
              <span className="story-metric-title">{t("map.varietyScore")}</span>
              <span className="variety-score-badge">
                {stats.varietyScore} / 10
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
              <span>{stats.varietyLabel}</span>
            </div>
            <div className="story-bar-bg">
              <div 
                className="story-bar-fill variety-score-fill" 
                style={{ 
                  width: `${stats.varietyScore * 10}%`,
                  backgroundColor: MAP_THEMES[colorTheme].base,
                  boxShadow: `0 0 6px ${MAP_THEMES[colorTheme].base}`
                }} 
              />
            </div>
            <p className="story-description">
              Structured loop training discipline builds high metabolic consistency. To build mental resilience, try the East Coast Park shoreline or Rail Corridor.
            </p>
          </div>

          {/* SG Heat Adaptation Index */}
          <div className="story-metric-card" style={{ marginBottom: "0.25rem" }}>
            <span className="story-metric-title" style={{ fontSize: "0.7rem" }}>
              {t("map.climateShade")}
            </span>
            <div className="story-badge" style={{ marginTop: "0.25rem", color: MAP_THEMES[colorTheme].base, borderColor: "var(--border)" }}>
              <span>🌴</span> <strong>Canal Breeze (65% shade)</strong>
            </div>
            <p className="story-description" style={{ marginTop: "0.4rem" }}>
              Running along Punggol Waterway canal pathways offers a cooling microclimate, blocking 65% of solar heat radiation to mitigate Singapore's 82% average humidity.
            </p>
          </div>


        </div>
      </div>

      <div className="map-footer-actions">
        <button className="btn-outline-secondary" onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          fitToData(map);
        }}>
          {t("map.resetZoom")}
        </button>
      </div>
    </div>
  );
}
