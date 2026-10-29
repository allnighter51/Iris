import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type {
  CompositePreset,
  FseStatus,
  MonitorInfo,
  OverlayPayload,
  OverlayState,
  Settings,
  Transform,
  UpdateStatus,
  VaultData,
  VaultItem,
} from "./types";

export const api = {
  vaultLoad: () => invoke<VaultData>("vault_load"),
  importAsset: (
    bytes: Uint8Array,
    meta: { name: string; game: string; folder: string; tag: string; width: number; height: number },
  ) =>
    invoke<VaultItem>("import_asset", bytes, {
      headers: {
        "x-name": encodeURIComponent(meta.name),
        "x-game": encodeURIComponent(meta.game),
        "x-folder": encodeURIComponent(meta.folder),
        "x-tag": encodeURIComponent(meta.tag),
        "x-width": String(meta.width),
        "x-height": String(meta.height),
      },
    }),
  saveThumbnail: (id: string, bytes: Uint8Array) =>
    invoke<VaultData>("save_thumbnail", bytes, { headers: { "x-id": id } }),
  updateItem: (
    id: string,
    patch: { name?: string; game?: string; folder?: string; transform?: Transform; tag?: string; favorite?: boolean },
  ) => invoke<VaultData>("vault_update_item", { id, patch }),
  deleteItem: (id: string) => invoke<VaultData>("vault_delete_item", { id }),
  createFolder: (name: string) => invoke<VaultData>("vault_create_folder", { name }),
  deleteFolder: (name: string) => invoke<VaultData>("vault_delete_folder", { name }),
  savePreset: (preset: CompositePreset) => invoke<VaultData>("preset_save", { preset }),
  deletePreset: (id: string) => invoke<VaultData>("preset_delete", { id }),
  openVaultDir: () => invoke<void>("open_vault_dir"),
  overlayApply: (overlay: OverlayState) => invoke<void>("overlay_apply", { overlay }),
  overlayGet: () => invoke<OverlayPayload>("overlay_get"),
  overlayGetFseStatus: () => invoke<FseStatus>("overlay_get_fse_status"),
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  listRunningProcesses: () => invoke<string[]>("list_running_processes"),
  settingsGet: () => invoke<Settings>("settings_get"),
  settingsSave: (settings: Settings) => invoke<Settings>("settings_save", { settings }),
  updaterCheck: () => invoke<UpdateStatus>("updater_check"),
  updaterDownloadAndInstall: () => invoke<void>("updater_download_and_install"),
  updaterRestart: () => invoke<void>("updater_restart"),
  updaterGetStatus: () => invoke<UpdateStatus>("updater_get_status"),
  getAppVersion: () => invoke<string>("get_app_version"),
};

export const assetUrl = (dir: string, file: string) => convertFileSrc(`${dir}\\${file}`);
