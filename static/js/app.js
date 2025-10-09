let socket;
let username = '';
let deferredPrompt;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('App initializing...');
    initializeApp();
    registerServiceWorker();
    setupInstallPrompt();
});

function initializeApp() {
    // Check if username is stored
    const storedUsername = localStorage.getItem('chat_username');
    if (storedUsername) {
        username = storedUsername;
        showChat();
        connectToServer();
    }
    
    // Setup enter key for username
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') setUsername();
        });
        usernameInput.focus();
    }
    
    // Setup enter key for messages
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

function setUsername() {
    const input = document.getElementById('usernameInput');
    const name = input.value.trim();
    
    if (name.length < 2) {
        alert('Please enter a name (at least 2 characters)');
        return;
    }
    
    username = name;
    localStorage.setItem('chat_username', username);
    showChat();
    connectToServer();
}

function showChat() {
    document.getElementById('usernameSetup').style.display = 'none';
    document.getElementById('chatContainer').style.display = 'flex';
    
    // Focus message input
    setTimeout(() => {
        document.getElementById('messageInput')?.focus();
    }, 100);
}

function connectToServer() {
    updateStatus('Connecting...', 'connecting');
    
    socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        reconnectAttempts = 0;
        updateStatus('Connected', 'connected');
        socket.emit('set_user', { username });
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        updateStatus('Disconnected', 'disconnected');
        
        if (reason === 'io server disconnect') {
            // Server disconnected, try to reconnect
            socket.connect();
        }
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Reconnection attempt:', attemptNumber);
        reconnectAttempts = attemptNumber;
        updateStatus(`Reconnecting (${attemptNumber})...`, 'connecting');
    });
    
    socket.on('reconnect_failed', () => {
        console.log('Reconnection failed');
        updateStatus('Connection failed', 'disconnected');
        addSystemMessage('Unable to connect. Please refresh the page.');
    });
    
    socket.on('connected', (data) => {
        console.log('Server message:', data.message);
        addSystemMessage('Connected to Genesys chat');
    });
    
    socket.on('new_message', (data) => {
        addMessage(data);
    });
    
    socket.on('message_sent', (data) => {
        console.log('Message sent successfully:', data);
    });
    
    socket.on('error', (data) => {
        console.error('Error:', data.message);
        showError(data.message);
    });
    
    socket.on('user_set', (data) => {
        console.log('User set:', data.username);
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!socket || !socket.connected) {
        showError('Not connected to server');
        return;
    }
    
    // Disable send button temporarily
    const sendButton = document.getElementById('sendButton');
    sendButton.disabled = true;
    
    socket.emit('send_message', {
        message,
        user: username
    });
    
    // Add message to UI immediately
    addMessage({
        message,
        user: username,
        timestamp: new Date().toISOString(),
        from: 'me'
    });
    
    input.value = '';
    input.focus();
    
    // Re-enable send button
    setTimeout(() => {
        sendButton.disabled = false;
    }, 500);
}

function addMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message from-${data.from}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const displayName = data.user || (data.from === 'genesys' ? 'Genesys' : 'User');
    
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="message-user">${escapeHtml(displayName)}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(data.message)}</div>
    `;
    
    messagesDiv.appendChild(messageEl);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Remove welcome message if it exists
    const welcome = messagesDiv.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    // Play sound (optional)
    if (data.from !== 'me') {
        playNotificationSound();
    }
}

function addSystemMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'welcome-message';
    messageEl.innerHTML = `
        <div class="welcome-icon">ℹ️</div>
        <div class="welcome-text">${escapeHtml(message)}</div>
    `;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showError(message) {
    addSystemMessage(`⚠️ ${message}`);
}

function updateStatus(text, status) {
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    
    if (statusText) statusText.textContent = text;
    if (statusDot) {
        statusDot.className = `status-dot ${status}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    // Optional: Add notification sound
    // const audio = new Audio('/static/sounds/notification.mp3');
    // audio.play().catch(e => console.log('Could not play sound'));
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
            .then(reg => {
                console.log('Service Worker registered', reg);
            })
            .catch(err => {
                console.log('Service Worker registration failed', err);
            });
    }
}

// PWA Install Prompt
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install prompt after 10 seconds
        setTimeout(() => {
            document.getElementById('installPrompt').style.display = 'flex';
        }, 10000);
    });
    
    window.addEventListener('appinstalled', () => {
        console.log('PWA installed');
        deferredPrompt = null;
        document.getElementById('installPrompt').style.display = 'none';
    });
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted install');
            }
            deferredPrompt = null;
            document.getElementById('installPrompt').style.display = 'none';
        });
    }
}

function dismissInstall() {
    document.getElementById('installPrompt').style.display = 'none';
    localStorage.setItem('install_dismissed', 'true');
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
        });
    }
}

// Call after user interacts with app
setTimeout(() => {
    requestNotificationPermission();
}, 5000);
