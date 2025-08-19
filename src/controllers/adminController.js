// src/controllers/adminController.js

// IMPORTANT: You need to define these Mongoose models based on your database schema.
// These are placeholder imports. Make sure the path is correct.
import User from '../models/User.js';
import Quote from '../models/Quote.js';
import Message from '../models/Message.js';

/**
 * Fetches statistics for the admin dashboard.
 */
export const getDashboardStats = async (req, res, next) => {
    try {
        const [userCount, quoteCount, messageCount] = await Promise.all([
            User.countDocuments(),
            Quote.countDocuments(),
            Message.countDocuments()
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quoteCount,
                totalMessages: messageCount,
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all users, excluding their passwords.
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching all users:', error);
        next(error);
    }
};

/**
 * Updates the status of a specific user.
 */
export const updateUserStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required.' });
        }

        const updatedUser = await User.findByIdAndUpdate(userId, { status }, { new: true }).select('-password');
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.status(200).json({ success: true, message: `User status updated to ${status}.`, user: updatedUser });
    } catch (error) {
        console.error('Error updating user status:', error);
        next(error);
    }
};

/**
 * Deletes a user from the database.
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Error deleting user:', error);
        next(error);
    }
};

/**
 * Retrieves system statistics.
 */
export const getSystemStats = (req, res) => {
    res.status(200).json({
        success: true,
        stats: {
            nodeVersion: process.version,
            platform: process.platform,
            serverUptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
        }
    });
};