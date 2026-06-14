# IRIS Documentation

## Overview

IRIS is a node-based animation editor. You build diagrams by placing **nodes** on the canvas, connecting them with **links**, and animating their appearance over time using the **timeline** at the bottom of the screen.

Each node and link has a scheduled **start time** and **duration**. Drag the coloured blocks on the timeline to reorder them. The playhead (vertical line) shows the current frame.

Select any element on the canvas to see its properties in the **Properties Panel** on the right. When nothing is selected, the panel shows global defaults for the next link and token appearance.

## Canvas & Viewport

| Action | How |
|--------|-----|
| Pan | Two-finger scroll (trackpad) or middle-mouse drag |
| Zoom | Pinch (trackpad) or Ctrl + scroll |
| Select | Click a node or link; Shift+click to multi-select |
| Box select | Click-drag on empty canvas |
| Move nodes | Drag selected nodes; arrow keys nudge by 1 px (Shift = 10 px) |
| Delete | Delete / Backspace key |
| Draw link | Click a node edge handle, then click the target node |
| Add joint | Right-click a link |
| Snap | Toggle the Snap chip in the top-right; Alt temporarily disables |
| Ghost nodes | Toggle "Ghosts" to see where not-yet-visible nodes will appear at full size |

## Node

Nodes are the building blocks of the diagram. Double-click a node to rename it inline.

| Property | Description |
|----------|-------------|
| Label | Display text shown inside the node |
| Shape | Rectangle, circle, diamond, hexagon, or custom |
| Fill | Background colour (click the swatch to pick) |
| Border | Stroke colour |
| Border width | Stroke thickness in canvas pixels |
| Corner radius | Rounding for rectangle shapes |
| Width / Height | Fixed size; set to 0 to auto-fit the label |
| Appear | Entry animation start time and duration in seconds |
| Entry mode | Fade, Grow, Write — how the node enters the frame |

## Text Node

Text nodes are free-floating labels not connected to any network. They support all node styling plus:

| Property | Description |
|----------|-------------|
| Font size | Override the default label size |
| Aura | Glow effect around the text — set colour, strength, and radius |
| Animate | Write-on animation that types the text character by character |
| Padding X/Y | Extend the invisible hit zone for link attachment |
| Morphs | Schedule text or colour changes at specific times (see Morphs) |

## Link

Links connect two nodes and animate as a line drawing across the canvas.

| Property | Description |
|----------|-------------|
| Color | Line colour |
| Width | Line thickness in canvas pixels |
| Arrow tip | None, open arrow, filled arrow, or circle |
| Tip style | Size and proportion of the arrowhead |
| Appear | Start time and duration for the draw animation |
| Entry mode | Draw (line grows), Fade, or instant |

## Anchors

Each link end has an **anchor** that determines exactly where it attaches to the source and target node. Drag the circle handles on the canvas for free-form placement, or use the sliders for precise control.

| Property | Description |
|----------|-------------|
| Side | Which face of the node the link attaches to (Top, Right, Bottom, Left, Auto) |
| Position | Percentage along the chosen side (0 = start edge, 100 = end edge) |

## Joints

Joints are intermediate waypoints that reroute a link. Add them by right-clicking the link on the canvas. They do not create timeline events.

| Property | Description |
|----------|-------------|
| Mode | Linked — both curve handles move together; Split — independent handles |
| Curvature | How much the line bends at the joint (0 = sharp corner) |

## Curvature

