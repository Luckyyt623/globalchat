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
    messageHistory = messageHistory.filter(msg => now - msg.rawTime < MSG_LIFETIME_MS);
}, 120 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.send('Slither Global Chat Server is running!');
});

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = null;

    // Send existing history
    ws.send(JSON.stringify({
        type: 'chat-history',
        messages: messageHistory
    }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch {
            ws.send(JSON.stringify({
                type: 'system-message',
                text: 'Invalid message format.',
                rawTime: Date.now()
            }));
            return;
        }

        const now = Date.now();

        if (parsedMessage.type === 'user-join') {
            ws.username = parsedMessage.username?.trim() || 'AnonymousSnake';
            const joinMsg = {
                type: 'system-message',
                text: `${ws.username} has joined.`,
                rawTime: now
            };
            pushMessage(joinMsg);
        }

        if (!ws.username) return;

        if (parsedMessage.type === 'chat-message') {
            const msg = {
                type: 'chat-message',
                username: ws.username,
                text: parsedMessage.text,
                rawTime: now
            };
            pushMessage(msg);
        }

        if (parsedMessage.type === 'get-history') {
            ws.send(JSON.stringify({
                type: 'chat-history',
                messages: messageHistory
            }));
        }
    });

    ws.on('close', () => {
        if (ws.username) {
            const leaveMsg = {
                type: 'system-message',
                text: `${ws.username} has left.`,
                rawTime: Date.now()
            };
            pushMessage(leaveMsg);
        }
        clients.delete(ws);
    });
});

function pushMessage(msg) {
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) {
        messageHistory.shift();
    }
    broadcast(msg);
}

function broadcast(data) {
    const strData = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(strData);
        }
    });
}

server.listen(PORT, () => {
    console.log(`✅ Global Chat Server running on ws://0.0.0.0:${PORT}`);
});