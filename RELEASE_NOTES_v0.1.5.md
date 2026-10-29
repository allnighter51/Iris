## Iris v0.1.5 — Smart Game Detection, 120+ Game Catalog & FSE Safeguards

### 🎮 Smart Game Detection & Curated Catalog
- **124 Popular Gaming Executables:** Zero-configuration detection across 6 major genres:
  - **FPS & Shooters:** Overwatch 2, Valorant, Marvel Rivals, Counter-Strike 2, Call of Duty / Warzone, Rainbow Six Siege, THE FINALS, Destiny 2, Halo Infinite, Escape from Tarkov, Deadlock, Delta Force, FragPunk, Strinova, Team Fortress 2, Space Marine 2, Darktide, and more.
  - **Battle Royale:** Apex Legends, Fortnite, PUBG: BATTLEGROUNDS, Naraka: Bladepoint, Super People.
  - **MOBA & Strategy:** League of Legends, Dota 2, Smite 2, StarCraft II, Heroes of the Storm, Teamfight Tactics.
  - **Action & RPG:** Genshin Impact, Honkai: Star Rail, Wuthering Waves, Zenless Zone Zero, Monster Hunter: World, Elden Ring, Cyberpunk 2077, Black Myth: Wukong, Grand Theft Auto V, Baldur's Gate 3, Path of Exile, Diablo IV.
  - **Survival & Horror:** Dead by Daylight, Rust, Lethal Company, Phasmophobia, ARK: Survival Ascended, Palworld, Valheim, Sons of the Forest, Minecraft, Roblox.
  - **Fighting & Sports:** Street Fighter 6, Tekken 8, Mortal Kombat 1, Guilty Gear -Strive-, Rocket League, EA Sports FC 25, NBA 2K25, Forza Horizon 5, World of Warcraft, Final Fantasy XIV, Old School RuneScape.
- **Instant Search & Genre Filter Toolbar:** Filter games instantly by title, executable name, or genre with real-time feedback and a 1-click search clear button.
- **Master Toggle & Selection Controls:** Switch between *All Supported Games* or custom selection, with 1-click **Select All** and **Deselect All** controls.
- **Scrollable Game Cards:** Dark cyberpunk UI with game color accents, genre badges, `.exe` tags, and animated `● RUNNING NOW` detection badges.

### 🎯 Upgraded Display Target Console
- **Two Primary Display Modes:**
  - `Force on Screen` (`ALWAYS VISIBLE`): Projects overlay permanently across desktop and any game.
  - `Smart Game Detect` (`AUTO-DETECT`): Automatically shows overlay when games run and conceals when closed or tabbed out.
- **Stacked UI Layout:** Full-width header and subtitle stacked cleanly above an equal-width 2-column cards grid.
- **Live Status Badges:** TopBar, Display tab, and Settings show dynamic status (`● OVERLAY ACTIVE (VALORANT)` / `○ WAITING FOR GAME...`).

### ⚙️ Custom Game Executable & Running Process Quick-Picker
- **1-Click Process Tracking:** Native Win32 background process enumeration surfaces active games running on your PC with clickable `+ [proc.exe]` chips.
- **Custom Game Tracking:** Add any indie or custom `.exe` with removable tracking chips.

### 🛡️ Fullscreen Exclusive (FSE) Detection & Safeguards
- **DirectX FSE Hook:** Added `SHQueryUserNotificationState` (`QUNS_RUNNING_D3D_FULL_SCREEN`) detection when DirectX exclusive fullscreen bypasses Windows DWM.
- **H - 1 Sizing Safeguard:** Sized overlay HWND to `H - 1` to prevent Windows from demoting the overlay behind fullscreen games.
- **Multi-Stage Z-Order Timers:** Instant Z-order re-assertion (0ms, 120ms, 350ms) to win focus races during alt-tab transitions.
- **Diagnostic In-App Banner:** Step-by-step guidance on switching to Windowed Fullscreen or toggling Fullscreen Optimizations.

### ⚡ Binary Size & Optimization
- Enabled release LTO and symbol stripping, reducing executable size by over **60%** (from **14.9 MB** down to **5.63 MB**).
