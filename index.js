const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
require('dotenv').config();

// Danh sách User Agents để tránh bị chặn
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
];

// Hàm lấy random User Agent
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Hàm delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm thử lại với delay
async function retryWithDelay(fn, maxRetries = 3, delayMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            console.log(`Thử lần ${i + 1} thất bại, đợi ${delayMs}ms rồi thử lại...`);
            await delay(delayMs * (i + 1)); // Tăng delay mỗi lần thử
        }
    }
}

// Khởi tạo bot với các intents cần thiết
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Hàm kiểm tra URL YouTube
function isValidYoutubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
        // Nếu đã là ID 11 ký tự thì coi là hợp lệ
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return true;
        }
        
        // Kiểm tra các định dạng URL YouTube phổ biến
        const patterns = [
            /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtu\.be\/[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]{11}.*$/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    } catch (error) {
        console.error('Lỗi khi kiểm tra URL YouTube:', error);
        return false;
    }
}

// Thiết lập prefix từ file .env
const PREFIX = process.env.PREFIX || '!';

// Quản lý queue nhạc cho mỗi server
const queues = new Map();

// Khởi tạo bot
client.on('ready', () => {
    console.log(`🎵 Happy House Bot đã sẵn sàng! Đã đăng nhập với tên ${client.user.tag}`);
    
    // Set bot status
    client.user.setActivity('!help | 🎵 Happy House', { type: ActivityType.Listening });
});

// Xử lý tin nhắn
client.on('messageCreate', async message => {
    // Bỏ qua tin nhắn từ bot hoặc không bắt đầu bằng prefix
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    // Phân tích lệnh và tham số
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Xử lý các lệnh
    try {
        switch (command) {
            case 'help':
                sendHelp(message);
                break;
            case 'play':
            case 'p':
                play(message, args);
                break;
            case 'skip':
            case 's':
                skip(message);
                break;
            case 'stop':
            case 'st':
                stop(message);
                break;
            case 'pause':
            case 'pa':
                pause(message);
                break;
            case 'resume':
            case 'r':
                resume(message);
                break;
            case 'queue':
            case 'q':
                showQueue(message);
                break;
            case 'nowplaying':
            case 'np':
                nowPlaying(message);
                break;
            case 'volume':
                setVolume(message, args);
                break;
        }
    } catch (error) {
        console.error(`Lỗi khi xử lý lệnh ${command}:`, error);
        message.reply('❌ Đã xảy ra lỗi khi xử lý lệnh. Vui lòng thử lại sau!');
    }
});

// Hiển thị trợ giúp
function sendHelp(message) {
    const helpEmbed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎵 Happy House - Trợ giúp')
        .setDescription('Danh sách các lệnh có sẵn:')
        .addFields(
            { name: `${PREFIX}play <tên bài hát hoặc URL>`, value: 'Phát nhạc từ YouTube' },
            { name: `${PREFIX}pause`, value: 'Tạm dừng nhạc' },
            { name: `${PREFIX}resume`, value: 'Tiếp tục phát nhạc' },
            { name: `${PREFIX}skip`, value: 'Bỏ qua bài hiện tại' },
            { name: `${PREFIX}stop`, value: 'Dừng nhạc và rời voice channel' },
            { name: `${PREFIX}queue`, value: 'Hiển thị danh sách nhạc chờ' },
            { name: `${PREFIX}nowplaying`, value: 'Hiển thị bài đang phát' },
            { name: `${PREFIX}volume <0-100>`, value: 'Điều chỉnh âm lượng' }
        )
        .setFooter({ text: '🎵 Happy House - Mang âm nhạc đến mọi người!' });

    message.channel.send({ embeds: [helpEmbed] });
}

