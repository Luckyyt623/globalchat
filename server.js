const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket signaling server is running.');
});

const wss = new WebSocket.Server({ server });
console.log(`Signaling server started on port ${PORT}`);

const rooms = {}; // { roomName: Set<WebSocket> } using Set for easier add/delete

wss.on('connection', (ws) => {
    let currentRoom = null; // Store the room this client is in

    console.log('Client connected');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            console.log('Received message:', data);
        } catch (err) {
            console.error('Invalid JSON:', message);
            return;
        }

        switch (data.type) {
            case 'join':
                currentRoom = data.room;
                if (!currentRoom) {
                    console.error('Join message missing room');
                    return;
                }
                if (!rooms[currentRoom]) {
                    rooms[currentRoom] = new Set();
                }
                rooms[currentRoom].add(ws);
                console.log(`User joined room: ${currentRoom}. Room size: ${rooms[currentRoom].size}`);

                // Notify other peers in the room about the new peer
                rooms[currentRoom].forEach(peer => {
                    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                        peer.send(JSON.stringify({ type: 'new-peer', peerId: 'some_unique_id_for_ws' })); // You might want to assign IDs to peers
                    }
                });
                break;

            // These messages are broadcast to others in the *currentRoom* of the sender
            case 'offer':
            case 'answer':
            case 'ice-candidate': // Corrected from 'ice'
                if (!currentRoom || !rooms[currentRoom]) {
                    console.error(`Cannot relay ${data.type}: User not in a room or room does not exist.`);
                    return;
                }
                console.log(`Relaying ${data.type} in room ${currentRoom} from a peer.`);
                rooms[currentRoom].forEach(peer => {
                    if (peer !== ws && peer.readyState === WebSocket.OPEN) {
                        peer.send(JSON.stringify(data)); // Forward the original message
                    }
                });
                break;

            default:
                console.warn('Unknown message type received:', data.type);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom].delete(ws);
            console.log(`User removed from room: ${currentRoom}. New room size: ${rooms[currentRoom].size}`);
            if (rooms[currentRoom].size === 0) {
                console.log(`Room ${currentRoom} is empty, deleting.`);
                delete rooms[currentRoom];
            } else {
                // Notify remaining peers
                rooms[currentRoom].forEach(peer => {
                    if (peer.readyState === WebSocket.OPEN) {
                        // You might want to send a 'peer-left' message
                        // peer.send(JSON.stringify({ type: 'peer-left', peerId: 'some_unique_id_for_ws' }));
                    }
                });
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`HTTP Server is listening on port ${PORT}`);
});