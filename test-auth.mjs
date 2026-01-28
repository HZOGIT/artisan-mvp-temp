import { authenticateUser } from './server/_core/auth.ts';

console.log('Testing authenticateUser function...');

try {
  const user = await authenticateUser('test@example.com', 'Test123456');
  if (user) {
    console.log('✅ Authentication successful!');
    console.log('User:', user);
  } else {
    console.log('❌ Authentication failed: Invalid credentials');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}
