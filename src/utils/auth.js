function extractPcTag(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const match = text.match(/\bPC-\d{5}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

module.exports = {
  extractPcTag,
  requireEnv
};
