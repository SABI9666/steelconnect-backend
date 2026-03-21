// src/routes/referrals.js - Referral Rewards System with Full Tracking & Admin Approval
// Contractors: Share with 3 friends → Admin approves → Get 1 free estimation/analysis
// Designers: Share with 3 friends → Admin approves → Get 1 free quote
import express from 'express';
import crypto from 'crypto';
import { adminDb, admin } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

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
        const companyLine = companyName ? `🏢 ${companyName}` : '';
        const experienceLine = experience ? `📊 ${experience} of industry experience` : '';
        const locationLine = location ? `📍 Based in ${location}` : '';

        if (platform === 'whatsapp') {
            return {
                text: `Hi! 👋\n\nI'm ${userName}${companyName ? ` from ${companyName}` : ''}, and I've been using *SteelConnect* — a professional platform for steel construction project management.\n\n${companyLine ? companyLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\n✅ What SteelConnect offers:\n• AI-powered cost estimation from PDF drawings\n• Professional quote management & comparison\n• Real-time project tracking & collaboration\n• Business analytics dashboard\n• Direct connection with certified designers\n\nIt's transformed how I manage my steel construction projects. I highly recommend checking it out!\n\n🔗 Join here: ${referralLink}\n\nUse my referral code: *${user.referralCode}*\n\n— ${userName}${companyName ? `, ${companyName}` : ''}`,
                url: referralLink
            };
        } else {
            return {
                subject: `${userName} recommends SteelConnect — Professional Steel Construction Platform`,
                body: `Hi,\n\nI'm ${userName}${companyName ? ` from ${companyName}` : ''}, and I wanted to share a platform that has significantly improved how I manage my steel construction projects.\n\n${companyLine ? companyLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\nSteelConnect is a professional platform offering:\n\n• AI-Powered Cost Estimation — Upload PDF drawings and get instant, accurate cost breakdowns\n• Quote Management — Receive and compare quotes from certified steel designers\n• Project Tracking — Real-time milestone tracking and team collaboration\n• Business Analytics — Data-driven insights for your construction business\n• Professional Network — Connect with verified steel construction professionals\n\nI've found it incredibly valuable for streamlining project workflows and making data-driven decisions.\n\nJoin SteelConnect here: ${referralLink}\n\nMy Referral Code: ${user.referralCode}\n\nBest regards,\n${userName}${companyName ? `\n${companyName}` : ''}${location ? `\n${location}` : ''}\n\n---\nSteelConnect — Professional Steel Construction Platform\n${websiteUrl}`,
                url: referralLink
            };
        }
    } else {
        const skillsLine = specList ? `🛠️ Specializations: ${specList}` : '';
        const experienceLine = experience ? `📊 ${experience} of professional experience` : '';
        const locationLine = location ? `📍 Based in ${location}` : '';

        if (platform === 'whatsapp') {
            return {
                text: `Hi! 👋\n\nI'm ${userName}, a professional steel construction designer${companyName ? ` at ${companyName}` : ''}, and I've been using *SteelConnect* to grow my business.\n\n${skillsLine ? skillsLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\n✅ Why I recommend SteelConnect:\n• Access to real steel construction projects from verified contractors\n• Professional quoting system with document management\n• Portfolio showcase to attract more clients\n• Project tracking & milestone management\n• Business analytics to track your growth\n• Direct communication with contractors\n\nIt's been a game-changer for finding quality projects and managing my design work professionally.\n\n🔗 Join here: ${referralLink}\n\nUse my referral code: *${user.referralCode}*\n\n— ${userName}${companyName ? `, ${companyName}` : ''}`,
                url: referralLink
            };
        } else {
            return {
                subject: `${userName} invites you to SteelConnect — Where Steel Designers Grow Their Business`,
                body: `Hi,\n\nI'm ${userName}${companyName ? `, a steel construction designer at ${companyName}` : ', a professional steel construction designer'}, and I wanted to recommend a platform that has helped me significantly grow my business.\n\n${skillsLine ? skillsLine + '\n' : ''}${experienceLine ? experienceLine + '\n' : ''}${locationLine ? locationLine + '\n' : ''}\nSteelConnect is a professional platform where designers can:\n\n• Find Quality Projects — Browse real steel construction projects from verified contractors\n• Professional Quoting — Submit detailed quotes with document attachments\n• Portfolio Showcase — Display your work, certifications, and expertise\n• Project Management — Track milestones, deliverables, and deadlines\n• Business Analytics — Monitor revenue, project performance, and growth trends\n• Professional Network — Build your reputation in the steel construction industry\n\nIt's transformed how I find and manage projects, and I think you'd find it equally valuable.\n\nJoin SteelConnect here: ${referralLink}\n\nMy Referral Code: ${user.referralCode}\n\nBest regards,\n${userName}${companyName ? `\n${companyName}` : ''}${location ? `\n${location}` : ''}\n\n---\nSteelConnect — Professional Steel Construction Platform\n${websiteUrl}`,
                url: referralLink
            };
        }
    }
}

