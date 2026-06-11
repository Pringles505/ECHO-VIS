import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyColorTheme } from './colorThemes';
import App from './App';
import './styles/index.css';

applyColorTheme();

createRoot(document.getElementById('root')).render(<App />);