// Trích xuất Video ID từ URL YouTube
function extractVideoID(url) {
    if (!url || typeof url !== 'string') return null;
    
    try {
        // Trường hợp nếu đã là video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
        
        // Định dạng youtu.be/VIDEO_ID
        if (url.includes('youtu.be/')) {
            const parts = url.split('youtu.be/');
            if (parts.length > 1 && parts[1]) {
                return parts[1].split(/[?&#]/)[0];
            }
        } 
        // Định dạng youtube.com/watch?v=VIDEO_ID
        else if (url.includes('youtube.com/watch')) {
            const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            return match && match[1] ? match[1] : null;
        }
        // Định dạng youtube.com/v/VIDEO_ID
        else if (url.includes('youtube.com/v/')) {
            const parts = url.split('youtube.com/v/');
            if (parts.length > 1 && parts[1]) {
                return parts[1].split(/[?&#]/)[0];
            }
        }
        // Định dạng youtube.com/embed/VIDEO_ID
        else if (url.includes('youtube.com/embed/')) {
            const parts = url.split('youtube.com/embed/');
            if (parts.length > 1 && parts[1]) {
                return parts[1].split(/[?&#]/)[0];
            }
        }
        
        // Trường hợp khác, thử regex toàn diện
        const generalMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&\/]+)/);
        if (generalMatch && generalMatch[1]) {
            return generalMatch[1];
        }
    } catch (error) {
        console.error('Lỗi khi trích xuất video ID:', error);
    }
    
    return null;
}

// Hàm kiểm tra URL YouTube
function isValidYoutubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
        // Nếu đã là ID 11 ký tự thì coi là hợp lệ
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return true;
        }
        
        // Kiểm tra các định dạng URL YouTube phổ biến
        const patterns = [
            /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtu\.be\/[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}.*$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]{11}.*$/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    } catch (error) {
        console.error('Lỗi khi kiểm tra URL YouTube:', error);
        return false;
    }
}

// Hàm phát nhạc
async function play(message, args) {
    // Kiểm tra tham số
    if (args.length === 0) {
        return message.reply('❌ Vui lòng cung cấp tên bài hát hoặc URL YouTube!');
    }

    // Kiểm tra người dùng có trong voice channel không
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('❌ Bạn cần vào voice channel trước khi phát nhạc!');
    }

    // Lấy hoặc tạo queue cho server
    let serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        serverQueue = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            player: createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Pause
                }
            }),
            songs: [],
            volume: 50,
            playing: true
        };
        queues.set(message.guild.id, serverQueue);
    }

    try {
        let song;
        const query = args.join(' ');
        
        // Hiển thị thông báo tìm kiếm
        const searchMessage = await message.channel.send('🔍 Đang tìm kiếm...');
        
        try {
            // Kiểm tra xem đầu vào có phải là URL YouTube không
            const isUrl = isValidYoutubeUrl(query);
            
            if (isUrl) {
                console.log('Đầu vào là URL YouTube:', query);
                
                // Lấy thông tin video từ URL
                const videoId = extractVideoID(query);
                if (!videoId) {
                    searchMessage.delete().catch(() => {});
                    return message.reply('❌ URL YouTube không hợp lệ!');
                }
                
                // Chuẩn hóa URL
                const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
                
                try {
                    // Lấy thông tin video từ URL
                    const videoInfo = await yts({ videoId });
                    
                    song = {
                        title: videoInfo.title,
                        url: standardUrl,
                        duration: videoInfo.duration ? videoInfo.duration.timestamp : '0:00',
                        thumbnail: videoInfo.thumbnail,
                        requestedBy: message.author.tag
                    };
                } catch (videoInfoError) {
                    console.error('Lỗi khi lấy thông tin video từ URL:', videoInfoError);
                    
                    // Thử tìm kiếm theo ID nếu không lấy được thông tin trực tiếp
                    const searchResults = await yts(videoId);
                    if (!searchResults.videos.length) {
                        searchMessage.delete().catch(() => {});
                        return message.reply('❌ Không thể lấy thông tin video từ URL này!');
                    }
                    
                    const video = searchResults.videos[0];
                    song = {
                        title: video.title,
                        url: standardUrl,
                        duration: video.duration.timestamp || '0:00',
                        thumbnail: video.thumbnail,
                        requestedBy: message.author.tag
                    };
                }
            } else {
                console.log('Đầu vào là từ khóa tìm kiếm:', query);
                
                // Tìm kiếm video
                const searchResults = await yts(query);
                if (!searchResults.videos.length) {
                    searchMessage.delete().catch(() => {});
                    return message.reply('❌ Không tìm thấy bài hát nào phù hợp!');
                }
                
                const video = searchResults.videos[0];
                
                // Tạo thông tin bài hát
                song = {
                    title: video.title,
                    url: video.url,
                    duration: video.duration.timestamp || '0:00',
                    thumbnail: video.thumbnail,
                    requestedBy: message.author.tag
                };
            }
            
            searchMessage.delete().catch(() => {});
        } catch (error) {
            console.error('Lỗi khi tìm kiếm bài hát:', error);
            searchMessage.delete().catch(() => {});
            return message.reply('❌ Đã xảy ra lỗi khi tìm kiếm bài hát. Vui lòng thử lại sau!');
        }

        // Thêm bài hát vào queue
        serverQueue.songs.push(song);
        
        // Thông báo đã thêm bài hát
        const addedEmbed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🎵 Đã thêm vào hàng đợi')
            .setDescription(`[${song.title}](${song.url})`)
            .setThumbnail(song.thumbnail || 'https://i.imgur.com/4M7IWwP.png')
            .addFields(
                { name: '⏱️ Thời lượng', value: song.duration, inline: true },
                { name: '👤 Yêu cầu bởi', value: song.requestedBy, inline: true }
            )
            .setFooter({ text: '🎵 Happy House - Mang âm nhạc đến mọi người!' });
        
        message.channel.send({ embeds: [addedEmbed] });        // Kết nối và phát nhạc nếu chưa có kết nối
        if (!serverQueue.connection) {
            try {
                // Tạo kết nối voice với timeout và error handling
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: true, // Bot tự làm điếc để tiết kiệm băng thông
                    selfMute: false
                });
                
                serverQueue.connection = connection;
                
                // Xử lý các sự kiện connection
                connection.on(VoiceConnectionStatus.Ready, () => {
                    console.log('Voice connection ready!');
                });
                
                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    console.log('Voice connection disconnected');
                    queues.delete(message.guild.id);
                });
                
                connection.on(VoiceConnectionStatus.Destroyed, () => {
                    console.log('Voice connection destroyed');
                    queues.delete(message.guild.id);
                });
                
                connection.on('error', (error) => {
                    console.error('Voice connection error:', error);
                    if (error.message.includes('IP discovery')) {
                        console.log('Retrying voice connection due to IP discovery error...');
                        // Thử kết nối lại sau 2 giây
                        setTimeout(() => {
                            try {
                                connection.rejoin();
                            } catch (rejoinError) {
                                console.error('Failed to rejoin:', rejoinError);
                                queues.delete(message.guild.id);
                            }
                        }, 2000);
                    }
                });
                
                // Đợi connection sẵn sàng trước khi phát nhạc
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Voice connection timeout'));
                    }, 15000); // 15 giây timeout
                    
                    connection.on(VoiceConnectionStatus.Ready, () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    
                    if (connection.state.status === VoiceConnectionStatus.Ready) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                
                console.log('Voice connection established, starting playback...');
                
                // Bắt đầu phát nhạc
                await playSong(message.guild.id, serverQueue.songs[0]);
                
            } catch (err) {
                console.error('Lỗi khi kết nối voice channel:', err);
                queues.delete(message.guild.id);
                return message.channel.send('❌ Đã xảy ra lỗi khi kết nối voice channel! Vui lòng thử lại sau vài giây.');
            }
        }
    } catch (error) {
        console.error('Lỗi khi phát nhạc:', error);
        message.channel.send('❌ Đã xảy ra lỗi khi phát nhạc. Vui lòng thử lại sau!');
    }
}

