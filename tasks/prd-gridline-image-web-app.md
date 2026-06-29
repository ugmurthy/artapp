# PRD: Gridline Image Web App

## 1. Introduction / Overview

Build a React-based, fully client-side web application that lets users create downloadable images with configurable gridlines. Users can either upload an existing image and draw gridlines over it, or create a blank grid-only canvas when no image is uploaded.

The app is intended for artists, designers, educators, and hobbyists who need image overlays or printable grid references. Processing should happen entirely in the browser so images remain private and no backend is required for the initial version.

## 2. Goals

- Allow users to upload an image and preview it with configurable gridlines.
- Allow users to create and download a grid-only image without uploading an image.
- Support independent horizontal and vertical grid spacing in pixels.
- Support configurable gridline color and thickness.
- Support optional border labels using numbers for columns and letters for rows.
- Provide a clear download action that exports the processed result as a PNG.
- Keep the initial app simple, fast, and fully client-side.

## 3. User Stories

### US-001: Upload and preview an image

**Description:** As a user, I want to upload an image so that I can add gridlines over it.

**Acceptance Criteria:**

- [ ] User can select a PNG, JPEG/JPG, or browser-supported WebP image file.
- [ ] The selected image is loaded locally in the browser without server upload.
- [ ] The app displays a preview of the uploaded image.
- [ ] If a new image is selected, the preview updates to the new image.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-002: Configure gridline spacing, color, and thickness

**Description:** As a user, I want to customize gridline spacing, color, and thickness so that the overlay matches my needs.

**Acceptance Criteria:**

- [ ] User can set horizontal grid spacing in pixels.
- [ ] User can set vertical grid spacing in pixels.
- [ ] User can choose gridline color.
- [ ] User can set gridline thickness in pixels.
- [ ] Changing any setting updates the preview.
- [ ] Invalid or non-positive spacing/thickness values are prevented or corrected before rendering.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003: Render gridlines over uploaded image

**Description:** As a user, I want the app to draw gridlines over my uploaded image so that I can download a processed copy.

**Acceptance Criteria:**

- [ ] Vertical gridlines are drawn using the configured vertical spacing.
- [ ] Horizontal gridlines are drawn using the configured horizontal spacing.
- [ ] Gridlines use the selected color and thickness.
- [ ] The original image aspect ratio is preserved.
- [ ] The output canvas uses the uploaded image dimensions plus any label margin when labels are enabled.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Create grid-only image without uploading an image

**Description:** As a user, I want to create a blank canvas with gridlines even when I do not upload an image so that I can print or reuse plain grid templates.

**Acceptance Criteria:**

- [ ] The app works when no image is uploaded.
- [ ] User can configure blank canvas width and height in pixels.
- [ ] The preview shows gridlines on the blank canvas using the same spacing, color, and thickness controls.
- [ ] The blank canvas uses a visible default background, such as white.
- [ ] User can download the grid-only canvas as a PNG.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Show optional border labels

**Description:** As a user, I want optional border labels so that grid cells can be referenced by row and column.

**Acceptance Criteria:**

- [ ] User can turn border labels on or off.
- [ ] Column labels are numeric: `0, 1, 2, 3 ... n`.
- [ ] Column labels appear along both the top and bottom borders.
- [ ] Row labels are alphabetic: `a, b, c ... z, aa, ab ...`.
- [ ] Row labels appear along both the left and right borders.
- [ ] Labels are included in both uploaded-image output and grid-only output.
- [ ] Labels are drawn in an added margin around the image/canvas, not over the image content.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Download processed result

**Description:** As a user, I want to download the processed image so that I can save, print, or share it.

**Acceptance Criteria:**

- [ ] User can click a Download button to export the current preview.
- [ ] Downloaded file is a PNG.
- [ ] Download includes the uploaded image if present.
- [ ] Download includes gridlines using the current settings.
- [ ] Download includes labels when labels are enabled.
- [ ] Download works for grid-only mode when no image is uploaded.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## 4. Functional Requirements

