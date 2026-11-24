/** Standalone browser Canvas gridding. No React or application dependencies. */
export const DEFAULT_SETTINGS = Object.freeze({
  blankWidth: 1024,
  blankHeight: 1024,
  horizontalSpacing: 100,
  verticalSpacing: 100,
  gridColor: '#c8c6c6',
  invertColors: true,
  thickness: 2,
  showGrid: true,
  showDiagonalGrid: false,
  showLabels: true,
  labelFontSize: 24,
  labelColor: '#000000',
  labelPlacement: 'outside',
  labelCorner: 'top-left',
})

const LABEL_MARGIN = 56
const ALIGNMENT_MARKER_RADIUS = 16
export const MAX_CANVAS_SIDE = 8000
export const MIN_CANVAS_SIDE = 16
export const MAX_SPACING = 4000
export const MAX_THICKNESS = 80
export const MIN_LABEL_FONT_SIZE = 6
export const MAX_LABEL_FONT_SIZE = 30

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback))
}

/** Merge partial options with defaults and apply the same limits as GridWright's controls. */
export function normalizeGridSettings(options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options }
  return {
    ...settings,
    blankWidth: clampInteger(settings.blankWidth, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankWidth),
    blankHeight: clampInteger(settings.blankHeight, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankHeight),
    horizontalSpacing: clampInteger(settings.horizontalSpacing, 1, MAX_SPACING, DEFAULT_SETTINGS.horizontalSpacing),
    verticalSpacing: clampInteger(settings.verticalSpacing, 1, MAX_SPACING, DEFAULT_SETTINGS.verticalSpacing),
    thickness: clampNumber(settings.thickness, 0.5, MAX_THICKNESS, DEFAULT_SETTINGS.thickness),
    labelFontSize: clampNumber(settings.labelFontSize, MIN_LABEL_FONT_SIZE, MAX_LABEL_FONT_SIZE, DEFAULT_SETTINGS.labelFontSize),
    labelPlacement: settings.labelPlacement === 'inside' ? 'inside' : 'outside',
    labelCorner: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(settings.labelCorner)
      ? settings.labelCorner : DEFAULT_SETTINGS.labelCorner,
  }
}

function gridPositions(length, spacing) {
  const positions = []
  const safeLength = Math.max(1, Math.round(length))
  const safeSpacing = Math.max(1, Math.round(spacing))
  const cellCount = Math.floor(safeLength / safeSpacing)
  const offset = (safeLength - cellCount * safeSpacing) / 2

  if (cellCount === 0) return positions

  for (let index = 0; index <= cellCount; index += 1) {
    positions.push(offset + index * safeSpacing)
  }
  return positions
}

