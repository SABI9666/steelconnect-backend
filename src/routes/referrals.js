// src/routes/referrals.js - Referral Rewards System
// Contractors: Share with 3 friends → Get 1 free estimation/analysis
// Designers: Share with 3 friends → Get 1 free quote
import express from 'express';
import crypto from 'crypto';
import { adminDb, admin } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// All referral routes require authentication
router.use(authenticateToken);

// ==========================================
// Helper: Generate unique referral code
// ==========================================
function generateReferralCode(userName) {
    const prefix = (userName || 'SC')
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 4)
        .toUpperCase();
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${suffix}`;
}

// ==========================================
// Helper: Generate professional share content
// ==========================================
function generateShareContent(user, platform) {
    const isContractor = user.type === 'contractor';
    const websiteUrl = 'https://steelconnectapp.com';
    const referralLink = `${websiteUrl}?ref=${user.referralCode}`;

    const userName = user.name || 'A Professional';
    const companyName = user.companyName || user.company || '';
    const specializations = user.specializations || user.skills || [];
    const specList = Array.isArray(specializations) ? specializations.slice(0, 3).join(', ') : '';
    const experience = user.experience || '';
    const location = user.address || user.location || '';

    if (isContractor) {
        // Contractor sharing content
        const companyLine = companyName ? `🏢 ${companyName}` : '';
        const experienceLine = experience ? `📊 ${experience} of industry experience` : '';
        const locationLine = location ? `📍 Based in ${location}` : '';

        if (platform === 'whatsapp') {
            return {
                text: `Hi! 👋\n\nI'm ${userName}${companyName ? ` from ${companyName}` : ''}, and I've been using *SteelConnect* — a professional platform for steel construction project management.\n\n${companyLine ? companyLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\n✅ What SteelConnect offers:\n• AI-powered cost estimation from PDF drawings\n• Professional quote management & comparison\n• Real-time project tracking & collaboration\n• Business analytics dashboard\n• Direct connection with certified designers\n\nIt's transformed how I manage my steel construction projects. I highly recommend checking it out!\n\n🔗 Join here: ${referralLink}\n\n— ${userName}${companyName ? `, ${companyName}` : ''}`,
                url: referralLink
            };
        } else {
            // Gmail/Email
            return {
                subject: `${userName} recommends SteelConnect — Professional Steel Construction Platform`,
                body: `Hi,\n\nI'm ${userName}${companyName ? ` from ${companyName}` : ''}, and I wanted to share a platform that has significantly improved how I manage my steel construction projects.\n\n${companyLine ? companyLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\nSteelConnect is a professional platform offering:\n\n• AI-Powered Cost Estimation — Upload PDF drawings and get instant, accurate cost breakdowns\n• Quote Management — Receive and compare quotes from certified steel designers\n• Project Tracking — Real-time milestone tracking and team collaboration\n• Business Analytics — Data-driven insights for your construction business\n• Professional Network — Connect with verified steel construction professionals\n\nI've found it incredibly valuable for streamlining project workflows and making data-driven decisions.\n\nJoin SteelConnect here: ${referralLink}\n\nBest regards,\n${userName}${companyName ? `\n${companyName}` : ''}${locationLine ? `\n${location}` : ''}\n\n---\nSteelConnect — Professional Steel Construction Platform\n${websiteUrl}`,
                url: referralLink
            };
        }
    } else {
        // Designer sharing content
        const skillsLine = specList ? `🛠️ Specializations: ${specList}` : '';
        const experienceLine = experience ? `📊 ${experience} of professional experience` : '';
        const locationLine = location ? `📍 Based in ${location}` : '';

        if (platform === 'whatsapp') {
            return {
                text: `Hi! 👋\n\nI'm ${userName}, a professional steel construction designer${companyName ? ` at ${companyName}` : ''}, and I've been using *SteelConnect* to grow my business.\n\n${skillsLine ? skillsLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\n✅ Why I recommend SteelConnect:\n• Access to real steel construction projects from verified contractors\n• Professional quoting system with document management\n• Portfolio showcase to attract more clients\n• Project tracking & milestone management\n• Business analytics to track your growth\n• Direct communication with contractors\n\nIt's been a game-changer for finding quality projects and managing my design work professionally.\n\n🔗 Join here: ${referralLink}\n\n— ${userName}${companyName ? `, ${companyName}` : ''}`,
                url: referralLink
            };
        } else {
            // Gmail/Email
            return {
                subject: `${userName} invites you to SteelConnect — Where Steel Designers Grow Their Business`,
                body: `Hi,\n\nI'm ${userName}${companyName ? `, a steel construction designer at ${companyName}` : ', a professional steel construction designer'}, and I wanted to recommend a platform that has helped me significantly grow my business.\n\n${skillsLine ? skillsLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\nSteelConnect is a professional platform where designers can:\n\n• Find Quality Projects — Browse real steel construction projects from verified contractors\n• Professional Quoting — Submit detailed quotes with document attachments\n• Portfolio Showcase — Display your work, certifications, and expertise\n• Project Management — Track milestones, deliverables, and deadlines\n• Business Analytics — Monitor revenue, project performance, and growth trends\n• Professional Network — Build your reputation in the steel construction industry\n\nIt's transformed how I find and manage projects, and I think you'd find it equally valuable.\n\nJoin SteelConnect here: ${referralLink}\n\nBest regards,\n${userName}${companyName ? `\n${companyName}` : ''}${locationLine ? `\n${location}` : ''}\n\n---\nSteelConnect — Professional Steel Construction Platform\n${websiteUrl}`,
                url: referralLink
            };
        }
    }
}

