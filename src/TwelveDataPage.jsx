import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, Target, Wifi, WifiOff, Minus } from 'lucide-react';
import './App.css';

// Twelve Data API configuration
const TWELVE_DATA_API_KEY = '76806e5a99834821880a91f003b1f482';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// API optimization settings
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests
const MAX_CACHE_SIZE = 50; // Maximum cached responses

// Cache and rate limiting
let apiCache = new Map();
let lastRequestTime = 0;
let requestQueue = [];

// Cache management functions
const getCacheKey = (symbol, interval) => `${symbol}_${interval}`;

const getCachedData = (symbol, interval) => {
  const key = getCacheKey(symbol, interval);
  const cached = apiCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using cached data for:', key);
    return cached.data;
  }
  
  return null;
};

const setCachedData = (symbol, interval, data) => {
  const key = getCacheKey(symbol, interval);
  
  // Clean old cache if needed
  if (apiCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = apiCache.keys().next().value;
    apiCache.delete(oldestKey);
  }
  
  apiCache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  console.log('Cached data for:', key);
};

// API calls management functions
const getApiCallsKey = () => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  return `twelve_data_api_calls_${today}`;
};

const getApiCallsCount = () => {
  const key = getApiCallsKey();
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
};

const incrementApiCalls = () => {
  const key = getApiCallsKey();
  const currentCount = getApiCallsCount();
  const newCount = currentCount + 1;
  localStorage.setItem(key, newCount.toString());
  return newCount;
};

const resetApiCalls = () => {
  const key = getApiCallsKey();
  localStorage.setItem(key, '0');
  return 0;
};

const clearCache = () => {
  apiCache.clear();
  console.log('Cache cleared');
};

// Request deduplication
const deduplicateRequest = async (symbol, interval) => {
  const key = getCacheKey(symbol, interval);
  
  // Check if request is already in progress
  const existingRequest = requestQueue.find(req => req.key === key);
  if (existingRequest) {
    console.log('Request already in progress, waiting...');
    return existingRequest.promise;
  }
  
  // Create new request
  const requestPromise = makeApiRequest(symbol, interval);
  const request = { key, promise: requestPromise };
  requestQueue.push(request);
  
  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Remove from queue when done
    const index = requestQueue.findIndex(req => req.key === key);
    if (index > -1) {
      requestQueue.splice(index, 1);
    }
  }
};

// Rate limiting
const waitForRateLimit = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
};

// Make actual API request
const makeApiRequest = async (symbol, interval) => {
  await waitForRateLimit();
  
    const intervalMap = {
      '1min': '1min',
      '5min': '5min', 
      '15min': '15min',
      '30min': '30min',
    '60min': '1h',
    '4h': '4h',
    '1day': '1day',
    '1week': '1week',
    '1month': '1month'
    };
    
    const twelveDataInterval = intervalMap[interval] || '1h';
    const url = `${TWELVE_DATA_BASE_URL}/time_series?symbol=${symbol}&interval=${twelveDataInterval}&apikey=${TWELVE_DATA_API_KEY}&outputsize=100&format=JSON`;
    
  console.log('Making API request for:', symbol, interval);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'error') {
      throw new Error(`API Error: ${data.message}`);
    }
    
    if (!data.values || data.values.length === 0) {
      throw new Error(`No data available for symbol: ${symbol}`);
    }
    
  // Process data
    const chartData = data.values
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
      .map(item => ({
        time: new Date(item.datetime).toISOString(),
        price: parseFloat(item.close),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        open: parseFloat(item.open),
        volume: parseInt(item.volume) || 0
      }));
    
  const result = {
      data: chartData,
      lastUpdated: new Date().toISOString(),
      meta: {
        symbol: data.meta?.symbol || symbol,
        interval: data.meta?.interval || twelveDataInterval,
        exchange: data.meta?.exchange || 'Unknown'
      },
      info: null
    };
  
  // Cache the result
  setCachedData(symbol, interval, result);
  
  return result;
};

// Data processing functions
const calculateEMA = (data, period = 20) => {
  const multiplier = 2 / (period + 1);
  const emaData = [...data];
  
  // Start with first price as initial EMA
  emaData[0].ema20 = data[0].price;
  
  for (let i = 1; i < data.length; i++) {
    emaData[i].ema20 = (data[i].price * multiplier) + (emaData[i-1].ema20 * (1 - multiplier));
  }
  
  return emaData;
};

