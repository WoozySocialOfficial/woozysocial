// In production, API is at api.woozysocial.com. In development, use localhost:3001
// MODE is 'development' or 'production' - more reliable than DEV boolean
const baseURL = import.meta.env.MODE === 'development'
  ? "http://localhost:3001"
  : "https://api.woozysocial.com";

export { baseURL };