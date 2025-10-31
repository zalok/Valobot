import { REST, Routes } from "discord.js";
import "dotenv/config";
import fs from "fs";

const commands = [];
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

try {
  console.log("Actualizando comandos slash...");
  await rest.put(
    Routes.applicationCommands("1305633239825780908"),
    { body: commands }
  );
  console.log("Comandos registrados correctamente.");
} catch (error) {
  console.error(error);
}
