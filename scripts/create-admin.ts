import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from '../server/db';
import { users } from '../shared/schema';
import crypto from 'crypto';

async function createAdmin() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Usage: npm run create-admin <username> <password>');
    console.error('Example: npm run create-admin admin mySecurePassword123');
    process.exit(1);
  }

  try {
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const userId = `admin_${crypto.randomUUID()}`;
    const [adminUser] = await db.insert(users).values({
      id: userId,
      username,
      hashedPassword,
      authProvider: 'admin',
      role: 'admin',
      isVerified: true,
      subscriptionStatus: 'pro', // Admins get pro features
    }).returning();

    console.log('\n✅ Admin user created successfully!');
    console.log(`Username: ${username}`);
    console.log(`User ID: ${adminUser.id}`);
    console.log(`\nYou can now log in at: https://checkbyai.net/adminlogin`);
  } catch (error: any) {
    if (error.code === '23505') {
      console.error('\n❌ Error: Username already exists. Please choose a different username.');
    } else {
      console.error('\n❌ Error creating admin user:', error.message);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createAdmin();
