import { 
    createAudioPlayer, 
    createAudioResource, 
    joinVoiceChannel, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState,
    StreamType
} from "@discordjs/voice";
import { spawn } from "child_process";

const ytdlpPath = process.env.YTDLP_PATH || './yt-dlp.exe';
const ffmpegPath = process.env.FFMPEG_PATH || './ffmpeg.exe';

// Nguồn duy nhất lưu hàng đợi theo guildId
export const queues = new Map();

class ServerQueue {
    constructor(guildId, interaction) {
        this.guildId = guildId;
        this.voiceChannel = interaction.member.voice.channel;
        this.textChannel = interaction.channel;
        this.connection = null;
        this.player = createAudioPlayer();
        this.songs = [];
        this.playing = false;
        this.loop = false;
        
        // Phiên phát hiện tại: { ytdlp, ffmpeg, resource, stopping }
        this.session = null;
        this.stopped = false;
        // Resource đã bị chủ động dọn dẹp: lỗi 'Premature close' của chúng là dự kiến
        this.teardownResources = new WeakSet();

        // Listener cho Player
        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log(`[${this.guildId}] Player Status: Idle. Trying next song.`);
            
            this.songs.shift(); // Xóa bài hát vừa kết thúc
            this.cleanupProcesses(); 
            
            if (this.loop && this.songs.length > 0) {
                this.songs.push(this.songs[0]); 
            }
            
            if (this.songs.length > 0) {
                setImmediate(() => this.playSong(this.songs[0]));
            } else {
                this.playing = false;
                // Bắt đầu đếm ngược 10 giây để ngắt kết nối
                setTimeout(() => {
                    // PHÒNG VỆ: Kiểm tra kết nối trước khi destroy
                    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed && this.songs.length === 0) {
                        this.textChannel.send('🎶 Hàng đợi trống. Đã rời kênh voice.');
                        this.unregister();
                        this.connection.destroy();
                        this.connection = null; // Rất quan trọng: Thiết lập null sau khi destroy thành công
                    }
                }, 10000); 
            }
        });
        
        this.player.on('error', error => {
            if (error.resource && this.teardownResources.has(error.resource)) {
                // Lỗi do chính mình đóng stream khi skip/stop; player sẽ tự về Idle ngay sau đó
                return;
            }
            console.error(`[${this.guildId}] Player Error:`, error);
            this.textChannel.send(`❌ Có lỗi khi phát nhạc: \`${error.message}\`. Bỏ qua bài hát.`);
            // @discordjs/voice chuyển player sang Idle ngay sau sự kiện 'error' này,
            // handler Idle ở trên sẽ tự chuyển bài; ở đây chỉ cần dọn tiến trình.
            this.cleanupProcesses();
        });

        this.connection?.on(VoiceConnectionStatus.Disconnected, () => {
             // PHÒNG VỆ: Chỉ destroy nếu nó chưa bị phá hủy
             if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                this.connection.destroy();
             }
             this.connection = null;
             this.unregister();
             this.textChannel.send('❌ Đã mất kết nối Voice Channel.');
        });
    }

    /** Gỡ hàng đợi này khỏi Map (chỉ khi Map vẫn đang trỏ tới chính nó). */
    unregister() {
        if (queues.get(this.guildId) === this) queues.delete(this.guildId);
    }

    /**
     * Dọn dẹp phiên phát hiện tại. An toàn khi gọi nhiều lần (idempotent):
     * đặt cờ stopping -> unpipe -> destroy stream -> kill yt-dlp -> kill ffmpeg.
     * @returns {void}
     */
    cleanupProcesses() {
        const session = this.session;
        if (!session || session.stopping) return;
        session.stopping = true;
        this.session = null;
        if (session.resource) this.teardownResources.add(session.resource);

        const { ytdlp, ffmpeg } = session;
        const safe = (fn) => { try { fn(); } catch (err) { this.logStreamError('cleanup', session, err); } };

        safe(() => ytdlp.stdout?.unpipe(ffmpeg.stdin));
        safe(() => ffmpeg.stdin?.destroy());
        safe(() => ytdlp.stdout?.destroy());
        safe(() => ytdlp.stderr?.destroy());
        safe(() => ffmpeg.stdout?.destroy());

        console.log(`[${this.guildId}] Killing yt-dlp process...`);
        safe(() => ytdlp.kill('SIGKILL'));
        console.log(`[${this.guildId}] Killing ffmpeg process...`);
        safe(() => ffmpeg.kill('SIGKILL'));
    }

    /**
     * Ghi log lỗi stream; bỏ qua EPIPE / ERR_STREAM_DESTROYED khi đang teardown.
     */
    logStreamError(name, session, err) {
        if (session.stopping && (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED')) return;
        console.error(`[${this.guildId}] ${name} error:`, err);
    }

    /**
     * Xử lý lỗi của tiến trình phát: chỉ thực hiện nếu phiên còn hiệu lực,
     * rồi đi qua skip() (cùng đường với /skip) để chuyển bài hoặc rời kênh.
     */
    failSession(session, message) {
        if (session.stopping || this.session !== session) return;
        this.textChannel.send(message);
        this.skip();
    }

    async joinChannel() {
        if (this.connection) return this.connection;
        
        console.log(`[${this.guildId}] Đang cố gắng kết nối tới voice channel: ${this.voiceChannel.name}`);
        this.connection = joinVoiceChannel({
            channelId: this.voiceChannel.id,
            guildId: this.voiceChannel.guild.id,
            adapterCreator: this.voiceChannel.guild.voiceAdapterCreator
        });

        this.connection.subscribe(this.player);

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30000); 
            return this.connection;
        } catch (err) {
            console.error(`[${this.guildId}] Lỗi Timeout khi kết nối:`, err);
            this.connection.destroy();
            this.connection = null; // Thiết lập null nếu destroy do lỗi
            this.unregister();
            throw new Error("Không thể kết nối voice channel.");
        }
    }

    async playSong(song) {
        try {
            await this.joinChannel();
        } catch (error) {
            this.textChannel.send(`❌ Lỗi kết nối: ${error.message}`);
            return;
        }

        this.playing = true;
        
        console.log(`[${this.guildId}] Bắt đầu phát: ${song.title} (${song.url})`);
        
        const ytdlpArgs = [
            '-f', 'bestaudio[ext=opus]/bestaudio[ext=m4a]/bestaudio', 
            '-o', '-',
            '--no-warnings',
            '--no-playlist',
            song.url
        ];
        const ytdlpProcess = spawn(ytdlpPath, ytdlpArgs);

        const ffmpegArgs = [
            '-i', 'pipe:0',
            '-analyzeduration', '0',
            '-loglevel', '0',
            '-b:a', '256k', 
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ];
        // Dòng log bạn đã yêu cầu để kiểm tra bitrate
        console.log(`[${this.guildId}] FFmpeg Args: ${ffmpegArgs.join(' ')}`);
        
        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
        
        const session = { ytdlp: ytdlpProcess, ffmpeg: ffmpegProcess, stopping: false };
        this.session = session;

        // Handler 'error' cho mọi stream để EPIPE khi teardown không làm crash process
        const watch = (name, stream) => stream?.on('error', (err) => this.logStreamError(name, session, err));
        watch('ffmpeg.stdin', ffmpegProcess.stdin);
        watch('ffmpeg.stdout', ffmpegProcess.stdout);
        watch('ytdlp.stdout', ytdlpProcess.stdout);
        watch('ytdlp.stderr', ytdlpProcess.stderr);
        
        ytdlpProcess.once('spawn', () => {
             if (session.stopping) return;
             console.log(`[${this.guildId}] yt-dlp spawned. Piping to FFmpeg.`);
             ytdlpProcess.stdout.pipe(ffmpegProcess.stdin);
        });

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Raw,
        });
        
        session.resource = resource;
        this.player.play(resource);
        this.textChannel.send(`🎵 Đang phát: **${song.title}** (Yêu cầu bởi ${song.requester})`);

        // Xử lý lỗi tiến trình
        ytdlpProcess.on('error', (error) => {
            console.error('❌ yt-dlp process error:', error);
            this.failSession(session, '❌ Lỗi yt-dlp khi khởi động. Bỏ qua bài hát.');
        });
        ffmpegProcess.on('error', (error) => {
            console.error('❌ ffmpeg process error:', error);
            this.failSession(session, '❌ Lỗi ffmpeg khi khởi động. Bỏ qua bài hát.');
        });
        
        ytdlpProcess.on('close', (code) => {
            if (session.stopping) return;
            if (code !== 0 && code !== null) { 
                console.error(`❌ yt-dlp process exited with code ${code}. Download stream failed.`);
                this.failSession(session, `❌ Lỗi tải stream (${code}). Bỏ qua bài hát.`);
            }
        });

        ffmpegProcess.on('close', (code) => {
             if (!session.stopping && code !== 0 && code !== null) { 
                console.error(`❌ ffmpeg process exited with code ${code}. Piping failed.`);
             }
        });
    }

    /**
     * Dừng AudioPlayer và kích hoạt Idle event để chuyển bài tiếp theo.
     * @returns {boolean} True nếu skip thành công, ngược lại False.
     */
    skip() {
        if (this.songs.length > 0) {
            // player.stop() phát Idle đồng bộ -> handler Idle shift bài + dọn tiến trình
            this.player.stop(); 
            // Phòng khi player đã Idle sẵn (không có sự kiện): dọn đồng bộ, idempotent
            this.cleanupProcesses();
            return true;
        } 
        return false;
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this.songs = [];
        this.player.stop();
        this.cleanupProcesses();
        
        // SỬA LỖI: Kiểm tra trạng thái và thiết lập null để ngăn chặn double-destroy
        if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
            this.connection = null; 
        }
        
        this.unregister();
        this.textChannel.send('⏹️ Đã dừng và xóa hàng đợi.');
    }

    /**
     * Tạm dừng AudioPlayer.
     * @returns {boolean} True nếu đã tạm dừng, False nếu không có nhạc đang phát hoặc đã tạm dừng sẵn.
     */
    pause() {
        if (this.player.state.status !== AudioPlayerStatus.Playing) return false;
        return this.player.pause();
    }

    /**
     * Tiếp tục phát AudioPlayer.
     * @returns {boolean} True nếu đã tiếp tục, False nếu nhạc không ở trạng thái tạm dừng.
     */
    resume() {
        if (this.player.state.status !== AudioPlayerStatus.Paused &&
            this.player.state.status !== AudioPlayerStatus.AutoPaused) return false;
        return this.player.unpause();
    }

    get isPaused() {
        return this.player.state.status === AudioPlayerStatus.Paused;
    }
}

export default ServerQueue;