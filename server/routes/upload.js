const { Router } = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const authenticate = require('../middleware/auth');
const crypto = require('crypto');
const rl = require('../lib/rateLimit');

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
router.post('/', authenticate, (req, res, next) => {
  if (rl.hit(`upload|${req.user.id}`, 60 * 60 * 1000).n > 30) return res.status(429).json({ message: 'Too many uploads. Please try again later.' });
  upload.single('file')(req, res, (err) => {          // turn upload rejections into readable 4xx answers
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'That file is too large (10 MB maximum).' });
    return res.status(400).json({ message: err.message && /allowed|Unexpected/.test(err.message) ? 'Only images (JPG, PNG, WebP, GIF) and PDFs are allowed.' : 'Could not read that file.' });
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file provided' });

  try {
    const originalName = req.file.originalname;
    const ext = originalName.match(/\.[^/.]+$/)?.[0] || '';
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const publicId = `${baseName}_${uniqueSuffix}${ext}`;

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'kasa-workplanner/tasks',
          resource_type: 'image',
          public_id: publicId,
          access_mode: 'public',
          type: 'upload',
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
