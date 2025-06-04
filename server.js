const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

const messageHistory = []; // Store last 50 messages

app.get('/', (req, res) => {
    res.send('Slither Chat Server is running!');
});

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = "AnonymousSnake";

    // Send existing message history to new user
    ws.send(JSON.stringify({ type: 'chat-history', messages: messageHistory }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch {
            return;
        }

        if (parsedMessage.type === 'user-join') {
            ws.username = parsedMessage.username.trim();
            broadcast({ type: 'user-joined-notification', text: `${ws.username} has joined.` });
        } else if (parsedMessage.type === 'chat-message') {
            const msg = { type: 'chat-message', username: ws.username, text: parsedMessage.text };
            messageHistory.push(msg);
            if (messageHistory.length > 50) messageHistory.shift();
            broadcast(msg);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        broadcast({ type: 'user-left-notification', text: `${ws.username} has left.` });
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

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});