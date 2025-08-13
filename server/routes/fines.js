const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Fine = require('../models/Fine');
const User = require('../models/User');
const { TrafficViolation } = require('../models/TrafficViolation');
const { authenticateToken, requirePoliceOrAdmin, canAccessDriverData } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/fines:
 *   get:
 *     summary: Get fines (filtered by user role)
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, paid, disputed, cancelled, overdue]
 *         description: Filter by status
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *         description: Filter by driver ID (admin/police only)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of fines per page
 *     responses:
 *       200:
 *         description: Fines retrieved successfully
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { status, driverId, page = 1, limit = 10 } = req.query;
    const currentUser = req.user;
    
    // Build query based on user role
    let query = {};
    
    if (currentUser.role === 'driver') {
      // Drivers can only see their own fines
      query.driverId = currentUser._id;
    } else if (currentUser.role === 'police_officer') {
      // Police officers can see fines they created or all fines (based on requirements)
      // For now, let's allow them to see all fines for monitoring purposes
      if (driverId) {
        query.driverId = driverId;
      }
    } else if (currentUser.role === 'admin') {
      // Admins can see all fines
      if (driverId) {
        query.driverId = driverId;
      }
    }

    if (status) {
      query.status = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get fines with pagination
    const fines = await Fine.find(query)
      .populate('driverId', 'username profile.firstName profile.lastName profile.licenseNumber')
      .populate('policeOfficer', 'username profile.firstName profile.lastName profile.badgeNumber')
      .populate('violationId', 'name code category severityLevel')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Fine.countDocuments(query);

    res.json({
      fines,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/fines/{id}:
 *   get:
 *     summary: Get fine by ID
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Fine ID
 *     responses:
 *       200:
 *         description: Fine retrieved successfully
 *       404:
 *         description: Fine not found
 *       403:
 *         description: Access denied
 */
router.get('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid fine ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const fine = await Fine.findById(req.params.id)
      .populate('driverId', 'username profile.firstName profile.lastName profile.licenseNumber profile.phoneNumber')
      .populate('policeOfficer', 'username profile.firstName profile.lastName profile.badgeNumber')
      .populate('violationId', 'name code description category severityLevel fineAmount')
      .populate('notes.addedBy', 'username profile.firstName profile.lastName');

    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    // Check access permissions
    const currentUser = req.user;
    if (currentUser.role === 'driver' && fine.driverId._id.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        message: 'Access denied. You can only view your own fines.'
      });
    }

    res.json({ fine });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/fines:
 *   post:
 *     summary: Create new fine (Police/Admin only)
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *               - violationId
 *               - violationMessage
 *               - location
 *               - vehicleInfo
 *             properties:
 *               driverId:
 *                 type: string
 *               violationId:
 *                 type: string
 *               violationMessage:
 *                 type: string
 *                 maxLength: 1000
 *               location:
 *                 type: object
 *                 required:
 *                   - googleLocation
 *                 properties:
 *                   googleLocation:
 *                     type: object
 *                     required:
 *                       - lat
 *                       - lng
 *                     properties:
 *                       lat:
 *                         type: number
 *                         minimum: -90
 *                         maximum: 90
 *                       lng:
 *                         type: number
 *                         minimum: -180
 *                         maximum: 180
 *                   address:
 *                     type: string
 *                   city:
 *                     type: string
 *                   province:
 *                     type: string
 *               vehicleInfo:
 *                 type: object
 *                 required:
 *                   - licensePlate
 *                   - vehicleType
 *                 properties:
 *                   licensePlate:
 *                     type: string
 *                   vehicleType:
 *                     type: string
 *                     enum: [Car, Motorcycle, Bus, Truck, Van, Three-Wheeler, Other]
 *                   make:
 *                     type: string
 *                   model:
 *                     type: string
 *                   color:
 *                     type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               customFineAmount:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Fine created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.post('/', [
  authenticateToken,
  requirePoliceOrAdmin,
  body('driverId').isMongoId().withMessage('Invalid driver ID'),
  body('violationId').isMongoId().withMessage('Invalid violation ID'),
  body('violationMessage')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Violation message is required and cannot exceed 1000 characters'),
  body('location.googleLocation.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.googleLocation.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('location.address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),
  body('vehicleInfo.licensePlate')
    .trim()
    .notEmpty()
    .withMessage('License plate is required'),
  body('vehicleInfo.vehicleType')
    .isIn(['Car', 'Motorcycle', 'Bus', 'Truck', 'Van', 'Three-Wheeler', 'Other'])
    .withMessage('Invalid vehicle type'),
  body('customFineAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Custom fine amount must be a positive number'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { driverId, violationId, customFineAmount, ...fineData } = req.body;

    // Verify driver exists
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        message: 'Driver not found'
      });
    }

    if (driver.role !== 'driver') {
      return res.status(400).json({
        message: 'Selected user is not a driver'
      });
    }

    // Verify violation exists
    const violation = await TrafficViolation.findById(violationId);
    if (!violation) {
      return res.status(404).json({
        message: 'Violation not found'
      });
    }

    if (!violation.isActive) {
      return res.status(400).json({
        message: 'Selected violation is not active'
      });
    }

    // Use custom fine amount if provided, otherwise use violation's default amount
    const fineAmount = customFineAmount || violation.fineAmount;

    const fine = new Fine({
      driverId,
      policeOfficer: req.user._id,
      violationId,
      fineAmount,
      currency: violation.currency,
      ...fineData
    });

    await fine.save();

    // Populate the fine before returning
    await fine.populate([
      { path: 'driverId', select: 'username profile.firstName profile.lastName profile.licenseNumber' },
      { path: 'policeOfficer', select: 'username profile.firstName profile.lastName profile.badgeNumber' },
      { path: 'violationId', select: 'name code category severityLevel' }
    ]);

    res.status(201).json({
      message: 'Fine created successfully',
      fine
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/fines/{id}/status:
 *   put:
 *     summary: Update fine status
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Fine ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, paid, disputed, cancelled, overdue]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       404:
 *         description: Fine not found
 *       403:
 *         description: Access denied
 */
router.put('/:id/status', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid fine ID'),
  body('status')
    .isIn(['pending', 'paid', 'disputed', 'cancelled', 'overdue'])
    .withMessage('Invalid status'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { status, reason } = req.body;
    const currentUser = req.user;

    const fine = await Fine.findById(req.params.id);
    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    // Check permissions
    if (currentUser.role === 'driver') {
      // Drivers can only dispute their own fines
      if (fine.driverId.toString() !== currentUser._id.toString()) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
      if (status !== 'disputed') {
        return res.status(403).json({
          message: 'Drivers can only dispute fines'
        });
      }
    }

    // Update status
    fine.status = status;

    // Handle dispute
    if (status === 'disputed') {
      fine.disputeInfo.isDisputed = true;
      fine.disputeInfo.disputeReason = reason;
      fine.disputeInfo.disputeDate = new Date();
      fine.disputeInfo.disputeStatus = 'pending';
    }

    // Add note if reason provided
    if (reason) {
      fine.notes.push({
        content: `Status changed to ${status}: ${reason}`,
        addedBy: currentUser._id
      });
    }

    await fine.save();

    res.json({
      message: 'Status updated successfully',
      fine
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/fines/{id}/notes:
 *   post:
 *     summary: Add note to fine
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Fine ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Note added successfully
 *       404:
 *         description: Fine not found
 *       403:
 *         description: Access denied
 */
router.post('/:id/notes', [
  authenticateToken,
  requirePoliceOrAdmin,
  param('id').isMongoId().withMessage('Invalid fine ID'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Note content is required and cannot exceed 500 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { content } = req.body;

    const fine = await Fine.findById(req.params.id);
    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    await fine.addNote(content, req.user._id);

    res.json({
      message: 'Note added successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/fines/stats/overview:
 *   get:
 *     summary: Get fine statistics
 *     tags: [Fines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats/overview', authenticateToken, async (req, res, next) => {
  try {
    const currentUser = req.user;
    let matchQuery = {};

    // Filter based on user role
    if (currentUser.role === 'driver') {
      matchQuery.driverId = currentUser._id;
    } else if (currentUser.role === 'police_officer') {
      matchQuery.policeOfficer = currentUser._id;
    }
    // Admin can see all stats

    const stats = await Fine.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$fineAmount' }
        }
      }
    ]);

    const totalFines = await Fine.countDocuments(matchQuery);
    const totalAmount = await Fine.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total: { $sum: '$fineAmount' } } }
    ]);

    const overdueFines = await Fine.countDocuments({
      ...matchQuery,
      status: 'pending',
      dueDate: { $lt: new Date() }
    });

    res.json({
      totalFines,
      totalAmount: totalAmount[0]?.total || 0,
      overdueFines,
      statusStats: stats
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;