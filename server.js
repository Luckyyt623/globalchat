// signaling-server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const rooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'join') {
            if (!rooms[data.room]) rooms[data.room] = new Set();
            rooms[data.room].add(ws);
        }
        
        // Broadcast to others in room
        rooms[data.room]?.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('close', () => {
        // Clean up
        Object.keys(rooms).forEach(room => {
            rooms[room].delete(ws);
        });
    });
});

console.log('Signaling server running on ws://localhost:8080');