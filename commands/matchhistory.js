import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";

export default {
  data: new SlashCommandBuilder()
    .setName("matchhistory")
    .setDescription("Muestra el historial de partidas ranked de un jugador de Valorant")
    .addStringOption(option =>
      option.setName("usuario")
        .setDescription("Nombre del jugador (ejemplo: TenZ)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Tag del jugador (ejemplo: NA1)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("region")
        .setDescription("Región del jugador (latam, na, eu...)")
        .setRequired(false)),

  async execute(interaction) {
    const username = interaction.options.getString("usuario");
    const tag = interaction.options.getString("tag");
    const region = interaction.options.getString("region") || "latam";

    await interaction.deferReply();

    try {
      // === 1. Obtener historial de partidas ===
      const matchUrl = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${username}/${tag}`;
      const matchResp = await axios.get(matchUrl, {
        headers: { Authorization: process.env.HENRIK_API_KEY }
      });
      const matches = matchResp.data.data?.filter(m => m.metadata.mode === "Competitive") || [];
      if (matches.length === 0) return interaction.editReply("No se encontraron partidas ranked recientes.");

      // === 2. Obtener historial de RR ===
      const mmrUrl = `https://api.henrikdev.xyz/valorant/v1/mmr-history/${region}/${username}/${tag}`;
      const mmrResp = await axios.get(mmrUrl, {
        headers: { Authorization: process.env.HENRIK_API_KEY }
      });
      const mmrHistory = mmrResp.data.data || [];

      // === 3. Construir lista de partidas ===
      const history = matches.slice(0, 10).map((match, i) => {
        const player = match.players.all_players.find(p =>
          p.name.toLowerCase() === username.toLowerCase() &&
          p.tag.toLowerCase() === tag.toLowerCase()
        );

        if (!player) return null;

        const map = match.metadata.map;
        const kd = (player.stats.kills / Math.max(1, player.stats.deaths)).toFixed(2);
        const hasWon = player.team.toLowerCase() === match.teams?.[player.team.toLowerCase()]?.has_won ? true : false;
        const rrChange = mmrHistory[i]?.mmr_change_to_last_game ?? 0;
        const rrSign = rrChange >= 0 ? `+${rrChange}` : `${rrChange}`;
        const colorEmoji = rrChange >= 0 ? "🟩" : "🟥";

        return `${colorEmoji} **${map}** | KD: ${kd} | RR: ${rrSign}`;
      }).filter(Boolean);

      // === 4. Crear embed ===
      const embed = new EmbedBuilder()
        .setTitle(`Historial Ranked de ${username}#${tag}`)
        .setDescription(history.join("\n"))
        .setColor(0x00ff85)
        .setFooter({ text: `• Región: ${region.toUpperCase()}` });

      await interaction.editReply({ embeds: [embed] });
      setTimeout(async () => {
        try {
          await interaction.deleteReply();
        } catch (err) {
          console.error("No se pudo eliminar el mensaje:", err.message);
        }
      }, 60000);

    } catch (error) {
      console.error(error);
      if (error.response?.status === 404)
        await interaction.editReply("No se encontró información para ese jugador.");
      else if (error.response?.status === 401)
        await interaction.editReply("Tu API Key no es válida o expiró.");
      else
        await interaction.editReply("Ocurrió un error al obtener el historial de partidas.");
    }
  }
};
