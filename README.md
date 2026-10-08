# Music Bot

A small Discord music bot I built for my friends' server, since the free community bots all seem to start charging after a while. Join a voice channel, drop in a YouTube link, and it plays in voice chat.

It's a personal project, so it isn't hosted anywhere public. You run it yourself with your own Discord bot token.

## Commands

| Command | What it does |
| --- | --- |
| `/play <url>` | Plays a YouTube link, or adds it to the queue if something is already playing |
| `/pause` | Pauses the current song |
| `/resume` | Resumes a paused song |
| `/skip` | Skips to the next song in the queue |
| `/stop` | Stops playback, clears the queue and leaves the voice channel |

You need to be in the same voice channel as the bot to use the playback commands. The bot's replies are in Vietnamese.

## How it works

1. `/play` checks that the link is a YouTube URL and uses `yt-dlp` to look up the title.
2. The song is added to a per-server queue.
3. When it's time to play, `yt-dlp` streams the best available audio into `ffmpeg`, which converts it to raw 48 kHz stereo audio.
4. That stream is handed to `@discordjs/voice`, which plays it in the voice channel.
5. When a song ends, the bot moves on to the next one in the queue.

## Tech stack

- Node.js (ES modules)
- [discord.js](https://discord.js.org/) v14 and `@discordjs/voice`
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/) for fetching and converting audio

## Running it yourself

You'll need Node.js, `yt-dlp` and `ffmpeg`, plus a bot created in the [Discord Developer Portal](https://discord.com/developers/applications).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Install `yt-dlp` and `ffmpeg` and make sure both are on your `PATH`. On Windows the bot looks for `yt-dlp.exe` and `ffmpeg.exe` in the project folder by default. To use other locations, set `YTDLP_PATH` and `FFMPEG_PATH`.

3. Create a `.env` file in the project root:

   ```env
   DISCORD_TOKEN=your-bot-token
   CLIENT_ID=your-application-id
   ```

4. Register the slash commands. They are registered globally, so it can take up to an hour for them to show up:

   ```bash
   node src/deploy-commands.js
   ```

5. Invite the bot to your server with the `bot` and `applications.commands` scopes, then start it:

   ```bash
   npm start
   ```

## Project structure

```
src/
├── index.js            # Starts the bot and loads the commands
├── deploy-commands.js  # Registers the slash commands with Discord
├── config.js           # yt-dlp / ffmpeg paths
├── commands/           # play, pause, resume, skip, stop
└── utils/queue.js      # Per-server queue and audio playback
```

## Notes

- It only supports YouTube links, not search terms or other sites.
- Built for personal use on a small private server.
- If playback suddenly fails, update yt-dlp first, since YouTube changes often.
