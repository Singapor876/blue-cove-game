const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
const clients = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname === "/") filePath = path.join(root, "index.html");
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.url !== "/room") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n")
  );

  const id = crypto.randomUUID();
  clients.set(id, { socket, player: null });

  socket.on("data", (buffer) => {
    const text = decodeFrame(buffer);
    if (!text) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }

    if (message.type === "join" || message.type === "player") {
      clients.get(id).player = message.player;
      const players = [...clients.values()].map((client) => client.player).filter(Boolean);
      send(socket, JSON.stringify({ type: "players", players }));
      broadcast(id, JSON.stringify({ type: "player", player: message.player }));
    }
  });

  socket.on("close", () => {
    const player = clients.get(id)?.player;
    clients.delete(id);
    if (player?.id) broadcast(id, JSON.stringify({ type: "leave", id: player.id }));
  });

  socket.on("error", () => {
    socket.destroy();
  });
});

function broadcast(senderId, text) {
  for (const [id, client] of clients) {
    if (id !== senderId) send(client.socket, text);
  }
}

function send(socket, text) {
  if (socket.destroyed) return;
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function decodeFrame(buffer) {
  if (buffer.length < 6) return "";
  const opcode = buffer[0] & 0x0f;
  if (opcode === 0x8) return "";

  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const masked = Boolean(buffer[1] & 0x80);
  if (!masked || buffer.length < offset + 4 + length) return "";
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;

  const payload = Buffer.alloc(length);
  for (let i = 0; i < length; i++) payload[i] = buffer[offset + i] ^ mask[i % 4];
  return payload.toString("utf8");
}

server.listen(port, () => {
  console.log(`Blue Cove Online running at http://localhost:${port}`);
});