See [Joints](#joints). The Curvature section appears when a joint is selected and controls the bezier handles at that joint point.

## Animation

Every node and link has animation properties that determine when and how it enters the scene. Drag the coloured block on the timeline row to change the start time. Resize the block to change the duration.

| Property | Description |
|----------|-------------|
| Start | Time in seconds when the element begins to appear |
| Duration | How long the entry animation takes |
| Entry mode | Fade: opacity transition; Grow: scales from a point; Write: types on the label |
| Delay | Extra wait before the element reacts to a trigger |

## Morphs

Morphs let you schedule style or text changes at any point on the timeline. Each morph creates a draggable block on the element's timeline row.

| Property | Description |
|----------|-------------|
| To | Target value (text, colour, or number) |
| Mode | Instant (snap), Fade (crossfade), or Write (type) |
| Text color | Override the label colour at this moment |
| Start | When the morph begins (seconds) |
| Duration | How long the transition takes |

## Resolve

Resolve transforms an element into the appearance of another node exactly when its animation completes. Drag the amber timeline block to set the moment.

| Property | Description |
|----------|-------------|
| Mode | Which target node to copy appearance from |
| Into | Drag to select the target node on canvas |
| Label | Override the text at resolve time |
| Shape | Override the shape |
| Fill | Override the fill colour |
| Border | Override the border colour |
| Timing | Start offset and duration of the resolve transition |

## Spawn Timing

Controls how a link token or drawn line fades in relative to the draw animation.

| Property | Description |
|----------|-------------|
| While drawing | Token fades in during the final portion of the link draw animation |
| At completion | Token starts exactly when the link finishes drawing |

## Manual Token

A Manual Token is a labelled bubble that travels along a link independently of the variable system. Use it to annotate data flow or illustrate a specific value moving through the diagram.

| Property | Description |
|----------|-------------|
| Enabled | Toggle the token on or off |
| Start | Time (seconds) when the token begins its journey |
| Delay | Additional wait before it departs |
| Travel time | Duration of the trip from source to target node |
| Direction | Forward (source → target) or Backward |
| Name | Label displayed on the token bubble |
| Value | Secondary value shown below the name |
| Message | Tooltip text that appears on hover |
| Token color | Background colour of the bubble |
| Token size | Radius of the bubble in canvas pixels |
| Text color | Colour of the label inside the bubble |
| Text size | Font size of the label |

## Variable

Variable nodes track a named value and send tokens downstream through a web of connected links. Each variable has one token in flight at a time. Connect a chain of Variable nodes with links — the token travels the path in the order defined by the timeline.

| Property | Description |
|----------|-------------|
| Track | Which named variable this node reads from |
| Name | The identifier shared across all nodes in the same web |
| Value | Current value displayed on the node |
| Input | Visual — renders a visible token; Silent — no visible token |

## Token Appearance

Controls the visual style of variable tokens. When accessed from an empty-canvas selection this sets the **global default**; when accessed from a specific Variable node it overrides only that node's token.

| Property | Description |
|----------|-------------|
| Shape | Circle, square, diamond, or hexagon |
| Size | Radius in canvas pixels |
| Fill | Token background colour |
| Border | Token outline colour |
| Label | Text displayed on the token |
| Label color | Colour of the label text |
| Label size | Font size of the label |

## Passing Tokens

When a variable token passes through a node you can override its appearance *at that node* — and optionally stop it so it does not continue downstream.

| Property | Description |
|----------|-------------|
| Flow | Continue — token passes through; Stop — token ends here |
| Label text | Override the token label at this node |
| Shape / Size / Fill / Border | Visual overrides for this node only |
| Label color / Label size | Text style overrides |

## Watched Nodes

A Monitor node can watch a set of other nodes and update its display text as each token passes them.

| Property | Description |
|----------|-------------|
| Template | Text template — use `{value}` and `{name}` as placeholders |
| Add | Click to pick a node from the canvas to watch |

## Monitor

Monitor nodes display live values and statuses during playback. Commonly used to show counters, packet data, or system state.

| Property | Description |
|----------|-------------|
| Title | Header text at the top of the monitor |
| Initial | Starting value shown before any token arrives |
| Status | Pre-defined status icon (OK, Warning, Error, Idle) |
| Failures | Number of failure events to show |
| Width / Height | Fixed dimensions of the monitor panel |
| Fill | Background colour |
| Border | Outline colour |
| Text color | Primary text colour |
| Font size | Text size inside the monitor |
| Value box | Show or hide the main value display area |
| Appear | Animation entry timing |

## Monitor Output

Sets what the monitor displays at each diamond keyframe on the timeline. Templates run when the playhead crosses that keyframe.

| Property | Description |
|----------|-------------|
| To | Target monitor node to write to |
| Mode | Set — replace the value; Append — add to it |
| Text color | Colour override for this output |
| Start | When the output fires (seconds) |
| Duration | How long the update animation takes |

## Playback

Controls how a sub-diagram or popup animation runs when triggered by a variable token arriving at a node.

| Property | Description |
|----------|-------------|
| Badge | Show a small counter badge on the node |
| Popup | Open an animated sub-diagram popup when the token arrives |
| Delay | Seconds to wait after token arrival before the popup opens |
| Speed | Playback rate multiplier (1 = normal, 2 = double speed) |
| Hold | Seconds to keep the popup visible after the animation finishes |

## Popup

A popup is a floating sub-diagram overlay that appears when a variable token reaches a node.

| Property | Description |
|----------|-------------|
| Value | Value passed into the sub-diagram scope |
| Tab color | Colour of the popup title tab |
| Width | Popup panel width in screen pixels |
| Height | Popup panel height in screen pixels |
| Delay | Seconds after token arrival before the popup opens |
| Length | Duration of the sub-diagram playback inside the popup |
| Stay open | Keep the popup visible even after its animation ends |

## Subdiagram

A sub-diagram node contains its own mini-diagram that can be expanded as a popup or opened as a nested canvas.

| Property | Description |
|----------|-------------|
| Label | Node display text |
| Title | Header shown in the popup overlay |
| Shape | Outer node shape |
| Source | Project to use as the nested diagram content |
| Appear | Animation timing for the outer node |

## Scroll

A Scroll area is a clipping region that continuously loops the nodes placed inside it. Select the area node to configure scrolling.

| Property | Description |
|----------|-------------|
| Direction | Horizontal or Vertical |
| Mode | Glide — continuous scrolling; Step — hold then shift one tile |
| Speed | (Glide) Pixels per second |
| Gap | (Glide) Extra space added before the content repeats |
| Step every | (Step) Seconds between each step shift |
| Shift time | (Step) Duration of the shift transition |
| Min tiles | Minimum number of content copies kept in the area |
| Tile size | Override the automatic tile size calculation |
| Start at | Initial scroll offset in pixels |
| Loop | Whether the scroll repeats indefinitely |

## Mirror

A Mirror node copies the appearance and timing of one or more **source** nodes but keeps its own position on the canvas. Use mirrors to show the same element in multiple places without duplicating timeline events.

## Mirror Source

| Property | Description |
|----------|-------------|
| Text | Override the label text inside this mirror |
| Text color | Override the label colour |
| Fill | Override the fill colour |
| Border | Override the border colour |
| Color | Shorthand colour override applied to all style fields |

## HKDF

Domain Separation lets you divide a mirrored node into independent output zones, each with its own HKDF-derived value. When two domains overlap, the one higher in the list wins. Use ↑ / ↓ to reorder domains and change priority.

| Property | Description |
|----------|-------------|
| Label | Domain identifier text |
| Label color | Text colour |
| Label size | Font size |
| Color | Circle fill colour |
| Center X/Y | Position of the domain circle in canvas coordinates |
| Radius | Circle radius |
| Appear at | When this domain appears on the timeline |

## Next Link

When nothing is selected, the Properties Panel shows defaults applied to the **next link you draw**. Change these to pre-configure the style for bulk link creation.

| Property | Description |
|----------|-------------|
| Shape | Line shape for the next link |
| Size | Line thickness |
| Fill | Line colour |
| Border | Outline (used for certain line styles) |
| Label | Default annotation text on the link |
| Label color | Annotation text colour |
| Label size | Annotation font size |

## Vectors

Vector fields drawn on an Equation node. Each vector originates from a graph point and points in the direction of the field.

| Property | Description |
|----------|-------------|
| Color | Arrow colour |
| Width | Arrow shaft thickness |
| Head length | Arrowhead length in canvas pixels |
| Head width | Arrowhead width |
| Speed | Animation speed multiplier for flowing vector fields |

## Point Defaults

Default visual style applied to all interaction points placed on an Equation node unless overridden per-point.

| Property | Description |
|----------|-------------|
| Size | Point radius |
| Fill | Fill colour |
| Stroke | Outline colour |

## Equation Points

Interactive points placed on the graph surface. Shift+click to add; Alt+click to remove.

| Property | Description |
|----------|-------------|
| X / Y | Coordinates in graph (equation) space |
| Size | Point radius override |
| Fill / Stroke | Colour overrides |
| Vector to | Destination point for an animated arrow from this point |
| Calc at | Time (s) when the equation value is sampled for this point |
| Duration | How long the sampling animation takes |
| Dots | Show a trail of dots along the path |
| Dot size | Radius of each trail dot |
| Dot color | Colour of the dots |

## Export

Open the **Export** menu in the top bar to access output options.

| Option | Description |
|--------|-------------|
| GIF package | Exports one animated GIF per slide |
| PPTX | Exports the animation as a PowerPoint presentation |
| MP4 | Exports a video file |
| Export Settings | Configure resolution, speed, border, and slide template |
| Resolution | 720p · 1080p · 1440p · 2160p |
| Speed | Playback rate for the exported output (0.5× – 4×) |
| Border | Optional padding around the canvas in the exported file |
| Slide template | Background image (SVG or PNG) placed behind each slide |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play / Pause animation |
| Delete / Backspace | Delete selected element |
| Arrow keys | Nudge selection 1 px (Shift = 10 px or grid size) |
| Ctrl + B | Copy selection to alignment ghost clipboard |
| Ctrl + F | Center the capture frame on the stage |
| P (View menu) | Enter / exit Preview mode |
| Alt + drag | Temporarily disable snapping while moving |
| Shift + click canvas | Add to selection (box select) |
| Shift + click equation | Add a point on an Equation node |
| Alt + click point | Remove a point from an Equation node |
| Right-click link | Add a joint |