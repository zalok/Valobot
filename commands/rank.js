import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import axios from "axios";

export default {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Muestra el rango actual, peak y foto de perfil de un jugador de Valorant")
    .addStringOption(option =>
      option.setName("usuario")
        .setDescription("Nombre del jugador (ejemplo: TenZ)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Tag del jugador (ejemplo: 1234)")
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
            const url = `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${username}/${tag}`;
      
            const response = await axios.get(url, {
              headers: { Authorization: process.env.HENRIK_API_KEY }
            });
      
            const data = response.data;
      
            if (data.status !== 200 || !data.data) {
              return interaction.editReply("No se encontró al jugador o no tiene partidas clasificadas.");
            }
      
            const player = data.data;
      
            const accountUrl = `https://api.henrikdev.xyz/valorant/v1/account/${username}/${tag}`;
            const accountResponse = await axios.get(accountUrl, {
              headers: { Authorization: process.env.HENRIK_API_KEY }
            });
            const accountData = accountResponse.data.data;
            const cardImage = accountData.card?.large || accountData.card?.wide || null;
      
            // Aquí añadimos el peak rank:  
            const peakRank = player.highest_rank?.patched_tier
              ? player.highest_rank.patched_tier
              : "No disponible";
      
            const embed = new EmbedBuilder()
              .setColor(0xff4655)
              .setTitle(`${player.name}#${player.tag}`)
              .setDescription(
                `**Rango actual:** ${player.current_data.currenttierpatched}\n` +
                `**RR:** ${player.current_data.ranking_in_tier}\n` +
                `**Peak rank:** ${player.highest_rank.patched_tier}\n` +
                `**Región:** ${region.toUpperCase()}`
              )
              .setThumbnail(player.current_data.images.small)
              .setImage(cardImage);
      
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
            if (error.response?.status === 401) {
              await interaction.editReply("Tu API Key no es válida o expiró.");
            } else {
              await interaction.editReply("Ocurrió un error al consultar la API de Valorant.");
            }
          }
        }
      };
