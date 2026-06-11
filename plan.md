# Plan — Google Slides Presentation Export ("present → animation plays → next slide")

## 1. Goal

Let a user export their ECHO-VIS diagram as a **Google Slides** deck where:

- Each slide corresponds to one chunk of the animation timeline (a "beat").
- When the presenter **enters / advances to a slide, that slide's animation plays automatically**.
- After it finishes, the presenter advances (click / arrow) and the **next slide plays its animation**, and so on to the end.

The animation itself is rendered per-segment to MP4 (already implemented). The hard part is making those clips actually **play inside Google Slides during a live presentation**.

---

## 2. Current state (what already exists)

The repo already contains a near-complete first attempt (currently uncommitted):

| File | Role |
|------|------|
| `src/export/PresentationExporter.js` | `exportToGoogleSlidesPPTX(...)` — splits the timeline into segments, renders each to MP4, builds a `.pptx` ZIP with embedded video + auto-play timing + `advClick`/`advTm` auto-advance. |
| `src/presentation/pptxFrame.js` | EMU sizing (`PPTX_SLIDE_EMU`), 1920×1080 export size, camera-zoom → viewport helper. |
| `src/export/VideoExporter.js` | `renderAnimationClipToMP4({ startTime, endTime, ... })` returns `{ videoBytes, posterBytes, mediaDuration, duration }` for a timeline slice. |
| `src/animation/AnimationEngine.js` | `getTimeline()`, `getContentDuration()` — the source of segment boundaries. |
| `src/components/TopBar.jsx` | "Google Slides" button → `handleGenerateSlides()` → `exportToGoogleSlidesPPTX`. |

**Segmentation logic** (`collectPresentationSegments`): collects keyframe times (node/link starts, text morphs, transform starts, graph point times), dedupes/sorts them with a min gap, and produces one segment per gap between consecutive keyframes. Each segment becomes one slide.

### The blocking limitation
The current output is a **PowerPoint** file. When uploaded to Google Slides:
- ❌ Embedded `.pptx` videos are **dropped** (Google Slides only plays video hosted on Google Drive or YouTube).
- ❌ `<p:timing>` auto-play and `advTm` auto-advance are **not honored** by Google Slides.

So the existing file works in *desktop PowerPoint* but **fails the actual Google Slides requirement**. It should be kept as an "Export for PowerPoint (.pptx)" fallback, not the Google Slides path.

---

## 3. Decision: how to reach true Google Slides playback

Reliable Google Slides video requires the **Slides + Drive APIs**:

1. Render each segment to MP4 (reuse existing code).
2. Upload each MP4 to the user's Google **Drive**.
3. Create a Google **Slides** presentation; on each slide insert the matching Drive video with `videoProperties.autoPlay = true` (+ `start`/`end`/`mute`).
4. The presenter advances slides manually; each slide's video **auto-plays on entry**. This satisfies "pass each slide → animation plays → next slide."

