const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const { TrafficViolation } = require('../models/TrafficViolation');
const Fine = require('../models/Fine');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/police-fine-system';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected for seeding');
  } catch (error) {
    console.error('Database connection error:', error);
    console.error('Make sure MongoDB is running and the connection string is correct');
    console.error('Current MONGODB_URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/police-fine-system');
    process.exit(1);
  }
};

// Sample users
const sampleUsers = [
  {
    username: 'admin',
    email: 'admin@police.lk',
    password: 'password123',
    role: 'admin',
    profile: {
      firstName: 'System',
      lastName: 'Administrator',
      phoneNumber: '+94 11 123 4567'
    }
  },
  {
    username: 'officer1',
    email: 'officer@police.lk',
    password: 'password123',
    role: 'police_officer',
    profile: {
      firstName: 'Nimal',
      lastName: 'Perera',
      phoneNumber: '+94 77 123 4567',
      badgeNumber: 'PO001'
    }
  },
  {
    username: 'officer2',
    email: 'officer2@police.lk',
    password: 'password123',
    role: 'police_officer',
    profile: {
      firstName: 'Sunil',
      lastName: 'Silva',
      phoneNumber: '+94 77 234 5678',
      badgeNumber: 'PO002'
    }
  },
  {
    username: 'driver1',
    email: 'driver@example.com',
    password: 'password123',
    role: 'driver',
    profile: {
      firstName: 'Kamal',
      lastName: 'Fernando',
      phoneNumber: '+94 71 123 4567',
      licenseNumber: 'B1234567'
    }
  },
  {
    username: 'driver2',
    email: 'driver2@example.com',
    password: 'password123',
    role: 'driver',
    profile: {
      firstName: 'Saman',
      lastName: 'Jayawardena',
      phoneNumber: '+94 71 234 5678',
      licenseNumber: 'B2345678'
    }
  }
];

// Sample traffic violations
const sampleViolations = [
  {
    name: 'Speeding (10-20 km/h over limit)',
    code: 'SP001',
    description: 'Exceeding speed limit by 10-20 km/h',
    fineAmount: 2500,
    currency: 'LKR',
    severityLevel: 'Minor',
    category: 'Speeding',
    points: 2,
    isActive: true
  },
  {
    name: 'Speeding (20-40 km/h over limit)',
    code: 'SP002',
    description: 'Exceeding speed limit by 20-40 km/h',
    fineAmount: 5000,
    currency: 'LKR',
    severityLevel: 'Low',
    category: 'Speeding',
    points: 4,
    isActive: true
  },
  {
    name: 'Reckless Driving',
    code: 'RD001',
    description: 'Driving in a reckless manner endangering public safety',
    fineAmount: 15000,
    currency: 'LKR',
    severityLevel: 'Severe',
    category: 'Reckless Driving',
    points: 8,
    isActive: true
  },
  {
    name: 'Running Red Light',
    code: 'RL001',
    description: 'Failing to stop at a red traffic signal',
    fineAmount: 7500,
    currency: 'LKR',
    severityLevel: 'Low',
    category: 'Traffic Signal',
    points: 5,
    isActive: true
  },
  {
    name: 'Illegal Parking',
    code: 'PK001',
    description: 'Parking in a no-parking zone or blocking traffic',
    fineAmount: 1500,
    currency: 'LKR',
    severityLevel: 'Minor',
    category: 'Parking',
    points: 1,
    isActive: true
  },
  {
    name: 'No Valid License',
    code: 'DL001',
    description: 'Driving without a valid driving license',
    fineAmount: 10000,
    currency: 'LKR',
    severityLevel: 'Severe',
    category: 'Documentation',
    points: 6,
    isActive: true
  },
  {
    name: 'Drunk Driving',
    code: 'DUI001',
    description: 'Driving under the influence of alcohol',
    fineAmount: 25000,
    currency: 'LKR',
    severityLevel: 'DeathSevere',
    category: 'DUI',
    points: 10,
    isActive: true
  },
  {
    name: 'Lane Violation',
    code: 'LV001',
    description: 'Improper lane changing or driving in wrong lane',
    fineAmount: 3000,
    currency: 'LKR',
    severityLevel: 'Minor',
    category: 'Lane Violation',
    points: 2,
    isActive: true
  },
  {
    name: 'Vehicle Condition Violation',
    code: 'VC001',
    description: 'Vehicle not meeting safety standards',
    fineAmount: 5000,
    currency: 'LKR',
    severityLevel: 'Low',
    category: 'Vehicle Condition',
    points: 3,
    isActive: true
  },
  {
    name: 'Mobile Phone Usage',
    code: 'MP001',
    description: 'Using mobile phone while driving',
    fineAmount: 2000,
    currency: 'LKR',
    severityLevel: 'Minor',
    category: 'Other',
    points: 2,
    isActive: true
  }
];

