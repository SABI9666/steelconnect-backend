import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // 10MB limit
}).single('document');

router.post('/', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err });
        }
        if (req.file === undefined) {
            return res.status(400).json({ error: 'No file selected!' });
        }
        res.status(200).json({
            message: 'File uploaded successfully!',
            filePath: `/uploads/${req.file.filename}`
        });
    });
});

export default router;