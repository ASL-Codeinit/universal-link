# Frontend: ASL Video Call UI

Express + Socket.io frontend server for the SignLink video call experience.

## Quick Start

**1. Install dependencies**
```bash
cd frontend
npm install
```

**2. Run the server**
```bash
npm start
```

**3. Open the app**
Visit `http://localhost:3000` in your browser.

---

## What it does

- Serves the lobby page at `/`
- Serves the video call page at `/video?room=ROOM_ID`
- Uses Socket.io to handle room signaling and relay WebRTC offers, answers, ICE candidates, and live sign prediction updates
- Supports two user modes: `signer` (interpreter needed) and `speaker`

---

## Project structure

```
frontend/
├── css/
│   ├── call.css      # video call page styling
│   └── lobby.css     # landing / room creation page styling
├── js/
│   └── script.js     # WebRTC, Socket.io, room logic, and MediaPipe integration
├── pages/
│   ├── call.html     # video call UI
│   └── lobby.html    # lobby / room creation UI
├── package.json      # Node package metadata and start script
├── README.md         # this file
└── server.js         # Express + Socket.io signaling server
```

---

## Usage

1. Open the lobby page.
2. Enter a name and choose a mode.
3. Start a new meeting or join an existing room with a passkey.
4. The app automatically sets up local media, room signaling, and WebRTC.

---

## Notes

- The call page loads MediaPipe Hands via CDN for sign detection.
- The frontend expects the server to run on `localhost:3000`.
- The signaling server uses CORS `origin: "*"` so remote peers can connect from another origin.

---

## Troubleshooting

| Issue | Fix |
|------|-----|
| Page fails to load | Confirm `npm install` succeeded and `npm start` is running |
| Socket connection not established | Check browser console and ensure `server.js` is listening on port `3000` |
| Camera/mic blocked | Allow media permissions or use HTTPS/localhost |
| Room link not working | Verify the full URL includes `?room=ROOM_ID` |

---

See the main [README.md](../README.md) for full project context.