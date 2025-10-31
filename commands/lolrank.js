import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import 'dotenv/config';

// --- URLs de Imágenes de Rangos (¡Ruta actualizada!) ---
const getRankImageUrl = (tier) => {
  const tierName = tier ? tier.toLowerCase() : 'unranked';
  // Usando la ruta que encontraste:
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tierName}.png`;
};

// --- Mapeo de Colas ---
const QUEUE_NAMES = {
  "RANKED_SOLO_5x5": "Solo/Duo",
  "RANKED_FLEX_SR": "Flex 5v5"
};

// --- Helper para calcular ELO ---
const TIER_ORDER = {
  "IRON": 0, "BRONZE": 1, "SILVER": 2, "GOLD": 3, "PLATINUM": 4, 
  "EMERALD": 5, "DIAMOND": 6, "MASTER": 7, "GRANDMASTER": 8, "CHALLENGER": 9
};
const RANK_ORDER = { "IV": 0, "III": 1, "II": 2, "I": 3 };

const getRankScore = (rank) => {
  if (!rank || !rank.tier || !(rank.tier in TIER_ORDER)) return 0;
  const rankValue = (rank.rank in RANK_ORDER) ? RANK_ORDER[rank.rank] : 4;
  return (TIER_ORDER[rank.tier] * 1000) + (rankValue * 100) + (rank.leaguePoints || 0);
};

// --- Mapeos de Regiones ---
const PLATFORM_TO_ACCOUNT_REGION = {
    "LA1": "americas", "LA2": "americas", "NA1": "americas",
    "BR1": "americas", "EUW1": "europe", "EUN1": "europe", "KR": "asia",
};

const PLATFORM_TO_OPGG_REGION = {
  "LA1": "lan", "LA2": "las", "NA1": "na",
  "BR1": "br", "EUW1": "euw", "EUN1": "eune", "KR": "kr"
};

// --- Configuración de API ---
const RIOT_API_CONFIG = {
  headers: { "X-Riot-Token": process.env.RIOT_API_KEY }
};

// --- Funciones de la API ---
async function getAccountData(gameName, tagLine, accountRegion) {
  const url = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return axios.get(url, RIOT_API_CONFIG);
}

async function getSummonerData(puuid, platform) {
    const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    return axios.get(url, RIOT_API_CONFIG);
}

async function getRankDataByPUUID(puuid, platform) {
  const url = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  return axios.get(url, RIOT_API_CONFIG);
}

// --- Comando ---
export default {
  data: new SlashCommandBuilder()
    .setName("lolrank")
    .setDescription("Muestra el rango más alto (SoloQ o Flex) de un jugador.")
    .addStringOption(option =>
      option.setName("usuario")
        .setDescription("Nombre del jugador (SIN el #tag)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Tag del jugador (SIN el #)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("region")
        .setDescription("Región del jugador (ej: LAS, LAN, NA, EUW)")
        .setRequired(true)
        .addChoices(
            { name: "LAS", value: "LA2" }, { name: "LAN", value: "LA1" },
            { name: "NA", value: "NA1" }, { name: "EUW", value: "EUW1" },
            { name: "EUNE", value: "EUN1" }, { name: "KR", value: "KR" },
            { name: "BR", value: "BR1" }
        )),

  async execute(interaction) {
    const gameName = interaction.options.getString("usuario");
    const tagLine = interaction.options.getString("tag");
    const platform = interaction.options.getString("region"); 
    const accountRegion = PLATFORM_TO_ACCOUNT_REGION[platform]; 
    const opggRegion = PLATFORM_TO_OPGG_REGION[platform]; 
    const opggUrl = `https://www.op.gg/summoners/${opggRegion}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;

    if (!accountRegion) {
        return interaction.reply({ content: "Esa región no es válida.", ephemeral: true });
    }

    await interaction.deferReply();

    try {
      // 1. Obtener PUUID
      const accountResponse = await getAccountData(gameName, tagLine, accountRegion);
      const puuid = accountResponse.data.puuid;
      if (!puuid) return interaction.editReply(`No se encontró la cuenta: ${gameName}#${tagLine}`);

      // 2. Obtener icono de invocador
      let summonerIconUrl = null;
      try {
        const summonerResponse = await getSummonerData(puuid, platform);
        const iconId = summonerResponse.data.profileIconId;
        if (iconId) {
          summonerIconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
        }
      } catch (iconError) {
        console.log(`[AVISO] No se pudo obtener el icono de perfil para ${gameName}#${tagLine}.`);
      }

      // 3. Obtener datos de rango
      const rankResponse = await getRankDataByPUUID(puuid, platform);
      const rankData = rankResponse.data.filter(q => q.queueType in QUEUE_NAMES);

      let highestRank = null;

      if (rankData.length > 0) {
        // Calcular el puntaje de cada cola y ordenarlas
        const scoredRanks = rankData.map(rank => ({
          ...rank,
          score: getRankScore(rank)
        }));
        
        scoredRanks.sort((a, b) => b.score - a.score);
        highestRank = scoredRanks[0]; // El rango más alto
      }
      
      // 5. Crear Embed
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setFooter({ text: `Región: ${opggRegion.toUpperCase()}` });

      if (summonerIconUrl) {
        embed.setThumbnail(summonerIconUrl);
      }

      if (highestRank) {
        // Si tiene rango, mostrarlo
        const wins = highestRank.wins;
        const losses = highestRank.losses;
        const totalGames = wins + losses;
        const winrate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : 0;
        const tier = highestRank.tier;
        const rank = highestRank.rank;
        const lp = highestRank.leaguePoints;
        
        embed.setTitle(`${gameName}#${tagLine}`)
        embed.setDescription(
          `**Rango:** ${tier} ${rank} (${lp} LP)\n` +
          `**Victorias:** ${wins}\n` +
          `**Derrotas:** ${losses}\n` +
          `**Winrate:** ${winrate}%`
        );
        embed.setImage(getRankImageUrl(tier)); // <-- URL de imagen actualizada

      } else {
        // Si no tiene rango en ninguna cola
        embed.setTitle("Unranked");
        embed.setDescription("Este jugador no tiene rango en Solo/Duo o Flex esta temporada.");
        embed.setImage(getRankImageUrl(null)); // <-- URL de imagen actualizada
      }

      await interaction.editReply({ embeds: [embed] });
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (err) {
          console.error("No se pudo eliminar el mensaje:", err.message);
        }
      }, 60000);

    } catch (error) {
      console.error("[ERROR CAPTURADO EN CATCH]");
      
      if (error.response) {
        console.error(`URL: ${error.config.url}`);
        console.error(`Status: ${error.response.status} (${error.response.statusText})`);
      } else {
        console.error("Error en la lógica del bot:", error.message);
      }
      
      if (error.response?.status === 404) {
        await interaction.editReply(`No se pudo encontrar al jugador **${gameName}#${tagLine}** en la región **${platform}**.`);
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        await interaction.editReply("La API Key de Riot no es válida o expiró. Revisa tu .env y reinicia el bot.");
      } else {
        await interaction.editReply("Ocurrió un error al consultar la API de Riot Games.");
      }
    }
  }
};