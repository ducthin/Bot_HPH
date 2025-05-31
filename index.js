const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const youtubedl = require('youtube-dl-exec');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Global variables
const queues = new Map();

// User Agents để tránh bị chặn
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
];

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

// Music functions
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    
    if (!song) {
        console.log('Hàng đợi trống, bot sẽ ở lại voice channel...');
        // Không ngắt kết nối, chỉ dừng player
        if (serverQueue && serverQueue.player) {
            serverQueue.player.stop();
        }
        return;
    }

    try {
        console.log('Đang thử phát bài hát:', song.title);
        console.log('URL bài hát:', song.url);
        
        let videoUrl = song.url;
        let videoId = extractVideoID(song.url);
        
        if (videoId) {
            const standardYoutubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
            console.log('URL chuẩn hóa:', standardYoutubeUrl);
            
            try {
                console.log('Đang lấy thông tin audio với youtube-dl-exec...');
                
                // Get audio stream URL using youtube-dl-exec
                const audioInfo = await retryWithDelay(async () => {
                    return await youtubedl(standardYoutubeUrl, {
                        format: 'bestaudio',
                        extractAudio: true,
                        audioFormat: 'mp3',
                        getUrl: true,
                        userAgent: getRandomUserAgent(),
                        quiet: true
                    });
                }, 3, 3000);
                
                console.log('Đã lấy audio URL thành công!');
                
                // Create audio resource
                const resource = createAudioResource(audioInfo, {
                    inputType: 'url',
                    inlineVolume: true
                });
                
                // Set volume
                if (resource.volume) {
                    resource.volume.setVolume(serverQueue.volume / 100);
                }
                
                // Play music
                serverQueue.player.play(resource);
                
                // Handle player events
                serverQueue.player.once(AudioPlayerStatus.Idle, () => {
                    console.log('Bài hát đã kết thúc, phát bài tiếp theo...');
                    serverQueue.songs.shift();
                    playSong(guildId, serverQueue.songs[0]);
                });
                
                serverQueue.player.once('error', (error) => {
                    console.error('Lỗi player:', error);
                    if (serverQueue.textChannel) {
                        serverQueue.textChannel.send('❌ Lỗi khi phát nhạc: ' + error.message);
                    }
                    serverQueue.songs.shift();
                    playSong(guildId, serverQueue.songs[0]);
                });
                
                // Send now playing message
                if (serverQueue.textChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('🎵 Đang phát')
                        .setDescription(`**${song.title}**`)
                        .setThumbnail(song.thumbnail)
                        .addFields(
                            { name: '⏱️ Thời lượng', value: song.duration, inline: true },
                            { name: '🎧 Âm lượng', value: `${serverQueue.volume}%`, inline: true }
                        )
                        .setFooter({ text: `Yêu cầu bởi ${song.requestedBy}` });
                    
                    serverQueue.textChannel.send({ embeds: [embed] });
                }
                
            } catch (streamError) {
                console.error('Lỗi stream:', streamError);
                if (serverQueue.textChannel) {
                    serverQueue.textChannel.send(`❌ Không thể phát bài hát: ${song.title}`);
                }
                serverQueue.songs.shift();
                playSong(guildId, serverQueue.songs[0]);
            }
        } else {
            throw new Error('Không thể trích xuất video ID từ URL');
        }
        
    } catch (error) {
        console.error('Lỗi trong playSong:', error);
        if (serverQueue.textChannel) {
            serverQueue.textChannel.send('❌ Có lỗi xảy ra khi phát nhạc: ' + error.message);
        }
        serverQueue.songs.shift();
        playSong(guildId, serverQueue.songs[0]);
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
    
    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Bạn cần vào voice channel trước!');
        }
        
        if (!args.length) {
            return message.reply('❌ Vui lòng nhập tên bài hát hoặc URL YouTube!');
        }
        
        const query = args.join(' ');
        console.log('Đầu vào là từ khóa tìm kiếm:', query);
        
        try {
            let videoUrl = query;
            let videoInfo;
            
            // Check if input is YouTube URL
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                videoUrl = query;
                try {
                    const info = await youtubedl(videoUrl, { 
                        dumpJson: true,
                        quiet: true 
                    });
                    videoInfo = {
                        title: info.title,
                        url: videoUrl,
                        duration: info.duration ? Math.floor(info.duration / 60) + ':' + String(Math.floor(info.duration % 60)).padStart(2, '0') : 'N/A',
                        thumbnail: info.thumbnail || ''
                    };
                } catch (error) {
                    console.error('Error getting video info:', error);
                    return message.reply('❌ Không thể lấy thông tin video từ URL này!');
                }
            } else {
                // Search YouTube
                const searchResults = await yts(query);
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
            
            const song = {
                title: videoInfo.title,
                url: videoInfo.url,
                duration: videoInfo.duration,
                thumbnail: videoInfo.thumbnail,
                requestedBy: message.author.username
            };
            
            // Get or create server queue
            let serverQueue = queues.get(message.guild.id);
            
            if (!serverQueue) {
                const connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                
                const player = createAudioPlayer({
                    behaviors: {
                        noSubscriber: NoSubscriberBehavior.Play,
                        maxMissedFrames: Math.round(5000 / 20),
                    },
                });
                
                connection.subscribe(player);
                
                serverQueue = {
                    textChannel: message.channel,
                    voiceChannel: message.member.voice.channel,
                    connection: connection,
                    player: player,
                    songs: [],
                    volume: 50,
                    playing: false
                };
                
                queues.set(message.guild.id, serverQueue);
                
                // Handle connection events
                connection.on(VoiceConnectionStatus.Ready, () => {
                    console.log('Voice connection ready!');
                });
                
                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    console.log('Voice connection disconnected');
                });
                
                connection.on('error', (error) => {
                    console.error('Voice connection error:', error);
                });
            }
            
            serverQueue.songs.push(song);
            
            if (serverQueue.songs.length === 1) {
                console.log('Voice connection established, starting playback...');
                playSong(message.guild.id, song);
            } else {
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
            console.error('Error in play command:', error);
            message.reply('❌ Có lỗi xảy ra khi xử lý yêu cầu của bạn!');
        }
    }
    
    else if (command === 'skip' || command === 's') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue || !serverQueue.playing) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        serverQueue.player.stop();
        message.reply('⏭️ Đã bỏ qua bài hát hiện tại!');
    }
    
    else if (command === 'stop') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queues.delete(message.guild.id);
        message.reply('⏹️ Đã dừng phát nhạc và rời khỏi voice channel!');
    }
    
    else if (command === 'queue' || command === 'q') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue || !serverQueue.songs.length) {
            return message.reply('❌ Hàng đợi trống!');
        }
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Hàng đợi nhạc')
            .setDescription(
                serverQueue.songs.slice(0, 10).map((song, index) => 
                    `${index === 0 ? '🎵' : `${index}.`} **${song.title}** - ${song.duration}`
                ).join('\n')
            )
            .setFooter({ text: `Tổng: ${serverQueue.songs.length} bài hát` });
        
        message.channel.send({ embeds: [embed] });
    }
    
    else if (command === 'volume' || command === 'vol') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Hiện không có bài hát nào đang phát!');
        }
        
        if (!args[0]) {
            return message.reply(`🔊 Âm lượng hiện tại: ${serverQueue.volume}%`);
        }
        
        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 100) {
            return message.reply('❌ Âm lượng phải từ 0 đến 100!');
        }
        
        serverQueue.volume = volume;
        message.reply(`🔊 Đã đặt âm lượng thành ${volume}%`);
    }
      else if (command === 'help' || command === 'h') {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🤖 Happy House Bot - Hướng dẫn')
            .addFields(
                { name: '🎵 !play <tên bài hát/URL>', value: 'Phát nhạc từ YouTube', inline: false },
                { name: '⏭️ !skip', value: 'Bỏ qua bài hát hiện tại', inline: false },
                { name: '⏹️ !stop', value: 'Dừng phát nhạc và rời voice', inline: false },
                { name: '👋 !leave', value: 'Rời khỏi voice channel', inline: false },
                { name: '📝 !queue', value: 'Xem hàng đợi nhạc', inline: false },
                { name: '🔊 !volume <0-100>', value: 'Điều chỉnh âm lượng', inline: false },
                { name: '❓ !help', value: 'Hiển thị hướng dẫn này', inline: false }
            )
            .setFooter({ text: 'Happy House Bot - Music for everyone!' });
        
        message.channel.send({ embeds: [embed] });
    }
    
    else if (command === 'leave' || command === 'disconnect') {
        const serverQueue = queues.get(message.guild.id);
        if (!serverQueue) {
            return message.reply('❌ Bot không ở trong voice channel nào!');
        }
        
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queues.delete(message.guild.id);
        message.reply('👋 Đã rời khỏi voice channel!');
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
