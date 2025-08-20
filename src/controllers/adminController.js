// src/controllers/adminController.js
// Mock admin controllers for Firebase setup

import { adminDb } from '../config/firebase.js';

// Mock data for development
const mockUsers = [
  {
    id: 'user1',
    name: 'John Contractor',
    email: 'john@example.com',
    role: 'contractor',
    createdAt: new Date('2024-01-15'),
    status: 'active'
  },
  {
    id: 'user2', 
    name: 'Jane Designer',
    email: 'jane@example.com',
    role: 'designer',
    createdAt: new Date('2024-02-10'),
    status: 'active'
  },
  {
    id: 'user3',
    name: 'Bob Client',
    email: 'bob@example.com', 
    role: 'client',
    createdAt: new Date('2024-03-05'),
    status: 'active'
  }
];

const mockJobs = [
  {
    id: 'job1',
    title: 'Steel Frame Construction',
    description: 'Commercial building steel framework',
    status: 'in_progress',
    contractorId: 'user1',
    clientId: 'user3',
    budget: 50000,
    createdAt: new Date('2024-07-01'),
    deadline: new Date('2024-09-15')
  },
  {
    id: 'job2',
    title: 'Residential Steel Beams',
    description: 'Home renovation steel support',
    status: 'completed',
    contractorId: 'user1', 
    clientId: 'user3',
    budget: 15000,
    createdAt: new Date('2024-06-15'),
    deadline: new Date('2024-08-01')
  }
];

const mockQuotes = [
  {
    id: 'quote1',
    title: 'Office Building Framework',
    description: 'Steel framework for 5-story office',
    amount: 125000,
    status: 'pending',
    contractorId: 'user1',
    clientId: 'user3',
    createdAt: new Date('2024-08-01'),
    validUntil: new Date('2024-09-01')
  }
];

const mockMessages = [
  {
    id: 'msg1',
    subject: 'Project Update',
    content: 'Steel delivery scheduled for next week',
    senderId: 'user1',
    receiverId: 'user3',
    jobId: 'job1',
    createdAt: new Date('2024-08-15'),
    read: false
  }
];

// Dashboard stats
export const getDashboardStats = async (req, res) => {
  try {
    console.log('Dashboard access granted to:', req.user.email);
    
    // In a real app, you'd query Firestore here
    // For now, return mock stats
    const stats = {
      totalUsers: mockUsers.length,
      totalJobs: mockJobs.length,
      totalQuotes: mockQuotes.length,
      totalMessages: mockMessages.filter(m => !m.read).length,
      
      // Revenue stats
      totalRevenue: mockJobs.reduce((sum, job) => sum + (job.budget || 0), 0),
      pendingQuotes: mockQuotes.filter(q => q.status === 'pending').length,
      activeJobs: mockJobs.filter(j => j.status === 'in_progress').length,
      
      // User breakdown
      usersByRole: {
        contractors: mockUsers.filter(u => u.role === 'contractor').length,
        designers: mockUsers.filter(u => u.role === 'designer').length,
        clients: mockUsers.filter(u => u.role === 'client').length,
        admins: 1
      },
      
      // Recent activity
      recentJobs: mockJobs.slice(0, 5),
      recentUsers: mockUsers.slice(0, 5),
      
      // Chart data
      monthlyRevenue: [
        { month: 'Jan', revenue: 25000 },
        { month: 'Feb', revenue: 30000 },
        { month: 'Mar', revenue: 35000 },
        { month: 'Apr', revenue: 28000 },
        { month: 'May', revenue: 42000 },
        { month: 'Jun', revenue: 38000 },
        { month: 'Jul', revenue: 45000 },
        { month: 'Aug', revenue: 52000 }
      ]
    };
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      note: 'Mock data - replace with Firestore queries'
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      details: error.message
    });
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    console.log('Users access granted to:', req.user.email);
    
    // Try to get from Firestore, fallback to mock data
    let users = mockUsers;
    
    try {
      // Attempt Firestore query
      const usersSnapshot = await adminDb.collection('users').get();
      if (!usersSnapshot.empty) {
        users = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (firestoreError) {
      console.log('Firestore query failed, using mock data:', firestoreError.message);
    }
    
    res.json({
      success: true,
      data: users,
      count: users.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      details: error.message
    });
  }
};

// Get all jobs
export const getAllJobs = async (req, res) => {
  try {
    console.log('Jobs access granted to:', req.user.email);
    
    let jobs = mockJobs;
    
    try {
      const jobsSnapshot = await adminDb.collection('jobs').get();
      if (!jobsSnapshot.empty) {
        jobs = jobsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (firestoreError) {
      console.log('Firestore query failed, using mock data:', firestoreError.message);
    }
    
    res.json({
      success: true,
      data: jobs,
      count: jobs.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs',
      details: error.message
    });
  }
};

// Get all quotes
export const getAllQuotes = async (req, res) => {
  try {
    console.log('Quotes access granted to:', req.user.email);
    
    let quotes = mockQuotes;
    
    try {
      const quotesSnapshot = await adminDb.collection('quotes').get();
      if (!quotesSnapshot.empty) {
        quotes = quotesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (firestoreError) {
      console.log('Firestore query failed, using mock data:', firestoreError.message);
    }
    
    res.json({
      success: true,
      data: quotes,
      count: quotes.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Quotes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotes',
      details: error.message
    });
  }
};

// Get all messages
export const getAllMessages = async (req, res) => {
  try {
    console.log('Messages access granted to:', req.user.email);
    
    let messages = mockMessages;
    
    try {
      const messagesSnapshot = await adminDb.collection('messages').get();
      if (!messagesSnapshot.empty) {
        messages = messagesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
    } catch (firestoreError) {
      console.log('Firestore query failed, using mock data:', firestoreError.message);
    }
    
    res.json({
      success: true,
      data: messages,
      count: messages.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      details: error.message
    });
  }
};

// Subscription plans (mock)
export const getSubscriptionPlans = async (req, res) => {
  try {
    console.log('Subscription plans access granted to:', req.user.email);
    
    const plans = [
      {
        id: 'basic',
        name: 'Basic Plan',
        price: 29.99,
        features: ['Basic steel calculations', 'Up to 5 projects', 'Email support'],
        active: true
      },
      {
        id: 'pro', 
        name: 'Professional Plan',
        price: 79.99,
        features: ['Advanced calculations', 'Unlimited projects', 'Priority support', '3D modeling'],
        active: true
      },
      {
        id: 'enterprise',
        name: 'Enterprise Plan', 
        price: 199.99,
        features: ['Custom solutions', 'Team collaboration', 'API access', 'Dedicated support'],
        active: true
      }
    ];
    
    res.json({
      success: true,
      data: plans,
      count: plans.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Subscription plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription plans'
    });
  }
};

// Subscriptions (mock)
export const getSubscriptions = async (req, res) => {
  try {
    console.log('Subscriptions access granted to:', req.user.email);
    
    const subscriptions = [
      {
        id: 'sub1',
        userId: 'user1',
        planId: 'pro',
        status: 'active',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2025-01-15'),
        amount: 79.99
      },
      {
        id: 'sub2',
        userId: 'user2', 
        planId: 'basic',
        status: 'active',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2025-03-01'),
        amount: 29.99
      }
    ];
    
    res.json({
      success: true,
      data: subscriptions,
      count: subscriptions.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscriptions'
    });
  }
};

export default {
  getDashboardStats,
  getAllUsers,
  getAllJobs,
  getAllQuotes,
  getAllMessages,
  getSubscriptionPlans,
  getSubscriptions
};
