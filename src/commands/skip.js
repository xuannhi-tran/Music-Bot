// src/commands/skip.js
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { queues } from "../utils/queue.js";

export const data = new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skips the current song in the queue.");

export async function execute(interaction) {
    const serverQueue = queues.get(interaction.guildId);

    if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply({ content: "❌ Hàng đợi trống, không thể bỏ qua.", flags: MessageFlags.Ephemeral });
    }

    if (serverQueue.voiceChannel.id !== interaction.member.voice.channelId) {
        return interaction.reply({ content: "❌ Bạn phải ở cùng kênh thoại với bot.", flags: MessageFlags.Ephemeral });
    }
    
    const skippedTitle = serverQueue.songs[0].title;
    
    // THAY ĐỔI: Dùng giá trị trả về của skip() để xử lý phản hồi
    const skipped = serverQueue.skip(); 

    if (skipped) {
        await interaction.reply(`⏩ Đã bỏ qua: **${skippedTitle}**`);
    } else {
         await interaction.reply({ content: "❌ Không thể bỏ qua. Hàng đợi có thể trống.", flags: MessageFlags.Ephemeral });
    }
}