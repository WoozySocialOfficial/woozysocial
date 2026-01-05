// Simple test endpoint to check if serverless works
export default function handler(req, res) {
  res.json({
    message: "Serverless function is working!",
    timestamp: new Date().toISOString()
  });
}
