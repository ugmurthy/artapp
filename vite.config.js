import { defineConfig } from 'vite'

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''

    request.on('data', (chunk) => {
      body += chunk
    })

    request.on('end', () => {
      if (!body) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })

    request.on('error', reject)
  })
}

function createVercelResponse(response) {
  response.status = (statusCode) => {
    response.statusCode = statusCode
    return response
  }

  response.json = (body) => {
    if (!response.headersSent) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
    }

    response.end(JSON.stringify(body))
  }

  return response
}

function apiMiddleware() {
  return {
    name: 'local-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/sketchmentor-chat', async (request, response) => {
        try {
          const { default: handler } = await import('./api/sketchmentor-chat.js')

          request.body = await readJsonBody(request)
          await handler(request, createVercelResponse(response))
        } catch (error) {
          if (!response.headersSent) {
            response.statusCode = error instanceof SyntaxError ? 400 : 500
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
          }

          response.end(
            JSON.stringify({
              error: error instanceof SyntaxError ? 'Request body must be valid JSON.' : error.message,
            }),
          )
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [apiMiddleware()],
})
