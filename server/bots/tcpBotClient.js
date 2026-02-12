import net from 'net';

const DEFAULT_TIMEOUT_MS = 100;

/**
 * Send GET_ACTION request to a bot over TCP and receive ACTION.
 * Packet format: one JSON object per line (newline-delimited).
 * Request: { request: "action", table_state: { pot, board, my_hand, opponent_stack, min_raise, time_remaining } }
 * Response: { action: "FOLD"|"CALL"|"CHECK"|"RAISE"|"ALL_IN", amount?: number }
 */
export function requestActionFromTcpBot(host, port, tableState, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const opponentStack = tableState.opponents?.[0]?.chips ?? 0;
  const payload = {
    request: 'action',
    table_state: {
      pot: tableState.pot,
      board: tableState.communityCards ?? [],
      my_hand: tableState.myCards ?? [],
      opponent_stack: opponentStack,
      min_raise: tableState.minRaise ?? 0,
      to_call: tableState.toCall ?? 0,
      current_bet: tableState.currentBet ?? 0,
      time_remaining: timeoutMs
    }
  };

  return new Promise((resolve) => {
    const out = { action: 'fold' };
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      try { socket.destroy(); } catch (_) {}
      resolve(out);
    }, timeoutMs);

    socket.setEncoding('utf8');
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk;
      const idx = buffer.indexOf('\n');
      if (idx === -1) return;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      clearTimeout(timer);
      try { socket.destroy(); } catch (_) {}
      try {
        const obj = JSON.parse(line);
        const a = (obj.action || '').toString().toUpperCase();
        if (['FOLD', 'CALL', 'CHECK', 'RAISE', 'ALL_IN', 'ALL-IN'].includes(a)) {
          out.action = a === 'ALL-IN' ? 'ALL_IN' : a;
          if (typeof obj.amount === 'number') out.amount = obj.amount;
        }
      } catch (_) {}
      resolve(out);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(out);
    });

    socket.on('close', () => {
      clearTimeout(timer);
    });

    socket.connect(port, host, () => {
      socket.write(JSON.stringify(payload) + '\n');
    });
  });
}

/**
 * Returns an async getAction(state) that calls the TCP bot.
 * state is the same object buildStateForPlayer() produces; we pass it through to table_state format.
 */
export function createGetActionFromTcpBot(host, port, options = {}) {
  return async function getAction(state) {
    return requestActionFromTcpBot(host, port, state, options);
  };
}