// ==========================================
// GET /referrals/status - Get referral status & rewards
// ==========================================
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.uid;
        const userType = req.user.type;

        // Get or create referral profile
        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        let referralData;
        if (!referralDoc.exists) {
            // Create new referral profile
            const userDoc = await adminDb.collection('users').doc(userId).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            const referralCode = generateReferralCode(userData.name || req.user.name);

            referralData = {
                userId,
                userType: userType,
                referralCode,
                totalShares: 0,
                successfulReferrals: 0,
                rewardsEarned: 0,
                rewardsUsed: 0,
                rewardsAvailable: 0,
                shareHistory: [],
                rewardHistory: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await referralRef.set(referralData);
        } else {
            referralData = referralDoc.data();
        }

        // Calculate progress toward next reward
        const sharesNeeded = 3;
        const currentProgress = referralData.successfulReferrals % sharesNeeded;
        const sharesUntilReward = sharesNeeded - currentProgress;

        const rewardType = userType === 'contractor' ? 'Free Estimation/Analysis' : 'Free Quote';

        res.json({
            success: true,
            data: {
                referralCode: referralData.referralCode,
                totalShares: referralData.totalShares || 0,
                successfulReferrals: referralData.successfulReferrals || 0,
                rewardsEarned: referralData.rewardsEarned || 0,
                rewardsUsed: referralData.rewardsUsed || 0,
                rewardsAvailable: referralData.rewardsAvailable || 0,
                currentProgress,
                sharesUntilReward,
                rewardType,
                shareHistory: (referralData.shareHistory || []).slice(-20),
                rewardHistory: (referralData.rewardHistory || []).slice(-20)
            }
        });
    } catch (error) {
        console.error('Error getting referral status:', error);
        res.status(500).json({ success: false, message: 'Failed to get referral status' });
    }
});

