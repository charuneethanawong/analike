import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, Target, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { getMarketData, getPriceHistoryStats, clearPriceHistory } from './services/api';
import './App.css';

// Data processing functions

// Calculate EMA 20
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

// Calculate percentage change from recent high/low
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

// Get signal based on price vs EMA
const getSignal = (price, ema) => {
  if (price > ema) return { signal: 'BUY', color: '#10b981', icon: TrendingUp };
  return { signal: 'SELL', color: '#ef4444', icon: TrendingDown };
};

function FinnhubPage({ onBack }) {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [cacheStatus, setCacheStatus] = useState('loading');
  const [priceHistoryStats, setPriceHistoryStats] = useState({});

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

  const timeframes = [
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' }
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check online status
        setIsOnline(navigator.onLine);
        
        if (!navigator.onLine) {
          throw new Error('No internet connection');
        }
        
        // Fetch real-time data
        const marketData = await getMarketData(selectedSymbol, selectedTimeframe);
        
        // Calculate EMA for the historical data
        const dataWithEMA = calculateEMA(marketData.history);
        setChartData(dataWithEMA);
        setLastUpdate(marketData.lastUpdated);
        
        // Reset consecutive failures on success
        setConsecutiveFailures(0);
        setError(null);
        setCacheStatus('success');
        
        console.log('Data fetched successfully:', marketData);
        
        // Update price history stats
        setPriceHistoryStats(getPriceHistoryStats());
        
      } catch (err) {
        console.error('API Error:', err);
        
        // Track consecutive failures
        setConsecutiveFailures(prev => prev + 1);
        setCacheStatus('error');
        
        // Create user-friendly error message
        let errorMessage = 'Unable to fetch real-time data';
        
        // Handle different error types
        if (err && err.message) {
          if (err.message.includes('401')) {
            errorMessage = 'API key invalid or expired. Please check your API key.';
          } else if (err.message.includes('rate limit') || err.message.includes('429')) {
            errorMessage = 'API rate limit exceeded. Please wait before trying again.';
          } else if (err.message.includes('Network connection failed') || err.message.includes('ERR_NETWORK')) {
            errorMessage = 'Network connection failed. Please check your internet connection.';
          } else if (err.message.includes('No internet')) {
            errorMessage = 'No internet connection. Please check your internet connection.';
          } else if (err.message.includes('Too Many Requests')) {
            errorMessage = 'API rate limit exceeded. Please wait before trying again.';
          } else if (err.message.includes('CORS')) {
            errorMessage = 'CORS error. Please try again or check your network settings.';
          } else if (err.message.includes('API limit reached')) {
            errorMessage = 'API limit reached. Please wait before trying again.';
          } else if (err.message.includes('Invalid symbol')) {
            errorMessage = 'Invalid symbol or no data available. Please try a different symbol.';
          } else if (err.message.includes('403') || err.message.includes('forbidden')) {
            errorMessage = 'API access forbidden. Please check your API key or upgrade your plan.';
          } else if (err.message.includes("You don't have access to this resource")) {
            errorMessage = 'API access denied. Please check your API key or upgrade your plan.';
          } else {
            errorMessage = err.message;
          }
        } else if (err && err.error) {
          errorMessage = `API Error: ${err.error}`;
        } else {
          errorMessage = 'Unknown error occurred. Please try again.';
        }
        
        setError(errorMessage);
        setCacheStatus('error');
        
        // Don't show any data when API fails
        setChartData([]);
        setLastUpdate(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Set up auto-refresh (default 30 seconds with Finnhub)
    const refreshInterval = parseInt(import.meta.env.VITE_REFRESH_INTERVAL) || 120000; // 2 minutes for better rate limiting
    const interval = setInterval(fetchData, refreshInterval);
    
    return () => clearInterval(interval);
  }, [selectedSymbol, selectedTimeframe]);

  const currentData = chartData[chartData.length - 1];
  const signal = currentData ? getSignal(currentData.price, currentData.ema20) : null;
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
    return selectedTimeframe === '1h' 
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-top">
            <h1 className="title">
              <BarChart3 className="title-icon" />
              Finnhub Analysis
            </h1>
            <div className="header-spacer"></div>
            <div className="header-status-bar">
              <div className="status-item">
                {isOnline ? (
                  <Wifi className="status-icon online" />
                ) : (
                  <WifiOff className="status-icon offline" />
                )}
                <span className="status-text">
                  {isOnline ? 'Real-time Data' : 'Offline Mode'}
                </span>
              </div>
              {lastUpdate && (
                <div className="status-item">
                  <Clock className="status-icon" />
                  <span className="status-text">
                    Last update: {new Date(lastUpdate).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {error && error.includes('API key') && (
                <div className="status-item">
                  <Target className="status-icon" />
                  <span className="status-text">
                    <a 
                      href="https://finnhub.io/register" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="api-link"
                    >
                      Get Free API Key
                    </a>
                  </span>
                </div>
              )}
              {error && (error.includes('rate limit') || error.includes('429')) && (
                <div className="status-item">
                  <Clock className="status-icon" />
                  <span className="status-text">
                    Rate limit exceeded - please wait
                  </span>
                </div>
              )}
              {consecutiveFailures > 0 && (
                <div className="status-item">
                  <WifiOff className="status-icon offline" />
                  <span className="status-text">
                    API failures: {consecutiveFailures}/3
                  </span>
                </div>
              )}
              {cacheStatus === 'success' && (
                <div className="status-item">
                  <Target className="status-icon online" />
                  <span className="status-text">
                    Data cached (30s)
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onBack}
              className="back-button"
            >
              <ExternalLink size={18} />
              Back to Main
            </button>
          </div>
          <p className="subtitle">EMA 20 Analysis with Buy/Sell Signals</p>
        </div>
      </header>

      <main className="main">
        <div className="controls">
          <div className="control-group">
            <label className="control-label">Symbol:</label>
            <select 
              value={selectedSymbol} 
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="control-select"
            >
              {symbols.map(symbol => (
                <option key={symbol.value} value={symbol.value}>
                  {symbol.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">Timeframe:</label>
            <select 
              value={selectedTimeframe} 
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="control-select"
            >
              {timeframes.map(tf => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <WifiOff className="error-icon" />
            <div className="error-content">
              <strong>Data Source:</strong> {error}
              <br />
              <small>
                {error.includes('API key') 
                  ? 'Get a free API key from Finnhub to enable real-time data'
                  : error.includes('rate limit') || error.includes('API limit')
                  ? 'Finnhub free tier: 1,000 calls/day, 30 calls/second. Consider upgrading for higher limits.'
                  : error.includes('Invalid symbol')
                  ? 'Please try a different symbol (AAPL, TSLA, MSFT, GOOGL)'
                  : 'Real-time data will resume when connection is restored'
                }
              </small>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>
              {cacheStatus === 'success' ? 'Loading cached data...' : 'Loading real-time data...'}
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="no-data">
            <WifiOff className="no-data-icon" />
            <h3>No Data Available</h3>
            <p>Unable to fetch real-time data. Please check your internet connection and API settings.</p>
            <div className="no-data-actions">
              <button 
                onClick={() => window.location.reload()} 
                className="retry-button"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <DollarSign className="stat-icon" />
                  <span className="stat-title">Current Price</span>
                </div>
                <div className="stat-value">
                  {currentData ? formatPrice(currentData.price) : 'N/A'}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <Target className="stat-icon" />
                  <span className="stat-title">EMA 20</span>
                </div>
                <div className="stat-value">
                  {currentData ? formatPrice(currentData.ema20) : 'N/A'}
                </div>
              </div>

              <div className="stat-card signal-card">
                <div className="stat-header">
                  <signal.icon className="stat-icon" style={{ color: signal.color }} />
                  <span className="stat-title">Signal</span>
                </div>
                <div 
                  className="stat-value signal-value"
                  style={{ color: signal.color }}
                >
                  {signal.signal}
                </div>
              </div>

              <div className="stat-card">
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
            </div>

            <div className="chart-container">
              <div className="chart-header">
                <h3 className="chart-title">
                  {symbols.find(s => s.value === selectedSymbol)?.label} - {selectedTimeframe} Chart
                </h3>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
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
                    stroke="#3b82f6" 
                    strokeWidth={1}
                    dot={false}
                    name="price"
                    activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2, fill: '#1f2937' }}
                    connectNulls={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ema20" 
                    stroke="#f59e0b" 
                    strokeWidth={1}
                    strokeDasharray="12 6"
                    dot={false}
                    name="ema20"
                    activeDot={{ r: 5, stroke: '#f59e0b', strokeWidth: 2, fill: '#1f2937' }}
                    connectNulls={false}
                  />
                  <ReferenceLine 
                    y={currentData?.price} 
                    stroke={signal.color} 
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    label={{ 
                      value: `Current: $${currentData?.price?.toFixed(2)}`, 
                      position: "topRight",
                      style: { fill: signal.color, fontSize: '12px', fontWeight: 'bold' }
                    }}
                  />
                  <ReferenceLine 
                    y={currentData?.ema20} 
                    stroke="#f59e0b" 
                    strokeWidth={1}
                    strokeDasharray="8 4"
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
                  <span className="analysis-value" style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                    ${currentData?.price?.toFixed(2) || 'N/A'}
                  </span>
                </div>
                <div className="analysis-item">
                  <span className="analysis-label">EMA 20:</span>
                  <span className="analysis-value" style={{ color: '#f59e0b', fontWeight: 'bold' }}>
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
                  <span className="analysis-label">Price Range (2M):</span>
                  <span className="analysis-value">
                    ${Math.min(...chartData.map(d => d.price)).toFixed(2)} - ${Math.max(...chartData.map(d => d.price)).toFixed(2)}
                  </span>
                </div>
                <div className="analysis-item">
                  <span className="analysis-label">EMA Range (2M):</span>
                  <span className="analysis-value">
                    ${Math.min(...chartData.map(d => d.ema20)).toFixed(2)} - ${Math.max(...chartData.map(d => d.ema20)).toFixed(2)}
                  </span>
                </div>
                <div className="analysis-item">
                  <span className="analysis-label">Current Spread:</span>
                  <span className="analysis-value" style={{ fontWeight: 'bold' }}>
                    ${Math.abs(currentData?.price - currentData?.ema20 || 0).toFixed(2)}
                  </span>
                </div>
                <div className="analysis-item">
                  <span className="analysis-label">Stored Data:</span>
                  <span className="analysis-value" style={{ color: '#10b981', fontWeight: 'bold' }}>
                    {priceHistoryStats[selectedSymbol]?.days || 0} days
                  </span>
                </div>
                <div className="analysis-item">
                  <span className="analysis-label">Data Range:</span>
                  <span className="analysis-value">
                    {priceHistoryStats[selectedSymbol]?.firstDate ? 
                      `${priceHistoryStats[selectedSymbol].firstDate} to ${priceHistoryStats[selectedSymbol].lastDate}` : 
                      'No stored data'
                    }
                  </span>
                </div>
              </div>
            </div>

            <div className="analysis-section">
              <h3 className="section-title">Analysis Summary</h3>
              <div className="analysis-content">
                <div className="analysis-item">
                  <button 
                    onClick={() => {
                      clearPriceHistory(selectedSymbol);
                      setPriceHistoryStats(getPriceHistoryStats());
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    Clear Stored Data
                  </button>
                </div>
                <div className="analysis-item">
                  <Clock className="analysis-icon" />
                  <div>
                    <strong>Timeframe:</strong> {selectedTimeframe}
                  </div>
                </div>
                <div className="analysis-item">
                  <signal.icon className="analysis-icon" style={{ color: signal.color }} />
                  <div>
                    <strong>Current Signal:</strong> 
                    <span style={{ color: signal.color, marginLeft: '8px' }}>
                      {signal.signal}
                    </span>
                  </div>
                </div>
                <div className="analysis-item">
                  <TrendingUp className="analysis-icon" />
                  <div>
                    <strong>Price vs EMA 20:</strong> 
                    <span className={currentData?.price > currentData?.ema20 ? 'positive' : 'negative'}>
                      {currentData?.price > currentData?.ema20 ? 'Above' : 'Below'}
                    </span>
                  </div>
                </div>
                <div className="analysis-item">
                  <BarChart3 className="analysis-icon" />
                  <div>
                    <strong>Change from Recent {percentageData.fromHigh ? 'High' : 'Low'}:</strong>
                    <span className={percentageData.change >= 0 ? 'positive' : 'negative'}>
                      {percentageData.change >= 0 ? '+' : ''}{percentageData.change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default FinnhubPage;
