const crypto = require('crypto');

function encrypt(text, password) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', crypto.createHash('sha256').update(password).digest().slice(0, 16), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText, password) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv('aes-128-cbc', crypto.createHash('sha256').update(password).digest().slice(0, 16), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// // Sử dụng các hàm
// const text = 'Chuỗi cần mã hóa';
// const password = 'Mật khẩu';
// const encryptedText = encrypt(text, password);
// console.log('Chuỗi đã mã hóa:', encryptedText);

// const decryptedText = decrypt(encryptedText, password);
// console.log('Chuỗi đã giải mã:', decryptedText);

module.exports = { encrypt, decrypt }