// ==========================================
// All routes below require auth (except record-signup which is public)
// ==========================================

// ==========================================
// POST /referrals/record-signup - Public: Record when referred user signs up
// Called from auth register/google flows — NO auth required
// ==========================================
router.post('/record-signup', async (req, res) => {
    try {
        const { referralCode, newUserId, newUserName, newUserEmail } = req.body;

        if (!referralCode) {
            return res.status(400).json({ success: false, message: 'Referral code is required' });
        }

        // Find referrer by code
        const referralsSnapshot = await adminDb.collection('referrals')
            .where('referralCode', '==', referralCode.trim().toUpperCase())
            .limit(1)
            .get();

        if (referralsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Invalid referral code' });
        }

        const referrerDoc = referralsSnapshot.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();

        // Check if this user was already recorded
        const existingInvites = referrerData.invitedUsers || [];
        const alreadyRecorded = existingInvites.some(
            u => u.email === (newUserEmail || '').toLowerCase() || u.userId === newUserId
        );
        if (alreadyRecorded) {
            return res.json({ success: true, message: 'Referral already recorded' });
        }

        // Add to invited users with status "registered"
        const invitedUser = {
            userId: newUserId || null,
            name: newUserName || 'Unknown',
            email: (newUserEmail || '').toLowerCase(),
            status: 'registered', // registered = signed up successfully
            registeredAt: new Date().toISOString(),
            platform: 'referral_link'
        };

        await referrerDoc.ref.update({
            successfulReferrals: admin.firestore.FieldValue.increment(1),
            invitedUsers: admin.firestore.FieldValue.arrayUnion(invitedUser),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Record referral in new user's profile
        if (newUserId) {
            try {
                await adminDb.collection('users').doc(newUserId).update({
                    referredBy: referrerId,
                    referralCode: referralCode.trim().toUpperCase(),
                    referredAt: new Date().toISOString()
                });
            } catch (e) {
                console.warn('Could not update referred user profile:', e.message);
            }
        }

        // Notify the referrer that someone joined
        try {
            await NotificationService.createNotification(
                referrerId,
                '👤 New Referral Joined!',
                `${newUserName || newUserEmail || 'Someone'} signed up using your referral code!`,
                'referral_signup',
                { newUserEmail, newUserName, referralCode }
            );
        } catch (e) {
            console.warn('Failed to send referral notification:', e.message);
        }

        res.json({
            success: true,
            message: 'Referral signup recorded successfully'
        });
    } catch (error) {
        console.error('Error recording referral signup:', error);
        res.status(500).json({ success: false, message: 'Failed to record referral' });
    }
});

// Apply auth to all remaining routes
router.use(authenticateToken);

// ==========================================
// GET /referrals/status - Get referral status & rewards
// ==========================================
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.userId;
        const userType = req.user.type;

        // Get or create referral profile
        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        let referralData;
        if (!referralDoc.exists) {
            const userDoc = await adminDb.collection('users').doc(userId).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            const referralCode = generateReferralCode(userData.name || req.user.name);

            referralData = {
                userId,
                userName: userData.name || req.user.name || '',
                userEmail: userData.email || req.user.email || '',
                userType: userType,
                referralCode,
                totalShares: 0,
                successfulReferrals: 0,
                rewardsEarned: 0,
                rewardsUsed: 0,
                rewardsAvailable: 0,
                pendingApproval: false,
                shareHistory: [],
                invitedUsers: [],
                rewardHistory: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await referralRef.set(referralData);
        } else {
            referralData = referralDoc.data();
        }

        const registeredCount = (referralData.invitedUsers || []).filter(u => u.status === 'registered').length;
        const sharesNeeded = 3;
        const currentProgress = registeredCount % sharesNeeded;
        const sharesUntilReward = sharesNeeded - currentProgress;
        const rewardType = userType === 'contractor' ? 'Free Estimation/Analysis' : 'Free Quote';

        // Check if eligible for admin approval (3+ registered but no pending/available)
        const eligibleForApproval = registeredCount >= sharesNeeded &&
            ((registeredCount - ((referralData.rewardsEarned || 0) * sharesNeeded)) >= sharesNeeded);

        res.json({
            success: true,
            data: {
                referralCode: referralData.referralCode,
                totalShares: referralData.totalShares || 0,
                successfulReferrals: registeredCount,
                rewardsEarned: referralData.rewardsEarned || 0,
                rewardsUsed: referralData.rewardsUsed || 0,
                rewardsAvailable: referralData.rewardsAvailable || 0,
                pendingApproval: referralData.pendingApproval || false,
                currentProgress,
                sharesUntilReward: eligibleForApproval ? 0 : sharesUntilReward,
                eligibleForApproval,
                rewardType,
                invitedUsers: (referralData.invitedUsers || []).map(u => ({
                    name: u.name,
                    email: u.email ? u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
                    status: u.status,
                    registeredAt: u.registeredAt,
                    platform: u.platform
                })),
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
        const userId = req.user.userId;
        const { platform } = req.query;

        if (!platform || !['whatsapp', 'gmail'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Platform must be "whatsapp" or "gmail"'
            });
        }

        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        const userData = userDoc.data();

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        let referralCode;
        if (referralDoc.exists) {
            referralCode = referralDoc.data().referralCode;
        } else {
            referralCode = generateReferralCode(userData.name);
            await referralRef.set({
                userId,
                userName: userData.name || '',
                userEmail: userData.email || '',
                userType: userData.type,
                referralCode,
                totalShares: 0,
                successfulReferrals: 0,
                rewardsEarned: 0,
                rewardsUsed: 0,
                rewardsAvailable: 0,
                pendingApproval: false,
                shareHistory: [],
                invitedUsers: [],
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
        const userId = req.user.userId;
        const { platform, recipientName, recipientContact } = req.body;

        if (!platform || !['whatsapp', 'gmail'].includes(platform)) {
            return res.status(400).json({
                success: false,
                message: 'Platform must be "whatsapp" or "gmail"'
            });
        }

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found' });
        }

        const shareEntry = {
            platform,
            recipientName: recipientName || '',
            recipientContact: recipientContact || '',
            sharedAt: new Date().toISOString(),
            status: 'sent'
        };

        // Also add to invitedUsers as "sent" status (will be updated to "registered" when they sign up)
        const invitedEntry = {
            name: recipientName || 'Not specified',
            email: recipientContact || '',
            status: 'sent',
            sentAt: new Date().toISOString(),
            platform
        };

        const referralData = referralDoc.data();
        const existingInvited = referralData.invitedUsers || [];

        // Don't duplicate if same contact was already sent
        const alreadySent = existingInvited.some(
            u => u.email && u.email === (recipientContact || '').toLowerCase()
        );

        const updateData = {
            totalShares: admin.firestore.FieldValue.increment(1),
            shareHistory: admin.firestore.FieldValue.arrayUnion(shareEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!alreadySent && recipientContact) {
            updateData.invitedUsers = admin.firestore.FieldValue.arrayUnion(invitedEntry);
        }

        await referralRef.update(updateData);

        const updatedDoc = await referralRef.get();
        const updatedData = updatedDoc.data();

        res.json({
            success: true,
            message: 'Share tracked successfully',
            data: {
                totalShares: updatedData.totalShares,
                successfulReferrals: (updatedData.invitedUsers || []).filter(u => u.status === 'registered').length
            }
        });
    } catch (error) {
        console.error('Error tracking share:', error);
        res.status(500).json({ success: false, message: 'Failed to track share' });
    }
});

// ==========================================
// POST /referrals/use-reward - Use a referral reward
// ==========================================
router.post('/use-reward', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { rewardType } = req.body;

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found' });
        }

        const data = referralDoc.data();

        if ((data.rewardsAvailable || 0) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No rewards available. Share with 3 friends and wait for admin approval!'
            });
        }

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
        const userId = req.user.userId;

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
// GET /referrals/admin/all - Admin: Get all referral data with full details
// ==========================================
router.get('/admin/all', async (req, res) => {
    try {
        if (req.user.type !== 'admin' && req.user.role !== 'admin' && req.user.type !== 'operations') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const referralsSnapshot = await adminDb.collection('referrals')
            .orderBy('createdAt', 'desc')
            .get();

        const referrals = [];
        for (const doc of referralsSnapshot.docs) {
            const data = doc.data();
            let userName = data.userName || 'Unknown';
            let userEmail = data.userEmail || '';

            // Fallback: get from users collection
            if (userName === 'Unknown' || !userEmail) {
                try {
                    const userDoc = await adminDb.collection('users').doc(doc.id).get();
                    if (userDoc.exists) {
                        const ud = userDoc.data();
                        userName = ud.name || userName;
                        userEmail = ud.email || userEmail;
                    }
                } catch (e) { /* ignore */ }
            }

            const invitedUsers = (data.invitedUsers || []);
            const sentCount = invitedUsers.filter(u => u.status === 'sent').length;
            const registeredCount = invitedUsers.filter(u => u.status === 'registered').length;

            referrals.push({
                odcId: doc.id,
                odcId: doc.id,
                userId: doc.id,
                userName,
                userEmail,
                userType: data.userType,
                referralCode: data.referralCode,
                totalShares: data.totalShares || 0,
                sentCount,
                registeredCount,
                rewardsEarned: data.rewardsEarned || 0,
                rewardsUsed: data.rewardsUsed || 0,
                rewardsAvailable: data.rewardsAvailable || 0,
                pendingApproval: data.pendingApproval || false,
                invitedUsers: invitedUsers,
                rewardHistory: data.rewardHistory || [],
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
            });
        }

        const stats = {
            totalReferrers: referrals.length,
            totalShares: referrals.reduce((sum, r) => sum + (r.totalShares || 0), 0),
            totalSent: referrals.reduce((sum, r) => sum + (r.sentCount || 0), 0),
            totalRegistered: referrals.reduce((sum, r) => sum + (r.registeredCount || 0), 0),
            totalRewardsEarned: referrals.reduce((sum, r) => sum + (r.rewardsEarned || 0), 0),
            totalRewardsUsed: referrals.reduce((sum, r) => sum + (r.rewardsUsed || 0), 0),
            pendingApprovals: referrals.filter(r => r.registeredCount >= 3 && r.registeredCount > (r.rewardsEarned || 0) * 3).length,
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

// ==========================================
// POST /referrals/admin/approve-reward - Admin: Approve reward for user
// ==========================================
router.post('/admin/approve-reward', async (req, res) => {
    try {
        if (req.user.type !== 'admin' && req.user.role !== 'admin' && req.user.type !== 'operations') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found' });
        }

        const data = referralDoc.data();
        const registeredCount = (data.invitedUsers || []).filter(u => u.status === 'registered').length;
        const rewardsAlreadyEarned = data.rewardsEarned || 0;

        // Check eligibility: need at least 3 registered per reward
        if (registeredCount < (rewardsAlreadyEarned + 1) * 3) {
            return res.status(400).json({
                success: false,
                message: `Not enough registered referrals. Has ${registeredCount} registered, needs ${(rewardsAlreadyEarned + 1) * 3} for next reward.`
            });
        }

        const rewardType = data.userType === 'contractor' ? 'free_estimation' : 'free_quote';

        const rewardEntry = {
            type: rewardType,
            earnedAt: new Date().toISOString(),
            approvedBy: req.user.userId,
            approvedByName: req.user.name || req.user.email,
            status: 'available'
        };

        await referralRef.update({
            rewardsEarned: admin.firestore.FieldValue.increment(1),
            rewardsAvailable: admin.firestore.FieldValue.increment(1),
            pendingApproval: false,
            rewardHistory: admin.firestore.FieldValue.arrayUnion(rewardEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Notify user
        try {
            const rewardLabel = data.userType === 'contractor' ? 'a free estimation/analysis' : 'a free quote';
            await NotificationService.createNotification(
                userId,
                '🎉 Referral Reward Approved!',
                `Congratulations! Admin has approved your referral reward. You now have ${rewardLabel} available! Go to Referral Rewards to use it.`,
                'referral_reward',
                { rewardType, approvedBy: req.user.name || req.user.email }
            );
        } catch (e) {
            console.warn('Failed to send reward approval notification:', e.message);
        }

        res.json({
            success: true,
            message: `Reward approved! User now has ${(data.rewardsAvailable || 0) + 1} reward(s) available.`
        });
    } catch (error) {
        console.error('Error approving reward:', error);
        res.status(500).json({ success: false, message: 'Failed to approve reward' });
    }
});

// ==========================================
// POST /referrals/admin/reject-reward - Admin: Reject/deny reward
// ==========================================
router.post('/admin/reject-reward', async (req, res) => {
    try {
        if (req.user.type !== 'admin' && req.user.role !== 'admin' && req.user.type !== 'operations') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const { userId, reason } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const referralRef = adminDb.collection('referrals').doc(userId);
        const referralDoc = await referralRef.get();

        if (!referralDoc.exists) {
            return res.status(404).json({ success: false, message: 'Referral profile not found' });
        }

        await referralRef.update({
            pendingApproval: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Notify user
        try {
            await NotificationService.createNotification(
                userId,
                'Referral Reward Update',
                reason || 'Your referral reward request could not be approved at this time. Please contact support for details.',
                'referral_update',
                { reason }
            );
        } catch (e) {
            console.warn('Failed to send rejection notification:', e.message);
        }

        res.json({ success: true, message: 'Reward request handled.' });
    } catch (error) {
        console.error('Error rejecting reward:', error);
        res.status(500).json({ success: false, message: 'Failed to handle reward request' });
    }
});

export default router;
