import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";
import 'dotenv/config';

// --- Mapeos de Regiones ---
// Plataforma (LA2) a Región de Enrutamiento (americas)
const PLATFORM_TO_ACCOUNT_REGION = {
    "LA1": "americas", "LA2": "americas", "NA1": "americas",
    "BR1": "americas", "EUW1": "europe", "EUN1": "europe", "KR": "asia",
};

// Plataforma (LA2) a Región de OP.GG (las)
const PLATFORM_TO_OPGG_REGION = {
  "LA1": "lan", "LA2": "las", "NA1": "na",
  "BR1": "br", "EUW1": "euw", "EUN1": "eune", "KR": "kr"
};

// --- IDs de Colas de Riot ---
const QUEUE_ID_RANKED_SOLO = 420; // Ranked Solo/Duo
const QUEUE_ID_RANKED_FLEX = 440; // Ranked Flex

// --- Configuración de API ---
const RIOT_API_CONFIG = {
  headers: { "X-Riot-Token": process.env.RIOT_API_KEY }
};

// --- Funciones de la API ---

// 1. Obtener PUUID desde el Riot ID
async function getAccountData(gameName, tagLine, accountRegion) {
  const url = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return axios.get(url, RIOT_API_CONFIG);
}

// 2. Obtener lista de IDs de partidas por PUUID
async function getMatchIds(puuid, accountRegion, queueId, count = 10) {
  const url = `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queueId}&start=0&count=${count}`;
  return axios.get(url, RIOT_API_CONFIG);
}

// 3. Obtener los detalles de una partida específica por su ID
async function getMatchData(matchId, accountRegion) {
  const url = `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  return axios.get(url, RIOT_API_CONFIG);
}

// --- Comando ---
export default {
  data: new SlashCommandBuilder()
    .setName("lolhistory")
    .setDescription("Muestra las últimas 5 partidas de SoloQ de un jugador.")
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

      // 2. Obtener IDs de partidas (SoloQ, últimas 5)
      const matchIdsResponse = await getMatchIds(puuid, accountRegion, QUEUE_ID_RANKED_SOLO, 5);
      const matchIds = matchIdsResponse.data;

      if (matchIds.length === 0) {
        return interaction.editReply("No se encontraron partidas de SoloQ recientes para este jugador.");
      }

      // 3. Obtener detalles de todas las partidas en paralelo
      const matchPromises = matchIds.map(matchId => getMatchData(matchId, accountRegion));
      const matchResponses = await Promise.all(matchPromises);

      const historyDescription = [];

      // 4. Procesar cada partida
      for (const matchResponse of matchResponses) {
        const matchData = matchResponse.data.info;
        
        // Encontrar a nuestro jugador en la partida
        const player = matchData.participants.find(p => p.puuid === puuid);
        if (!player) continue;

        // Formatear KDA
        const kda = `${player.kills}/${player.deaths}/${player.assists}`;
        
        // Formatear resultado (Victoria/Derrota)
        const outcomeEmoji = player.win ? "🟩" : "🟥";
        const outcomeText = player.win ? "Victoria" : "Derrota";

        historyDescription.push(
          `${outcomeEmoji} **${outcomeText}** | ${player.championName} (**${kda}**)`
        );
      }
      
      // 5. Crear Embed
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setAuthor({ name: `${gameName}#${tagLine} - Historial SoloQ`, url: opggUrl })
        .setDescription(historyDescription.join('\n'))
        .setFooter({ text: `Región: ${opggRegion.toUpperCase()} ` });

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