// Hàm phát bài hát
async function playSong(guildId, song) {
    const serverQueue = queues.get(guildId);
    
    if (!song) {
        if (serverQueue && serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queues.delete(guildId);
        return;
    }

    try {
        console.log('Đang thử phát bài hát:', song.title);
        console.log('URL bài hát:', song.url);
        
        // Xác thực URL hoặc tìm URL từ tên bài hát
        let videoUrl = song.url;
        let videoId = extractVideoID(song.url);
        
        // Nếu không trích xuất được ID từ URL, thử tìm kiếm theo tên
        if (!videoId) {
            console.log('Không tìm thấy ID từ URL, thử tìm kiếm theo tên:', song.title);
            try {
                const searchResult = await yts(song.title);
                if (searchResult.videos.length > 0) {
                    videoUrl = searchResult.videos[0].url;
                    videoId = extractVideoID(videoUrl);
                    console.log('Đã tìm URL mới từ tên bài hát:', videoUrl);
                    
                    // Cập nhật URL trong danh sách phát
                    song.url = videoUrl;
                } else {
                    throw new Error('Không tìm thấy video phù hợp');
                }
            } catch (searchError) {
                console.error('Lỗi khi tìm kiếm bài hát:', searchError);
                serverQueue.textChannel.send(`❌ Không thể tìm thấy bài hát: ${song.title}`);
                serverQueue.songs.shift();
                return playSong(guildId, serverQueue.songs[0]);
            }
        }
        
        // Xây dựng URL chính xác từ ID
        if (videoId) {
            try {
                const standardYoutubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
                console.log('URL chuẩn hóa:', standardYoutubeUrl);                // Sử dụng @distube/ytdl-core để stream video từ YouTube với retry
                try {
                    // Validate URL first
                    if (!ytdl.validateURL(standardYoutubeUrl)) {
                        throw new Error('URL YouTube không hợp lệ');
                    }
                    
                    console.log('Đang tạo stream với @distube/ytdl-core (có retry)...');
                    
                    // Tạo stream với retry mechanism
                    const stream = await retryWithDelay(async () => {
                        console.log('Đang thử tạo stream...');
                        return ytdl(standardYoutubeUrl, {
                            filter: 'audioonly',
                            quality: 'lowestaudio', // Dùng quality thấp hơn để giảm tải
                            highWaterMark: 1 << 20, // Giảm buffer xuống 1MB
                            requestOptions: {
                                headers: {
                                    'User-Agent': getRandomUserAgent(),
                                    'Accept': '*/*',
                                    'Accept-Encoding': 'gzip, deflate',
                                    'Accept-Language': 'en-US,en;q=0.9',
                                    'Connection': 'keep-alive'
                                }
                            }
                        });
                    }, 3, 3000); // 3 lần thử, delay 3 giây
                    
                    console.log('Stream được tạo thành công sau retry!');
                    
                    // Xử lý lỗi stream
                    stream.on('error', (error) => {
                        console.error('Stream error:', error);
                        if (error.statusCode === 429) {
                            console.log('Gặp lỗi 429, thử fallback search...');
                        }
                        serverQueue.player.emit('error', error);
                    });
                    
                    // Tạo resource
                    const resource = createAudioResource(stream, {
                        inputType: 'arbitrary',
                        inlineVolume: true
                    });
                    
                    // Thiết lập âm lượng
                    if (resource.volume) {
                        resource.volume.setVolume(serverQueue.volume / 100);
                    }
                    
                    // Phát nhạc
                    serverQueue.player.play(resource);
                    
                    // Xử lý các sự kiện player
                    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
                        console.log('Bài hát đã kết thúc, phát bài tiếp theo...');
                        serverQueue.songs.shift();
                        playSong(guildId, serverQueue.songs[0]);
                    });
                    
                    serverQueue.player.once('error', (error) => {
                        console.error('Lỗi player:', error);
                        if (serverQueue.textChannel) {
                            serverQueue.textChannel.send('❌ Đã xảy ra lỗi khi phát nhạc!');
                        }
                        serverQueue.songs.shift();
                        playSong(guildId, serverQueue.songs[0]);
                    });
                    
                    // Kết nối player với connection
                    serverQueue.connection.subscribe(serverQueue.player);
                    
                    // Hiển thị thông báo đang phát
                    const playingEmbed = new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setTitle('🎵 Đang phát')
                        .setDescription(`[${song.title}](${song.url})`)
                        .setThumbnail(song.thumbnail || 'https://i.imgur.com/4M7IWwP.png')
                        .addFields(
                            { name: '⏱️ Thời lượng', value: song.duration, inline: true },
                            { name: '👤 Yêu cầu bởi', value: song.requestedBy, inline: true }
                        )
                        .setFooter({ text: '🎵 Happy House - Mang âm nhạc đến mọi người!' });
                    
                    serverQueue.textChannel.send({ embeds: [playingEmbed] });
                    
                } catch (streamError) {
                    console.error('Lỗi khi tạo stream:', streamError);
                      // Thử phương pháp thay thế với delay
                    try {
                        console.log('Thử phương pháp thay thế sau khi gặp lỗi 429...');
                        
                        // Delay trước khi thử fallback
                        await delay(5000); // Đợi 5 giây
                        
                        // Tìm kiếm video bằng tên
                        const results = await yts(song.title);
                        if (!results.videos.length) {
                            throw new Error('Không tìm thấy video thay thế');
                        }
                        
                        // Thử nhiều video thay thế
                        let successfulStream = null;
                        for (let i = 0; i < Math.min(3, results.videos.length); i++) {
                            const altVideo = results.videos[i];
                            console.log(`Thử video thay thế ${i + 1}: ${altVideo.url}`);
                            
                            try {
                                await delay(2000); // Delay giữa các thử nghiệm
                                
                                const stream = await retryWithDelay(async () => {
                                    return ytdl(altVideo.url, {
                                        filter: 'audioonly',
                                        quality: 'lowestaudio', // Dùng quality thấp
                                        highWaterMark: 1 << 19, // Buffer nhỏ hơn (512KB)
                                        requestOptions: {
                                            headers: {
                                                'User-Agent': getRandomUserAgent(),
                                                'Accept': '*/*',
                                                'Accept-Language': 'en-US,en;q=0.9'
                                            }
                                        }
                                    });
                                }, 2, 4000); // 2 lần thử, delay 4 giây
                                
                                successfulStream = stream;
                                console.log(`Tạo stream thành công với video thay thế ${i + 1}!`);
                                break;
                            } catch (altError) {
                                console.log(`Video thay thế ${i + 1} thất bại:`, altError.message);
                                continue;
                            }
                        }
                        
                        if (!successfulStream) {
                            throw new Error('Không thể tạo stream từ bất kỳ video thay thế nào');
                        }
                        
                        successfulStream.on('error', (error) => {
                            console.error('Alternative stream error:', error);
                            throw error;
                        });
                        
                        const resource = createAudioResource(successfulStream, {
                            inputType: 'arbitrary',
                            inlineVolume: true
                        });
                        
                        if (resource.volume) {
                            resource.volume.setVolume(serverQueue.volume / 100);
                        }
                        
                        serverQueue.player.play(resource);
                        serverQueue.connection.subscribe(serverQueue.player);
                        
                        const playingEmbed = new EmbedBuilder()
                            .setColor('#FF69B4')
                            .setTitle('🎵 Đang phát (phương pháp thay thế)')
                            .setDescription(`[${altVideo.title}](${altVideo.url})`)
                            .setThumbnail(altVideo.thumbnail || 'https://i.imgur.com/4M7IWwP.png')
                            .addFields(
                                { name: '⏱️ Thời lượng', value: altVideo.duration.timestamp || '0:00', inline: true },
                                { name: '👤 Yêu cầu bởi', value: song.requestedBy, inline: true }
                            )
                            .setFooter({ text: '🎵 Happy House - Mang âm nhạc đến mọi người!' });
                        
                        serverQueue.textChannel.send({ embeds: [playingEmbed] });                    } catch (altError) {
                        console.error('Phương pháp thay thế cũng thất bại:', altError);
                        
                        let errorMessage = `❌ Không thể phát bài hát: ${song.title}`;
                        if (altError.statusCode === 429 || streamError.statusCode === 429) {
                            errorMessage += '\n⚠️ YouTube đang giới hạn requests. Vui lòng thử lại sau vài phút.';
                        }
                        
                        serverQueue.textChannel.send(errorMessage);
                        serverQueue.songs.shift();
                        playSong(guildId, serverQueue.songs[0]);
                    }
                }
            } catch (streamError) {
                console.error('Lỗi khi tạo stream:', streamError);
                serverQueue.textChannel.send(`❌ Không thể phát bài hát: ${song.title}. Lỗi: ${streamError.message}`);
                serverQueue.songs.shift();
                playSong(guildId, serverQueue.songs[0]);
            }
        } else {
            // Không tìm thấy video ID hợp lệ
            console.error('Không thể trích xuất video ID hợp lệ');
            serverQueue.textChannel.send(`❌ Không thể phát bài hát: ${song.title} (ID không hợp lệ)`);
            serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs[0]);
        }
        
    } catch (error) {
        console.error('Lỗi khi phát bài hát:', error);
        if (serverQueue && serverQueue.textChannel) {
            serverQueue.textChannel.send(`❌ Đã xảy ra lỗi: ${error.message}`);
        }
        
        if (serverQueue && serverQueue.songs.length > 0) {
            serverQueue.songs.shift();
            playSong(guildId, serverQueue.songs[0]);
        }
    }
}

