const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { body, validationResult, param } = require('express-validator');
const Fine = require('../models/Fine');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/payments/create-payment-intent:
 *   post:
 *     summary: Create Stripe payment intent for fine
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fineId
 *             properties:
 *               fineId:
 *                 type: string
 *                 description: Fine ID to pay
 *     responses:
 *       200:
 *         description: Payment intent created successfully
 *       404:
 *         description: Fine not found
 *       400:
 *         description: Fine cannot be paid
 *       403:
 *         description: Access denied
 */
router.post('/create-payment-intent', [
  authenticateToken,
  body('fineId').isMongoId().withMessage('Invalid fine ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fineId } = req.body;
    const currentUser = req.user;

    // Find the fine
    const fine = await Fine.findById(fineId)
      .populate('driverId', 'username profile.firstName profile.lastName')
      .populate('violationId', 'name code');

    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    // Check if user can pay this fine
    if (currentUser.role === 'driver' && fine.driverId._id.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        message: 'Access denied. You can only pay your own fines.'
      });
    }

    // Check if fine can be paid
    if (fine.status !== 'pending' && fine.status !== 'overdue') {
      return res.status(400).json({
        message: `Fine cannot be paid. Current status: ${fine.status}`
      });
    }

    // Convert amount to cents (Stripe expects amounts in smallest currency unit)
    const amountInCents = Math.round(fine.fineAmount * 100);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: fine.currency.toLowerCase(),
      metadata: {
        fineId: fine._id.toString(),
        driverId: fine.driverId._id.toString(),
        violationCode: fine.violationId.code,
        licensePlate: fine.vehicleInfo.licensePlate
      },
      description: `Traffic Fine Payment - ${fine.violationId.name} (${fine.vehicleInfo.licensePlate})`
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: fine.fineAmount,
      currency: fine.currency,
      fine: {
        id: fine._id,
        violationName: fine.violationId.name,
        licensePlate: fine.vehicleInfo.licensePlate,
        dueDate: fine.dueDate
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments/confirm-payment:
 *   post:
 *     summary: Confirm payment and update fine status
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *               - fineId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *               fineId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
 *       400:
 *         description: Payment failed or invalid
 *       404:
 *         description: Fine not found
 */
router.post('/confirm-payment', [
  authenticateToken,
  body('paymentIntentId').notEmpty().withMessage('Payment intent ID is required'),
  body('fineId').isMongoId().withMessage('Invalid fine ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { paymentIntentId, fineId } = req.body;
    const currentUser = req.user;

    // Find the fine
    const fine = await Fine.findById(fineId);
    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    // Check access permissions
    if (currentUser.role === 'driver' && fine.driverId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        message: 'Payment has not been completed successfully',
        paymentStatus: paymentIntent.status
      });
    }

    // Verify the payment intent matches the fine
    if (paymentIntent.metadata.fineId !== fineId) {
      return res.status(400).json({
        message: 'Payment intent does not match the fine'
      });
    }

    // Update fine status
    await fine.markAsPaid({
      paymentId: paymentIntentId,
      paymentMethod: 'stripe',
      transactionId: paymentIntent.charges.data[0]?.id,
      receiptUrl: paymentIntent.charges.data[0]?.receipt_url
    });

    // Add payment note
    await fine.addNote(
      `Payment completed via Stripe. Transaction ID: ${paymentIntent.charges.data[0]?.id}`,
      currentUser._id
    );

    res.json({
      message: 'Payment confirmed successfully',
      fine: {
        id: fine._id,
        status: fine.status,
        paidAt: fine.paymentInfo.paidAt,
        transactionId: fine.paymentInfo.transactionId
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);
        
        // Find and update the fine
        const fineId = paymentIntent.metadata.fineId;
        if (fineId) {
          const fine = await Fine.findById(fineId);
          if (fine && fine.status === 'pending') {
            await fine.markAsPaid({
              paymentId: paymentIntent.id,
              paymentMethod: 'stripe',
              transactionId: paymentIntent.charges.data[0]?.id,
              receiptUrl: paymentIntent.charges.data[0]?.receipt_url
            });
            console.log(`Fine ${fineId} marked as paid`);
          }
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('Payment failed:', failedPayment.id);
        // Could add logic to handle failed payments
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * @swagger
 * /api/payments/fine/{fineId}/receipt:
 *   get:
 *     summary: Get payment receipt for fine
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fineId
 *         required: true
 *         schema:
 *           type: string
 *         description: Fine ID
 *     responses:
 *       200:
 *         description: Receipt information retrieved
 *       404:
 *         description: Fine not found or not paid
 *       403:
 *         description: Access denied
 */
router.get('/fine/:fineId/receipt', [
  authenticateToken,
  param('fineId').isMongoId().withMessage('Invalid fine ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { fineId } = req.params;
    const currentUser = req.user;

    const fine = await Fine.findById(fineId)
      .populate('driverId', 'username profile.firstName profile.lastName')
      .populate('violationId', 'name code category')
      .populate('policeOfficer', 'username profile.firstName profile.lastName profile.badgeNumber');

    if (!fine) {
      return res.status(404).json({
        message: 'Fine not found'
      });
    }

    // Check access permissions
    if (currentUser.role === 'driver' && fine.driverId._id.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    if (fine.status !== 'paid') {
      return res.status(400).json({
        message: 'Fine has not been paid yet'
      });
    }

    // Generate receipt data
    const receipt = {
      fineId: fine.fineId,
      receiptNumber: `RCP-${fine.fineId.slice(-8).toUpperCase()}`,
      paymentDate: fine.paymentInfo.paidAt,
      amount: fine.fineAmount,
      currency: fine.currency,
      paymentMethod: fine.paymentInfo.paymentMethod,
      transactionId: fine.paymentInfo.transactionId,
      receiptUrl: fine.paymentInfo.receiptUrl,
      driver: {
        name: fine.driverId.fullName || fine.driverId.username,
        licenseNumber: fine.driverId.profile?.licenseNumber
      },
      violation: {
        name: fine.violationId.name,
        code: fine.violationId.code,
        category: fine.violationId.category
      },
      vehicle: {
        licensePlate: fine.vehicleInfo.licensePlate,
        type: fine.vehicleInfo.vehicleType
      },
      location: fine.location,
      issuedBy: {
        name: fine.policeOfficer.fullName || fine.policeOfficer.username,
        badgeNumber: fine.policeOfficer.profile?.badgeNumber
      },
      issuedDate: fine.createdAt
    };

    res.json({ receipt });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/payments/stats:
 *   get:
 *     summary: Get payment statistics
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Payment statistics retrieved
 */
router.get('/stats', authenticateToken, async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const currentUser = req.user;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Build match query based on user role
    let matchQuery = {
      status: 'paid',
      'paymentInfo.paidAt': { $gte: startDate }
    };

    if (currentUser.role === 'driver') {
      matchQuery.driverId = currentUser._id;
    } else if (currentUser.role === 'police_officer') {
      matchQuery.policeOfficer = currentUser._id;
    }
    // Admin can see all payment stats

    const stats = await Fine.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: '$fineAmount' },
          avgAmount: { $avg: '$fineAmount' }
        }
      }
    ]);

    const paymentMethods = await Fine.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$paymentInfo.paymentMethod',
          count: { $sum: 1 },
          amount: { $sum: '$fineAmount' }
        }
      }
    ]);

    res.json({
      period,
      totalPayments: stats[0]?.totalPayments || 0,
      totalAmount: stats[0]?.totalAmount || 0,
      averageAmount: stats[0]?.avgAmount || 0,
      paymentMethods
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;