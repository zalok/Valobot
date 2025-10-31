import { Client, GatewayIntentBits, Collection, REST, Routes } from "discord.js";
import fs from "fs";
import "dotenv/config";
import axios from "axios";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// 🔹 Cargar comandos desde la carpeta
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const commandsJSON = [];

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  client.commands.set(command.default.data.name, command.default);
  commandsJSON.push(command.default.data.toJSON());
}

// 🔹 Registrar comandos automáticamente al iniciar
client.once("ready", async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("🚀 Registrando comandos slash...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commandsJSON }
    );
    console.log("✅ Comandos registrados correctamente.");
  } catch (error) {
    console.error("❌ Error registrando comandos:", error);
  }
});

// 🔹 Manejo de interacciones (slash commands)
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "Ocurrió un error al ejecutar este comando.",
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