// Hàm bỏ qua bài hát
function skip(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    if (!message.member.voice.channel) {
        return message.channel.send('❌ Bạn cần vào voice channel để bỏ qua bài hát!');
    }
    
    message.channel.send('⏭️ Đã bỏ qua bài hát hiện tại!');
    serverQueue.player.stop();
}

// Hàm dừng nhạc và rời channel
function stop(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    if (!message.member.voice.channel) {
        return message.channel.send('❌ Bạn cần vào voice channel để dừng nhạc!');
    }
    
    serverQueue.songs = [];
    serverQueue.player.stop();
    if (serverQueue.connection) {
        serverQueue.connection.destroy();
    }
    queues.delete(message.guild.id);
    
    message.channel.send('🛑 Đã dừng phát nhạc và rời khỏi voice channel!');
}

// Hàm tạm dừng nhạc
function pause(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    if (!message.member.voice.channel) {
        return message.channel.send('❌ Bạn cần vào voice channel để tạm dừng nhạc!');
    }
    
    if (serverQueue.playing) {
        serverQueue.playing = false;
        serverQueue.player.pause();
        message.channel.send('⏸️ Đã tạm dừng phát nhạc!');
    } else {
        message.channel.send('❌ Nhạc đã được tạm dừng rồi!');
    }
}

