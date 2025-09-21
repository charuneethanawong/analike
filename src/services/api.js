import axios from 'axios';

// Finnhub API key should be stored in a .env file as VITE_FINNHUB_API_KEY
// It's accessed in Vite using import.meta.env
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY || 'd37s9hhr01qskrehlipgd37s9hhr01qskrehliq0';
const BASE_URL = 'https://finnhub.io/api/v1';

// Rate limiting and caching configuration
const RATE_LIMIT = {
  MAX_CALLS_PER_MINUTE: 30, // Finnhub free tier: 30 calls/minute
  MIN_INTERVAL: 2000, // 2 seconds between calls (safe margin)
  CACHE_DURATION: 60000, // 1 minute cache
  MAX_RETRIES: 2,
  RETRY_DELAY: 5000 // 5 seconds
};

// Smart caching system
const cache = new Map();
const requestQueue = new Map();
let lastApiCall = 0;
let callCount = 0;
let resetTime = Date.now() + 60000; // Reset counter every minute

// Local storage for price history
const PRICE_HISTORY_KEY = 'stock_price_history';
const MAX_HISTORY_DAYS = 90; // Keep 3 months of data

// Helper functions for rate limiting and caching
const resetCallCounter = () => {
  const now = Date.now();
  if (now >= resetTime) {
    callCount = 0;
    resetTime = now + 60000; // Reset every minute
  }
};

const canMakeApiCall = () => {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  // Reset counter if a minute has passed
  resetCallCounter();
  
  // Check if we can make a call
  return callCount < RATE_LIMIT.MAX_CALLS_PER_MINUTE && 
         timeSinceLastCall >= RATE_LIMIT.MIN_INTERVAL;
};

const waitForNextCall = () => {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  const waitTime = Math.max(0, RATE_LIMIT.MIN_INTERVAL - timeSinceLastCall);
  
  if (waitTime > 0) {
    console.log(`Rate limiting: waiting ${waitTime}ms before next API call`);
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }
  return Promise.resolve();
};

const getCacheKey = (symbol, resolution) => `${symbol}_${resolution}`;

const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < RATE_LIMIT.CACHE_DURATION) {
    console.log('Using cached data for', key);
    return cached.data;
  }
  return null;
};

const setCachedData = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Request deduplication
const deduplicateRequest = (key, requestFn) => {
  if (requestQueue.has(key)) {
    console.log('Deduplicating request for', key);
    return requestQueue.get(key);
  }
  
  const promise = requestFn().finally(() => {
    requestQueue.delete(key);
  });
  
  requestQueue.set(key, promise);
  return promise;
};

// Local storage functions for price history
const getPriceHistory = (symbol) => {
  try {
    const history = localStorage.getItem(`${PRICE_HISTORY_KEY}_${symbol}`);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error reading price history:', error);
    return [];
  }
};

const savePriceHistory = (symbol, priceData) => {
  try {
    const history = getPriceHistory(symbol);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Check if we already have data for today
    const existingIndex = history.findIndex(item => item.date === today);
    
    if (existingIndex >= 0) {
      // Update existing data
      history[existingIndex] = {
        date: today,
        price: priceData.currentPrice,
        change: priceData.change,
        changePercent: priceData.changePercent,
        high: priceData.high,
        low: priceData.low,
        open: priceData.open,
        previousClose: priceData.previousClose,
        timestamp: new Date().toISOString()
      };
    } else {
      // Add new data
      history.push({
        date: today,
        price: priceData.currentPrice,
        change: priceData.change,
        changePercent: priceData.changePercent,
        high: priceData.high,
        low: priceData.low,
        open: priceData.open,
        previousClose: priceData.previousClose,
        timestamp: new Date().toISOString()
      });
    }
    
    // Sort by date (oldest first)
    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Keep only last MAX_HISTORY_DAYS
    if (history.length > MAX_HISTORY_DAYS) {
      history.splice(0, history.length - MAX_HISTORY_DAYS);
    }
    
    localStorage.setItem(`${PRICE_HISTORY_KEY}_${symbol}`, JSON.stringify(history));
    console.log(`Saved price history for ${symbol}:`, history.length, 'days');
  } catch (error) {
    console.error('Error saving price history:', error);
  }
};

const generateHistoricalFromStoredData = (symbol, timeframe) => {
  const history = getPriceHistory(symbol);
  
  if (history.length === 0) {
    console.log('No stored history found for', symbol);
    return [];
  }
  
  // Convert stored data to chart format
  const chartData = history.map(item => ({
    time: new Date(item.date).toISOString(),
    price: item.price,
    high: item.high,
    low: item.low,
    open: item.open,
    close: item.price,
    volume: 0 // We don't have volume data
  }));
  
  console.log(`Generated ${chartData.length} data points from stored history for ${symbol}`);
  return chartData;
};

