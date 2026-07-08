const MESH_CHAT_COMPLETIONS_URL = 'https://api.meshapi.ai/v1/chat/completions'
const MAX_IMAGE_DATA_URL_LENGTH = 12 * 1024 * 1024

function json(response, statusCode, body) {
  response.status(statusCode).json(body)
}

function isValidImageDataUrl(value) {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: normalizeText(message.content),
    }))
    .filter((message) => message.content)
}

function buildMeshMessages({ imageDataUrl, systemPrompt, initialPrompt, userPrompt, messages }) {
  const history = normalizeMessages(messages)
  const hasInitialPrompt = history.some((message) => message.role === 'user' && message.content === userPrompt)
  const chatHistory = hasInitialPrompt ? history : [...history, { role: 'user', content: userPrompt }]

  return [
    {
      role: 'system',
      content: normalizeText(systemPrompt, 'Give constructive sketch feedback in markdown.'),
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: normalizeText(initialPrompt, 'Please review this sketch.'),
        },
        {
          type: 'image_url',
          image_url: {
            url: imageDataUrl,
            detail: 'auto',
          },
        },
      ],
    },
    ...chatHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

function extractDelta(payload) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const choice = payload.choices?.[0]

  return (
    choice?.delta?.content ||
    choice?.message?.content ||
    payload.delta?.content ||
    payload.content ||
    ''
  )
}

async function readMeshError(meshResponse) {
  const fallback = `Mesh request failed with status ${meshResponse.status}.`
  const text = await meshResponse.text()

  if (!text) {
    return fallback
  }

  try {
    const payload = JSON.parse(text)
    return payload.error?.message || payload.error || text
  } catch {
    return text
  }
}

async function pipeMeshStream(meshResponse, response) {
  const reader = meshResponse.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith(':')) {
        continue
      }

      const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed

      if (data === '[DONE]') {
        response.end()
        return
      }

      try {
        const delta = extractDelta(JSON.parse(data))

        if (delta) {
          response.write(delta)
        }
      } catch {
        response.write(data)
      }
    }
  }

  const tail = decoder.decode()

  if (tail) {
    buffer += tail
  }

  if (buffer.trim()) {
    const data = buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim()

    if (data && data !== '[DONE]') {
      try {
        const delta = extractDelta(JSON.parse(data))

        if (delta) {
          response.write(delta)
        }
      } catch {
        response.write(data)
      }
    }
  }

  response.end()
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    json(response, 405, { error: 'Method not allowed.' })
    return
  }

  const apiKey = normalizeText(request.body?.apiKey)
  const model = normalizeText(request.body?.model, 'openai/gpt-4o')
  const imageDataUrl = request.body?.imageDataUrl
  const userPrompt = normalizeText(request.body?.userPrompt, 'Please review this sketch.')

  if (!apiKey) {
    json(response, 400, { error: 'Mesh API key is required.' })
    return
  }

  if (!isValidImageDataUrl(imageDataUrl)) {
    json(response, 400, { error: 'A base64 image data URL is required.' })
    return
  }

  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    json(response, 413, { error: 'Image is too large. Try a smaller export under about 9 MB.' })
    return
  }

  try {
    const meshResponse = await fetch(MESH_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: buildMeshMessages({
          imageDataUrl,
          systemPrompt: request.body?.systemPrompt,
          initialPrompt: request.body?.initialPrompt,
          userPrompt,
          messages: request.body?.messages,
        }),
      }),
    })

    if (!meshResponse.ok) {
      json(response, meshResponse.status, { error: await readMeshError(meshResponse) })
      return
    }

    if (!meshResponse.body) {
      json(response, 502, { error: 'Mesh did not return a streaming response.' })
      return
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store, no-transform',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
    })

    await pipeMeshStream(meshResponse, response)
  } catch (error) {
    if (!response.headersSent) {
      json(response, 500, { error: `Could not reach Mesh: ${error.message}` })
      return
    }

    response.end()
  }
}
