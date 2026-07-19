/**
 * ARK: Survival Evolved - GameUserSettings.ini + Game.ini.
 *
 * Keys live under several INI sections, so field addresses are section-qualified
 * via addr(). ARK INI keys are case-insensitive (handled by the ci INI format),
 * booleans are True/False, strings unquoted. Repeated/array keys
 * (PerLevelStatsMultiplier[...], engram overrides, etc.) are intentionally NOT
 * in the schema - they fall through to the raw "Advanced" groups untouched.
 */
import type { FieldDef, Schema } from '../../formats/types';
import { addr } from '../../formats/shared';

// Section-scoped field builders (key becomes a section-qualified address).
const b = (s: string, k: string, l: string): FieldDef => ({ key: addr(s, k), label: l, type: 'bool' });
const nf = (s: string, k: string, l: string): FieldDef => ({ key: addr(s, k), label: l, type: 'number' });
const tf = (s: string, k: string, l: string): FieldDef => ({ key: addr(s, k), label: l, type: 'text' });

const SS = 'ServerSettings';
const SESS = 'SessionSettings';
const GSESS = '/Script/Engine.GameSession';
const MOTD = 'MessageOfTheDay';
const GM = '/script/shootergame.shootergamemode';

export const arkGameUserSettingsSchema: Schema = [
    {
        id: 'identity',
        title: 'Server / Identity',
        icon: 'fa-solid fa-id-card',
        fields: [
            tf(SESS, 'SessionName', 'Server name (browser)'),
            nf(GSESS, 'MaxPlayers', 'Max players'),
            tf(SS, 'ServerPassword', 'Join password (blank = open)'),
            tf(SS, 'ServerAdminPassword', 'Admin / RCON password'),
            b(SS, 'ServerPVE', 'PvE mode (no PvP)'),
            b(SS, 'ServerHardcore', 'Hardcore (death resets to lvl 1)'),
            b(SS, 'ServerCrosshair', 'Show crosshair'),
            b(SS, 'RCONEnabled', 'Enable RCON'),
            nf(SS, 'RCONPort', 'RCON port'),
        ],
    },
    {
        id: 'rates',
        title: 'Rates & Difficulty',
        icon: 'fa-solid fa-gauge-high',
        fields: [
            nf(SS, 'XPMultiplier', 'XP rate'),
            nf(SS, 'TamingSpeedMultiplier', 'Taming speed'),
            nf(SS, 'HarvestAmountMultiplier', 'Harvest amount'),
            nf(SS, 'HarvestHealthMultiplier', 'Resource node HP'),
            nf(SS, 'ResourcesRespawnPeriodMultiplier', 'Resource respawn time (lower = faster)'),
            nf(SS, 'DifficultyOffset', 'Difficulty offset (0-1)'),
            nf(SS, 'OverrideOfficialDifficulty', 'Override difficulty (5 = max lvl 150)'),
            nf(SS, 'DayCycleSpeedScale', 'Day/night cycle speed'),
            nf(SS, 'DayTimeSpeedScale', 'Daytime length'),
            nf(SS, 'NightTimeSpeedScale', 'Nighttime length'),
        ],
    },
    {
        id: 'combat',
        title: 'Combat & Structures',
        icon: 'fa-solid fa-gavel',
        fields: [
            nf(SS, 'PlayerDamageMultiplier', 'Player damage dealt'),
            nf(SS, 'PlayerResistanceMultiplier', 'Player damage taken (lower = tankier)'),
            nf(SS, 'DinoDamageMultiplier', 'Wild dino damage'),
            nf(SS, 'DinoResistanceMultiplier', 'Wild dino damage taken'),
            nf(SS, 'StructureDamageMultiplier', 'Structure damage dealt'),
            nf(SS, 'StructureResistanceMultiplier', 'Structure damage taken'),
        ],
    },
    {
        id: 'toggles',
        title: 'Rules & Toggles',
        icon: 'fa-solid fa-sliders',
        fields: [
            b(SS, 'allowThirdPersonPlayer', 'Allow 3rd-person camera'),
            b(SS, 'ShowMapPlayerLocation', 'Show player location on map'),
            b(SS, 'globalVoiceChat', 'Global voice chat'),
            b(SS, 'proximityChat', 'Proximity-only chat'),
            b(SS, 'alwaysNotifyPlayerJoined', 'Broadcast joins'),
            b(SS, 'alwaysNotifyPlayerLeft', 'Broadcast leaves'),
            b(SS, 'serverForceNoHUD', 'Force HUD off'),
            b(SS, 'ShowFloatingDamageText', 'Floating damage numbers'),
            b(SS, 'EnablePvPGamma', 'Allow gamma in PvP'),
            b(SS, 'AllowFlyerCarryPvE', 'Flyers carry wild dinos (PvE)'),
            b(SS, 'DisableStructureDecayPvE', 'Disable PvE structure decay'),
            nf(SS, 'PvEStructureDecayPeriodMultiplier', 'PvE decay timer'),
            b(SS, 'AllowCaveBuildingPvE', 'Allow cave building (PvE)'),
            b(SS, 'ClampResourceHarvestDamage', 'Clamp harvest damage'),
            nf(SS, 'MaxTamedDinos', 'Server tame cap'),
            nf(SS, 'AutoSavePeriodMinutes', 'Auto-save interval (min)'),
            b(SS, 'bUseSingleplayerSettings', 'Use singleplayer balance'),
        ],
    },
    {
        id: 'motd',
        title: 'Message of the Day',
        icon: 'fa-solid fa-comment',
        fields: [tf(MOTD, 'Message', 'MOTD message'), nf(MOTD, 'Duration', 'MOTD duration (s)')],
    },
];

export const arkGameIniSchema: Schema = [
    {
        id: 'breeding',
        title: 'Breeding & Imprinting',
        icon: 'fa-solid fa-egg',
        fields: [
            nf(GM, 'BabyMatureSpeedMultiplier', 'Baby maturation speed'),
            nf(GM, 'MatingIntervalMultiplier', 'Mating cooldown (lower = faster)'),
            nf(GM, 'EggHatchSpeedMultiplier', 'Egg hatch speed'),
            nf(GM, 'BabyCuddleIntervalMultiplier', 'Imprint cuddle interval (lower = fewer)'),
            nf(GM, 'BabyImprintingStatScaleMultiplier', 'Imprint stat bonus'),
            nf(GM, 'BabyImprintAmountMultiplier', 'Imprint % per cuddle'),
            nf(GM, 'BabyFoodConsumptionSpeedMultiplier', 'Baby food drain'),
            nf(GM, 'MatingSpeedMultiplier', 'Mating speed'),
            nf(GM, 'LayEggIntervalMultiplier', 'Wild egg drop frequency'),
        ],
    },
    {
        id: 'gameplay',
        title: 'Gameplay & Progression',
        icon: 'fa-solid fa-arrow-trend-up',
        fields: [
            nf(GM, 'GlobalSpoilingTimeMultiplier', 'Spoil timers'),
            nf(GM, 'PassiveTameIntervalMultiplier', 'Passive-tame feed interval'),
            nf(GM, 'CropGrowthSpeedMultiplier', 'Crop growth speed'),
            nf(GM, 'OverrideMaxExperiencePointsPlayer', 'Player XP cap'),
            nf(GM, 'OverrideMaxExperiencePointsDino', 'Dino XP cap'),
            b(GM, 'bUseCorpseLocator', 'Show death-bag beam'),
            b(GM, 'bAllowUnlimitedRespecs', 'Unlimited mindwipes'),
        ],
    },
];
