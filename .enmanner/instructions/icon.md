# App icon

An Enmanner launcher SHOULD have a distinctive, project-appropriate icon. Treat the
icon as part of finishing the app, not as an optional extra.

Beautiful source artwork and correct macOS bundle packaging are separate
requirements. An existing app icon is not necessarily valid icon source
artwork. On macOS Tahoe and later, the system can place a legacy `.icns` inside
a compatibility enclosure ("icon jail"). A standalone `.icns` is therefore not
an acceptable finished configuration when Xcode's `actool` is available.

## Preflight: inspect the source asset

Before packaging an existing icon, determine whether it already contains macOS
container treatment. Do not use the asset directly when it contains:

- a squircle, circle, or rounded-square silhouette
- transparent rounded corners
- an inset border or rim
- an outer drop shadow
- a background plate surrounding the brand mark

A flattened legacy app icon is a visual reference, not modern source artwork.
Extract or reconstruct its background and foreground as separate full-canvas
layers.

## Create layered artwork

1. Inspect the repository for an existing logo or icon concept that suits the
   app.
2. If none is appropriate, use the image-generation capability available in
   your coding environment to create a polished icon based on the app's purpose
   and visual language. Do not settle for a generic placeholder or text-only
   initial.
3. Build the Icon Composer document from separate background and foreground
   layers:
   - Make the background full-bleed and unmasked.
   - Give foreground artwork real transparency and enough breathing room for
     the system to crop and compose it safely.
     Keeping the main artwork roughly within the central 70% of the canvas
     (about 15% margin per side) is a useful starting point, not a hard rule.
   - Never bake in a squircle, rounded corners, outer shadow, border, backing
     plate, or transparent corners. macOS supplies the container and material.
4. In Icon Composer, verify the Default, Dark, Clear, and Tinted appearances.
   Preserve the high-resolution source artwork and the `.icon` package in
   normal tracked project directories.

For a simple two-layer icon, Enmanner can create the initial modern package and
Apple-generated legacy fallback together on the Xcode-equipped Mac:

```bash
./.enmanner/scripts/create-icon \
  --background enmanner/icon/icon-background.png \
  --foreground enmanner/icon/icon-foreground.png \
  --output enmanner/icon/AppIcon.icon \
  --legacy-output enmanner/icon/AppIcon.icns
```

The generator requires square PNG layers of at least 1024×1024, an opaque
background, and an alpha-bearing foreground. `--legacy-output` requires current
Xcode because it retains the `.icns` fallback produced by `actool`; it does not
approximate the fallback independently. Open the modern result in Icon Composer
for visual adjustment and appearance review.

To adjust composition without changing canonical source artwork, transform only
the foreground copy embedded in the package:

```bash
./.enmanner/scripts/create-icon \
  --background enmanner/icon/icon-background.png \
  --foreground enmanner/icon/icon-foreground.png \
  --foreground-scale 0.86 \
  --foreground-offset-y 24 \
  --output enmanner/icon/AppIcon.icon \
  --legacy-output enmanner/icon/AppIcon.icns
```

Positive X moves right and positive Y moves down. The original PNG remains
unchanged. During iteration, add `--replace` to atomically replace an unchanged
package previously created by `create-icon`. The command refuses edited Icon
Composer packages, symbolic links, unexpected package contents, and standalone
legacy destinations whose companion modern package cannot be recognized:

```bash
./.enmanner/scripts/create-icon \
  --background enmanner/icon/icon-background.png \
  --foreground enmanner/icon/icon-foreground.png \
  --foreground-scale 0.82 \
  --output enmanner/icon/AppIcon.icon \
  --legacy-output enmanner/icon/AppIcon.icns \
  --replace
```

The `.icon` package contains its own copies of the configured layers so it is
self-contained. Keep the original high-resolution layers as canonical source
artwork; the package copies are expected, not accidental duplication.

Render every supported appearance without opening Icon Composer, before
changing the manifest:

```bash
./.enmanner/scripts/preview-icon --package enmanner/icon/AppIcon.icon
```

After selecting the finished package, add its project-relative path to
`enmanner/enmanner.json`. Plain `preview-icon` then uses the configured path.

The default output is `.enmanner/.build/icon-previews/`. Pass `--output` with a
visible project-relative directory when previews should be preserved for
review. Other locations directly under `.enmanner/` are framework-owned and
rejected.
Preview PNGs, the contact sheet, and measurements are reproducible QA evidence
and should normally remain under `.enmanner/.build`; do not commit them unless
the project intentionally preserves visual snapshots. Automated bounds, alpha,
and corner-opacity warnings complement but never replace visual inspection.

## Package the modern icon

Commit both generated formats and configure their project-relative paths:

```json
"icon": {
  "modern": "enmanner/icon/AppIcon.icon",
  "legacy": "enmanner/icon/AppIcon.icns"
},
```

Enmanner attempts `modern` when `actool` is available and accepts it only when
the result contains a verified `IconImageStack`. It automatically uses `legacy`
when `actool` is absent or too old to produce that stack, so developers do not
need to edit the manifest for their local toolchain.
The single-string modern form remains compatible, but it does not provide a
build source for Command Line Tools-only collaborators.

When full Xcode and `actool` are available, agents MUST produce and configure an
Icon Composer `.icon` package. Do not configure `.icns` merely because it
builds successfully, and never generate `.icns` from a flattened rounded-square
PNG when modern tooling is available.

Enmanner uses Xcode's `actool` to compile the package. A successful modern icon
build contains:

- `Contents/Resources/Assets.car` containing the icon image stack
- `CFBundleIconName` in `Contents/Info.plist`
- a generated `.icns` resource and `CFBundleIconFile` for older macOS fallback

Creating `.icon` packages requires Icon Composer, and compiling them requires a
current full Xcode installation with `actool`. A standalone `.icns` is allowed
only as a compatibility fallback when `actool` is unavailable. If an
exceptional workflow intentionally needs legacy packaging on a machine that has
`actool`, `validate` and `build-app` require the explicit
`--allow-legacy-icon` escape hatch, and the final report must identify the
fallback.

## Acceptance gate

The icon task is not complete until all of these pass:

- `enmanner/enmanner.json` references the `.icon` package as `icon.modern` and
  the generated `.icns` fallback as `icon.legacy`.
- Background artwork fills every corner of its square source canvas.
- Foreground artwork has real alpha transparency.
- No source layer contains a baked squircle, border, shadow, or backing plate.
- `./.enmanner/scripts/validate` passes.
- `./.enmanner/scripts/build-app` confirms `CFBundleIconName` and an
  `IconImageStack` in `Assets.car`.
- Default, Dark, Clear, and Tinted renditions have been rendered, opened, and
  visually inspected for clipping, balance, and unintended container effects;
  `preview-icon` is the supported automated rendering path.
- The actual Dock/Finder icon has one system-supplied outer container, never a
  smaller rounded icon inside it.

Inspect the compiled `.app`, not merely the source PNG or Icon Composer preview.
Do not put assets inside the generated `.app` by hand; Enmanner creates each
bundle reproducibly from tracked project files.

The final `build-app` refuses a missing icon. `build-app --development` may
produce a separately named, conspicuously badged launcher for native lifecycle
testing, but that artifact and its separate test receipt can never satisfy
`doctor.complete`. Enmanner intentionally provides no placeholder-icon
completion path.
