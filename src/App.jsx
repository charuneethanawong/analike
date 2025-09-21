import React, { useState } from 'react';
import TwelveDataPage from './TwelveDataPage';
import FinnhubPage from './FinnhubPage';
import './App.css';


function App() {
  const [currentPage, setCurrentPage] = useState('twelve-data'); // 'twelve-data' or 'finnhub'

  // Render the appropriate page based on currentPage state
  if (currentPage === 'twelve-data') {
    return <TwelveDataPage onBack={() => setCurrentPage('finnhub')} />;
  }
  
  if (currentPage === 'finnhub') {
    return <FinnhubPage onBack={() => setCurrentPage('twelve-data')} />;
  }

  return null; // This should never be reached
}

export default App;
