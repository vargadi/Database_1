import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { connectDB } from './db.js';
import { User } from './models/User.js';
import { Task } from './models/Task.js';
import { UserTask } from './models/UserTask.js';
import { checkEmptyTable as checkEmptyUsersTable } from './z_dummy_data/users_dummy.js';
import { checkEmptyTable as checkEmptyTasksTable } from './z_dummy_data/tasks_dummy.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Egyszerű memóriabeli tároló az aktív bejelentkezési tokenekhez
const activeTokens = new Map();

// Minimalista kérésnaplózó (logger) middleware státuszkóddal
app.use((req, res, next) => {
  res.on('finish', () => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

// Statikus fájlok kiszolgálása a public mappából
app.use(express.static('public'));

// JSON kérések törzsének feldolgozása
app.use(express.json());

// Favicon kiszolgálása
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.resolve('public/favicon.svg'));
});

// Alapértelmezett teszt útvonal
app.get('/', (req, res) => {
  res.json({ message: 'Express szerver sikeresen fut!' });
});

// Bejelentkezés végpont: email és jelszó ellenőrzése, egyszerű token visszaadása
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Kérlek add meg az email címet és a jelszót!' });
    }

    const user = await User.findOne({ where: { email, password } });
    if (!user) {
      return res.status(401).json({ error: 'Hibás email cím vagy jelszó!' });
    }

    // Egyszerű token generálása és tárolása a memóriában
    const token = crypto.randomUUID();
    activeTokens.set(token, {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
    });

    res.json({
      message: 'Sikeres bejelentkezés!',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Hiba történt a bejelentkezés során.' });
  }
});

// Autentikációs middleware a védett útvonalakhoz
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Elfogad "Bearer <token>" formátumot, sima tokent a headerben, vagy query paramétert (?token=...)
  const token = (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Hozzáférés megtagadva! Hiányzó token.' });
  }

  if (!activeTokens.has(token)) {
    return res.status(403).json({ error: 'Hozzáférés megtagadva! Érvénytelen vagy lejárt token.' });
  }

  req.user = activeTokens.get(token);
  next();
};

// Felhasználók lekérdezése
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Nem sikerült lekérni a felhasználókat.' });
  }
});

// Feladatok lekérdezése
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.findAll();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Nem sikerült lekérni a feladatokat.' });
  }
});

// Kapcsolótábla lekérdezése (VÉDETT VÉGPONT): Csak érvényes tokennel kérhető le!
app.get('/api/taskusers', authenticateToken, async (req, res) => {
  try {
    const tasksWithUsers = await Task.findAll({
      attributes: ['id', 'title'],
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName'],
          through: {
            attributes: [], // Ne tartalmazza a UserTasks kapcsolótábla mezőit
          },
        },
      ],
    });
    res.json(tasksWithUsers);
  } catch (error) {
    res.status(500).json({ error: 'Nem sikerült lekérni a feladatokhoz rendelt felhasználókat.' });
  }
});

app.listen(PORT, async () => {
  await connectDB();
  await checkEmptyUsersTable();
  await checkEmptyTasksTable();
  console.log(`Szerver elindult a http://localhost:${PORT} címen`);
});

