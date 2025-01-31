const modeSwitch = document.getElementById('modeSwitch');

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    modeSwitch.checked = true; 
}

modeSwitch.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode');
    
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
});


  const API_KEY = 'AIzaSyCg6f38_RPUR9uOvnfUsybjqxuVuV1yBx0'; 

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const day = days[date.getDay()];
    const month = months[date.getMonth()];
    const dateNum = date.getDate();
    const year = date.getFullYear();

    return `${day}, ${month} ${dateNum}, ${year} (${dateNum}/${date.getMonth() + 1}/${year})`;
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

async function fetchChannelId(input) {
    try {
        if (input.includes('channel/')) {
            return input.split('channel/')[1].split('/')[0];
        }
        
        if (input.includes('youtube.com/')) {
            const url = new URL(input);
            const channelId = url.pathname.split('/').filter(Boolean)[1];
            return channelId;
        }

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=channel&q=${encodeURIComponent(input)}&key=${API_KEY}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (response.status === 403) {
            throw new Error('quota_exceeded');
        }

        if (!response.ok) {
            throw new Error('api_error');
        }

        if (data.items && data.items.length > 0) {
            return data.items[0].id.channelId;
        }
        throw new Error('channel_not_found');
    } catch (error) {
        console.error('Error fetching channel ID:', error);
        if (error.message === 'quota_exceeded') {
            throw new Error('API quota exceeded. Please try again tomorrow.');
        } else if (error.message === 'api_error') {
            throw new Error('YouTube API is currently unavailable. Please try again later.');
        } else if (error.message === 'channel_not_found') {
            throw new Error('Channel not found. Please check the channel name or URL.');
        }
        throw error;
    }
}

async function fetchShortsCount(channelId) {
    try {
        let shortsCount = 0;
        let nextPageToken = null;

        do {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=50&type=video&key=${API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
            const response = await fetch(searchUrl);
            
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('quota_exceeded');
                }
                throw new Error('api_error');
            }

            const data = await response.json();

            if (!data.items) {
                return 0;
            }

            const videoIds = data.items.map(item => item.id.videoId).filter(Boolean).join(',');

            if (videoIds) {
                const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`;
                const videoDetailsResponse = await fetch(videoDetailsUrl);
                
                if (!videoDetailsResponse.ok) {
                    throw new Error('api_error');
                }

                const videoDetailsData = await videoDetailsResponse.json();

                if (videoDetailsData.items) {
                    shortsCount += videoDetailsData.items.filter(video => {
                        const duration = video.contentDetails.duration;
                        const match = duration.match(/PT(\d+M)?(\d+S)?/);
                        const minutes = match[1] ? parseInt(match[1].replace('M', '')) : 0;
                        const seconds = match[2] ? parseInt(match[2].replace('S', '')) : 0;
                        return (minutes * 60 + seconds) <= 60;
                    }).length;
                }
            }

            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        return shortsCount;
    } catch (error) {
        console.error('Error fetching shorts count:', error);
        if (error.message === 'quota_exceeded') {
            throw new Error('API quota exceeded. Please try again tomorrow.');
        }
        return 0; // Return 0 for other errors to allow the receipt to still generate
    }
}


async function fetchCommunityPosts(channelId) {
    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/activities?part=snippet&channelId=${channelId}&maxResults=50&key=${API_KEY}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        return data.items.filter(item => item.snippet.type === 'post').length;
    } catch (error) {
        console.error('Error fetching community posts:', error);
        return 0;
    }
}

async function calculateUploadFrequency(channelId) {
    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&type=video&order=date&key=${API_KEY}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.items.length < 2) return 'Insufficient data';

        const latestDate = new Date(data.items[0].snippet.publishedAt);
        const oldestDate = new Date(data.items[data.items.length - 1].snippet.publishedAt);
        const daysDiff = (latestDate - oldestDate) / (1000 * 60 * 60 * 24);
        const uploadsPerWeek = (data.items.length / daysDiff) * 7;

        return uploadsPerWeek.toFixed(1) + ' videos/week';
    } catch (error) {
        console.error('Error calculating upload frequency:', error);
        return 'Unable to calculate';
    }
}

async function fetchChannelData(channelId) {
    try {
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${API_KEY}`;
        const channelResponse = await fetch(channelUrl);
        const channelData = await channelResponse.json();

        if (!channelData.items || channelData.items.length === 0) {
            throw new Error('Channel not found');
        }

        const channel = channelData.items[0];
        const shortsCount = await fetchShortsCount(channelId);
        const communityPosts = await fetchCommunityPosts(channelId);
        const uploadFrequency = await calculateUploadFrequency(channelId);

        return {
            channelInfo: channel,
            shortsCount,
            communityPosts,
            uploadFrequency
        };
    } catch (error) {
        console.error('Error fetching channel data:', error);
        throw error;
    }
}

function showLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const countdownElement = loadingOverlay.querySelector('.loading-countdown');
    const loadingText = loadingOverlay.querySelector('.loading-text');
    const loadingSubtext = loadingOverlay.querySelector('.loading-subtext');
    loadingOverlay.style.display = 'flex';
    
    const messages = [
        ['Fetching Channel Data...', 'Connecting to YouTube'],
        ['Analyzing Statistics...', 'Crunching the numbers'],
        ['Generating Receipt...', 'Almost there!']
    ];
    
    let countdown = 3;
    countdownElement.textContent = countdown;
    
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;
        
        // Update messages based on countdown
        const messageIndex = 3 - countdown - 1;
        if (messageIndex >= 0 && messageIndex < messages.length) {
            loadingText.textContent = messages[messageIndex][0];
            loadingSubtext.textContent = messages[messageIndex][1];
        }
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.style.display = 'none';
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        errorElement.style.opacity = '0';
        setTimeout(() => {
            errorElement.style.display = 'none';
            errorElement.style.opacity = '1';
        }, 300);
    }, 5000);
}

