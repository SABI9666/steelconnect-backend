// src/routes/community.js - Community Feed CRUD Endpoints
import express from 'express';
import multer from 'multer';
import { adminDb, admin, uploadMultipleFilesToFirebase, generateSignedUrl } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// Community-specific multer: images only, max 6 files, 10MB each
const communityUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 6 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed for community posts.'));
        }
    }
});

// All community routes require authentication
router.use(authenticateToken);

// Helper: extract hashtags from content
function extractHashtags(content) {
    const matches = content.match(/#(\w+)/g) || [];
    return matches.map(h => h.substring(1));
}

// Helper: get image URL from image object or string
function getImageSrc(img) {
    if (typeof img === 'string') return img;
    return img.url || img.path || '';
}

// Helper: refresh signed URLs for images
async function refreshImageUrls(images) {
    if (!images || !Array.isArray(images) || images.length === 0) return [];
    const refreshed = [];
    for (const img of images) {
        if (typeof img === 'object' && img.path) {
            try {
                const freshUrl = await generateSignedUrl(img.path, 60);
                refreshed.push({ ...img, url: freshUrl });
            } catch (e) {
                refreshed.push(img);
            }
        } else {
            refreshed.push(img);
        }
    }
    return refreshed;
}

// ==========================================
// GET /posts - List approved posts (paginated)
// ==========================================
router.get('/posts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const query = adminDb.collection('community_posts')
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc');

        const snapshot = await query.limit(limit + 1).offset(offset).get();
        const hasNext = snapshot.docs.length > limit;
        const docs = snapshot.docs.slice(0, limit);

        const posts = [];
        for (const doc of docs) {
            const data = doc.data();
            const images = await refreshImageUrls(data.images);
            posts.push({ id: doc.id, ...data, images });
        }

        // Get aggregate counts for hero stats
        let totalPosts = 0;
        let totalMembers = 0;
        try {
            const totalPostsSnap = await adminDb.collection('community_posts')
                .where('status', '==', 'approved').count().get();
            totalPosts = totalPostsSnap.data().count;

            const totalMembersSnap = await adminDb.collection('users')
                .where('profileStatus', '==', 'approved').count().get();
            totalMembers = totalMembersSnap.data().count;
        } catch (e) {
            console.warn('[COMMUNITY] Count queries failed (may need indexes):', e.message);
        }

        res.json({
            success: true,
            data: posts,
            totalPosts,
            totalMembers,
            pagination: { page, limit, hasNext }
        });
    } catch (error) {
        console.error('[COMMUNITY] Error fetching posts:', error);
        res.status(500).json({ success: false, message: 'Error fetching community posts' });
    }
});

// ==========================================
// POST /posts - Create a new post (pending approval)
// ==========================================
router.post('/posts', communityUpload.array('images', 6), async (req, res) => {
    try {
        const { content } = req.body;
        const userId = req.user.userId;
        const userName = req.user.name || req.user.email;
        const userType = req.user.type;
        const userEmail = req.user.email;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Post content is required.' });
        }

        const hashtags = extractHashtags(content);

        // Upload images to Firebase Storage if files provided via FormData
        let uploadedImages = [];
        if (req.files && req.files.length > 0) {
            const uploaded = await uploadMultipleFilesToFirebase(
                req.files,
                'community',
                userId
            );
            uploadedImages = uploaded.map(f => ({
                path: f.path,
                url: f.url,
                originalName: f.originalname || f.name,
                size: f.size,
                mimetype: f.mimetype,
                uploadedAt: new Date().toISOString()
            }));
        }

        // Handle base64/URL images sent in JSON body (fallback for frontend compatibility)
        if (uploadedImages.length === 0 && req.body.images) {
            let bodyImages = req.body.images;
            if (typeof bodyImages === 'string') {
                try { bodyImages = JSON.parse(bodyImages); } catch (e) { bodyImages = []; }
            }
            if (Array.isArray(bodyImages) && bodyImages.length > 0) {
                uploadedImages = bodyImages.map(img => {
                    if (typeof img === 'string') return { url: img, path: null };
                    return img;
                });
            }
        }

        const postData = {
            authorId: userId,
            authorName: userName,
            authorEmail: userEmail,
            authorType: userType,
            content: content.trim(),
            images: uploadedImages,
            hashtags,
            likes: 0,
            likedBy: [],
            comments: [],
            status: 'pending',
            adminReviewedBy: null,
            adminReviewedAt: null,
            adminComments: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const postRef = await adminDb.collection('community_posts').add(postData);
        console.log(`[COMMUNITY] New post created: ${postRef.id} by ${userName} (${userType})`);

        // Notify admins about new pending post
        try {
            const adminSnapshot = await adminDb.collection('users')
                .where('type', '==', 'admin').get();

            const notifyPromises = adminSnapshot.docs.map(adminDoc =>
                NotificationService.createNotification(
                    adminDoc.id,
                    'New Community Post Pending Review',
                    `${userName} (${userType}) submitted a new community post for approval.`,
                    'community',
                    {
                        action: 'community_post_pending',
                        postId: postRef.id,
                        authorId: userId,
                        authorName: userName,
                        authorType: userType,
                        contentPreview: content.substring(0, 100)
                    }
                )
            );
            await Promise.all(notifyPromises);
        } catch (notifError) {
            console.error('[COMMUNITY] Failed to notify admins:', notifError);
        }

        res.status(201).json({
            success: true,
            message: 'Post submitted! It will appear in the feed after admin approval.',
            data: { id: postRef.id, ...postData }
        });
    } catch (error) {
        console.error('[COMMUNITY] Error creating post:', error);
        res.status(500).json({ success: false, message: 'Failed to create post.' });
    }
});

