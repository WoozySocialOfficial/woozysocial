// In production, API is on same domain. In development, use localhost:3001
const baseURL = import.meta.env.DEV ? "http://localhost:3001" : "";

export { baseURL };