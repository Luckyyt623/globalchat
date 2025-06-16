const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

const messageHistory = []; // Last 50 messages

app.get('/', (req, res) => {
    res.send('Slither Chat Server is running!');
});

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = null; // Not joined yet

    // Send message history
    ws.send(JSON.stringify({ type: 'chat-history', messages: messageHistory }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch {
            return;
        }

        const now = getCurrentTime();

        if (parsedMessage.type === 'user-join') {
            ws.username = parsedMessage.username?.trim() || 'AnonymousSnake';
            const joinMsg = {
                type: 'user-joined-notification',
                text: `${ws.username} has joined.`,
                timestamp: now
            };
            broadcast(joinMsg);
        }

        if (!ws.username) return; // Don't allow chat without joining

        if (parsedMessage.type === 'chat-message') {
            const msg = {
                type: 'chat-message',
                username: ws.username,
                text: parsedMessage.text,
                timestamp: now
            };
            messageHistory.push(msg);
            if (messageHistory.length > 50) messageHistory.shift();
            broadcast(msg);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        if (ws.username) {
            const leaveMsg = {
                type: 'user-left-notification',
                text: `${ws.username} has left.`,
                timestamp: getCurrentTime()
            };
            broadcast(leaveMsg);
        }
    });
});

function broadcast(data) {
    const strData = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(strData);
        }
    });
}

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-IN', {
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