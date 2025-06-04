const WebSocket = require('ws');

const PORT = process.env.PORT || 3001; // Render.com sets PORT env variable
const wss = new WebSocket.Server({ port: PORT });

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
            // WebSocket messages can be Buffers, convert to string first.
            const messageString = message.toString();
            parsedMessage = JSON.parse(messageString);
            console.log(`Received from ${ws.username}:`, parsedMessage);
        } catch (e) {
            console.error(`Failed to parse message from ${ws.username}:`, message.toString(), e);
            ws.send(JSON.stringify({ type: 'server-message', text: 'Error: Your message was unreadable.' }));
            return;
        }

        if (parsedMessage.type === 'chat-message' && typeof parsedMessage.text === 'string' && parsedMessage.text.trim() !== "") {
            // Construct the message to broadcast, using the username stored on the server-side ws object
            const broadcastMessage = JSON.stringify({
                type: 'chat-message',
                username: ws.username, // Use the username associated with this connection
                text: parsedMessage.text.trim() // Sanitize/validate text further if needed
            });

            // Broadcast to all clients
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcastMessage);
                }
            });
        } else if (parsedMessage.type === 'user-join' && typeof parsedMessage.username === 'string' && parsedMessage.username.trim() !== "") {
            const oldUsername = ws.username;
            ws.username = parsedMessage.username.trim(); // Store/update username on the WebSocket connection object
            console.log(`User ${oldUsername} is now known as ${ws.username}`);

            // Notify all clients about the new user (or username change)
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

        // Notify remaining clients that a user has left
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
        // The 'close' event will usually follow an error that closes the connection.
    });
});

// Keep-alive mechanism for platforms like Render that might sleep free instances
// or for general connection health.
setInterval(() => {
    clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate(); // isAlive is a custom flag you'd set

        // Simple ping, client doesn't need to pong for this basic keep-alive
        // More robust would be proper ping/pong
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping(() => {}); // Send a ping
        }
    });
}, 30000); // Every 30 seconds
