// validation.js

// 1. Switched to ES Module 'import' syntax
import { body, validationResult } from 'express-validator';

// 2. Switched to ES Module 'export' syntax for each function/variable
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

export const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  body('type')
    .isIn(['contractor', 'designer', 'admin'])
    .withMessage('User type must be contractor, designer, or admin')
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

export const validateJob = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 20 })
    .withMessage('Description must be at least 20 characters'),
  body('budget')
    .isFloat({ min: 0 })
    .withMessage('Budget must be a positive number'),
  body('timeline')
    .isInt({ min: 1 })
    .withMessage('Timeline must be a positive integer'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required'),
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required')
];

export const validateQuote = [
  body('jobId')
    .trim()
    .notEmpty()
    .withMessage('Job ID is required'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Quote amount must be a positive number'),
  body('timeline')
    .isInt({ min: 1 })
    .withMessage('Timeline must be a positive integer'),
  body('description')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters')
];

export const validateMessage = [
  body('conversationId')
    .trim()
    .notEmpty()
    .withMessage('Conversation ID is required'),
  body('text')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Message text cannot be empty if provided')
];

// 3. Added the missing 'validateEstimationInput' export
export const validateEstimationInput = [
    body('jobId')
        .trim()
        .notEmpty()
        .withMessage('Job ID is required for estimation'),
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Estimated amount must be a positive number'),
    body('details')
        .trim()
        .isLength({ min: 10 })
        .withMessage('Estimation details must be at least 10 characters')
];

<<<<<<< HEAD
// 4. Removed the old 'module.exports' block
=======
// 4. Removed the old 'module.exports' block
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
