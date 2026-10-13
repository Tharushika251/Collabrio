# CollabBoard

Real-time collaborative whiteboard and task board. Multiple users edit the same board simultaneously with live presence, cursor tracking, and conflict resolution.

## Architecture

- **Frontend:** React + Vite + Tailwind. Canvas rendering for the whiteboard, native HTML5 drag-and-drop for kanban.
- **Backend:** Express REST API + Socket.IO for real-time transport.
- **Persistence:** MongoDB (Mongoose) with an append-only operation log for replay and reconciliation.
- **Auth:** JWT for both HTTP and Socket.IO handshake.

## Conflict Resolution

Every board maintains a monotonic `version`. Mutations flow through a single operation pipeline:

1. Client applies the operation optimistically for snappy UI.
2. Client emits `board:op` and waits for the server ack.
3. Server is authoritative — it validates, applies, bumps the version, and broadcasts to other room members.
4. On rejection (e.g., stale task edit), the client reconciles by pulling the latest state.
5. On reconnect, the client requests ops since its last version via `board:sync`.

## Running locally

```bash
# 1) Backend
cd server
cp .env.example .env
npm install
npm run dev

# 2) Frontend (separate terminal)
cd client
cp .env.example .env
npm install
npm run dev