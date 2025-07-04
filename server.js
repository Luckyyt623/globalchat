const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();
let messageHistory = [];

const MAX_HISTORY = 50; // Limit memory usage
const MSG_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

// Clean messages older than 10 minutes every 2 minutes
setInterval(() => {
    const now = Date.now();
    messageHistory = messageHistory.filter(msg => now - msg._rawTime < MSG_LIFETIME_MS);
}, 120 * 1000);

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.send('Slither Global Chat Server is running!');
});

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = null;

    // Send existing message history
    ws.send(JSON.stringify({
        type: 'chat-history',
        messages: messageHistory.map(msg => ({
            type: msg.type,
            username: msg.username,
            text: msg.text,
            timestamp: formatTime(msg._rawTime)
        }))
    }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch {
            ws.send(JSON.stringify({
                type: 'system-message',
                text: 'Invalid message format.',
                timestamp: formatTime(Date.now())
            }));
            return;
        }

        const now = Date.now();

        if (parsedMessage.type === 'user-join') {
            ws.username = parsedMessage.username?.trim() || 'AnonymousSnake';
            const joinMsg = {
                type: 'system-message',
                text: `${ws.username} has joined.`,
                _rawTime: now
            };
            messageHistory.push(joinMsg);
            if (messageHistory.length > MAX_HISTORY) {
                messageHistory.shift();
            }
            broadcast(joinMsg);
        }

        if (!ws.username) return;

        if (parsedMessage.type === 'chat-message') {
            const msg = {
                type: 'chat-message',
                username: ws.username,
                text: parsedMessage.text,
                _rawTime: now
            };
            messageHistory.push(msg);
            if (messageHistory.length > MAX_HISTORY) {
                messageHistory.shift();
            }
            broadcast(msg);
        }

        if (parsedMessage.type === 'get-history') {
            ws.send(JSON.stringify({
                type: 'chat-history',
                messages: messageHistory.map(msg => ({
                    type: msg.type,
                    username: msg.username,
                    text: msg.text,
                    timestamp: formatTime(msg._rawTime)
                }))
            }));
        }
    });

    ws.on('close', () => {
        if (ws.username) {
            const leaveMsg = {
                type: 'system-message',
                text: `${ws.username} has left.`,
                _rawTime: Date.now()
            };
            messageHistory.push(leaveMsg);
            if (messageHistory.length > MAX_HISTORY) {
                messageHistory.shift();
            }
            broadcast(leaveMsg);
        }
        clients.delete(ws);
    });
});

function broadcast(data) {
    const outgoing = {
        type: data.type,
        text: data.text,
        username: data.username,
        timestamp: formatTime(data._rawTime)
    };
    const strData = JSON.stringify(outgoing);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(strData);
        }
    });
}

function formatTime(ms) {
    return new Date(ms).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });
}

server.listen(PORT, () => {
    console.log(`✅ Global Chat Server running on ws://0.0.0.0:${PORT}`);
});