const calculateRSI = (data, period = 14) => {
  if (data.length < period + 1) return data.map(d => ({ ...d, rsi: 50 }));
  
  const rsiData = [...data];
  
  // Calculate price changes
  const changes = [];
  for (let i = 1; i < rsiData.length; i++) {
    changes.push(rsiData[i].price - rsiData[i-1].price);
  }
  
  // Calculate initial average gain and loss
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  // Calculate RSI for first period
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));
  rsiData[period].rsi = rsi;
  
  // Calculate RSI for remaining periods using smoothed averages
  for (let i = period + 1; i < rsiData.length; i++) {
    const change = changes[i-1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    // Smoothed averages
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
    rsiData[i].rsi = rsi;
  }
  
  // Fill initial periods with 50 (neutral RSI)
  for (let i = 0; i < period; i++) {
    rsiData[i].rsi = 50;
  }
  
  return rsiData;
};

// Divergence detection function
const detectDivergence = (data, lookback = 10) => {
  if (data.length < lookback + 5) return { type: 'none', strength: 0 };
  
  const recent = data.slice(-lookback);
  const prices = recent.map(d => d.price);
  const rsis = recent.map(d => d.rsi);
  
  // Find peaks and troughs
  const pricePeaks = [];
  const priceTroughs = [];
  const rsiPeaks = [];
  const rsiTroughs = [];
  
  for (let i = 2; i < recent.length - 2; i++) {
    // Price peaks
    if (prices[i] > prices[i-1] && prices[i] > prices[i+1] && 
        prices[i] > prices[i-2] && prices[i] > prices[i+2]) {
      pricePeaks.push({ index: i, value: prices[i] });
    }
    // Price troughs
    if (prices[i] < prices[i-1] && prices[i] < prices[i+1] && 
        prices[i] < prices[i-2] && prices[i] < prices[i+2]) {
      priceTroughs.push({ index: i, value: prices[i] });
    }
    // RSI peaks
    if (rsis[i] > rsis[i-1] && rsis[i] > rsis[i+1] && 
        rsis[i] > rsis[i-2] && rsis[i] > rsis[i+2]) {
      rsiPeaks.push({ index: i, value: rsis[i] });
    }
    // RSI troughs
    if (rsis[i] < rsis[i-1] && rsis[i] < rsis[i+1] && 
        rsis[i] < rsis[i-2] && rsis[i] < rsis[i+2]) {
      rsiTroughs.push({ index: i, value: rsis[i] });
    }
  }
  
  // Check for regular divergence (reversal signals)
  if (pricePeaks.length >= 2 && rsiPeaks.length >= 2) {
    const lastPricePeak = pricePeaks[pricePeaks.length - 1];
    const prevPricePeak = pricePeaks[pricePeaks.length - 2];
    const lastRSIPeak = rsiPeaks[rsiPeaks.length - 1];
    const prevRSIPeak = rsiPeaks[rsiPeaks.length - 2];
    
    // Bearish divergence: Price makes higher high, RSI makes lower high
    if (lastPricePeak.value > prevPricePeak.value && lastRSIPeak.value < prevRSIPeak.value) {
      const strength = Math.abs(lastPricePeak.value - prevPricePeak.value) / prevPricePeak.value;
      return { type: 'bearish_divergence', strength: Math.min(strength * 100, 100) };
    }
  }
  
  if (priceTroughs.length >= 2 && rsiTroughs.length >= 2) {
    const lastPriceTrough = priceTroughs[priceTroughs.length - 1];
    const prevPriceTrough = priceTroughs[priceTroughs.length - 2];
    const lastRSITrough = rsiTroughs[rsiTroughs.length - 1];
    const prevRSITrough = rsiTroughs[rsiTroughs.length - 2];
    
    // Bullish divergence: Price makes lower low, RSI makes higher low
    if (lastPriceTrough.value < prevPriceTrough.value && lastRSITrough.value > prevRSITrough.value) {
      const strength = Math.abs(lastPriceTrough.value - prevPriceTrough.value) / prevPriceTrough.value;
      return { type: 'bullish_divergence', strength: Math.min(strength * 100, 100) };
    }
  }
  
  // Check for hidden divergence (continuation signals)
  if (pricePeaks.length >= 2 && rsiPeaks.length >= 2) {
    const lastPricePeak = pricePeaks[pricePeaks.length - 1];
    const prevPricePeak = pricePeaks[pricePeaks.length - 2];
    const lastRSIPeak = rsiPeaks[rsiPeaks.length - 1];
    const prevRSIPeak = rsiPeaks[rsiPeaks.length - 2];
    
    // Hidden bearish divergence: Price makes lower high, RSI makes higher high
    if (lastPricePeak.value < prevPricePeak.value && lastRSIPeak.value > prevRSIPeak.value) {
      const strength = Math.abs(lastPricePeak.value - prevPricePeak.value) / prevPricePeak.value;
      return { type: 'hidden_bearish_divergence', strength: Math.min(strength * 100, 100) };
    }
  }
  
  if (priceTroughs.length >= 2 && rsiTroughs.length >= 2) {
    const lastPriceTrough = priceTroughs[priceTroughs.length - 1];
    const prevPriceTrough = priceTroughs[priceTroughs.length - 2];
    const lastRSITrough = rsiTroughs[rsiTroughs.length - 1];
    const prevRSITrough = rsiTroughs[rsiTroughs.length - 2];
    
    // Hidden bullish divergence: Price makes higher low, RSI makes lower low
    if (lastPriceTrough.value > prevPriceTrough.value && lastRSITrough.value < prevRSITrough.value) {
      const strength = Math.abs(lastPriceTrough.value - prevPriceTrough.value) / prevPriceTrough.value;
      return { type: 'hidden_bullish_divergence', strength: Math.min(strength * 100, 100) };
    }
  }
  
  return { type: 'none', strength: 0 };
};

