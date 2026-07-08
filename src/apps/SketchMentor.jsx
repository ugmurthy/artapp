import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import promptConfig from '../prompts/sketchMentor.json'
import {
  clearEncryptedApiKey,
  hasEncryptedApiKey,
  loadEncryptedApiKey,
  saveEncryptedApiKey,
} from '../lib/secureKeyStore.js'

const DEFAULT_MODEL = 'qwen/qwen3.5-27b'
const MODEL_STORAGE_KEY = 'sketchmentor.model'
const MAX_SKETCH_SIDE = 1800
const SKETCH_JPEG_QUALITY = 0.86
const INITIAL_PROMPT =
  'Please review this sketch and provide constructive feedback for a hobby artist. Focus on what is working, what to improve, and a few practical exercises.'

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded.'))
    image.src = dataUrl
  })
}

async function imageFileToOptimizedDataUrl(file) {
  const sourceDataUrl = await imageFileToDataUrl(file)
  const image = await loadImage(sourceDataUrl)
  const scale = Math.min(1, MAX_SKETCH_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  if (scale === 1 && file.size <= 2.75 * 1024 * 1024) {
    return {
      dataUrl: sourceDataUrl,
      width,
      height,
      optimized: false,
    }
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('This browser could not prepare the sketch image.')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', SKETCH_JPEG_QUALITY),
    width,
    height,
    optimized: true,
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function textPreview(value) {
  return value.length > 130 ? `${value.slice(0, 130)}...` : value
}

function loadStoredModel() {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

function saveStoredModel(value) {
  try {
    const model = value.trim()

    if (model) {
      localStorage.setItem(MODEL_STORAGE_KEY, model)
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures; the model field still works for the current session.
  }
}

async function readErrorMessage(response, fallback) {
  const text = await response.text()
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`

  if (!text) {
    return `${fallback} (${status})`
  }

  try {
    const payload = JSON.parse(text)
    const message = payload.error?.message || payload.error || text
    return `${message} (${status})`
  } catch {
    return `${text} (${status})`
  }
}

function sanitizePdfText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function stripInlineMarkdown(value) {
  return sanitizePdfText(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
}

function formatPdfGeneratedAt() {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
  const dateTime = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)

  return {
    dateTime: sanitizePdfText(dateTime),
    location: sanitizePdfText(timeZone),
  }
}

function markdownToPdfBlocks(markdown) {
  const blocks = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let paragraph = []

  function flushParagraph() {
    const text = stripInlineMarkdown(paragraph.join(' '))

    if (text) {
      blocks.push({ type: 'paragraph', text })
    }

    paragraph = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)

    if (heading) {
      flushParagraph()
      blocks.push({ type: 'heading', level: heading[1].length, text: stripInlineMarkdown(heading[2]) })
      continue
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/)

    if (bullet) {
      flushParagraph()
      blocks.push({ type: 'bullet', text: stripInlineMarkdown(bullet[1]) })
      continue
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)

    if (numbered) {
      flushParagraph()
      blocks.push({ type: 'numbered', label: `${numbered[1]}.`, text: stripInlineMarkdown(numbered[2]) })
      continue
    }

    paragraph.push(line)
  }

  flushParagraph()
  return blocks
}

async function streamSketchFeedback({ apiKey, model, imageDataUrl, history, prompt, signal, onDelta }) {
  const response = await fetch('/api/sketchmentor-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model,
      imageDataUrl,
      systemPrompt: promptConfig.system,
      initialPrompt: INITIAL_PROMPT,
      messages: history,
      userPrompt: prompt,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'SketchMentor could not generate feedback.'))
  }

  if (!response.body) {
    throw new Error('This browser cannot read streaming responses.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    onDelta(decoder.decode(value, { stream: true }))
  }

  const tail = decoder.decode()

  if (tail) {
    onDelta(tail)
  }
}

export default function SketchMentor() {
  const abortRef = useRef(null)
  const fileInputRef = useRef(null)
  const chatPanelRef = useRef(null)
  const [apiKey, setApiKey] = useState('')
  const [rememberKey, setRememberKey] = useState(() => hasEncryptedApiKey())
  const [model, setModel] = useState(() => loadStoredModel())
  const [image, setImage] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState('Upload a sketch, enter your Mesh API key, then request feedback.')
  const [statusTone, setStatusTone] = useState('info')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isImageExpanded, setIsImageExpanded] = useState(true)

  const latestFeedback = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.content || '',
    [messages],
  )

  useEffect(() => {
    let isMounted = true

    loadEncryptedApiKey().then((storedKey) => {
      if (isMounted && storedKey) {
        setApiKey(storedKey)
        setRememberKey(true)
        showStatus('Mesh API key loaded from encrypted browser storage.')
      }
    })

    return () => {
      isMounted = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (isStreaming) {
      scrollFeedbackToBottom('smooth')
    }
  }, [messages, isStreaming])

  function scrollFeedbackToBottom(behavior = 'smooth') {
    window.requestAnimationFrame(() => {
      const panel = chatPanelRef.current

      if (panel) {
        panel.scrollTo({ top: panel.scrollHeight, behavior })
      }
    })
  }

  function showStatus(message, tone = 'info') {
    setStatus(message)
    setStatusTone(tone)
  }

  function showError(message) {
    showStatus(message, 'error')
  }

  async function persistKeyIfNeeded(nextApiKey = apiKey, nextRemember = rememberKey) {
    if (nextRemember && nextApiKey.trim()) {
      await saveEncryptedApiKey(nextApiKey.trim())
    } else {
      await clearEncryptedApiKey()
    }
  }

  async function handleRememberChange(event) {
    const checked = event.target.checked

    setRememberKey(checked)
    await persistKeyIfNeeded(apiKey, checked)
    showStatus(checked ? 'API key will be stored encrypted in this browser.' : 'Stored API key cleared.')
  }

  async function handleApiKeyBlur() {
    await persistKeyIfNeeded()
  }

  function handleModelChange(event) {
    const nextModel = event.target.value

    setModel(nextModel)
    saveStoredModel(nextModel)
  }

  async function handleClearKey() {
    abortRef.current?.abort()
    setApiKey('')
    setRememberKey(false)
    await clearEncryptedApiKey()
    showStatus('Mesh API key removed from this browser.')
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      showError('Please choose an image file such as PNG, JPEG, or WebP.')
      return
    }

    try {
      const preparedImage = await imageFileToOptimizedDataUrl(file)
      setImage({
        dataUrl: preparedImage.dataUrl,
        name: file.name,
        type: preparedImage.optimized ? 'image/jpeg' : file.type,
        size: Math.round((preparedImage.dataUrl.length * 3) / 4),
        originalSize: file.size,
        width: preparedImage.width,
        height: preparedImage.height,
        optimized: preparedImage.optimized,
      })
      setMessages([])
      setIsImageExpanded(true)
      showStatus(
        preparedImage.optimized
          ? `Loaded and optimized ${file.name} to ${preparedImage.width} × ${preparedImage.height}px for feedback.`
          : `Loaded ${file.name}. Ready for feedback.`,
      )
    } catch {
      showError('That image could not be read. Please try a different file.')
    }
  }

  function clearImage() {
    setImage(null)
    setMessages([])
    setIsImageExpanded(true)
    showStatus('Image removed. No sketch or feedback is stored.')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function requestFeedback(prompt = question.trim() || INITIAL_PROMPT) {
    if (!apiKey.trim()) {
      showError('Mesh API key is required before SketchMentor can generate feedback.')
      return
    }

    if (!image) {
      showError('Upload a sketch image before requesting feedback.')
      return
    }

    const userMessage = { role: 'user', content: prompt }
    const assistantMessage = { role: 'assistant', content: '' }
    const history = [...messages, userMessage]
    const abortController = new AbortController()
    let accumulated = ''
    let pending = ''
    let frame = 0

    abortRef.current = abortController
    setIsStreaming(true)
    setIsImageExpanded(false)
    setQuestion('')
    showStatus('Analyzing sketch...')
    setMessages([...history, assistantMessage])
    scrollFeedbackToBottom()

    const flush = () => {
      frame = 0

      if (!pending) {
        return
      }

      accumulated += pending
      pending = ''
      setMessages([...history, { role: 'assistant', content: accumulated }])
    }

    try {
      await persistKeyIfNeeded()
      await streamSketchFeedback({
        apiKey: apiKey.trim(),
        model: model.trim() || DEFAULT_MODEL,
        imageDataUrl: image.dataUrl,
        history,
        prompt,
        signal: abortController.signal,
        onDelta: (delta) => {
          pending += delta

          if (!frame) {
            frame = window.setTimeout(flush, 70)
          }
        },
      })

      if (frame) {
        window.clearTimeout(frame)
      }

      flush()
      showStatus('Feedback complete. You can ask a follow-up or download a PDF.')
    } catch (error) {
      if (frame) {
        window.clearTimeout(frame)
      }

      if (error.name === 'AbortError') {
        flush()
        showStatus('Generation stopped.')
        return
      }

      setMessages(messages)
      showError(error.message)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
  }

  async function downloadPdf() {
    if (!image || !latestFeedback) {
      showError('Generate feedback before downloading a PDF.')
      return
    }

    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 48
      const usableWidth = pageWidth - margin * 2
      const bottomMargin = 58
      const generatedAt = formatPdfGeneratedAt()
      let cursorY = margin

      function addPageIfNeeded(heightNeeded) {
        if (cursorY + heightNeeded <= pageHeight - bottomMargin) {
          return
        }

        pdf.addPage()
        cursorY = margin
      }

      function drawWrappedText(text, options = {}) {
        const {
          font = 'normal',
          fontSize = 11,
          lineHeight = 15,
          indent = 0,
          gapAfter = 8,
          prefix = '',
        } = options
        const prefixWidth = prefix ? 18 : 0
        const textWidth = usableWidth - indent - prefixWidth

        pdf.setFont('helvetica', font)
        pdf.setFontSize(fontSize)

        const lines = pdf.splitTextToSize(text, textWidth)
        addPageIfNeeded(Math.max(lineHeight, lines.length * lineHeight) + gapAfter)

        if (prefix) {
          pdf.text(prefix, margin + indent, cursorY)
        }

        pdf.text(lines, margin + indent + prefixWidth, cursorY)
        cursorY += lines.length * lineHeight + gapAfter
      }

      function drawFooter() {
        const totalPages = pdf.getNumberOfPages()

        for (let index = 1; index <= totalPages; index += 1) {
          pdf.setPage(index)
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(120)
          pdf.text(`SketchMentor - Page ${index} of ${totalPages}`, margin, pageHeight - 26)
          pdf.setTextColor(0)
        }
      }

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(22)
      pdf.text('SketchMentor Feedback', margin, cursorY)
      cursorY += 26

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(90)
      pdf.text(`Image: ${sanitizePdfText(image.name)}`, margin, cursorY)
      cursorY += 14
      pdf.text(`Generated: ${generatedAt.dateTime}`, margin, cursorY)
      cursorY += 14
      pdf.text(`Location: ${generatedAt.location}`, margin, cursorY)
      cursorY += 20
      pdf.setTextColor(0)

      try {
        const properties = pdf.getImageProperties(image.dataUrl)
        const imageHeight = Math.min(230, (properties.height * usableWidth) / properties.width)
        const imageWidth = (properties.width * imageHeight) / properties.height

        addPageIfNeeded(imageHeight + 28)
        pdf.addImage(image.dataUrl, properties.fileType, margin, cursorY, imageWidth, imageHeight)
        cursorY += imageHeight + 28
      } catch {
        pdf.text('Image preview could not be embedded in this PDF.', margin, cursorY)
        cursorY += 20
      }

      drawWrappedText('Feedback', { font: 'bold', fontSize: 15, lineHeight: 18, gapAfter: 6 })

      for (const block of markdownToPdfBlocks(latestFeedback)) {
        if (block.type === 'heading') {
          const size = block.level === 1 ? 15 : 13
          drawWrappedText(block.text, { font: 'bold', fontSize: size, lineHeight: size + 4, gapAfter: 5 })
          continue
        }

        if (block.type === 'bullet') {
          drawWrappedText(block.text, { indent: 12, prefix: '-', gapAfter: 5 })
          continue
        }

        if (block.type === 'numbered') {
          drawWrappedText(block.text, { indent: 8, prefix: block.label, gapAfter: 5 })
          continue
        }

        drawWrappedText(block.text)
      }

      drawFooter()
      downloadBlob(pdf.output('blob'), `sketchmentor-${image.name.replace(/\.[^.]+$/, '') || 'feedback'}.pdf`)
      showStatus('PDF downloaded. The sketch and feedback remain only in this browser session.')
    } catch (error) {
      showError(`Could not create PDF: ${error.message}`)
    }
  }

  return (
    <main className="app-shell">
      <section className="sketch-workspace" aria-labelledby="sketchmentor-title">
        <div className="preview-panel sketch-main-panel">
          <div className="panel-heading">
            <div className="brand-lockup">
              <p className="section-kicker">SketchMentor</p>
              <h1 id="sketchmentor-title">Sketch feedback studio</h1>
              <p>Upload a sketch, stream constructive feedback through Mesh, then ask follow-up questions.</p>
            </div>
          </div>

          <button
            type="button"
            className={`sketch-stage ${image && !isImageExpanded ? 'compact' : ''}`}
            onClick={() => image && setIsImageExpanded((current) => !current)}
            aria-label={image ? (isImageExpanded ? 'Shrink sketch preview' : 'Expand sketch preview') : undefined}
          >
            {image ? (
              <img src={image.dataUrl} alt={`Uploaded sketch ${image.name}`} />
            ) : (
              <div className="empty-sketch">
                <strong>No sketch loaded</strong>
                <span>Images are sent to Mesh only when you request feedback.</span>
              </div>
            )}
          </button>

          <div className="chat-panel" ref={chatPanelRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-note">Feedback and follow-up discussion will appear here.</div>
            ) : (
              messages.map((message, index) => (
                <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === 'user' ? 'You' : 'SketchMentor'}</span>
                  {message.role === 'assistant' ? (
                    message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : <p>Analyzing...</p>
                  ) : (
                    <p>{textPreview(message.content)}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="controls-panel" aria-label="SketchMentor controls">
          <section className="control-group upload-group">
            <div className="group-title">
              <span>01</span>
              <h2>Sketch</h2>
            </div>

            <label className="file-drop" htmlFor="sketch-upload">
              <input
                ref={fileInputRef}
                id="sketch-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                onChange={handleFileChange}
              />
              <strong>{image ? 'Replace sketch' : 'Choose sketch'}</strong>
              <small>PNG,JPEG,WebP. Nothing is stored by this app.</small>
            </label>

            {image && (
              <div className="source-card">
                <div>
                  <span>Loaded image</span>
                  <strong>{image.name}</strong>
                  <small>
                    {image.width} × {image.height}px · {Math.round(image.size / 1024).toLocaleString()} KB
                    {image.optimized ? ' optimized' : ''}
                  </small>
                </div>
                <button type="button" className="ghost-button" onClick={clearImage} disabled={isStreaming}>
                  Remove
                </button>
              </div>
            )}
          </section>

          <section className="control-group">
            <div className="group-title title-with-action">
              <div>
                <span>02</span>
                <h2>Mesh</h2>
              </div>
              {!apiKey.trim() && (
                <a href="https://meshapi.ai/" target="_blank" rel="noreferrer">
                  Get API Key
                </a>
              )}
            </div>

            <label className="control" htmlFor="mesh-api-key">
              <span>API key</span>
              <input
                id="mesh-api-key"
                className="text-input"
                type="password"
                value={apiKey}
                onBlur={handleApiKeyBlur}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Mesh API key"
                autoComplete="off"
              />
            </label>

            <label className="control" htmlFor="mesh-model">
              <span>Model</span>
              <input
                id="mesh-model"
                className="text-input"
                type="text"
                value={model}
                onChange={handleModelChange}
              />
            </label>

            <label className="switch-row remember-row" htmlFor="remember-api-key">
              <span>
                Remember key (stored encrypted)
              </span>
              <input id="remember-api-key" type="checkbox" checked={rememberKey} onChange={handleRememberChange} />
            </label>

            <button type="button" className="ghost-button full-width" onClick={handleClearKey}>
              Clear stored key
            </button>
          </section>

          <section className="control-group">
            <div className="group-title">
              <span>03</span>
              <h2>Feedback</h2>
            </div>

            <button
              type="button"
              className="download-button"
              onClick={() => requestFeedback(INITIAL_PROMPT)}
              disabled={isStreaming}
            >
              Get feedback
            </button>

            <label className="control follow-up-control" htmlFor="follow-up-question">
              <span>Follow-up question</span>
              <textarea
                id="follow-up-question"
                value={question}
                rows={2}
                disabled={isStreaming}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about proportions,values, or how to practice the next step."
              />
            </label>

            <div className="export-actions">
              <button
                type="button"
                className="feedback-link action-link"
                onClick={() => requestFeedback()}
                disabled={isStreaming || !question.trim()}
              >
                Ask follow-up
              </button>
              <button type="button" className="feedback-link action-link" onClick={downloadPdf} disabled={isStreaming}>
                Download PDF
              </button>
              {isStreaming && (
                <button type="button" className="ghost-button full-width" onClick={stopStreaming}>
                  Stop generating
                </button>
              )}
            </div>
          </section>

          <p className={`status-note ${statusTone === 'error' ? 'error' : ''}`} aria-live="polite">
            {status}
          </p>
        </aside>
      </section>
    </main>
  )
}
