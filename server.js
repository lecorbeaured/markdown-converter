const express = require('express')
const multer = require('multer')
const cors = require('cors')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const app = express()
const upload = multer({ dest: os.tmpdir() })

app.use(cors())
app.use(express.static(path.join(__dirname, 'public')))

app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const inputPath = req.file.path
  const originalName = req.file.originalname

  try {
    const markdown = execSync(`markitdown "${inputPath}"`, { encoding: 'utf8' })
    fs.unlinkSync(inputPath)
    res.json({ markdown, filename: originalName.replace(/\.[^.]+$/, '.md') })
  } catch (err) {
    fs.unlinkSync(inputPath)
    res.status(500).json({ error: 'Conversion failed: ' + err.message })
  }
})

const PORT = 3333
app.listen(PORT, () => console.log(`Markdown Converter running at http://localhost:${PORT}`))
