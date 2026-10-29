//! Curated catalog of 120+ popular PC gaming executables across all major genres.
//! Used for zero-configuration Smart Game Detection.

#[allow(dead_code)]
pub struct GameEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub genre: &'static str,
    pub exes: &'static [&'static str],
}

pub const GAMES_CATALOG: &[GameEntry] = &[
    // --- FPS & Tactical Shooters ---
    GameEntry {
        id: "overwatch2",
        name: "Overwatch 2",
        genre: "FPS & Shooters",
        exes: &["Overwatch.exe"],
    },
    GameEntry {
        id: "valorant",
        name: "Valorant",
        genre: "FPS & Shooters",
        exes: &["VALORANT-Win64-Shipping.exe", "Valorant-Win64-Shipping.exe", "Valorant.exe"],
    },
    GameEntry {
        id: "marvelrivals",
        name: "Marvel Rivals",
        genre: "FPS & Shooters",
        exes: &["MarvelRivals-Win64-Shipping.exe", "Marvel-Win64-Shipping.exe", "MarvelRivals.exe", "Marvel-Rivals.exe"],
    },
    GameEntry {
        id: "cs2",
        name: "Counter-Strike 2",
        genre: "FPS & Shooters",
        exes: &["cs2.exe", "csgo.exe"],
    },
    GameEntry {
        id: "cod",
        name: "Call of Duty / Warzone",
        genre: "FPS & Shooters",
        exes: &["cod.exe", "bootcamp.exe", "ModernWarfare.exe", "BlackOpsColdWar.exe", "Call of Duty.exe", "sp23.exe", "mp23.exe"],
    },
    GameEntry {
        id: "r6siege",
        name: "Rainbow Six Siege",
        genre: "FPS & Shooters",
        exes: &["RainbowSix.exe", "RainbowSix_Vulkan.exe"],
    },
    GameEntry {
        id: "thefinals",
        name: "THE FINALS",
        genre: "FPS & Shooters",
        exes: &["Discovery.exe"],
    },
    GameEntry {
        id: "destiny2",
        name: "Destiny 2",
        genre: "FPS & Shooters",
        exes: &["destiny2.exe"],
    },
    GameEntry {
        id: "haloinfinite",
        name: "Halo Infinite",
        genre: "FPS & Shooters",
        exes: &["HaloInfinite.exe"],
    },
    GameEntry {
        id: "tarkov",
        name: "Escape from Tarkov",
        genre: "FPS & Shooters",
        exes: &["EscapeFromTarkov.exe"],
    },
    GameEntry {
        id: "deadlock",
        name: "Deadlock",
        genre: "FPS & Shooters",
        exes: &["project8.exe"],
    },
    GameEntry {
        id: "deltaforce",
        name: "Delta Force",
        genre: "FPS & Shooters",
        exes: &["DeltaForceClient-Win64-Shipping.exe", "DeltaForce.exe"],
    },
    GameEntry {
        id: "fragpunk",
        name: "FragPunk",
        genre: "FPS & Shooters",
        exes: &["FragPunk.exe", "FragPunk-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "strinova",
        name: "Strinova",
        genre: "FPS & Shooters",
        exes: &["Strinova-Win64-Shipping.exe", "Strinova.exe", "Calabiyau.exe"],
    },
    GameEntry {
        id: "tf2",
        name: "Team Fortress 2",
        genre: "FPS & Shooters",
        exes: &["tf_win64.exe", "hl2.exe"],
    },
    GameEntry {
        id: "l4d2",
        name: "Left 4 Dead 2",
        genre: "FPS & Shooters",
        exes: &["left4dead2.exe"],
    },
    GameEntry {
        id: "payday3",
        name: "PAYDAY 3",
        genre: "FPS & Shooters",
        exes: &["PAYDAY3-Win64-Shipping.exe", "PAYDAY3.exe"],
    },
    GameEntry {
        id: "payday2",
        name: "PAYDAY 2",
        genre: "FPS & Shooters",
        exes: &["payday2_win32_release.exe"],
    },
    GameEntry {
        id: "huntshowdown",
        name: "Hunt: Showdown 1896",
        genre: "FPS & Shooters",
        exes: &["HuntGame.exe"],
    },
    GameEntry {
        id: "insurgency",
        name: "Insurgency: Sandstorm",
        genre: "FPS & Shooters",
        exes: &["InsurgencyClient-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "squad",
        name: "Squad",
        genre: "FPS & Shooters",
        exes: &["SquadGame.exe"],
    },
    GameEntry {
        id: "hellletloose",
        name: "Hell Let Loose",
        genre: "FPS & Shooters",
        exes: &["HLL-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "deeprockgalactic",
        name: "Deep Rock Galactic",
        genre: "FPS & Shooters",
        exes: &["FSD-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "killingfloor2",
        name: "Killing Floor 2",
        genre: "FPS & Shooters",
        exes: &["KFGame.exe"],
    },
    GameEntry {
        id: "spacemarine2",
        name: "Space Marine 2",
        genre: "FPS & Shooters",
        exes: &["Warhammer 40000 Space Marine 2 - Retail.exe"],
    },
    GameEntry {
        id: "darktide",
        name: "Warhammer 40,000: Darktide",
        genre: "FPS & Shooters",
        exes: &["Darktide.exe"],
    },
    GameEntry {
        id: "doometernal",
        name: "DOOM Eternal",
        genre: "FPS & Shooters",
        exes: &["DOOMEternalx64vk.exe"],
    },
    GameEntry {
        id: "borderlands3",
        name: "Borderlands 3",
        genre: "FPS & Shooters",
        exes: &["Borderlands3.exe"],
    },
    GameEntry {
        id: "bf2042",
        name: "Battlefield 2042",
        genre: "FPS & Shooters",
        exes: &["BF2042.exe"],
    },
    GameEntry {
        id: "bfv",
        name: "Battlefield V",
        genre: "FPS & Shooters",
        exes: &["bfv.exe"],
    },
    GameEntry {
        id: "bf1",
        name: "Battlefield 1",
        genre: "FPS & Shooters",
        exes: &["bf1.exe"],
    },

    // --- Battle Royale ---
    GameEntry {
        id: "apex",
        name: "Apex Legends",
        genre: "Battle Royale",
        exes: &["r5apex.exe", "r5apex_dx12.exe"],
    },
    GameEntry {
        id: "fortnite",
        name: "Fortnite",
        genre: "Battle Royale",
        exes: &["FortniteClient-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "pubg",
        name: "PUBG: BATTLEGROUNDS",
        genre: "Battle Royale",
        exes: &["TslGame.exe"],
    },
    GameEntry {
        id: "narakabladepoint",
        name: "Naraka: Bladepoint",
        genre: "Battle Royale",
        exes: &["NarakaBladepoint.exe"],
    },
    GameEntry {
        id: "superpeople",
        name: "Super People",
        genre: "Battle Royale",
        exes: &["BravoHotelClient-Win64-Shipping.exe"],
    },

    // --- MOBA & Strategy ---
    GameEntry {
        id: "leagueoflegends",
        name: "League of Legends",
        genre: "MOBA & Strategy",
        exes: &["League of Legends.exe", "LeagueClientUx.exe", "LeagueClient.exe"],
    },
    GameEntry {
        id: "dota2",
        name: "Dota 2",
        genre: "MOBA & Strategy",
        exes: &["dota2.exe"],
    },
    GameEntry {
        id: "smite2",
        name: "Smite 2",
        genre: "MOBA & Strategy",
        exes: &["Smite2-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "smite",
        name: "Smite",
        genre: "MOBA & Strategy",
        exes: &["Smite.exe"],
    },
    GameEntry {
        id: "heroesofthestorm",
        name: "Heroes of the Storm",
        genre: "MOBA & Strategy",
        exes: &["HeroesOfTheStorm_x64.exe"],
    },
    GameEntry {
        id: "starcraft2",
        name: "StarCraft II",
        genre: "MOBA & Strategy",
        exes: &["SC2_x64.exe"],
    },
    GameEntry {
        id: "aoe4",
        name: "Age of Empires IV",
        genre: "MOBA & Strategy",
        exes: &["RelicCardinal.exe"],
    },
    GameEntry {
        id: "aoe2de",
        name: "Age of Empires II: DE",
        genre: "MOBA & Strategy",
        exes: &["AoE2DE_s.exe"],
    },
    GameEntry {
        id: "totalwarwarhammer3",
        name: "Total War: Warhammer III",
        genre: "MOBA & Strategy",
        exes: &["Warhammer3.exe"],
    },
    GameEntry {
        id: "civ6",
        name: "Civilization VI",
        genre: "MOBA & Strategy",
        exes: &["CivilizationVI.exe", "CivilizationVI_DX12.exe"],
    },
    GameEntry {
        id: "civ7",
        name: "Civilization VII",
        genre: "MOBA & Strategy",
        exes: &["CivilizationVII.exe"],
    },
    GameEntry {
        id: "hoi4",
        name: "Hearts of Iron IV",
        genre: "MOBA & Strategy",
        exes: &["hoi4.exe"],
    },
    GameEntry {
        id: "stellaris",
        name: "Stellaris",
        genre: "MOBA & Strategy",
        exes: &["stellaris.exe"],
    },

    // --- Action & RPG ---
    GameEntry {
        id: "eldenring",
        name: "Elden Ring",
        genre: "Action & RPG",
        exes: &["eldenring.exe"],
    },
    GameEntry {
        id: "cyberpunk2077",
        name: "Cyberpunk 2077",
        genre: "Action & RPG",
        exes: &["Cyberpunk2077.exe"],
    },
    GameEntry {
        id: "bg3",
        name: "Baldur's Gate 3",
        genre: "Action & RPG",
        exes: &["bg3.exe", "bg3_dx11.exe"],
    },
    GameEntry {
        id: "helldivers2",
        name: "Helldivers 2",
        genre: "Action & RPG",
        exes: &["helldivers2.exe"],
    },
    GameEntry {
        id: "warframe",
        name: "Warframe",
        genre: "Action & RPG",
        exes: &["Warframe.x64.exe", "Warframe.exe"],
    },
    GameEntry {
        id: "poe",
        name: "Path of Exile",
        genre: "Action & RPG",
        exes: &["PathOfExile.exe", "PathOfExileSteam.exe", "PathOfExile_x64.exe"],
    },
    GameEntry {
        id: "poe2",
        name: "Path of Exile 2",
        genre: "Action & RPG",
        exes: &["PathOfExile2.exe", "PathOfExileSteam2.exe"],
    },
    GameEntry {
        id: "diablo4",
        name: "Diablo IV",
        genre: "Action & RPG",
        exes: &["Diablo IV.exe"],
    },
    GameEntry {
        id: "diablo2r",
        name: "Diablo II: Resurrected",
        genre: "Action & RPG",
        exes: &["D2R.exe"],
    },
    GameEntry {
        id: "genshin",
        name: "Genshin Impact",
        genre: "Action & RPG",
        exes: &["GenshinImpact.exe", "YuanShen.exe"],
    },
    GameEntry {
        id: "starrail",
        name: "Honkai: Star Rail",
        genre: "Action & RPG",
        exes: &["StarRail.exe"],
    },
    GameEntry {
        id: "zzz",
        name: "Zenless Zone Zero",
        genre: "Action & RPG",
        exes: &["ZenlessZoneZero.exe"],
    },
    GameEntry {
        id: "wutheringwaves",
        name: "Wuthering Waves",
        genre: "Action & RPG",
        exes: &["Client-Win64-Shipping.exe", "Wuthering Waves.exe"],
    },
    GameEntry {
        id: "wukong",
        name: "Black Myth: Wukong",
        genre: "Action & RPG",
        exes: &["b1-Win64-Shipping.exe", "b1.exe"],
    },
    GameEntry {
        id: "monsterhunterwilds",
        name: "Monster Hunter Wilds",
        genre: "Action & RPG",
        exes: &["MonsterHunterWilds.exe"],
    },
    GameEntry {
        id: "monsterhunterworld",
        name: "Monster Hunter: World",
        genre: "Action & RPG",
        exes: &["MonsterHunterWorld.exe"],
    },
    GameEntry {
        id: "monsterhunterrise",
        name: "Monster Hunter Rise",
        genre: "Action & RPG",
        exes: &["MonsterHunterRise.exe"],
    },
    GameEntry {
        id: "darksouls3",
        name: "Dark Souls III",
        genre: "Action & RPG",
        exes: &["DarkSoulsIII.exe"],
    },
    GameEntry {
        id: "darksouls1",
        name: "Dark Souls Remastered",
        genre: "Action & RPG",
        exes: &["DarkSoulsRemastered.exe"],
    },
    GameEntry {
        id: "sekiro",
        name: "Sekiro: Shadows Die Twice",
        genre: "Action & RPG",
        exes: &["sekiro.exe"],
    },
    GameEntry {
        id: "armoredcore6",
        name: "Armored Core VI",
        genre: "Action & RPG",
        exes: &["armoredcore6.exe"],
    },
    GameEntry {
        id: "liesofp",
        name: "Lies of P",
        genre: "Action & RPG",
        exes: &["LOP-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "witcher3",
        name: "The Witcher 3: Wild Hunt",
        genre: "Action & RPG",
        exes: &["witcher3.exe"],
    },
    GameEntry {
        id: "skyrim",
        name: "The Elder Scrolls V: Skyrim",
        genre: "Action & RPG",
        exes: &["SkyrimSE.exe", "TESV.exe"],
    },
    GameEntry {
        id: "fallout4",
        name: "Fallout 4",
        genre: "Action & RPG",
        exes: &["Fallout4.exe"],
    },
    GameEntry {
        id: "hogwartslegacy",
        name: "Hogwarts Legacy",
        genre: "Action & RPG",
        exes: &["HogwartsLegacy.exe"],
    },
    GameEntry {
        id: "starfield",
        name: "Starfield",
        genre: "Action & RPG",
        exes: &["Starfield.exe"],
    },
    GameEntry {
        id: "rdr2",
        name: "Red Dead Redemption 2",
        genre: "Action & RPG",
        exes: &["RDR2.exe"],
    },
    GameEntry {
        id: "gta5",
        name: "Grand Theft Auto V",
        genre: "Action & RPG",
        exes: &["GTA5.exe", "FiveM.exe", "PlayGTAV.exe"],
    },
    GameEntry {
        id: "dragonsdogma2",
        name: "Dragon's Dogma 2",
        genre: "Action & RPG",
        exes: &["DD2.exe"],
    },
    GameEntry {
        id: "remnant2",
        name: "Remnant II",
        genre: "Action & RPG",
        exes: &["Remnant2-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "ff16",
        name: "Final Fantasy XVI",
        genre: "Action & RPG",
        exes: &["ff16.exe"],
    },
    GameEntry {
        id: "ff7rebirth",
        name: "Final Fantasy VII Rebirth",
        genre: "Action & RPG",
        exes: &["ff7rebirth.exe"],
    },
    GameEntry {
        id: "ff7remake",
        name: "Final Fantasy VII Remake",
        genre: "Action & RPG",
        exes: &["ff7remake.exe"],
    },

    // --- Survival, Sandbox & Horror ---
    GameEntry {
        id: "dbd",
        name: "Dead by Daylight",
        genre: "Survival & Horror",
        exes: &["DeadByDaylight-Win64-Shipping.exe", "DeadByDaylight-EGS-Shipping.exe", "DeadByDaylight.exe"],
    },
    GameEntry {
        id: "minecraft",
        name: "Minecraft",
        genre: "Survival & Horror",
        exes: &["javaw.exe", "Minecraft.Windows.exe", "Minecraft.exe"],
    },
    GameEntry {
        id: "roblox",
        name: "Roblox",
        genre: "Survival & Horror",
        exes: &["RobloxPlayerBeta.exe", "RobloxPlayerLauncher.exe"],
    },
    GameEntry {
        id: "rust",
        name: "Rust",
        genre: "Survival & Horror",
        exes: &["RustClient.exe"],
    },
    GameEntry {
        id: "palworld",
        name: "Palworld",
        genre: "Survival & Horror",
        exes: &["Palworld-Win64-Shipping.exe", "Pal-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "oncehuman",
        name: "Once Human",
        genre: "Survival & Horror",
        exes: &["ONCE_HUMAN.exe"],
    },
    GameEntry {
        id: "arkascended",
        name: "ARK: Survival Ascended",
        genre: "Survival & Horror",
        exes: &["ArkAscended.exe"],
    },
    GameEntry {
        id: "arkevolved",
        name: "ARK: Survival Evolved",
        genre: "Survival & Horror",
        exes: &["ShooterGame.exe"],
    },
    GameEntry {
        id: "sonsoftheforest",
        name: "Sons of the Forest",
        genre: "Survival & Horror",
        exes: &["SonsOfTheForest.exe"],
    },
    GameEntry {
        id: "theforest",
        name: "The Forest",
        genre: "Survival & Horror",
        exes: &["TheForest.exe"],
    },
    GameEntry {
        id: "valheim",
        name: "Valheim",
        genre: "Survival & Horror",
        exes: &["valheim.exe"],
    },
    GameEntry {
        id: "terraria",
        name: "Terraria",
        genre: "Survival & Horror",
        exes: &["Terraria.exe"],
    },
    GameEntry {
        id: "enshrouded",
        name: "Enshrouded",
        genre: "Survival & Horror",
        exes: &["enshrouded.exe"],
    },
    GameEntry {
        id: "vrising",
        name: "V Rising",
        genre: "Survival & Horror",
        exes: &["VRising.exe"],
    },
    GameEntry {
        id: "7daystodie",
        name: "7 Days to Die",
        genre: "Survival & Horror",
        exes: &["7DaysToDie.exe"],
    },
    GameEntry {
        id: "projectzomboid",
        name: "Project Zomboid",
        genre: "Survival & Horror",
        exes: &["ProjectZomboid64.exe", "ProjectZomboid32.exe"],
    },
    GameEntry {
        id: "lethalcompany",
        name: "Lethal Company",
        genre: "Survival & Horror",
        exes: &["Lethal Company.exe"],
    },
    GameEntry {
        id: "phasmophobia",
        name: "Phasmophobia",
        genre: "Survival & Horror",
        exes: &["Phasmophobia.exe"],
    },
    GameEntry {
        id: "subnautica",
        name: "Subnautica",
        genre: "Survival & Horror",
        exes: &["Subnautica.exe"],
    },
    GameEntry {
        id: "seaofthieves",
        name: "Sea of Thieves",
        genre: "Survival & Horror",
        exes: &["SoTGame.exe"],
    },
    GameEntry {
        id: "nomanssky",
        name: "No Man's Sky",
        genre: "Survival & Horror",
        exes: &["NMS.exe"],
    },
    GameEntry {
        id: "raft",
        name: "Raft",
        genre: "Survival & Horror",
        exes: &["Raft.exe"],
    },
    GameEntry {
        id: "dontstarvetogether",
        name: "Don't Starve Together",
        genre: "Survival & Horror",
        exes: &["dontstarve_steam_x64.exe", "dontstarve_steam.exe"],
    },

    // --- Fighting, Sports & MMO ---
    GameEntry {
        id: "streetfighter6",
        name: "Street Fighter 6",
        genre: "Fighting & Sports",
        exes: &["StreetFighter6.exe"],
    },
    GameEntry {
        id: "tekken8",
        name: "Tekken 8",
        genre: "Fighting & Sports",
        exes: &["Polaris-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "mortalkombat1",
        name: "Mortal Kombat 1",
        genre: "Fighting & Sports",
        exes: &["MK12.exe"],
    },
    GameEntry {
        id: "guiltygearstrive",
        name: "Guilty Gear -Strive-",
        genre: "Fighting & Sports",
        exes: &["GGST-Win64-Shipping.exe"],
    },
    GameEntry {
        id: "brawlhalla",
        name: "Brawlhalla",
        genre: "Fighting & Sports",
        exes: &["Brawlhalla.exe"],
    },
    GameEntry {
        id: "rocketleague",
        name: "Rocket League",
        genre: "Fighting & Sports",
        exes: &["RocketLeague.exe"],
    },
    GameEntry {
        id: "ea_fc25",
        name: "EA Sports FC 25",
        genre: "Fighting & Sports",
        exes: &["FC25.exe"],
    },
    GameEntry {
        id: "ea_fc24",
        name: "EA Sports FC 24",
        genre: "Fighting & Sports",
        exes: &["FC24.exe"],
    },
    GameEntry {
        id: "nba2k25",
        name: "NBA 2K25",
        genre: "Fighting & Sports",
        exes: &["NBA2K25.exe"],
    },
    GameEntry {
        id: "forzahorizon5",
        name: "Forza Horizon 5",
        genre: "Fighting & Sports",
        exes: &["ForzaHorizon5.exe"],
    },
    GameEntry {
        id: "wow",
        name: "World of Warcraft",
        genre: "Fighting & Sports",
        exes: &["Wow.exe", "WowClassic.exe"],
    },
    GameEntry {
        id: "ffxiv",
        name: "Final Fantasy XIV",
        genre: "Fighting & Sports",
        exes: &["ffxiv_dx11.exe", "ffxiv.exe"],
    },
    GameEntry {
        id: "guildwars2",
        name: "Guild Wars 2",
        genre: "Fighting & Sports",
        exes: &["Gw2-64.exe"],
    },
    GameEntry {
        id: "eso",
        name: "The Elder Scrolls Online",
        genre: "Fighting & Sports",
        exes: &["eso64.exe"],
    },
    GameEntry {
        id: "lostark",
        name: "Lost Ark",
        genre: "Fighting & Sports",
        exes: &["LOSTARK.exe"],
    },
    GameEntry {
        id: "osrs",
        name: "Old School RuneScape",
        genre: "Fighting & Sports",
        exes: &["osclient.exe", "RuneLite.exe"],
    },
];

/// Finds a game entry from the catalog by matching any of its associated executable names (case-insensitive).
pub fn find_game_by_exe(exe: &str) -> Option<&'static GameEntry> {
    let t = exe.trim();
    if t.is_empty() {
        return None;
    }
    GAMES_CATALOG.iter().find(|g| {
        g.exes.iter().any(|e| e.eq_ignore_ascii_case(t))
    })
}

/// Returns true if the given executable name matches any catalog title or user custom exe list.
pub fn is_target_active(
    exe: &str,
    smart_all: bool,
    enabled_ids: &[String],
    custom_exes: &[String],
    legacy_exe: &str,
) -> bool {
    let t = exe.trim();
    if t.is_empty() {
        return false;
    }

    // Check custom target exes
    if custom_exes.iter().any(|c| c.trim().eq_ignore_ascii_case(t)) {
        return true;
    }

    // Check legacy single-target exe
    if !legacy_exe.is_empty() && legacy_exe.eq_ignore_ascii_case(t) {
        return true;
    }

    if let Some(entry) = find_game_by_exe(t) {
        if smart_all || enabled_ids.is_empty() {
            return true;
        }
        return enabled_ids.iter().any(|id| id.eq_ignore_ascii_case(entry.id));
    }

    false
}
