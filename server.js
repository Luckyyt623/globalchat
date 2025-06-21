const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

let messageHistory = []; // Will be cleaned automatically

app.get('/', (req, res) => {
    res.send('Slither Chat Server is running!');
});

// Clean messages older than 30 minutes every 1 minute
setInterval(() => {
    const now = Date.now();
    const THIRTY_MINUTES = 30 * 60 * 1000;

    messageHistory = messageHistory.filter(msg => {
        return now - msg.timestamp < THIRTY_MINUTES;
    });
}, 60 * 1000); // Clean every 60 seconds

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = null;

    // Send existing message history (within 30 min only)
    ws.send(JSON.stringify({
        type: 'chat-history',
        messages: messageHistory.map(msg => ({
            ...msg,
            timestamp: formatTime(msg.timestamp)
        }))
    }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch {
            return;
        }

        const now = Date.now();

        if (parsedMessage.type === 'user-join') {
            ws.username = parsedMessage.username?.trim() || 'AnonymousSnake';
            const joinMsg = {
                type: 'user-joined-notification',
                text: `${ws.username} has joined.`,
                timestamp: now
            };
            broadcast(joinMsg);
        }

        if (!ws.username) return; // Block chat before joining

        if (parsedMessage.type === 'chat-message') {
            const msg = {
                type: 'chat-message',
                username: ws.username,
                text: parsedMessage.text,
                timestamp: now
            };
            messageHistory.push(msg);
            broadcast(msg);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        if (ws.username) {
            const leaveMsg = {
                type: 'user-left-notification',
                text: `${ws.username} has left.`,
                timestamp: Date.now()
            };
            broadcast(leaveMsg);
        }
    });
});

function broadcast(data) {
    const outgoing = {
        ...data,
        timestamp: formatTime(data.timestamp)
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
    console.log(`✅ Chat server running on ws://localhost:${PORT}`);
});