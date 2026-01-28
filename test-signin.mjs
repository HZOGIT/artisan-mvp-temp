import fetch from 'node-fetch';

const payload = {
  email: 'test@example.com',
  password: 'Test123456'
};

console.log('Testing signin endpoint...');
console.log('Payload:', JSON.stringify(payload, null, 2));

try {
  const response = await fetch('http://localhost:3000/api/trpc/auth.signin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      json: payload
    })
  });

  const data = await response.json();
  console.log('Response status:', response.status);
  console.log('Response:', JSON.stringify(data, null, 2));
} catch (error) {
  console.error('Error:', error.message);
}
