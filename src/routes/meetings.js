// src/routes/meetings.js - Meeting scheduling for project tracking
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import { sendMeetingInvitationEmail, sendMeetingUpdateEmail, sendMeetingCancellationEmail } from '../utils/emailService.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// CREATE a new meeting
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { jobId, title, description, meetingDate, meetingTime, duration, location, meetingType, attendeeIds, agenda } = req.body;
        const organizerId = req.user.userId;

        if (!title || !meetingDate || !meetingTime) {
            return res.status(400).json({ success: false, message: 'Title, date, and time are required.' });
        }

        // Get organizer details
        const organizerDoc = await adminDb.collection('users').doc(organizerId).get();
        if (!organizerDoc.exists) {
            return res.status(404).json({ success: false, message: 'Organizer not found.' });
        }
        const organizer = { id: organizerId, ...organizerDoc.data() };

        // Parse meeting datetime
        const meetingDateTime = new Date(`${meetingDate}T${meetingTime}`);
        const endDateTime = new Date(meetingDateTime.getTime() + (parseInt(duration) || 60) * 60000);

        // Build attendee list with details
        const attendees = [];
        const allAttendeeIds = attendeeIds || [];

        // If jobId provided, get job details and auto-add relevant users
        let jobData = null;
        if (jobId) {
            const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
            if (jobDoc.exists) {
                jobData = { id: jobId, ...jobDoc.data() };
                // Auto-add poster and assigned designer if not already in list
                if (jobData.posterId && !allAttendeeIds.includes(jobData.posterId) && jobData.posterId !== organizerId) {
                    allAttendeeIds.push(jobData.posterId);
                }
                if (jobData.assignedTo && !allAttendeeIds.includes(jobData.assignedTo) && jobData.assignedTo !== organizerId) {
                    allAttendeeIds.push(jobData.assignedTo);
                }
            }
        }

        // Fetch attendee details
        for (const uid of allAttendeeIds) {
            try {
                const userDoc = await adminDb.collection('users').doc(uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    attendees.push({
                        id: uid,
                        name: userData.name || 'User',
                        email: userData.email,
                        type: userData.type,
                        status: 'pending' // pending, accepted, declined
                    });
                }
            } catch (e) { /* skip invalid user */ }
        }

        const meetingData = {
            title,
            description: description || '',
            jobId: jobId || null,
            jobTitle: jobData?.title || null,
            organizerId,
            organizerName: organizer.name,
            organizerEmail: organizer.email,
            organizerType: organizer.type,
            meetingDate,
            meetingTime,
            meetingDateTime: meetingDateTime.toISOString(),
            endDateTime: endDateTime.toISOString(),
            duration: parseInt(duration) || 60,
            location: location || 'Online',
            meetingType: meetingType || 'project_discussion',
            agenda: agenda || '',
            attendees,
            status: 'scheduled', // scheduled, in_progress, completed, cancelled
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const meetingRef = await adminDb.collection('meetings').add(meetingData);
        const meetingId = meetingRef.id;

        // Send notifications and emails to all attendees
        for (const attendee of attendees) {
            // In-app notification
            try {
                await NotificationService.createNotification(
                    attendee.id,
                    'Meeting Invitation',
                    `${organizer.name} invited you to "${title}" on ${new Date(meetingDateTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${meetingTime}`,
                    'meeting',
                    {
                        action: 'meeting_invitation',
                        meetingId,
                        organizerId,
                        organizerName: organizer.name,
                        meetingTitle: title,
                        meetingDate,
                        meetingTime,
                        jobId: jobId || null,
                        jobTitle: jobData?.title || null
                    }
                );
            } catch (notifErr) {
                console.error('Failed to send meeting notification:', notifErr);
            }

            // Email invitation
            try {
                await sendMeetingInvitationEmail(attendee, {
                    id: meetingId,
                    ...meetingData
                }, organizer);
            } catch (emailErr) {
                console.error('Failed to send meeting email:', emailErr);
            }
        }

        // Confirmation notification to organizer
        await NotificationService.createNotification(
            organizerId,
            'Meeting Scheduled',
            `Your meeting "${title}" has been scheduled for ${new Date(meetingDateTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${meetingTime}`,
            'meeting',
            {
                action: 'meeting_scheduled_confirmation',
                meetingId,
                meetingTitle: title,
                meetingDate,
                meetingTime,
                attendeeCount: attendees.length
            }
        );

        console.log(`✅ Meeting created: ${meetingId} by ${organizer.name}`);

        res.status(201).json({
            success: true,
            message: 'Meeting scheduled successfully. Invitations have been sent.',
            data: { id: meetingId, ...meetingData }
        });
    } catch (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to schedule meeting.' });
    }
});

