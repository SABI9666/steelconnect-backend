// src/controllers/adminController.js

import User from '../models/User.js';
import Quote from '../models/Quote.js';
import Message from '../models/Message.js';

/**
 * @async
 * @function getDashboardStats
 * @description Fetches aggregate statistics for the admin dashboard.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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
        console.error('Error in getDashboardStats:', error);
        next(error);
    }
};

/**
 * @async
 * @function getAllUsers
 * @description Retrieves a list of all users, excluding their passwords.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error in getAllUsers:', error);
        next(error);
    }
};

/**
 * @async
 * @function updateUserStatus
 * @description Updates the status of a specific user.
 * @param {object} req - Express request object containing userId in params and status in body.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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
        console.error('Error in updateUserStatus:', error);
        next(error);
    }
};

/**
 * @async
 * @function deleteUser
 * @description Deletes a user from the database.
 * @param {object} req - Express request object containing userId in params.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error)
        {
        console.error('Error in deleteUser:', error);
        next(error);
    }
};

/**
 * @function getSystemStats
 * @description Retrieves system statistics like Node.js version and memory usage.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {void}
 */
export const getSystemStats = (req, res) => {
    try {
        res.status(200).json({
            success: true,
            stats: {
                nodeVersion: process.version,
                platform: process.platform,
                serverUptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            }
        });
    } catch (error) {
        console.error('Error in getSystemStats:', error);
        // Although this is a sync function, calling next ensures consistency with async handlers
        next(error);
    }
};
