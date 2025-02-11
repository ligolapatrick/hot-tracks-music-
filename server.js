const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Sequelize, DataTypes } = require('sequelize');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite'
});

// User model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  registrationId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

// Music model
const Music = sequelize.define('Music', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  artist: {
    type: DataTypes.STRING,
    allowNull: false
  },
  genre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  releaseDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  uploadDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.NOW
  },
  downloads: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
});

sequelize.sync();

app.use(express.static('./public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: '4123',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // 10 MB limit
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
}).single('musicFile');

function checkFileType(file, cb) {
  console.log('File MIME type:', file.mimetype);
  console.log('File extension:', path.extname(file.originalname).toLowerCase());

  const filetypes = /mp3|wav/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav';

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    console.error('File validation error: Not a valid music file');
    cb('Error: Music files only!');
  }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/upload.html', (req, res) => {
  if (req.session.userId) {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
  } else {
    res.redirect('/login.html');
  }
});
app.get('/songs-of-the-week.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'songs-of-the-week.html')));
app.get('/most-downloaded-songs.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'most-downloaded-songs.html')));
app.get('/artist-of-the-week.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'artist-of-the-week.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/top-charts.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'top-charts.html')));
app.get('/featured-artists.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'featured-artists.html')));
app.get('/music-genres.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'music-genres.html')));
app.get('/new-releases.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'new-releases.html')));
app.get('/admin-control.html', (req, res) => {
  if (req.session.isAdmin) {
    res.sendFile(path.join(__dirname, 'public', 'admin-control.html'));
  } else {
    res.redirect('/login.html');
  }
});


app.post('/register', async (req, res) => {
  const { username, password, registrationId } = req.body;
  if (registrationId !== '4123trecks') {
    return res.status(400).send('Invalid registration ID.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await User.create({ username, password: hashedPassword, registrationId, isAdmin: true });
    res.redirect('/login.html');
  } catch (error) {
    console.error('Error registering user:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).send('Username or registration ID already exists.');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).send('Invalid username or password.');
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.isAdmin;
    res.redirect('/');
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/upload', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).send('Only admin can upload music.');
  }

  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload Error:', err);
      res.send(err);
    } else {
      if (req.file == undefined) {
        console.error('No File Selected');
        res.send('Error: No File Selected!');
      } else {
        const { title, artist, genre, releaseDate } = req.body;

        try {
          await Music.create({
            title,
            artist,
            genre,
            releaseDate,
            filename: req.file.filename,
            uploadDate: new Date()
          });
          console.log('File uploaded successfully');
          res.redirect('/upload.html');
        } catch (error) {
          console.error('Error uploading music:', error);
          res.status(500).send('Internal Server Error');
        }
      }
    }
  });
});

app.get('/uploads', async (req, res) => {
  try {
    const music = await Music.findAll();
    res.json(music);
  } catch (error) {
    console.error('Error fetching uploads:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/download/:filename', async (req, res) => {
  try {
    const music = await Music.findOne({ where: { filename: req.params.filename } });
    if (!music) {
      return res.status(404).send('Music not found');
    }

    const filePath = path.join(__dirname, 'public', 'uploads', req.params.filename);
    res.download(filePath, `${music.artist} - ${music.title} - ${music.genre}.mp3`, async (err) => {
      if (!err) {
        music.downloads += 1;
        await music.save();
      } else {
        console.error('Download Error:', err);
      }
    });
  } catch (error) {
    console.error('Error downloading music:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/delete-music/:id', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).send('Only admin can delete music.');
  }

  try {
    const music = await Music.findByPk(req.params.id);
    if (music) {
      await music.destroy();
      console.log('Music deleted successfully');
      res.redirect('/admin-control.html');
    } else {
      res.status(404).send('Music not found');
    }
  } catch (error) {
    console.error('Error deleting music:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