// GET meetings for current user (as organizer or attendee)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { status, jobId } = req.query;

        // Get meetings where user is organizer
        let organizerQuery = adminDb.collection('meetings').where('organizerId', '==', userId);
        const organizerSnapshot = await organizerQuery.get();

        // Get all meetings and filter for attendee
        const allMeetingsSnapshot = await adminDb.collection('meetings').get();

        const meetingsMap = new Map();

        // Add organizer meetings
        organizerSnapshot.docs.forEach(doc => {
            meetingsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // Add meetings where user is an attendee
        allMeetingsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.attendees?.some(a => a.id === userId)) {
                meetingsMap.set(doc.id, { id: doc.id, ...data });
            }
        });

        let meetings = Array.from(meetingsMap.values());

        // Filter by status
        if (status && status !== 'all') {
            meetings = meetings.filter(m => m.status === status);
        }

        // Filter by job
        if (jobId) {
            meetings = meetings.filter(m => m.jobId === jobId);
        }

        // Sort by meeting date (upcoming first)
        meetings.sort((a, b) => new Date(a.meetingDateTime) - new Date(b.meetingDateTime));

        res.json({ success: true, data: meetings });
    } catch (error) {
        console.error('Error fetching meetings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch meetings.' });
    }
});

// GET single meeting
router.get('/:meetingId', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const meetingDoc = await adminDb.collection('meetings').doc(meetingId).get();

        if (!meetingDoc.exists) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        res.json({ success: true, data: { id: meetingDoc.id, ...meetingDoc.data() } });
    } catch (error) {
        console.error('Error fetching meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch meeting.' });
    }
});

// UPDATE meeting (reschedule)
router.put('/:meetingId', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const userId = req.user.userId;
        const { title, description, meetingDate, meetingTime, duration, location, agenda, status } = req.body;

        const meetingDoc = await adminDb.collection('meetings').doc(meetingId).get();
        if (!meetingDoc.exists) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        const existingMeeting = meetingDoc.data();

        // Only organizer can update
        if (existingMeeting.organizerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the organizer can update this meeting.' });
        }

        const updateData = { updatedAt: new Date().toISOString() };

        if (title) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (location) updateData.location = location;
        if (agenda !== undefined) updateData.agenda = agenda;
        if (status) updateData.status = status;

        // Handle date/time changes
        const newDate = meetingDate || existingMeeting.meetingDate;
        const newTime = meetingTime || existingMeeting.meetingTime;
        const newDuration = duration || existingMeeting.duration;

        if (meetingDate || meetingTime || duration) {
            const meetingDateTime = new Date(`${newDate}T${newTime}`);
            const endDateTime = new Date(meetingDateTime.getTime() + parseInt(newDuration) * 60000);
            updateData.meetingDate = newDate;
            updateData.meetingTime = newTime;
            updateData.duration = parseInt(newDuration);
            updateData.meetingDateTime = meetingDateTime.toISOString();
            updateData.endDateTime = endDateTime.toISOString();
        }

        await adminDb.collection('meetings').doc(meetingId).update(updateData);

        // Notify attendees about update
        const isRescheduled = meetingDate || meetingTime;
        for (const attendee of existingMeeting.attendees || []) {
            try {
                await NotificationService.createNotification(
                    attendee.id,
                    isRescheduled ? 'Meeting Rescheduled' : 'Meeting Updated',
                    isRescheduled
                        ? `"${updateData.title || existingMeeting.title}" has been rescheduled to ${new Date(`${newDate}T${newTime}`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${newTime}`
                        : `"${updateData.title || existingMeeting.title}" details have been updated by ${existingMeeting.organizerName}`,
                    'meeting',
                    {
                        action: isRescheduled ? 'meeting_rescheduled' : 'meeting_updated',
                        meetingId,
                        organizerName: existingMeeting.organizerName,
                        meetingTitle: updateData.title || existingMeeting.title,
                        meetingDate: newDate,
                        meetingTime: newTime
                    }
                );

                // Send update email
                await sendMeetingUpdateEmail(attendee, {
                    id: meetingId,
                    ...existingMeeting,
                    ...updateData
                }, { name: existingMeeting.organizerName }, isRescheduled);
            } catch (err) {
                console.error('Failed to notify attendee about update:', err);
            }
        }

        res.json({ success: true, message: isRescheduled ? 'Meeting rescheduled successfully.' : 'Meeting updated successfully.' });
    } catch (error) {
        console.error('Error updating meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to update meeting.' });
    }
});

