// Minimal PPTX (OpenXML) builder for "template + animated GIF" decks.
//
// Each slide uses an imported slide image as a full-bleed background and places the
// diagram's animated GIF exactly where the placeholder rectangle was. PowerPoint plays
// animated GIFs during a slideshow, so the animation runs in place — and because the
// rectangle is at the same spot in the template, every slide is perfectly aligned.

import { createZip } from './zip';

// Match Google Slides' native page width (10in / 960pt). Importing a PPTX whose page
// size already matches avoids Google resizing the whole slide — and its background
// image — on import, which is a common source of softening. Height derives from the
// template's aspect ratio.
const SLIDE_W_EMU = 9144000;

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
};

const NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NS_REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function contentTypes(slideCount, { bgKind = 'solid', bgExt = 'png', hasSvg = false, hasCorner = false, slideMediaExt = 'gif' } = {}) {
  const overrides = [
    `<Override PartName="/ppt/presentation.xml" ContentType="${CT.presentation}"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT.slideMaster}"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT.slideLayout}"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT.theme}"/>`,
    // Standard docProps improve compatibility with some importers (incl. Google Slides)
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
  ];
  for (let i = 1; i <= slideCount; i += 1) {
    overrides.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="${CT.slide}"/>`);
    const ext = (slideMediaExt || 'gif').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'application/octet-stream';
    overrides.push(`<Override PartName="/ppt/media/slide${i}.${ext}" ContentType="${mime}"/>`);
  }
  if (bgKind === 'image') {
    const ext = (bgExt || 'png').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png';
    overrides.push(`<Override PartName="/ppt/media/template.${ext}" ContentType="${mime}"/>`);
    if (hasSvg) overrides.push('<Override PartName="/ppt/media/template.svg" ContentType="image/svg+xml"/>');
  }
  if (hasCorner) overrides.push('<Override PartName="/ppt/media/corner.png" ContentType="image/png"/>');
  return `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
    + '<Default Extension="jpg" ContentType="image/jpeg"/>'
    + '<Default Extension="gif" ContentType="image/gif"/>'
    + '<Default Extension="svg" ContentType="image/svg+xml"/>'
    + overrides.join('')
    + '</Types>';
}

function rootRels() {
  return `${XML_DECL}<Relationships ${NS_REL}>`
    + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>`
    // Standard relationships for docProps (not strictly required by Office, but
    // some importers expect them to exist and may behave better when present)
    + `<Relationship Id="rIdCore" Type="${PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/>`
    + `<Relationship Id="rIdApp" Type="${REL}/extended-properties" Target="docProps/app.xml"/>`
    + '</Relationships>';
}

function presentationXml(slideCount, slideW, slideH) {
  const ids = [];
  for (let i = 1; i <= slideCount; i += 1) {
    ids.push(`<p:sldId id="${255 + i}" r:id="rIdSlide${i}"/>`);
  }
  return `${XML_DECL}<p:presentation ${NS_P}>`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>'
    + `<p:sldIdLst>${ids.join('')}</p:sldIdLst>`
    + `<p:sldSz cx="${slideW}" cy="${slideH}"/>`
    + '<p:notesSz cx="6858000" cy="9144000"/>'
    + '</p:presentation>';
}

function presentationRels(slideCount) {
  const rels = [
    `<Relationship Id="rIdMaster" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    `<Relationship Id="rIdTheme" Type="${REL}/theme" Target="theme/theme1.xml"/>`,
  ];
  for (let i = 1; i <= slideCount; i += 1) {
    rels.push(`<Relationship Id="rIdSlide${i}" Type="${REL}/slide" Target="slides/slide${i}.xml"/>`);
  }
  return `${XML_DECL}<Relationships ${NS_REL}>${rels.join('')}</Relationships>`;
}

const EMPTY_SP_TREE = '<p:spTree>'
  + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
  + '</p:spTree>';

function slideMasterXml() {
  return `${XML_DECL}<p:sldMaster ${NS_P}>`
    + `<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${EMPTY_SP_TREE}</p:cSld>`
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst>'
    + '</p:sldMaster>';
}

function slideMasterRels() {
  return `${XML_DECL}<Relationships ${NS_REL}>`
    + `<Relationship Id="rIdLayout" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
    + `<Relationship Id="rIdTheme" Type="${REL}/theme" Target="../theme/theme1.xml"/>`
    + '</Relationships>';
}

function slideLayoutXml() {
  return `${XML_DECL}<p:sldLayout ${NS_P} type="blank" preserve="1">`
    + `<p:cSld name="Blank">${EMPTY_SP_TREE}</p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>'
    + '</p:sldLayout>';
}

function slideLayoutRels() {
  return `${XML_DECL}<Relationships ${NS_REL}>`
    + `<Relationship Id="rIdMaster" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>`
    + '</Relationships>';
}

function picXml(id, name, embedId, x, y, cx, cy) {
  return '<p:pic>'
    + `<p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr><a:picLocks noChangeAspect="0"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${embedId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
    + '</p:pic>';
}

// Full-slide background picture. When `hasSvg`, the blip references a raster PNG
// fallback (rIdBg) and carries the vector SVG (rIdBgSvg) via the MS Office SVG
// extension — PowerPoint renders the crisp vector, viewers without SVG use the PNG.
function bgPicXml(slideW, slideH, hasSvg) {
  const blip = hasSvg
    ? '<a:blip r:embed="rIdBg">'
      + '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">'
      + '<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdBgSvg"/>'
      + '</a:ext></a:extLst></a:blip>'
    : '<a:blip r:embed="rIdBg"/>';
  return '<p:pic>'
    + '<p:nvPicPr><p:cNvPr id="2" name="Slide background"/><p:cNvPicPr><a:picLocks noChangeAspect="0"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
    + `<p:blipFill>${blip}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${slideW}" cy="${slideH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
    + '</p:pic>';
}

function hex6(value, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return m ? m[1].toUpperCase() : fallback;
}

// bgKind: 'image' (embedded picture) | 'solid' (native colour fill, stays crisp in
// Google Slides which re-rasterizes imported picture backgrounds).
function slideXml(slideW, slideH, gif, bgKind, bgColorHex, hasSvg, cornerXml = '') {
  const bg = bgKind === 'image'
    ? ''
    : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColorHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  const bgPic = bgKind === 'image' ? bgPicXml(slideW, slideH, hasSvg) : '';
  const tree = '<p:spTree>'
    + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + bgPic
    + picXml(3, 'Animation', 'rIdGif', gif.x, gif.y, gif.cx, gif.cy)
    + cornerXml
    + '</p:spTree>';
  return `${XML_DECL}<p:sld ${NS_P}><p:cSld>${bg}${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRels(slideIndex, bgTarget, bgKind, hasSvg, hasCorner) {
  let bgRel = '';
  if (bgKind === 'image') {
    bgRel = `<Relationship Id="rIdBg" Type="${REL}/image" Target="../media/${bgTarget}"/>`;
    if (hasSvg) bgRel += `<Relationship Id="rIdBgSvg" Type="${REL}/image" Target="../media/template.svg"/>`;
  }
  const cornerRel = hasCorner
    ? `<Relationship Id="rIdCorner" Type="${REL}/image" Target="../media/corner.png"/>`
    : '';
  return `${XML_DECL}<Relationships ${NS_REL}>`
    + `<Relationship Id="rIdLayout" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`
    + bgRel
    + `<Relationship Id="rIdGif" Type="${REL}/image" Target="../media/slide${slideIndex}.gif"/>`
    + cornerRel
    + '</Relationships>';
}

// A compact but complete Office theme (PowerPoint requires clr/font/fmt schemes).
function themeXml() {
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">${fill}<a:prstDash val="solid"/></a:ln>`;
  return `${XML_DECL}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">`
    + '<a:themeElements>'
    + '<a:clrScheme name="Office">'
    + '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
    + '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
    + '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
    + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>'
    + '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
    + '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
    + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>'
    + '</a:clrScheme>'
    + '<a:fontScheme name="Office">'
    + '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>'
    + '</a:fontScheme>'
    + '<a:fmtScheme name="Office">'
    + `<a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>`
    + `<a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>`
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst>`
    + '</a:fmtScheme>'
    + '</a:themeElements>'
    + '</a:theme>';
}

// Fit a (gifW x gifH) rectangle inside a target EMU box, centred, preserving aspect.
function containInRect(rectEmu, gifAspect) {
  const rectAspect = rectEmu.cx / rectEmu.cy;
  let cx;
  let cy;
  if (rectAspect > gifAspect) {
    cy = rectEmu.cy;
    cx = Math.round(cy * gifAspect);
  } else {
    cx = rectEmu.cx;
    cy = Math.round(cx / gifAspect);
  }
  return {
    x: Math.round(rectEmu.x + (rectEmu.cx - cx) / 2),
    y: Math.round(rectEmu.y + (rectEmu.cy - cy) / 2),
    cx,
    cy,
  };
}

/**
 * Build a .pptx where every slide is the template image with the matching diagram
 * GIF placed (contained) in the placeholder rectangle.
 *
 * @param {object} slideTemplate - { imageBytes, imageExt, width, height, rect:{x,y,w,h} }
 * @param {Array<{gifBytes:Uint8Array}>} clips - one per slide, in order
 * @param {number} gifAspect - width/height of the diagram GIF (for contain-fit)
 * @returns {Uint8Array} pptx bytes
 */
// Aspect of the fixed top-right corner logo (TopRightPPTX), 689x232.
const CORNER_ASPECT = 689 / 232;
// Overflow the diagram past the placeholder rectangle so its edge fully covers the
// magenta marker (no sliver showing). In source-image pixels.
const RECT_OVERFLOW_PX = 3;

// When usePosterImages is true, build a deck that uses static PNG posters on each slide
// instead of animated GIFs. This is more robust when importing the PPTX into
// Google Slides, which can fail to load embedded animated GIFs.
export function buildTemplatedPptx({ slideTemplate = null, clips, gifAspect = 16 / 9, cornerImageBytes = null, usePosterImages = false }) {
  const usable = clips.filter(c => c.gifBytes && c.gifBytes.length);
  const usablePng = clips.filter(c => c.posterBytes && c.posterBytes.length);
  if (usePosterImages) {
    if (!usablePng.length) throw new Error('No poster images available to build the PPTX.');
  } else {
    if (!usable.length) throw new Error('No GIF frames available to build the PPTX.');
  }

  // Does the template define where the GIF goes?
  const hasRect = !!(
    slideTemplate
    && slideTemplate.rect
    && slideTemplate.width > 0 && slideTemplate.height > 0
  );
  // Background: an embedded image, or a native solid fill. Solid fill is preferred for
  // Google Slides, which re-rasterizes (and blurs) imported picture backgrounds.
  const wantImage = !!(slideTemplate && slideTemplate.bgMode !== 'solid' && slideTemplate.imageBytes && slideTemplate.imageBytes.length);
  const bgKind = wantImage ? 'image' : 'solid';
  const bgColorHex = bgKind === 'solid'
    ? hex6(slideTemplate?.bgColor, slideTemplate ? 'FFFFFF' : '101118')
    : 'FFFFFF';

  const slideW = SLIDE_W_EMU;
  const slideH = hasRect
    ? Math.round(SLIDE_W_EMU * (slideTemplate.height / slideTemplate.width))
    : Math.round(SLIDE_W_EMU * 9 / 16);

  // Where the GIF goes: inside the placeholder rect (expanded so it overflows the
  // magenta marker by a few px), or centred with a small margin.
  let targetBox;
  if (hasRect) {
    const { rect } = slideTemplate;
    const ov = RECT_OVERFLOW_PX;
    const rx = rect.x - ov;
    const ry = rect.y - ov;
    const rw = rect.w + ov * 2;
    const rh = rect.h + ov * 2;
    targetBox = {
      x: Math.round((rx / slideTemplate.width) * slideW),
      y: Math.round((ry / slideTemplate.height) * slideH),
      cx: Math.round((rw / slideTemplate.width) * slideW),
      cy: Math.round((rh / slideTemplate.height) * slideH),
    };
  } else {
    const mx = Math.round(slideW * 0.04);
    const my = Math.round(slideH * 0.04);
    targetBox = { x: mx, y: my, cx: slideW - mx * 2, cy: slideH - my * 2 };
  }
  const gifBox = containInRect(targetBox, gifAspect);

  // Fixed top-right corner logo, flush in the very top-right corner (overrides whatever
  // the slide has there).
  const hasCorner = !!(cornerImageBytes && cornerImageBytes.length);
  const cornerW = Math.round(slideW * 0.24);
  const cornerH = Math.round(cornerW / CORNER_ASPECT);
  const cornerXml = hasCorner
    ? picXml(4, 'Corner logo', 'rIdCorner', slideW - cornerW, 0, cornerW, cornerH)
    : '';

  const bgExt = wantImage && ['png', 'jpeg', 'gif'].includes(slideTemplate.imageExt)
    ? slideTemplate.imageExt
    : 'png';
  const bgTarget = `template.${bgExt}`;
  // Vector background: PowerPoint renders the SVG crisply; the PNG above is the fallback.
  const hasSvg = wantImage && !!(slideTemplate.svgBytes && slideTemplate.svgBytes.length);

  const slideCount = usePosterImages ? usablePng.length : usable.length;
  const entries = [
    { path: '[Content_Types].xml', data: contentTypes(slideCount, { bgKind, bgExt, hasSvg, hasCorner, slideMediaExt: (usePosterImages ? 'png' : 'gif') }) },
    { path: '_rels/.rels', data: rootRels() },
    // Minimal doc properties improve compatibility with Google Slides import
    { path: 'docProps/app.xml', data: `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ECHO-VIS</Application><AppVersion>1.0</AppVersion></Properties>` },
    { path: 'docProps/core.xml', data: `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>ECHO-VIS Slides</dc:title><dc:creator>ECHO-VIS</dc:creator><cp:lastModifiedBy>ECHO-VIS</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>` },
    { path: 'ppt/presentation.xml', data: presentationXml(usable.length, slideW, slideH) },
    { path: 'ppt/_rels/presentation.xml.rels', data: presentationRels(usable.length) },
    { path: 'ppt/theme/theme1.xml', data: themeXml() },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: slideMasterXml() },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: slideMasterRels() },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayoutXml() },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: slideLayoutRels() },
  ];
  if (bgKind === 'image') {
    entries.push({ path: `ppt/media/${bgTarget}`, data: slideTemplate.imageBytes });
    if (hasSvg) entries.push({ path: 'ppt/media/template.svg', data: slideTemplate.svgBytes });
  }
  if (hasCorner) {
    entries.push({ path: 'ppt/media/corner.png', data: cornerImageBytes });
  }

  const clipsToUse = usePosterImages ? usablePng : usable;
  clipsToUse.forEach((clip, idx) => {
    const n = idx + 1;
    entries.push({ path: `ppt/slides/slide${n}.xml`, data: slideXml(slideW, slideH, gifBox, bgKind, bgColorHex, hasSvg, cornerXml) });
    // For Google Slides-friendly deck, point to PNG posters instead of GIFs
    const relsXml = usePosterImages
      ? slideRels(n, bgTarget, bgKind, hasSvg, hasCorner).replace(`../media/slide${n}.gif`, `../media/slide${n}.png`)
      : slideRels(n, bgTarget, bgKind, hasSvg, hasCorner);
    entries.push({ path: `ppt/slides/_rels/slide${n}.xml.rels`, data: relsXml });
    if (usePosterImages) {
      entries.push({ path: `ppt/media/slide${n}.png`, data: clip.posterBytes });
    } else {
      entries.push({ path: `ppt/media/slide${n}.gif`, data: clip.gifBytes });
    }
  });

  return createZip(entries);
}

// Convenience wrapper: build a PPTX that is friendlier to Google Slides import by
// using static poster PNGs instead of animated GIFs.
export function buildGoogleFriendlyPptx(opts) {
  return buildTemplatedPptx({ ...opts, usePosterImages: true });
}
