// src/controllers/adminController.js
import admin from 'firebase-admin';

// Initialize Firestore
const db = admin.firestore();

// 📊 GET DASHBOARD STATS
export const getDashboardStats = async (req, res) => {
  try {
    console.log('📊 Admin dashboard stats requested by:', req.user.email);

    // Get counts from different collections
    const [usersSnapshot, jobsSnapshot, quotesSnapshot, messagesSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('jobs').get(),
      db.collection('quotes').get(),
      db.collection('messages').get()
    ]);

    // Calculate more detailed stats
    const users = [];
    const jobs = [];
    const quotes = [];
    const messages = [];

    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    jobsSnapshot.forEach(doc => jobs.push({ id: doc.id, ...doc.data() }));
    quotesSnapshot.forEach(doc => quotes.push({ id: doc.id, ...doc.data() }));
    messagesSnapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));

    // Get current date for recent activity calculations
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      totalUsers: usersSnapshot.size,
      totalJobs: jobsSnapshot.size,
      totalQuotes: quotesSnapshot.size,
      totalMessages: messagesSnapshot.size,
      
      // User stats
      activeUsers: users.filter(user => user.isActive !== false).length,
      adminUsers: users.filter(user => user.type === 'admin').length,
      regularUsers: users.filter(user => user.type === 'user').length,
      
      // Job stats
      pendingJobs: jobs.filter(job => job.status === 'pending').length,
      completedJobs: jobs.filter(job => job.status === 'completed').length,
      inProgressJobs: jobs.filter(job => job.status === 'in-progress').length,
      
      // Quote stats
      pendingQuotes: quotes.filter(quote => quote.status === 'pending').length,
      approvedQuotes: quotes.filter(quote => quote.status === 'approved').length,
      
      // Message stats
      unreadMessages: messages.filter(msg => !msg.isRead).length,
      readMessages: messages.filter(msg => msg.isRead).length,
      
      // Recent activity (last 7 days)
      recentActivity: {
        newUsers: users.filter(user => {
          const createdAt = user.createdAt?.toDate?.() || new Date(user.createdAt);
          return createdAt >= last7Days;
        }).length,
        newJobs: jobs.filter(job => {
          const createdAt = job.createdAt?.toDate?.() || new Date(job.createdAt);
          return createdAt >= last7Days;
        }).length,
        newQuotes: quotes.filter(quote => {
          const createdAt = quote.createdAt?.toDate?.() || new Date(quote.createdAt);
          return createdAt >= last7Days;
        }).length,
        newMessages: messages.filter(msg => {
          const createdAt = msg.createdAt?.toDate?.() || new Date(msg.createdAt);
          return createdAt >= last7Days;
        }).length
      },
      
      // Monthly activity (last 30 days)
      monthlyActivity: {
        newUsers: users.filter(user => {
          const createdAt = user.createdAt?.toDate?.() || new Date(user.createdAt);
          return createdAt >= last30Days;
        }).length,
        newJobs: jobs.filter(job => {
          const createdAt = job.createdAt?.toDate?.() || new Date(job.createdAt);
          return createdAt >= last30Days;
        }).length,
        newQuotes: quotes.filter(quote => {
          const createdAt = quote.createdAt?.toDate?.() || new Date(quote.createdAt);
          return createdAt >= last30Days;
        }).length
      }
    };

    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 👥 GET ALL USERS
export const getAllUsers = async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      userType,
      isActive 
    } = req.query;
    
    console.log('👥 Admin fetching users list:', { limit, offset, sortBy, sortOrder });

    let query = db.collection('users');
    
    // Apply filters
    if (userType) {
      query = query.where('type', '==', userType);
    }
    
    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }
    
    // Apply sorting
    const validSortFields = ['createdAt', 'email', 'lastLogin', 'updatedAt'];
    if (validSortFields.includes(sortBy)) {
      query = query.orderBy(sortBy, sortOrder === 'asc' ? 'asc' : 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }
    
    // Apply pagination
    if (offset && parseInt(offset) > 0) {
      query = query.offset(parseInt(offset));
    }
    
    if (limit && parseInt(limit) > 0) {
      query = query.limit(parseInt(limit));
    }

    const snapshot = await query.get();
    const users = [];

    snapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        email: userData.email,
        type: userData.type,
        isActive: userData.isActive,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
        updatedAt: userData.updatedAt
        // Don't include password hash
      });
    });

    // Get total count for pagination
    const totalQuery = db.collection('users');
    const totalSnapshot = await totalQuery.get();

    res.json({
      success: true,
      users: users,
      pagination: {
        total: totalSnapshot.size,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalSnapshot.size
      }
    });

  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🔄 UPDATE USER STATUS
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, notes } = req.body;

    console.log('🔄 Admin updating user status:', { 
      userId, 
      isActive, 
      admin: req.user.email 
    });

    // Validate input
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Don't allow admin to deactivate themselves
    if (userId === req.user.id && !isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    // Don't allow deactivating the last admin
    if (userData.type === 'admin' && !isActive) {
      const adminSnapshot = await db.collection('users')
        .where('type', '==', 'admin')
        .where('isActive', '==', true)
        .get();
      
      if (adminSnapshot.size <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the last active admin user'
        });
      }
    }

    const updateData = {
      isActive: isActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.id
    };

    if (notes) {
      updateData.adminNotes = notes;
    }

    await userRef.update(updateData);

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: userId,
        email: userData.email,
        isActive: isActive
      }
    });

  } catch (error) {
    console.error('❌ Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🗑️ DELETE USER
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmEmail } = req.body;

    console.log('🗑️ Admin attempting to delete user:', { 
      userId, 
      confirmEmail,
      admin: req.user.email 
    });

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    // Don't allow admin to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Email confirmation check for safety
    if (confirmEmail !== userData.email) {
      return res.status(400).json({
        success: false,
        message: 'Email confirmation does not match user email'
      });
    }

    // Don't allow deleting the last admin
    if (userData.type === 'admin') {
      const adminSnapshot = await db.collection('users')
        .where('type', '==', 'admin')
        .get();
      
      if (adminSnapshot.size <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }

    // Soft delete - mark as deleted instead of actually deleting
    await userRef.update({
      isDeleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: req.user.id,
      isActive: false
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
      deletedUser: {
        id: userId,
        email: userData.email,
        type: userData.type
      }
    });

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 📈 GET SYSTEM STATS
export const getSystemStats = async (req, res) => {
  try {
    console.log('📈 Admin requesting system stats');

    // Get database stats
    const collections = ['users', 'jobs', 'quotes', 'messages', 'estimations'];
    const collectionStats = {};

    for (const collection of collections) {
      try {
        const snapshot = await db.collection(collection).get();
        collectionStats[collection] = {
          total: snapshot.size,
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        collectionStats[collection] = {
          total: 0,
          error: 'Collection may not exist',
          lastUpdated: new Date().toISOString()
        };
      }
    }

    // System information
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    // Calculate storage usage (approximate)
    let totalDocuments = 0;
    Object.values(collectionStats).forEach(stat => {
      if (typeof stat.total === 'number') {
        totalDocuments += stat.total;
      }
    });

    const stats = {
      database: {
        collections: collectionStats,
        totalDocuments: totalDocuments,
        estimatedSize: `${(totalDocuments * 2).toFixed(2)} KB` // Rough estimate
      },
      system: systemInfo,
      performance: {
        averageResponseTime: '< 100ms', // You can implement actual monitoring
        uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
        status: 'healthy'
      }
    };

    res.json({
      success: true,
      stats: stats,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching system stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching system statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