// Hàm tiếp tục phát nhạc
function resume(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    if (!message.member.voice.channel) {
        return message.channel.send('❌ Bạn cần vào voice channel để tiếp tục phát nhạc!');
    }
    
    if (!serverQueue.playing) {
        serverQueue.playing = true;
        serverQueue.player.unpause();
        message.channel.send('▶️ Đã tiếp tục phát nhạc!');
    } else {
        message.channel.send('❌ Nhạc đang được phát rồi!');
    }
}

// Hàm hiển thị queue
function showQueue(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
        return message.channel.send('❌ Danh sách phát trống!');
    }
    
    // Tạo danh sách bài hát
    let queueList = serverQueue.songs.map((song, index) => {
        return `${index + 1}. [${song.title}](${song.url}) | ${song.duration} | ${song.requestedBy}`;
    }).join('\n');
    
    // Giới hạn độ dài danh sách
    if (queueList.length > 4096) {
        queueList = queueList.substring(0, 4093) + '...';
    }
    
    const queueEmbed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎵 Danh sách phát - Happy House')
        .setDescription(queueList)
        .setFooter({ text: `${serverQueue.songs.length} bài hát trong danh sách • Happy House Bot` });
    
    message.channel.send({ embeds: [queueEmbed] });
}

// Hàm hiển thị bài đang phát
function nowPlaying(message) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue || !serverQueue.songs.length) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    const song = serverQueue.songs[0];
    
    const npEmbed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎵 Đang phát')
        .setDescription(`[${song.title}](${song.url})`)
        .setThumbnail(song.thumbnail || 'https://i.imgur.com/4M7IWwP.png')
        .addFields(
            { name: '⏱️ Thời lượng', value: song.duration, inline: true },
            { name: '👤 Yêu cầu bởi', value: song.requestedBy, inline: true },
            { name: '🔊 Âm lượng', value: `${serverQueue.volume}%`, inline: true }
        )
        .setFooter({ text: '🎵 Happy House - Mang âm nhạc đến mọi người!' });
    
    message.channel.send({ embeds: [npEmbed] });
}

