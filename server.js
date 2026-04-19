import { Server } from 'socket.io';
import http from 'http';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*", // Allow cross-origin from any Vite development IP
    methods: ["GET", "POST"]
  }
});

let currentState = null;

io.on('connection', (socket) => {
  console.log(`[Network] Nouvel appareil connecté: ${socket.id}`);
  
  // Si un état existe déjà en mémoire, on l'envoie immédiatement au nouvel écran qui se connecte
  if (currentState) {
    socket.emit('sync_state', currentState);
  }

  // Lorsqu'un arbitre met à jour l'état, on le sauvegarde et on l'envoie à tout le monde
  socket.on('update_state', (state) => {
    currentState = state;
    // Envoyer à tous les autres clients connectés (les écrans publics)
    socket.broadcast.emit('sync_state', state);
  });

  socket.on('disconnect', () => {
    console.log(`[Network] Appareil déconnecté: ${socket.id}`);
  });
});

const PORT = 3001;
// Listen on 0.0.0.0 to allow access from local network (phones, tablets, etc)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🥋 Serveur Réseau Taekwondo actif sur le port ${PORT}`);
  console.log(`======================================================\n`);
});