function showReceipt() {
    // Hide other elements
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('h2').style.display = 'none';
    document.querySelector('.input-section').style.display = 'none';
    document.querySelector('.creator-info').style.display = 'none';

    // Show receipt and buttons
    document.querySelector('.receipt-container').style.display = 'block';
    document.querySelector('.buttons-container').style.display = 'block';
}

function resetView() {
    // Show other elements
    document.querySelector('.hero-section').style.display = 'block';
    document.querySelector('h2').style.display = 'block';
    document.querySelector('.input-section').style.display = 'block';
    document.querySelector('.creator-info').style.display = 'block';

    // Hide receipt and buttons
    document.querySelector('.receipt-container').style.display = 'none';
    document.querySelector('.buttons-container').style.display = 'none';
}

// Receipt Generation
function generateReceipt(data) {
    const content = document.getElementById('receiptContent');
    const now = new Date();
    const receiptId = 'YT' + Math.random().toString(36).substr(2, 9).toUpperCase();

    document.getElementById('fullDate').textContent = formatDate(now);
    document.getElementById('generationTime').textContent = formatTime(now);
    document.getElementById('receiptId').textContent = receiptId;

    content.innerHTML = '';

    const channel = data.channelInfo;
    const items = [
        ['Channel Name', channel.snippet.title],
        ['Subscribers', formatNumber(channel.statistics.subscriberCount)],
        ['Total Videos', formatNumber(channel.statistics.videoCount)],
        ['Total Views', formatNumber(channel.statistics.viewCount)],
        ['Shorts', formatNumber(data.shortsCount)],
        ['Upload Frequency', data.uploadFrequency],
        ['Average Views/Video', formatNumber(Math.round(channel.statistics.viewCount / channel.statistics.videoCount))],
        ['Engagement Rate', ((channel.statistics.viewCount / channel.statistics.subscriberCount) * 100).toFixed(1) + '%'],
        ['Views/Sub Ratio', (channel.statistics.viewCount / channel.statistics.subscriberCount).toFixed(1)],
        ['Channel Age', calculateChannelAge(channel.snippet.publishedAt)],
        ['Average Daily Views', formatNumber(Math.round(channel.statistics.viewCount / calculateDaysSinceJoining(channel.snippet.publishedAt)))],
        ['Country', channel.snippet.country || 'Not specified'],
        ['Join Date', new Date(channel.snippet.publishedAt).toLocaleDateString()],
        ['Custom URL', channel.snippet.customUrl || 'Not available']
    ];

    const funStats = {
        tier: (views, subs) => {
            if(views >= 1000000000) return "Elite Creator";
            if(views >= 100000000) return "Diamond Creator";
            if(views >= 10000000) return "Platinum Creator";
            if(views >= 1000000) return "Gold Creator";
            if(views >= 100000) return "Silver Creator";
            return "Rising Creator";
        }
    };

    items.push(
        ['Creator Tier', funStats.tier(parseInt(channel.statistics.viewCount), parseInt(channel.statistics.subscriberCount))],
        ['Videos per Month', (parseFloat(data.uploadFrequency) * 4.3).toFixed(1)]
    );

    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'receipt-item';
        div.innerHTML = `
            <span>${(index + 1).toString().padStart(2, '0')}. ${item[0]}</span>
            <span>${item[1]}</span>
        `;
        content.appendChild(div);
    });

    const couponCode = `YT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    document.getElementById('couponCode').textContent = couponCode;

    JsBarcode("#barcode", receiptId, {
        format: "CODE128",
        width: 2,
        height: 50,
        displayValue: true
    });

    const specialMessage = document.createElement('div');
    specialMessage.className = 'special-message';
    specialMessage.textContent = generateReceiptMessage(data);
    content.appendChild(specialMessage);

    showReceipt();
    fireConfetti();
}

async function handleGeneration() {
    const channelInput = document.getElementById('channelInput').value;
    if (!channelInput) {
        showError('Please enter a channel URL or name');
        return;
    }

    showLoading();

    try {
        await Promise.all([
            new Promise(resolve => setTimeout(resolve, 3000)),
            (async () => {
                const channelId = await fetchChannelId(channelInput);
                const channelData = await fetchChannelData(channelId);
                return channelData;
            })()
        ]).then(([_, channelData]) => {
            generateReceipt(channelData);
        });
    } catch (error) {
        console.error(error);
        if (error.message === 'Channel not found') {
            showError('Channel not found. Please check the channel name or URL and try again.');
        } else if (error.message.includes('quota')) {
            showError('Daily API limit reached. Please try again tomorrow.');
        } else {
            showError('Oops! Something went wrong. Please try again in a few minutes.');
        }
    } finally {
        hideLoading();
    }
}

function downloadReceipt() {
    html2canvas(document.querySelector('.receipt-container')).then(canvas => {
        const link = document.createElement('a');
        link.download = 'youtube-receipt.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

async function shareReceipt() {
    try {
        const canvas = await html2canvas(document.querySelector('.receipt-container'));
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const file = new File([blob], 'youtube-receipt.png', { type: 'image/png' });
        
        const shareData = {
            files: [file],
            title: 'YouTube Channel Receipt',
            text: 'Check out this YouTube channel analytics!'
        };
        
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
        } else {
            throw new Error('Sharing is not supported on this platform/browser');
        }
    } catch (error) {
        console.error('Error sharing:', error);
        alert('Error sharing the receipt');
    }
}

function generateAnother() {
    // Add fade-out effect
    document.querySelector('.receipt-container').classList.add('fade-out');
    document.querySelector('.buttons-container').classList.add('fade-out');
    
    // Wait for fade-out to complete
    setTimeout(() => {
        // Reset the input field
        document.getElementById('channelInput').value = '';
        
        // Reset any error messages
        document.getElementById('errorMessage').style.display = 'none';
        
        // Show the original view with fade-in
        resetView();
        
        // Add fade-in effect to main page elements
        document.querySelector('.hero-section').classList.add('fade-in');
        document.querySelector('h2').classList.add('fade-in');
        document.querySelector('.input-section').classList.add('fade-in');
        document.querySelector('.footer').classList.add('fade-in');
    }, 300); // Match this with the CSS transition duration
}

document.addEventListener('DOMContentLoaded', function() {
    // Hide elements initially
    document.querySelector('.buttons-container').style.display = 'none';
    document.querySelector('.receipt-container').style.display = 'none';
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    
    // Add event listeners
    document.getElementById('channelInput').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            await handleGeneration();
        }
    });
    
    document.getElementById('generateButton').addEventListener('click', handleGeneration);
});

function calculateChannelAge(joinDate) {
    const now = new Date();
    const channelDate = new Date(joinDate);
    const years = now.getFullYear() - channelDate.getFullYear();
    const months = now.getMonth() - channelDate.getMonth();
    return `${years} years, ${months} months`;
}

function calculateDaysSinceJoining(joinDate) {
    return Math.max(1, Math.round((new Date() - new Date(joinDate)) / (1000 * 60 * 60 * 24)));
}

function generateReceiptMessage(data) {
    const subs = parseInt(data.channelInfo.statistics.subscriberCount);
    const views = parseInt(data.channelInfo.statistics.viewCount);
    const uploads = parseInt(data.channelInfo.statistics.videoCount);
    const avgViews = views / uploads;
    const shortsCount = data.shortsCount;
    
    let messages = [];
    
    // Subscriber-based messages
    if(subs >= 1000000) {
        messages.push("🎯 Millionaire Creator Status!");
    } else if(subs >= 100000) {
        messages.push("🌟 Thriving Creator Community!");
    } else if(subs >= 10000) {
        messages.push("🚀 Fast-Growing Channel!");
    } else if(subs >= 1000) {
        messages.push("💫 Emerging Creator!");
    }

    // View-based messages
    if(views >= 1000000000) {
        messages.push("🏆 Billion Views Achievement!");
    } else if(views >= 100000000) {
        messages.push("🎉 Hundred Million Views Club!");
    } else if(views >= 10000000) {
        messages.push("🌠 Ten Million Views Milestone!");
    } else if(views >= 1000000) {
        messages.push("🎯 Million Views Success!");
    }

    // Engagement messages
    if(views/subs > 1000) {
        messages.push("⚡ Exceptional Viewer Engagement!");
    } else if(views/subs > 500) {
        messages.push("🔥 Outstanding View-Sub Ratio!");
    } else if(views/subs > 100) {
        messages.push("✨ Strong Audience Connection!");
    }

    // Upload frequency messages
    if(uploads > 1000) {
        messages.push("🎬 Content Creation Master!");
    } else if(uploads > 500) {
        messages.push("📹 Consistent Upload Champion!");
    } else if(uploads > 100) {
        messages.push("📺 Dedicated Content Creator!");
    }

    // Average views messages
    if(avgViews > 1000000) {
        messages.push("💫 Viral Content Creator!");
    } else if(avgViews > 100000) {
        messages.push("🌟 High-Impact Content!");
    } else if(avgViews > 10000) {
        messages.push("⭐ Impressive View Counts!");
    }

    // Shorts-focused messages
    if(shortsCount > uploads/2 && shortsCount > 100) {
        messages.push("📱 Shorts Mastery Achievement!");
    } else if(shortsCount > uploads/3 && shortsCount > 50) {
        messages.push("🎵 Active Shorts Creator!");
    } else if(shortsCount > 20) {
        messages.push("📲 Growing Shorts Presence!");
    }

    // Special combinations
    if(subs > 100000 && avgViews > 50000) {
        messages.push("🏅 Elite Creator Performance!");
    }
    if(uploads > 500 && views/subs > 200) {
        messages.push("🎯 Content-Engagement Excellence!");
    }
    if(shortsCount > 100 && avgViews > 10000) {
        messages.push("💫 Shorts Success Story!");
    }

    // Select 3-5 random messages
    const numberOfMessages = Math.floor(Math.random() * 3) + 3; // Random number between 3 and 5
    messages = messages
        .sort(() => Math.random() - 0.5) // Shuffle array
        .slice(0, numberOfMessages); // Take first 3-5 messages

    // If somehow no messages were generated, add a default message
    if(messages.length === 0) {
        messages.push("🌟 Keep Creating and Growing!");
    }

    return "🎉 Channel Highlights:\n" + messages.join('\n');
}

// Add this function for testing without API
function getMockData(channelName) {
    return {
        channelInfo: {
            snippet: {
                title: channelName,
                publishedAt: new Date(2020, 0, 1).toISOString(),
                country: 'US'
            },
            statistics: {
                subscriberCount: '1000',
                videoCount: '50',
                viewCount: '100000'
            }
        },
        shortsCount: 10,
        uploadFrequency: '2.5 videos/week'
    };
}

function fireConfetti() {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Since particles fall down, start a bit higher than the page
        confetti(Object.assign({}, defaults, { 
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        }));
        confetti(Object.assign({}, defaults, { 
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        }));
    }, 250);
}
