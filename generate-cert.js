// Script to generate a self-signed certificate for HTTPS development
// Run with: node generate-cert.js

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const certDir = join(process.cwd(), '.cert');

// Create .cert directory if it doesn't exist
if (!existsSync(certDir)) {
  mkdirSync(certDir, { recursive: true });
}

const keyPath = join(certDir, 'key.pem');
const certPath = join(certDir, 'cert.pem');

// Check if certificates already exist
if (existsSync(keyPath) && existsSync(certPath)) {
  console.log('Certificates already exist. Delete .cert/ directory to regenerate.');
  process.exit(0);
}

try {
  // Generate a self-signed certificate that works with localhost and IP addresses
  // This creates a certificate valid for 365 days
  const command = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"`;
  
  execSync(command, { stdio: 'inherit' });
  console.log('\n✅ Certificates generated successfully!');
  console.log(`   Key: ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('\n⚠️  Note: You may need to add your IP address to the certificate.');
  console.log('   If you still get SSL errors, try accessing via localhost instead of IP.');
} catch (error) {
  console.error('Error generating certificates:', error.message);
  console.log('\nMake sure OpenSSL is installed:');
  console.log('  Ubuntu/Debian: sudo apt install openssl');
  console.log('  macOS: Already installed');
  console.log('  Windows: Install from https://slproweb.com/products/Win32OpenSSL.html');
  process.exit(1);
}