/**
 * Generates dummy data for the chart when a real-time API call fails.
 * This prevents the application from breaking and provides a fallback.
 */
const generateDummyData = (symbol, period = '1h') => {
  console.log("Generating dummy data due to API error.");
  const now = Date.now();
  const dummyData = [];
  const initialPrice = 150 + Math.random() * 50; // Random starting price
  const count = period === '1h' ? 50 : 20; // Fewer data points for daily

  for (let i = 0; i < count; i++) {
    const time = now - (i * 3600 * 1000); // 1 hour interval
    const price = initialPrice + (Math.sin(i / 5) * 20) + (Math.random() * 10 - 5);
    dummyData.unshift({
      time: new Date(time).toISOString(),
      price: price
    });
  }

  return {
    history: dummyData,
    lastUpdated: new Date().toISOString(),
    message: "Using dummy data due to API error. Please check your key or plan."
  };
};

/**
 * Fetches current stock price from Finnhub API.
 * Uses /quote endpoint which is working according to API status.
 *
 * @param {string} symbol - The stock symbol (e.g., 'AAPL').
 * @returns {Promise<Object>} The current stock price data.
 */
const getStockPrice = async (symbol) => {
  const cacheKey = getCacheKey(symbol, 'price');
  
  // Check cache first
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  // Check if we can make an API call
  if (!canMakeApiCall()) {
    await waitForNextCall();
  }
  
  const url = `${BASE_URL}/quote?symbol=${symbol}&token=${API_KEY}`;
  
  console.log('Fetching current price for:', symbol);
  console.log('API URL:', url);
  
  try {
    // Update rate limiting counters
    lastApiCall = Date.now();
    callCount++;
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('Quote API Response Status:', response.status);
    console.log('Quote API Response Data:', response.data);
    
    if (response.data && response.data.c) {
      const result = {
        currentPrice: response.data.c,
        change: response.data.d,
        changePercent: response.data.dp,
        high: response.data.h,
        low: response.data.l,
        open: response.data.o,
        previousClose: response.data.pc,
        lastUpdated: new Date().toISOString()
      };
      
      // Save to local storage for historical data
      savePriceHistory(symbol, result);
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      return result;
    } else {
      throw new Error('No data available for this symbol');
    }
  } catch (error) {
    console.error('Quote API call failed:', error.message);
    throw error;
  }
};

/**
 * Fetches historical stock data from Finnhub API.
 * Uses /stock/candle endpoint which is working according to API status.
 *
 * @param {string} symbol - The stock symbol (e.g., 'AAPL').
 * @param {string} timeframe - The timeframe ('1h' or '4h').
 * @returns {Promise<Object>} The historical stock data.
 */
const getStockHistory = async (symbol, timeframe) => {
  const cacheKey = getCacheKey(symbol, `history_${timeframe}`);
  
  // Check cache first
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  // Check if we can make an API call
  if (!canMakeApiCall()) {
    await waitForNextCall();
  }
  
  const now = Math.floor(Date.now() / 1000);
  const twoMonthsAgo = now - (60 * 24 * 60 * 60); // 2 months ago
  const resolution = timeframe === '1h' ? 'D' : 'D'; // Use daily for both timeframes
  
  const url = `${BASE_URL}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${twoMonthsAgo}&to=${now}&token=${API_KEY}`;
  
  console.log('Fetching historical data for:', symbol, 'timeframe:', timeframe);
  console.log('History API URL:', url);
  
  try {
    // Update rate limiting counters
    lastApiCall = Date.now();
    callCount++;
    
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('History API Response Status:', response.status);
    console.log('History API Response Data:', response.data);
    
    if (response.data && response.data.s === 'ok' && response.data.c) {
      const historicalData = response.data.c.map((close, index) => ({
        time: new Date(response.data.t[index] * 1000).toISOString(),
        price: close,
        volume: response.data.v[index] || 0
      }));
      
      const result = {
        history: historicalData,
        lastUpdated: new Date().toISOString()
      };
      
      // Cache the result
      setCachedData(cacheKey, result);
      
      return result;
    } else {
      throw new Error('No historical data available for this symbol');
    }
  } catch (error) {
    console.error('History API call failed:', error.message);
    throw error;
  }
};

/**
 * Main function to fetch all market data for the application.
 * Uses smart caching, rate limiting, and request deduplication for optimal performance.
 *
 * @param {string} symbol - The stock symbol.
 * @param {string} timeframe - The desired timeframe ('1h' or '4h').
 * @returns {Promise<Object>} The market data.
 */
