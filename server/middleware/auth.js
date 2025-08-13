const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Access token is required',
        error: 'MISSING_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user and attach to request
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token - user not found',
        error: 'INVALID_TOKEN'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated',
        error: 'ACCOUNT_DEACTIVATED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        error: 'INVALID_TOKEN'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        error: 'TOKEN_EXPIRED'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: 'SERVER_ERROR'
    });
  }
};

// Middleware to check user roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NOT_AUTHENTICATED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required roles: ${roles.join(', ')}`,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Middleware to check if user is admin
const requireAdmin = authorizeRoles('admin');

// Middleware to check if user is police officer or admin
const requirePoliceOrAdmin = authorizeRoles('police_officer', 'admin');

// Middleware to check if user can access driver data (driver themselves, police, or admin)
const canAccessDriverData = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const currentUser = req.user;

    // Admin and police officers can access any driver data
    if (currentUser.role === 'admin' || currentUser.role === 'police_officer') {
      return next();
    }

    // Drivers can only access their own data
    if (currentUser.role === 'driver') {
      if (driverId && driverId !== currentUser._id.toString()) {
        return res.status(403).json({ 
          message: 'Access denied. You can only access your own data',
          error: 'ACCESS_DENIED'
        });
      }
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied',
      error: 'ACCESS_DENIED'
    });
  } catch (error) {
    console.error('Access control error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: 'SERVER_ERROR'
    });
  }
};

// Middleware to validate resource ownership
const validateResourceOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const currentUser = req.user;

      // Admin can access everything
      if (currentUser.role === 'admin') {
        return next();
      }

      // Find the resource
      const resource = await resourceModel.findById(resourceId);
      if (!resource) {
        return res.status(404).json({ 
          message: 'Resource not found',
          error: 'RESOURCE_NOT_FOUND'
        });
      }

      // Check ownership based on resource type
      let hasAccess = false;

      if (resourceModel.modelName === 'Fine') {
        // For fines: drivers can access their own fines, police can access fines they created
        if (currentUser.role === 'driver' && resource.driverId.toString() === currentUser._id.toString()) {
          hasAccess = true;
        } else if (currentUser.role === 'police_officer' && resource.policeOfficer.toString() === currentUser._id.toString()) {
          hasAccess = true;
        }
      } else if (resourceModel.modelName === 'User') {
        // For users: can only access their own profile
        if (resource._id.toString() === currentUser._id.toString()) {
          hasAccess = true;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Access denied. You do not have permission to access this resource',
          error: 'ACCESS_DENIED'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Resource ownership validation error:', error);
      res.status(500).json({ 
        message: 'Internal server error',
        error: 'SERVER_ERROR'
      });
    }
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requirePoliceOrAdmin,
  canAccessDriverData,
  validateResourceOwnership,
  optionalAuth
};