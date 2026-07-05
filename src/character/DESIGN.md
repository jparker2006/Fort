# Hero Character Design and Originality Review

Fort's hero is an original stylized character built entirely in code. No Epic
Games assets, character likenesses, emotes, or trade dress are used anywhere.
This document records the design intent and the originality checklist.

## Design brief

A sleek courier / explorer. The silhouette reads as a lightly armored runner:
low-profile helmet with a copper visor band, a fitted teal jacket with a copper
front seam, a slate utility harness and trousers, copper gloves, and dark boots.
A compact courier pack rides on the back. The proportions are mildly stylized
(slightly larger head and hands than realistic) but not chibi.

## Palette

- Teal `#27a3a0`: jacket, sleeves, shoulder pads.
- Slate `#3c4a57`: harness, pelvis, thighs, helmet base.
- Dark `#232d36`: shins, boots.
- Copper `#cf7d3c`: visor, front seam, gloves, tool cap.

Color blocking is per-vertex; a small procedural fabric-weave texture supplies
surface detail. Both are generated in code (`textures.ts`), no image files.

## The Mattock (harvesting tool)

An original harvesting tool, not a pickaxe silhouette: a wooden haft with an
angular slate head, a single short pick tine on one side, and a copper end cap.
It is parented to the right hand bone.

## Construction

- Skeleton: a programmatic humanoid (`skeleton-def.ts`) with root, hips, spine,
  chest, neck, head, and full arms and legs (shoulder, elbow, wrist; hip, knee,
  ankle), defined in bind-pose world space.
- Mesh: primitive parts (boxes, capsules, a sphere) merged into one geometry,
  with per-vertex color blocking, skinned to the skeleton via automatic
  two-bone distance weighting for smooth joint bends.

## Originality checklist (reviewed)

- [x] No Epic Games meshes, textures, rigs, or animation data imported.
- [x] No character likeness or recognizable Fortnite outfit is referenced.
- [x] No llamas, no Battle Bus, no Peely, no recognizable Epic silhouettes.
- [x] No Fortnite emotes or dances (T08 clips are original locomotion).
- [x] Tool is an original Mattock, not the Fortnite default pickaxe shape.
- [x] All geometry and textures are generated in this repository at runtime.
- [x] HUD and icon art (T15, T19) are likewise original, not copied icon art.
