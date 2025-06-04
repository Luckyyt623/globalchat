const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001; // Render.com sets PORT env variable

const app = express();

// Simple HTTP endpoint
app.get('/', (req, res) => {
    res.send('Slither Chat Server is running!');
});

// Create HTTP server and attach Express app
const server = http.createServer(app);

// WebSocket server on the same HTTP server
const wss = new WebSocket.Server({ server });

// Store connected clients. A Set is efficient for adding/deleting.
const clients = new Set();

console.log(`Chat server started on port ${PORT}`);

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.username = "AnonymousSnake"; // Default username, updated by 'user-join'
    console.log(`Client connected. Current username: ${ws.username}. Total clients: ${clients.size}`);

    // Send a welcome message to the newly connected client
    ws.send(JSON.stringify({ type: 'server-message', text: 'Welcome to Slither Chat!' }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            const messageString = message.toString();
            parsedMessage = JSON.parse(messageString);
            console.log(`Received from ${ws.username}:`, parsedMessage);
        } catch (e) {
            console.error(`Failed to parse message from ${ws.username}:`, message.toString(), e);
            ws.send(JSON.stringify({ type: 'server-message', text: 'Error: Your message was unreadable.' }));
            return;
        }

        if (parsedMessage.type === 'chat-message' && typeof parsedMessage.text === 'string' && parsedMessage.text.trim() !== "") {
            const broadcastMessage = JSON.stringify({
                type: 'chat-message',
                username: ws.username,
                text: parsedMessage.text.trim()
            });
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcastMessage);
                }
            });
        } else if (parsedMessage.type === 'user-join' && typeof parsedMessage.username === 'string' && parsedMessage.username.trim() !== "") {
            const oldUsername = ws.username;
            ws.username = parsedMessage.username.trim();
            console.log(`User ${oldUsername} is now known as ${ws.username}`);
            const joinNotification = JSON.stringify({
                type: 'user-joined-notification',
                text: `${ws.username} has joined the chat.`
            });
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(joinNotification);
                }
            });
        } else {
            console.warn(`Unknown message type or invalid payload from ${ws.username}:`, parsedMessage);
        }
    });

    ws.on('close', () => {
        const departingUsername = ws.username;
        clients.delete(ws);
        console.log(`Client ${departingUsername} disconnected. Total clients: ${clients.size}`);
        const leftNotification = JSON.stringify({
            type: 'user-left-notification',
            text: `${departingUsername} has left the chat.`
        });
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(leftNotification);
            }
        });
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.username || 'Unknown'}: ${error.message}`);
    });
});

// Keep-alive mechanism for platforms like Render
setInterval(() => {
    clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping(() => {});
        }
    });
}, 30000);

// Start the HTTP and WebSocket server together
server.listen(PORT, () => {
    console.log(`HTTP & WebSocket server listening on port ${PORT}`);
});