function rowLabel(index) {
  let label = ''
  let value = index
  do {
    label = String.fromCharCode(97 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return label
}

/**
 * Draw a loaded HTMLImageElement, ImageBitmap, or canvas with a centered grid.
 * Pass null (or omit image) for a blank template. Images retain their native size.
 * The destination canvas is resized and replaced. Returns dimensions and cell counts,
 * or null when a 2D context is unavailable. Export via canvas.toBlob() / toDataURL().
 *
 * Options are the keys in DEFAULT_SETTINGS; omitted options use those defaults.
 * Spacing/thickness/dimensions are pixels; labelFontSize is points (6–30).
 * Outside labels retain zero-based columns and lowercase row letters on the border.
 * Inside labels use A1, A2, ... across, B1, B2, ... down (then Z, AA, AB, ...).
 * labelCorner selects the corner inside each cell, with a small inset from the lines.
 * Oversized labels are clipped to their cell; reduce font size for small cells.
 * Only outside labels reserve the 56px border; other modes retain 18px for markers.
 * showGrid: false hides lines and labels but preserves the alignment markers.
 * Images must already be loaded; cross-origin images need CORS for PNG export.
 *
 * @example
 * import { renderGridCanvas } from './imageGrid.js'
 * await image.decode()
 * const info = renderGridCanvas(canvas, image, {
 *   labelPlacement: 'inside', labelCorner: 'top-left',
 *   labelFontSize: 12, labelColor: '#cc0000',
 * })
 */
export function renderGridCanvas(canvas, image = null, options = {}) {
  const context = canvas.getContext('2d')
  if (!context) return null

  const settings = normalizeGridSettings(options)
  const contentWidth = image ? (image.naturalWidth ?? image.width) : settings.blankWidth
  const contentHeight = image ? (image.naturalHeight ?? image.height) : settings.blankHeight
  const margin = settings.showLabels && settings.labelPlacement === 'outside'
    ? LABEL_MARGIN : ALIGNMENT_MARKER_RADIUS + 2
  const outputWidth = contentWidth + margin * 2
  const outputHeight = contentHeight + margin * 2
  const originX = margin
  const originY = margin
  const { horizontalSpacing, verticalSpacing, thickness } = settings
  const hasWholeCells = contentWidth >= verticalSpacing && contentHeight >= horizontalSpacing
  const verticals = hasWholeCells ? gridPositions(contentWidth, verticalSpacing) : []
  const horizontals = hasWholeCells ? gridPositions(contentHeight, horizontalSpacing) : []
  const gridLeft = originX + (verticals[0] ?? 0)
  const gridTop = originY + (horizontals[0] ?? 0)
  const gridRight = originX + (verticals.at(-1) ?? 0)
  const gridBottom = originY + (horizontals.at(-1) ?? 0)

  canvas.width = outputWidth
  canvas.height = outputHeight
  context.clearRect(0, 0, outputWidth, outputHeight)
  context.fillStyle = '#fffdf6'
  context.fillRect(0, 0, outputWidth, outputHeight)

  if (image) {
    context.drawImage(image, originX, originY, contentWidth, contentHeight)
  } else {
    context.fillStyle = '#ffffff'
    context.fillRect(originX, originY, contentWidth, contentHeight)
  }

  context.save()
  // Keep even thick boundary strokes out of the unused margins.
  context.beginPath()
  context.rect(gridLeft, gridTop, gridRight - gridLeft, gridBottom - gridTop)
  context.clip()
  context.globalCompositeOperation = settings.invertColors ? 'difference' : 'source-over'
  context.strokeStyle = settings.invertColors ? '#ffffff' : settings.gridColor
  context.lineWidth = thickness
  context.lineCap = 'butt'
  context.lineJoin = 'miter'
  context.beginPath()

  for (const x of verticals) {
    const canvasX = originX + x
    context.moveTo(canvasX, gridTop)
    context.lineTo(canvasX, gridBottom)
  }
  for (const y of horizontals) {
    const canvasY = originY + y
    context.moveTo(gridLeft, canvasY)
    context.lineTo(gridRight, canvasY)
  }
  if (settings.showDiagonalGrid) {
    for (let columnIndex = 0; columnIndex < verticals.length - 1; columnIndex += 1) {
      for (let rowIndex = 0; rowIndex < horizontals.length - 1; rowIndex += 1) {
        const left = originX + verticals[columnIndex]
        const right = originX + verticals[columnIndex + 1]
        const top = originY + horizontals[rowIndex]
        const bottom = originY + horizontals[rowIndex + 1]
        context.moveTo(left, top)
        context.lineTo(right, bottom)
        context.moveTo(right, top)
        context.lineTo(left, bottom)
      }
    }
  }
  if (settings.showGrid) context.stroke()
  context.restore()

  if (hasWholeCells) {
    const gridWidth = gridRight - gridLeft
    const gridHeight = gridBottom - gridTop
    const markerXs = [gridLeft, gridRight]
    const markerYs = [gridTop, gridBottom]
    if (gridHeight > gridWidth) {
      markerYs.push(gridTop + gridWidth)
    } else if (gridWidth > gridHeight) {
      markerXs.push(gridLeft + gridHeight)
    }

    context.save()
    context.lineCap = 'butt'
    context.beginPath()
    for (const x of markerXs) {
      for (const y of markerYs) {
        context.moveTo(x - ALIGNMENT_MARKER_RADIUS, y)
        context.lineTo(x + ALIGNMENT_MARKER_RADIUS, y)
        context.moveTo(x, y - ALIGNMENT_MARKER_RADIUS)
        context.lineTo(x, y + ALIGNMENT_MARKER_RADIUS)
      }
    }
    // A white outline keeps the black registration crosses visible on dark artwork.
    context.strokeStyle = '#ffffff'
    context.lineWidth = 4
    context.stroke()
    context.strokeStyle = '#000000'
    context.lineWidth = 2
    context.stroke()
    context.restore()
  }

  if (settings.showGrid && settings.showLabels) {
    const details = {
      originX, originY, outputWidth, outputHeight, verticals, horizontals,
      color: settings.labelColor,
      fontSize: settings.labelFontSize,
    }
    if (settings.labelPlacement === 'inside') {
      drawCellLabels(context, details, settings.labelCorner, thickness)
    } else {
      drawLabels(context, details)
    }
  }
  return {
    outputWidth, outputHeight, contentWidth, contentHeight,
    columnCount: Math.max(0, verticals.length - 1),
    rowCount: Math.max(0, horizontals.length - 1),
  }
}

function drawLabels(context, details) {
  const { originX, originY, outputWidth, outputHeight, verticals, horizontals, color, fontSize } = details
  context.save()
  context.font = `700 ${fontSize * 4 / 3}px "Avenir Next", "Gill Sans", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = color
  context.strokeStyle = 'rgba(255, 253, 246, 0.92)'
  context.lineWidth = 4

  verticals.forEach((x, index) => {
    const label = String(index)
    const labelX = originX + x
    const topY = originY / 2
    const bottomY = outputHeight - originY / 2
    context.strokeText(label, labelX, topY)
    context.fillText(label, labelX, topY)
    context.strokeText(label, labelX, bottomY)
    context.fillText(label, labelX, bottomY)
  })
  horizontals.forEach((y, index) => {
    const label = rowLabel(index)
    const labelY = originY + y
    const leftX = originX / 2
    const rightX = outputWidth - originX / 2
    context.strokeText(label, leftX, labelY)
    context.fillText(label, leftX, labelY)
    context.strokeText(label, rightX, labelY)
    context.fillText(label, rightX, labelY)
  })
  context.restore()
}

function drawCellLabels(context, details, corner, thickness) {
  const { originX, originY, verticals, horizontals, color, fontSize } = details
  const right = corner.endsWith('right')
  const bottom = corner.startsWith('bottom')
  context.save()
  context.font = `700 ${fontSize * 4 / 3}px "Avenir Next", "Gill Sans", sans-serif`
  context.textAlign = right ? 'right' : 'left'
  context.textBaseline = bottom ? 'bottom' : 'top'
  context.fillStyle = color
  context.strokeStyle = 'rgba(255, 253, 246, 0.92)'
  context.lineWidth = 4

  for (let row = 0; row < horizontals.length - 1; row += 1) {
    for (let column = 0; column < verticals.length - 1; column += 1) {
      const left = originX + verticals[column]
      const top = originY + horizontals[row]
      const width = verticals[column + 1] - verticals[column]
      const height = horizontals[row + 1] - horizontals[row]
      const inset = Math.min(6 + thickness / 2, width / 4, height / 4)
      const x = right ? left + width - inset : left + inset
      const y = bottom ? top + height - inset : top + inset
      const label = `${rowLabel(row).toUpperCase()}${column + 1}`
      context.save()
      context.beginPath()
      context.rect(left, top, width, height)
      context.clip()
      context.strokeText(label, x, y)
      context.fillText(label, x, y)
      context.restore()
    }
  }
  context.restore()
}
