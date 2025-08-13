const mongoose = require('mongoose');

// Enum for severity levels
const SeverityLevel = {
  MINOR: 'Minor',
  LOW: 'Low',
  SEVERE: 'Severe',
  DEATH_SEVERE: 'DeathSevere'
};

const trafficViolationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Violation name is required'],
    trim: true,
    maxlength: [100, 'Violation name cannot exceed 100 characters']
  },
  code: {
    type: String,
    required: [true, 'Violation code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9-]+$/, 'Violation code must contain only uppercase letters, numbers, and hyphens']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  fineAmount: {
    type: Number,
    required: [true, 'Fine amount is required'],
    min: [0, 'Fine amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'LKR',
    uppercase: true,
    enum: ['LKR', 'USD', 'EUR'] // Sri Lankan Rupee as default
  },
  severityLevel: {
    type: String,
    required: [true, 'Severity level is required'],
    enum: Object.values(SeverityLevel),
    default: SeverityLevel.MINOR
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Speeding',
      'Parking',
      'Traffic Signal',
      'Lane Violation',
      'Vehicle Condition',
      'Documentation',
      'Reckless Driving',
      'DUI',
      'Other'
    ]
  },
  points: {
    type: Number,
    default: 0,
    min: [0, 'Points cannot be negative'],
    max: [10, 'Points cannot exceed 10']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
trafficViolationSchema.index({ code: 1 });
trafficViolationSchema.index({ severityLevel: 1 });
trafficViolationSchema.index({ category: 1 });
trafficViolationSchema.index({ isActive: 1 });

// Static method to find active violations
trafficViolationSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to find by severity
trafficViolationSchema.statics.findBySeverity = function(severity) {
  return this.find({ severityLevel: severity, isActive: true });
};

// Static method to find by category
trafficViolationSchema.statics.findByCategory = function(category) {
  return this.find({ category: category, isActive: true });
};

// Virtual for formatted fine amount
trafficViolationSchema.virtual('formattedFineAmount').get(function() {
  const amountNumber = Number(this.fineAmount);
  const safeAmount = Number.isFinite(amountNumber) ? amountNumber : 0;
  const currency = this.currency || 'LKR';
  return `${currency} ${safeAmount.toLocaleString('en-US')}`;
});

// Ensure virtual fields are serialized
trafficViolationSchema.set('toJSON', {
  virtuals: true
});

// Export the model and SeverityLevel enum
module.exports = {
  TrafficViolation: mongoose.model('TrafficViolation', trafficViolationSchema),
  SeverityLevel
};