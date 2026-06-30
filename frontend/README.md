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

A `Dockerfile` is also included if you'd rather run the frontend in a container.

---

## What it does

- Serves the lobby page at `/`
- Serves the pre-call setup page at `/setup`
- Serves the video call page at `/video?room=ROOM_ID`
- Serves the call summary page at `/call-ended` (duration + transcript, read from `sessionStorage`)
- Uses Socket.io to handle room signaling and relay WebRTC offers, answers, ICE candidates, sign predictions, and finished sentences
- Supports two user modes, set before joining: `signer` (does the signing, runs on-device hand detection) and `speaker` (receives translated subtitles)
- Resolves the ML backend URL itself: `127.0.0.1:8000` when running on `localhost`, otherwise the deployed Azure Container Apps URL — no probing/health-check needed

---

## Project structure

```
frontend/
├── css/
│   ├── call.css          # video call page styling
│   ├── call-ended.css    # call summary / transcript page styling
│   ├── lobby.css         # landing / room creation page styling
│   └── setup.css         # pre-call setup (camera/mic, name, mode) styling
├── js/
│   └── script.js         # WebRTC, Socket.io, MediaPipe, ML inference, buffering & smoothing logic
├── pages/
│   ├── call.html          # video call UI
│   ├── call-ended.html    # post-call summary: duration + transcript
│   ├── lobby.html         # lobby / room creation UI
│   └── setup.html         # pre-call device/name/mode setup UI
├── sign-language.png      # logo/brand asset
├── Dockerfile             # container build for the frontend server
├── package.json           # Node package metadata and start script
├── package-lock.json
├── README.md               # this file
└── server.js               # Express + Socket.io signaling server
```

---

## Usage

1. Open the lobby page (`/`) and pick a name and mode (`signer`/`speaker`).
2. Go through `/setup` to confirm camera/mic access.
3. Start a new meeting or join an existing room via `/video?room=ROOM_ID`.
4. `script.js` sets up local media, joins the Socket.io room, and starts the WebRTC offer/answer exchange.
5. If your mode is `signer`, MediaPipe Hands starts running locally and streams predictions to the ML backend; the resulting subtitles/translations are relayed to the other peer over Socket.io.
6. Ending the call (button or peer disconnect) redirects both sides to `/call-ended`, which renders the duration and transcript pulled from `sessionStorage`.

---

## `script.js`: Sign Detection Pipeline

### Backend resolution
The ML backend URL is chosen once, based on hostname, with no runtime probing:
- `localhost` / `127.0.0.1` → `http://127.0.0.1:8000`
- anything else → the deployed Azure Container Apps backend URL

`/predict`, `/fix-grammar`, `/reset-buffer`, and `/health` URLs are all derived from this single base.

### Per-call session buffer (server-side, keyed by room)
Every landmark frame sent to `/predict` includes `session_id: roomId`, so the backend's rolling 20-frame LSTM window is scoped to this specific call — concurrent calls in different rooms never share or pollute each other's buffer. The frontend explicitly resets that server-side buffer (`POST /reset-buffer`) in three situations:
- The user presses `0` to restart sentence building (`resetSentenceBuilding()`)
- The user presses `.` to finalize a sentence via Groq and clears the local word stack
- A debounce guard (`resetServerBuffer()`) prevents firing more than one reset per 500ms

### Per-frame feature extraction
For each detected hand, `extractRobustFeatures()` builds a 68-value feature vector before sending it to the model:
1. Mirrors `x` coordinates (`1 - x`) to correct for the camera's natural mirroring.
2. Re-centers all 21 landmarks relative to the wrist (landmark 0).
3. Scales by the largest absolute coordinate so the gesture is size/distance-invariant.
4. Flattens the normalized `(x, y, z)` triples (21 × 3 = 63 values).
5. Appends 5 extra values: the Euclidean distance of each fingertip (landmarks 4, 8, 12, 16, 20) from the wrist.

