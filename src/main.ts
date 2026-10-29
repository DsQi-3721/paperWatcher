import './styles/fonts';
import './styles/base.css';
import './styles/ui.css';
import './styles/notes.css';
import './styles/scene.css';
import './styles/backdrops.css';
import './styles/reading.css';
import './styles/books.css';
import './styles/library.css';
import './styles/english.css';
import { App } from './app';

const app = new App(document.getElementById('app')!);
(window as any).pw = app;
