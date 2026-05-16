const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ===================== STATE =====================
const globalState = {
  troopers: new Map(),
  calls: [],
  bolos: [],
  records: [],
  radioMessages: [],
  maxHistory: 300
};

// ===================== SOCKET.IO EVENTS =====================
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id} connected`);

  // Trooper signs on
  socket.on('trooper:signin', (trooperData) => {
    globalState.troopers.set(socket.id, {
      id: socket.id,
      ...trooperData,
      connectedAt: new Date().toISOString()
    });
    
    console.log(`[SIGNIN] ${trooperData.name} (${trooperData.callsign})`);
    
    // Broadcast updated roster to all clients
    io.emit('roster:update', Array.from(globalState.troopers.values()));
    
    // Send initial data to new trooper
    socket.emit('sync:init', {
      calls: globalState.calls,
      bolos: globalState.bolos,
      records: globalState.records,
      radioMessages: globalState.radioMessages,
      roster: Array.from(globalState.troopers.values())
    });
  });

  // New call dispatched
  socket.on('call:create', (callData) => {
    const call = {
      id: callData.id,
      ...callData,
      createdAt: new Date().toISOString()
    };
    
    globalState.calls.push(call);
    
    console.log(`[CALL] #${call.num} - ${call.type} at ${call.location} (${call.priority})`);
    
    // Broadcast to all clients
    io.emit('call:new', call);
    
    // Trigger voice announcement on all clients
    io.emit('dispatch:announce', {
      type: 'call',
      callType: call.type,
      location: call.location,
      priority: call.priority,
      message: `Attention all units. New ${call.priority} priority ${call.type} call at ${call.location}. Dispatch number ${call.num} available on screen.`
    });
  });

  // BOLO issued
  socket.on('bolo:create', (boloData) => {
    const bolo = {
      id: boloData.id,
      ...boloData,
      createdAt: new Date().toISOString()
    };
    
    globalState.bolos.push(bolo);
    
    const title = bolo.boloType === 'vehicle'
      ? `${bolo.vehicleColor} ${bolo.vehicleMake} ${bolo.vehicleModel}`
      : bolo.name;
    
    console.log(`[BOLO] ${title} - Danger: ${bolo.dangerLevel}`);
    
    // Broadcast to all clients
    io.emit('bolo:new', bolo);
    
    // Trigger voice announcement
    io.emit('dispatch:announce', {
      type: 'bolo',
      subject: title,
      dangerLevel: bolo.dangerLevel,
      message: `Attention all units. Be on the lookout for ${title}. Danger level: ${bolo.dangerLevel}. Details available on MDT.`
    });
  });

  // Radio message
  socket.on('radio:send', (msgData) => {
    const message = {
      id: msgData.id,
      ...msgData,
      ts: new Date().toISOString()
    };
    
    globalState.radioMessages.push(message);
    if (globalState.radioMessages.length > globalState.maxHistory) {
      globalState.radioMessages = globalState.radioMessages.slice(-globalState.maxHistory);
    }
    
    console.log(`[RADIO] ${msgData.name} (${msgData.callsign}): ${msgData.content}`);
    
    // Broadcast to all clients
    io.emit('radio:message', message);
  });

  // Call update
  socket.on('call:update', (callData) => {
    const idx = globalState.calls.findIndex(c => c.id === callData.id);
    if (idx !== -1) {
      globalState.calls[idx] = { ...globalState.calls[idx], ...callData };
      io.emit('call:updated', globalState.calls[idx]);
    }
  });

  // BOLO update
  socket.on('bolo:update', (boloData) => {
    const idx = globalState.bolos.findIndex(b => b.id === boloData.id);
    if (idx !== -1) {
      globalState.bolos[idx] = { ...globalState.bolos[idx], ...boloData };
      io.emit('bolo:updated', globalState.bolos[idx]);
    }
  });

  // Record create
  socket.on('record:create', (recordData) => {
    const record = {
      id: recordData.id,
      ...recordData,
      createdAt: new Date().toISOString()
    };
    
    globalState.records.push(record);
    io.emit('record:new', record);
  });

  // Trooper disconnects
  socket.on('disconnect', () => {
    const trooper = globalState.troopers.get(socket.id);
    if (trooper) {
      console.log(`[DISCONNECT] ${trooper.name} (${trooper.callsign})`);
      globalState.troopers.delete(socket.id);
      io.emit('roster:update', Array.from(globalState.troopers.values()));
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`[ERROR] ${socket.id}: ${error}`);
  });
});

// ===================== HTTP ROUTES =====================
app.get('/api/roster', (req, res) => {
  res.json(Array.from(globalState.troopers.values()));
});

app.get('/api/calls', (req, res) => {
  res.json(globalState.calls);
});

app.get('/api/bolos', (req, res) => {
  res.json(globalState.bolos);
});

app.get('/api/radio', (req, res) => {
  res.json(globalState.radioMessages);
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚔 FHP MDT Server running on http://localhost:${PORT}`);
});
