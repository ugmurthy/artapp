import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  MAX_SPACING,
  MAX_THICKNESS,
  MIN_LABEL_FONT_SIZE,
  MAX_LABEL_FONT_SIZE,
  normalizeGridSettings,
  renderGridCanvas,
} from '../lib/imageGrid.js'

const FEEDBACK_FORM_URL = import.meta.env.VITE_FEEDBACK_FORM_URL

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
    () => normalizeGridSettings(settings),
    [settings],
  )

  useEffect(() => {
    if (!canvasRef.current) {
      return
    }

    const info = renderGridCanvas(canvasRef.current, sourceImage?.element, normalizedSettings)
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
                onChange={(value) => updateSetting('blankWidth', value)}
              />
              <NumericControl
                id="blank-height"
                label="Height"
                min={MIN_CANVAS_SIDE}
                max={MAX_CANVAS_SIDE}
                value={normalizedSettings.blankHeight}
                disabled={Boolean(sourceImage)}
                onChange={(value) => updateSetting('blankHeight', value)}
              />
            </div>
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>03</span>
              <h2>Grid rules</h2>
            </div>
            <label className="switch-row" htmlFor="show-grid">
              <span>
                <strong>Show grid</strong>
                <small>Switch off lines and labels; keep corner and square alignment markers</small>
              </span>
              <input
                id="show-grid"
                type="checkbox"
                checked={settings.showGrid}
                onChange={(event) => updateSetting('showGrid', event.target.checked)}
              />
            </label>
            <div className="control-grid two-col">
              <NumericControl
                id="horizontal-spacing"
                label="Horizontal spacing"
                min={1}
                max={MAX_SPACING}
                value={normalizedSettings.horizontalSpacing}
                onChange={(value) => updateSetting('horizontalSpacing', value)}
              />
              <NumericControl
                id="vertical-spacing"
                label="Vertical spacing"
                min={1}
                max={MAX_SPACING}
                value={normalizedSettings.verticalSpacing}
                onChange={(value) => updateSetting('verticalSpacing', value)}
              />
              <NumericControl
                id="line-thickness"
                label="Line thickness"
                min={0.5}
                max={MAX_THICKNESS}
                step={0.5}
                value={normalizedSettings.thickness}
                onChange={(value) => updateSetting('thickness', value)}
              />
              <label className="control color-control" htmlFor="grid-color">
                <span>Line color</span>
                <div className="color-input">
                  <input
                    id="grid-color"
                    type="color"
                    value={settings.gridColor}
                    disabled={settings.invertColors}
                    onChange={(event) => updateSetting('gridColor', event.target.value)}
                  />
                  <code>{settings.gridColor}</code>
                </div>
              </label>
            </div>
            <label className="switch-row" htmlFor="invert-colors">
              <span>
                <strong>Invert image colors</strong>
                <small>Each gridline pixel inverts the image color beneath it</small>
              </span>
              <input
                id="invert-colors"
                type="checkbox"
                checked={settings.invertColors}
                onChange={(event) => updateSetting('invertColors', event.target.checked)}
              />
            </label>
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>04</span>
              <h2>Labels & export</h2>
            </div>

            <label className="switch-row" htmlFor="show-labels">
              <span>
                <strong>Show labels</strong>
                <small>Label the outside border or each cell inside the grid</small>
              </span>
              <input
                id="show-labels"
                type="checkbox"
                checked={settings.showLabels}
                onChange={(event) => updateSetting('showLabels', event.target.checked)}
              />
            </label>

            <div className="control-grid two-col">
              <label className="control" htmlFor="label-placement">
                <span>Label placement</span>
                <select
                  id="label-placement"
                  className="text-input"
                  value={settings.labelPlacement}
                  disabled={!settings.showLabels}
                  onChange={(event) => updateSetting('labelPlacement', event.target.value)}
                >
                  <option value="outside">Outside</option>
                  <option value="inside">Inside cells</option>
                </select>
              </label>
              <label className="control" htmlFor="label-corner">
                <span>Inside corner</span>
                <select
                  id="label-corner"
                  className="text-input"
                  value={settings.labelCorner}
                  disabled={!settings.showLabels || settings.labelPlacement !== 'inside'}
                  onChange={(event) => updateSetting('labelCorner', event.target.value)}
                >
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </label>
              <NumericControl
                id="label-font-size"
                label="Label font size"
                min={MIN_LABEL_FONT_SIZE}
                max={MAX_LABEL_FONT_SIZE}
                value={normalizedSettings.labelFontSize}
                disabled={!settings.showLabels}
                suffix="pt"
                onChange={(value) => updateSetting('labelFontSize', value)}
              />
              <label className="control color-control" htmlFor="label-color">
                <span>Label color</span>
                <div className="color-input">
                  <input
                    id="label-color"
                    type="color"
                    value={settings.labelColor}
                    disabled={!settings.showLabels}
                    onChange={(event) => updateSetting('labelColor', event.target.value)}
                  />
                  <code>{settings.labelColor}</code>
                </div>
              </label>
            </div>
            <p className="hint">
              Outside: numbers and row letters. Inside: A1, A2… across, B1, B2… down.
              Use a smaller font for small cells.
            </p>

            <label className="switch-row" htmlFor="show-diagonal-grid">
              <span>
                <strong>Diagnol Grid</strong>
                <small>Add X diagonals inside each grid cell</small>
              </span>
              <input
                id="show-diagonal-grid"
                type="checkbox"
                checked={settings.showDiagonalGrid}
                onChange={(event) => updateSetting('showDiagonalGrid', event.target.checked)}
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