// Hàm thiết lập âm lượng
function setVolume(message, args) {
    const serverQueue = queues.get(message.guild.id);
    if (!serverQueue) {
        return message.channel.send('❌ Không có bài hát nào đang phát!');
    }
    
    if (!message.member.voice.channel) {
        return message.channel.send('❌ Bạn cần vào voice channel để điều chỉnh âm lượng!');
    }
    
    if (!args.length) {
        return message.channel.send(`🔊 Âm lượng hiện tại: ${serverQueue.volume}%`);
    }
    
    const volume = parseInt(args[0]);
    if (isNaN(volume) || volume < 0 || volume > 100) {
        return message.channel.send('❌ Vui lòng nhập âm lượng từ 0 đến 100!');
    }
    
    serverQueue.volume = volume;
    
    // Điều chỉnh âm lượng của resource hiện tại
    try {
        const resource = serverQueue.player._state.resource;
        if (resource && resource.volume) {
            resource.volume.setVolume(volume / 100);
        }
    } catch (error) {
        console.error('Lỗi khi điều chỉnh âm lượng:', error);
    }
    
    message.channel.send(`🔊 Đã đặt âm lượng thành ${volume}%`);
}

// Hàm định dạng thời gian
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// Đăng nhập bot
console.log('Đang khởi động Happy House Bot...');

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('Đăng nhập thành công!'))
    .catch(error => {
        console.error('Lỗi khi đăng nhập:', error);
    });
