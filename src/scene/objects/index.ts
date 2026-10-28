// Every stationery object on the desk, in figure order. Each module says where its own frame sits on the desk (PLACE).
import type { ObjectFactory, Placement } from '../types';
import * as pencil from './01-mechanical-pencil.js';
import * as clickPen from './02-click-pen.js';
import * as fountainPen from './03-fountain-pen.js';
import * as tape from './04-correction-tape.js';
import * as sharpener from './05-crank-sharpener.js';
import * as eraser from './06-eraser.js';
import * as ruler from './07-steel-ruler.js';
import * as compass from './08-compass.js';
import * as stapler from './09-stapler.js';
import * as calculator from './10-calculator.js';
import * as pencilCase from './11-pencil-case.js';
import * as sticky from './12-sticky-notes.js';
import * as washi from './13-washi-tape.js';
import * as clips from './14-clips.js';
import * as deskCalendar from './15-desk-calendar.js';
import * as alarmClock from './16-alarm-clock.js';
import * as fishTank from './17-fish-tank.js';
import * as pottedPlant from './18-potted-plant.js';
import * as thermos from './19-thermos.js';
import * as mp3Player from './20-mp3-player.js';

export interface ObjectEntry { n: string; id: string; create: ObjectFactory; place: Placement }

export const OBJECTS: ObjectEntry[] = [
  { n: '01', id: 'pencil', create: pencil.create, place: pencil.PLACE },
  { n: '02', id: 'click-pen', create: clickPen.create, place: clickPen.PLACE },
  { n: '03', id: 'fountain-pen', create: fountainPen.create, place: fountainPen.PLACE },
  { n: '04', id: 'correction-tape', create: tape.create, place: tape.PLACE },
  { n: '05', id: 'sharpener', create: sharpener.create, place: sharpener.PLACE },
  { n: '06', id: 'eraser', create: eraser.create, place: eraser.PLACE },
  { n: '07', id: 'ruler', create: ruler.create, place: ruler.PLACE },
  { n: '08', id: 'compass', create: compass.create, place: compass.PLACE },
  { n: '09', id: 'stapler', create: stapler.create, place: stapler.PLACE },
  { n: '10', id: 'calculator', create: calculator.create, place: calculator.PLACE },
  { n: '11', id: 'pencil-case', create: pencilCase.create, place: pencilCase.PLACE },
  { n: '12', id: 'sticky-notes', create: sticky.create, place: sticky.PLACE },
  { n: '13', id: 'washi-tape', create: washi.create, place: washi.PLACE },
  { n: '14', id: 'clips', create: clips.create, place: clips.PLACE },
  { n: '15', id: 'desk-calendar', create: deskCalendar.create, place: deskCalendar.PLACE },
  { n: '16', id: 'alarm-clock', create: alarmClock.create, place: alarmClock.PLACE },
  { n: '17', id: 'fish-tank', create: fishTank.create, place: fishTank.PLACE },
  { n: '18', id: 'potted-plant', create: pottedPlant.create, place: pottedPlant.PLACE },
  { n: '19', id: 'thermos', create: thermos.create, place: thermos.PLACE },
  { n: '20', id: 'mp3-player', create: mp3Player.create, place: mp3Player.PLACE },
];
