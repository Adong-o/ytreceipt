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

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=channel&q=${encodeURIComponent(input)}&key=${API_KEY}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            return data.items[0].id.channelId;
        }
        throw new Error('Channel not found');
    } catch (error) {
        console.error('Error fetching channel ID:', error);
        throw error;
    }
}

async function fetchShortsCount(channelId) {
    let shortsCount = 0;
    let nextPageToken = null;

    do {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=50&type=video&key=${API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        const videoIds = data.items.map(item => item.id.videoId).join(',');

        if (videoIds) {
            const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${API_KEY}`;
            const videoDetailsResponse = await fetch(videoDetailsUrl);
            const videoDetailsData = await videoDetailsResponse.json();

            shortsCount += videoDetailsData.items.filter(video => {
                const duration = video.contentDetails.duration;
                const match = duration.match(/PT(\d+M)?(\d+S)?/);
                const minutes = match[1] ? parseInt(match[1].replace('M', '')) : 0;
                const seconds = match[2] ? parseInt(match[2].replace('S', '')) : 0;
                return (minutes * 60 + seconds) <= 60;
            }).length;
        }

        nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return shortsCount;
}

//function to be deleted.
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

async function fetchSubscriberMilestones(channelId) {
    try {
        const historicalDataUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${API_KEY}`;
        const response = await fetch(historicalDataUrl);
        const data = await response.json();

        const channel = data.items[0];
        const totalSubs = parseInt(channel.statistics.subscriberCount);
        const joinDate = new Date(channel.snippet.publishedAt);
        const now = new Date();
        const totalDays = (now - joinDate) / (1000 * 60 * 60 * 24);

        const subsPerDay = totalSubs / totalDays;
        const daysTo1K = Math.min(1000 / subsPerDay, totalDays);
        const daysTo100K = Math.min(100000 / subsPerDay, totalDays);

        const milestone1K = new Date(joinDate.getTime() + (daysTo1K * 24 * 60 * 60 * 1000));
        const milestone100K = new Date(joinDate.getTime() + (daysTo100K * 24 * 60 * 60 * 1000));

        return {
            milestone1K: milestone1K < now ? milestone1K.toLocaleDateString() : 'Not yet reached',
            milestone100K: milestone100K < now ? milestone100K.toLocaleDateString() : 'Not yet reached'
        };
    } catch (error) {
        console.error('Error fetching subscriber milestones:', error);
        return { milestone1K: 'Unknown', milestone100K: 'Unknown' };
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
        const milestones = await fetchSubscriberMilestones(channelId);

        return {
            channelInfo: channel,
            shortsCount,
            communityPosts,
            uploadFrequency,
            milestones
        };
    } catch (error) {
        console.error('Error fetching channel data:', error);
        throw error;
    }
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.querySelector('.receipt-container').style.display = 'none';
    document.querySelector('.buttons-container').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function showReceipt() {
    // Hide other elements
    document.querySelector('.hero-section').style.display = 'none';
    document.querySelector('h2').style.display = 'none';
    document.querySelector('.input-section').style.display = 'none';
    document.querySelector('.footer').style.display = 'none';

    // Show receipt and buttons
    document.querySelector('.receipt-container').style.display = 'block';
    document.querySelector('.buttons-container').style.display = 'block';
}

function resetView() {
    // Show other elements
    document.querySelector('.hero-section').style.display = 'block';
    document.querySelector('h2').style.display = 'block';
    document.querySelector('.input-section').style.display = 'block';
    document.querySelector('.footer').style.display = 'block';

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
        ['Customer Name', channel.snippet.title],
        ['Subscribers', formatNumber(channel.statistics.subscriberCount)],
        ['Total Videos', formatNumber(channel.statistics.videoCount)],
        ['Total Views', formatNumber(channel.statistics.viewCount)],
        ['Shorts', formatNumber(data.shortsCount)],
        //out coz i cant find how to add community count from the api neither does google, ai or the rest.
        //['Community Posts', formatNumber(data.communityPosts)],
        ['Upload Frequency', data.uploadFrequency],
        ['1K Milestone', data.milestones.milestone1K],
        ['100K Milestone', data.milestones.milestone100K],
        ['Country', channel.snippet.country || 'Not specified'],
        ['Join Date', new Date(channel.snippet.publishedAt).toLocaleDateString()],
        ['Custom URL', channel.snippet.customUrl || 'Not available']
    ];

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

    showReceipt();
}

async function handleGeneration() {
    const channelInput = document.getElementById('channelInput').value;
    if (!channelInput) {
        showError('Please enter a channel URL or name');
        return;
    }

    showLoading();

    try {
        const channelId = await fetchChannelId(channelInput);
        const channelData = await fetchChannelData(channelId);
        generateReceipt(channelData);
    } catch (error) {
        showError('We dont run into this issues. Check spelling and try again later.');
        console.error(error);
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
    document.querySelector('.buttons-container').style.display = 'none';
    document.querySelector('.receipt-container').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    
    document.getElementById('channelInput').addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            await handleGeneration();
        }
    });
    
    document.getElementById('generateButton').addEventListener('click', handleGeneration);
});