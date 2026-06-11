// Use 20 FPS for GIF exports to improve Google Slides compatibility.
// Lower FPS reduces file size/complexity and avoids importer edge cases.
export const GIF_EXPORT_FPS = 20;

// Additional hold time on the final GIF frame so the clip visibly rests
// on the end state instead of snapping off immediately. Slides keeps showing
// the final rendered frame, but adding a hold makes behavior consistent.
export const GIF_EXPORT_HOLD_SEC = 1.5;

// Enforce a minimum total GIF duration to avoid extremely short animations that
// some importers (notably Google Slides) mishandle or reject. The retimer will
// stretch per-frame delays to at least this duration without adding frames.
export const GIF_EXPORT_MIN_DURATION_SEC = 1.2;