// CANCEL meeting
router.delete('/:meetingId', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const userId = req.user.userId;

        const meetingDoc = await adminDb.collection('meetings').doc(meetingId).get();
        if (!meetingDoc.exists) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        const meeting = meetingDoc.data();
        if (meeting.organizerId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the organizer can cancel this meeting.' });
        }

        await adminDb.collection('meetings').doc(meetingId).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // Notify attendees about cancellation
        for (const attendee of meeting.attendees || []) {
            try {
                await NotificationService.createNotification(
                    attendee.id,
                    'Meeting Cancelled',
                    `"${meeting.title}" scheduled for ${new Date(meeting.meetingDateTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} has been cancelled by ${meeting.organizerName}`,
                    'meeting',
                    {
                        action: 'meeting_cancelled',
                        meetingId,
                        organizerName: meeting.organizerName,
                        meetingTitle: meeting.title
                    }
                );

                await sendMeetingCancellationEmail(attendee, meeting, { name: meeting.organizerName });
            } catch (err) {
                console.error('Failed to notify attendee about cancellation:', err);
            }
        }

        res.json({ success: true, message: 'Meeting cancelled. All attendees have been notified.' });
    } catch (error) {
        console.error('Error cancelling meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel meeting.' });
    }
});

// RESPOND to meeting invitation (accept/decline)
router.patch('/:meetingId/respond', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const userId = req.user.userId;
        const { response } = req.body; // 'accepted' or 'declined'

        if (!['accepted', 'declined'].includes(response)) {
            return res.status(400).json({ success: false, message: 'Response must be "accepted" or "declined".' });
        }

        const meetingDoc = await adminDb.collection('meetings').doc(meetingId).get();
        if (!meetingDoc.exists) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        const meeting = meetingDoc.data();
        const attendees = meeting.attendees || [];
        const attendeeIndex = attendees.findIndex(a => a.id === userId);

        if (attendeeIndex === -1) {
            return res.status(403).json({ success: false, message: 'You are not an attendee of this meeting.' });
        }

        attendees[attendeeIndex].status = response;
        attendees[attendeeIndex].respondedAt = new Date().toISOString();

        await adminDb.collection('meetings').doc(meetingId).update({
            attendees,
            updatedAt: new Date().toISOString()
        });

        // Notify organizer about the response
        const respondent = attendees[attendeeIndex];
        await NotificationService.createNotification(
            meeting.organizerId,
            response === 'accepted' ? 'Meeting Accepted' : 'Meeting Declined',
            `${respondent.name} has ${response} your meeting invitation "${meeting.title}"`,
            'meeting',
            {
                action: `meeting_${response}`,
                meetingId,
                respondentId: userId,
                respondentName: respondent.name,
                meetingTitle: meeting.title
            }
        );

        res.json({ success: true, message: `Meeting invitation ${response}.` });
    } catch (error) {
        console.error('Error responding to meeting:', error);
        res.status(500).json({ success: false, message: 'Failed to respond to meeting.' });
    }
});

export default router;