// ==========================================
// GET /referrals/share-content - Get auto-generated share content
// ==========================================
router.get('/share-content', async (req, res) => {
    try {
        const userId = req.user.uid;
        const { platform } = req.query; // 'whatsapp' or 'gmail'

        if (!platform || !['whatsapp', 'gmail'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Platform must be "whatsapp" or "gmail"'
            });
        }

        // Get user profile data
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        const userData = userDoc.data();

        // Get or create referral code
        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        let referralCode;
        if (referralDoc.exists) {
            referralCode = referralDoc.data().referralCode;
        } else {
            referralCode = generateReferralCode(userData.name);
            await referralRef.set({
                userId,
                userType: userData.type,
                referralCode,
                totalShares: 0,
                successfulReferrals: 0,
                rewardsEarned: 0,
                rewardsUsed: 0,
                rewardsAvailable: 0,
                shareHistory: [],
                rewardHistory: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        const userWithCode = { ...userData, referralCode };
        const content = generateShareContent(userWithCode, platform);

        res.json({ success: true, data: content });
    } catch (error) {
        console.error('Error generating share content:', error);
        res.status(500).json({ success: false, message: 'Failed to generate share content' });
    }
});

// ==========================================
// POST /referrals/track-share - Track when user shares
// ==========================================
router.post('/track-share', async (req, res) => {
    try {
        const userId = req.user.uid;
        const { platform, recipientInfo } = req.body;

        if (!platform || !['whatsapp', 'gmail'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Platform must be "whatsapp" or "gmail"'
            });
        }

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found. Please visit referral rewards page first.' });
        }

        const shareEntry = {
            platform,
            recipientInfo: recipientInfo || 'Not specified',
            sharedAt: new Date().toISOString(),
            status: 'shared'
        };

        await referralRef.update({
            totalShares: admin.firestore.FieldValue.increment(1),
            shareHistory: admin.firestore.FieldValue.arrayUnion(shareEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const updatedDoc = await referralRef.get();
        const updatedData = updatedDoc.data();

        res.json({
            success: true,
            message: 'Share tracked successfully',
            data: {
                totalShares: updatedData.totalShares,
                successfulReferrals: updatedData.successfulReferrals
            }
        });
    } catch (error) {
        console.error('Error tracking share:', error);
        res.status(500).json({ success: false, message: 'Failed to track share' });
    }
});

// ==========================================
// POST /referrals/record-signup - Record when referred user signs up
// ==========================================
router.post('/record-signup', async (req, res) => {
    try {
        const { referralCode, newUserId, newUserEmail } = req.body;

        if (!referralCode) {
            return res.status(400).json({ success: false, message: 'Referral code is required' });
        }

        // Find referrer by code
        const referralsSnapshot = await adminDb.collection('referrals')
            .where('referralCode', '==', referralCode)
            .limit(1)
            .get();

        if (referralsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Invalid referral code' });
        }

        const referrerDoc = referralsSnapshot.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();

        // Update referrer's successful referrals
        const newSuccessfulCount = (referrerData.successfulReferrals || 0) + 1;
        const sharesNeeded = 3;

        // Check if this earns a new reward
        let newRewardsEarned = referrerData.rewardsEarned || 0;
        let newRewardsAvailable = referrerData.rewardsAvailable || 0;
        let rewardGranted = false;

        if (newSuccessfulCount % sharesNeeded === 0) {
            newRewardsEarned += 1;
            newRewardsAvailable += 1;
            rewardGranted = true;
        }

        const rewardEntry = rewardGranted ? {
            type: referrerData.userType === 'contractor' ? 'free_estimation' : 'free_quote',
            earnedAt: new Date().toISOString(),
            status: 'available',
            triggerReferral: newUserEmail || newUserId
        } : null;

        const updateData = {
            successfulReferrals: newSuccessfulCount,
            rewardsEarned: newRewardsEarned,
            rewardsAvailable: newRewardsAvailable,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (rewardEntry) {
            updateData.rewardHistory = admin.firestore.FieldValue.arrayUnion(rewardEntry);
        }

        await referrerDoc.ref.update(updateData);

        // Send notification to referrer
        if (rewardGranted) {
            const rewardType = referrerData.userType === 'contractor'
                ? 'a free estimation/analysis'
                : 'a free quote';

            try {
                await NotificationService.createNotification({
                    userId: referrerId,
                    type: 'referral_reward',
                    title: '🎉 Referral Reward Earned!',
                    message: `Congratulations! Your referral joined SteelConnect. You've earned ${rewardType}!`,
                    metadata: { rewardType: rewardEntry.type, referralCount: newSuccessfulCount }
                });
            } catch (notifError) {
                console.error('Failed to send referral reward notification:', notifError);
            }
        }

        // Record referral in new user's profile
        if (newUserId) {
            try {
                await adminDb.collection('users').doc(newUserId).update({
                    referredBy: referrerId,
                    referralCode: referralCode,
                    referredAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                console.warn('Could not update referred user profile:', e.message);
            }
        }

        res.json({
            success: true,
            message: rewardGranted ? 'Referral recorded — reward granted!' : 'Referral recorded successfully',
            data: {
                successfulReferrals: newSuccessfulCount,
                rewardGranted,
                rewardsAvailable: newRewardsAvailable
            }
        });
    } catch (error) {
        console.error('Error recording referral signup:', error);
        res.status(500).json({ success: false, message: 'Failed to record referral' });
    }
});

// ==========================================
// POST /referrals/use-reward - Use a referral reward
// ==========================================
router.post('/use-reward', async (req, res) => {
    try {
        const userId = req.user.uid;
        const { rewardType } = req.body; // 'free_estimation' or 'free_quote'

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found' });
        }

        const data = referralDoc.data();

        if ((data.rewardsAvailable || 0) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No rewards available. Share with 3 friends to earn a reward!'
            });
        }

        // Validate reward type matches user type
        const expectedType = data.userType === 'contractor' ? 'free_estimation' : 'free_quote';
        if (rewardType && rewardType !== expectedType) {
            return res.status(400).json({
                success: false,
                message: `Invalid reward type. As a ${data.userType}, your reward is: ${expectedType}`
            });
        }

        await referralRef.update({
            rewardsAvailable: admin.firestore.FieldValue.increment(-1),
            rewardsUsed: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const updatedDoc = await referralRef.get();
        const updatedData = updatedDoc.data();

        res.json({
            success: true,
            message: 'Reward applied successfully!',
            data: {
                rewardsAvailable: updatedData.rewardsAvailable,
                rewardsUsed: updatedData.rewardsUsed,
                appliedReward: expectedType
            }
        });
    } catch (error) {
        console.error('Error using reward:', error);
        res.status(500).json({ success: false, message: 'Failed to use reward' });
    }
});

// ==========================================
// GET /referrals/check-reward - Check if user has available reward
// ==========================================
router.get('/check-reward', async (req, res) => {
    try {
        const userId = req.user.uid;

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.json({
                success: true,
                data: { hasReward: false, rewardsAvailable: 0 }
            });
        }

        const data = referralDoc.data();

        res.json({
            success: true,
            data: {
                hasReward: (data.rewardsAvailable || 0) > 0,
                rewardsAvailable: data.rewardsAvailable || 0,
                rewardType: data.userType === 'contractor' ? 'free_estimation' : 'free_quote'
            }
        });
    } catch (error) {
        console.error('Error checking reward:', error);
        res.status(500).json({ success: false, message: 'Failed to check reward' });
    }
});

// ==========================================
// GET /referrals/admin/all - Admin: Get all referral data
// ==========================================
router.get('/admin/all', async (req, res) => {
    try {
        // Check if admin
        if (req.user.type !== 'admin' && req.user.role !== 'admin' && req.user.type !== 'operations') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const referralsSnapshot = await adminDb.collection('referrals')
            .orderBy('createdAt', 'desc')
            .get();

        const referrals = [];
        for (const doc of referralsSnapshot.docs) {
            const data = doc.data();
            // Get user name
            let userName = 'Unknown';
            try {
                const userDoc = await adminDb.collection('users').doc(doc.id).get();
                if (userDoc.exists) {
                    userName = userDoc.data().name || 'Unknown';
                }
            } catch (e) { /* ignore */ }

            referrals.push({
                userId: doc.id,
                userName,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
            });
        }

        // Summary stats
        const stats = {
            totalReferrers: referrals.length,
            totalShares: referrals.reduce((sum, r) => sum + (r.totalShares || 0), 0),
            totalSuccessfulReferrals: referrals.reduce((sum, r) => sum + (r.successfulReferrals || 0), 0),
            totalRewardsEarned: referrals.reduce((sum, r) => sum + (r.rewardsEarned || 0), 0),
            totalRewardsUsed: referrals.reduce((sum, r) => sum + (r.rewardsUsed || 0), 0),
            contractorReferrers: referrals.filter(r => r.userType === 'contractor').length,
            designerReferrers: referrals.filter(r => r.userType === 'designer').length
        };

        res.json({
            success: true,
            data: { referrals, stats }
        });
    } catch (error) {
        console.error('Error getting admin referral data:', error);
        res.status(500).json({ success: false, message: 'Failed to get referral data' });
    }
});

export default router;
