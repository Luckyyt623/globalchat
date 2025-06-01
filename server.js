// server.js

const WebSocket = require('ws');
const PORT = process.env.PORT || 3000; // Render sets PORT as an env variable

const wss = new WebSocket.Server({ port: PORT });

console.log(`Signaling server running on port ${PORT}`);

// Rooms: { roomName: [ws1, ws2, ...] }
const rooms = {};

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (err) {
            console.error('Invalid JSON:', message);
            return;
        }

        switch (data.type) {
            case 'join':
                {
                    const room = data.room;
                    if (!rooms[room]) rooms[room] = [];
                    rooms[room].push(ws);
                    console.log(`User joined room: ${room}`);
                    // Notify others
                    rooms[room].forEach(peer => {
                        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                            peer.send(JSON.stringify({ type: 'new-peer' }));
                        }
                    });
                }
                break;

            case 'offer':
            case 'answer':
            case 'ice':
                {
                    const room = data.room;
                    if (!rooms[room]) return;
                    rooms[room].forEach(peer => {
                        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                            peer.send(JSON.stringify(data));
                        }
                    });
                }
                break;

            default:
                console.warn('Unknown message type:', data.type);
        }
    });

    ws.on('close', () => {
        Object.keys(rooms).forEach(room => {
            rooms[room] = rooms[room].filter(peer => peer !== ws);
            if (rooms[room].length === 0) {
                delete rooms[room];
            }
        });
    });
});