Left and right hand feature vectors (68 each) are concatenated into a fixed 136-value array (`leftFeatures + rightFeatures`, zero-filled if a hand isn't visible) and sent as `landmarks` in the `/predict` request — matching the backend's expected `FEATURES_PER_FRAME = 136`.
Note: MediaPipe's raw `Left`/`Right` handedness label is flipped before use, since the camera mirrors the image relative to the signer's actual hands.

### Prediction throttling
Predictions are only sent to the backend at most once every `PREDICTION_INTERVAL` (100ms), independent of the camera's actual frame rate, to avoid flooding the API.

### Prediction smoothing (client-side majority vote)
Raw per-frame predictions from the LSTM are noisy, so `handleIncomingPrediction()` smooths them before treating a sign as "accepted":
1. Discard predictions that are empty, `"none"`, still `buffering`, or below a **0.65 confidence** threshold.
2. Push the surviving sign into a rolling history of the last `HISTORY_SIZE = 5` predictions.
3. Wait until the history is full, then take a majority vote — a sign must appear at least `MAJORITY_REQUIRED = 4` times out of 5 to be considered "stable."
4. If the stable sign is the same as the last *accepted* sign, it's ignored (prevents repeating the same sign every cycle while held).
5. Otherwise, the sign is accepted: it updates the live subtitle and is pushed onto `wordStack`.

`pushToStack()` also guards against duplicate spam by skipping a word if it already appears in the last 3 entries of the stack.

### Sentence building & transcript
- `0` key — resets the word stack, prediction history, and server buffer (start a new sentence).
- `Backspace` — pops the last word off the stack.
- `.` key — sends the accumulated `wordStack` to `POST /fix-grammar`, gets back a grammatically corrected sentence, broadcasts it to the peer (`send-sentence` socket event), adds it to the local transcript, and resets the stack + server buffer.

### Ending a call
`confirmEndCall()` captures the elapsed duration and the DOM-collected transcript, emits a `call-ended` socket event (so the *other* peer gets redirected too), waits 300ms for the server to relay it, then navigates to `/call-ended` after writing `callDuration`/`callTranscript` into `sessionStorage`. The Socket.io connection is intentionally left open until navigation (not explicitly disconnected) so the `call-ended` relay isn't cut short. If a peer disconnects abruptly without emitting `call-ended` (tab closed, network drop), the server's `disconnect` handler relays a synthetic `call-ended` event to the remaining peer using the last known duration/transcript.

---

## Notes

- The call page loads MediaPipe Hands via CDN for sign detection.
- The frontend expects the server to run on `localhost:3000`.
- The signaling server uses CORS `origin: "*"` so remote peers can connect from another origin.
- The call-ended summary relies entirely on `sessionStorage`, not the server — make sure the call page writes `callDuration` and `callTranscript` before navigating away, or the summary will show as empty.
- WebRTC uses Google's public STUN servers plus a public `openrelay.metered.ca` TURN server as a fallback for restrictive networks.

---

## Troubleshooting

| Issue | Fix |
|------|-----|
| Page fails to load | Confirm `npm install` succeeded and `npm start` is running |
| Socket connection not established | Check browser console and ensure `server.js` is listening on port `3000` |
| Camera/mic blocked | Allow media permissions or use HTTPS/localhost (check the setup page first) |
| Room link not working | Verify the full URL includes `?room=ROOM_ID` on `/video` |
| Predictions never stabilize / subtitles don't update | Confidence may be hovering near the 0.65 cutoff, or the same sign isn't held long enough to win 4 of the last 5 votes — hold the gesture steadier/longer |
| Same sign keeps repeating in the word stack | Shouldn't happen — `pushToStack()` and the last-accepted check should suppress repeats; check console for prediction confidence values |
| Call-ended page shows "0:00" / empty transcript | Confirm `confirmEndCall()` ran (not a hard browser close) so `sessionStorage.callDuration`/`callTranscript` get set before redirecting to `/call-ended` |
| "ML: error" shown in HUD | Backend unreachable — confirm it's running locally on `127.0.0.1:8000`, or that the Azure backend URL is correct/up |
| Docker build fails | Confirm `package.json` / `package-lock.json` are present and Node version matches the `Dockerfile` base image |

---

See the main [README.md](../README.md) for full project context.