// ==========================================
// PUT /posts/:id - Update own post
// ==========================================
router.put('/posts/:id', communityUpload.array('images', 6), async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userId = req.user.userId;

        const postRef = adminDb.collection('community_posts').doc(id);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postDoc.data();
        if (postData.authorId !== userId) {
            return res.status(403).json({ success: false, message: 'You can only edit your own posts.' });
        }

        const updateData = { updatedAt: new Date().toISOString() };

        if (content) {
            updateData.content = content.trim();
            updateData.hashtags = extractHashtags(content);
        }

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            const uploaded = await uploadMultipleFilesToFirebase(req.files, 'community', userId);
            updateData.images = uploaded.map(f => ({
                path: f.path,
                url: f.url,
                originalName: f.originalname || f.name,
                size: f.size,
                mimetype: f.mimetype,
                uploadedAt: new Date().toISOString()
            }));
        } else if (req.body.images) {
            let bodyImages = req.body.images;
            if (typeof bodyImages === 'string') {
                try { bodyImages = JSON.parse(bodyImages); } catch (e) { bodyImages = []; }
            }
            if (Array.isArray(bodyImages)) {
                updateData.images = bodyImages.map(img => {
                    if (typeof img === 'string') return { url: img, path: null };
                    return img;
                });
            }
        }

        // If post was rejected, re-editing resets to pending for re-review
        if (postData.status === 'rejected') {
            updateData.status = 'pending';
            updateData.adminReviewedBy = null;
            updateData.adminReviewedAt = null;
            updateData.adminComments = null;
        }

        await postRef.update(updateData);

        res.json({
            success: true,
            message: postData.status === 'rejected'
                ? 'Post updated and resubmitted for review.'
                : 'Post updated successfully.',
            data: { id, ...postData, ...updateData }
        });
    } catch (error) {
        console.error('[COMMUNITY] Error updating post:', error);
        res.status(500).json({ success: false, message: 'Failed to update post.' });
    }
});

// ==========================================
// DELETE /posts/:id - Delete own post
// ==========================================
router.delete('/posts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const postRef = adminDb.collection('community_posts').doc(id);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postDoc.data();
        if (postData.authorId !== userId) {
            return res.status(403).json({ success: false, message: 'You can only delete your own posts.' });
        }

        // Move to trash (following existing pattern)
        await adminDb.collection('_trash').add({
            originalCollection: 'community_posts',
            originalId: id,
            data: postData,
            deletedBy: userId,
            deletedAt: new Date().toISOString()
        });

        await postRef.delete();

        res.json({ success: true, message: 'Post deleted successfully.' });
    } catch (error) {
        console.error('[COMMUNITY] Error deleting post:', error);
        res.status(500).json({ success: false, message: 'Failed to delete post.' });
    }
});

// ==========================================
// POST /posts/:id/like - Toggle like
// ==========================================
router.post('/posts/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userName = req.user.name || req.user.email;

        const postRef = adminDb.collection('community_posts').doc(id);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postDoc.data();
        const likedBy = postData.likedBy || [];
        const isLiked = likedBy.includes(userId);

        if (isLiked) {
            await postRef.update({
                likedBy: admin.firestore.FieldValue.arrayRemove(userId),
                likes: admin.firestore.FieldValue.increment(-1),
                updatedAt: new Date().toISOString()
            });
        } else {
            await postRef.update({
                likedBy: admin.firestore.FieldValue.arrayUnion(userId),
                likes: admin.firestore.FieldValue.increment(1),
                updatedAt: new Date().toISOString()
            });

            // Notify post author (if not liking own post)
            if (postData.authorId !== userId) {
                try {
                    await NotificationService.createNotification(
                        postData.authorId,
                        'New Like on Your Post',
                        `${userName} liked your community post.`,
                        'community',
                        {
                            action: 'community_post_liked',
                            postId: id,
                            likerId: userId,
                            likerName: userName
                        }
                    );
                } catch (e) { /* non-critical */ }
            }
        }

        res.json({
            success: true,
            liked: !isLiked,
            likes: (postData.likes || 0) + (isLiked ? -1 : 1)
        });
    } catch (error) {
        console.error('[COMMUNITY] Error toggling like:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle like.' });
    }
});

// ==========================================
// POST /posts/:id/comments - Add comment
// ==========================================
router.post('/posts/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        const userId = req.user.userId;
        const userName = req.user.name || req.user.email;
        const userType = req.user.type;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Comment text is required.' });
        }

        const postRef = adminDb.collection('community_posts').doc(id);
        const postDoc = await postRef.get();

        if (!postDoc.exists) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postDoc.data();
        const newComment = {
            id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            authorId: userId,
            authorName: userName,
            authorType: userType,
            text: text.trim(),
            createdAt: new Date().toISOString()
        };

        await postRef.update({
            comments: admin.firestore.FieldValue.arrayUnion(newComment),
            updatedAt: new Date().toISOString()
        });

        // Notify post author (if not commenting on own post)
        if (postData.authorId !== userId) {
            try {
                await NotificationService.createNotification(
                    postData.authorId,
                    'New Comment on Your Post',
                    `${userName} commented: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`,
                    'community',
                    {
                        action: 'community_post_comment',
                        postId: id,
                        commenterId: userId,
                        commenterName: userName,
                        commentPreview: text.substring(0, 100)
                    }
                );
            } catch (e) { /* non-critical */ }
        }

        res.json({
            success: true,
            message: 'Comment added.',
            comment: newComment
        });
    } catch (error) {
        console.error('[COMMUNITY] Error adding comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment.' });
    }
});

export default router;
