import { Client, GatewayIntentBits, Collection, MessageFlags } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

dotenv.config();

// Ghi log (không nuốt lỗi) để một bài hát lỗi không làm bot sập âm thầm
process.on("unhandledRejection", (reason) => {
    console.error("❌ unhandledRejection:", reason);
});
process.on("uncaughtException", (err, origin) => {
    console.error(`❌ uncaughtException (${origin}):`, err);
});

// @discordjs/voice tính delay = nextTime - Date.now() cho vòng lặp audio; khi event loop bị
// chậm (ví dụ lúc spawn yt-dlp/ffmpeg) giá trị này âm -> TimeoutNegativeWarning.
// Kẹp delay âm về 0 (Node vốn đã coi là 1ms nên hành vi không đổi).
const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = Object.assign(
    (fn, delay, ...args) => nativeSetTimeout(fn, typeof delay === "number" && delay < 0 ? 0 : delay, ...args),
    nativeSetTimeout
);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildVoiceStates
    ] 
});

client.commands = new Collection();
const commandsPath = path.join(process.cwd(), "src", "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));

async function loadCommands() {
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        const command = await import(fileUrl);
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    }
}

client.once("clientReady", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        
        const errorMessage = { content: "❌ Có lỗi khi thực thi lệnh!", flags: MessageFlags.Ephemeral };
        
        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

loadCommands().then(() => client.login(process.env.DISCORD_TOKEN));