> **Auto-advance caveat:** The public Google Slides API has **no field for per-slide timed auto-advance**. Fully hands-free advancement only exists in Slides' "Publish to web" autoplay mode (a single global interval), which can't wait for a specific video to end. Therefore the supported live-present UX is **auto-play video on slide entry + manual advance**. This is the standard, achievable behavior and should be stated clearly in the UI. (A "Publish to web with N-second auto-advance" toggle can be offered later as an approximation using each segment's known duration.)

### Auth strategy — pick one (see Open Questions)
- **A. In-app Google OAuth (recommended for a real product):** Add Google OAuth 2.0 (Drive `drive.file` scope + Slides scope) via Google Identity Services in the browser. Requires a Google Cloud project + OAuth client ID. Most work, best UX, no server.
- **B. Manual two-step (lowest effort, no API keys):** Keep generating the `.pptx`, but *additionally* export the MP4 clips into a folder and give the user instructions to (a) upload clips to Drive, (b) create the deck, (c) insert each Drive video with autoplay. Cheap, but manual.
- **C. Drive-only assist:** Upload clips to Drive via OAuth, generate the deck manually. Middle ground.

The plan below details **Option A** (the real solution) with Option B documented as the zero-credential fallback.

---

## 4. Implementation phases

### Phase 0 — Reframe existing export (small, do first)
- Rename the current button/path to **"Export for PowerPoint (.pptx)"**; keep `exportToGoogleSlidesPPTX` working but relabel it `exportToPptx`.
- Add a separate **"Export to Google Slides"** entry that runs the new flow below.

### Phase 1 — Segment model (shared)
- Extract `collectPresentationSegments(nodes, links)` from `PresentationExporter.js` into `src/presentation/segments.js` so both the PPTX path and the new Slides path use one source of truth.
- Each segment already carries `{ index, start, end, title, eventCount }`. Add `durationSec = end - start` for later auto-advance approximation.

### Phase 2 — Render clips (reuse)
- New module `src/presentation/renderClips.js`:
  - `async function renderSegmentClips({ stageRef, layerRef, nodes, links, viewport, fps, onProgress, onStatus })`
  - Loops segments → `renderAnimationClipToMP4(...)` → returns `[{ index, title, durationSec, videoBytes, posterBytes }]`.
  - This is exactly the loop currently inside `exportToGoogleSlidesPPTX`; lift it out so it is API-agnostic.

### Phase 3 — Google auth (Option A)
- `src/integrations/google/auth.js`:
  - Load Google Identity Services (`https://accounts.google.com/gsi/client`).
  - `requestAccessToken(scopes)` → access token via the token-client (implicit flow, in-browser).
  - Scopes: `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/presentations`.
  - Store the OAuth **client ID** in `.env` as `VITE_GOOGLE_CLIENT_ID` (Vite exposes `import.meta.env`).
- Document the Google Cloud setup steps in `README` (create project, enable Drive API + Slides API, OAuth consent screen, authorized JS origins incl. `http://localhost:5173`).

### Phase 4 — Drive upload
- `src/integrations/google/drive.js`:
  - `uploadVideo(accessToken, { name, bytes, folderId })` using Drive `multipart` upload (`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`), mime `video/mp4`.
  - Optionally create a per-deck folder first (`files.create` with `mimeType: application/vnd.google-apps.folder`).
  - Return the Drive `fileId` for each clip.
  - **Important:** Google Slides needs to *read* the video. With `drive.file` scope the file is app-owned and accessible to the user; that is sufficient for the same user's presentation. No public sharing required for the owner viewing their own deck.

### Phase 5 — Build the deck via Slides API
- `src/integrations/google/slides.js`:
  - `presentations.create` → get `presentationId`, default slide size.
  - `presentations.batchUpdate` requests, per segment:
    - `createSlide` (blank layout).
    - `createVideo` with `source: "DRIVE"`, `id: <driveFileId>`, sized to fill the slide (use page size in EMU; reuse `PPTX_SLIDE_EMU` ratio).
    - `updateVideoProperties` → `autoPlay: true`, `mute: true|false`, optional `start`/`end` ms, `fields: "autoPlay,mute,start,end"`.
    - (Optional) `createShape` TEXT_BOX with the segment title as a small caption.
  - Remove the default first slide created by `presentations.create` (delete `slides[0]` after adding real ones, or reuse it as slide 1).
  - Return the deck URL: `https://docs.google.com/presentation/d/<id>/edit`.

### Phase 6 — Orchestrator + UI
- `src/export/GoogleSlidesExporter.js`: `exportToGoogleSlides({ ...refs, nodes, links, projectName, viewport, fps, onProgress, onStatus })`:
  1. `segments = collectPresentationSegments(...)`
  2. token = `requestAccessToken(...)`
  3. `clips = renderSegmentClips(...)` (0–70% progress)
  4. upload each clip (70–90%)
  5. build deck (90–99%)
  6. `window.open(deckUrl)` and return `{ presentationId, deckUrl, slideCount }`.
- `TopBar.jsx`: add **"Export to Google Slides"** button next to the existing one; wire to `exportToGoogleSlides`, reuse `setExportProgress`/`setExportStatus`. On success, show a toast/link to the deck and a note: *"Present, then click to advance — each slide auto-plays its animation."*

### Phase 7 — Fallback (Option B, no credentials)
- If `VITE_GOOGLE_CLIENT_ID` is absent, the "Export to Google Slides" button instead:
  - Downloads a ZIP of `slideN.mp4` clips + a `HOW-TO.txt` with step-by-step Drive-upload + insert-video-with-autoplay instructions.
  - Keeps the feature usable with zero setup.

---

## 5. Files to create / modify

**Create**
- `src/presentation/segments.js` — shared segmentation (lifted from PresentationExporter).
- `src/presentation/renderClips.js` — segment → MP4 clip loop.
- `src/integrations/google/auth.js` — GIS token client.
- `src/integrations/google/drive.js` — video upload.
- `src/integrations/google/slides.js` — deck build via batchUpdate.
- `src/export/GoogleSlidesExporter.js` — orchestrator.
- `.env.example` — `VITE_GOOGLE_CLIENT_ID=`.

**Modify**
- `src/export/PresentationExporter.js` — import segmentation from shared module; relabel as PPTX/PowerPoint path.
- `src/components/TopBar.jsx` — relabel existing button to "PowerPoint (.pptx)"; add "Google Slides" button + handler; success/link UI.
- `README.md` — Google Cloud OAuth setup + usage notes + the auto-advance caveat.

---

## 6. Risks & notes

- **Auto-advance is not API-controllable.** Live present mode = auto-play on entry + manual advance. Set expectations in UI and README. (Optional later: "Publish to web" autoplay with per-segment timing as an approximation.)
- **OAuth setup required** for the real path (Cloud project + client ID + consent screen). Without it, Phase 7 fallback applies.
- **Large decks = many uploads.** Rendering + uploading N MP4s can be slow; keep granular progress and consider a max-segments guard / "merge tiny segments" option (segments already filter < 1 frame).
- **Browser-only OAuth (implicit flow)** has no refresh token; the access token is short-lived but fine for a one-shot export.
- **Reuse, don't duplicate:** the rendering pipeline (`renderAnimationClipToMP4`) and segmentation are already correct — lift, don't rewrite.

---

## 7. Test plan

1. **Segments:** unit-check `collectPresentationSegments` on a small diagram (2 nodes, 1 link) → expected slide count = number of keyframe gaps.
2. **Clip render:** one segment → valid MP4 (`mediaDuration > 0`, non-empty `posterBytes`).
3. **Auth:** token request returns an access token with both scopes.
4. **Drive:** upload returns a `fileId`; file visible in Drive.
5. **Slides:** deck opens; each slide shows a video; entering present mode auto-plays the clip; manual advance moves to the next.
6. **Fallback:** with no client ID, ZIP of clips + HOW-TO downloads.
7. **PPTX regression:** existing PowerPoint export still produces a valid, openable deck.

---

## 8. Open questions (confirm before building)

1. **Auth approach:** in-app Google OAuth (Option A, real Slides) vs. no-credential manual fallback (Option B)? Affects scope significantly.
2. **Advance model:** is "auto-play on entry + manual click to advance" acceptable, or is fully hands-free timed auto-advance required (forces "Publish to web" approximation)?
3. **Audio:** mute clips by default? (Diagram animations are silent — recommend `mute: true`.)
4. Keep the existing `.pptx` export as a labeled "PowerPoint" option? (Recommended: yes.)
