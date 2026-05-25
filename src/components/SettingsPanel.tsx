import { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { api } from "../lib/api";
import { openExternalLink } from "../lib/links";
import { useTranslation, LANGUAGES } from "../lib/i18n";

type StorageInfo = {
  data_dir: string;
  db_path: string;
  fit_files_dir: string;
};

type VersionBadgeStatus = {
  state: "hidden" | "latest" | "update";
  latestVersion: string | null;
};

type Props = {
  appVersion: string;
  versionBadgeStatus: VersionBadgeStatus;
};

export function SettingsPanel({ appVersion, versionBadgeStatus }: Props) {
  const {
    showSettings,
    theme,
    distanceUnit,
    timeFormat,
    mapStyle,
    geminiApiKey,
    setTheme,
    setDistanceUnit,
    setTimeFormat,
    setMapStyle,
    setGeminiApiKey,
    toggleSettings
  } = useSettingsStore();
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const language = useSettingsStore((s) => s.language);
  const { t } = useTranslation();

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [clearingBlacklist, setClearingBlacklist] = useState(false);
  const [blacklistMsg, setBlacklistMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [blacklistCount, setBlacklistCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!showSettings) return;

    void Promise.all([api.getStorageInfo(), api.getBlacklistedHashCount()])
      .then(([info, count]) => {
        if (cancelled) return;
        setStorageInfo(info);
        setBlacklistCount(count.count);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageInfo(null);
          setBlacklistCount(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showSettings]);

  if (!showSettings) {
    return null;
  }

  async function handleClearBlacklist() {
    const ok = window.confirm(t("settings.confirmClearBlacklist"));
    if (!ok) return;
    setClearingBlacklist(true);
    setBlacklistMsg(null);
    try {
      const result = await api.clearBlacklistedHashes();
      setBlacklistMsg({ type: "success", text: t("settings.clearedHashes", { count: result.removed }) });
      setBlacklistCount(0);
    } catch (err) {
      setBlacklistMsg({
        type: "error",
        text: t("settings.clearBlacklistFailed", { error: err instanceof Error ? err.message : "unknown" }),
      });
    } finally {
      setClearingBlacklist(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-backdrop" onClick={toggleSettings} />
      <div className="settings-drawer">
        <div className="settings-drawer-header">
          <h3>{t("settings.title")}</h3>
          <button className="icon-btn" onClick={toggleSettings} aria-label={t("settings.closeSettings")}>&times;</button>
        </div>

        <div className="settings-grid">
          <label><span>{t("settings.language")}</span><select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select></label>

          <label><span>{t("settings.theme")}</span><select value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </select></label>

          <label><span>{t("settings.distanceUnit")}</span><select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as "km" | "mi")}>
            <option value="km">{t("settings.kilometers")}</option>
            <option value="mi">{t("settings.miles")}</option>
          </select></label>

          <label><span>{t("settings.timeFormat")}</span><select value={timeFormat} onChange={(e) => setTimeFormat(e.target.value as "12h" | "24h")}>
            <option value="24h">{t("settings.24hour")}</option>
            <option value="12h">{t("settings.12hour")}</option>
          </select></label>

          <label><span>{t("settings.mapStyle")}</span><select value={mapStyle} onChange={(e) => setMapStyle(e.target.value as any)}>
              <option value="default">{t("settings.mapDefault")}</option>
              <option value="light">{t("settings.mapLight")}</option>
              <option value="dark">{t("settings.mapDark")}</option>
              <option value="openstreet">{t("settings.mapOpenStreet")}</option>
              <option value="topo">{t("settings.mapTopo")}</option>
              <option value="satellite">{t("settings.mapSatellite")}</option>
            </select>
          </label>

          <label><span>Gemini API Key</span>
            <input 
              type="password" 
              placeholder={import.meta.env.VITE_GEMINI_API_KEY ? "Loaded from .env" : "Enter API Key"}
              disabled={!!import.meta.env.VITE_GEMINI_API_KEY}
              value={import.meta.env.VITE_GEMINI_API_KEY ? "" : geminiApiKey} 
              onChange={(e) => setGeminiApiKey(e.target.value)} 
              className="settings-input"
            />
          </label>
        </div>

        <div className="storage-box">
          <strong>{t("settings.storageLocations")}</strong>
          {storageInfo ? (
            <div className="storage-meta">
              <div>
                <span>{t("settings.appVersion")}</span> <code>{appVersion}</code>
                {versionBadgeStatus.state === "latest" && (
                  <span className="version-status-badge latest" title="You are on the latest release">
                    {t("settings.latest")}
                  </span>
                )}
                {versionBadgeStatus.state === "update" && versionBadgeStatus.latestVersion && (
                  <a
                    className="version-status-badge update"
                    href="https://fitdashboard.app"
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`A newer release is available: ${versionBadgeStatus.latestVersion}`}
                    onClick={openExternalLink}
                  >
                    {t("settings.updateTo", { version: versionBadgeStatus.latestVersion })}
                  </a>
                )}
              </div>
              <div><span>{t("settings.appData")}</span> <code>{storageInfo.data_dir}</code></div>
              <div><span>{t("settings.database")}</span> <code>{storageInfo.db_path}</code></div>
              <div><span>{t("settings.fitFiles")}</span> <code>{storageInfo.fit_files_dir}</code></div>
            </div>
          ) : (
            <p className="small">{t("settings.storageUnavailable")}</p>
          )}

          <div style={{ marginTop: "0.7rem", display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start" }}>
            <span className="small">
              {t("settings.blacklistedHashes")} <strong>{blacklistCount ?? "-"}</strong>
            </span>
            <button
              className="btn-danger"
              onClick={() => void handleClearBlacklist()}
              disabled={clearingBlacklist}
            >
              {clearingBlacklist ? t("settings.clearing") : t("settings.clearBlacklist")}
            </button>
            {blacklistMsg && (
              <span
                className="small"
                style={{ color: blacklistMsg.type === "success" ? "var(--success)" : "var(--danger)" }}
              >
                {blacklistMsg.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
