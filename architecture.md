# PokerBot Competition System Architecture

This document outlines the interaction between the **Tournament Runner (Backend)**, the **Bot Players**, and the **Web UI**.

## 1. High-Level System Overview

The system follows a "Hub and Spoke" model where the Backend Engine (Dealer) acts as the central authority.



---

## 2. Component Descriptions

### A. The Backend Engine (The Dealer)
- **Role**: Manages the deck, enforces poker rules, tracks pot sizes, and handles timing.
- **Tech Stack**: C++ for high-speed logic and low latency.
- **Responsibility**: 
    - Spawning Bot Containers.
    - Sending "Game State" packets.
    - Validating that Bot moves are legal.
    - Recording "Game Logs" for the UI.

### B. The Player Containers (The Bots)
- **Role**: Execute user-submitted strategies.
- **Environment**: Docker containers with CPU/RAM limits (e.g., 512MB RAM, 1 vCPU).
- **Communication**: Connected to the Engine via **TCP Sockets**.
- **Constraints**: No internet access; limited time-bank (e.g., 100ms per move).

### C. The Web UI (The Dashboard)
- **Role**: Provides a visual "Live Stream" of matches and the Leaderboard.
- **Tech Stack**: React/Next.js with Tailwind CSS.
- **Connection**: Uses **WebSockets (Socket.io)** to receive real-time updates from the Backend.

---

## 3. Communication Flow

| Step | From | To | Description |
| :--- | :--- | :--- | :--- |
| 1 | **UI** | **Backend** | User requests a "New Match." |
| 2 | **Backend** | **Docker** | Spawns Bot A and Bot B containers. |
| 3 | **Backend** | **Bots** | Sends `GET_ACTION` JSON via TCP (Hole cards, stack sizes). |
| 4 | **Bots** | **Backend** | Returns `ACTION` (e.g., `{"action": "RAISE", "amount": 400}`). |
| 5 | **Backend** | **UI** | Broadcasts `MATCH_UPDATE` via WebSocket to animate the table. |

---

## 4. Data Packet Examples

### Engine -> Bot (Requesting a move)
The engine sends the current state of the table.
```json
{
  "request": "action",
  "table_state": {
    "pot": 150,
    "board": ["As", "Kd", "Jh"],
    "my_hand": ["Ac", "Ts"],
    "opponent_stack": 1200,
    "min_raise": 50,
    "time_remaining": 2500
  }
}