// Development-only integration harness; excluded from the Vite production entry.
import {createRoot} from 'react-dom/client';
import LocalRecognition from '../src/LocalRecognition';
import './legacy-local.css';
createRoot(document.getElementById('root')!).render(<LocalRecognition/>);