const calculatePercentageChange = (data) => {
  if (data.length < 2) return { change: 0, fromHigh: false };
  
  const currentPrice = data[data.length - 1].price;
  const recentData = data.slice(-10); // Last 10 periods
  
  let extremePrice = recentData[0].price;
  let isFromHigh = false;
  
  // Find the most recent extreme (high or low)
  for (let i = 1; i < recentData.length; i++) {
    if (Math.abs(recentData[i].price - extremePrice) > Math.abs(currentPrice - extremePrice)) {
      extremePrice = recentData[i].price;
      isFromHigh = recentData[i].price > currentPrice;
    }
  }
  
  const change = ((currentPrice - extremePrice) / extremePrice) * 100;
  return { change, fromHigh: isFromHigh };
};

const getSignal = (price, ema, rsi, previousPrice, previousEMA, chartData) => {
  if (!price || !ema || !rsi || !previousPrice || !previousEMA) {
    if (price > ema) return { signal: 'BUY', color: '#10b981', icon: TrendingUp };
    return { signal: 'SELL', color: '#ef4444', icon: TrendingDown };
  }
  
  // Detect divergence
  const divergence = detectDivergence(chartData || []);
  
  // Conservative price analysis (more strict thresholds)
  const priceAboveEMA = price > ema;
  const priceRising = price > previousPrice && (price - previousPrice) > (price * 0.001); // At least 0.1% increase
  const priceFalling = price < previousPrice && (previousPrice - price) > (price * 0.001); // At least 0.1% decrease
  const priceApproachingEMA = Math.abs(price - ema) < Math.abs(previousPrice - previousEMA) && 
                              Math.abs(price - ema) < (price * 0.02); // Within 2% of EMA
  
  // Conservative EMA trend detection (more strict)
  const emaRising = ema > previousEMA && (ema - previousEMA) > (ema * 0.002); // At least 0.2% increase
  const emaFalling = ema < previousEMA && (previousEMA - ema) > (ema * 0.002); // At least 0.2% decrease
  const emaFlat = Math.abs(ema - previousEMA) < (ema * 0.001); // Less than 0.1% change
  
  // Conservative RSI thresholds
  const rsiOverbought = rsi > 75;  // Increased from 70 to 75
  const rsiOversold = rsi < 25;   // Decreased from 30 to 25
  const rsiNeutral = rsi >= 25 && rsi <= 75;
  
  // RSI + Price + EMA reversal logic with divergence
  if (rsiOverbought && priceFalling) {
    // RSI Overbought + Price falling = SELL signal
    // Check for bearish divergence for stronger signal (Conservative: higher threshold)
    if (divergence.type === 'bearish_divergence' && divergence.strength > 40) {
      return { 
        signal: 'STRONG SELL', 
        color: '#dc2626', 
        icon: TrendingDown,
        description: `RSI Overbought + Price falling + Bearish Divergence (${divergence.strength.toFixed(1)}%)` 
      };
    } else if (priceAboveEMA) {
      return { 
        signal: 'SELL', 
        color: '#ef4444', 
        icon: TrendingDown,
        description: 'RSI Overbought + Price falling + Above EMA (Strong SELL)' 
      };
    } else {
      return { 
        signal: 'WEAK SELL', 
        color: '#f97316', 
        icon: TrendingDown,
        description: 'RSI Overbought + Price falling + Below EMA (Weak SELL)' 
      };
    }
  } else if (rsiOversold && priceRising) {
    // RSI Oversold + Price rising = BUY signal
    // Check for bullish divergence for stronger signal (Conservative: higher threshold)
    if (divergence.type === 'bullish_divergence' && divergence.strength > 40) {
      return { 
        signal: 'STRONG BUY', 
        color: '#059669', 
        icon: TrendingUp,
        description: `RSI Oversold + Price rising + Bullish Divergence (${divergence.strength.toFixed(1)}%)` 
      };
    } else if (!priceAboveEMA) {
      return { 
        signal: 'BUY', 
        color: '#10b981', 
        icon: TrendingUp,
        description: 'RSI Oversold + Price rising + Below EMA (Strong BUY)' 
      };
    } else {
      return { 
        signal: 'WEAK BUY', 
        color: '#84cc16', 
        icon: TrendingUp,
        description: 'RSI Oversold + Price rising + Above EMA (Weak BUY)' 
      };
    }
  } else if (rsiNeutral) {
    // RSI Neutral zone - use EMA and price momentum with hidden divergence
    // Check for hidden divergence (continuation signals) - Conservative: higher threshold
    if (divergence.type === 'hidden_bullish_divergence' && divergence.strength > 35) {
      return { 
        signal: 'STRONG BUY', 
        color: '#059669', 
        icon: TrendingUp,
        description: `Hidden Bullish Divergence + Above EMA (${divergence.strength.toFixed(1)}%)` 
      };
    } else if (divergence.type === 'hidden_bearish_divergence' && divergence.strength > 35) {
      return { 
        signal: 'STRONG SELL', 
        color: '#dc2626', 
        icon: TrendingDown,
        description: `Hidden Bearish Divergence + Below EMA (${divergence.strength.toFixed(1)}%)` 
      };
    } else if (priceAboveEMA && priceRising && emaRising) {
      return { 
        signal: 'STRONG BUY', 
        color: '#10b981', 
        icon: TrendingUp,
        description: 'Price & EMA rising + Above EMA (Strong Trend)' 
      };
    } else if (!priceAboveEMA && priceFalling && emaFalling) {
      return { 
        signal: 'STRONG SELL', 
        color: '#ef4444', 
        icon: TrendingDown,
        description: 'Price & EMA falling + Below EMA (Strong Trend)' 
      };
    } else if (priceAboveEMA && priceRising && emaFlat) {
      return { 
        signal: 'BUY', 
        color: '#10b981', 
        icon: TrendingUp,
        description: 'Price rising + Above EMA + EMA flat' 
      };
    } else if (!priceAboveEMA && priceFalling && emaFlat) {
      return { 
        signal: 'SELL', 
        color: '#ef4444', 
        icon: TrendingDown,
        description: 'Price falling + Below EMA + EMA flat' 
      };
    } else if (priceAboveEMA && !priceRising && emaRising) {
      return { 
        signal: 'HOLD', 
        color: '#f59e0b', 
        icon: Minus,
        description: 'Price above EMA but falling + EMA rising' 
      };
    } else if (!priceAboveEMA && priceRising && emaFalling) {
      return { 
        signal: 'WEAK BUY', 
        color: '#84cc16', 
        icon: TrendingUp,
        description: 'Price rising + Below EMA + EMA falling' 
      };
    } else if (priceApproachingEMA && emaRising) {
      return { 
        signal: 'BUY', 
        color: '#10b981', 
        icon: TrendingUp,
        description: 'Price approaching EMA + EMA rising' 
      };
    } else if (priceApproachingEMA && emaFalling) {
      return { 
        signal: 'SELL', 
        color: '#ef4444', 
        icon: TrendingDown,
        description: 'Price approaching EMA + EMA falling' 
      };
    }
  } else {
    // Fallback to basic price vs EMA
    if (priceAboveEMA && priceRising) {
      return { 
        signal: 'STRONG BUY', 
        color: '#10b981', 
        icon: TrendingUp,
        description: 'Price above EMA and rising' 
      };
    } else if (!priceAboveEMA && priceFalling) {
      return { 
        signal: 'STRONG SELL', 
        color: '#ef4444', 
        icon: TrendingDown,
        description: 'Price below EMA and falling' 
      };
    } else if (priceAboveEMA && !priceRising) {
      return { 
        signal: 'HOLD', 
        color: '#f59e0b', 
        icon: Minus,
        description: 'Price above EMA but falling' 
      };
    } else if (!priceAboveEMA && priceRising) {
      return { 
        signal: 'WEAK BUY', 
        color: '#84cc16', 
        icon: TrendingUp,
        description: 'Price below EMA but rising' 
      };
    }
  }
  
  return { 
    signal: 'HOLD', 
    color: '#6b7280', 
    icon: Minus,
    description: 'Neutral signal' 
  };
};

