import bcrypt from 'bcryptjs';

const testEmail = 'test@example.com';
const testPassword = 'Test123456';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

const hashedPassword = await hashPassword(testPassword);

console.log('Test User Credentials:');
console.log('Email:', testEmail);
console.log('Password:', testPassword);
console.log('Hashed Password:', hashedPassword);
console.log('\nSQL INSERT:');
console.log(`INSERT INTO users (email, password, name, loginMethod, lastSignedIn) VALUES ('${testEmail}', '${hashedPassword}', 'Test User', 'email', NOW());`);
