export interface GameCatalogItem {
  id: string;
  name: string;
  genre: "FPS & Shooters" | "Battle Royale" | "MOBA & Strategy" | "Action & RPG" | "Survival & Horror" | "Fighting & Sports";
  exes: string[];
  color: string;
}

export const GAME_GENRES = [
  "All",
  "FPS & Shooters",
  "Battle Royale",
  "MOBA & Strategy",
  "Action & RPG",
  "Survival & Horror",
  "Fighting & Sports",
] as const;

export type GameGenre = (typeof GAME_GENRES)[number];

export const GAMES_DATABASE: GameCatalogItem[] = [
  // --- FPS & Tactical Shooters ---
  { id: "overwatch2", name: "Overwatch 2", genre: "FPS & Shooters", exes: ["Overwatch.exe"], color: "#38bdf8" },
  { id: "valorant", name: "Valorant", genre: "FPS & Shooters", exes: ["VALORANT-Win64-Shipping.exe", "Valorant-Win64-Shipping.exe", "Valorant.exe"], color: "#f43f5e" },
  { id: "marvelrivals", name: "Marvel Rivals", genre: "FPS & Shooters", exes: ["MarvelRivals-Win64-Shipping.exe", "Marvel-Win64-Shipping.exe", "MarvelRivals.exe", "Marvel-Rivals.exe"], color: "#a855f7" },
  { id: "cs2", name: "Counter-Strike 2", genre: "FPS & Shooters", exes: ["cs2.exe", "csgo.exe"], color: "#f59e0b" },
  { id: "cod", name: "Call of Duty / Warzone", genre: "FPS & Shooters", exes: ["cod.exe", "bootcamp.exe", "ModernWarfare.exe", "BlackOpsColdWar.exe", "Call of Duty.exe", "sp23.exe", "mp23.exe"], color: "#eab308" },
  { id: "r6siege", name: "Rainbow Six Siege", genre: "FPS & Shooters", exes: ["RainbowSix.exe", "RainbowSix_Vulkan.exe"], color: "#06b6d4" },
  { id: "thefinals", name: "THE FINALS", genre: "FPS & Shooters", exes: ["Discovery.exe"], color: "#ef4444" },
  { id: "destiny2", name: "Destiny 2", genre: "FPS & Shooters", exes: ["destiny2.exe"], color: "#60a5fa" },
  { id: "haloinfinite", name: "Halo Infinite", genre: "FPS & Shooters", exes: ["HaloInfinite.exe"], color: "#10b981" },
  { id: "tarkov", name: "Escape from Tarkov", genre: "FPS & Shooters", exes: ["EscapeFromTarkov.exe"], color: "#84cc16" },
  { id: "deadlock", name: "Deadlock", genre: "FPS & Shooters", exes: ["project8.exe"], color: "#f97316" },
  { id: "deltaforce", name: "Delta Force", genre: "FPS & Shooters", exes: ["DeltaForceClient-Win64-Shipping.exe", "DeltaForce.exe"], color: "#38bdf8" },
  { id: "fragpunk", name: "FragPunk", genre: "FPS & Shooters", exes: ["FragPunk.exe", "FragPunk-Win64-Shipping.exe"], color: "#ec4899" },
  { id: "strinova", name: "Strinova", genre: "FPS & Shooters", exes: ["Strinova-Win64-Shipping.exe", "Strinova.exe", "Calabiyau.exe"], color: "#8b5cf6" },
  { id: "tf2", name: "Team Fortress 2", genre: "FPS & Shooters", exes: ["tf_win64.exe", "hl2.exe"], color: "#d97706" },
  { id: "l4d2", name: "Left 4 Dead 2", genre: "FPS & Shooters", exes: ["left4dead2.exe"], color: "#dc2626" },
  { id: "payday3", name: "PAYDAY 3", genre: "FPS & Shooters", exes: ["PAYDAY3-Win64-Shipping.exe", "PAYDAY3.exe"], color: "#2563eb" },
  { id: "payday2", name: "PAYDAY 2", genre: "FPS & Shooters", exes: ["payday2_win32_release.exe"], color: "#1d4ed8" },
  { id: "huntshowdown", name: "Hunt: Showdown 1896", genre: "FPS & Shooters", exes: ["HuntGame.exe"], color: "#78716c" },
  { id: "insurgency", name: "Insurgency: Sandstorm", genre: "FPS & Shooters", exes: ["InsurgencyClient-Win64-Shipping.exe"], color: "#b45309" },
  { id: "squad", name: "Squad", genre: "FPS & Shooters", exes: ["SquadGame.exe"], color: "#15803d" },
  { id: "hellletloose", name: "Hell Let Loose", genre: "FPS & Shooters", exes: ["HLL-Win64-Shipping.exe"], color: "#991b1b" },
  { id: "deeprockgalactic", name: "Deep Rock Galactic", genre: "FPS & Shooters", exes: ["FSD-Win64-Shipping.exe"], color: "#d97706" },
  { id: "killingfloor2", name: "Killing Floor 2", genre: "FPS & Shooters", exes: ["KFGame.exe"], color: "#b91c1c" },
  { id: "spacemarine2", name: "Space Marine 2", genre: "FPS & Shooters", exes: ["Warhammer 40000 Space Marine 2 - Retail.exe"], color: "#1e3a8a" },
  { id: "darktide", name: "Warhammer 40,000: Darktide", genre: "FPS & Shooters", exes: ["Darktide.exe"], color: "#0284c7" },
  { id: "doometernal", name: "DOOM Eternal", genre: "FPS & Shooters", exes: ["DOOMEternalx64vk.exe"], color: "#ea580c" },
  { id: "borderlands3", name: "Borderlands 3", genre: "FPS & Shooters", exes: ["Borderlands3.exe"], color: "#f59e0b" },
  { id: "bf2042", name: "Battlefield 2042", genre: "FPS & Shooters", exes: ["BF2042.exe"], color: "#0ea5e9" },
  { id: "bfv", name: "Battlefield V", genre: "FPS & Shooters", exes: ["bfv.exe"], color: "#64748b" },
  { id: "bf1", name: "Battlefield 1", genre: "FPS & Shooters", exes: ["bf1.exe"], color: "#71717a" },

  // --- Battle Royale ---
  { id: "apex", name: "Apex Legends", genre: "Battle Royale", exes: ["r5apex.exe", "r5apex_dx12.exe"], color: "#fb923c" },
  { id: "fortnite", name: "Fortnite", genre: "Battle Royale", exes: ["FortniteClient-Win64-Shipping.exe"], color: "#3b82f6" },
  { id: "pubg", name: "PUBG: BATTLEGROUNDS", genre: "Battle Royale", exes: ["TslGame.exe"], color: "#f59e0b" },
  { id: "narakabladepoint", name: "Naraka: Bladepoint", genre: "Battle Royale", exes: ["NarakaBladepoint.exe"], color: "#ef4444" },
  { id: "superpeople", name: "Super People", genre: "Battle Royale", exes: ["BravoHotelClient-Win64-Shipping.exe"], color: "#06b6d4" },

  // --- MOBA & Strategy ---
  { id: "leagueoflegends", name: "League of Legends", genre: "MOBA & Strategy", exes: ["League of Legends.exe", "LeagueClientUx.exe", "LeagueClient.exe"], color: "#38bdf8" },
  { id: "dota2", name: "Dota 2", genre: "MOBA & Strategy", exes: ["dota2.exe"], color: "#ef4444" },
  { id: "smite2", name: "Smite 2", genre: "MOBA & Strategy", exes: ["Smite2-Win64-Shipping.exe"], color: "#3b82f6" },
  { id: "smite", name: "Smite", genre: "MOBA & Strategy", exes: ["Smite.exe"], color: "#60a5fa" },
  { id: "heroesofthestorm", name: "Heroes of the Storm", genre: "MOBA & Strategy", exes: ["HeroesOfTheStorm_x64.exe"], color: "#8b5cf6" },
  { id: "starcraft2", name: "StarCraft II", genre: "MOBA & Strategy", exes: ["SC2_x64.exe"], color: "#0284c7" },
  { id: "aoe4", name: "Age of Empires IV", genre: "MOBA & Strategy", exes: ["RelicCardinal.exe"], color: "#d97706" },
  { id: "aoe2de", name: "Age of Empires II: DE", genre: "MOBA & Strategy", exes: ["AoE2DE_s.exe"], color: "#b45309" },
  { id: "totalwarwarhammer3", name: "Total War: Warhammer III", genre: "MOBA & Strategy", exes: ["Warhammer3.exe"], color: "#b91c1c" },
  { id: "civ6", name: "Civilization VI", genre: "MOBA & Strategy", exes: ["CivilizationVI.exe", "CivilizationVI_DX12.exe"], color: "#4f46e5" },
  { id: "civ7", name: "Civilization VII", genre: "MOBA & Strategy", exes: ["CivilizationVII.exe"], color: "#6366f1" },
  { id: "hoi4", name: "Hearts of Iron IV", genre: "MOBA & Strategy", exes: ["hoi4.exe"], color: "#059669" },
  { id: "stellaris", name: "Stellaris", genre: "MOBA & Strategy", exes: ["stellaris.exe"], color: "#06b6d4" },

  // --- Action & RPG ---
  { id: "eldenring", name: "Elden Ring", genre: "Action & RPG", exes: ["eldenring.exe"], color: "#fbbf24" },
  { id: "cyberpunk2077", name: "Cyberpunk 2077", genre: "Action & RPG", exes: ["Cyberpunk2077.exe"], color: "#facc15" },
  { id: "bg3", name: "Baldur's Gate 3", genre: "Action & RPG", exes: ["bg3.exe", "bg3_dx11.exe"], color: "#a855f7" },
  { id: "helldivers2", name: "Helldivers 2", genre: "Action & RPG", exes: ["helldivers2.exe"], color: "#38bdf8" },
  { id: "warframe", name: "Warframe", genre: "Action & RPG", exes: ["Warframe.x64.exe", "Warframe.exe"], color: "#94a3b8" },
  { id: "poe", name: "Path of Exile", genre: "Action & RPG", exes: ["PathOfExile.exe", "PathOfExileSteam.exe", "PathOfExile_x64.exe"], color: "#eab308" },
  { id: "poe2", name: "Path of Exile 2", genre: "Action & RPG", exes: ["PathOfExile2.exe", "PathOfExileSteam2.exe"], color: "#f59e0b" },
  { id: "diablo4", name: "Diablo IV", genre: "Action & RPG", exes: ["Diablo IV.exe"], color: "#dc2626" },
  { id: "diablo2r", name: "Diablo II: Resurrected", genre: "Action & RPG", exes: ["D2R.exe"], color: "#b91c1c" },
  { id: "genshin", name: "Genshin Impact", genre: "Action & RPG", exes: ["GenshinImpact.exe", "YuanShen.exe"], color: "#38bdf8" },
  { id: "starrail", name: "Honkai: Star Rail", genre: "Action & RPG", exes: ["StarRail.exe"], color: "#818cf8" },
  { id: "zzz", name: "Zenless Zone Zero", genre: "Action & RPG", exes: ["ZenlessZoneZero.exe"], color: "#a3e635" },
  { id: "wutheringwaves", name: "Wuthering Waves", genre: "Action & RPG", exes: ["Client-Win64-Shipping.exe", "Wuthering Waves.exe"], color: "#22d3ee" },
  { id: "wukong", name: "Black Myth: Wukong", genre: "Action & RPG", exes: ["b1-Win64-Shipping.exe", "b1.exe"], color: "#ca8a04" },
  { id: "monsterhunterwilds", name: "Monster Hunter Wilds", genre: "Action & RPG", exes: ["MonsterHunterWilds.exe"], color: "#f97316" },
  { id: "monsterhunterworld", name: "Monster Hunter: World", genre: "Action & RPG", exes: ["MonsterHunterWorld.exe"], color: "#ea580c" },
  { id: "monsterhunterrise", name: "Monster Hunter Rise", genre: "Action & RPG", exes: ["MonsterHunterRise.exe"], color: "#c2410c" },
  { id: "darksouls3", name: "Dark Souls III", genre: "Action & RPG", exes: ["DarkSoulsIII.exe"], color: "#78716c" },
  { id: "darksouls1", name: "Dark Souls Remastered", genre: "Action & RPG", exes: ["DarkSoulsRemastered.exe"], color: "#57534e" },
  { id: "sekiro", name: "Sekiro: Shadows Die Twice", genre: "Action & RPG", exes: ["sekiro.exe"], color: "#ef4444" },
  { id: "armoredcore6", name: "Armored Core VI", genre: "Action & RPG", exes: ["armoredcore6.exe"], color: "#dc2626" },
  { id: "liesofp", name: "Lies of P", genre: "Action & RPG", exes: ["LOP-Win64-Shipping.exe"], color: "#64748b" },
  { id: "witcher3", name: "The Witcher 3: Wild Hunt", genre: "Action & RPG", exes: ["witcher3.exe"], color: "#b91c1c" },
  { id: "skyrim", name: "The Elder Scrolls V: Skyrim", genre: "Action & RPG", exes: ["SkyrimSE.exe", "TESV.exe"], color: "#94a3b8" },
  { id: "fallout4", name: "Fallout 4", genre: "Action & RPG", exes: ["Fallout4.exe"], color: "#eab308" },
  { id: "hogwartslegacy", name: "Hogwarts Legacy", genre: "Action & RPG", exes: ["HogwartsLegacy.exe"], color: "#6366f1" },
  { id: "starfield", name: "Starfield", genre: "Action & RPG", exes: ["Starfield.exe"], color: "#0284c7" },
  { id: "rdr2", name: "Red Dead Redemption 2", genre: "Action & RPG", exes: ["RDR2.exe"], color: "#b91c1c" },
  { id: "gta5", name: "Grand Theft Auto V", genre: "Action & RPG", exes: ["GTA5.exe", "FiveM.exe", "PlayGTAV.exe"], color: "#10b981" },
  { id: "dragonsdogma2", name: "Dragon's Dogma 2", genre: "Action & RPG", exes: ["DD2.exe"], color: "#78350f" },
  { id: "remnant2", name: "Remnant II", genre: "Action & RPG", exes: ["Remnant2-Win64-Shipping.exe"], color: "#991b1b" },
  { id: "ff16", name: "Final Fantasy XVI", genre: "Action & RPG", exes: ["ff16.exe"], color: "#475569" },
  { id: "ff7rebirth", name: "Final Fantasy VII Rebirth", genre: "Action & RPG", exes: ["ff7rebirth.exe"], color: "#38bdf8" },
  { id: "ff7remake", name: "Final Fantasy VII Remake", genre: "Action & RPG", exes: ["ff7remake.exe"], color: "#0ea5e9" },

  // --- Survival, Sandbox & Horror ---
  { id: "dbd", name: "Dead by Daylight", genre: "Survival & Horror", exes: ["DeadByDaylight-Win64-Shipping.exe", "DeadByDaylight-EGS-Shipping.exe", "DeadByDaylight.exe"], color: "#ec4899" },
  { id: "minecraft", name: "Minecraft", genre: "Survival & Horror", exes: ["javaw.exe", "Minecraft.Windows.exe", "Minecraft.exe"], color: "#16a34a" },
  { id: "roblox", name: "Roblox", genre: "Survival & Horror", exes: ["RobloxPlayerBeta.exe", "RobloxPlayerLauncher.exe"], color: "#e11d48" },
  { id: "rust", name: "Rust", genre: "Survival & Horror", exes: ["RustClient.exe"], color: "#ea580c" },
  { id: "palworld", name: "Palworld", genre: "Survival & Horror", exes: ["Palworld-Win64-Shipping.exe", "Pal-Win64-Shipping.exe"], color: "#38bdf8" },
  { id: "oncehuman", name: "Once Human", genre: "Survival & Horror", exes: ["ONCE_HUMAN.exe"], color: "#06b6d4" },
  { id: "arkascended", name: "ARK: Survival Ascended", genre: "Survival & Horror", exes: ["ArkAscended.exe"], color: "#10b981" },
  { id: "arkevolved", name: "ARK: Survival Evolved", genre: "Survival & Horror", exes: ["ShooterGame.exe"], color: "#059669" },
  { id: "sonsoftheforest", name: "Sons of the Forest", genre: "Survival & Horror", exes: ["SonsOfTheForest.exe"], color: "#15803d" },
  { id: "theforest", name: "The Forest", genre: "Survival & Horror", exes: ["TheForest.exe"], color: "#166534" },
  { id: "valheim", name: "Valheim", genre: "Survival & Horror", exes: ["valheim.exe"], color: "#ca8a04" },
  { id: "terraria", name: "Terraria", genre: "Survival & Horror", exes: ["Terraria.exe"], color: "#10b981" },
  { id: "enshrouded", name: "Enshrouded", genre: "Survival & Horror", exes: ["enshrouded.exe"], color: "#3b82f6" },
  { id: "vrising", name: "V Rising", genre: "Survival & Horror", exes: ["VRising.exe"], color: "#8b5cf6" },
  { id: "7daystodie", name: "7 Days to Die", genre: "Survival & Horror", exes: ["7DaysToDie.exe"], color: "#dc2626" },
  { id: "projectzomboid", name: "Project Zomboid", genre: "Survival & Horror", exes: ["ProjectZomboid64.exe", "ProjectZomboid32.exe"], color: "#64748b" },
  { id: "lethalcompany", name: "Lethal Company", genre: "Survival & Horror", exes: ["Lethal Company.exe"], color: "#f97316" },
  { id: "phasmophobia", name: "Phasmophobia", genre: "Survival & Horror", exes: ["Phasmophobia.exe"], color: "#38bdf8" },
  { id: "subnautica", name: "Subnautica", genre: "Survival & Horror", exes: ["Subnautica.exe"], color: "#06b6d4" },
  { id: "seaofthieves", name: "Sea of Thieves", genre: "Survival & Horror", exes: ["SoTGame.exe"], color: "#14b8a6" },
  { id: "nomanssky", name: "No Man's Sky", genre: "Survival & Horror", exes: ["NMS.exe"], color: "#f43f5e" },
  { id: "raft", name: "Raft", genre: "Survival & Horror", exes: ["Raft.exe"], color: "#38bdf8" },
  { id: "dontstarvetogether", name: "Don't Starve Together", genre: "Survival & Horror", exes: ["dontstarve_steam_x64.exe", "dontstarve_steam.exe"], color: "#78716c" },

  // --- Fighting, Sports & MMO ---
  { id: "streetfighter6", name: "Street Fighter 6", genre: "Fighting & Sports", exes: ["StreetFighter6.exe"], color: "#f43f5e" },
  { id: "tekken8", name: "Tekken 8", genre: "Fighting & Sports", exes: ["Polaris-Win64-Shipping.exe"], color: "#e11d48" },
  { id: "mortalkombat1", name: "Mortal Kombat 1", genre: "Fighting & Sports", exes: ["MK12.exe"], color: "#b91c1c" },
  { id: "guiltygearstrive", name: "Guilty Gear -Strive-", genre: "Fighting & Sports", exes: ["GGST-Win64-Shipping.exe"], color: "#ea580c" },
  { id: "brawlhalla", name: "Brawlhalla", genre: "Fighting & Sports", exes: ["Brawlhalla.exe"], color: "#f59e0b" },
  { id: "rocketleague", name: "Rocket League", genre: "Fighting & Sports", exes: ["RocketLeague.exe"], color: "#0284c7" },
  { id: "ea_fc25", name: "EA Sports FC 25", genre: "Fighting & Sports", exes: ["FC25.exe"], color: "#10b981" },
  { id: "ea_fc24", name: "EA Sports FC 24", genre: "Fighting & Sports", exes: ["FC24.exe"], color: "#059669" },
  { id: "nba2k25", name: "NBA 2K25", genre: "Fighting & Sports", exes: ["NBA2K25.exe"], color: "#dc2626" },
  { id: "forzahorizon5", name: "Forza Horizon 5", genre: "Fighting & Sports", exes: ["ForzaHorizon5.exe"], color: "#ec4899" },
  { id: "wow", name: "World of Warcraft", genre: "Fighting & Sports", exes: ["Wow.exe", "WowClassic.exe"], color: "#eab308" },
  { id: "ffxiv", name: "Final Fantasy XIV", genre: "Fighting & Sports", exes: ["ffxiv_dx11.exe", "ffxiv.exe"], color: "#38bdf8" },
  { id: "guildwars2", name: "Guild Wars 2", genre: "Fighting & Sports", exes: ["Gw2-64.exe"], color: "#dc2626" },
  { id: "eso", name: "The Elder Scrolls Online", genre: "Fighting & Sports", exes: ["eso64.exe"], color: "#d97706" },
  { id: "lostark", name: "Lost Ark", genre: "Fighting & Sports", exes: ["LOSTARK.exe"], color: "#f43f5e" },
  { id: "osrs", name: "Old School RuneScape", genre: "Fighting & Sports", exes: ["osclient.exe", "RuneLite.exe"], color: "#ca8a04" },
];

export function findGameByExe(exe?: string | null): GameCatalogItem | undefined {
  if (!exe) return undefined;
  const lower = exe.trim().toLowerCase();
  return GAMES_DATABASE.find((g) => g.exes.some((e) => e.toLowerCase() === lower));
}

export function getGameDisplayName(exe?: string | null): string {
  if (!exe) return "Game";
  const found = findGameByExe(exe);
  if (found) return found.name;
  return exe.replace(/\.exe$/i, "");
}
