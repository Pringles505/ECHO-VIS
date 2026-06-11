export const PPTX_EXPORT_SIZE = {
  width: 1920,
  height: 1080,
};

export const PPTX_CAMERA_ZOOM = {
  min: 0.5,
  max: 2,
  default: 1,
};

export function clampPptxCameraZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PPTX_CAMERA_ZOOM.default;
  return Math.max(PPTX_CAMERA_ZOOM.min, Math.min(PPTX_CAMERA_ZOOM.max, numeric));
}

export function getPptxFrame(cameraZoom = PPTX_CAMERA_ZOOM.default) {
  const zoom = clampPptxCameraZoom(cameraZoom);
  const width = PPTX_EXPORT_SIZE.width / zoom;
  const height = PPTX_EXPORT_SIZE.height / zoom;
  return {
    x: (PPTX_EXPORT_SIZE.width - width) / 2,
    y: (PPTX_EXPORT_SIZE.height - height) / 2,
    width,
    height,
    zoom,
  };
}

export const PPTX_SLIDE_EMU = {
  width: 12192000,
  height: 6858000,
};
