import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { queues } from "../utils/queue.js";

export const data = new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pauses the currently playing music.");

export async function execute(interaction) {
    const serverQueue = queues.get(interaction.guildId);

    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply({ content: "❌ Không có nhạc đang phát.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.voiceChannel.id !== interaction.member.voice.channelId) {
        return interaction.reply({ content: "❌ Bạn phải ở cùng kênh thoại với bot.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.isPaused) {
        return interaction.reply({ content: "❌ Nhạc đã được tạm dừng rồi.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.pause()) {
        await interaction.reply("⏸️ Đã tạm dừng nhạc.");
    } else {
        await interaction.reply({ content: "❌ Không có nhạc đang phát.", flags: MessageFlags.Ephemeral });
    }
}