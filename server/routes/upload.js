const { Router } = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const authenticate = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images and PDFs are allowed'));
  },
});

const router = Router();

// POST /api/upload
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file provided' });

  try {
    const resourceType = req.file.mimetype === 'application/pdf' ? 'raw' : 'image';

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'kasa-workplanner/tasks',
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error('[upload]', err.message);
    res.status(500).json({ message: 'Upload failed' });
  }
});

module.exports = router;
