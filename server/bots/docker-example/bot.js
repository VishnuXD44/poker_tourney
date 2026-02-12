/**
 * Example TCP bot for the PokerBot Competition.
 * Listens on TCP for GET_ACTION JSON (one line), responds with ACTION JSON (one line).
 * Run inside Docker; engine connects to this container's exposed port.
 */
const net = require('net');
const port = parseInt(process.env.BOT_PORT || '8765', 10);

function getAction(tableState) {
  const { pot = 0, board = [], my_hand = [], min_raise = 0, toCall = 0 } = tableState;
  if (toCall === 0) return { action: 'CHECK' };
  if (toCall > 0 && pot > 0 && Math.random() < 0.3) return { action: 'FOLD' };
  if (toCall > 0) return { action: 'CALL' };
  if (min_raise > 0 && Math.random() < 0.2) return { action: 'RAISE', amount: min_raise };
  return { action: 'CALL' };
}

const server = net.createServer((socket) => {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    const idx = buffer.indexOf('\n');
    if (idx === -1) return;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    try {
      const msg = JSON.parse(line);
      if (msg.request === 'action' && msg.table_state) {
        const state = msg.table_state;
        const toCall = state.to_call ?? (state.current_bet || 0);
        const response = getAction({
          ...state,
          toCall,
          board: state.board || state.communityCards,
          my_hand: state.my_hand || state.myCards
        });
        socket.write(JSON.stringify(response) + '\n');
      }
    } catch (_) {
      socket.write(JSON.stringify({ action: 'FOLD' }) + '\n');
    }
    socket.end();
  });
});

server.listen(port, '0.0.0.0', () => {
  process.stderr.write(`TCP bot listening on ${port}\n`);
});