export const getMarketData = async (symbol, timeframe) => {
  const requestKey = `${symbol}_${timeframe}`;
  
  // Use request deduplication to prevent multiple simultaneous calls
  return deduplicateRequest(requestKey, async () => {
    let retries = RATE_LIMIT.MAX_RETRIES;
    let delay = RATE_LIMIT.RETRY_DELAY;

    while (retries > 0) {
      try {
        // Get current price data (this works)
        const priceData = await getStockPrice(symbol);
        
        // Try to get historical data from stored data first
        let historicalData = generateHistoricalFromStoredData(symbol, timeframe);
        
        // If no stored data, generate from current price
        if (historicalData.length === 0) {
          console.log('No stored history, generating from current price');
          historicalData = generateHistoricalFromCurrent(priceData, timeframe);
        } else {
          console.log(`Using ${historicalData.length} stored data points`);
        }
        
        // Combine the data
        const result = {
          currentPrice: priceData.currentPrice,
          change24h: priceData.changePercent,
          lastUpdated: priceData.lastUpdated,
          history: historicalData
        };
        
        return result;
      } catch (err) {
        console.warn(`API call failed (${retries} retries left):`, err.message);
        
        if (err.response) {
          // API responded with a status code
          const status = err.response.status;
          if (status === 401 || status === 403) {
            throw new Error(`API access forbidden. Please check your API key or upgrade your plan.`);
          }
          if (status === 429) {
            console.warn('Rate limit hit, waiting before retry...');
            await new Promise(res => setTimeout(res, delay));
            delay *= 2; // Exponential backoff
          } else {
            console.warn(`API call failed with status ${status}. Retrying...`);
          }
        } else if (err.request) {
          // The request was made but no response was received
          console.warn(`Network error. Retrying...`);
        } else {
          // Something happened in setting up the request
          console.error('Error in request setup:', err.message);
          throw err;
        }
        
        retries--;
        if (retries > 0) {
          await new Promise(res => setTimeout(res, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }

    // Fallback to dummy data after all retries fail
    console.error("All API retries failed. Using dummy data.");
    return generateDummyData(symbol, timeframe);
  });
};

/**
 * Generates historical data from current price for chart display.
 * Since historical data is not available in free tier, we create a simple trend.
 */
const generateHistoricalFromCurrent = (priceData, timeframe) => {
  const now = new Date();
  const data = [];
  const currentPrice = priceData.currentPrice;
  const changePercent = priceData.changePercent || 0;
  
  // Generate 60 data points for 2 months
  const points = 60;
  const interval = timeframe === '1h' ? 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // Daily interval
  
  // Calculate starting price based on current change
  const startPrice = currentPrice / (1 + changePercent / 100);
  
  for (let i = 0; i < points; i++) {
    const time = new Date(now.getTime() - (points - i) * interval);
    const progress = i / (points - 1);
    
    // Create a realistic price progression
    const price = startPrice + (currentPrice - startPrice) * progress + 
                  (Math.sin(i / 10) * currentPrice * 0.02) + // Add some volatility
                  (Math.random() - 0.5) * currentPrice * 0.01; // Add random noise
    
    data.push({
      time: time.toISOString(),
      price: Math.round(price * 100) / 100
    });
  }
  
  return data;
};

// Export functions for debugging and management
export const getStoredPriceHistory = (symbol) => {
  return getPriceHistory(symbol);
};

export const clearPriceHistory = (symbol) => {
  try {
    if (symbol) {
      localStorage.removeItem(`${PRICE_HISTORY_KEY}_${symbol}`);
      console.log(`Cleared price history for ${symbol}`);
    } else {
      // Clear all price history
      const keys = Object.keys(localStorage).filter(key => key.startsWith(PRICE_HISTORY_KEY));
      keys.forEach(key => localStorage.removeItem(key));
      console.log('Cleared all price history');
    }
  } catch (error) {
    console.error('Error clearing price history:', error);
  }
};

export const getPriceHistoryStats = () => {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(PRICE_HISTORY_KEY));
    const stats = {};
    
    keys.forEach(key => {
      const symbol = key.replace(`${PRICE_HISTORY_KEY}_`, '');
      const history = getPriceHistory(symbol);
      stats[symbol] = {
        days: history.length,
        firstDate: history[0]?.date,
        lastDate: history[history.length - 1]?.date,
        lastPrice: history[history.length - 1]?.price
      };
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting price history stats:', error);
    return {};
  }
};