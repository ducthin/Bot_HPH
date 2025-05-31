const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const youtubedl = require('youtube-dl-exec');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Discord client with optimized settings
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: false
    }
});

// Global variables with improved structure
const queues = new Map();
const cooldowns = new Map(); // Rate limiting
const playerCache = new Map(); // Cache players for better performance

// Optimized User Agents rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

// Performance constants
const COOLDOWN_TIME = 3000; // 3 seconds cooldown between commands
const MAX_QUEUE_SIZE = 50;
const SEARCH_LIMIT = 5;

// Utility functions
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function retryWithDelay(fn, maxRetries = 3, delayMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            console.log(`Thử lần ${i + 1}/${maxRetries} thất bại:`, error.message);
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
        }
    }
}

function extractVideoID(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Optimized utility functions
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Rate limiting check
function checkCooldown(userId, commandName) {
    const now = Date.now();
    const userCooldowns = cooldowns.get(userId) || new Map();
    const lastUsed = userCooldowns.get(commandName) || 0;
    
    if (now - lastUsed < COOLDOWN_TIME) {
        return Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
    }
    
    userCooldowns.set(commandName, now);
    cooldowns.set(userId, userCooldowns);
    return 0;
}

// Enhanced input validation
function validateYouTubeUrl(url) {
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w\-]+/i;
    return ytRegex.test(url);
}

// Optimized queue management
function addToQueue(guildId, song) {
    const queue = queues.get(guildId);
    if (!queue) return { error: 'Không tìm thấy queue cho server này!' };
    
    if (queue.songs.length >= MAX_QUEUE_SIZE) {
        return { error: 'Hàng đợi đã đầy! (Tối đa 50 bài)' };
    }
    
    queue.songs.push(song);
    return { success: true };
}

// Optimized Music functions
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    
    if (!song) {
        console.log('Hàng đợi trống, bot sẽ ở lại voice channel...');
        if (serverQueue?.player) {
            serverQueue.player.stop();
        }
        return;
    }

    try {
        console.log(`🎵 Đang phát: ${song.title}`);
        
        const videoId = extractVideoID(song.url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }
        
        const standardYoutubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
          // Parallel audio extraction for better performance
        const audioInfo = await Promise.race([
            retryWithDelay(async () => {
                return await youtubedl(standardYoutubeUrl, {
                    format: 'bestaudio[ext=m4a]/bestaudio',
                    getUrl: true,
                    userAgent: getRandomUserAgent(),
                    quiet: true,
                    noWarnings: true
                });
            }, 2, 1500), // Reduced retries and delay for better responsiveness
            
            // Timeout fallback
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Audio extraction timeout')), 15000)
            )
        ]);
        
        console.log('✅ Audio URL ready!');
        
        // Optimized audio resource creation
        const resource = createAudioResource(audioInfo, {
            inputType: 'url',
            inlineVolume: true,
            // Improved buffering settings
            metadata: {
                title: song.title,
                url: song.url
            }        });
                
        // Set volume for smoother playback
        if (resource.volume) {
            resource.volume.setVolume(serverQueue.volume / 100);
        }
        
        // Play music with optimized event handling
        serverQueue.player.play(resource);
        
        // Optimized event listeners with better error handling
        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            console.log('🎵 Song finished, playing next...');
            serverQueue.songs.shift();
            setImmediate(() => playSong(guildId, serverQueue.songs[0])); // Non-blocking
        });
        
        serverQueue.player.once('error', (error) => {
            console.error('🚫 Player error:', error.message);
            serverQueue.textChannel?.send(`❌ Lỗi phát nhạc: ${error.message}`);
            serverQueue.songs.shift();
            setImmediate(() => playSong(guildId, serverQueue.songs[0])); // Non-blocking
        });
        
        // Enhanced now playing embed
        if (serverQueue.textChannel) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎵 Đang phát')
                .setDescription(`**${song.title}**`)
                .setThumbnail(song.thumbnail || 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg')
                .addFields(
                    { name: '⏱️ Thời lượng', value: song.duration || 'N/A', inline: true },
                    { name: '🎧 Âm lượng', value: `${serverQueue.volume}%`, inline: true },
                    { name: '📊 Hàng đợi', value: `${serverQueue.songs.length} bài`, inline: true }
                )
                .setFooter({ text: `🎤 ${song.requestedBy}` })
                .setTimestamp();
            
            serverQueue.textChannel.send({ embeds: [embed] });
        }
        
    } catch (error) {
        console.error('🚫 PlaySong error:', error.message);
        serverQueue.textChannel?.send(`❌ Không thể phát: ${song.title}\n${error.message}`);
        serverQueue.songs.shift();
        setImmediate(() => playSong(guildId, serverQueue.songs[0])); // Non-blocking retry
    }
}

