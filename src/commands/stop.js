import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { queues } from "../utils/queue.js";

export const data = new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stops the music and clears the queue.");

export async function execute(interaction) {
    const serverQueue = queues.get(interaction.guildId);

    if (!serverQueue) {
        return interaction.reply({ content: "❌ Bot không đang trong voice channel.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.voiceChannel.id !== interaction.member.voice.channelId) {
        return interaction.reply({ content: "❌ Bạn phải ở cùng kênh thoại với bot.", flags: MessageFlags.Ephemeral });
    }

    serverQueue.stop();
    await interaction.reply("⏹️ Đã dừng và xóa hàng đợi. Bot đã rời kênh voice.");
}