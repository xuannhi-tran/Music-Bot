import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { queues } from "../utils/queue.js";

export const data = new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resumes the currently paused music.");

export async function execute(interaction) {
    const serverQueue = queues.get(interaction.guildId);

    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply({ content: "❌ Không có nhạc đang phát.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.voiceChannel.id !== interaction.member.voice.channelId) {
        return interaction.reply({ content: "❌ Bạn phải ở cùng kênh thoại với bot.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.resume()) {
        await interaction.reply("▶️ Đã tiếp tục phát nhạc.");
    } else {
        await interaction.reply({ content: "❌ Nhạc không ở trạng thái tạm dừng.", flags: MessageFlags.Ephemeral });
    }
}