// Seed function
const seedDatabase = async () => {
  try {
    console.log('Starting database seeding...');

    // Clear existing data
    await User.deleteMany({});
    await TrafficViolation.deleteMany({});
    await Fine.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    const createdUsers = [];
    for (const userData of sampleUsers) {
      // Rely on User model pre-save hook to hash password
      const user = new User({
        ...userData
      });
      const savedUser = await user.save();
      createdUsers.push(savedUser);
      console.log(`Created user: ${userData.username} (${userData.role})`);
    }

    // Find admin user for violations
    const adminUser = createdUsers.find(user => user.role === 'admin');

    // Create traffic violations
    const createdViolations = [];
    for (const violationData of sampleViolations) {
      const violation = new TrafficViolation({
        ...violationData,
        createdBy: adminUser._id
      });
      const savedViolation = await violation.save();
      createdViolations.push(savedViolation);
      console.log(`Created violation: ${violationData.name}`);
    }

    // Create sample fines
    const officers = createdUsers.filter(user => user.role === 'police_officer');
    const drivers = createdUsers.filter(user => user.role === 'driver');

    if (officers.length > 0 && drivers.length > 0 && createdViolations.length > 0) {
      const sampleFines = [
        {
          driverId: drivers[0]._id,
          policeOfficer: officers[0]._id,
          violationId: createdViolations[0]._id, // Speeding
          fineAmount: createdViolations[0].fineAmount,
          currency: 'LKR',
          violationMessage: 'Caught speeding at 75 km/h in a 60 km/h zone on Galle Road',
          location: {
            googleLocation: {
              lat: 6.9271,
              lng: 79.8612
            },
            address: 'Galle Road, Colombo 03',
            city: 'Colombo',
            province: 'Western'
          },
          vehicleInfo: {
            licensePlate: 'CAB-1234',
            vehicleType: 'Car',
            make: 'Toyota',
            model: 'Corolla',
            color: 'White'
          },
          status: 'pending',
          tags: ['speeding', 'highway']
        },
        {
          driverId: drivers[1]._id,
          policeOfficer: officers[1]._id,
          violationId: createdViolations[3]._id, // Running Red Light
          fineAmount: createdViolations[3].fineAmount,
          currency: 'LKR',
          violationMessage: 'Failed to stop at red light at Liberty Junction',
          location: {
            googleLocation: {
              lat: 6.9147,
              lng: 79.8731
            },
            address: 'Liberty Junction, Colombo 04',
            city: 'Colombo',
            province: 'Western'
          },
          vehicleInfo: {
            licensePlate: 'CAR-5678',
            vehicleType: 'Car',
            make: 'Honda',
            model: 'Civic',
            color: 'Blue'
          },
          status: 'paid',
          paymentInfo: {
            paymentMethod: 'stripe',
            paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
            transactionId: 'txn_sample123'
          },
          tags: ['red-light', 'junction']
        },
        {
          driverId: drivers[0]._id,
          policeOfficer: officers[0]._id,
          violationId: createdViolations[4]._id, // Illegal Parking
          fineAmount: createdViolations[4].fineAmount,
          currency: 'LKR',
          violationMessage: 'Vehicle parked in no-parking zone near hospital entrance',
          location: {
            googleLocation: {
              lat: 6.9022,
              lng: 79.8607
            },
            address: 'National Hospital, Colombo 10',
            city: 'Colombo',
            province: 'Western'
          },
          vehicleInfo: {
            licensePlate: 'CAB-1234',
            vehicleType: 'Car',
            make: 'Toyota',
            model: 'Corolla',
            color: 'White'
          },
          status: 'overdue',
          dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days overdue
          tags: ['parking', 'hospital']
        }
      ];

      for (const fineData of sampleFines) {
        const fine = new Fine(fineData);
        await fine.save();
        console.log(`Created fine: ${fineData.violationMessage.substring(0, 50)}...`);
      }
    }

    console.log('Database seeding completed successfully!');
    console.log('\nDemo accounts created:');
    console.log('Admin: admin@police.lk / password123');
    console.log('Police Officer: officer@police.lk / password123');
    console.log('Driver: driver@example.com / password123');

  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run seeding
if (require.main === module) {
  connectDB().then(() => {
    seedDatabase();
  });
}

module.exports = { seedDatabase, connectDB };