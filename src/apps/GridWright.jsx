import { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_SETTINGS = {
  blankWidth: 1024,
  blankHeight: 1024,
  horizontalSpacing: 100,
  verticalSpacing: 100,
  gridColor: '#c8c6c6',
  thickness: 2,
  showLabels: true,
}

const LABEL_MARGIN = 56
const MAX_CANVAS_SIDE = 8000
const MIN_CANVAS_SIDE = 16
const MAX_SPACING = 4000
const MAX_THICKNESS = 80
const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL

function clampNumber(value, min, max, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(min, number))
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback))
}

function gridPositions(length, spacing) {
  const positions = []
  const safeLength = Math.max(1, Math.round(length))
  const safeSpacing = Math.max(1, Math.round(spacing))

  for (let position = 0; position <= safeLength; position += safeSpacing) {
    positions.push(position)
  }

  if (positions[positions.length - 1] !== safeLength) {
    positions.push(safeLength)
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

function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'image'
}

function reportUsageEvent(event, onStats) {
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((stats) => {
      if (stats) {
        onStats(stats)
      }
    })
    .catch(() => {})
}

function renderGridCanvas(canvas, sourceImage, settings) {
  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  const contentWidth = sourceImage
    ? sourceImage.width
    : clampInteger(settings.blankWidth, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankWidth)
  const contentHeight = sourceImage
    ? sourceImage.height
    : clampInteger(settings.blankHeight, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankHeight)
  const margin = settings.showLabels ? LABEL_MARGIN : 0
  const outputWidth = contentWidth + margin * 2
  const outputHeight = contentHeight + margin * 2
  const originX = margin
  const originY = margin
  const horizontalSpacing = clampInteger(
    settings.horizontalSpacing,
    1,
    MAX_SPACING,
    DEFAULT_SETTINGS.horizontalSpacing,
  )
  const verticalSpacing = clampInteger(
    settings.verticalSpacing,
    1,
    MAX_SPACING,
    DEFAULT_SETTINGS.verticalSpacing,
  )
  const thickness = clampNumber(settings.thickness, 0.5, MAX_THICKNESS, DEFAULT_SETTINGS.thickness)
  const verticals = gridPositions(contentWidth, verticalSpacing)
  const horizontals = gridPositions(contentHeight, horizontalSpacing)

  canvas.width = outputWidth
  canvas.height = outputHeight

  context.clearRect(0, 0, outputWidth, outputHeight)
  context.fillStyle = '#fffdf6'
  context.fillRect(0, 0, outputWidth, outputHeight)

  if (sourceImage) {
    context.drawImage(sourceImage.element, originX, originY, contentWidth, contentHeight)
  } else {
    context.fillStyle = '#ffffff'
    context.fillRect(originX, originY, contentWidth, contentHeight)
  }

  context.save()
  context.strokeStyle = settings.gridColor
  context.lineWidth = thickness
  context.lineCap = 'butt'
  context.lineJoin = 'miter'
  context.beginPath()

  for (const x of verticals) {
    const canvasX = originX + x
    context.moveTo(canvasX, originY)
    context.lineTo(canvasX, originY + contentHeight)
  }

  for (const y of horizontals) {
    const canvasY = originY + y
    context.moveTo(originX, canvasY)
    context.lineTo(originX + contentWidth, canvasY)
  }

  context.stroke()
  context.restore()

  if (settings.showLabels) {
    drawLabels(context, {
      contentWidth,
      contentHeight,
      originX,
      originY,
      outputWidth,
      outputHeight,
      verticals,
      horizontals,
      color: '#000000',
    })
  }

  return {
    outputWidth,
    outputHeight,
    contentWidth,
    contentHeight,
    columnCount: Math.max(0, verticals.length - 1),
    rowCount: Math.max(0, horizontals.length - 1),
  }
}

function drawLabels(context, details) {
  const {
    contentWidth,
    contentHeight,
    originX,
    originY,
    outputWidth,
    outputHeight,
    verticals,
    horizontals,
    color,
  } = details

  context.save()
  context.font = '700 15px "Avenir Next", "Gill Sans", sans-serif'
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

  context.strokeStyle = color
  context.lineWidth = 1.25
  context.strokeRect(originX - 0.5, originY - 0.5, contentWidth + 1, contentHeight + 1)
  context.restore()
}

function NumericControl({ id, label, value, min, max, step = 1, disabled, suffix = 'px', onChange }) {
  return (
    <label className="control" htmlFor={id}>
      <span>{label}</span>
      <div className="number-input">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <small>{suffix}</small>
      </div>
    </label>
  )
}

export default function GridWright() {
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const objectUrlRef = useRef(null)
  const hasTrackedVisitRef = useRef(false)
  const [sourceImage, setSourceImage] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [renderInfo, setRenderInfo] = useState(null)
  const [usageStats, setUsageStats] = useState(null)
  const [message, setMessage] = useState('Grid-only mode is ready. Upload an image anytime.')

  const mode = sourceImage ? 'Image overlay' : 'Grid-only template'

  const normalizedSettings = useMemo(
    () => ({
      ...settings,
      blankWidth: clampInteger(settings.blankWidth, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankWidth),
      blankHeight: clampInteger(settings.blankHeight, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankHeight),
      horizontalSpacing: clampInteger(settings.horizontalSpacing, 1, MAX_SPACING, DEFAULT_SETTINGS.horizontalSpacing),
      verticalSpacing: clampInteger(settings.verticalSpacing, 1, MAX_SPACING, DEFAULT_SETTINGS.verticalSpacing),
      thickness: clampNumber(settings.thickness, 0.5, MAX_THICKNESS, DEFAULT_SETTINGS.thickness),
    }),
    [settings],
  )

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    const info = renderGridCanvas(canvasRef.current, sourceImage, normalizedSettings)
    setRenderInfo(info)
  }, [sourceImage, normalizedSettings])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (hasTrackedVisitRef.current) {
      return
    }

    hasTrackedVisitRef.current = true
    reportUsageEvent('visit', setUsageStats)
  }, [])

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function updateNumberSetting(key, value, min, max, fallback) {
    updateSetting(key, clampNumber(value, min, max, fallback))
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file such as PNG, JPEG, or WebP.')
      return
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    const url = URL.createObjectURL(file)
    objectUrlRef.current = url

    const image = new Image()

    image.onload = () => {
      if (objectUrlRef.current !== url) {
        URL.revokeObjectURL(url)
        return
      }

      setSourceImage({
        element: image,
        url,
        name: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
      setMessage(`Loaded ${file.name} at ${image.naturalWidth} × ${image.naturalHeight}px.`)
    }

    image.onerror = () => {
      if (objectUrlRef.current === url) {
        URL.revokeObjectURL(url)
        objectUrlRef.current = null
      }

      setSourceImage(null)
      setMessage('That image could not be loaded. Please try a different file.')
    }

    image.src = url
  }

  function clearImage() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    setSourceImage(null)
    setMessage('Image removed. Grid-only mode is active.')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage('Download failed because the browser could not create a PNG.')
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const prefix = sourceImage
        ? `grid-${baseName(sourceImage.name)}`
        : `grid-template-${renderInfo?.contentWidth ?? settings.blankWidth}x${
            renderInfo?.contentHeight ?? settings.blankHeight
          }`

      link.href = url
      link.download = `${prefix}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      reportUsageEvent('download', setUsageStats)
      setMessage('PNG downloaded with the current grid settings.')
    }, 'image/png')
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <div className="preview-panel">
          <div className="panel-heading">
            <div className="brand-lockup">
              <p className="section-kicker">Gridwright</p>
              <h1 id="app-title">Image gridline processor</h1>
              <p>
                Upload artwork or start from a blank sheet. Configure spacing, labels, and PNG export
                without sending files to a server.
              </p>
            </div>
            <div className="header-pills">
              <div className="mode-pill" aria-label={`Current mode: ${mode}`}>
                <span>Mode</span>
                <strong>{mode}</strong>
              </div>
              <div className="output-pill">
                {renderInfo ? `${renderInfo.outputWidth} × ${renderInfo.outputHeight}px PNG` : 'Preparing canvas'}
              </div>
              {usageStats && (
                <div className="stats-pill" aria-label="Usage stats">
                  <span>{usageStats.visits.toLocaleString()} visits</span>
                  <span>{usageStats.downloads.toLocaleString()} downloads</span>
                </div>
              )}
            </div>
          </div>

          <div className="canvas-stage">
            <canvas ref={canvasRef} aria-label="Processed grid preview" />
          </div>

          <div className="preview-meta" aria-live="polite">
            <span>{message}</span>
            {renderInfo && (
              <span>
                {renderInfo.columnCount} columns · {renderInfo.rowCount} rows
              </span>
            )}
          </div>
        </div>

        <aside className="controls-panel" aria-label="Grid settings">
          <section className="control-group upload-group">
            <div className="group-title">
              <span>01</span>
              <h2>Source</h2>
            </div>

            <label className="file-drop" htmlFor="image-upload">
              <input
                ref={fileInputRef}
                id="image-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                onChange={handleFileChange}
              />
              <strong>{sourceImage ? 'Replace image' : 'Choose image'}</strong>
              <span>PNG, JPEG, or WebP — processed locally</span>
            </label>

            {sourceImage ? (
              <div className="source-card">
                <div>
                  <span>Loaded image</span>
                  <strong>{sourceImage.name}</strong>
                  <small>{sourceImage.width} × {sourceImage.height}px</small>
                </div>
                <button type="button" className="ghost-button" onClick={clearImage}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="empty-note">
                No image selected. The app will export a blank white grid template.
              </div>
            )}
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>02</span>
              <h2>Blank canvas</h2>
            </div>
            <p className="hint">
              Used only when no image is loaded. Uploaded images keep their original dimensions.
            </p>
            <div className="control-grid two-col">
              <NumericControl
                id="blank-width"
                label="Width"
                min={MIN_CANVAS_SIDE}
                max={MAX_CANVAS_SIDE}
                value={normalizedSettings.blankWidth}
                disabled={Boolean(sourceImage)}
                onChange={(value) => updateNumberSetting('blankWidth', value, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankWidth)}
              />
              <NumericControl
                id="blank-height"
                label="Height"
                min={MIN_CANVAS_SIDE}
                max={MAX_CANVAS_SIDE}
                value={normalizedSettings.blankHeight}
                disabled={Boolean(sourceImage)}
                onChange={(value) => updateNumberSetting('blankHeight', value, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, DEFAULT_SETTINGS.blankHeight)}
              />
            </div>
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>03</span>
              <h2>Grid rules</h2>
            </div>
            <div className="control-grid two-col">
              <NumericControl
                id="horizontal-spacing"
                label="Horizontal spacing"
                min={1}
                max={MAX_SPACING}
                value={normalizedSettings.horizontalSpacing}
                onChange={(value) => updateNumberSetting('horizontalSpacing', value, 1, MAX_SPACING, DEFAULT_SETTINGS.horizontalSpacing)}
              />
              <NumericControl
                id="vertical-spacing"
                label="Vertical spacing"
                min={1}
                max={MAX_SPACING}
                value={normalizedSettings.verticalSpacing}
                onChange={(value) => updateNumberSetting('verticalSpacing', value, 1, MAX_SPACING, DEFAULT_SETTINGS.verticalSpacing)}
              />
              <NumericControl
                id="line-thickness"
                label="Line thickness"
                min={0.5}
                max={MAX_THICKNESS}
                step={0.5}
                value={normalizedSettings.thickness}
                onChange={(value) => updateNumberSetting('thickness', value, 0.5, MAX_THICKNESS, DEFAULT_SETTINGS.thickness)}
              />
              <label className="control color-control" htmlFor="grid-color">
                <span>Line color</span>
                <div className="color-input">
                  <input
                    id="grid-color"
                    type="color"
                    value={settings.gridColor}
                    onChange={(event) => updateSetting('gridColor', event.target.value)}
                  />
                  <code>{settings.gridColor}</code>
                </div>
              </label>
            </div>
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>04</span>
              <h2>Labels & export</h2>
            </div>

            <label className="switch-row" htmlFor="show-labels">
              <span>
                <strong>Border labels</strong>
                <small>Numbers on top/bottom, letters on left/right</small>
              </span>
              <input
                id="show-labels"
                type="checkbox"
                checked={settings.showLabels}
                onChange={(event) => updateSetting('showLabels', event.target.checked)}
              />
            </label>

            <div className="export-actions">
              <button type="button" className="download-button" onClick={handleDownload}>
                Download PNG
              </button>
              {FEEDBACK_FORM_URL && (
                <a className="feedback-link" href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
                  Send feedback
                </a>
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}
