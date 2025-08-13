const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { TrafficViolation, SeverityLevel } = require('../models/TrafficViolation');
const { authenticateToken, requireAdmin, requirePoliceOrAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/violations:
 *   get:
 *     summary: Get all traffic violations
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [Minor, Low, Severe, DeathSevere]
 *         description: Filter by severity level
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Violations retrieved successfully
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { category, severity } = req.query;
    const activeParam = req.query.active;
    
    // Build query
    const query = {};
    if (category) {
      query.category = category;
    }
    if (severity) {
      query.severityLevel = severity;
    }
    if (activeParam === undefined) {
      // Default to only active violations when param not provided
      query.isActive = true;
    } else {
      // Accept common truthy strings or boolean
      if (typeof activeParam === 'string') {
        query.isActive = ['true', '1', 'yes', 'on'].includes(activeParam.toLowerCase());
      } else {
        query.isActive = Boolean(activeParam);
      }
    }

    const violations = await TrafficViolation.find(query)
      .populate('createdBy', 'username profile.firstName profile.lastName')
      .sort({ category: 1, name: 1 });

    res.json({ violations });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/{id}:
 *   get:
 *     summary: Get violation by ID
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Violation ID
 *     responses:
 *       200:
 *         description: Violation retrieved successfully
 *       404:
 *         description: Violation not found
 */
router.get('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid violation ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const violation = await TrafficViolation.findById(req.params.id)
      .populate('createdBy', 'username profile.firstName profile.lastName');

    if (!violation) {
      return res.status(404).json({
        message: 'Violation not found'
      });
    }

    res.json({ violation });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations:
 *   post:
 *     summary: Create new traffic violation (Admin only)
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *               - fineAmount
 *               - severityLevel
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               fineAmount:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 enum: [LKR, USD, EUR]
 *               severityLevel:
 *                 type: string
 *                 enum: [Minor, Low, Severe, DeathSevere]
 *               category:
 *                 type: string
 *                 enum: [Speeding, Parking, Traffic Signal, Lane Violation, Vehicle Condition, Documentation, Reckless Driving, DUI, Other]
 *               points:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 10
 *     responses:
 *       201:
 *         description: Violation created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.post('/', [
  authenticateToken,
  requireAdmin,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name is required and cannot exceed 100 characters'),
  body('code')
    .trim()
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Code must contain only uppercase letters, numbers, and hyphens'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('fineAmount')
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Fine amount must be a positive number'),
  body('currency')
    .optional()
    .isIn(['LKR', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('severityLevel')
    .isIn(Object.values(SeverityLevel))
    .withMessage('Invalid severity level'),
  body('category')
    .isIn(['Speeding', 'Parking', 'Traffic Signal', 'Lane Violation', 'Vehicle Condition', 'Documentation', 'Reckless Driving', 'DUI', 'Other'])
    .withMessage('Invalid category'),
  body('points')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Points must be between 0 and 10')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const violationData = {
      ...req.body,
      createdBy: req.user._id
    };

    const violation = new TrafficViolation(violationData);
    await violation.save();

    await violation.populate('createdBy', 'username profile.firstName profile.lastName');

    res.status(201).json({
      message: 'Violation created successfully',
      violation
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/{id}:
 *   put:
 *     summary: Update traffic violation (Admin only)
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Violation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               fineAmount:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 enum: [LKR, USD, EUR]
 *               severityLevel:
 *                 type: string
 *                 enum: [Minor, Low, Severe, DeathSevere]
 *               category:
 *                 type: string
 *               points:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 10
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Violation updated successfully
 *       404:
 *         description: Violation not found
 *       403:
 *         description: Access denied
 */
router.put('/:id', [
  authenticateToken,
  requireAdmin,
  param('id').isMongoId().withMessage('Invalid violation ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('fineAmount')
    .optional()
    .isNumeric()
    .isFloat({ min: 0 })
    .withMessage('Fine amount must be a positive number'),
  body('currency')
    .optional()
    .isIn(['LKR', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('severityLevel')
    .optional()
    .isIn(Object.values(SeverityLevel))
    .withMessage('Invalid severity level'),
  body('points')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('Points must be between 0 and 10'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const violation = await TrafficViolation.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).populate('createdBy', 'username profile.firstName profile.lastName');

    if (!violation) {
      return res.status(404).json({
        message: 'Violation not found'
      });
    }

    res.json({
      message: 'Violation updated successfully',
      violation
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/{id}:
 *   delete:
 *     summary: Delete traffic violation (Admin only)
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Violation ID
 *     responses:
 *       200:
 *         description: Violation deleted successfully
 *       404:
 *         description: Violation not found
 *       403:
 *         description: Access denied
 */
router.delete('/:id', [
  authenticateToken,
  requireAdmin,
  param('id').isMongoId().withMessage('Invalid violation ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const violation = await TrafficViolation.findByIdAndDelete(req.params.id);

    if (!violation) {
      return res.status(404).json({
        message: 'Violation not found'
      });
    }

    res.json({
      message: 'Violation deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/categories:
 *   get:
 *     summary: Get all violation categories
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get('/meta/categories', authenticateToken, async (req, res, next) => {
  try {
    const categories = [
      'Speeding',
      'Parking',
      'Traffic Signal',
      'Lane Violation',
      'Vehicle Condition',
      'Documentation',
      'Reckless Driving',
      'DUI',
      'Other'
    ];

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/severity-levels:
 *   get:
 *     summary: Get all severity levels
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Severity levels retrieved successfully
 */
router.get('/meta/severity-levels', authenticateToken, async (req, res, next) => {
  try {
    res.json({ 
      severityLevels: Object.values(SeverityLevel)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/violations/stats:
 *   get:
 *     summary: Get violation statistics (Admin only)
 *     tags: [Violations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       403:
 *         description: Access denied
 */
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const stats = await TrafficViolation.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalFineAmount: { $sum: '$fineAmount' },
          avgFineAmount: { $avg: '$fineAmount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const severityStats = await TrafficViolation.aggregate([
      {
        $group: {
          _id: '$severityLevel',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalViolations = await TrafficViolation.countDocuments();
    const activeViolations = await TrafficViolation.countDocuments({ isActive: true });

    res.json({
      totalViolations,
      activeViolations,
      categoryStats: stats,
      severityStats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;