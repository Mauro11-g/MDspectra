const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.data = { roomId, username };

    if (!rooms[roomId]) {
      rooms[roomId] = {
        videoSource: null,
        sourceType: 'none',
        currentTime: 0,
        isPlaying: false,
        lastUpdated: Date.now(),
        queue: [] // Cola de reproducción
      };
    }

    const room = rooms[roomId];
    let currentCalculatedTime = room.currentTime;
    if (room.isPlaying) {
      const elapsed = (Date.now() - room.lastUpdated) / 1000;
      currentCalculatedTime += elapsed;
    }

    socket.emit('sync-state', {
      videoSource: room.videoSource,
      sourceType: room.sourceType,
      currentTime: currentCalculatedTime,
      isPlaying: room.isPlaying,
      queue: room.queue
    });

    io.to(roomId).emit('chat-message', {
      user: 'Sistema',
      text: `${username} ingresó a la sala.`
    });
  });

  // Cambiar fuente actual
  socket.on('change-source', ({ source, sourceType }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].videoSource = source;
    rooms[roomId].sourceType = sourceType;
    rooms[roomId].currentTime = 0;
    rooms[roomId].isPlaying = true;
    rooms[roomId].lastUpdated = Date.now();

    io.to(roomId).emit('source-changed', { source, sourceType });
  });

  // Agregar video a la cola
  socket.on('add-to-queue', ({ source, sourceType, title }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;

    const item = { id: Math.random().toString(36).substring(2, 9), source, sourceType, title };
    rooms[roomId].queue.push(item);

    io.to(roomId).emit('queue-updated', rooms[roomId].queue);
    io.to(roomId).emit('chat-message', {
      user: 'Sistema',
      text: `${socket.data.username} agregó a la cola: "${title || source}"`
    });
  });

  // Reproducir siguiente video de la cola
  socket.on('play-next-in-queue', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId] || rooms[roomId].queue.length === 0) return;

    const nextVideo = rooms[roomId].queue.shift(); // Extraer el primero
    rooms[roomId].videoSource = nextVideo.source;
    rooms[roomId].sourceType = nextVideo.sourceType;
    rooms[roomId].currentTime = 0;
    rooms[roomId].isPlaying = true;
    rooms[roomId].lastUpdated = Date.now();

    io.to(roomId).emit('source-changed', { source: nextVideo.source, sourceType: nextVideo.sourceType });
    io.to(roomId).emit('queue-updated', rooms[roomId].queue);
    io.to(roomId).emit('chat-message', {
      user: 'Sistema',
      text: `Reproduciendo siguiente en cola: "${nextVideo.title || nextVideo.source}"`
    });
  });

  // Acciones de reproducción (Play / Pause / Seek)
  socket.on('playback-action', (action) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].isPlaying = action.type === 'play';
    rooms[roomId].currentTime = action.time;
    rooms[roomId].lastUpdated = Date.now();

    socket.to(roomId).emit('apply-action', action);
  });

  socket.on('send-message', (text) => {
    const { roomId, username } = socket.data;
    if (!roomId) return;
    io.to(roomId).emit('chat-message', { user: username, text });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor MDSpectra activo en http://localhost:${PORT}`);
});