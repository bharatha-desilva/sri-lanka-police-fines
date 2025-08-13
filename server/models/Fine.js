const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const fineSchema = new mongoose.Schema({
  fineId: {
    type: String,
    default: uuidv4,
    unique: true,
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Driver ID is required']
  },
  policeOfficer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Police officer ID is required']
  },
  violationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrafficViolation',
    required: [true, 'Violation ID is required']
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
    enum: ['LKR', 'USD', 'EUR']
  },
  violationMessage: {
    type: String,
    required: [true, 'Violation message is required'],
    trim: true,
    maxlength: [1000, 'Violation message cannot exceed 1000 characters']
  },
  location: {
    googleLocation: {
      lat: {
        type: Number,
        required: [true, 'Latitude is required'],
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
      },
      lng: {
        type: Number,
        required: [true, 'Longitude is required'],
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
      }
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [50, 'City cannot exceed 50 characters']
    },
    province: {
      type: String,
      trim: true,
      maxlength: [50, 'Province cannot exceed 50 characters']
    }
  },
  vehicleInfo: {
    licensePlate: {
      type: String,
      required: [true, 'License plate is required'],
      uppercase: true,
      trim: true
    },
    vehicleType: {
      type: String,
      enum: ['Car', 'Motorcycle', 'Bus', 'Truck', 'Van', 'Three-Wheeler', 'Other'],
      required: [true, 'Vehicle type is required']
    },
    make: String,
    model: String,
    color: String
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'disputed', 'cancelled', 'overdue'],
    default: 'pending'
  },
  paymentInfo: {
    paymentId: String,
    paymentMethod: {
      type: String,
      enum: ['stripe', 'bank_transfer', 'cash', 'other']
    },
    paidAt: Date,
    transactionId: String,
    receiptUrl: String
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  evidence: [{
    type: {
      type: String,
      enum: ['photo', 'video', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  dueDate: {
    type: Date,
    required: true,
    default: function() {
      // Default due date is 30 days from creation
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  disputeInfo: {
    isDisputed: {
      type: Boolean,
      default: false
    },
    disputeReason: String,
    disputeDate: Date,
    disputeStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    disputeResolution: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date
  },
  notes: [{
    content: {
      type: String,
      required: true,
      maxlength: [500, 'Note cannot exceed 500 characters']
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
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
fineSchema.index({ fineId: 1 });
fineSchema.index({ driverId: 1 });
fineSchema.index({ policeOfficer: 1 });
fineSchema.index({ status: 1 });
fineSchema.index({ createdAt: -1 });
fineSchema.index({ dueDate: 1 });
fineSchema.index({ 'vehicleInfo.licensePlate': 1 });

// Compound indexes
fineSchema.index({ driverId: 1, status: 1 });
fineSchema.index({ policeOfficer: 1, createdAt: -1 });

// Virtual for formatted fine amount
fineSchema.virtual('formattedFineAmount').get(function() {
  const amountNumber = Number(this.fineAmount);
  const safeAmount = Number.isFinite(amountNumber) ? amountNumber : 0;
  const currency = this.currency || 'LKR';
  return `${currency} ${safeAmount.toLocaleString('en-US')}`;
});

// Virtual for overdue status
fineSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && new Date() > this.dueDate;
});

// Virtual for days until due
fineSchema.virtual('daysUntilDue').get(function() {
  if (this.status !== 'pending') return null;
  const today = new Date();
  const diffTime = this.dueDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Static method to find fines by driver
fineSchema.statics.findByDriver = function(driverId) {
  return this.find({ driverId }).populate('violationId policeOfficer', 'name code username profile.firstName profile.lastName');
};

// Static method to find fines by officer
fineSchema.statics.findByOfficer = function(officerId) {
  return this.find({ policeOfficer: officerId }).populate('driverId violationId', 'username profile.firstName profile.lastName name code');
};

// Static method to find overdue fines
fineSchema.statics.findOverdue = function() {
  return this.find({
    status: 'pending',
    dueDate: { $lt: new Date() }
  }).populate('driverId violationId');
};

// Instance method to mark as paid
fineSchema.methods.markAsPaid = function(paymentInfo) {
  this.status = 'paid';
  this.paymentInfo = {
    ...this.paymentInfo,
    ...paymentInfo,
    paidAt: new Date()
  };
  return this.save();
};

// Instance method to add note
fineSchema.methods.addNote = function(content, addedBy) {
  this.notes.push({
    content,
    addedBy,
    addedAt: new Date()
  });
  return this.save();
};

// Pre-save middleware to update status if overdue
fineSchema.pre('save', function(next) {
  if (this.status === 'pending' && new Date() > this.dueDate) {
    this.status = 'overdue';
  }
  next();
});

// Ensure virtual fields are serialized
fineSchema.set('toJSON', {
  virtuals: true
});

module.exports = mongoose.model('Fine', fineSchema);