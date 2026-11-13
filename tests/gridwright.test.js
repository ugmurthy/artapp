// Browser regression test. Requires agent-browser and its Chromium installation on PATH.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { createServer } from 'vite'

const exec = promisify(execFile)

test('Gridwright renders centered whole cells with corner alignment markers', { timeout: 60000 }, async (t) => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 5175 } })
  const session = `grid-test-${process.pid}`
  async function browser(...args) {
    const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 20000 })
    const response = JSON.parse(stdout)
    assert.equal(response.success, true, response.error)
    return response.data.result
  }
  t.after(async () => {
    try {
      await browser('close')
    } finally {
      await server.close()
    }
  })
  await server.listen()
  await browser('open', `http://127.0.0.1:${server.httpServer.address().port}/gridwright`)
  await browser('wait', 'canvas')
  assert.equal(await browser('eval', "document.getElementById('label-font-size').value"), '24')

  const cases = [
    { name: 'default with labels', width: 1024, height: 1024, x: 100, y: 100,
      labels: true, bounds: [12, 12, 1012, 1012], counts: [10, 10] },
    { name: 'unequal spacing and odd remainders', width: 357, height: 267, x: 100, y: 80,
      bounds: [28.5, 13.5, 328.5, 253.5], counts: [3, 3], squarePair: [[268.5, 13.5], [268.5, 253.5]] },
    { name: 'diagonals and thick lines with labels', width: 357, height: 267, x: 100, y: 80,
      labels: true, diagonal: true, thickness: 10, bounds: [28.5, 13.5, 328.5, 253.5], counts: [3, 3],
      squarePair: [[268.5, 13.5], [268.5, 253.5]] },
    { name: 'exact fit', width: 300, height: 240, x: 100, y: 80,
      bounds: [0, 0, 300, 240], counts: [3, 3], squarePair: [[240, 0], [240, 240]] },
    { name: 'one whole cell', width: 103, height: 83, x: 100, y: 80,
      bounds: [1.5, 1.5, 101.5, 81.5], counts: [1, 1], squarePair: [[81.5, 1.5], [81.5, 81.5]] },
    { name: 'portrait image with square alignment markers', width: 267, height: 357, x: 80, y: 100,
      image: true, invert: true, labels: true, diagonal: true,
      bounds: [13.5, 28.5, 253.5, 328.5], counts: [3, 3], squarePair: [[13.5, 268.5], [253.5, 268.5]] },
    { name: 'landscape canvas with a taller grid', width: 357, height: 347, x: 100, y: 160,
      bounds: [28.5, 13.5, 328.5, 333.5], counts: [3, 2], squarePair: [[28.5, 313.5], [328.5, 313.5]] },
    { name: 'non-square canvas with a square grid needs no extra markers', width: 357, height: 367, x: 100, y: 150,
      bounds: [28.5, 33.5, 328.5, 333.5], counts: [3, 2] },
    { name: 'no whole column fits', width: 99, height: 267, x: 100, y: 80,
      labels: true, diagonal: true, counts: [0, 0] },
    { name: 'no whole row fits', width: 357, height: 79, x: 100, y: 80,
      counts: [0, 0] },
    { name: 'uploaded image with inverted diagonals', width: 357, height: 267, x: 100, y: 80,
      image: true, invert: true, labels: true, diagonal: true,
      bounds: [28.5, 13.5, 328.5, 253.5], counts: [3, 3], squarePair: [[268.5, 13.5], [268.5, 253.5]] },
  ]

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await browser('eval', `(${async (s) => {
        const remove = document.querySelector('.source-card button')
        if (remove) remove.click()
        function setValue(id, value) {
          const input = document.getElementById(id)
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        setValue('blank-width', s.width)
        setValue('blank-height', s.height)
        setValue('vertical-spacing', s.x)
        setValue('horizontal-spacing', s.y)
        setValue('line-thickness', s.thickness ?? 4)
        for (const [id, checked] of [['show-labels', s.labels], ['show-diagonal-grid', s.diagonal], ['invert-colors', s.invert]]) {
          const input = document.getElementById(id)
          if (input.checked !== Boolean(checked)) input.click()
        }
        setValue('grid-color', '#000000')
        if (s.image) {
          const source = document.createElement('canvas')
          source.width = s.width
          source.height = s.height
          const ctx = source.getContext('2d')
          ctx.fillStyle = 'rgb(33, 99, 165)'
          ctx.fillRect(0, 0, s.width, s.height)
          const blob = await new Promise(resolve => source.toBlob(resolve))
          const transfer = new DataTransfer()
          transfer.items.add(new File([blob], 'test-image.png', { type: 'image/png' }))
          const upload = document.getElementById('image-upload')
          upload.files = transfer.files
          upload.dispatchEvent(new Event('change', { bubbles: true }))
          while (!document.querySelector('.source-card')) await new Promise(resolve => setTimeout(resolve, 10))
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }})(${JSON.stringify(scenario)})`)

      const result = await browser('eval', `(${(s) => {
        const canvas = document.querySelector('canvas')
        const margin = s.labels ? 56 : 18
        const context = canvas.getContext('2d')
        const data = context.getImageData(margin, margin, s.width, s.height).data
        const background = s.image ? [33, 99, 165] : [255, 255, 255]
        const corners = s.bounds ? [
          [s.bounds[0], s.bounds[1]], [s.bounds[2], s.bounds[1]],
          [s.bounds[0], s.bounds[3]], [s.bounds[2], s.bounds[3]],
          ...(s.squarePair ?? []),
        ] : []
        let changed = 0
        let gutterPixels = 0
        for (let y = 0; y < s.height; y++) {
          for (let x = 0; x < s.width; x++) {
            const i = (y * s.width + x) * 4
            if (background.every((value, channel) => data[i + channel] === value)) continue
            changed++
            if (corners.some(([cx, cy]) => Math.abs(x + 0.5 - cx) <= 18 && Math.abs(y + 0.5 - cy) <= 18)) continue
            if (!s.bounds || x + 1 <= s.bounds[0] || y + 1 <= s.bounds[1] || x >= s.bounds[2] || y >= s.bounds[3]) gutterPixels++
          }
        }
        const pixel = (x, y) => Array.from(data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 3))
        const linePixels = s.bounds ? Array.from({ length: s.counts[0] + 1 }, (_, i) =>
          pixel(i === s.counts[0] ? Math.floor(s.bounds[2]) - 1 : Math.ceil(s.bounds[0] + i * s.x), Math.ceil(s.bounds[1] + s.y / 3))) : []
        const rowPixels = s.bounds ? Array.from({ length: s.counts[1] + 1 }, (_, i) =>
          pixel(Math.ceil(s.bounds[0] + s.x / 3), i === s.counts[1] ? Math.floor(s.bounds[3]) - 1 : Math.ceil(s.bounds[1] + i * s.y))) : []
        const markerPixels = corners.flatMap(([x, y]) => [[-13, 0], [13, 0], [0, -13], [0, 13]].map(([dx, dy]) =>
          Array.from(context.getImageData(Math.floor(margin + x + dx), Math.floor(margin + y + dy), 1, 1).data)))
        return { size: [canvas.width, canvas.height], meta: document.querySelector('.preview-meta').textContent,
          changed, gutterPixels, linePixels, rowPixels, markerPixels }
      }})(${JSON.stringify(scenario)})`)
      const margin = scenario.labels ? 112 : 36
      assert.deepEqual(result.size, [scenario.width + margin, scenario.height + margin])
      assert.ok(result.meta.includes(`${scenario.counts[0]} columns · ${scenario.counts[1]} rows`))
      assert.equal(result.gutterPixels, 0, 'unused strips stay untouched except for corner markers')
      if (scenario.bounds) {
        assert.ok(result.changed > 0, 'whole cells must be drawn')
        assert.equal(result.markerPixels.length, (4 + (scenario.squarePair?.length ?? 0)) * 4)
        for (const pixel of result.markerPixels) assert.deepEqual(pixel, [0, 0, 0, 255], 'all four arms of every corner and square marker must be visible')
        const color = scenario.invert ? [222, 156, 90] : [0, 0, 0]
        for (const pixel of [...result.linePixels, ...result.rowPixels]) assert.deepEqual(pixel, color)
      } else {
        assert.equal(result.changed, 0, 'no lines when a complete cell cannot fit')
      }

      const hidden = await browser('eval', `(${async (s) => {
        const canvas = document.querySelector('canvas')
        const original = canvas.toDataURL()
        const toggle = document.getElementById('show-grid')
        const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        toggle.click()
        await settle()
        const margin = s.labels ? 56 : 18
        const context = canvas.getContext('2d')
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data
        const corners = s.bounds ? [
          [s.bounds[0], s.bounds[1]], [s.bounds[2], s.bounds[1]],
          [s.bounds[0], s.bounds[3]], [s.bounds[2], s.bounds[3]],
          ...(s.squarePair ?? []),
        ].map(([x, y]) => [x + margin, y + margin]) : []
        let unexpectedPixels = 0
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (corners.some(([cx, cy]) => Math.abs(x + 0.5 - cx) <= 18 && Math.abs(y + 0.5 - cy) <= 18)) continue
            const inContent = x >= margin && y >= margin && x < margin + s.width && y < margin + s.height
            const background = inContent ? (s.image ? [33, 99, 165] : [255, 255, 255]) : [255, 253, 246]
            const i = (y * canvas.width + x) * 4
            if (background.some((value, channel) => data[i + channel] !== value) || data[i + 3] !== 255) unexpectedPixels++
          }
        }
        const markerPixels = corners.flatMap(([x, y]) => [[-13, 0], [13, 0], [0, -13], [0, 13]].map(([dx, dy]) =>
          Array.from(context.getImageData(Math.floor(x + dx), Math.floor(y + dy), 1, 1).data)))
        const size = [canvas.width, canvas.height]
        toggle.click()
        await settle()
        return { unexpectedPixels, markerPixels, size, restored: canvas.toDataURL() === original }
      }})(${JSON.stringify(scenario)})`)
      assert.equal(hidden.unexpectedPixels, 0, 'hiding the grid removes all lines, diagonals, and labels without changing the background')
      assert.deepEqual(hidden.markerPixels, result.markerPixels, 'corner markers stay at the established grid corners')
      assert.deepEqual(hidden.size, result.size, 'hiding the grid keeps output dimensions and alignment unchanged')
      assert.equal(hidden.restored, true, 'showing the grid again restores the exact original output')
    })
  }
})
