const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');

const checkAndCreateAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    // Check if admin user exists
    const adminUser = await User.findOne({ email: 'admin@police.lk' });
    
    if (adminUser) {
      console.log('Admin user already exists:', adminUser.email);
      console.log('Role:', adminUser.role);
      console.log('Active:', adminUser.isActive);
      
      // Test password
      const isPasswordValid = await adminUser.comparePassword('password123');
      console.log('Password test result:', isPasswordValid);
    } else {
      console.log('Admin user does not exist. Creating...');
      
      // Create admin user
      const hashedPassword = await bcrypt.hash('password123', 12);
      const newAdmin = new User({
        username: 'admin',
        email: 'admin@police.lk',
        password: hashedPassword,
        role: 'admin',
        profile: {
          firstName: 'System',
          lastName: 'Administrator',
          phoneNumber: '+94 11 123 4567'
        }
      });

      await newAdmin.save();
      console.log('Admin user created successfully!');
    }

    // List all users
    const allUsers = await User.find({}, 'username email role isActive');
    console.log('\nAll users in database:');
    allUsers.forEach(user => {
      console.log(`- ${user.email} (${user.username}) - Role: ${user.role}, Active: ${user.isActive}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

checkAndCreateAdmin();