- FR-1: The app must be implemented as a React single-page web application.
- FR-2: The app must process images entirely in the browser with no backend upload.
- FR-3: The app must allow users to upload image files in common browser-supported formats, including PNG and JPEG/JPG.
- FR-4: The app must render the uploaded image into an HTML Canvas.
- FR-5: The app must allow separate horizontal and vertical grid spacing values in pixels.
- FR-6: The app must allow users to configure gridline color.
- FR-7: The app must allow users to configure gridline thickness in pixels.
- FR-8: The app must draw vertical gridlines according to vertical spacing.
- FR-9: The app must draw horizontal gridlines according to horizontal spacing.
- FR-10: The app must provide an optional labels toggle.
- FR-11: When labels are enabled, the app must add margin around the image/canvas so labels do not cover the image content.
- FR-12: When labels are enabled, the app must show numeric column labels along the top and bottom borders.
- FR-13: When labels are enabled, the app must show alphabetic row labels along the left and right borders.
- FR-14: Alphabetic row labels must continue after `z` using spreadsheet-style labels such as `aa`, `ab`, and `ac`.
- FR-15: The app must allow grid-only mode when no image is uploaded.
- FR-16: In grid-only mode, the app must provide editable canvas width and height in pixels.
- FR-17: In grid-only mode, the app must render a blank background with gridlines.
- FR-18: The app must provide a preview that updates when relevant settings change.
- FR-19: The app must provide a Download button that exports the current rendered result as a PNG.
- FR-20: The app must prevent or safely handle invalid values such as zero spacing, negative spacing, zero thickness, or negative canvas dimensions.

## 5. Non-Goals / Out of Scope for MVP

- No backend image processing.
- No user accounts or authentication.
- No cloud storage or saved projects.
- No batch image processing.
- No PDF export.
- No physical unit support such as inches, centimeters, millimeters, or DPI calibration.
- No percentage-based spacing.
- No custom grid origin offset in the initial version.
- No configurable label placement beyond the selected default of top/bottom and left/right.
- No JPEG output option in the initial version.

## 6. Design Considerations

- Use a clean two-panel layout:
  - Main preview area for the canvas.
  - Settings panel for upload, canvas size, grid controls, label toggle, and download.
- The app should make grid-only mode obvious when no image is uploaded.
- Controls should use reasonable defaults, for example:
  - Blank canvas width: `1024 px`
  - Blank canvas height: `1024 px`
  - Horizontal spacing: `100 px`
  - Vertical spacing: `100 px`
  - Gridline color: black or red
  - Gridline thickness: `1 px`
  - Labels: off by default or on if the UI clearly previews them
- The preview should fit within the viewport while preserving the true export dimensions internally.
- Label margins should be large enough to keep labels readable.

## 7. Technical Considerations

- Use React state for image metadata, grid settings, label settings, and blank canvas dimensions.
- Use the browser File API and `URL.createObjectURL` or `FileReader` to load local images.
- Use an HTML Canvas for rendering and export.
- Use `canvas.toBlob()` for PNG downloads when available.
- Revoke object URLs after image replacement or component cleanup to avoid memory leaks.
- Keep rendering deterministic: the preview canvas and downloaded image should come from the same rendering logic.
- Validate numeric inputs before drawing to avoid infinite loops or browser hangs.

## 8. Success Metrics

- User can upload an image, configure gridlines, and download a PNG in under one minute.
- User can create and download a grid-only PNG without uploading an image.
- Preview updates immediately after changing grid settings.
- Labels are readable and do not cover image content.
- The app works without network connectivity after assets are loaded.

## 9. Open Questions

- Should labels be on by default or off by default?
- What default gridline color should be used: black, red, or another color?
- Should blank grid-only PNGs have a white background only, or should transparent background be supported later?
- Should there be a reset-to-defaults button?
