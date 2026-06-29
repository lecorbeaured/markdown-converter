const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const XLSX = require('xlsx')
const { parse } = require('csv-parse/sync')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const contentType = event.headers['content-type'] || ''
    if (!contentType.includes('multipart/form-data')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Expected multipart/form-data' }) }
    }

    // Parse multipart manually
    const boundary = contentType.split('boundary=')[1]
    const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    const parts = parseMultipart(body, boundary)
    const filePart = parts.find(p => p.name === 'file')

    if (!filePart) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No file found' }) }
    }

    const filename = filePart.filename || 'file'
    const ext = filename.split('.').pop().toLowerCase()
    const buffer = filePart.data
    let markdown = ''

    if (ext === 'pdf') {
      const data = await pdfParse(buffer)
      markdown = data.text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l)
        .join('\n\n')
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer })
      markdown = result.value
        .split('\n')
        .map(l => l.trim())
        .filter(l => l)
        .join('\n\n')
    } else if (ext === 'csv') {
      const text = buffer.toString('utf8')
      const rows = parse(text, { skip_empty_lines: true })
      if (rows.length === 0) {
        markdown = ''
      } else {
        const header = '| ' + rows[0].join(' | ') + ' |'
        const divider = '| ' + rows[0].map(() => '---').join(' | ') + ' |'
        const dataRows = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')
        markdown = [header, divider, ...dataRows].join('\n')
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const parts = []
      workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        if (rows.length === 0) return
        parts.push(`## ${name}\n`)
        const header = '| ' + rows[0].join(' | ') + ' |'
        const divider = '| ' + rows[0].map(() => '---').join(' | ') + ' |'
        const dataRows = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')
        parts.push([header, divider, ...dataRows].join('\n'))
      })
      markdown = parts.join('\n\n')
    } else if (ext === 'txt' || ext === 'md' || ext === 'html') {
      markdown = buffer.toString('utf8')
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: `Unsupported file type: .${ext}` }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown,
        filename: filename.replace(/\.[^.]+$/, '.md')
      })
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

function parseMultipart(buffer, boundary) {
  const parts = []
  const sep = Buffer.from('--' + boundary)
  let start = buffer.indexOf(sep) + sep.length + 2
  while (start < buffer.length) {
    const end = buffer.indexOf(sep, start)
    if (end === -1) break
    const part = buffer.slice(start, end - 2)
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) { start = end + sep.length + 2; continue }
    const headerStr = part.slice(0, headerEnd).toString()
    const data = part.slice(headerEnd + 4)
    const nameMatch = headerStr.match(/name="([^"]+)"/)
    const fileMatch = headerStr.match(/filename="([^"]+)"/)
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: fileMatch ? fileMatch[1] : null,
      data
    })
    start = end + sep.length + 2
  }
  return parts
}