// Optimized Twelve Data API function
const getTwelveDataData = async (symbol, interval = '1h') => {
  try {
    // Check cache first
    const cachedData = getCachedData(symbol, interval);
    if (cachedData) {
      console.log('Returning cached data for:', symbol, interval);
      return cachedData;
    }
    
    // Use deduplication to avoid duplicate requests
    console.log('Fetching fresh data for:', symbol, interval);
    return await deduplicateRequest(symbol, interval);
  } catch (error) {
    console.error('Twelve Data API Error:', error);
    throw error;
  }
};

const TwelveDataPage = ({ onBack }) => {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedInterval, setSelectedInterval] = useState('60min');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [apiCalls, setApiCalls] = useState(() => getApiCallsCount());
  const [hasData, setHasData] = useState(false);
  const [apiInfo, setApiInfo] = useState(null);
  const [cacheStatus, setCacheStatus] = useState('empty');
  const [lastCacheClear, setLastCacheClear] = useState(null);

  const symbols = [
    { value: 'AAPL', label: 'Apple (AAPL)', color: '#0071e3' },
    { value: 'GOOGL', label: 'Google (GOOGL)', color: '#4285f4' },
    { value: 'TSLA', label: 'Tesla (TSLA)', color: '#e31937' },
    { value: 'ASML', label: 'ASML (ASML)', color: '#00a4ef' },
    { value: 'PLTR', label: 'Palantir (PLTR)', color: '#ff6b35' },
    { value: 'NVDA', label: 'NVIDIA (NVDA)', color: '#76b900' },
    { value: 'AMD', label: 'AMD (AMD)', color: '#ed1c24' },
    { value: 'BTC/USD', label: 'Bitcoin (BTC)', color: '#f7931a' },
    { value: 'QQQ', label: 'NASDAQ 100 (QQQ)', color: '#8b5cf6' }
  ];

  const intervals = [
    { value: '1min', label: '1 Minute' },
    { value: '5min', label: '5 Minutes' },
    { value: '15min', label: '15 Minutes' },
    { value: '30min', label: '30 Minutes' },
    { value: '60min', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1day', label: '1 Day' },
    { value: '1week', label: '1 Week' },
    { value: '1month', label: '1 Month' }
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check online status
      setIsOnline(navigator.onLine);
      
      if (!navigator.onLine) {
        throw new Error('No internet connection');
      }
      
      // Check API calls limit (Twelve Data free tier: 800 calls/day)
      if (apiCalls >= 800) {
        throw new Error('Daily API limit reached (800 calls/day). Please try again tomorrow.');
      }
      
      // Test API key first
      console.log('Testing API key:', TWELVE_DATA_API_KEY);
      console.log('Selected symbol:', selectedSymbol);
      console.log('Selected interval:', selectedInterval);
      
      // Fetch data from Twelve Data
      const result = await getTwelveDataData(selectedSymbol, selectedInterval);
      
      // Set API info if available
      if (result.info) {
        setApiInfo(result.info);
      }
      
      // Check if we have valid data
      if (result.data && result.data.length > 0) {
        // Calculate EMA and RSI for the data
        const dataWithEMA = calculateEMA(result.data);
        const dataWithRSI = calculateRSI(dataWithEMA);
        setChartData(dataWithRSI);
        setLastUpdate(result.lastUpdated);
        const newCount = incrementApiCalls();
        setApiCalls(newCount);
        setHasData(true);
        setError(null);
        setCacheStatus('loaded');
      } else {
        // No data available
        setError('No data available for this symbol or interval. Please try a different symbol or interval.');
        setHasData(false);
      }
      
    } catch (err) {
      console.error('API Error:', err);
      
      // Provide more specific error messages
      let errorMessage = err.message;
      
      if (err.message.includes('API key')) {
        errorMessage = 'Invalid API key. Please check your Twelve Data API key.';
      } else if (err.message.includes('No data available')) {
        errorMessage = `Symbol "${selectedSymbol}" not found or not supported. Try a different symbol.`;
      } else if (err.message.includes('API limit')) {
        errorMessage = 'API limit reached. Please wait before trying again.';
      } else if (err.message.includes('HTTP error')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const currentData = chartData[chartData.length - 1];
  const signal = currentData && chartData.length >= 2 ? 
    getSignal(
      currentData.price, 
      currentData.ema20, 
      currentData.rsi,
      chartData[chartData.length - 2].price,
      chartData[chartData.length - 2].ema20,
      chartData
    ) : null;
  const percentageData = calculatePercentageChange(chartData);

  // Calculate better Y-axis domain for better comparison
  const calculateYAxisDomain = (data) => {
    if (!data || data.length === 0) return ['auto', 'auto'];
    
    const prices = data.map(d => d.price);
    const emas = data.map(d => d.ema20).filter(ema => ema !== null);
    const allValues = [...prices, ...emas];
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    const padding = range * 0.1; // 10% padding
    
    return [min - padding, max + padding];
  };

  const yAxisDomain = calculateYAxisDomain(chartData);

  const formatPrice = (price) => {
    return `$${price.toFixed(2)}`;
  };

  const formatTime = (timeString) => {
    const date = new Date(timeString);
    const interval = selectedInterval;
    
    if (interval === '1min' || interval === '5min') {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (interval === '15min' || interval === '30min') {
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (interval === '60min') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false 
      });
    } else if (interval === '4h') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        hour12: false 
      });
    } else if (interval === '1day') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      });
    } else if (interval === '1week') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      });
    } else if (interval === '1month') {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        year: '2-digit'
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading Alpha Vantage data...</p>
          <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '8px' }}>
            API Calls used: {apiCalls}/25
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button onClick={fetchData} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header glass-header">
        <div className="header-content">
            <div className="header-top">
            <h1 className="title">
                <BarChart3 className="title-icon" />
              ANALIKE
              </h1>
              <p className="subtitle">Analytical stock and BTC data with technical analysis</p>

            <div className="header-status-bar">
              <div className="twelve-data-status-item">
                <span className="status-dot online"></span>
                <span>API: {apiCalls}/800 calls</span>
              </div>
              <div className="twelve-data-status-item">
                <span className="status-dot" style={{ backgroundColor: hasData ? '#10b981' : '#6b7280' }}></span>
                <span>{hasData ? 'Data Ready' : 'No Data'}</span>
              </div>
              <div className="twelve-data-status-item">
                <span className="status-dot" style={{ backgroundColor: '#8b5cf6' }}></span>
                <span>Twelve Data API</span>
            </div>
              <button 
                onClick={() => {
                  const newCount = resetApiCalls();
                  setApiCalls(newCount);
                }}
                className="reset-api-button"
                title="Reset API calls for today"
              >
                Reset
              </button>
          </div>
          </div>
          <div className="conservative-mode-badge" style={{
            display: 'inline-block',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '4px 8px',
            fontSize: '0.7rem',
            fontWeight: '600',
            color: '#3b82f6',
            margin: '8px'
          }}>
            🛡️ Conservative Mode: RSI 25/75, Divergence 40%, Strict EMA
          </div>
          
          {/* <div className="controls glass-controls"> */}
            <div className="control-group">
              <select 
                value={selectedSymbol} 
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="control-select"
                disabled={loading}
              >
                {symbols.map(symbol => (
                  <option key={symbol.value} value={symbol.value}>
                    {symbol.label}
                  </option>
                ))}
              </select>
              <select 
                value={selectedInterval} 
                onChange={(e) => setSelectedInterval(e.target.value)}
                className="control-select"
                disabled={loading}
              >
                {intervals.map(interval => (
                  <option key={interval.value} value={interval.value}>
                    {interval.label}
                  </option>
                ))}
              </select>
              <button 
                onClick={fetchData}
                disabled={loading || apiCalls >= 800}
                className="search-button"
              >
                {loading ? 'Loading...' : apiCalls >= 800 ? 'Limit Reached' : 'Get Data'}
              </button>
            </div>
           
          {/* </div> */}
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-banner glass-card">
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <span className="error-message">{error}</span>
            </div>
          </div>
        )}

        {apiInfo && !error && (
          <div className="info-banner glass-card">
            <div className="info-content">
              <span className="info-icon">ℹ️</span>
              <span className="info-message">{apiInfo}</span>
            </div>
          </div>
        )}

        {!hasData && (
          <div className="no-data-simple glass-card">
            <div className="no-data-content">
              <BarChart3 className="no-data-icon" />
              <h2>Ready to Analyze</h2>
              <p>Choose a stock and click "Get Data" to start analysis</p>
              {error && apiInfo && (
                <div className="free-tier-notice">
                  <p>✅ API Key working (Free Tier)</p>
                  <button 
                    onClick={() => {
                      setError(null);
                      setApiInfo(null);
                    }}
                    className="try-again-button"
                  >
                    Try Again
                  </button>
                </div>
              )}
              <div className="debug-info">
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px' }}>
                  Twelve Data API - Check console for response details
                </p>
              </div>
            </div>
          </div>
        )}

        {hasData && (
          <div className="stats-grid glass-stats">
            <div className="stat-card glass-card">
              <div className="stat-header">
                <DollarSign className="stat-icon" />
                <span className="stat-title">Current Price</span>
              </div>
              <div className="stat-value">
                {currentData ? formatPrice(currentData.price) : 'N/A'}
              </div>
              {currentData && currentData.ema20 && (
                <div className="stat-detail" style={{ 
                  color: currentData.price > currentData.ema20 ? '#10b981' : '#ef4444',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  marginTop: '0.25rem',
                  opacity: 0.9
                }}>
                  {currentData.price > currentData.ema20 ? '🟢 Above EMA20' : '🔴 Below EMA20'}
                </div>
              )}
            </div>

            <div className="stat-card glass-card">
              <div className="stat-header">
                <Target className="stat-icon" />
                <span className="stat-title">EMA 20</span>
              </div>
              <div className="stat-value">
                {currentData ? formatPrice(currentData.ema20) : 'N/A'}
              </div>
            </div>
            <div className="stat-card glass-card">
              <div className="stat-header">
                <TrendingUp className="stat-icon" />
                <span className="stat-title">Change from {percentageData.fromHigh ? 'High' : 'Low'}</span>
              </div>
              <div 
                className={`stat-value ${percentageData.change >= 0 ? 'positive' : 'negative'}`}
              >
                {percentageData.change >= 0 ? '+' : ''}{percentageData.change.toFixed(2)}%
              </div>
            </div>

            <div className="stat-card glass-card">
              <div className="stat-header">
                <BarChart3 className="stat-icon" />
                <span className="stat-title">RSI</span>
              </div>
              <div 
                className="stat-value"
                style={{ 
                  color: currentData?.rsi > 70 ? '#ef4444' : currentData?.rsi < 30 ? '#10b981' : '#8b5cf6'
                }}
              >
                {currentData?.rsi?.toFixed(1) || 'N/A'}
              </div>
              <div className="stat-detail" style={{ 
                color: currentData?.rsi > 75 ? '#ef4444' : currentData?.rsi < 25 ? '#10b981' : '#8b5cf6',
                fontSize: '0.75rem',
                fontWeight: '600',
                marginTop: '0.25rem'
              }}>
                {currentData?.rsi > 75 ? 'Overbought (Conservative: >75)' : 
                 currentData?.rsi < 25 ? 'Oversold (Conservative: <25)' : 'Neutral (25-75)'}
              </div>
              {signal && (signal.description.includes('Divergence') || signal.description.includes('divergence')) && (
                <div className="stat-detail" style={{ 
                  color: signal.color,
                  fontSize: '0.65rem',
                  fontWeight: '500',
                  marginTop: '0.125rem',
                  opacity: 0.8
                }}>
                  {signal.description.includes('Bearish') ? '🔴 Bearish Divergence' : 
                   signal.description.includes('Bullish') ? '🟢 Bullish Divergence' : 
                   signal.description.includes('Hidden') ? '🔍 Hidden Divergence' : ''}
                </div>
              )}
            </div>

            
            <div className="stat-card glass-card">
              <div className="stat-header">
                <BarChart3 className="stat-icon" />
                <span className="stat-title">Signal</span>
              </div>
              <div className="stat-value" style={{ color: signal?.color }}>
                {signal ? signal.signal : 'N/A'}
              </div>
              {signal && (
                <div className="stat-detail" style={{ 
                  color: signal.color,
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  marginTop: '0.25rem',
                  opacity: 0.9
                }}>
                  {signal.signal === 'STRONG BUY' ? 
                    (signal.description.includes('Divergence') ? '🟢 Strong Buy - RSI <25 + Price Up + Divergence' : '🟢 Strong Buy - Price+EMA Up + Above EMA') :
                   signal.signal === 'BUY' ? '🟢 Buy - RSI <25 + Price Up + Below EMA' :
                   signal.signal === 'WEAK BUY' ? '🟡 Weak Buy - RSI <25 + Price Up + Above EMA' :
                   signal.signal === 'STRONG SELL' ? 
                    (signal.description.includes('Divergence') ? '🔴 Strong Sell - RSI >75 + Price Down + Divergence' : '🔴 Strong Sell - Price+EMA Down + Below EMA') :
                   signal.signal === 'SELL' ? '🔴 Sell - RSI >75 + Price Down + Above EMA' :
                   signal.signal === 'WEAK SELL' ? '🟠 Weak Sell - RSI >75 + Price Down + Below EMA' :
                   signal.signal === 'HOLD' ? '⚪ Hold - Not Clear' : '⚪ No Data'}
                </div>
              )}
            </div>
          </div>
        )}

        {hasData && (
          <div className="chart-container glass-chart">
            <div className="chart-header">
              <h3 className="chart-title">{selectedSymbol} Analysis</h3>
              <div className="chart-legend">
                <div className="legend-item">
                  <div className="legend-color price"></div>
                  <span>Stock Price</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color ema"></div>
                  <span>EMA 20</span>
                </div>
              </div>
            </div>
          
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatTime}
                stroke="#9ca3af"
                fontSize={12}
                tick={{ fill: '#9ca3af' }}
                axisLine={{ stroke: '#4b5563' }}
                interval="preserveStartEnd"
                tickCount={8}
              />
              <YAxis 
                tickFormatter={(value) => `$${value.toFixed(2)}`}
                stroke="#9ca3af"
                fontSize={12}
                tick={{ fill: '#9ca3af' }}
                axisLine={{ stroke: '#4b5563' }}
                domain={yAxisDomain}
                tickCount={12}
                allowDecimals={true}
              />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'price' ? formatPrice(value) : formatPrice(value),
                  name === 'price' ? 'Stock Price' : 'EMA 20'
                ]}
                labelFormatter={(time) => new Date(time).toLocaleString()}
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f9fafb',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#10b981" 
                strokeWidth={1}
                dot={false}
                name="price"
                activeDot={{ r: 4, stroke: '#10b981', strokeWidth: 1, fill: '#1f2937' }}
                connectNulls={false}
              />
              <Line 
                type="monotone" 
                dataKey="ema20" 
                stroke="#ef4444" 
                strokeWidth={1}
                dot={false}
                name="ema20"
                activeDot={{ r: 4, stroke: '#ef4444', strokeWidth: 1, fill: '#1f2937' }}
                connectNulls={false}
              />
              <ReferenceLine 
                y={currentData?.price} 
                stroke="#f59e0b" 
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ 
                  value: `Current: $${currentData?.price?.toFixed(2)}`, 
                  position: "topRight",
                  style: { fill: '#f59e0b', fontSize: '12px', fontWeight: 'bold' }
                }}
              />
              <ReferenceLine 
                y={currentData?.ema20} 
                stroke="#f59e0b" 
                strokeWidth={1}
                strokeDasharray="4 4"
                label={{ 
                  value: `EMA20: $${currentData?.ema20?.toFixed(2)}`, 
                  position: "bottomRight",
                  style: { fill: '#f59e0b', fontSize: '12px', fontWeight: 'bold' }
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          
          <div className="chart-analysis">
            <div className="analysis-item">
              <span className="analysis-label">Current Price:</span>
              <span className="analysis-value" style={{ color: '#10b981', fontWeight: 'bold' }}>
                ${currentData?.price?.toFixed(2) || 'N/A'}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">EMA 20:</span>
              <span className="analysis-value" style={{ color: '#ef4444', fontWeight: 'bold' }}>
                ${currentData?.ema20?.toFixed(2) || 'N/A'}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Price vs EMA:</span>
              <span className="analysis-value" style={{ 
                color: currentData?.price > currentData?.ema20 ? '#10b981' : '#ef4444',
                fontWeight: 'bold'
              }}>
                {currentData ? 
                  `${((currentData.price - currentData.ema20) / currentData.ema20 * 100).toFixed(2)}%` 
                  : 'N/A'
                }
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Price Range ({selectedInterval}):</span>
              <span className="analysis-value">
                ${Math.min(...chartData.map(d => d.price)).toFixed(2)} - ${Math.max(...chartData.map(d => d.price)).toFixed(2)}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">EMA Range ({selectedInterval}):</span>
              <span className="analysis-value">
                ${Math.min(...chartData.map(d => d.ema20)).toFixed(2)} - ${Math.max(...chartData.map(d => d.ema20)).toFixed(2)}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Data Source:</span>
              <span className="analysis-value" style={{ color: '#10b981', fontWeight: 'bold' }}>
                Twelve Data (Real-time Data)
              </span>
            </div>
          </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default TwelveDataPage;