// Discord event handlers
client.once('ready', () => {
    console.log('🤖 Happy House Bot đã sẵn sàng!');
    console.log(`🎵 Đã đăng nhập với tên ${client.user.tag}`);
    
    client.user.setActivity('🎵 Music for Happy House', { type: ActivityType.Listening });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Rate limiting check for better performance
    const cooldownLeft = checkCooldown(message.author.id, command);
    if (cooldownLeft > 0) {
        return message.reply(`⏰ Vui lòng đợi ${cooldownLeft}s trước khi dùng lệnh này!`);
    }
    
    if (command === 'play' || command === 'p') {
        // Quick validation checks
        if (!message.member.voice.channel) {
            return message.reply('❌ Bạn cần vào voice channel trước!');
        }
        
        if (!args.length) {
            return message.reply('❌ Vui lòng nhập tên bài hát hoặc URL YouTube!');
        }
        
        const query = args.join(' ');
        console.log('🔍 Searching:', query);
          try {
            let videoUrl = query;
            let videoInfo;
            
            // Optimized URL validation
            if (validateYouTubeUrl(query)) {
                videoUrl = query;
                try {
                    // Parallel info extraction with timeout
                    const info = await Promise.race([
                        youtubedl(videoUrl, { 
                            dumpJson: true,
                            quiet: true,
                            noWarnings: true 
                        }),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Info extraction timeout')), 10000)
                        )
                    ]);
                    
                    videoInfo = {
                        title: info.title,
                        url: videoUrl,
                        duration: info.duration ? `${Math.floor(info.duration / 60)}:${String(Math.floor(info.duration % 60)).padStart(2, '0')}` : 'N/A',
                        thumbnail: info.thumbnail || `https://img.youtube.com/vi/${extractVideoID(videoUrl)}/maxresdefault.jpg`
                    };
                } catch (error) {
                    console.error('🚫 Video info error:', error.message);
                    return message.reply('❌ Không thể lấy thông tin video từ URL này!');
                }
            } else {
                // Optimized YouTube search with limit
                const searchResults = await Promise.race([
                    yts({ query, pages: 1 }), // Limit to 1 page for speed
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Search timeout')), 8000)
                    )
                ]);
                
                if (!searchResults.videos.length) {
                    return message.reply('❌ Không tìm thấy bài hát nào!');
                }
                
                const video = searchResults.videos[0];
                videoInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.duration.timestamp,
                    thumbnail: video.thumbnail
                };
            }
              // Optimized song object creation
            const song = {
                title: videoInfo.title,
                url: videoInfo.url,
                duration: videoInfo.duration,
                thumbnail: videoInfo.thumbnail,
                requestedBy: message.author.username
            };
            
            // Get or create optimized server queue
            let serverQueue = queues.get(message.guild.id);
            
            if (!serverQueue) {
                // Enhanced voice connection with better settings
                const connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true, // Better performance
                    selfMute: false
                });
                
                // Optimized audio player settings
                const player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play,
                        maxMissedFrames: Math.round(5000 / 20), // Allow more missed frames
                    },
                });
                
                // Enhanced connection event handling
                connection.on(VoiceConnectionStatus.Ready, () => {
                    console.log('🎤 Voice connection established, starting playback...');
                });
                
                connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    try {
                        await Promise.race([
                            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                        ]);
                    } catch {
                        console.log('💔 Voice connection lost, cleaning up...');
                        connection.destroy();
                        queues.delete(message.guild.id);
                    }
                });
                
                connection.subscribe(player);
                
                serverQueue = {
                    textChannel: message.channel,
                    voiceChannel: message.member.voice.channel,                    connection: connection,
                    player: player,
                    songs: [],
                    volume: 50,
                    playing: false
                };
                
                queues.set(message.guild.id, serverQueue);
            }
            
            // Optimized queue management with size check
            const queueResult = addToQueue(message.guild.id, song);
            if (queueResult.error) {
                return message.reply(`❌ ${queueResult.error}`);
            }
            
            // Smart playback logic
            if (serverQueue.songs.length === 1 && !serverQueue.playing) {
                console.log('🎬 Starting playback...');
                serverQueue.playing = true;
                playSong(message.guild.id, song);
            } else {
                // Enhanced queue notification
                const embed = new EmbedBuilder()
                    .setColor('#ffff00')
                    .setTitle('🎵 Đã thêm vào hàng đợi')
                    .setDescription(`**${song.title}**`)
                    .setThumbnail(song.thumbnail)
                    .addFields(
                        { name: '⏱️ Thời lượng', value: song.duration, inline: true },
                        { name: '📝 Vị trí trong hàng đợi', value: `${serverQueue.songs.length}`, inline: true }
                    )
                    .setFooter({ text: `Yêu cầu bởi ${song.requestedBy}` });
                
                message.channel.send({ embeds: [embed] });
            }
              } catch (error) {
            console.error('🚫 Play command error:', error.message);
            message.reply('❌ Có lỗi xảy ra khi xử lý yêu cầu của bạn!');
        }
    }
    
    // Optimized skip command
    else if (command === 'skip' || command === 's') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue?.playing || !serverQueue.songs.length) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        const skippedSong = serverQueue.songs[0];
        serverQueue.player.stop();
        message.reply(`⏭️ Đã bỏ qua: **${skippedSong.title}**`);
    }
    
    // Enhanced stop command
    else if (command === 'stop') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        serverQueue.songs = [];
        serverQueue.playing = false;
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queues.delete(message.guild.id);
        message.reply('⏹️ Đã dừng phát nhạc và rời khỏi voice channel!');
    }
      // Enhanced queue display with pagination
    else if (command === 'queue' || command === 'q') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue?.songs.length) {
            return message.reply('❌ Hàng đợi trống!');
        }
        
        const page = parseInt(args[0]) || 1;
        const itemsPerPage = 10;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const totalPages = Math.ceil(serverQueue.songs.length / itemsPerPage);
        
        const queuePage = serverQueue.songs.slice(startIndex, endIndex);
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Hàng đợi nhạc')
            .setDescription(
                queuePage.map((song, index) => {
                    const actualIndex = startIndex + index;
                    const prefix = actualIndex === 0 ? '🎵 **Đang phát:**' : `${actualIndex}.`;
                    return `${prefix} **${song.title}** - \`${song.duration}\``;
                }).join('\n')
            )
            .addFields(
                { name: '📊 Thống kê', value: `Trang ${page}/${totalPages} • ${serverQueue.songs.length} bài`, inline: true },
                { name: '🎧 Âm lượng', value: `${serverQueue.volume}%`, inline: true }
            )
            .setFooter({ text: `Dùng !queue <trang> để xem trang khác` });
        
        message.channel.send({ embeds: [embed] });
    }
    
    // Optimized volume control
    else if (command === 'volume' || command === 'vol') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        if (!args[0]) {
            return message.reply(`🔊 Âm lượng hiện tại: **${serverQueue.volume}%**`);
        }
        
        const volume = Math.max(0, Math.min(100, parseInt(args[0]) || 50));
        if (isNaN(volume)) {
            return message.reply('❌ Âm lượng phải từ 0 đến 100!');
        }
        
        serverQueue.volume = volume;
        message.reply(`🔊 Đã đặt âm lượng thành ${volume}%`);
    }    // Enhanced help command
    else if (command === 'help' || command === 'h') {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🤖 Happy House Bot - Hướng dẫn')
            .setDescription('**Bot nhạc chất lượng cao với hiệu suất tối ưu!**')
            .addFields(
                { name: '🎵 !play <tên bài/URL>', value: 'Phát nhạc từ YouTube (tốc độ cao)', inline: false },
                { name: '⏭️ !skip (!s)', value: 'Bỏ qua bài hát hiện tại', inline: true },
                { name: '⏹️ !stop', value: 'Dừng và rời voice', inline: true },
                { name: '👋 !leave', value: 'Rời khỏi voice channel', inline: true },
                { name: '📝 !queue <trang>', value: 'Xem hàng đợi (có phân trang)', inline: true },
                { name: '🔊 !volume <0-100>', value: 'Điều chỉnh âm lượng', inline: true },
                { name: '❓ !help (!h)', value: 'Hiển thị hướng dẫn này', inline: true }
            )
            .addFields(
                { name: '⚡ Tính năng mới:', value: '• Rate limiting chống spam\n• Tìm kiếm nhanh hơn\n• Auto-reconnect\n• Queue tối đa 50 bài\n• Cooldown 3s giữa lệnh', inline: false }
            )
            .setFooter({ text: 'Happy House Bot v2.0 - Optimized for performance!' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
    
    // Enhanced leave command
    else if (command === 'leave' || command === 'disconnect') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Bot không ở trong voice channel nào!');
        }
        
        serverQueue.connection?.destroy();
        queues.delete(message.guild.id);
        cooldowns.delete(message.author.id); // Clear user cooldowns
        message.reply('👋 Đã rời khỏi voice channel và xóa hàng đợi!');
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// Login
console.log('Đang khởi động Happy House Bot...');

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN không được tìm thấy trong environment variables!');
    console.error('💡 Hướng dẫn:');
    console.error('1. Tạo file .env với nội dung: DISCORD_TOKEN=your_token_here');
    console.error('2. Hoặc set environment variable DISCORD_TOKEN trên platform deploy');
    console.error('3. Token lấy từ: https://discord.com/developers/applications');
    process.exit(1);
}

const token = process.env.DISCORD_TOKEN.trim();
if (!token.startsWith('MT') && !token.startsWith('MN')) {
    console.error('❌ Discord Token có format không đúng!');
    console.error('💡 Token phải bắt đầu bằng MT hoặc MN và dài khoảng 70+ ký tự');
    console.error('🔗 Lấy token mới tại: https://discord.com/developers/applications');
    process.exit(1);
}

client.login(token)
    .then(() => console.log('✅ Đăng nhập thành công!'))
    .catch(error => {
        console.error('❌ Lỗi khi đăng nhập:', error);
        console.error('💡 Khắc phục:');
        console.error('1. Kiểm tra DISCORD_TOKEN có đúng không');
        console.error('2. Reset token tại Discord Developer Portal');
        console.error('3. Cập nhật environment variable mới');
        process.exit(1);
    });
