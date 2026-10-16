import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/ui-kit.css';
import './styles/app.css';
import { App } from './App';
import { applySettings, loadSettings } from './settings';

applySettings(loadSettings());

createRoot(document.getElementById('root')!).render(<App />);
