import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Basic health check
  app.get("/health", (req, res) => {
    res.send({ status: "ok", time: new Date().toISOString() });
  });

  const wss = new WebSocketServer({ noServer: true });

  const PORT = Number(process.env.PORT) || 3000;

  // Room management: RoomID -> Map<SocketID, WebSocket>
  const rooms = new Map<string, Map<string, WebSocket>>();

  server.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    console.log(`[Server] Upgrade request received for: ${url} from ${request.headers.origin}`);
    
    // Check if it's our signaling path
    if (url.includes("/ws-signal")) {
      console.log(`[WS] Handling signaling upgrade for: ${url}`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      console.log(`[Server] Ignoring upgrade request for: ${url}`);
      // Don't close the socket here, let other handlers (like Vite) take it if they're active
    }
  });

  wss.on("connection", (ws) => {
    const socketId = uuidv4();
    let currentRoom: string | null = null;

    // Send the assigned ID to the client
    ws.send(JSON.stringify({ type: "your-id", id: socketId }));

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "join":
            currentRoom = message.room;
            if (!rooms.has(currentRoom!)) {
              rooms.set(currentRoom!, new Map());
            }
            rooms.get(currentRoom!)?.set(socketId, ws);
            
            // Notify others in the room
            rooms.get(currentRoom!)?.forEach((client, id) => {
              if (id !== socketId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "user-joined", userId: socketId }));
              }
            });
            break;

          case "request-access":
            if (currentRoom && rooms.has(currentRoom)) {
              rooms.get(currentRoom)?.forEach((client, id) => {
                if (id !== socketId && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ 
                    type: "request-access", 
                    userId: socketId,
                    userName: message.userName || "Invitado"
                  }));
                }
              });
            }
            break;

          case "access-response":
            const targetClient = rooms.get(currentRoom!)?.get(message.targetId);
            if (targetClient && targetClient.readyState === WebSocket.OPEN) {
              targetClient.send(JSON.stringify({ 
                type: "access-response", 
                granted: message.granted,
                broadcasterId: socketId
              }));
            }
            break;

          case "signal":
            if (message.targetId) {
              const target = rooms.get(currentRoom!)?.get(message.targetId);
              if (target && target.readyState === WebSocket.OPEN) {
                target.send(JSON.stringify({
                  type: "signal",
                  data: message.data,
                  sender: socketId
                }));
              }
            } else if (currentRoom && rooms.has(currentRoom)) {
              rooms.get(currentRoom)?.forEach((client, id) => {
                if (id !== socketId && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: "signal",
                    data: message.data,
                    sender: socketId
                  }));
                }
              });
            }
            break;

          case "leave":
            if (currentRoom && rooms.has(currentRoom)) {
              rooms.get(currentRoom)?.delete(socketId);
              rooms.get(currentRoom)?.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: "leave", userId: socketId }));
                }
              });
            }
            break;
        }
      } catch (err) {
        console.error("Error handling message:", err);
      }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom)?.delete(socketId);
        rooms.get(currentRoom)?.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "leave", userId: socketId }));
          }
        });
        if (rooms.get(currentRoom)?.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  // Enhanced production detection for Wasmer and other cloud providers
  const isProduction = process.env.NODE_ENV === "production" || process.env.WASMER_ENV === "production" || !__dirname.includes("Downloads");

  if (!isProduction) {
    console.log("[Server] Starting in DEVELOPMENT mode (Vite Middleware)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    console.log(`[Server] Starting in PRODUCTION mode (Serving: ${distPath})`);
    
    if (!fs.existsSync(distPath)) {
      console.error("[CRITICAL] 'dist' folder not found! Please run 'npm run build' before starting the server.");
    }

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (fs.existsSync(path.join(distPath, "index.html"))) {
        res.sendFile(path.join(distPath, "index.html"));
      } else {
        res.status(404).send("Application build files not found. Please run 'build' script.");
      }
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
